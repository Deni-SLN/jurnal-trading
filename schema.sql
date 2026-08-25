-- Create extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    base_currency VARCHAR(3) DEFAULT 'USD',
    timezone VARCHAR(50) DEFAULT 'Asia/Jakarta',
    max_risk_per_trade DECIMAL(5,2) DEFAULT 1.0,
    max_daily_loss DECIMAL(5,2) DEFAULT 3.0,
    max_drawdown DECIMAL(5,2) DEFAULT 10.0,
    max_leverage DECIMAL(5,2) DEFAULT 5.0,
    max_open_positions INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. exchange_accounts
CREATE TABLE IF NOT EXISTS exchange_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange VARCHAR(20) NOT NULL, -- 'okx', 'bybit'
    account_name VARCHAR(100) NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    api_secret_encrypted TEXT, -- nullable: sub-akun Bybit hanya punya API key
    passphrase_encrypted TEXT, -- OKX only
    is_active BOOLEAN DEFAULT true NOT NULL,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(20) DEFAULT 'disconnected' NOT NULL, -- 'connected', 'syncing', 'error', 'disconnected'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. strategies
CREATE TABLE IF NOT EXISTS strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    market VARCHAR(20) DEFAULT 'Both' NOT NULL, -- 'Crypto', 'Stocks', 'Both'
    timeframe VARCHAR(20),
    entry_rules TEXT,
    exit_rules TEXT,
    sl_rules TEXT,
    risk_rules TEXT,
    tags TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. trades (unified)
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange_account_id UUID REFERENCES exchange_accounts(id) ON DELETE SET NULL,
    trade_source VARCHAR(20) NOT NULL, -- 'okx', 'bybit', 'manual_stock'
    symbol VARCHAR(50) NOT NULL,
    side VARCHAR(10) NOT NULL, -- 'long', 'short', 'buy', 'sell'
    market_type VARCHAR(20) NOT NULL, -- 'spot', 'futures', 'perpetual', 'stock'
    entry_price DECIMAL(18,8) NOT NULL,
    exit_price DECIMAL(18,8),
    quantity DECIMAL(18,8) NOT NULL,
    leverage DECIMAL(5,2) DEFAULT 1.0 NOT NULL,
    margin DECIMAL(18,8) NOT NULL,
    gross_pnl DECIMAL(18,8),
    trading_fee DECIMAL(18,8) DEFAULT 0.0 NOT NULL,
    funding_fee DECIMAL(18,8) DEFAULT 0.0 NOT NULL,
    net_pnl DECIMAL(18,8),
    pnl_percent DECIMAL(8,4),
    r_multiple DECIMAL(8,4),
    duration_seconds INTEGER,
    strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
    stop_loss DECIMAL(18,8),
    take_profit DECIMAL(18,8),
    status VARCHAR(10) DEFAULT 'open' NOT NULL, -- 'open', 'closed'
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. journal_entries
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id UUID UNIQUE NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    thesis TEXT,
    entry_reason TEXT,
    exit_reason TEXT,
    market_condition VARCHAR(50),
    confidence INTEGER CHECK (confidence BETWEEN 1 AND 10),
    psychology_before VARCHAR(50),
    psychology_after VARCHAR(50),
    emotional_control INTEGER CHECK (emotional_control BETWEEN 1 AND 10),
    discipline INTEGER CHECK (discipline BETWEEN 1 AND 10),
    patience INTEGER CHECK (patience BETWEEN 1 AND 10),
    lesson_learned TEXT,
    screenshots TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    tags TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. watchlists
CREATE TABLE IF NOT EXISTS watchlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    thesis TEXT,
    support_levels DECIMAL(18,8)[] DEFAULT '{}'::DECIMAL(18,8)[] NOT NULL,
    resistance_levels DECIMAL(18,8)[] DEFAULT '{}'::DECIMAL(18,8)[] NOT NULL,
    target_price DECIMAL(18,8),
    stop_loss DECIMAL(18,8),
    setup_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'watching' NOT NULL, -- 'watching', 'setup_forming', 'ready', 'entered', 'completed', 'invalidated'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. ai_reviews
CREATE TABLE IF NOT EXISTS ai_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    review_type VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly'
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_reviews ENABLE ROW LEVEL SECURITY;

-- Create policies (safe for user_id checks)
CREATE POLICY "Users can only access own profile" ON users FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users can only access own exchange accounts" ON exchange_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own strategies" ON strategies FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own trades" ON trades FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own journal entries" ON journal_entries FOR ALL USING (
    EXISTS (SELECT 1 FROM trades WHERE trades.id = journal_entries.trade_id AND trades.user_id = auth.uid())
);
CREATE POLICY "Users can only access own watchlists" ON watchlists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access own ai reviews" ON ai_reviews FOR ALL USING (auth.uid() = user_id);

-- Profile trigger on auth.users sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. ai_settings (per user AI provider configuration)
CREATE TABLE IF NOT EXISTS ai_settings (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider        VARCHAR(20)  DEFAULT 'gemini'  NOT NULL, -- 'openrouter' | 'openai' | 'gemini'
    model           VARCHAR(100) DEFAULT 'auto'    NOT NULL,
    prefer_free     BOOLEAN      DEFAULT true      NOT NULL,
    openrouter_key  TEXT,
    openai_key      TEXT,
    gemini_key      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_settings'
    AND   policyname = 'Users can only access own ai settings'
  ) THEN
    CREATE POLICY "Users can only access own ai settings"
      ON ai_settings FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
