import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// PATCH /api/exchange-accounts/[id]
// Body: { api_key?: string; api_secret?: string; passphrase?: string; account_name?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({})) as Record<string, string>

    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Build update object — only include provided fields
    const update: Record<string, string> = {}
    if (body.api_key)      update.api_key_encrypted     = body.api_key
    if (body.api_secret)   update.api_secret_encrypted  = body.api_secret
    if (body.passphrase !== undefined) update.passphrase_encrypted = body.passphrase
    if (body.account_name) update.account_name           = body.account_name

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Tidak ada field yang diupdate" }, { status: 400 })
    }

    // Reset sync_status to disconnected when credentials change
    if (body.api_key || body.api_secret || body.passphrase !== undefined) {
      update.sync_status = "disconnected"
    }

    const { error } = await supabase
      .from("exchange_accounts")
      .update(update)
      .eq("id", id)
      .eq("user_id", user.id) // ensure ownership

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/exchange-accounts/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("exchange_accounts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
