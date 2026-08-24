"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/toast"
import {
  BrainCircuit, Send, Loader2, Bot, User,
  Sparkles, RefreshCw, Settings, ChevronRight,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface Message {
  id:      string
  role:    "user" | "assistant" | "system"
  content: string
  model?:  string
  error?:  boolean
}

interface AIConfig {
  provider:    "openrouter" | "openai" | "gemini"
  model:       string
  prefer_free: boolean
}

const SYSTEM_PROMPT = `Kamu adalah SOFIA AI, asisten analis trading profesional untuk pengguna platform SOFIA Trading Journal.
Tugasmu:
- Menganalisis performa trading berdasarkan data yang diberikan pengguna
- Memberikan insight tentang pola trading, kesalahan eksekusi, dan area perbaikan
- Menjawab pertanyaan tentang strategi, psikologi trading, dan manajemen risiko
- Berkomunikasi dalam bahasa Indonesia yang jelas dan profesional

Selalu berikan analisis yang konkret, berbasis data, dan actionable. Jangan berikan saran finansial, hanya edukasi trading.`

const QUICK_PROMPTS = [
  "Analisis performa trading saya bulan ini",
  "Apa pola kesalahan yang sering saya lakukan?",
  "Bagaimana cara memperbaiki win rate saya?",
  "Tips manajemen risiko untuk trader pemula",
  "Jelaskan konsep R-Multiple dalam trading",
]

export default function AIChatPage() {
  const [messages,    setMessages]    = useState<Message[]>([])
  const [input,       setInput]       = useState("")
  const [loading,     setLoading]     = useState(false)
  const [aiConfig,    setAiConfig]    = useState<AIConfig | null>(null)
  const [configError, setConfigError] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { addToast } = useToast()

  // Load AI config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch("/api/ai/settings")
        if (res.ok) {
          const data = await res.json()
          const provider = data.provider || "gemini"
          setAiConfig({
            provider,
            model:       data.model       || "auto",
            prefer_free: data.prefer_free ?? true,
          })
          // Only show config error if key is definitely empty (not just unloaded)
          const hasKey =
            provider === "openrouter" ? !!data.openrouter_key :
            provider === "openai"     ? !!data.openai_key     :
            provider === "gemini"     ? !!data.gemini_key     :
            false
          setConfigError(!hasKey)
        } else {
          // API error — don't block the UI, just let user try
          setConfigError(false)
        }
      } catch {
        // Network error — don't block input, user can still try
        setConfigError(false)
      }
    }
    loadConfig()
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: Message = {
      id:      crypto.randomUUID(),
      role:    "user",
      content: text.trim(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)

    // Build context: include last 10 messages + system prompt
    const history = [...messages, userMsg]
      .slice(-10)
      .map(({ role, content }) => ({ role, content }))

    const apiMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history,
    ]

    // Optionally inject trade context for first message
    if (messages.length === 0) {
      try {
        const supabase = createClient()
        const { data: trades } = await supabase
          .from("trades")
          .select("symbol, side, net_pnl, opened_at, trade_source")
          .order("opened_at", { ascending: false })
          .limit(20)

        if (trades && trades.length > 0) {
          const summary = trades
            .map((t) => `${t.symbol} (${t.side}) PnL: ${t.net_pnl?.toFixed(2) ?? "open"} [${t.trade_source}]`)
            .join("\n")
          apiMessages[0].content += `\n\nData 20 trade terakhir pengguna:\n${summary}`
        }
      } catch { /* non-fatal */ }
    }

    try {
      const res  = await fetch("/api/ai/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          messages:    apiMessages,
          provider:    aiConfig?.provider    ?? "openrouter",
          model:       aiConfig?.model       ?? "auto",
          prefer_free: aiConfig?.prefer_free ?? true,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: data.error || "Terjadi kesalahan.", error: true },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: data.content, model: data.model },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: "Tidak dapat menghubungi server AI.", error: true },
      ])
    }

    setLoading(false)
    textareaRef.current?.focus()
  }, [loading, messages, aiConfig])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const clearChat = () => {
    setMessages([])
    addToast({ title: "Chat direset", variant: "success" })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
            <BrainCircuit className="h-6 w-6 text-blue-500" />
            AI Trading Analyst
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Chat dengan AI untuk analisis performa dan strategi trading
            {aiConfig && (
              <span className="ml-2 text-xs text-blue-500">
                · {aiConfig.provider} {aiConfig.prefer_free && "(free model)"}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearChat} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />Reset
            </Button>
          )}
          <Link href="/settings?tab=api">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" />API Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Config error banner */}
      {configError && (
        <div
          className="flex items-center gap-3 p-3 rounded-lg border text-sm mb-4"
          style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.3)", color: "rgb(248,113,113)" }}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>API key AI belum dikonfigurasi.</span>
          <Link href="/settings?tab=api" className="ml-auto flex items-center gap-1 underline">
            Buka Settings <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Chat area */}
      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: 0 }}>
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <BrainCircuit className="h-8 w-8 text-blue-500" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Mulai percakapan</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tanya apapun tentang performa dan strategi trading Anda
                </p>
              </div>
              {/* Quick prompts */}
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-blue-400 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {/* Avatar */}
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                msg.role === "user" ? "bg-blue-600" : "bg-muted"
              )}>
                {msg.role === "user"
                  ? <User className="h-4 w-4 text-white" />
                  : <Bot className="h-4 w-4 text-muted-foreground" />}
              </div>

              {/* Bubble */}
              <div className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-tr-sm"
                  : msg.error
                    ? "bg-red-500/10 text-red-400 border border-red-500/20 rounded-tl-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
              )}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.model && (
                  <p className="text-xs opacity-50 mt-1.5 font-mono">{msg.model}</p>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </CardContent>

        {/* Input */}
        <div className="p-3 border-t border-border">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tanya tentang performa trading Anda… (Enter untuk kirim)"
              className="flex-1 min-h-[44px] max-h-32 resize-none"
              rows={1}
              disabled={loading || configError}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading || configError}
              size="icon"
              className="h-11 w-11 shrink-0"
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 px-1">
            Enter kirim · Shift+Enter baris baru
          </p>
        </div>
      </Card>
    </div>
  )
}
