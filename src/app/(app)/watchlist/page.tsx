"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import { WatchlistItem, WatchlistStatus } from "@/types/database"
import { useToast } from "@/components/ui/toast"
import { Plus, Eye, Edit, Trash2 } from "lucide-react"

const defaultForm = {
  symbol: "",
  thesis: "",
  support_levels: "",
  resistance_levels: "",
  target_price: "",
  stop_loss: "",
  setup_type: "",
  status: "watching",
  notes: "",
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [editId, setEditId] = useState<string | null>(null)
  const { addToast } = useToast()

  const loadData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from("watchlists").select("*").order("created_at", { ascending: false })
    setWatchlist((data || []) as WatchlistItem[])
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
      symbol: form.symbol.toUpperCase(),
      thesis: form.thesis || null,
      support_levels: form.support_levels ? form.support_levels.split(",").map(Number).filter((v) => !isNaN(v)) : [],
      resistance_levels: form.resistance_levels ? form.resistance_levels.split(",").map(Number).filter((v) => !isNaN(v)) : [],
      target_price: form.target_price ? parseFloat(form.target_price) : null,
      stop_loss: form.stop_loss ? parseFloat(form.stop_loss) : null,
      setup_type: form.setup_type || null,
      status: form.status as WatchlistStatus,
      notes: form.notes || null,
    }

    if (editId) {
      const { error } = await supabase.from("watchlists").update(record).eq("id", editId)
      if (error) { addToast({ title: "Error", description: error.message, variant: "destructive" }); return }
      addToast({ title: "Watchlist diperbarui" })
    } else {
      const { error } = await supabase.from("watchlists").insert(record)
      if (error) { addToast({ title: "Error", description: error.message, variant: "destructive" }); return }
      addToast({ title: "Watchlist ditambahkan", variant: "success" })
    }

    setDialogOpen(false)
    setForm(defaultForm)
    setEditId(null)
    loadData()
  }

  const handleEdit = (item: WatchlistItem) => {
    setForm({
      symbol: item.symbol,
      thesis: item.thesis || "",
      support_levels: (item.support_levels || []).join(", "),
      resistance_levels: (item.resistance_levels || []).join(", "),
      target_price: item.target_price ? String(item.target_price) : "",
      stop_loss: item.stop_loss ? String(item.stop_loss) : "",
      setup_type: item.setup_type || "",
      status: item.status,
      notes: item.notes || "",
    })
    setEditId(item.id)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus item ini?")) return
    const supabase = createClient()
    await supabase.from("watchlists").delete().eq("id", id)
    addToast({ title: "Item dihapus" })
    loadData()
  }

  const getStatusBadge = (status: WatchlistStatus) => {
    switch (status) {
      case "watching": return <Badge variant="secondary">Watching</Badge>
      case "setup_forming": return <Badge variant="warning">Setup Forming</Badge>
      case "ready": return <Badge variant="default">Ready</Badge>
      case "entered": return <Badge variant="success">Entered</Badge>
      case "completed": return <Badge variant="outline">Completed</Badge>
      case "invalidated": return <Badge variant="destructive">Invalidated</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Watchlist</h1>
        <Button onClick={() => { setForm(defaultForm); setEditId(null); setDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Setup</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Support</TableHead>
                <TableHead>Resistance</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Stop Loss</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-500">Loading...</TableCell></TableRow>
              ) : watchlist.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                    <Eye className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Watchlist kosong</p>
                  </TableCell>
                </TableRow>
              ) : (
                watchlist.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium font-mono">{item.symbol}</TableCell>
                    <TableCell>{item.setup_type || "-"}</TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell className="font-mono text-sm">{(item.support_levels || []).join(", ") || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{(item.resistance_levels || []).join(", ") || "-"}</TableCell>
                    <TableCell className="text-right font-mono">{item.target_price || "-"}</TableCell>
                    <TableCell className="text-right font-mono">{item.stop_loss || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)} className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Item" : "Add Watchlist Item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Symbol</Label>
              <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="BBCA, BTCUSDT" required />
            </div>
            <div>
              <Label>Setup Type</Label>
              <Input value={form.setup_type} onChange={(e) => setForm({ ...form, setup_type: e.target.value })} placeholder="e.g. Breakout, Pullback" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="watching">Watching</option>
                <option value="setup_forming">Setup Forming</option>
                <option value="ready">Ready</option>
                <option value="entered">Entered</option>
                <option value="completed">Completed</option>
                <option value="invalidated">Invalidated</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Support Levels (koma)</Label>
                <Input value={form.support_levels} onChange={(e) => setForm({ ...form, support_levels: e.target.value })} placeholder="9200, 9100" />
              </div>
              <div>
                <Label>Resistance Levels (koma)</Label>
                <Input value={form.resistance_levels} onChange={(e) => setForm({ ...form, resistance_levels: e.target.value })} placeholder="9400, 9500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target Price</Label>
                <Input type="number" step="any" value={form.target_price} onChange={(e) => setForm({ ...form, target_price: e.target.value })} />
              </div>
              <div>
                <Label>Stop Loss</Label>
                <Input type="number" step="any" value={form.stop_loss} onChange={(e) => setForm({ ...form, stop_loss: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Thesis / Notes</Label>
              <Textarea value={form.thesis} onChange={(e) => setForm({ ...form, thesis: e.target.value })} rows={3} />
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
