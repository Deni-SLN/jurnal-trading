"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/toast"
import { useAppStore } from "@/stores/app-store"
import { Settings, Trash2 } from "lucide-react"
import { ExchangeAccount } from "@/types/database"

interface ExchangeAccountForm {
  exchange: "okx" | "bybit"
  account_name: string
  api_key: string
  api_secret: string
  passphrase?: string
}

export default function SettingsPage() {
  const { user, setUser } = useAppStore()
  const [profileForm, setProfileForm] = useState({ full_name: "", base_currency: "USD", timezone: "Asia/Jakarta" })
  const [exchangeForm, setExchangeForm] = useState<ExchangeAccountForm>({ exchange: "okx", account_name: "", api_key: "", api_secret: "", passphrase: "" })
  const [exchangeAccounts, setExchangeAccounts] = useState<ExchangeAccount[]>([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingExchange, setSavingExchange] = useState(false)
  const { addToast } = useToast()

  const loadExchangeAccounts = async () => {
    const supabase = createClient()
    const { data } = await supabase.from("exchange_accounts").select("*").order("created_at", { ascending: false })
    setExchangeAccounts(data || [])
  }

  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || "",
        base_currency: user.base_currency || "USD",
        timezone: user.timezone || "Asia/Jakarta",
      })
    }
  }, [user])

  useEffect(() => {
    loadExchangeAccounts()
  }, [])

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    const { error } = await supabase.from("users").update(profileForm).eq("id", authUser.id)
    if (error) {
      addToast({ title: "Error", description: error.message, variant: "destructive" })
    } else {
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

    const record = {
      user_id: authUser.id,
      exchange: exchangeForm.exchange,
      account_name: exchangeForm.account_name,
      api_key_encrypted: exchangeForm.api_key,
      api_secret_encrypted: exchangeForm.api_secret,
      passphrase_encrypted: exchangeForm.passphrase || null,
      sync_status: "connected",
    }

    const { error } = await supabase.from("exchange_accounts").insert(record)
    if (error) {
      addToast({ title: "Error", description: error.message, variant: "destructive" })
    } else {
      addToast({ title: "Exchange terhubung", variant: "success" })
      setExchangeForm({ exchange: "okx", account_name: "", api_key: "", api_secret: "", passphrase: "" })
      loadExchangeAccounts()
    }
    setSavingExchange(false)
  }

  const handleExchangeDelete = async (id: string) => {
    if (!confirm("Putuskan koneksi exchange ini?")) return
    const supabase = createClient()
    await supabase.from("exchange_accounts").delete().eq("id", id)
    addToast({ title: "Koneksi exchange diputuskan" })
    loadExchangeAccounts()
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2">
        <Settings className="h-6 w-6 text-blue-500" />
        Settings
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profil & Preferensi</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <div>
                <Label>Nama Lengkap</Label>
                <Input value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} required />
              </div>
              <div>
                <Label>Mata Uang Utama</Label>
                <Select value={profileForm.base_currency} onChange={(e) => setProfileForm({ ...profileForm, base_currency: e.target.value })}>
                  <option value="USD">USD</option>
                  <option value="IDR">IDR</option>
                </Select>
              </div>
              <div>
                <Label>Timezone</Label>
                <Input value={profileForm.timezone} onChange={(e) => setProfileForm({ ...profileForm, timezone: e.target.value })} required />
              </div>
              <Button type="submit" disabled={savingProfile}>{savingProfile ? "Saving..." : "Save Profile"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Koneksi Exchange (OKX / Bybit)</CardTitle>
            <CardDescription>Hubungkan API key (read-only) untuk sinkronisasi otomatis.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleExchangeSave} className="space-y-4">
              <div>
                <Label>Exchange</Label>
                <Select value={exchangeForm.exchange} onChange={(e) => setExchangeForm({ ...exchangeForm, exchange: e.target.value as "okx" | "bybit" })}>
                  <option value="okx">OKX</option>
                  <option value="bybit">Bybit</option>
                </Select>
              </div>
              <div>
                <Label>Nama Akun (bebas)</Label>
                <Input value={exchangeForm.account_name} onChange={(e) => setExchangeForm({ ...exchangeForm, account_name: e.target.value })} placeholder="e.g. My OKX Account" required />
              </div>
              <div>
                <Label>API Key</Label>
                <Input value={exchangeForm.api_key} onChange={(e) => setExchangeForm({ ...exchangeForm, api_key: e.target.value })} required />
              </div>
              <div>
                <Label>API Secret</Label>
                <Input type="password" value={exchangeForm.api_secret} onChange={(e) => setExchangeForm({ ...exchangeForm, api_secret: e.target.value })} required />
              </div>
              {exchangeForm.exchange === "okx" && (
                <div>
                  <Label>Passphrase</Label>
                  <Input type="password" value={exchangeForm.passphrase} onChange={(e) => setExchangeForm({ ...exchangeForm, passphrase: e.target.value })} required />
                </div>
              )}
              <Button type="submit" disabled={savingExchange}>{savingExchange ? "Connecting..." : "Connect Exchange"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected Exchanges</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exchange</TableHead>
                <TableHead>Nama Akun</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exchangeAccounts.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-gray-500">Belum ada exchange terhubung</TableCell></TableRow>
              ) : (
                exchangeAccounts.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-bold capitalize">{acc.exchange}</TableCell>
                    <TableCell>{acc.account_name}</TableCell>
                    <TableCell>
                      <Badge variant={acc.sync_status === "connected" ? "success" : "destructive"}>
                        {acc.sync_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleExchangeDelete(acc.id)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
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
  )
}
