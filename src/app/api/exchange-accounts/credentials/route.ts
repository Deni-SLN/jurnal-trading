import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/exchange-accounts/credentials
 * Returns the actual (unmasked) API credentials for a specific exchange account
 * owned by the authenticated user. Used by the import page to perform client-side
 * sync (bypassing Vercel server geo-blocks on exchange APIs).
 *
 * Security: only returns credentials to the authenticated owner.
 * Body: { account_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json() as { account_id?: string }
    if (!body.account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const { data: account, error: accErr } = await supabase
      .from("exchange_accounts")
      .select("id, exchange, api_key_encrypted, api_secret_encrypted, passphrase_encrypted")
      .eq("id", body.account_id)
      .eq("user_id", user.id)  // strict ownership check
      .single()

    if (accErr || !account) {
      return NextResponse.json({ error: "Account tidak ditemukan" }, { status: 404 })
    }

    return NextResponse.json({
      exchange:   account.exchange,
      api_key:    account.api_key_encrypted    || "",
      api_secret: account.api_secret_encrypted || "",
      passphrase: account.passphrase_encrypted  || "",
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
