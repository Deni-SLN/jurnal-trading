"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils"
import { calculateTradeStats } from "@/lib/calculations"
import { createClient } from "@/lib/supabase/client"
import { Trade, TradeStats } from "@/types/database"
import { useAppStore } from "@/stores/app-store"
import { DollarSign, Target, BarChart3, Activity, Zap } from "lucide-react"
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts"

// ---------------------------------------------------------------------------
// IDR rate — fetched once per session from a free public API
// ---------------------------------------------------------------------------
const IDR_FALLBACK = 16300 // fallback if fetch fails

async function fetchUsdToIdr(): Promise<number> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" })
    const json = await res.json()
    return json?.rates?.IDR ?? IDR_FALLBACK
  } catch {
    return IDR_FALLBACK
  }
}

// ---------------------------------------------------------------------------
// Source tabs config
// ---------------------------------------------------------------------------
const SOURCE_TABS = [
  { id: "all",          label: "Semua" },
  { id: "bybit",        label: "Bybit" },
  { id: "okx",          label: "OKX" },
  { id: "manual_stock", label: "Saham" },
] as const

type SourceTab = (typeof SOURCE_TABS)[number]["id"]

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
function StatCard({
  title, valueUsd, valueIdr, subtitle, icon: Icon, trend,
}: {
  title: string
  valueUsd: string
  valueIdr: string
  subtitle?: string
  icon: React.ElementType
  trend?: "up" | "down" | "neutral"
}) {
  const color =
    trend === "up"   ? "text-emerald-500" :
    trend === "down" ? "text-red-500"     : "text-foreground"
  const bg =
    trend === "up"   ? "bg-emerald-500/10" :
    trend === "down" ? "bg-red-500/10"     : "bg-blue-500/10"
  const iconColor =
    trend === "up"   ? "text-emerald-500" :
    trend === "down" ? "text-red-500"     : "text-blue-500"

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            <p className={`text-xl font-bold mt-0.5 font-mono ${color}`}>{valueUsd}</p>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{valueIdr}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const [allTrades, setAllTrades] = useState<Trade[]>([])
  const [period,    setPeriod]    = useState("30D")
  const [source,    setSource]    = useState<SourceTab>("all")
  const [loading,   setLoading]   = useState(true)
  const [idrRate,   setIdrRate]   = useState(IDR_FALLBACK)
  const { setUser } = useAppStore()

  // Fetch exchange rate once
  useEffect(() => {
    fetchUsdToIdr().then(setIdrRate)
  }, [])

  // Load trades
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single()
        if (profile) setUser(profile)
      }

      const periodDays: Record<string, number> = { "7D": 7, "30D": 30, "90D": 90, "YTD": 365, "ALL": 3650 }
      const days  = periodDays[period] || 30
      const since = new Date()
      since.setDate(since.getDate() - days)

      const { data } = await supabase
        .from("trades")
        .select("*, strategy:strategies(*)")
        .gte("opened_at", since.toISOString())
        .order("opened_at", { ascending: false })

      setAllTrades((data || []) as Trade[])
      setLoading(false)
    }
    loadData()
  }, [period, setUser])

  // Filter by source tab
  const trades = useMemo(() => {
    if (source === "all") return allTrades
    return allTrades.filter((t) => t.trade_source === source)
  }, [allTrades, source])

  const stats = useMemo(() => calculateTradeStats(trades), [trades])

  const equityCurve = useMemo(() =>
    trades
      .filter((t) => t.status === "closed" && t.net_pnl !== null)
      .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime())
      .reduce((acc, t) => {
        const prev = acc[acc.length - 1]?.equity || 0
        acc.push({
          date:   new Date(t.closed_at!).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
          equity: prev + (t.net_pnl || 0),
          pnl:    t.net_pnl || 0,
        })
        return acc
      }, [] as { date: string; equity: number; pnl: number }[]),
  [trades])

  // Helpers
  const usd  = (v: number) => formatCurrency(v, "USD")
  const idr  = (v: number) => formatCurrency(v * idrRate, "IDR")
  const pct  = (v: number) => formatPercent(v).replace("+", "")

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

        {/* Period toggle */}
        <div
          className="flex gap-1 rounded-lg p-1"
          style={{ background: "var(--muted)" }}
        >
          {["7D", "30D", "90D", "YTD", "ALL"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? "bg-blue-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Source tabs */}
      <div className="flex gap-2 flex-wrap">
        {SOURCE_TABS.map((tab) => {
          const active = source === tab.id
          const count  = tab.id === "all"
            ? allTrades.length
            : allTrades.filter((t) => t.trade_source === tab.id).length
          return (
            <button
              key={tab.id}
              onClick={() => setSource(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                active
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-blue-400"
              }`}
            >
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-muted"}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-5"><div className="h-20 animate-pulse rounded-lg bg-muted" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Net PnL"
            valueUsd={usd(stats?.netPnl || 0)}
            valueIdr={idr(stats?.netPnl || 0)}
            icon={DollarSign}
            trend={(stats?.netPnl || 0) >= 0 ? "up" : "down"}
            subtitle={`${stats?.totalTrades || 0} trades`}
          />
          <StatCard
            title="Win Rate"
            valueUsd={pct(stats?.winRate || 0)}
            valueIdr={`${stats?.winningTrades || 0}W / ${stats?.losingTrades || 0}L`}
            icon={Target}
            trend={(stats?.winRate || 0) >= 50 ? "up" : "down"}
          />
          <StatCard
            title="Profit Factor"
            valueUsd={formatNumber(stats?.profitFactor || 0)}
            valueIdr={`Expectancy: ${usd(stats?.expectancy || 0)}`}
            icon={BarChart3}
            trend={(stats?.profitFactor || 0) >= 1 ? "up" : "down"}
          />
          <StatCard
            title="Max Drawdown"
            valueUsd={pct(-(stats?.maxDrawdown || 0))}
            valueIdr={`≈ ${idr(stats?.maxDrawdown || 0)}`}
            icon={Activity}
            trend={(stats?.maxDrawdown || 0) <= 10 ? "up" : "down"}
            subtitle={`Avg R: ${formatNumber(stats?.avgRMultiple || 0)}`}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Equity curve */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Equity Curve</CardTitle>
          </CardHeader>
          <CardContent>
            {equityCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={equityCurve}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--foreground)",
                    }}
                    labelStyle={{ color: "var(--muted-foreground)" }}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#3b82f6" fill="url(#equityGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Belum ada data trade</p>
                  <p className="text-sm mt-1">Tambahkan trade atau sync exchange</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Best Trade",    usdVal: stats?.bestTrade  || 0, positive: true },
              { label: "Worst Trade",   usdVal: stats?.worstTrade || 0, positive: false },
              { label: "Avg Win",       usdVal: stats?.avgWin     || 0, positive: true },
              { label: "Avg Loss",      usdVal: stats?.avgLoss    || 0, positive: false },
              { label: "Gross Profit",  usdVal: stats?.grossProfit|| 0, positive: true },
              { label: "Gross Loss",    usdVal: stats?.grossLoss  || 0, positive: false },
            ].map(({ label, usdVal, positive }) => (
              <div key={label} className="space-y-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className={`text-sm font-mono font-medium ${positive ? "text-emerald-500" : "text-red-500"}`}>
                    {usd(usdVal)}
                  </span>
                </div>
                <div className="flex justify-end">
                  <span className="text-xs font-mono text-muted-foreground">{idr(usdVal)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent trades */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Recent Trades</CardTitle>
          <Link href="/trades">
            <Button variant="ghost" size="sm">Lihat Semua</Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {trades.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Net PnL (USD)</TableHead>
                  <TableHead className="text-right">Net PnL (IDR)</TableHead>
                  <TableHead className="text-right">Tanggal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.slice(0, 10).map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell className="font-medium font-mono">{trade.symbol}</TableCell>
                    <TableCell>
                      <Badge variant={trade.side === "long" || trade.side === "buy" ? "success" : "destructive"}>
                        {trade.side.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{trade.trade_source.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatNumber(trade.entry_price, 4)}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${(trade.net_pnl || 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {trade.net_pnl !== null ? usd(trade.net_pnl) : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${(trade.net_pnl || 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {trade.net_pnl !== null ? idr(trade.net_pnl) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {new Date(trade.opened_at).toLocaleDateString("id-ID")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Belum ada trade di periode ini</p>
              <p className="text-sm mt-1">
                <Link href="/trades" className="text-blue-500 hover:underline">Tambah trade</Link>
                {" "}atau{" "}
                <Link href="/import" className="text-blue-500 hover:underline">sync exchange</Link>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
