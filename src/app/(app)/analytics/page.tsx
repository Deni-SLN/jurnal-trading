"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { calculateTradeStats } from "@/lib/calculations"
import { Trade, TradeStats } from "@/types/database"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"

export default function AnalyticsPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [stats, setStats] = useState<TradeStats | null>(null)
  const [period, setPeriod] = useState("ALL")
  const [tab, setTab] = useState("overview")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const periodDays: Record<string, number> = { "7D": 7, "30D": 30, "90D": 90, "YTD": 365, "ALL": 3650 }
      const days = periodDays[period] || 3650
      const since = new Date()
      since.setDate(since.getDate() - days)

      const { data } = await supabase
        .from("trades")
        .select("*, strategy:strategies(id, name)")
        .gte("opened_at", since.toISOString())
        .order("opened_at", { ascending: true })

      const tradeData = (data || []) as Trade[]
      setTrades(tradeData)
      setStats(calculateTradeStats(tradeData))
      setLoading(false)
    }
    load()
  }, [period])

  const closedTrades = trades.filter(t => t.status === "closed" && t.net_pnl !== null)

  const equityCurve = closedTrades.reduce((acc, t) => {
    const prev = acc[acc.length - 1]?.equity || 0
    acc.push({
      date: new Date(t.closed_at!).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
      equity: prev + (t.net_pnl || 0),
    })
    return acc
  }, [] as { date: string; equity: number }[])

  const drawdownData = (() => {
    let peak = 0
    let currentEquity = 0
    return closedTrades.map(t => {
      currentEquity += t.net_pnl || 0
      if (currentEquity > peak) peak = currentEquity
      const dd = peak > 0 ? ((peak - currentEquity) / peak) * 100 : 0
      return {
        date: new Date(t.closed_at!).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
        drawdown: -dd,
      }
    })
  })()

  const pnlBySource = (() => {
    const map = new Map<string, number>()
    closedTrades.forEach(t => {
      const key = t.trade_source
      map.set(key, (map.get(key) || 0) + (t.net_pnl || 0))
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  })()

  const pnlBySide = (() => {
    const map = new Map<string, { wins: number; losses: number; pnl: number; count: number }>()
    closedTrades.forEach(t => {
      const key = t.side
      const existing = map.get(key) || { wins: 0, losses: 0, pnl: 0, count: 0 }
      existing.pnl += t.net_pnl || 0
      existing.count += 1
      if ((t.net_pnl || 0) > 0) existing.wins += 1
      else existing.losses += 1
      map.set(key, existing)
    })
    return Array.from(map.entries()).map(([side, d]) => ({ side, ...d, winRate: d.count > 0 ? (d.wins / d.count) * 100 : 0 }))
  })()

  const strategyPerf = (() => {
    const map = new Map<string, Trade[]>()
    closedTrades.forEach(t => {
      const strategyName = t.strategy?.name || "No Strategy"
      if (!map.has(strategyName)) map.set(strategyName, [])
      map.get(strategyName)!.push(t)
    })
    return Array.from(map.entries()).map(([name, tds]) => {
      const s = calculateTradeStats(tds)
      return { name, ...s }
    }).sort((a, b) => b.netPnl - a.netPnl)
  })()

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
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

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { label: "Total Trades", value: String(stats.totalTrades) },
            { label: "Win Rate", value: `${stats.winRate.toFixed(1)}%` },
            { label: "Net PnL", value: formatCurrency(stats.netPnl) },
            { label: "Profit Factor", value: stats.profitFactor === Infinity ? "∞" : formatNumber(stats.profitFactor) },
            { label: "Expectancy", value: formatCurrency(stats.expectancy) },
            { label: "Max DD", value: `${stats.maxDrawdown.toFixed(1)}%` },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-gray-400">{item.label}</p>
                <p className="text-lg font-bold font-mono text-white mt-1">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="strategy">By Strategy</TabsTrigger>
          <TabsTrigger value="source">By Source</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Equity Curve</CardTitle></CardHeader>
              <CardContent>
                {equityCurve.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                      <Area type="monotone" dataKey="equity" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className="h-[250px] flex items-center justify-center text-gray-500">No data</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Drawdown</CardTitle></CardHeader>
              <CardContent>
                {drawdownData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={drawdownData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                      <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="#ef444420" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className="h-[250px] flex items-center justify-center text-gray-500">No data</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">PnL by Source</CardTitle></CardHeader>
              <CardContent>
                {pnlBySource.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={pnlBySource} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${formatCurrency(value)}`}>
                        {pnlBySource.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="h-[250px] flex items-center justify-center text-gray-500">No data</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Performance by Side</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Net PnL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pnlBySide.map((row) => (
                      <TableRow key={row.side}>
                        <TableCell><Badge variant={row.side === "long" || row.side === "buy" ? "success" : "destructive"}>{row.side.toUpperCase()}</Badge></TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                        <TableCell className="text-right">{row.winRate.toFixed(1)}%</TableCell>
                        <TableCell className={`text-right font-mono ${row.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(row.pnl)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="strategy">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Strategy</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                    <TableHead className="text-right">Win Rate</TableHead>
                    <TableHead className="text-right">Profit Factor</TableHead>
                    <TableHead className="text-right">Expectancy</TableHead>
                    <TableHead className="text-right">Avg R</TableHead>
                    <TableHead className="text-right">Net PnL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {strategyPerf.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-500">No data</TableCell></TableRow>
                  ) : (
                    strategyPerf.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right">{row.totalTrades}</TableCell>
                        <TableCell className="text-right">{row.winRate.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{row.profitFactor === Infinity ? "∞" : formatNumber(row.profitFactor)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.expectancy)}</TableCell>
                        <TableCell className="text-right">{formatNumber(row.avgRMultiple)}</TableCell>
                        <TableCell className={`text-right font-mono ${row.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(row.netPnl)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="source">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                    <TableHead className="text-right">Win Rate</TableHead>
                    <TableHead className="text-right">Net PnL</TableHead>
                    <TableHead className="text-right">Avg Win</TableHead>
                    <TableHead className="text-right">Avg Loss</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const map = new Map<string, Trade[]>()
                    closedTrades.forEach(t => {
                      if (!map.has(t.trade_source)) map.set(t.trade_source, [])
                      map.get(t.trade_source)!.push(t)
                    })
                    return Array.from(map.entries()).map(([source, tds]) => {
                      const s = calculateTradeStats(tds)
                      return (
                        <TableRow key={source}>
                          <TableCell><Badge variant="secondary">{source}</Badge></TableCell>
                          <TableCell className="text-right">{s.totalTrades}</TableCell>
                          <TableCell className="text-right">{s.winRate.toFixed(1)}%</TableCell>
                          <TableCell className={`text-right font-mono ${s.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(s.netPnl)}</TableCell>
                          <TableCell className="text-right font-mono text-emerald-400">{formatCurrency(s.avgWin)}</TableCell>
                          <TableCell className="text-right font-mono text-red-400">{formatCurrency(s.avgLoss)}</TableCell>
                        </TableRow>
                      )
                    })
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
