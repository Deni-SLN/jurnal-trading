/**
 * Client-side Bybit sync — runs in the browser, not on Vercel server.
 * This bypasses Vercel's US geo-block: requests come from the user's
 * browser IP (Indonesia) which is allowed by Bybit.
 *
 * Flow:
 * 1. Fetch credentials from our server (POST /api/exchange-accounts/credentials)
 * 2. Sign and call Bybit API directly from browser
 * 3. Send mapped trade records to our server to save (POST /api/sync/bybit/save)
 */

import { hmacSha256Hex } from "@/lib/hmac"

const BYBIT_BASE = "https://api.bybit.com"

// ---------------------------------------------------------------------------
// Raw fetch to Bybit (browser-side)
// ---------------------------------------------------------------------------

async function bybitGet(
  path: string,
  params: Record<string, string | number>,
  apiKey: string,
  secret: string
): Promise<Record<string, unknown>> {
  const recvWindow = "5000"
  const timestamp  = Date.now().toString()
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()

  const prehash = timestamp + apiKey + recvWindow + qs
  const sig     = await hmacSha256Hex(secret, prehash)

  const res = await fetch(`${BYBIT_BASE}${path}?${qs}`, {
    method: "GET",
    headers: {
      "X-BAPI-API-KEY":     apiKey,
      "X-BAPI-SIGN":        sig,
      "X-BAPI-TIMESTAMP":   timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Bybit HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Map Bybit order to our trade shape
// ---------------------------------------------------------------------------

interface BybitOrder {
  orderId:     string
  symbol:      string
  side:        string
  qty:         string
  avgPrice:    string
  cumExecFee:  string
  cumExecQty:  string
  createdTime: string
  updatedTime: string
  leverage:    string
  positionIdx: number
  closedPnl:   string
  category:    string
}

function mapOrder(order: BybitOrder, userId: string, accountId: string) {
  const entryPrice = parseFloat(order.avgPrice)   || 0
  const qty        = parseFloat(order.cumExecQty)  || parseFloat(order.qty) || 0
  const leverage   = parseFloat(order.leverage)   || 1
  const fee        = Math.abs(parseFloat(order.cumExecFee) || 0)
  const pnlRaw     = parseFloat(order.closedPnl)
  const pnl        = isNaN(pnlRaw) ? null : pnlRaw

  const marketType =
    order.category === "spot"    ? "spot"      :
    order.category === "linear"  ? "perpetual" :
    order.category === "inverse" ? "perpetual" : "spot"

  const side =
    order.positionIdx === 1 ? "long"  :
    order.positionIdx === 2 ? "short" :
    order.side === "Buy"    ? "buy"   : "sell"

  const margin = marketType === "spot"
    ? entryPrice * qty
    : (entryPrice * qty) / Math.max(leverage, 1)

  return {
    user_id:             userId,
    exchange_account_id: accountId,
    trade_source:        "bybit",
    symbol:              order.symbol,
    side,
    market_type:         marketType,
    entry_price:         entryPrice,
    exit_price:          entryPrice,
    quantity:            qty,
    leverage,
    margin,
    trading_fee:         fee,
    funding_fee:         0,
    gross_pnl:           pnl,
    net_pnl:             pnl !== null ? pnl - fee : null,
    status:              "closed",
    opened_at:           new Date(parseInt(order.createdTime)).toISOString(),
    closed_at:           new Date(parseInt(order.updatedTime)).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Main sync function — call from import page
// ---------------------------------------------------------------------------

export interface SyncProgress {
  stage:    string
  category?: string
  fetched?: number
}

export async function syncBybitClientSide(
  accountId: string,
  userId: string,
  onProgress: (p: SyncProgress) => void
): Promise<{ imported: number; message: string }> {

  // 1. Get credentials from server
  onProgress({ stage: "Mengambil kredensial…" })
  const credsRes = await fetch("/api/exchange-accounts/credentials", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ account_id: accountId }),
  })
  const creds = await credsRes.json() as {
    api_key: string; api_secret: string; error?: string
  }
  if (!credsRes.ok || !creds.api_key) {
    throw new Error(creds.error || "Gagal mengambil API key dari server.")
  }

  const { api_key, api_secret } = creds
  const since    = Date.now() - 90 * 24 * 60 * 60 * 1000
  const cats     = ["linear", "spot", "inverse"]
  const allOrders: ReturnType<typeof mapOrder>[] = []
  const catErrors: string[] = []

  // 2. Fetch orders from Bybit (browser → Bybit directly)
  for (const category of cats) {
    onProgress({ stage: `Fetching ${category}…`, category })
    let cursor  = ""
    let hasMore = true
    let catCount = 0

    while (hasMore) {
      const params: Record<string, string | number> = {
        category,
        orderStatus: "Filled",
        limit:       50,
        startTime:   since,
      }
      if (cursor) params.cursor = cursor

      try {
        const resp = await bybitGet("/v5/order/history", params, api_key, api_secret) as {
          retCode: number
          retMsg:  string
          result?: { list: BybitOrder[]; nextPageCursor: string }
        }

        if (resp.retCode !== 0) {
          catErrors.push(`${category}: [${resp.retCode}] ${resp.retMsg}`)
          break
        }

        const batch = (resp.result?.list || []).map((o) => ({ ...o, category }))
        const mapped = batch.map((o) => mapOrder(o, userId, accountId))
        allOrders.push(...mapped)
        catCount += batch.length

        onProgress({ stage: `Fetching ${category}…`, category, fetched: catCount })

        cursor  = resp.result?.nextPageCursor || ""
        hasMore = !!(cursor && batch.length >= 50)
      } catch (e) {
        catErrors.push(`${category}: ${(e as Error).message}`)
        break
      }
    }
  }

  // All categories failed
  if (catErrors.length === cats.length && allOrders.length === 0) {
    throw new Error(`Gagal mengambil data dari Bybit. ${catErrors.join(" | ")}`)
  }

  // 3. Send to server to save
  onProgress({ stage: `Menyimpan ${allOrders.length} order…` })
  const saveRes = await fetch("/api/sync/bybit/save", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ account_id: accountId, records: allOrders }),
  })
  const saveData = await saveRes.json() as { imported: number; message: string; error?: string }

  if (!saveRes.ok) {
    throw new Error(saveData.error || "Gagal menyimpan data ke database.")
  }

  return { imported: saveData.imported, message: saveData.message }
}
