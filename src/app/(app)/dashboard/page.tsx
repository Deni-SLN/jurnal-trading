"use client"

import { useState, useEffect } from "react"
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
import {
  DollarSign,
  Target,
  BarChart3,
  Activity,
  Zap,
} from "lucide-react"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"

function StatCard({ title, value, subtitle, icon: Icon, trend }: {
  title: string
  value: string
  subtitle?: string
  icon: React.ElementType
  trend?: "up" | "down" | "neutral"
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">{title}</p>
            <p className={`text-2xl font-bold mt-1 font-mono ${
              trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-gray-100"
            }`}>
              {value}
            </p>
            {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
            trend === "up" ? "bg-emerald-500/10" : trend === "down" ? "bg-red-500/10" : "bg-blue-500/10"
          }`}>
            <Icon className={`h-5 w-5 ${
              trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-blue-400"
            }`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [stats, setStats] = useState<TradeStats | null>(null)
  const [period, setPeriod] = useState("30D")
  const [loading, setLoading] = useState(true)
  const { setUser } = useAppStore()

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single()
        if (profile) setUser(profile)
      }

      const periodDays: Record<string, number> = { "7D": 7, "30D": 30, "90D": 90, "YTD": 365, "ALL": 3650 }
      const days = periodDays[period] || 30
      const since = new Date()
      since.setDate(since.getDate() - days)

      const { data } = await supabase
        .from("trades")
        .select("*, strategy:strategies(*)")
        .gte("opened_at", since.toISOString())
        .order("opened_at", { ascending: false })

      const tradeData = (data || []) as Trade[]
      setTrades(tradeData)
      setStats(calculateTradeStats(tradeData))
      setLoading(false)
    }
    loadData()
  }, [period, setUser])

  const equityCurve = trades
    .filter(t => t.status === "closed" && t.net_pnl !== null)
    .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime())
    .reduce((acc, t) => {
      const prev = acc[acc.length - 1]?.equity || 0
      acc.push({
        date: new Date(t.closed_at!).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
        equity: prev + (t.net_pnl || 0),
        pnl: t.net_pnl || 0,
      })
      return acc
    }, [] as { date: string; equity: number; pnl: number }[])

  const recentTrades = trades.slice(0, 10)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><div className="h-16 animate-pulse bg-gray-800 rounded" /></CardContent></Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1">
          {["7D", "30D", "90D", "YTD", "ALL"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Net PnL"
          value={formatCurrency(stats?.netPnl || 0)}
          icon={DollarSign}
          trend={(stats?.netPnl || 0) >= 0 ? "up" : "down"}
          subtitle={`${stats?.totalTrades || 0} trades`}
        />
        <StatCard
          title="Win Rate"
          value={formatPercent(stats?.winRate || 0).replace("+", "")}
          icon={Target}
          trend={(stats?.winRate || 0) >= 50 ? "up" : "down"}
          subtitle={`${stats?.winningTrades || 0}W / ${stats?.losingTrades || 0}L`}
        />
        <StatCard
          title="Profit Factor"
          value={formatNumber(stats?.profitFactor || 0)}
          icon={BarChart3}
          trend={(stats?.profitFactor || 0) >= 1 ? "up" : "down"}
          subtitle={`Expectancy: ${formatCurrency(stats?.expectancy || 0)}`}
        />
        <StatCard
          title="Max Drawdown"
          value={formatPercent(-(stats?.maxDrawdown || 0))}
          icon={Activity}
          trend={(stats?.maxDrawdown || 0) <= 10 ? "up" : "down"}
          subtitle={`Avg R: ${formatNumber(stats?.avgRMultiple || 0)}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Equity Curve</CardTitle>
          </CardHeader>
          <CardContent>
            {equityCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={equityCurve}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#3b82f6" fill="url(#equityGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Belum ada data trade</p>
                  <p className="text-sm mt-1">Tambahkan trade pertama Anda</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Best Trade</span>
              <span className="text-sm font-mono text-emerald-400">{formatCurrency(stats?.bestTrade || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Worst Trade</span>
              <span className="text-sm font-mono text-red-400">{formatCurrency(stats?.worstTrade || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Avg Win</span>
              <span className="text-sm font-mono text-emerald-400">{formatCurrency(stats?.avgWin || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Avg Loss</span>
              <span className="text-sm font-mono text-red-400">{formatCurrency(stats?.avgLoss || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Gross Profit</span>
              <span className="text-sm font-mono text-emerald-400">{formatCurrency(stats?.grossProfit || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Gross Loss</span>
              <span className="text-sm font-mono text-red-400">{formatCurrency(stats?.grossLoss || 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Trades</CardTitle>
          <Link href="/trades">
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentTrades.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Exit</TableHead>
                  <TableHead className="text-right">Net PnL</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTrades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell className="font-medium font-mono">{trade.symbol}</TableCell>
                    <TableCell>
                      <Badge variant={trade.side === "long" || trade.side === "buy" ? "success" : "destructive"}>
                        {trade.side.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{trade.trade_source}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(trade.entry_price, 4)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {trade.exit_price ? formatNumber(trade.exit_price, 4) : "-"}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${
                      (trade.net_pnl || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {trade.net_pnl !== null ? formatCurrency(trade.net_pnl) : "-"}
                    </TableCell>
                    <TableCell className="text-right text-gray-400 text-sm">
                      {new Date(trade.opened_at).toLocaleDateString("id-ID")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Zap className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Belum ada trade</p>
              <p className="text-sm mt-1">
                <a href="/trades" className="text-blue-400 hover:underline">Tambah trade baru</a>
                {" "}atau{" "}
                <a href="/settings" className="text-blue-400 hover:underline">hubungkan exchange</a>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
