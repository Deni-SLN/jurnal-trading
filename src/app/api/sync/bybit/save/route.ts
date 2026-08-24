import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/sync/bybit/save
 * Saves pre-fetched Bybit trade records (fetched client-side from Bybit API)
 * to the database. Performs dedup and ownership verification server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json() as {
      account_id: string
      records:    Record<string, unknown>[]
    }

    if (!body.account_id || !Array.isArray(body.records)) {
      return NextResponse.json({ error: "account_id and records required" }, { status: 400 })
    }

    // Verify ownership
    const { data: account, error: accErr } = await supabase
      .from("exchange_accounts")
      .select("id")
      .eq("id", body.account_id)
      .eq("user_id", user.id)
      .eq("exchange", "bybit")
      .single()

    if (accErr || !account) {
      return NextResponse.json({ error: "Account tidak ditemukan" }, { status: 404 })
    }

    // Empty = no orders fetched
    if (body.records.length === 0) {
      await supabase
        .from("exchange_accounts")
        .update({ sync_status: "connected", last_sync_at: new Date().toISOString() })
        .eq("id", body.account_id)
      return NextResponse.json({ imported: 0, message: "Tidak ada order baru dalam 90 hari terakhir." })
    }

    // Dedup by symbol+opened_at
    const { data: existing } = await supabase
      .from("trades")
      .select("opened_at, symbol")
      .eq("exchange_account_id", body.account_id)

    const existingSet = new Set(
      (existing || []).map((t) => `${t.symbol}|${t.opened_at}`)
    )

    const newRecords = body.records.filter(
      (r) => !existingSet.has(`${r.symbol}|${r.opened_at}`)
    )

    let imported = 0
    const saveErrors: string[] = []

    for (let i = 0; i < newRecords.length; i += 100) {
      const chunk = newRecords.slice(i, i + 100)
      const { error: e } = await supabase.from("trades").insert(chunk)
      if (e) saveErrors.push(e.message)
      else   imported += chunk.length
    }

    await supabase
      .from("exchange_accounts")
      .update({ sync_status: "connected", last_sync_at: new Date().toISOString() })
      .eq("id", body.account_id)

    return NextResponse.json({
      imported,
      message: imported > 0
        ? `${imported} trade baru diimport dari Bybit.`
        : "Semua trade sudah up-to-date.",
      ...(saveErrors.length > 0 && { errors: saveErrors }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[bybit/save]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
