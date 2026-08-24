import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hmacSha256Base64 } from "@/lib/hmac"

// ---------------------------------------------------------------------------
// OKX REST helpers
// ---------------------------------------------------------------------------

const OKX_BASE = "https://www.okx.com"

async function okxGet(
  path: string, // includes query string, e.g. "/api/v5/trade/orders-history?instType=SPOT&..."
  apiKey: string,
  secret: string,
  passphrase: string
): Promise<unknown> {
  const timestamp = new Date().toISOString()
  // OKX signs: timestamp + "GET" + requestPath (path + query string) + ""
  const prehash = timestamp + "GET" + path + ""
  const sig     = await hmacSha256Base64(secret, prehash)

  const res = await fetch(`${OKX_BASE}${path}`, {
    method: "GET",
    headers: {
      "OK-ACCESS-KEY":       apiKey,
      "OK-ACCESS-SIGN":      sig,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "x-simulated-trading": "0",
    },
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`OKX HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`OKX non-JSON response: ${text.slice(0, 300)}`)
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OkxOrder {
  ordId:     string
  instId:    string
  instType:  string   // "SPOT" | "FUTURES" | "SWAP"
  side:      string   // "buy" | "sell"
  posSide:   string   // "long" | "short" | "net"
  avgPx:     string
  accFillSz: string
  fee:       string
  pnl:       string
  lever:     string
  state:     string   // "filled"
  cTime:     string   // unix ms string
  uTime:     string   // unix ms string
}

interface OkxResp {
  code: string
  msg:  string
  data: OkxOrder[]
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function instTypeToMarket(t: string): string {
  switch (t.toUpperCase()) {
    case "SPOT":    return "spot"
    case "FUTURES": return "futures"
    case "SWAP":    return "perpetual"
    default:        return "spot"
  }
}

function mapOkxSide(side: string, posSide: string): string {
  if (posSide === "long")  return "long"
  if (posSide === "short") return "short"
  return side === "buy" ? "buy" : "sell"
}

function buildTradeFromOkxOrder(order: OkxOrder, userId: string, accountId: string) {
  const entryPrice = parseFloat(order.avgPx)    || 0
  const qty        = parseFloat(order.accFillSz) || 0
  const leverage   = parseFloat(order.lever)    || 1
  const fee        = Math.abs(parseFloat(order.fee) || 0)
  const pnlRaw     = parseFloat(order.pnl)
  const pnl        = isNaN(pnlRaw) ? null : pnlRaw
  const openedAt   = new Date(parseInt(order.cTime)).toISOString()
  const closedAt   = order.state === "filled"
    ? new Date(parseInt(order.uTime)).toISOString()
    : null
  const marketType = instTypeToMarket(order.instType)
  const side       = mapOkxSide(order.side, order.posSide)
  const margin     = marketType === "spot"
    ? entryPrice * qty
    : (entryPrice * qty) / Math.max(leverage, 1)

  return {
    user_id:             userId,
    exchange_account_id: accountId,
    trade_source:        "okx",
    symbol:              order.instId,
    side,
    market_type:         marketType,
    entry_price:         entryPrice,
    exit_price:          closedAt ? entryPrice : null,
    quantity:            qty,
    leverage,
    margin,
    trading_fee:         fee,
    funding_fee:         0,
    gross_pnl:           pnl,
    net_pnl:             pnl !== null ? pnl - fee : null,
    status:              closedAt ? "closed" as const : "open" as const,
    opened_at:           openedAt,
    closed_at:           closedAt,
  }
}

// ---------------------------------------------------------------------------
// POST /api/sync/okx   body: { account_id: string }
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
      .eq("exchange", "okx")
      .single()

    if (accErr || !account) {
      return NextResponse.json(
        { error: "Exchange account tidak ditemukan", detail: accErr?.message },
        { status: 404 }
      )
    }

    const apiKey     = (account.api_key_encrypted    as string | null) ?? ""
    const secret     = (account.api_secret_encrypted  as string | null) ?? ""
    const passphrase = (account.passphrase_encrypted  as string | null) ?? ""

    if (!apiKey.trim() || !secret.trim()) {
      return NextResponse.json(
        { error: "API key atau secret kosong. Update di Settings." },
        { status: 422 }
      )
    }

    // Mark syncing
    await supabase
      .from("exchange_accounts")
      .update({ sync_status: "syncing" })
      .eq("id", account_id)

    const since     = Date.now() - 90 * 24 * 60 * 60 * 1000
    const instTypes = ["SPOT", "SWAP", "FUTURES"]
    const allOrders: OkxOrder[] = []
    const warnings:  string[]   = []

    for (const instType of instTypes) {
      let after   = ""
      let hasMore = true

      while (hasMore) {
        const qs =
          `?instType=${instType}&state=filled&limit=100` +
          (after ? `&after=${after}` : "")

        try {
          // Try archive (3 months) first, fall back to recent (7 days)
          let resp = await okxGet(
            `/api/v5/trade/orders-history-archive${qs}`,
            apiKey, secret, passphrase
          ) as OkxResp

          if (resp.code !== "0") {
            resp = await okxGet(
              `/api/v5/trade/orders-history${qs}`,
              apiKey, secret, passphrase
            ) as OkxResp
          }

          if (resp.code !== "0") {
            warnings.push(`${instType}: [${resp.code}] ${resp.msg}`)
            break
          }

          const batch = resp.data ?? []
          if (batch.length === 0) { hasMore = false; break }

          const filtered = batch.filter((o) => parseInt(o.cTime) > since)
          allOrders.push(...filtered)

          if (filtered.length < batch.length || batch.length < 100) {
            hasMore = false
          } else {
            after = batch[batch.length - 1].ordId
          }

        } catch (e) {
          warnings.push(`${instType}: ${(e as Error).message}`)
          break
        }
      }
    }

    const allFailed = warnings.length === instTypes.length && allOrders.length === 0
    if (allFailed) {
      await supabase
        .from("exchange_accounts")
        .update({ sync_status: "error" })
        .eq("id", account_id)

      return NextResponse.json(
        {
          error:    "Gagal terhubung ke OKX. Periksa API key, secret, dan passphrase Anda.",
          detail:   warnings.join(" | "),
          imported: 0,
        },
        { status: 502 }
      )
    }

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
      .map((o) => buildTradeFromOkxOrder(o, user.id, account_id))
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
        ? `${imported} trade baru diimport dari OKX.`
        : "Semua trade sudah up-to-date.",
      ...(warnings.length > 0     && { warnings }),
      ...(insertErrors.length > 0 && { insert_errors: insertErrors }),
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[sync/okx] uncaught:", msg)
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 })
  }
}
