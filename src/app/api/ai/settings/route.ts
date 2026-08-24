import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET — load settings
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data } = await supabase
      .from("ai_settings")
      .select("provider, model, prefer_free, openrouter_key, openai_key")
      .eq("user_id", user.id)
      .single()

    if (!data) return NextResponse.json({ provider: "openrouter", model: "auto", prefer_free: true, openrouter_key: "", openai_key: "" })

    // Mask keys — return only first 8 chars
    return NextResponse.json({
      ...data,
      openrouter_key: data.openrouter_key ? `${data.openrouter_key.slice(0, 8)}…` : "",
      openai_key:     data.openai_key     ? `${data.openai_key.slice(0, 8)}…`     : "",
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST — save settings
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json() as {
      provider:       "openrouter" | "openai"
      model:          string
      prefer_free:    boolean
      openrouter_key: string
      openai_key:     string
    }

    // Only update keys if they are full (not masked placeholder)
    const update: Record<string, unknown> = {
      user_id:     user.id,
      provider:    body.provider,
      model:       body.model || "auto",
      prefer_free: body.prefer_free ?? true,
    }
    if (body.openrouter_key && !body.openrouter_key.endsWith("…")) {
      update.openrouter_key = body.openrouter_key
    }
    if (body.openai_key && !body.openai_key.endsWith("…")) {
      update.openai_key = body.openai_key
    }

    const { error } = await supabase
      .from("ai_settings")
      .upsert(update, { onConflict: "user_id" })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
