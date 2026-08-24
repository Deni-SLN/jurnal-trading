export type TradeSource = "okx" | "bybit" | "manual_stock"
export type TradeSide = "long" | "short" | "buy" | "sell"
export type MarketType = "spot" | "futures" | "perpetual" | "stock"
export type SyncStatus = "connected" | "syncing" | "error" | "disconnected"
export type ExchangeName = "okx" | "bybit"
export type WatchlistStatus = "watching" | "setup_forming" | "ready" | "entered" | "completed" | "invalidated"

export interface User {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  base_currency: string
  timezone: string
  max_risk_per_trade: number
  max_daily_loss: number
  max_drawdown: number
  max_leverage: number
  max_open_positions: number
  created_at: string
  updated_at: string
}

export interface ExchangeAccount {
  id: string
  user_id: string
  exchange: ExchangeName
  account_name: string
  is_active: boolean
  last_sync_at: string | null
  sync_status: SyncStatus
  created_at: string
}

export interface Trade {
  id: string
  user_id: string
  exchange_account_id: string | null
  trade_source: TradeSource
  symbol: string
  side: TradeSide
  market_type: MarketType
  entry_price: number
  exit_price: number | null
  quantity: number
  leverage: number
  margin: number
  gross_pnl: number | null
  trading_fee: number
  funding_fee: number
  net_pnl: number | null
  pnl_percent: number | null
  r_multiple: number | null
  duration_seconds: number | null
  strategy_id: string | null
  stop_loss: number | null
  take_profit: number | null
  status: "open" | "closed"
  opened_at: string
  closed_at: string | null
  created_at: string
  strategy?: Strategy
  journal?: JournalEntry
}

export interface JournalEntry {
  id: string
  trade_id: string
  thesis: string | null
  entry_reason: string | null
  exit_reason: string | null
  market_condition: string | null
  confidence: number | null
  psychology_before: string | null
  psychology_after: string | null
  emotional_control: number | null
  discipline: number | null
  patience: number | null
  lesson_learned: string | null
  screenshots: string[]
  tags: string[]
  created_at: string
  updated_at: string
}

export interface Strategy {
  id: string
  user_id: string
  name: string
  description: string | null
  market: string | null
  timeframe: string | null
  entry_rules: string | null
  exit_rules: string | null
  sl_rules: string | null
  risk_rules: string | null
  tags: string[]
  is_active: boolean
  created_at: string
}

export interface WatchlistItem {
  id: string
  user_id: string
  symbol: string
  thesis: string | null
  support_levels: number[]
  resistance_levels: number[]
  target_price: number | null
  stop_loss: number | null
  setup_type: string | null
  status: WatchlistStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DailyMetric {
  id: string
  user_id: string
  date: string
  total_trades: number
  winning_trades: number
  losing_trades: number
  gross_pnl: number
  net_pnl: number
  total_fees: number
  total_funding: number
  max_drawdown: number
  created_at: string
}

export interface AIReview {
  id: string
  user_id: string
  review_type: "daily" | "weekly" | "monthly"
  period_start: string
  period_end: string
  content: string
  created_at: string
}

export interface TradeStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  grossProfit: number
  grossLoss: number
  netPnl: number
  profitFactor: number
  expectancy: number
  avgWin: number
  avgLoss: number
  maxDrawdown: number
  avgRMultiple: number
  bestTrade: number
  worstTrade: number
  avgHoldingTime: number
}
