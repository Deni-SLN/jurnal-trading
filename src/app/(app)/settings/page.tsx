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
  Eye, EyeOff, Info, CheckCircle2, Loader2,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExchangeAccountForm {
  exchange:    "okx" | "bybit"
  account_name: string
  api_key:     string
  api_secret:  string
  passphrase?: string
}

interface AISettingsForm {
  provider:       "openrouter" | "openai"
  model:          string
  prefer_free:    boolean
  openrouter_key: string
  openai_key:     string
}

// ---------------------------------------------------------------------------
// OpenRouter free models list (shown as hints)
// ---------------------------------------------------------------------------
const OR_FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-7b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
]

const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const searchParams = useSearchParams()
  const defaultTab   = searchParams.get("tab") === "api" ? "api" : "profile"

  const { user, setUser } = useAppStore()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState(defaultTab)

  // --- Profile ---
  const [profileForm, setProfileForm] = useState({
    full_name: "", base_currency: "USD", timezone: "Asia/Jakarta",
  })
  const [savingProfile, setSavingProfile] = useState(false)

  // --- Exchange ---
  const [exchangeForm, setExchangeForm] = useState<ExchangeAccountForm>({
    exchange: "okx", account_name: "", api_key: "", api_secret: "", passphrase: "",
  })
  const [exchangeAccounts, setExchangeAccounts] = useState<ExchangeAccount[]>([])
  const [savingExchange,   setSavingExchange]   = useState(false)

  // --- AI Settings ---
  const [aiForm, setAiForm] = useState<AISettingsForm>({
    provider:       "openrouter",
    model:          "auto",
    prefer_free:    true,
    openrouter_key: "",
    openai_key:     "",
  })
  const [savingAI,    setSavingAI]    = useState(false)
  const [showORKey,   setShowORKey]   = useState(false)
  const [showOAIKey,  setShowOAIKey]  = useState(false)
  const [testingAI,   setTestingAI]   = useState(false)
  const [testResult,  setTestResult]  = useState<string | null>(null)

  // ---- Load data ----
  const loadExchangeAccounts = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from("exchange_accounts").select("*").order("created_at", { ascending: false })
    setExchangeAccounts(data || [])
  }, [])

  const loadAISettings = useCallback(async () => {
    const res = await fetch("/api/ai/settings")
    if (res.ok) {
      const data = await res.json()
      setAiForm({
        provider:       data.provider    || "openrouter",
        model:          data.model       || "auto",
        prefer_free:    data.prefer_free ?? true,
        openrouter_key: data.openrouter_key || "",
        openai_key:     data.openai_key     || "",
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

  // ---- Profile save ----
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { error } = await supabase.from("users").update(profileForm).eq("id", authUser.id)
    if (error) { addToast({ title: "Error", description: error.message, variant: "destructive" }) }
    else {
      addToast({ title: "Profil diperbarui", variant: "success" })
      const { data } = await supabase.from("users").select("*").eq("id", authUser.id).single()
      if (data) setUser(data)
    }
    setSavingProfile(false)
  }

  // ---- Exchange save ----
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

    if (error) { addToast({ title: "Error", description: error.message, variant: "destructive" }) }
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

  // ---- AI Settings save ----
  const handleAISave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingAI(true)
    const res = await fetch("/api/ai/settings", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(aiForm),
    })
    const data = await res.json()
    if (!res.ok) { addToast({ title: "Error", description: data.error, variant: "destructive" }) }
    else { addToast({ title: "AI Settings disimpan", variant: "success" }); loadAISettings() }
    setSavingAI(false)
  }

  // ---- AI Test connection ----
  const handleAITest = async () => {
    setTestingAI(true)
    setTestResult(null)
    const res = await fetch("/api/ai/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages:    [{ role: "user", content: "Halo, balas dengan satu kalimat singkat bahwa kamu siap membantu." }],
        provider:    aiForm.provider,
        model:       aiForm.model,
        prefer_free: aiForm.prefer_free,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setTestResult(`✓ ${data.content?.slice(0, 100)} [${data.model}]`)
    } else {
      setTestResult(`✗ ${data.error}`)
    }
    setTestingAI(false)
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
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-1.5" />Profil
          </TabsTrigger>
          <TabsTrigger value="exchange">
            <Link2 className="h-4 w-4 mr-1.5" />Exchange
          </TabsTrigger>
          <TabsTrigger value="api">
            <Bot className="h-4 w-4 mr-1.5" />API AI
          </TabsTrigger>
        </TabsList>

        {/* ================= PROFILE ================= */}
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
                  <Input
                    value={profileForm.full_name}
                    onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label>Mata Uang Utama</Label>
                  <Select
                    value={profileForm.base_currency}
                    onChange={(e) => setProfileForm({ ...profileForm, base_currency: e.target.value })}
                    className="mt-1"
                  >
                    <option value="USD">USD — US Dollar</option>
                    <option value="IDR">IDR — Rupiah</option>
                  </Select>
                </div>
                <div>
                  <Label>Timezone</Label>
                  <Input
                    value={profileForm.timezone}
                    onChange={(e) => setProfileForm({ ...profileForm, timezone: e.target.value })}
                    className="mt-1"
                    required
                  />
                </div>
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? <><Loader2 className="h-4 w-4 animate-spin" />Menyimpan…</> : "Simpan Profil"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= EXCHANGE ================= */}
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
                    <Select
                      value={exchangeForm.exchange}
                      onChange={(e) => setExchangeForm({ ...exchangeForm, exchange: e.target.value as "okx" | "bybit" })}
                      className="mt-1"
                    >
                      <option value="okx">OKX</option>
                      <option value="bybit">Bybit</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Nama Akun</Label>
                    <Input
                      value={exchangeForm.account_name}
                      onChange={(e) => setExchangeForm({ ...exchangeForm, account_name: e.target.value })}
                      placeholder="e.g. OKX Trading"
                      className="mt-1"
                      required
                    />
                  </div>
                  <div>
                    <Label>API Key</Label>
                    <Input
                      value={exchangeForm.api_key}
                      onChange={(e) => setExchangeForm({ ...exchangeForm, api_key: e.target.value })}
                      className="mt-1 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <Label>API Secret</Label>
                    <Input
                      type="password"
                      value={exchangeForm.api_secret}
                      onChange={(e) => setExchangeForm({ ...exchangeForm, api_secret: e.target.value })}
                      className="mt-1"
                      required
                    />
                  </div>
                  {exchangeForm.exchange === "okx" && (
                    <div>
                      <Label>Passphrase (OKX)</Label>
                      <Input
                        type="password"
                        value={exchangeForm.passphrase}
                        onChange={(e) => setExchangeForm({ ...exchangeForm, passphrase: e.target.value })}
                        className="mt-1"
                        required
                      />
                    </div>
                  )}
                  <Button type="submit" disabled={savingExchange}>
                    {savingExchange ? <><Loader2 className="h-4 w-4 animate-spin" />Menghubungkan…</> : "Tambah Exchange"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Exchange Terhubung</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exchange</TableHead>
                      <TableHead>Nama Akun</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exchangeAccounts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Belum ada exchange terhubung
                        </TableCell>
                      </TableRow>
                    ) : (
                      exchangeAccounts.map((acc) => (
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
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================= API AI ================= */}
        <TabsContent value="api">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-500" />
                  Konfigurasi AI
                </CardTitle>
                <CardDescription>
                  Pilih provider dan model AI untuk fitur chat dan review. Mendukung OpenRouter (akses 200+ model) dan OpenAI.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAISave} className="space-y-5 max-w-lg">
                  {/* Provider */}
                  <div>
                    <Label>Provider</Label>
                    <div className="grid grid-cols-2 gap-3 mt-1.5">
                      {(["openrouter", "openai"] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setAiForm({ ...aiForm, provider: p })}
                          className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${
                            aiForm.provider === p
                              ? "border-blue-500 bg-blue-500/10"
                              : "border-border hover:border-blue-400"
                          }`}
                        >
                          <span className="font-semibold text-sm text-foreground capitalize">
                            {p === "openrouter" ? "OpenRouter" : "OpenAI"}
                            {aiForm.provider === p && <CheckCircle2 className="inline h-3.5 w-3.5 text-blue-500 ml-1.5" />}
                          </span>
                          <span className="text-xs text-muted-foreground mt-0.5">
                            {p === "openrouter" ? "200+ model, ada free tier" : "GPT-4o, GPT-4o-mini"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Model selection */}
                  <div>
                    <Label>Model</Label>
                    <Select
                      value={aiForm.model}
                      onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                      className="mt-1"
                    >
                      <option value="auto">Auto (pilih otomatis)</option>
                      {aiForm.provider === "openrouter" ? (
                        <>
                          <optgroup label="Free Models">
                            {OR_FREE_MODELS.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Paid Models">
                            <option value="anthropic/claude-3.5-sonnet">claude-3.5-sonnet</option>
                            <option value="openai/gpt-4o">gpt-4o</option>
                            <option value="openai/gpt-4o-mini">gpt-4o-mini</option>
                            <option value="google/gemini-pro-1.5">gemini-pro-1.5</option>
                          </optgroup>
                        </>
                      ) : (
                        OPENAI_MODELS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))
                      )}
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Mode "Auto" akan memilih model terbaik sesuai preferensi free/paid.
                    </p>
                  </div>

                  {/* Prefer free */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                    <input
                      type="checkbox"
                      id="prefer_free"
                      checked={aiForm.prefer_free}
                      onChange={(e) => setAiForm({ ...aiForm, prefer_free: e.target.checked })}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div>
                      <label htmlFor="prefer_free" className="text-sm font-medium text-foreground cursor-pointer">
                        Utamakan model gratis
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Saat mode Auto, prioritaskan model dengan biaya $0
                      </p>
                    </div>
                  </div>

                  {/* OpenRouter Key */}
                  {aiForm.provider === "openrouter" && (
                    <div>
                      <Label>OpenRouter API Key</Label>
                      <div className="flex gap-2 mt-1">
                        <div className="relative flex-1">
                          <Input
                            type={showORKey ? "text" : "password"}
                            value={aiForm.openrouter_key}
                            onChange={(e) => setAiForm({ ...aiForm, openrouter_key: e.target.value })}
                            placeholder="sk-or-v1-…"
                            className="pr-9 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowORKey((v) => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                          >
                            {showORKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        Daftar gratis di{" "}
                        <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                          openrouter.ai
                        </a>
                      </p>
                    </div>
                  )}

                  {/* OpenAI Key */}
                  {aiForm.provider === "openai" && (
                    <div>
                      <Label>OpenAI API Key</Label>
                      <div className="relative mt-1">
                        <Input
                          type={showOAIKey ? "text" : "password"}
                          value={aiForm.openai_key}
                          onChange={(e) => setAiForm({ ...aiForm, openai_key: e.target.value })}
                          placeholder="sk-…"
                          className="pr-9 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowOAIKey((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                        >
                          {showOAIKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Test result */}
                  {testResult && (
                    <div
                      className={`text-xs p-3 rounded-lg font-mono ${
                        testResult.startsWith("✓")
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : "bg-red-500/10 text-red-500 border border-red-500/20"
                      }`}
                    >
                      {testResult}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button type="submit" disabled={savingAI}>
                      {savingAI ? <><Loader2 className="h-4 w-4 animate-spin" />Menyimpan…</> : "Simpan"}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleAITest} disabled={testingAI || savingAI}>
                      {testingAI ? <><Loader2 className="h-4 w-4 animate-spin" />Testing…</> : "Test Koneksi"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Info card */}
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Tentang Model Free</p>
                    <p>OpenRouter menyediakan akses gratis ke beberapa model LLaMA, Gemma, dan Mistral tanpa biaya.</p>
                    <p>Batas rate limit berlaku untuk model gratis. Untuk penggunaan intensif, pertimbangkan model berbayar.</p>
                    <p className="font-medium text-foreground mt-2">Model yang direkomendasikan (gratis):</p>
                    {OR_FREE_MODELS.slice(0, 3).map((m) => (
                      <p key={m} className="font-mono">· {m}</p>
                    ))}
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
