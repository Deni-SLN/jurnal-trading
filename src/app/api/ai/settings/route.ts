import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type Provider = "openrouter" | "openai" | "gemini"

interface AISettingsBody {
  provider:       Provider
  model:          string
  prefer_free:    boolean
  openrouter_key: string
  openai_key:     string
  gemini_key:     string
}

function maskKey(key: string | null | undefined): string {
  if (!key) return ""
  return `${key.slice(0, 8)}…`
}

// GET — load settings (keys masked)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data } = await supabase
      .from("ai_settings")
      .select("provider, model, prefer_free, openrouter_key, openai_key, gemini_key")
      .eq("user_id", user.id)
      .single()

    if (!data) {
      return NextResponse.json({
        provider: "openrouter", model: "auto", prefer_free: true,
        openrouter_key: "", openai_key: "", gemini_key: "",
      })
    }

    return NextResponse.json({
      provider:       data.provider    || "openrouter",
      model:          data.model       || "auto",
      prefer_free:    data.prefer_free ?? true,
      openrouter_key: maskKey(data.openrouter_key),
      openai_key:     maskKey(data.openai_key),
      gemini_key:     maskKey(data.gemini_key),
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

    const body = await req.json() as AISettingsBody

    const update: Record<string, unknown> = {
      user_id:     user.id,
      provider:    body.provider    || "openrouter",
      model:       body.model       || "auto",
      prefer_free: body.prefer_free ?? true,
    }

    // Only write keys that are not masked placeholders
    const isReal = (v: string) => v && !v.endsWith("…")
    if (isReal(body.openrouter_key)) update.openrouter_key = body.openrouter_key
    if (isReal(body.openai_key))     update.openai_key     = body.openai_key
    if (isReal(body.gemini_key))     update.gemini_key     = body.gemini_key

    const { error } = await supabase
      .from("ai_settings")
      .upsert(update, { onConflict: "user_id" })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
