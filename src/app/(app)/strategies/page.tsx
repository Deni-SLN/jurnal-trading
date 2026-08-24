"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { Strategy } from "@/types/database"
import { useToast } from "@/components/ui/toast"
import { Plus, Target, Edit, Trash2, Tag } from "lucide-react"

const defaultForm = {
  name: "",
  description: "",
  market: "Both",
  timeframe: "",
  entry_rules: "",
  exit_rules: "",
  sl_rules: "",
  risk_rules: "",
  tags: "",
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [editId, setEditId] = useState<string | null>(null)
  const { addToast } = useToast()

  const loadData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from("strategies").select("*").order("created_at", { ascending: false })
    setStrategies((data || []) as Strategy[])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const record = {
      user_id: user.id,
      name: form.name,
      description: form.description || null,
      market: form.market,
      timeframe: form.timeframe || null,
      entry_rules: form.entry_rules || null,
      exit_rules: form.exit_rules || null,
      sl_rules: form.sl_rules || null,
      risk_rules: form.risk_rules || null,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    }

    if (editId) {
      const { error } = await supabase.from("strategies").update(record).eq("id", editId)
      if (error) { addToast({ title: "Error", description: error.message, variant: "destructive" }); return }
      addToast({ title: "Strategi diperbarui", variant: "success" })
    } else {
      const { error } = await supabase.from("strategies").insert(record)
      if (error) { addToast({ title: "Error", description: error.message, variant: "destructive" }); return }
      addToast({ title: "Strategi ditambahkan", variant: "success" })
    }

    setDialogOpen(false)
    setForm(defaultForm)
    setEditId(null)
    loadData()
  }

  const handleEdit = (strategy: Strategy) => {
    setForm({
      name: strategy.name,
      description: strategy.description || "",
      market: strategy.market || "Both",
      timeframe: strategy.timeframe || "",
      entry_rules: strategy.entry_rules || "",
      exit_rules: strategy.exit_rules || "",
      sl_rules: strategy.sl_rules || "",
      risk_rules: strategy.risk_rules || "",
      tags: (strategy.tags || []).join(", "),
    })
    setEditId(strategy.id)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus strategi ini?")) return
    const supabase = createClient()
    await supabase.from("strategies").delete().eq("id", id)
    addToast({ title: "Strategi dihapus" })
    loadData()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Strategies</h1>
        <Button onClick={() => { setForm(defaultForm); setEditId(null); setDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Strategy
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><div className="h-24 animate-pulse bg-gray-800 rounded" /></CardContent></Card>
          ))
        ) : strategies.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Belum ada strategi trading</p>
            <p className="text-sm mt-1">Tambahkan strategi pertama Anda</p>
          </div>
        ) : (
          strategies.map((strategy) => (
            <Card key={strategy.id} className="relative group">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg text-white">{strategy.name}</CardTitle>
                    <CardDescription>{strategy.market} • {strategy.timeframe || "Any TF"}</CardDescription>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(strategy)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(strategy.id)}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {strategy.description && <p className="text-sm text-gray-400">{strategy.description}</p>}
                <div className="flex flex-wrap gap-1">
                  {strategy.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      <Tag className="h-3 w-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)} className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Strategy" : "Add Strategy"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <Label>Timeframe</Label>
                <Input value={form.timeframe} onChange={(e) => setForm({ ...form, timeframe: e.target.value })} placeholder="e.g. 1H, 4H, Daily" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Market</Label>
                <Input value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} placeholder="Crypto, Stocks, Both" />
              </div>
              <div>
                <Label>Tags (pisahkan koma)</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="breakout, support" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Entry Rules</Label>
              <Textarea value={form.entry_rules} onChange={(e) => setForm({ ...form, entry_rules: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Exit Rules</Label>
              <Textarea value={form.exit_rules} onChange={(e) => setForm({ ...form, exit_rules: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Stop Loss Rules</Label>
                <Textarea value={form.sl_rules} onChange={(e) => setForm({ ...form, sl_rules: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Risk Rules</Label>
                <Textarea value={form.risk_rules} onChange={(e) => setForm({ ...form, risk_rules: e.target.value })} rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button type="submit">{editId ? "Update" : "Simpan"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
