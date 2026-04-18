# Polymarket Trading Bot

A lightweight, automated trading bot for Polymarket prediction markets with AI-powered decision making.

## Features

- **Automated Trading** - Monitors markets and executes trades based on signals
- **Risk Management** - Configurable position sizing and stop-losses
- **Market Analysis** - Uses AI to analyze market conditions and sentiment
- **Multiple Strategies** - Support for various trading strategies (momentum, arbitrage, sentiment)
- **Real-time Monitoring** - Live dashboard showing positions, P&L, and market data
- **Telegram Alerts** - Get notified of trades and significant market moves

## Tech Stack

- **Backend:** Node.js with TypeScript
- **API:** Polymarket CLOB (Central Limit Order Book) API
- **AI:** OpenAI GPT-4 for market analysis
- **Database:** SQLite for trade history and state
- **Frontend:** Simple web dashboard (Next.js)

## Setup

### 1. Prerequisites

- Node.js 18+
- Polymarket account with API access
- OpenAI API key
- (Optional) Telegram bot for notifications

### 2. Installation

```bash
git clone https://github.com/n8garvie/polymarket-trading-bot.git
cd polymarket-trading-bot
npm install
```

### 3. Configuration

Create `.env` file:

```env
# Polymarket API
POLYMARKET_API_KEY=your_api_key
POLYMARKET_SECRET=your_secret
POLYMARKET_PASSPHRASE=your_passphrase

# OpenAI
OPENAI_API_KEY=your_openai_key

# Trading Parameters
MAX_POSITION_SIZE=1000
STOP_LOSS_PERCENT=5
TAKE_PROFIT_PERCENT=10
TRADING_STRATEGY=momentum

# Optional: Telegram Notifications
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 4. Run the Bot

```bash
# Development mode with dashboard
npm run dev

# Production mode
npm run build
npm start
```

## Trading Strategies

### Momentum Strategy
- Monitors price velocity and volume
- Enters when momentum crosses threshold
- Exits on momentum reversal

### Arbitrage Strategy
- Monitors price discrepancies across markets
- Executes when spread exceeds fees + profit target
- Fast execution (<500ms)

### Sentiment Strategy
- Uses AI to analyze market sentiment
- Monitors news, social media, and on-chain data
- Trades based on sentiment shifts

## API Endpoints

- `GET /api/status` - Bot status and current positions
- `GET /api/positions` - Active positions and P&L
- `GET /api/history` - Trade history
- `POST /api/trade` - Manual trade execution
- `POST /api/strategy` - Change trading strategy

## Risk Management

- **Position Sizing** - Never risk more than X% of portfolio per trade
- **Stop Losses** - Automatic exit if position moves against you
- **Daily Limits** - Max daily loss before bot pauses
- **Market Filters** - Only trade markets meeting liquidity/volume criteria

## Monitoring

Access the dashboard at `http://localhost:3000` to see:
- Active positions and P&L
- Recent trades
- Market data
- Bot performance metrics
- Strategy configuration

## Disclaimer

Trading prediction markets involves significant risk. This bot is for educational purposes. Always:
- Start with small amounts
- Test strategies in simulation mode first
- Never trade more than you can afford to lose
- Monitor the bot actively

## License

MIT
