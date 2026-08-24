"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/toast"
import { useAppStore } from "@/stores/app-store"
import { Shield } from "lucide-react"

export default function RiskPage() {
  const { user, setUser } = useAppStore()
  const [form, setForm] = useState({
    max_risk_per_trade: "1",
    max_daily_loss: "3",
    max_drawdown: "10",
    max_leverage: "5",
    max_open_positions: "5",
  })
  const [loading, setLoading] = useState(false)
  const { addToast } = useToast()

  useEffect(() => {
    if (user) {
      setForm({
        max_risk_per_trade: String(user.max_risk_per_trade ?? 1),
        max_daily_loss: String(user.max_daily_loss ?? 3),
        max_drawdown: String(user.max_drawdown ?? 10),
        max_leverage: String(user.max_leverage ?? 5),
        max_open_positions: String(user.max_open_positions ?? 5),
      })
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    const record = {
      max_risk_per_trade: parseFloat(form.max_risk_per_trade),
      max_daily_loss: parseFloat(form.max_daily_loss),
      max_drawdown: parseFloat(form.max_drawdown),
      max_leverage: parseFloat(form.max_leverage),
      max_open_positions: parseInt(form.max_open_positions),
    }

    const { error } = await supabase.from("users").update(record).eq("id", authUser.id)
    if (error) {
      addToast({ title: "Error", description: error.message, variant: "destructive" })
    } else {
      addToast({ title: "Risk rules updated", variant: "success" })
      const { data } = await supabase.from("users").select("*").eq("id", authUser.id).single()
      if (data) setUser(data)
    }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="h-6 w-6 text-blue-500" />
          Risk Engine
        </h1>
        <p className="text-gray-400 text-sm mt-1">Konfigurasi batas risiko trading Anda. Sistem akan memberikan peringatan jika batas ini dilanggar.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Max Risk per Trade (%)</Label>
                <Input type="number" step="any" value={form.max_risk_per_trade} onChange={(e) => setForm({ ...form, max_risk_per_trade: e.target.value })} required />
              </div>
              <div>
                <Label>Max Daily Loss Limit (%)</Label>
                <Input type="number" step="any" value={form.max_daily_loss} onChange={(e) => setForm({ ...form, max_daily_loss: e.target.value })} required />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Max Drawdown (%)</Label>
                <Input type="number" step="any" value={form.max_drawdown} onChange={(e) => setForm({ ...form, max_drawdown: e.target.value })} required />
              </div>
              <div>
                <Label>Max Leverage</Label>
                <Input type="number" step="any" value={form.max_leverage} onChange={(e) => setForm({ ...form, max_leverage: e.target.value })} required />
              </div>
              <div>
                <Label>Max Open Positions</Label>
                <Input type="number" value={form.max_open_positions} onChange={(e) => setForm({ ...form, max_open_positions: e.target.value })} required />
              </div>
            </div>

            <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save Risk Rules"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
