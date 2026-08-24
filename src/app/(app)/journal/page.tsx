"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/utils"
import { Trade, JournalEntry } from "@/types/database"
import { useToast } from "@/components/ui/toast"
import { BookOpen, Plus, Edit, ChevronRight, Image } from "lucide-react"

const EMOTIONS_BEFORE = ["Calm", "FOMO", "Fear", "Greed", "Revenge", "Overconfidence", "Boredom", "Tired"]
const EMOTIONS_AFTER = ["Satisfied", "Regret", "Angry", "Relief", "Neutral"]
const MARKET_CONDITIONS = ["Trending Up", "Trending Down", "Ranging", "Volatile", "Low Volume", "High Volume"]

export default function JournalPage() {
  const [trades, setTrades] = useState<(Trade & { journal?: JournalEntry })[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [form, setForm] = useState({
    thesis: "",
    entry_reason: "",
    exit_reason: "",
    market_condition: "",
    confidence: "5",
    psychology_before: "",
    psychology_after: "",
    emotional_control: "5",
    discipline: "5",
    patience: "5",
    lesson_learned: "",
    tags: "",
  })
  const [editId, setEditId] = useState<string | null>(null)
  const { addToast } = useToast()

  const loadData = async () => {
    const supabase = createClient()
    const { data: tradesData } = await supabase
      .from("trades")
      .select("*")
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(50)

    const tradeIds = (tradesData || []).map((t: Trade) => t.id)
    const { data: journals } = await supabase
      .from("journal_entries")
      .select("*")
      .in("trade_id", tradeIds)

    const journalMap = new Map((journals || []).map((j: JournalEntry) => [j.trade_id, j]))
    const merged = (tradesData || []).map((t: Trade) => ({
      ...t,
      journal: journalMap.get(t.id) || undefined,
    }))

    setTrades(merged)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const openJournal = (trade: Trade & { journal?: JournalEntry }) => {
    setSelectedTrade(trade)
    if (trade.journal) {
      setForm({
        thesis: trade.journal.thesis || "",
        entry_reason: trade.journal.entry_reason || "",
        exit_reason: trade.journal.exit_reason || "",
        market_condition: trade.journal.market_condition || "",
        confidence: String(trade.journal.confidence || 5),
        psychology_before: trade.journal.psychology_before || "",
        psychology_after: trade.journal.psychology_after || "",
        emotional_control: String(trade.journal.emotional_control || 5),
        discipline: String(trade.journal.discipline || 5),
        patience: String(trade.journal.patience || 5),
        lesson_learned: trade.journal.lesson_learned || "",
        tags: (trade.journal.tags || []).join(", "),
      })
      setEditId(trade.journal.id)
    } else {
      setForm({
        thesis: "", entry_reason: "", exit_reason: "", market_condition: "",
        confidence: "5", psychology_before: "", psychology_after: "",
        emotional_control: "5", discipline: "5", patience: "5",
        lesson_learned: "", tags: "",
      })
      setEditId(null)
    }
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTrade) return
    const supabase = createClient()

    const record = {
      trade_id: selectedTrade.id,
      thesis: form.thesis || null,
      entry_reason: form.entry_reason || null,
      exit_reason: form.exit_reason || null,
      market_condition: form.market_condition || null,
      confidence: parseInt(form.confidence),
      psychology_before: form.psychology_before || null,
      psychology_after: form.psychology_after || null,
      emotional_control: parseInt(form.emotional_control),
      discipline: parseInt(form.discipline),
      patience: parseInt(form.patience),
      lesson_learned: form.lesson_learned || null,
      screenshots: [],
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    }

    if (editId) {
      const { error } = await supabase.from("journal_entries").update(record).eq("id", editId)
      if (error) { addToast({ title: "Error", description: error.message, variant: "destructive" }); return }
      addToast({ title: "Journal diperbarui", variant: "success" })
    } else {
      const { error } = await supabase.from("journal_entries").insert(record)
      if (error) { addToast({ title: "Error", description: error.message, variant: "destructive" }); return }
      addToast({ title: "Journal ditambahkan", variant: "success" })
    }

    setDialogOpen(false)
    loadData()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Trading Journal</h1>

      <div className="grid gap-4">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="h-16 animate-pulse bg-gray-800 rounded" /></CardContent></Card>
          ))
        ) : trades.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Belum ada trade yang selesai</p>
              <p className="text-sm mt-1">Tambahkan trade di halaman Trades terlebih dahulu</p>
            </CardContent>
          </Card>
        ) : (
          trades.map((trade) => (
            <Card key={trade.id} className="hover:border-gray-700 transition-colors cursor-pointer" onClick={() => openJournal(trade)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{trade.symbol}</span>
                        <Badge variant={trade.side === "long" || trade.side === "buy" ? "success" : "destructive"}>
                          {trade.side.toUpperCase()}
                        </Badge>
                        <Badge variant="secondary">{trade.trade_source}</Badge>
                        {trade.journal && <Badge variant="default">Journaled</Badge>}
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        {new Date(trade.closed_at!).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        {trade.journal?.thesis && (
                          <span className="ml-2 text-gray-500">— {trade.journal.thesis.slice(0, 60)}...</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-mono font-bold ${(trade.net_pnl || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatCurrency(trade.net_pnl || 0)}
                    </span>
                    <ChevronRight className="h-5 w-5 text-gray-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)} className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTrade && (
                <div className="flex items-center gap-2">
                  <span>{selectedTrade.symbol}</span>
                  <Badge variant={(selectedTrade.net_pnl || 0) >= 0 ? "success" : "destructive"}>
                    {formatCurrency(selectedTrade.net_pnl || 0)}
                  </Badge>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Trading Thesis</Label>
              <Textarea value={form.thesis} onChange={(e) => setForm({ ...form, thesis: e.target.value })} placeholder="Apa alasan utama masuk trade ini?" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Entry Reason</Label>
                <Textarea value={form.entry_reason} onChange={(e) => setForm({ ...form, entry_reason: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Exit Reason</Label>
                <Textarea value={form.exit_reason} onChange={(e) => setForm({ ...form, exit_reason: e.target.value })} rows={2} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Market Condition</Label>
                <Select value={form.market_condition} onChange={(e) => setForm({ ...form, market_condition: e.target.value })}>
                  <option value="">Select</option>
                  {MARKET_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div>
                <Label>Confidence (1-10)</Label>
                <Input type="number" min="1" max="10" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Psychology Before</Label>
                <Select value={form.psychology_before} onChange={(e) => setForm({ ...form, psychology_before: e.target.value })}>
                  <option value="">Select</option>
                  {EMOTIONS_BEFORE.map((e) => <option key={e} value={e}>{e}</option>)}
                </Select>
              </div>
              <div>
                <Label>Psychology After</Label>
                <Select value={form.psychology_after} onChange={(e) => setForm({ ...form, psychology_after: e.target.value })}>
                  <option value="">Select</option>
                  {EMOTIONS_AFTER.map((e) => <option key={e} value={e}>{e}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Emotional Control (1-10)</Label>
                <Input type="number" min="1" max="10" value={form.emotional_control} onChange={(e) => setForm({ ...form, emotional_control: e.target.value })} />
              </div>
              <div>
                <Label>Discipline (1-10)</Label>
                <Input type="number" min="1" max="10" value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })} />
              </div>
              <div>
                <Label>Patience (1-10)</Label>
                <Input type="number" min="1" max="10" value={form.patience} onChange={(e) => setForm({ ...form, patience: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Lesson Learned</Label>
              <Textarea value={form.lesson_learned} onChange={(e) => setForm({ ...form, lesson_learned: e.target.value })} placeholder="Apa yang bisa dipelajari dari trade ini?" rows={3} />
            </div>
            <div>
              <Label>Tags (pisahkan dengan koma)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="breakout, BTC, momentum" />
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
