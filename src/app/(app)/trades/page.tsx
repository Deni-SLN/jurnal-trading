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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils"
import { calculateStockPnl, calculateRMultiple } from "@/lib/calculations"
import { Trade } from "@/types/database"
import { useToast } from "@/components/ui/toast"
import { Plus, Search, Filter, Trash2, Edit, ArrowUpDown } from "lucide-react"

interface TradeFormData {
  symbol: string
  side: string
  market_type: string
  trade_source: string
  entry_price: string
  exit_price: string
  quantity: string
  leverage: string
  trading_fee: string
  funding_fee: string
  stop_loss: string
  take_profit: string
  strategy_id: string
  opened_at: string
  closed_at: string
}

const defaultForm: TradeFormData = {
  symbol: "",
  side: "buy",
  market_type: "stock",
  trade_source: "manual_stock",
  entry_price: "",
  exit_price: "",
  quantity: "",
  leverage: "1",
  trading_fee: "0",
  funding_fee: "0",
  stop_loss: "",
  take_profit: "",
  strategy_id: "",
  opened_at: new Date().toISOString().slice(0, 16),
  closed_at: "",
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [strategies, setStrategies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<TradeFormData>(defaultForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterSource, setFilterSource] = useState("all")
  const [tab, setTab] = useState("all")
  const { addToast } = useToast()

  const loadTrades = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("trades")
      .select("*, strategy:strategies(id, name)")
      .order("opened_at", { ascending: false })
    setTrades((data || []) as Trade[])

    const { data: strats } = await supabase
      .from("strategies")
      .select("id, name")
      .eq("is_active", true)
    setStrategies(strats || [])
    setLoading(false)
  }

  useEffect(() => {
    loadTrades()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const entry = parseFloat(form.entry_price)
    const exit = form.exit_price ? parseFloat(form.exit_price) : null
    const qty = parseFloat(form.quantity)
    const fee = parseFloat(form.trading_fee) || 0
    const funding = parseFloat(form.funding_fee) || 0
    const leverage = parseFloat(form.leverage) || 1
    const sl = form.stop_loss ? parseFloat(form.stop_loss) : null

    let grossPnl: number | null = null
    let netPnl: number | null = null
    let pnlPercent: number | null = null
    let rMultiple: number | null = null
    let status: "open" | "closed" = "open"
    let durationSeconds: number | null = null

    if (exit !== null) {
      if (form.market_type === "stock") {
        const calc = calculateStockPnl(entry, exit, qty, fee)
        grossPnl = calc.grossPnl
        netPnl = calc.netPnl
        pnlPercent = calc.returnPct
      } else {
        const multiplier = (form.side === "long" || form.side === "buy") ? 1 : -1
        grossPnl = (exit - entry) * qty * multiplier
        netPnl = grossPnl - fee - funding
        const margin = (entry * qty) / leverage
        pnlPercent = margin > 0 ? (netPnl / margin) * 100 : 0
      }
      if (sl) {
        rMultiple = calculateRMultiple(netPnl!, entry, sl, form.market_type === "stock" ? qty * 100 : qty)
      }
      status = "closed"
      if (form.closed_at) {
        durationSeconds = Math.floor((new Date(form.closed_at).getTime() - new Date(form.opened_at).getTime()) / 1000)
      }
    }

    const record = {
      user_id: user.id,
      symbol: form.symbol.toUpperCase(),
      side: form.side,
      market_type: form.market_type,
      trade_source: form.trade_source,
      entry_price: entry,
      exit_price: exit,
      quantity: qty,
      leverage,
      margin: (entry * qty) / leverage,
      gross_pnl: grossPnl,
      trading_fee: fee,
      funding_fee: funding,
      net_pnl: netPnl,
      pnl_percent: pnlPercent,
      r_multiple: rMultiple,
      duration_seconds: durationSeconds,
      strategy_id: form.strategy_id || null,
      stop_loss: sl,
      take_profit: form.take_profit ? parseFloat(form.take_profit) : null,
      status,
      opened_at: new Date(form.opened_at).toISOString(),
      closed_at: form.closed_at ? new Date(form.closed_at).toISOString() : null,
    }

    if (editId) {
      const { error } = await supabase.from("trades").update(record).eq("id", editId)
      if (error) { addToast({ title: "Error", description: error.message, variant: "destructive" }); return }
      addToast({ title: "Trade diperbarui", variant: "success" })
    } else {
      const { error } = await supabase.from("trades").insert(record)
      if (error) { addToast({ title: "Error", description: error.message, variant: "destructive" }); return }
      addToast({ title: "Trade ditambahkan", variant: "success" })
    }

    setDialogOpen(false)
    setForm(defaultForm)
    setEditId(null)
    loadTrades()
  }

  const handleEdit = (trade: Trade) => {
    setForm({
      symbol: trade.symbol,
      side: trade.side,
      market_type: trade.market_type,
      trade_source: trade.trade_source,
      entry_price: String(trade.entry_price),
      exit_price: trade.exit_price ? String(trade.exit_price) : "",
      quantity: String(trade.quantity),
      leverage: String(trade.leverage),
      trading_fee: String(trade.trading_fee),
      funding_fee: String(trade.funding_fee),
      stop_loss: trade.stop_loss ? String(trade.stop_loss) : "",
      take_profit: trade.take_profit ? String(trade.take_profit) : "",
      strategy_id: trade.strategy_id || "",
      opened_at: trade.opened_at.slice(0, 16),
      closed_at: trade.closed_at ? trade.closed_at.slice(0, 16) : "",
    })
    setEditId(trade.id)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus trade ini?")) return
    const supabase = createClient()
    await supabase.from("trades").delete().eq("id", id)
    addToast({ title: "Trade dihapus" })
    loadTrades()
  }

  const filteredTrades = trades.filter((t) => {
    if (search && !t.symbol.toLowerCase().includes(search.toLowerCase())) return false
    if (filterSource !== "all" && t.trade_source !== filterSource) return false
    if (tab === "open" && t.status !== "open") return false
    if (tab === "closed" && t.status !== "closed") return false
    if (tab === "stock" && t.market_type !== "stock") return false
    if (tab === "crypto" && !["spot", "futures", "perpetual"].includes(t.market_type)) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Trades</h1>
        <Button onClick={() => { setForm(defaultForm); setEditId(null); setDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Trade
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Cari symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="w-40">
          <option value="all">All Sources</option>
          <option value="manual_stock">Saham</option>
          <option value="okx">OKX</option>
          <option value="bybit">Bybit</option>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
          <TabsTrigger value="crypto">Crypto</TabsTrigger>
          <TabsTrigger value="stock">Saham</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">Exit</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Net PnL</TableHead>
                    <TableHead className="text-right">Return</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrades.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12 text-gray-500">
                        {loading ? "Loading..." : "Tidak ada trade ditemukan"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTrades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell className="font-medium font-mono">{trade.symbol}</TableCell>
                        <TableCell>
                          <Badge variant={trade.side === "long" || trade.side === "buy" ? "success" : "destructive"}>
                            {trade.side.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell><Badge variant="outline">{trade.market_type}</Badge></TableCell>
                        <TableCell><Badge variant="secondary">{trade.trade_source}</Badge></TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(trade.entry_price, 4)}</TableCell>
                        <TableCell className="text-right font-mono">{trade.exit_price ? formatNumber(trade.exit_price, 4) : "-"}</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(trade.quantity, 4)}</TableCell>
                        <TableCell className={`text-right font-mono ${(trade.net_pnl || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {trade.net_pnl !== null ? formatCurrency(trade.net_pnl) : "-"}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${(trade.pnl_percent || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {trade.pnl_percent !== null ? formatPercent(trade.pnl_percent) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-gray-400 text-sm">
                          {new Date(trade.opened_at).toLocaleDateString("id-ID")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(trade)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(trade.id)}>
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
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)} className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Trade" : "Add New Trade"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Symbol</Label>
                <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="BBCA, BTCUSDT" required />
              </div>
              <div>
                <Label>Market Type</Label>
                <Select value={form.market_type} onChange={(e) => setForm({
                  ...form,
                  market_type: e.target.value,
                  trade_source: e.target.value === "stock" ? "manual_stock" : form.trade_source,
                  side: e.target.value === "stock" ? "buy" : form.side,
                })}>
                  <option value="stock">Saham</option>
                  <option value="spot">Crypto Spot</option>
                  <option value="futures">Crypto Futures</option>
                  <option value="perpetual">Crypto Perpetual</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Side</Label>
                <Select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}>
                  {form.market_type === "stock" ? (
                    <>
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </>
                  ) : (
                    <>
                      <option value="long">Long</option>
                      <option value="short">Short</option>
                    </>
                  )}
                </Select>
              </div>
              <div>
                <Label>Source</Label>
                <Select value={form.trade_source} onChange={(e) => setForm({ ...form, trade_source: e.target.value })}>
                  <option value="manual_stock">Manual (Saham)</option>
                  <option value="okx">OKX</option>
                  <option value="bybit">Bybit</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Entry Price</Label>
                <Input type="number" step="any" value={form.entry_price} onChange={(e) => setForm({ ...form, entry_price: e.target.value })} required />
              </div>
              <div>
                <Label>Exit Price (kosongkan jika masih open)</Label>
                <Input type="number" step="any" value={form.exit_price} onChange={(e) => setForm({ ...form, exit_price: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{form.market_type === "stock" ? "Lot" : "Quantity"}</Label>
                <Input type="number" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
              </div>
              <div>
                <Label>Leverage</Label>
                <Input type="number" step="any" value={form.leverage} onChange={(e) => setForm({ ...form, leverage: e.target.value })} />
              </div>
              <div>
                <Label>Trading Fee</Label>
                <Input type="number" step="any" value={form.trading_fee} onChange={(e) => setForm({ ...form, trading_fee: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Stop Loss</Label>
                <Input type="number" step="any" value={form.stop_loss} onChange={(e) => setForm({ ...form, stop_loss: e.target.value })} />
              </div>
              <div>
                <Label>Take Profit</Label>
                <Input type="number" step="any" value={form.take_profit} onChange={(e) => setForm({ ...form, take_profit: e.target.value })} />
              </div>
              <div>
                <Label>Funding Fee</Label>
                <Input type="number" step="any" value={form.funding_fee} onChange={(e) => setForm({ ...form, funding_fee: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Entry Date</Label>
                <Input type="datetime-local" value={form.opened_at} onChange={(e) => setForm({ ...form, opened_at: e.target.value })} required />
              </div>
              <div>
                <Label>Exit Date</Label>
                <Input type="datetime-local" value={form.closed_at} onChange={(e) => setForm({ ...form, closed_at: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Strategy</Label>
              <Select value={form.strategy_id} onChange={(e) => setForm({ ...form, strategy_id: e.target.value })}>
                <option value="">No Strategy</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
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
