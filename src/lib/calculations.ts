import { Trade, TradeStats } from "@/types/database"

export function calculateTradeStats(trades: Trade[]): TradeStats {
  const closedTrades = trades.filter(t => t.status === "closed" && t.net_pnl !== null)
  if (closedTrades.length === 0) {
    return {
      totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
      grossProfit: 0, grossLoss: 0, netPnl: 0, profitFactor: 0,
      expectancy: 0, avgWin: 0, avgLoss: 0, maxDrawdown: 0,
      avgRMultiple: 0, bestTrade: 0, worstTrade: 0, avgHoldingTime: 0,
    }
  }

  const winners = closedTrades.filter(t => (t.net_pnl ?? 0) > 0)
  const losers = closedTrades.filter(t => (t.net_pnl ?? 0) < 0)

  const grossProfit = winners.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0)
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0))
  const netPnl = closedTrades.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0)
  const winRate = closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const avgWin = winners.length > 0 ? grossProfit / winners.length : 0
  const avgLoss = losers.length > 0 ? grossLoss / losers.length : 0
  const expectancy = closedTrades.length > 0
    ? ((winRate / 100) * avgWin) - ((1 - winRate / 100) * avgLoss)
    : 0

  let peak = 0
  let maxDrawdown = 0
  let cumulative = 0
  for (const t of closedTrades.sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime())) {
    cumulative += t.net_pnl ?? 0
    if (cumulative > peak) peak = cumulative
    const dd = peak > 0 ? ((peak - cumulative) / peak) * 100 : 0
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  const rMultiples = closedTrades.filter(t => t.r_multiple !== null).map(t => t.r_multiple!)
  const avgRMultiple = rMultiples.length > 0 ? rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length : 0

  const pnls = closedTrades.map(t => t.net_pnl ?? 0)
  const durations = closedTrades.filter(t => t.duration_seconds !== null).map(t => t.duration_seconds!)
  const avgHoldingTime = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

  return {
    totalTrades: closedTrades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate,
    grossProfit,
    grossLoss,
    netPnl,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    maxDrawdown,
    avgRMultiple,
    bestTrade: Math.max(...pnls, 0),
    worstTrade: Math.min(...pnls, 0),
    avgHoldingTime,
  }
}

export function calculateStockPnl(entry: number, exit: number, lot: number, fee: number): { grossPnl: number; netPnl: number; returnPct: number } {
  const grossPnl = (exit - entry) * lot * 100
  const netPnl = grossPnl - fee
  const investment = entry * lot * 100
  const returnPct = investment > 0 ? (netPnl / investment) * 100 : 0
  return { grossPnl, netPnl, returnPct }
}

export function calculateRMultiple(netPnl: number, entryPrice: number, stopLoss: number, quantity: number): number | null {
  if (!stopLoss || stopLoss === entryPrice) return null
  const risk = Math.abs(entryPrice - stopLoss) * quantity
  return risk > 0 ? netPnl / risk : null
}
