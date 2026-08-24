import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Provider = "openrouter" | "openai" | "gemini"

interface ChatMessage {
  role:    "system" | "user" | "assistant"
  content: string
}

interface ChatBody {
  messages:    ChatMessage[]
  provider:    Provider
  model:       string
  prefer_free: boolean
}

// ---------------------------------------------------------------------------
// OpenRouter
// Model list updated August 2025 — sources: openrouter.ai/collections/free-models
// Uses openrouter/free router as primary (auto-picks best available free model)
// Static fallbacks in priority order for when the router slug isn't ideal.
// ---------------------------------------------------------------------------

const OR_FREE_FALLBACKS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",   // 550B, 1M ctx — best quality
  "openai/gpt-oss-20b:free",                  // OpenAI open-weight
  "nvidia/nemotron-nano-9b-v2:free",           // fast lightweight
  "google/gemma-4-31b-it:free",               // multimodal capable
  "meta-llama/llama-3.3-70b-instruct:free",   // classic (deprecating Jul 2026)
]

async function pickOpenRouterModel(apiKey: string, preferFree: boolean): Promise<string> {
  if (!preferFree) return "anthropic/claude-3.5-sonnet"

  // Fetch live free model list and pick best available
  try {
    const res  = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return "openrouter/free"

    const json = await res.json() as { data?: { id: string; pricing?: { prompt: string } }[] }
    const freeIds = new Set(
      (json.data || [])
        .filter((m) => m.pricing?.prompt === "0" || m.pricing?.prompt === "0.0")
        .map((m) => m.id)
    )
    const picked = OR_FREE_FALLBACKS.find((m) => freeIds.has(m))
    // openrouter/free is a special router slug that auto-picks — use as ultimate fallback
    return picked ?? "openrouter/free"
  } catch {
    return "openrouter/free"
  }
}

// ---------------------------------------------------------------------------
// Gemini REST call
// Model names updated August 2025:
//   gemini-1.5-flash  → REMOVED (404 on v1beta)
//   gemini-2.0-flash  → Deprecated June 2026, removed
//   Current GA models: gemini-3.6-flash, gemini-3.5-flash-lite, gemini-2.5-flash
// Endpoint: v1 (not v1beta — more stable and supports current models)
// ---------------------------------------------------------------------------

const GEMINI_DEFAULT_FREE = "gemini-3.6-flash"
const GEMINI_DEFAULT_PRO  = "gemini-3.5-flash"   // good balance of speed/quality

async function callGemini(
  apiKey: string,
  model:  string,
  messages: ChatMessage[]
): Promise<string> {
  const resolvedModel =
    !model || model === "auto" ? GEMINI_DEFAULT_FREE : model

  // Separate system prompt — Gemini supports systemInstruction natively in v1
  const systemMsg = messages.find((m) => m.role === "system")
  const chatMsgs  = messages.filter((m) => m.role !== "system")

  // Build Gemini contents array (alternating user/model, must start with user)
  const contents: { role: string; parts: { text: string }[] }[] = []
  for (const m of chatMsgs) {
    contents.push({
      role:  m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })
  }

  // If starts with model turn (shouldn't happen but guard it)
  if (contents[0]?.role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "." }] })
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
  }

  // Use systemInstruction for clean system prompt handling
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] }
  }

  // Use v1 API — stable, supports all current models
  const url = `https://generativelanguage.googleapis.com/v1/models/${resolvedModel}:generateContent?key=${apiKey}`

  const res  = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  })

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    error?:      { message: string; code?: number }
  }

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Gemini HTTP ${res.status}`)
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
}

// ---------------------------------------------------------------------------
// OpenAI-compatible call (OpenRouter + OpenAI share the same format)
// ---------------------------------------------------------------------------

async function callOpenAICompat(
  endpoint: string,
  apiKey:   string,
  model:    string,
  messages: ChatMessage[],
  extraHeaders: Record<string, string> = {}
): Promise<{ content: string; model: string }> {
  const res = await fetch(endpoint, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 }),
  })

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[]
    model?:   string
    error?:   { message: string }
  }

  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model:   data.model ?? model,
  }
}

// ---------------------------------------------------------------------------
// POST /api/ai/chat
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json() as ChatBody
    const { messages, provider, prefer_free } = body
    let { model } = body

    // Load API keys from DB
    const { data: cfg } = await supabase
      .from("ai_settings")
      .select("openrouter_key, openai_key, gemini_key")
      .eq("user_id", user.id)
      .single()

    const keys: Record<Provider, string> = {
      openrouter: (cfg?.openrouter_key as string | null) ?? "",
      openai:     (cfg?.openai_key     as string | null) ?? "",
      gemini:     (cfg?.gemini_key     as string | null) ?? "",
    }

    const apiKey = keys[provider] ?? ""

    if (!apiKey) {
      const labels: Record<Provider, string> = {
        openrouter: "OpenRouter",
        openai:     "OpenAI",
        gemini:     "Google Gemini",
      }
      return NextResponse.json(
        { error: `API key ${labels[provider]} belum dikonfigurasi. Buka Settings → API AI.` },
        { status: 422 }
      )
    }

    // ---- Gemini ----
    if (provider === "gemini") {
      const geminiModel =
        !model || model === "auto"
          ? (prefer_free ? GEMINI_DEFAULT_FREE : GEMINI_DEFAULT_PRO)
          : model

      const content = await callGemini(apiKey, geminiModel, messages)
      return NextResponse.json({ content, model: geminiModel })
    }

    // ---- OpenRouter ----
    if (provider === "openrouter") {
      if (!model || model === "auto") {
        model = await pickOpenRouterModel(apiKey, prefer_free)
      }
      const result = await callOpenAICompat(
        "https://openrouter.ai/api/v1/chat/completions",
        apiKey,
        model,
        messages,
        {
          "HTTP-Referer": "https://sofia-trading-journal.vercel.app",
          "X-Title":      "SOFIA Trading Journal",
        }
      )
      return NextResponse.json(result)
    }

    // ---- OpenAI ----
    if (!model || model === "auto") {
      model = prefer_free ? "gpt-4o-mini" : "gpt-4o"
    }
    const result = await callOpenAICompat(
      "https://api.openai.com/v1/chat/completions",
      apiKey,
      model,
      messages
    )
    return NextResponse.json(result)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[ai/chat]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
