import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hmacSha256Hex } from "@/lib/hmac"

// ---------------------------------------------------------------------------
// Force this serverless function to run in Singapore (Bybit blocks US IPs)
// Vercel region codes: sin1=Singapore, hnd1=Tokyo, icn1=Seoul, bom1=Mumbai
// ---------------------------------------------------------------------------
export const preferredRegion = ["sin1", "hnd1", "icn1", "bom1"]

// ---------------------------------------------------------------------------
// Bybit endpoints — full list from official docs
// Ordered by preference: Singapore mirror first, then regional, then main
// All of these are official Bybit endpoints (NOT blocked for most regions)
// api.bybit.com & api.bytick.com are blocked from US/CN — hence the list
// ---------------------------------------------------------------------------
const BYBIT_ENDPOINTS = [
  "https://api.bytick.com",       // Bybit Singapore mirror
  "https://api.bybit.com",        // Main (blocked from US/CN)
  "https://api.bybit.nl",         // Netherlands
  "https://api.bybit.eu",         // EEA
]

async function bybitGet(
  path: string,
  params: Record<string, string | number>,
  apiKey: string,
  secret: string
): Promise<unknown> {
  const recvWindow = "5000"
  const timestamp  = Date.now().toString()
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()

  const prehash = timestamp + apiKey + recvWindow + qs
  const sig     = await hmacSha256Hex(secret, prehash)

  const headers = {
    "X-BAPI-API-KEY":      apiKey,
    "X-BAPI-SIGN":         sig,
    "X-BAPI-TIMESTAMP":    timestamp,
    "X-BAPI-RECV-WINDOW":  recvWindow,
  }

  // Try each endpoint in order, return first success
  let lastError = ""
  for (const base of BYBIT_ENDPOINTS) {
    try {
      const url = `${base}${path}?${qs}`
      const res = await fetch(url, { method: "GET", headers })
      const text = await res.text()
      if (res.status === 403) {
        lastError = `${base} HTTP 403 geo-blocked`
        continue // try next endpoint
      }
      if (!res.ok) {
        lastError = `${base} HTTP ${res.status}: ${text.slice(0, 200)}`
        continue // try next endpoint on any HTTP error
      }
      try {
        return JSON.parse(text)
      } catch {
        lastError = `${base} non-JSON response`
        continue
      }
    } catch (e) {
      lastError = `${base} fetch error: ${(e as Error).message}`
      continue // network error — try next endpoint
    }
  }
  throw new Error(`Semua endpoint Bybit gagal. ${lastError}`)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BybitOrder {
  orderId:     string
  symbol:      string
  side:        string   // "Buy" | "Sell"
  qty:         string
  avgPrice:    string
  cumExecFee:  string
  cumExecQty:  string
  createdTime: string   // unix ms string
  updatedTime: string   // unix ms string
  leverage:    string
  positionIdx: number   // 0=one-way, 1=long, 2=short
  closedPnl:   string
  category:    string   // injected: "linear" | "inverse" | "spot"
}

interface BybitResp {
  retCode: number
  retMsg:  string
  result:  {
    list:           BybitOrder[]
    nextPageCursor: string
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function categoryToMarket(category: string): string {
  switch (category) {
    case "spot":    return "spot"
    case "linear":
    case "inverse": return "perpetual"
    default:        return "spot"
  }
}

function mapBybitSide(side: string, posIdx: number): string {
  if (posIdx === 1) return "long"
  if (posIdx === 2) return "short"
  return side === "Buy" ? "buy" : "sell"
}

function buildTradeFromBybitOrder(
  order: BybitOrder,
  userId: string,
  accountId: string
) {
  const entryPrice = parseFloat(order.avgPrice)  || 0
  const qty        = parseFloat(order.cumExecQty) || parseFloat(order.qty) || 0
  const leverage   = parseFloat(order.leverage)  || 1
  const fee        = Math.abs(parseFloat(order.cumExecFee) || 0)
  const pnlRaw     = parseFloat(order.closedPnl)
  const pnl        = isNaN(pnlRaw) ? null : pnlRaw
  const openedAt   = new Date(parseInt(order.createdTime)).toISOString()
  const closedAt   = new Date(parseInt(order.updatedTime)).toISOString()
  const marketType = categoryToMarket(order.category)
  const side       = mapBybitSide(order.side, order.positionIdx)
  const margin     = marketType === "spot"
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
    status:              "closed" as const,
    opened_at:           openedAt,
    closed_at:           closedAt,
  }
}

// ---------------------------------------------------------------------------
// POST /api/sync/bybit   body: { account_id: string }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const account_id = typeof body.account_id === "string" ? body.account_id : null

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: account, error: accErr } = await supabase
      .from("exchange_accounts")
      .select("*")
      .eq("id", account_id)
      .eq("user_id", user.id)
      .eq("exchange", "bybit")
      .single()

    if (accErr || !account) {
      return NextResponse.json(
        { error: "Exchange account tidak ditemukan", detail: accErr?.message },
        { status: 404 }
      )
    }

    const apiKey = (account.api_key_encrypted  as string | null) ?? ""
    const secret = (account.api_secret_encrypted as string | null) ?? ""

    if (!apiKey.trim()) {
      return NextResponse.json(
        { error: "API key kosong. Update di Settings." },
        { status: 422 }
      )
    }

    // Mark syncing
    await supabase
      .from("exchange_accounts")
      .update({ sync_status: "syncing" })
      .eq("id", account_id)

    const since      = Date.now() - 90 * 24 * 60 * 60 * 1000
    const categories = ["linear", "spot", "inverse"]
    const allOrders: BybitOrder[] = []
    const warnings:  string[]     = []

    for (const category of categories) {
      let cursor  = ""
      let hasMore = true

      while (hasMore) {
        const params: Record<string, string | number> = {
          category,
          orderStatus: "Filled",
          limit:       50,
          startTime:   since,
        }
        if (cursor) params.cursor = cursor

        try {
          const resp = await bybitGet("/v5/order/history", params, apiKey, secret) as BybitResp

          if (resp.retCode !== 0) {
            warnings.push(`${category}: [${resp.retCode}] ${resp.retMsg}`)
            break
          }
          if (!resp.result?.list) break

          const batch = resp.result.list.map((o) => ({ ...o, category }))
          allOrders.push(...batch)

          cursor  = resp.result.nextPageCursor || ""
          hasMore = !!(cursor && batch.length >= 50)

        } catch (e) {
          warnings.push(`${category}: ${(e as Error).message}`)
          break
        }
      }
    }

    // All 3 categories failed → likely bad credentials
    const allFailed = warnings.length === categories.length && allOrders.length === 0
    if (allFailed) {
      await supabase
        .from("exchange_accounts")
        .update({ sync_status: "error" })
        .eq("id", account_id)

      return NextResponse.json(
        {
          error:    "Gagal terhubung ke Bybit. Periksa API key dan secret Anda.",
          detail:   warnings.join(" | "),
          imported: 0,
        },
        { status: 502 }
      )
    }

    // No orders at all (not an error, just empty history)
    if (allOrders.length === 0) {
      await supabase
        .from("exchange_accounts")
        .update({ sync_status: "connected", last_sync_at: new Date().toISOString() })
        .eq("id", account_id)
      return NextResponse.json({
        imported: 0,
        message:  "Tidak ada order baru dalam 90 hari terakhir.",
        ...(warnings.length > 0 && { warnings }),
      })
    }

    // Dedup
    const { data: existing } = await supabase
      .from("trades")
      .select("opened_at, symbol")
      .eq("exchange_account_id", account_id)

    const existingSet = new Set(
      (existing || []).map((t) => `${t.symbol}|${t.opened_at}`)
    )

    const newRecords = allOrders
      .map((o) => buildTradeFromBybitOrder(o, user.id, account_id))
      .filter((r) => !existingSet.has(`${r.symbol}|${r.opened_at}`))

    let imported = 0
    const insertErrors: string[] = []

    for (let i = 0; i < newRecords.length; i += 100) {
      const chunk = newRecords.slice(i, i + 100)
      const { error: e } = await supabase.from("trades").insert(chunk)
      if (e) insertErrors.push(e.message)
      else   imported += chunk.length
    }

    await supabase
      .from("exchange_accounts")
      .update({ sync_status: "connected", last_sync_at: new Date().toISOString() })
      .eq("id", account_id)

    return NextResponse.json({
      imported,
      message: imported > 0
        ? `${imported} trade baru diimport dari Bybit.`
        : "Semua trade sudah up-to-date.",
      ...(warnings.length > 0     && { warnings }),
      ...(insertErrors.length > 0 && { insert_errors: insertErrors }),
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[sync/bybit] uncaught:", msg)
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 })
  }
}
