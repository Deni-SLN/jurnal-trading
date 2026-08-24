"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/utils"
import { Trade } from "@/types/database"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, TrendingUp, TrendingDown } from "lucide-react"
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isSameDay,
  addMonths, subMonths, isToday,
} from "date-fns"
import { id as idLocale } from "date-fns/locale"

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]

export default function CalendarPage() {
  const [trades,       setTrades]       = useState<Trade[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const supabase  = createClient()
      const start     = startOfMonth(currentMonth)
      const end       = endOfMonth(currentMonth)
      const { data }  = await supabase
        .from("trades")
        .select("*")
        .eq("status", "closed")
        .gte("closed_at", start.toISOString())
        .lte("closed_at", end.toISOString())
      setTrades((data || []) as Trade[])
      setLoading(false)
    }
    load()
  }, [currentMonth])

  const dailyData = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; losses: number; pnl: number }>()
    trades.forEach((t) => {
      if (!t.closed_at) return
      const key      = format(new Date(t.closed_at), "yyyy-MM-dd")
      const existing = map.get(key) || { trades: 0, wins: 0, losses: 0, pnl: 0 }
      existing.trades += 1
      existing.pnl    += t.net_pnl || 0
      if ((t.net_pnl || 0) > 0) existing.wins += 1
      else existing.losses += 1
      map.set(key, existing)
    })
    return map
  }, [trades])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd   = endOfMonth(currentMonth)
    const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd     = endOfWeek(monthEnd,     { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  const selectedDayTrades = selectedDate
    ? trades.filter((t) => t.closed_at && isSameDay(new Date(t.closed_at), selectedDate))
    : []

  const monthStats = useMemo(() => {
    const totalPnl    = trades.reduce((s, t) => s + (t.net_pnl || 0), 0)
    const wins        = trades.filter((t) => (t.net_pnl || 0) > 0).length
    const tradingDays = dailyData.size
    const profitDays  = Array.from(dailyData.values()).filter((d) => d.pnl > 0).length
    const lossDays    = tradingDays - profitDays
    return { totalPnl, totalTrades: trades.length, wins, tradingDays, profitDays, lossDays }
  }, [trades, dailyData])

  return (
    <div className="space-y-5">
      {/* Page title */}
      <div className="flex items-center gap-2">
        <CalendarIcon className="h-6 w-6 text-blue-500" />
        <h1 className="text-2xl font-bold text-foreground">Trading Calendar</h1>
      </div>

      {/* Month stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Net PnL", value: formatCurrency(monthStats.totalPnl), color: monthStats.totalPnl >= 0 ? "text-emerald-500" : "text-red-500" },
          { label: "Total Trade", value: String(monthStats.totalTrades), color: "text-foreground" },
          { label: "Win Rate", value: monthStats.totalTrades > 0 ? `${((monthStats.wins / monthStats.totalTrades) * 100).toFixed(0)}%` : "—", color: "text-foreground" },
          { label: "Hari Trading", value: String(monthStats.tradingDays), color: "text-foreground" },
          { label: "Hari Profit", value: String(monthStats.profitDays), color: "text-emerald-500" },
          { label: "Hari Loss", value: String(monthStats.lossDays), color: "text-red-500" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-lg font-bold font-mono mt-0.5 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendar grid */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <CardTitle className="text-base capitalize">
                {format(currentMonth, "MMMM yyyy", { locale: idLocale })}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_LABELS.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7 gap-1">
              {loading
                ? [...Array(35)].map((_, i) => (
                    <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
                  ))
                : calendarDays.map((day) => {
                    const key            = format(day, "yyyy-MM-dd")
                    const data           = dailyData.get(key)
                    const inMonth        = isSameMonth(day, currentMonth)
                    const isSelected     = !!selectedDate && isSameDay(day, selectedDate)
                    const isCurrentDay   = isToday(day)

                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedDate(isSameDay(day, selectedDate!) ? null : day)}
                        className={cn(
                          "aspect-square rounded-lg flex flex-col items-center justify-center gap-0 text-xs transition-all",
                          "border",
                          !inMonth && "opacity-30",
                          isSelected
                            ? "ring-2 ring-blue-500 ring-offset-1 border-blue-500"
                            : "border-transparent",
                          data
                            ? data.pnl > 0
                              ? "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30"
                              : "bg-red-500/15 hover:bg-red-500/25 border-red-500/30"
                            : "hover:bg-muted",
                          isCurrentDay && !data && "border-blue-500/50"
                        )}
                      >
                        <span className={cn(
                          "font-medium text-xs",
                          isCurrentDay ? "text-blue-500 font-bold" : inMonth ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {format(day, "d")}
                        </span>
                        {data && (
                          <span className={cn(
                            "text-[9px] font-mono font-bold leading-tight",
                            data.pnl >= 0 ? "text-emerald-500" : "text-red-500"
                          )}>
                            {data.pnl >= 0 ? "+" : ""}{data.pnl.toFixed(0)}
                          </span>
                        )}
                        {data && (
                          <span className="text-[8px] text-muted-foreground leading-tight">
                            {data.trades}t
                          </span>
                        )}
                      </button>
                    )
                  })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 px-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded bg-emerald-500/25 border border-emerald-500/40" />
                Profit
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded bg-red-500/25 border border-red-500/40" />
                Loss
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded border border-blue-500/50" />
                Hari ini
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Day detail */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {selectedDate
                ? format(selectedDate, "EEEE, d MMMM yyyy", { locale: idLocale })
                : "Detail Harian"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedDate ? (
              <div className="text-center py-10 text-muted-foreground">
                <CalendarIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Klik tanggal untuk lihat detail trade</p>
              </div>
            ) : selectedDayTrades.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <CalendarIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Tidak ada trade pada hari ini</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedDayTrades.map((trade) => {
                  const pnl     = trade.net_pnl || 0
                  const isWin   = pnl >= 0
                  return (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border"
                      style={{ background: "var(--muted)" }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-sm text-foreground">
                            {trade.symbol}
                          </span>
                          <span className={`text-xs font-medium ${isWin ? "text-emerald-500" : "text-red-500"}`}>
                            {trade.side.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground capitalize">
                          {trade.trade_source.replace("_", " ")}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className={`font-mono font-bold text-sm ${isWin ? "text-emerald-500" : "text-red-500"}`}>
                          {formatCurrency(pnl)}
                        </p>
                        {isWin
                          ? <TrendingUp className="h-3 w-3 text-emerald-500 ml-auto" />
                          : <TrendingDown className="h-3 w-3 text-red-500 ml-auto" />}
                      </div>
                    </div>
                  )
                })}

                {/* Day total */}
                <div
                  className="flex justify-between items-center p-3 rounded-lg border border-border mt-3"
                  style={{ background: "var(--card)" }}
                >
                  <span className="text-sm font-semibold text-foreground">Total</span>
                  <span className={`font-mono font-bold ${
                    selectedDayTrades.reduce((s, t) => s + (t.net_pnl || 0), 0) >= 0
                      ? "text-emerald-500" : "text-red-500"
                  }`}>
                    {formatCurrency(selectedDayTrades.reduce((s, t) => s + (t.net_pnl || 0), 0))}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
