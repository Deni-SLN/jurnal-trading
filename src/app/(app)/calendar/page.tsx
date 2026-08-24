"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/utils"
import { Trade } from "@/types/database"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react"
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns"
import { id as idLocale } from "date-fns/locale"

export default function CalendarPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const start = startOfMonth(currentMonth)
      const end = endOfMonth(currentMonth)
      const { data } = await supabase
        .from("trades")
        .select("*")
        .eq("status", "closed")
        .gte("closed_at", start.toISOString())
        .lte("closed_at", end.toISOString())
      setTrades((data || []) as Trade[])
    }
    load()
  }, [currentMonth])

  const dailyData = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; losses: number; pnl: number }>()
    trades.forEach((t) => {
      if (!t.closed_at) return
      const key = format(new Date(t.closed_at), "yyyy-MM-dd")
      const existing = map.get(key) || { trades: 0, wins: 0, losses: 0, pnl: 0 }
      existing.trades += 1
      existing.pnl += t.net_pnl || 0
      if ((t.net_pnl || 0) > 0) existing.wins += 1
      else existing.losses += 1
      map.set(key, existing)
    })
    return map
  }, [trades])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  const selectedDayTrades = selectedDate
    ? trades.filter(t => t.closed_at && isSameDay(new Date(t.closed_at), selectedDate))
    : []

  const monthStats = useMemo(() => {
    const totalPnl = trades.reduce((sum, t) => sum + (t.net_pnl || 0), 0)
    const totalTrades = trades.length
    const wins = trades.filter(t => (t.net_pnl || 0) > 0).length
    const tradingDays = dailyData.size
    const profitDays = Array.from(dailyData.values()).filter(d => d.pnl > 0).length
    return { totalPnl, totalTrades, wins, tradingDays, profitDays }
  }, [trades, dailyData])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Trading Calendar</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-400">Net PnL</p><p className={`text-lg font-bold font-mono ${monthStats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(monthStats.totalPnl)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-400">Total Trades</p><p className="text-lg font-bold text-white">{monthStats.totalTrades}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-400">Win Rate</p><p className="text-lg font-bold text-white">{monthStats.totalTrades > 0 ? ((monthStats.wins / monthStats.totalTrades) * 100).toFixed(0) : 0}%</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-400">Trading Days</p><p className="text-lg font-bold text-white">{monthStats.tradingDays}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-400">Profit Days</p><p className="text-lg font-bold text-emerald-400">{monthStats.profitDays}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <CardTitle className="text-base">{format(currentMonth, "MMMM yyyy", { locale: idLocale })}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
              ))}
              {calendarDays.map((day) => {
                const key = format(day, "yyyy-MM-dd")
                const data = dailyData.get(key)
                const isCurrentMonth = isSameMonth(day, currentMonth)
                const isSelected = selectedDate && isSameDay(day, selectedDate)

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "aspect-square p-1 rounded-lg text-xs flex flex-col items-center justify-center gap-0.5 transition-colors",
                      !isCurrentMonth && "opacity-30",
                      isSelected && "ring-2 ring-blue-500",
                      data ? (data.pnl > 0 ? "bg-emerald-500/20 hover:bg-emerald-500/30" : "bg-red-500/20 hover:bg-red-500/30") : "hover:bg-gray-800"
                    )}
                  >
                    <span className={cn("font-medium", isCurrentMonth ? "text-gray-200" : "text-gray-600")}>
                      {format(day, "d")}
                    </span>
                    {data && (
                      <>
                        <span className={`text-[10px] font-mono font-bold ${data.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {data.pnl >= 0 ? "+" : ""}{data.pnl.toFixed(0)}
                        </span>
                        <span className="text-[9px] text-gray-500">{data.trades}t</span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedDate ? format(selectedDate, "d MMMM yyyy", { locale: idLocale }) : "Pilih tanggal"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDayTrades.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{selectedDate ? "Tidak ada trade" : "Klik tanggal untuk lihat detail"}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDayTrades.map((trade) => (
                  <div key={trade.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
                    <div>
                      <span className="font-mono font-medium text-white">{trade.symbol}</span>
                      <span className={`ml-2 text-xs ${trade.side === "long" || trade.side === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                        {trade.side.toUpperCase()}
                      </span>
                    </div>
                    <span className={`font-mono font-bold ${(trade.net_pnl || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatCurrency(trade.net_pnl || 0)}
                    </span>
                  </div>
                ))}
                <div className="border-t border-gray-800 pt-3 flex justify-between">
                  <span className="text-sm text-gray-400">Total</span>
                  <span className={`font-mono font-bold ${selectedDayTrades.reduce((s, t) => s + (t.net_pnl || 0), 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
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
