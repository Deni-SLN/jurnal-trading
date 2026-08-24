"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/toast"
import { useAppStore } from "@/stores/app-store"
import { ExchangeAccount } from "@/types/database"
import {
  Settings, Trash2, User, Link2, Bot,
  Eye, EyeOff, Info, CheckCircle2, Loader2, ExternalLink,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AIProvider = "openrouter" | "openai" | "gemini"

interface ExchangeAccountForm {
  exchange:    "okx" | "bybit"
  account_name: string
  api_key:     string
  api_secret:  string
  passphrase?: string
}

interface AISettingsForm {
  provider:       AIProvider
  model:          string
  prefer_free:    boolean
  openrouter_key: string
  openai_key:     string
  gemini_key:     string
}

// ---------------------------------------------------------------------------
// Model lists per provider
// ---------------------------------------------------------------------------

const OR_FREE_MODELS = [
  "openrouter/free",                             // auto-router (direkomendasikan)
  "nvidia/nemotron-3-ultra-550b-a55b:free",      // 550B — terbaik
  "openai/gpt-oss-20b:free",                     // OpenAI open-weight
  "nvidia/nemotron-nano-9b-v2:free",              // ringan & cepat
  "google/gemma-4-31b-it:free",                  // multimodal
  "meta-llama/llama-3.3-70b-instruct:free",      // classic fallback
]

const OR_PAID_MODELS = [
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "google/gemini-pro-1.5",
]

const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"]

const GEMINI_MODELS = [
  { id: "gemini-3.6-flash",     label: "Gemini 3.6 Flash — GA, terbaru & cepat (Free tier)" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite — ringan (Free tier)" },
  { id: "gemini-3.5-flash",     label: "Gemini 3.5 Flash — Pro-level intelligence" },
  { id: "gemini-2.5-flash",     label: "Gemini 2.5 Flash — stabil" },
]

// Provider config metadata
const PROVIDERS: { id: AIProvider; label: string; desc: string; link: string; linkLabel: string }[] = [
  {
    id: "openrouter", label: "OpenRouter",
    desc: "200+ model termasuk free tier LLaMA, Gemma, Mistral",
    link: "https://openrouter.ai/keys", linkLabel: "openrouter.ai",
  },
  {
    id: "openai", label: "OpenAI",
    desc: "GPT-4o, GPT-4o-mini — model terbaik OpenAI",
    link: "https://platform.openai.com/api-keys", linkLabel: "platform.openai.com",
  },
  {
    id: "gemini", label: "Google Gemini",
    desc: "Gemini 1.5 Flash gratis dengan limit generous",
    link: "https://aistudio.google.com/app/apikey", linkLabel: "aistudio.google.com",
  },
]

// ---------------------------------------------------------------------------
// Key field component
// ---------------------------------------------------------------------------

function ApiKeyField({
  label, value, placeholder, onChange, show, onToggleShow, link, linkLabel,
}: {
  label:        string
  value:        string
  placeholder:  string
  onChange:     (v: string) => void
  show:         boolean
  onToggleShow: () => void
  link?:        string
  linkLabel?:   string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label>{label}</Label>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-500 hover:underline flex items-center gap-0.5"
          >
            {linkLabel} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-9 font-mono text-sm"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main settings page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const defaultTab   = searchParams.get("tab") === "api" ? "api" : "profile"

  const { user, setUser } = useAppStore()
  const { addToast }      = useToast()
  const [activeTab, setActiveTab] = useState(defaultTab)

  // ---- Profile ----
  const [profileForm, setProfileForm] = useState({
    full_name: "", base_currency: "USD", timezone: "Asia/Jakarta",
  })
  const [savingProfile, setSavingProfile] = useState(false)

  // ---- Exchange ----
  const [exchangeForm, setExchangeForm] = useState<ExchangeAccountForm>({
    exchange: "okx", account_name: "", api_key: "", api_secret: "", passphrase: "",
  })
  const [exchangeAccounts, setExchangeAccounts] = useState<ExchangeAccount[]>([])
  const [savingExchange,   setSavingExchange]   = useState(false)

  // ---- AI ----
  const [aiForm, setAiForm] = useState<AISettingsForm>({
    provider:       "gemini",
    model:          "auto",
    prefer_free:    true,
    openrouter_key: "",
    openai_key:     "",
    gemini_key:     "",
  })
  const [savingAI,       setSavingAI]       = useState(false)
  const [showORKey,      setShowORKey]      = useState(false)
  const [showOAIKey,     setShowOAIKey]     = useState(false)
  const [showGeminiKey,  setShowGeminiKey]  = useState(false)
  const [testingAI,      setTestingAI]      = useState(false)
  const [testResult,     setTestResult]     = useState<string | null>(null)

  // ---- Loaders ----
  const loadExchangeAccounts = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("exchange_accounts")
      .select("*")
      .order("created_at", { ascending: false })
    setExchangeAccounts(data || [])
  }, [])

  const loadAISettings = useCallback(async () => {
    const res = await fetch("/api/ai/settings")
    if (res.ok) {
      const data = await res.json()
      setAiForm({
        provider:       data.provider       || "gemini",
        model:          data.model          || "auto",
        prefer_free:    data.prefer_free    ?? true,
        openrouter_key: data.openrouter_key || "",
        openai_key:     data.openai_key     || "",
        gemini_key:     data.gemini_key     || "",
      })
    }
  }, [])

  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name:     user.full_name     || "",
        base_currency: user.base_currency || "USD",
        timezone:      user.timezone      || "Asia/Jakarta",
      })
    }
  }, [user])

  useEffect(() => {
    loadExchangeAccounts()
    loadAISettings()
  }, [loadExchangeAccounts, loadAISettings])

  // ---- Handlers ----
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { error } = await supabase.from("users").update(profileForm).eq("id", authUser.id)
    if (error) addToast({ title: "Error", description: error.message, variant: "destructive" })
    else {
      addToast({ title: "Profil diperbarui", variant: "success" })
      const { data } = await supabase.from("users").select("*").eq("id", authUser.id).single()
      if (data) setUser(data)
    }
    setSavingProfile(false)
  }

  const handleExchangeSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingExchange(true)
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { error } = await supabase.from("exchange_accounts").insert({
      user_id:              authUser.id,
      exchange:             exchangeForm.exchange,
      account_name:         exchangeForm.account_name,
      api_key_encrypted:    exchangeForm.api_key,
      api_secret_encrypted: exchangeForm.api_secret,
      passphrase_encrypted: exchangeForm.passphrase || null,
      sync_status:          "disconnected",
    })
    if (error) addToast({ title: "Error", description: error.message, variant: "destructive" })
    else {
      addToast({ title: "Exchange ditambahkan", variant: "success" })
      setExchangeForm({ exchange: "okx", account_name: "", api_key: "", api_secret: "", passphrase: "" })
      loadExchangeAccounts()
    }
    setSavingExchange(false)
  }

  const handleExchangeDelete = async (id: string) => {
    if (!confirm("Hapus koneksi exchange ini?")) return
    const supabase = createClient()
    await supabase.from("exchange_accounts").delete().eq("id", id)
    addToast({ title: "Exchange dihapus" })
    loadExchangeAccounts()
  }

  const handleAISave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingAI(true)
    setTestResult(null)
    const res = await fetch("/api/ai/settings", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(aiForm),
    })
    const data = await res.json()
    if (!res.ok) addToast({ title: "Error", description: data.error, variant: "destructive" })
    else { addToast({ title: "AI Settings disimpan", variant: "success" }); loadAISettings() }
    setSavingAI(false)
  }

  const handleAITest = async () => {
    setTestingAI(true)
    setTestResult(null)
    const res = await fetch("/api/ai/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages:    [{ role: "user", content: "Halo, balas singkat bahwa kamu siap membantu trading analyst." }],
        provider:    aiForm.provider,
        model:       aiForm.model,
        prefer_free: aiForm.prefer_free,
      }),
    })
    const data = await res.json()
    setTestResult(res.ok ? `✓ ${data.content?.slice(0, 120)} [${data.model}]` : `✗ ${data.error}`)
    setTestingAI(false)
  }

  // ---- Model options for current provider ----
  function modelOptions() {
    if (aiForm.provider === "openrouter") {
      return (
        <>
          <option value="auto">Auto (pilih otomatis)</option>
          <optgroup label="── Free Models ──">
            {OR_FREE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </optgroup>
          <optgroup label="── Paid Models ──">
            {OR_PAID_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </optgroup>
        </>
      )
    }
    if (aiForm.provider === "gemini") {
      return (
        <>
          <option value="auto">Auto (Gemini 3.6 Flash saat free)</option>
          {GEMINI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </>
      )
    }
    // openai
    return (
      <>
        <option value="auto">Auto (gpt-4o-mini saat free)</option>
        {OPENAI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
      </>
    )
  }

  // ---- Render ----
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <Settings className="h-6 w-6 text-blue-500" />
        Settings
      </h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile"><User className="h-4 w-4 mr-1.5" />Profil</TabsTrigger>
          <TabsTrigger value="exchange"><Link2 className="h-4 w-4 mr-1.5" />Exchange</TabsTrigger>
          <TabsTrigger value="api"><Bot className="h-4 w-4 mr-1.5" />API AI</TabsTrigger>
        </TabsList>

        {/* ─── PROFILE ─── */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profil & Preferensi</CardTitle>
              <CardDescription>Pengaturan akun dan tampilan</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSave} className="space-y-4 max-w-sm">
                <div>
                  <Label>Nama Lengkap</Label>
                  <Input value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} className="mt-1" required />
                </div>
                <div>
                  <Label>Mata Uang Utama</Label>
                  <Select value={profileForm.base_currency} onChange={(e) => setProfileForm({ ...profileForm, base_currency: e.target.value })} className="mt-1">
                    <option value="USD">USD — US Dollar</option>
                    <option value="IDR">IDR — Rupiah</option>
                  </Select>
                </div>
                <div>
                  <Label>Timezone</Label>
                  <Input value={profileForm.timezone} onChange={(e) => setProfileForm({ ...profileForm, timezone: e.target.value })} className="mt-1" required />
                </div>
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? <><Loader2 className="h-4 w-4 animate-spin" />Menyimpan…</> : "Simpan Profil"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── EXCHANGE ─── */}
        <TabsContent value="exchange">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tambah Exchange</CardTitle>
                <CardDescription>Gunakan API key read-only untuk keamanan</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleExchangeSave} className="space-y-4 max-w-sm">
                  <div>
                    <Label>Exchange</Label>
                    <Select value={exchangeForm.exchange} onChange={(e) => setExchangeForm({ ...exchangeForm, exchange: e.target.value as "okx" | "bybit" })} className="mt-1">
                      <option value="okx">OKX</option>
                      <option value="bybit">Bybit</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Nama Akun</Label>
                    <Input value={exchangeForm.account_name} onChange={(e) => setExchangeForm({ ...exchangeForm, account_name: e.target.value })} placeholder="e.g. OKX Main" className="mt-1" required />
                  </div>
                  <div>
                    <Label>API Key</Label>
                    <Input value={exchangeForm.api_key} onChange={(e) => setExchangeForm({ ...exchangeForm, api_key: e.target.value })} className="mt-1 font-mono" required />
                  </div>
                  <div>
                    <Label>API Secret</Label>
                    <Input type="password" value={exchangeForm.api_secret} onChange={(e) => setExchangeForm({ ...exchangeForm, api_secret: e.target.value })} className="mt-1" required />
                  </div>
                  {exchangeForm.exchange === "okx" && (
                    <div>
                      <Label>Passphrase (OKX)</Label>
                      <Input type="password" value={exchangeForm.passphrase} onChange={(e) => setExchangeForm({ ...exchangeForm, passphrase: e.target.value })} className="mt-1" required />
                    </div>
                  )}
                  <Button type="submit" disabled={savingExchange}>
                    {savingExchange ? <><Loader2 className="h-4 w-4 animate-spin" />Menghubungkan…</> : "Tambah Exchange"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Exchange Terhubung</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exchange</TableHead><TableHead>Nama Akun</TableHead>
                      <TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exchangeAccounts.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Belum ada exchange terhubung</TableCell></TableRow>
                    ) : exchangeAccounts.map((acc) => (
                      <TableRow key={acc.id}>
                        <TableCell className="font-semibold capitalize">{acc.exchange}</TableCell>
                        <TableCell>{acc.account_name}</TableCell>
                        <TableCell>
                          <Badge variant={acc.sync_status === "connected" ? "success" : acc.sync_status === "error" ? "destructive" : "secondary"}>
                            {acc.sync_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleExchangeDelete(acc.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── API AI ─── */}
        <TabsContent value="api">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-500" />Konfigurasi AI
                </CardTitle>
                <CardDescription>
                  Pilih provider AI untuk chat dan analisis trading. Mendukung OpenRouter, OpenAI, dan Google Gemini.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAISave} className="space-y-6 max-w-lg">

                  {/* Provider selector — 3 cards */}
                  <div>
                    <Label className="mb-2 block">Provider</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {PROVIDERS.map((p) => {
                        const active = aiForm.provider === p.id
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setAiForm({ ...aiForm, provider: p.id, model: "auto" }); setTestResult(null) }}
                            className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                              active
                                ? "border-blue-500 bg-blue-500/10 shadow-sm"
                                : "border-border hover:border-blue-400 hover:bg-muted/50"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 w-full">
                              <span className="font-semibold text-sm text-foreground">{p.label}</span>
                              {active && <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 ml-auto shrink-0" />}
                            </div>
                            <span className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.desc}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Model */}
                  <div>
                    <Label>Model</Label>
                    <Select value={aiForm.model} onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })} className="mt-1.5">
                      {modelOptions()}
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Auto memilih model terbaik sesuai preferensi free/paid.</p>
                  </div>

                  {/* Prefer free */}
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={aiForm.prefer_free}
                      onChange={(e) => setAiForm({ ...aiForm, prefer_free: e.target.checked })}
                      className="h-4 w-4 rounded"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Utamakan model gratis</p>
                      <p className="text-xs text-muted-foreground">Mode Auto akan pilih model $0 terlebih dahulu</p>
                    </div>
                  </label>

                  {/* Key field — conditional */}
                  {aiForm.provider === "openrouter" && (
                    <ApiKeyField
                      label="OpenRouter API Key"
                      value={aiForm.openrouter_key}
                      placeholder="sk-or-v1-…"
                      onChange={(v) => setAiForm({ ...aiForm, openrouter_key: v })}
                      show={showORKey}
                      onToggleShow={() => setShowORKey((x) => !x)}
                      link={PROVIDERS[0].link}
                      linkLabel={PROVIDERS[0].linkLabel}
                    />
                  )}
                  {aiForm.provider === "openai" && (
                    <ApiKeyField
                      label="OpenAI API Key"
                      value={aiForm.openai_key}
                      placeholder="sk-…"
                      onChange={(v) => setAiForm({ ...aiForm, openai_key: v })}
                      show={showOAIKey}
                      onToggleShow={() => setShowOAIKey((x) => !x)}
                      link={PROVIDERS[1].link}
                      linkLabel={PROVIDERS[1].linkLabel}
                    />
                  )}
                  {aiForm.provider === "gemini" && (
                    <ApiKeyField
                      label="Google Gemini API Key"
                      value={aiForm.gemini_key}
                      placeholder="AIza…"
                      onChange={(v) => setAiForm({ ...aiForm, gemini_key: v })}
                      show={showGeminiKey}
                      onToggleShow={() => setShowGeminiKey((x) => !x)}
                      link={PROVIDERS[2].link}
                      linkLabel={PROVIDERS[2].linkLabel}
                    />
                  )}

                  {/* Test result */}
                  {testResult && (
                    <div className={`text-xs p-3 rounded-lg font-mono whitespace-pre-wrap ${
                      testResult.startsWith("✓")
                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-500 border border-red-500/20"
                    }`}>
                      {testResult}
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <Button type="submit" disabled={savingAI}>
                      {savingAI ? <><Loader2 className="h-4 w-4 animate-spin" />Menyimpan…</> : "Simpan"}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleAITest} disabled={testingAI}>
                      {testingAI ? <><Loader2 className="h-4 w-4 animate-spin" />Testing…</> : "Test Koneksi"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Info */}
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-3 items-start">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-muted-foreground space-y-2">
                    <p className="font-semibold text-foreground">Rekomendasi untuk pemula</p>
                    <div className="space-y-1">
                      <p>
                        <span className="font-medium text-foreground">Gemini 3.6 Flash</span> — gratis generous limit,
                        daftar di <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Google AI Studio</a>. Paling mudah setup.
                      </p>
                      <p>
                        <span className="font-medium text-foreground">OpenRouter (openrouter/free)</span> — auto-routing ke model free terbaik yang tersedia, tidak perlu pilih manual.
                        Daftar di <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">openrouter.ai</a>.
                      </p>
                      <p>
                        <span className="font-medium text-foreground">OpenAI GPT-4o-mini</span> — murah (~$0.15/1M token) dan cepat.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
