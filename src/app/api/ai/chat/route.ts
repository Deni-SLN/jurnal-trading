import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// ---------------------------------------------------------------------------
// POST /api/ai/chat
// Body: { messages: {role,content}[]; provider: "openrouter"|"openai"; model: string; prefer_free: boolean }
// ---------------------------------------------------------------------------

interface ChatMessage {
  role:    "system" | "user" | "assistant"
  content: string
}

// Fetch free models from OpenRouter
async function getOpenRouterFreeModels(apiKey: string): Promise<string[]> {
  try {
    const res  = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const json = await res.json()
    const free = (json.data || [])
      .filter((m: { id: string; pricing?: { prompt: string } }) =>
        m.pricing?.prompt === "0" || m.pricing?.prompt === "0.0"
      )
      .map((m: { id: string }) => m.id) as string[]
    return free
  } catch {
    return []
  }
}

// Default free models sorted by quality (OpenRouter)
const FREE_MODEL_PRIORITY = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-7b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
]

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json() as {
      messages:    ChatMessage[]
      provider:    "openrouter" | "openai"
      model:       string
      prefer_free: boolean
    }

    const { messages, provider, prefer_free } = body
    let { model } = body

    // Load user AI settings from DB
    const { data: aiSettings } = await supabase
      .from("ai_settings")
      .select("*")
      .eq("user_id", user.id)
      .single()

    const apiKey = provider === "openrouter"
      ? (aiSettings?.openrouter_key as string | null) ?? ""
      : (aiSettings?.openai_key    as string | null) ?? ""

    if (!apiKey) {
      return NextResponse.json(
        { error: `API key untuk ${provider} belum dikonfigurasi. Buka Settings → API AI.` },
        { status: 422 }
      )
    }

    // Auto-select model
    if (!model || model === "auto") {
      if (provider === "openrouter") {
        if (prefer_free) {
          // Try to pick best available free model
          const freeModels = await getOpenRouterFreeModels(apiKey)
          const picked = FREE_MODEL_PRIORITY.find((m) => freeModels.includes(m))
          model = picked || FREE_MODEL_PRIORITY[0]
        } else {
          model = "anthropic/claude-3.5-sonnet"
        }
      } else {
        model = prefer_free ? "gpt-4o-mini" : "gpt-4o"
      }
    }

    // Call the AI API
    const endpoint = provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions"

    const headers: Record<string, string> = {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${apiKey}`,
    }
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://sofia-trading-journal.vercel.app"
      headers["X-Title"]      = "SOFIA Trading Journal"
    }

    const response = await fetch(endpoint, {
      method:  "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens:   1024,
        temperature:  0.7,
        stream:       false,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "AI API error", model },
        { status: response.status }
      )
    }

    const content = data.choices?.[0]?.message?.content ?? ""
    return NextResponse.json({ content, model })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[ai/chat]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
