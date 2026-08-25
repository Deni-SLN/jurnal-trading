"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  RefreshCw, Settings, AlertCircle, CheckCircle2, Clock,
  ArrowLeftRight, Loader2, ChevronRight, TrendingUp, Zap,
  Pencil, Trash2, X, Eye, EyeOff, Save,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { id as localeId } from "date-fns/locale"
import Link from "next/link"
import { ExchangeAccount } from "@/types/database"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountWithStats extends ExchangeAccount {
  trade_count:   number
  syncing:       boolean
  last_imported: number | null
}

interface EditForm {
  account_name: string
  api_key:      string
  api_secret:   string
  passphrase:   string
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === "connected")
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border text-xs">
        <CheckCircle2 className="h-3 w-3" /> Terhubung
      </Badge>
    )
  if (status === "syncing")
    return (
      <Badge className="gap-1 bg-blue-500/15 text-blue-400 border-blue-500/30 border text-xs">
        <Loader2 className="h-3 w-3 animate-spin" /> Syncing…
      </Badge>
    )
  if (status === "error")
    return (
      <Badge className="gap-1 bg-red-500/15 text-red-400 border-red-500/30 border text-xs">
        <AlertCircle className="h-3 w-3" /> Error
      </Badge>
    )
  return (
    <Badge className="gap-1 bg-muted text-muted-foreground border-border border text-xs">
      <Clock className="h-3 w-3" /> Belum terhubung
    </Badge>
  )
}

function ExchangeLogo({ exchange }: { exchange: string }) {
  if (exchange === "okx")
    return (
      <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shrink-0">
        <span className="text-white font-black text-xs tracking-tight">OKX</span>
      </div>
    )
  return (
    <div className="w-10 h-10 rounded-xl bg-[#F7A600] flex items-center justify-center shrink-0">
      <span className="text-black font-black text-xs tracking-tight">BYB</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Edit API key modal (inline drawer inside card)
// ---------------------------------------------------------------------------

function EditModal({
  account,
  onClose,
  onSaved,
}: {
  account: AccountWithStats
  onClose: () => void
  onSaved: () => void
}) {
  const { addToast } = useToast()
  const [form, setForm] = useState<EditForm>({
    account_name: account.account_name,
    api_key:      "",
    api_secret:   "",
    passphrase:   "",
  })
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const payload: Record<string, string> = {}
    if (form.account_name.trim())  payload.account_name = form.account_name.trim()
    if (form.api_key.trim())       payload.api_key      = form.api_key.trim()
    if (form.api_secret.trim())    payload.api_secret   = form.api_secret.trim()
    // Always send passphrase field for OKX (can be empty string to clear)
    if (account.exchange === "okx") payload.passphrase  = form.passphrase.trim()

    if (Object.keys(payload).length === 0) { setSaving(false); onClose(); return }

    const res  = await fetch(`/api/exchange-accounts/${account.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      addToast({ title: "Gagal menyimpan", description: data.error, variant: "destructive" })
    } else {
      addToast({ title: "API key diperbarui", description: "Coba sync ulang sekarang.", variant: "success" })
      onSaved()
      onClose()
    }
  }

  return (
    <div
      className="border-t p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--muted)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          Edit Kredensial API
        </p>
        <button onClick={onClose} style={{ color: "var(--muted-foreground)" }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Account name */}
      <div>
        <Label className="text-xs">Nama Akun</Label>
        <Input
          value={form.account_name}
          onChange={(e) => setForm({ ...form, account_name: e.target.value })}
          placeholder={account.account_name}
          className="mt-1 h-8 text-sm"
        />
      </div>

      {/* API Key */}
      <div>
        <Label className="text-xs">API Key baru (kosongkan jika tidak berubah)</Label>
        <Input
          value={form.api_key}
          onChange={(e) => setForm({ ...form, api_key: e.target.value })}
          placeholder="Paste API key baru…"
          className="mt-1 h-8 text-sm font-mono"
        />
      </div>

      {/* API Secret */}
      <div>
        <Label className="text-xs">API Secret baru</Label>
        <div className="relative mt-1">
          <Input
            type={showSecret ? "text" : "password"}
            value={form.api_secret}
            onChange={(e) => setForm({ ...form, api_secret: e.target.value })}
            placeholder="Paste API secret baru…"
            className="h-8 text-sm font-mono pr-8"
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            style={{ color: "var(--muted-foreground)" }}
          >
            {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Passphrase — OKX only */}
      {account.exchange === "okx" && (
        <div>
          <Label className="text-xs">Passphrase (OKX)</Label>
          <Input
            type="password"
            value={form.passphrase}
            onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
            placeholder="Passphrase OKX…"
            className="mt-1 h-8 text-sm font-mono"
          />
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Simpan
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Batal</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Account card
// ---------------------------------------------------------------------------

function AccountCard({
  account,
  onSync,
  onDelete,
  onRefresh,
}: {
  account:   AccountWithStats
  onSync:    () => void
  onDelete:  () => void
  onRefresh: () => void
}) {
  const { addToast } = useToast()
  const [editOpen, setEditOpen]     = useState(false)
  const [deleting, setDeleting]     = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Hapus akun "${account.account_name}"? Semua trade dari akun ini akan tetap tersimpan.`)) return
    setDeleting(true)
    const res  = await fetch(`/api/exchange-accounts/${account.id}`, { method: "DELETE" })
    const data = await res.json()
    setDeleting(false)
    if (!res.ok) {
      addToast({ title: "Gagal menghapus", description: data.error, variant: "destructive" })
    } else {
      addToast({ title: `Akun ${account.account_name} dihapus`, variant: "success" })
      onDelete()
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Main row */}
        <div className="flex items-center gap-4 p-4">
          <ExchangeLogo exchange={account.exchange} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                {account.account_name}
              </span>
              <StatusBadge status={account.syncing ? "syncing" : account.sync_status} />
            </div>

            <div className="flex items-center gap-4 mt-1.5 text-xs flex-wrap" style={{ color: "var(--muted-foreground)" }}>
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {account.trade_count.toLocaleString("id-ID")} trade
              </span>
              {account.last_imported !== null && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />+{account.last_imported} baru
                </span>
              )}
              {account.last_sync_at ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(account.last_sync_at), { addSuffix: true, locale: localeId })}
                </span>
              ) : (
                <span className="italic">Belum pernah sync</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Edit */}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setEditOpen((v) => !v)}
              title="Edit API key"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>

            {/* Delete */}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleDelete}
              disabled={deleting}
              title="Hapus akun"
            >
              {deleting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5 text-red-400" />}
            </Button>

            {/* Sync */}
            <Button
              size="sm"
              variant={account.sync_status === "error" ? "destructive" : "outline"}
              onClick={onSync}
              disabled={account.syncing}
              className="gap-1.5 ml-1"
            >
              {account.syncing
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Syncing</>
                : <><RefreshCw className="h-3.5 w-3.5" />Sync</>}
            </Button>
          </div>
        </div>

        {/* Error bar */}
        {account.sync_status === "error" && !account.syncing && (
          <div
            className="px-4 py-2 text-xs flex items-center gap-2"
            style={{ background: "rgba(239,68,68,0.1)", color: "rgb(252,165,165)", borderTop: "1px solid rgba(239,68,68,0.2)" }}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Sync gagal — klik <strong className="mx-1">✏️ Edit</strong> untuk memperbarui API key, lalu sync ulang.
          </div>
        )}

        {/* Inline edit panel */}
        {editOpen && (
          <EditModal
            account={account}
            onClose={() => setEditOpen(false)}
            onSaved={onRefresh}
          />
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ImportPage() {
  const { addToast } = useToast()
  const [accounts, setAccounts] = useState<AccountWithStats[]>([])
  const [loading,  setLoading]  = useState(true)
  const [userId,   setUserId]   = useState<string | null>(null)

  // Load current user id once
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
  }, [])

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data: accs } = await supabase
      .from("exchange_accounts")
      .select("*")
      .order("created_at", { ascending: false })

    if (!accs || accs.length === 0) {
      setAccounts([])
      setLoading(false)
      return
    }

    const { data: counts } = await supabase
      .from("trades")
      .select("exchange_account_id")
      .in("exchange_account_id", accs.map((a) => a.id))

    const countMap: Record<string, number> = {}
    for (const row of counts || []) {
      if (row.exchange_account_id)
        countMap[row.exchange_account_id] = (countMap[row.exchange_account_id] || 0) + 1
    }

    setAccounts((prev) => {
      const prevMap = Object.fromEntries(prev.map((a) => [a.id, a]))
      return accs.map((a) => ({
        ...a,
        trade_count:   countMap[a.id] || 0,
        syncing:       prevMap[a.id]?.syncing       ?? false,
        last_imported: prevMap[a.id]?.last_imported ?? null,
      }))
    })
    setLoading(false)
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  const handleSync = useCallback(async (account: AccountWithStats) => {
    if (account.syncing) return

    setAccounts((prev) =>
      prev.map((a) => a.id === account.id ? { ...a, syncing: true, last_imported: null } : a)
    )

    try {
      let imported = 0
      let message  = ""

      if (account.exchange === "bybit") {
        // ── Bybit: server-side sync (browser fetch ke Bybit diblokir CORS) ──
        const res  = await fetch("/api/sync/bybit", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ account_id: account.id }),
        })
        const data = await res.json()
        if (!res.ok) {
          const detail = data.detail ? ` — ${data.detail}` : ""
          throw new Error((data.error || "Terjadi kesalahan.") + detail)
        }
        imported = data.imported
        message  = data.message
      } else {
        // ── OKX & others: server-side sync ──
        const res  = await fetch("/api/sync/okx", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ account_id: account.id }),
        })
        const data = await res.json()
        if (!res.ok) {
          const detail = data.detail ? ` — ${data.detail}` : ""
          throw new Error((data.error || "Terjadi kesalahan.") + detail)
        }
        imported = data.imported
        message  = data.message
      }

      addToast({
        title:       `Sync ${account.account_name} selesai`,
        description: message,
        variant:     "success",
      })
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === account.id ? { ...a, syncing: false, last_imported: imported } : a
        )
      )
      await loadAccounts()

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan."
      addToast({
        title:       `Sync ${account.account_name} gagal`,
        description: msg,
        variant:     "destructive",
      })
      setAccounts((prev) =>
        prev.map((a) => a.id === account.id ? { ...a, syncing: false } : a)
      )
    }
  }, [addToast, loadAccounts, userId])

  const handleSyncAll = async () => {
    const eligible = accounts.filter((a) => !a.syncing)
    await Promise.all(eligible.map(handleSync))
  }

  const okxAccounts   = accounts.filter((a) => a.exchange === "okx")
  const bybitAccounts = accounts.filter((a) => a.exchange === "bybit")
  const anySyncing    = accounts.some((a) => a.syncing)

  // ---- render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: "var(--muted)" }}>
          <ArrowLeftRight className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
          Belum Ada Exchange Terhubung
        </h2>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Hubungkan OKX atau Bybit melalui Settings, lalu kembali ke sini untuk sync otomatis.
        </p>
        <Link href="/settings">
          <Button className="gap-2 mt-2">
            <Settings className="h-4 w-4" />Buka Settings
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--foreground)" }}>
            <Zap className="h-6 w-6 text-blue-500" />
            Sinkronisasi Exchange
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
            Impor riwayat transaksi otomatis. Data OKX dan Bybit dipisah per akun.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadAccounts} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </Button>
          <Button size="sm" onClick={handleSyncAll} disabled={anySyncing} className="gap-1.5">
            {anySyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync Semua
          </Button>
        </div>
      </div>

      {/* OKX */}
      {okxAccounts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-black flex items-center justify-center">
              <span className="text-white font-black text-[9px]">OKX</span>
            </div>
            <h2 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>OKX</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              {okxAccounts.length} akun
            </span>
          </div>
          {okxAccounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onSync={() => handleSync(acc)}
              onDelete={loadAccounts}
              onRefresh={loadAccounts}
            />
          ))}
        </section>
      )}

      {/* Bybit */}
      {bybitAccounts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-[#F7A600] flex items-center justify-center">
              <span className="text-black font-black text-[9px]">BYB</span>
            </div>
            <h2 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Bybit</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              {bybitAccounts.length} akun
            </span>
          </div>
          {bybitAccounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onSync={() => handleSync(acc)}
              onDelete={loadAccounts}
              onRefresh={loadAccounts}
            />
          ))}
        </section>
      )}

      {/* Footer info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3 items-start">
            <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            <div className="space-y-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <p className="font-medium" style={{ color: "var(--foreground)" }}>Catatan</p>
              <p>Mengambil order <em>filled</em> dalam 90 hari terakhir. Duplikat otomatis dilewati.</p>
              <p>Gunakan API key dengan permission <strong>read-only</strong> saja — tidak perlu akses trade atau withdraw.</p>
              <p>
                Tambah akun baru →{" "}
                <Link href="/settings" className="text-blue-400 hover:underline">
                  Settings <ChevronRight className="inline h-3 w-3" />
                </Link>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
