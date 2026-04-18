import OpenAI from "openai";
import cron from "node-cron";
import { Telegraf } from "telegraf";
import express from "express";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";

dotenv.config();

// Configuration
const CONFIG = {
  openaiKey: process.env.OPENAI_API_KEY || "",
  maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || "100"),
  stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || "5"),
  takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT || "10"),
  strategy: process.env.TRADING_STRATEGY || "momentum",
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
};

// Initialize clients
const openai = new OpenAI({ apiKey: CONFIG.openaiKey });

const bot = CONFIG.telegramToken 
  ? new Telegraf(CONFIG.telegramToken)
  : null;

// Database setup
const db = new sqlite3.Database("trades.db");
db.run(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    marketId TEXT,
    side TEXT,
    size REAL,
    price REAL,
    timestamp INTEGER,
    status TEXT,
    pnl REAL
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS positions (
    marketId TEXT PRIMARY KEY,
    side TEXT,
    size REAL,
    entryPrice REAL,
    currentPrice REAL,
    unrealizedPnl REAL,
    timestamp INTEGER
  )
`);

// State
let isRunning = false;
let activePositions: Map<string, any> = new Map();

// Simulated market data for demo
const MOCK_MARKETS = [
  { id: "market-1", title: "Will BTC hit $100K in 2025?", price: 0.65, volume: 500000, liquidity: 100000 },
  { id: "market-2", title: "Will Trump win 2024 election?", price: 0.48, volume: 1200000, liquidity: 300000 },
  { id: "market-3", title: "Will ETH ETF be approved?", price: 0.72, volume: 800000, liquidity: 200000 },
];

// Market Analysis with AI
async function analyzeMarket(market: any): Promise<{
  signal: "buy" | "sell" | "hold";
  confidence: number;
  reasoning: string;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a prediction market analyst. Analyze the market data and provide a trading signal.
          
Market: ${market.title}
Current Price: ${market.price}
Volume: ${market.volume}
Liquidity: ${market.liquidity}

Respond with JSON:
{
  "signal": "buy" | "sell" | "hold",
  "confidence": 0-100,
  "reasoning": "brief explanation"
}`
        }
      ],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content || '{"signal":"hold","confidence":0}');
  } catch (error) {
    console.error("AI analysis failed:", error);
    return { signal: "hold", confidence: 0, reasoning: "Analysis failed" };
  }
}

// Trading Logic
async function executeTrade(marketId: string, side: "buy" | "sell", size: number) {
  try {
    // Check position limits
    const currentPosition = activePositions.get(marketId);
    if (currentPosition && currentPosition.side === side) {
      console.log(`Already have ${side} position in ${marketId}`);
      return;
    }

    // Simulate trade execution
    const price = Math.random() * 0.5 + 0.25; // Random price between 0.25 and 0.75
    
    // Record trade
    db.run(
      `INSERT INTO trades (marketId, side, size, price, timestamp, status, pnl) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [marketId, side, size, price, Date.now(), "filled", 0]
    );

    // Update positions
    if (side === "buy") {
      activePositions.set(marketId, {
        side: "long",
        size,
        entryPrice: price,
        timestamp: Date.now()
      });
    } else {
      activePositions.delete(marketId);
    }

    // Notify
    const message = `🚀 Trade Executed\nMarket: ${marketId}\nSide: ${side.toUpperCase()}\nSize: $${size.toFixed(2)}\nPrice: $${price.toFixed(3)}`;
    console.log(message);
    
    if (bot && CONFIG.telegramChatId) {
      bot.telegram.sendMessage(CONFIG.telegramChatId, message);
    }

  } catch (error) {
    console.error("Trade execution failed:", error);
  }
}

// Risk Management
function checkStopLosses() {
  for (const [marketId, position] of activePositions) {
    const currentPrice = position.entryPrice * (1 + (Math.random() - 0.5) * 0.1);
    const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    
    if (pnlPercent <= -CONFIG.stopLossPercent) {
      console.log(`Stop loss triggered for ${marketId} (${pnlPercent.toFixed(2)}%)`);
      executeTrade(marketId, "sell", position.size);
    }
    
    if (pnlPercent >= CONFIG.takeProfitPercent) {
      console.log(`Take profit triggered for ${marketId} (+${pnlPercent.toFixed(2)}%)`);
      executeTrade(marketId, "sell", position.size);
    }
  }
}

// Main Trading Loop
async function tradingLoop() {
  if (!isRunning) return;

  try {
    console.log("📊 Running trading analysis...");

    for (const market of MOCK_MARKETS) {
      // Analyze with AI
      const analysis = await analyzeMarket(market);
      
      console.log(`\nMarket: ${market.title}`);
      console.log(`Signal: ${analysis.signal} (${analysis.confidence}%)`);
      console.log(`Reasoning: ${analysis.reasoning}`);

      // Execute if confidence is high
      if (analysis.confidence > 70 && analysis.signal !== "hold") {
        const positionSize = Math.min(
          CONFIG.maxPositionSize,
          CONFIG.maxPositionSize * (analysis.confidence / 100)
        );
        
        await executeTrade(market.id, analysis.signal, positionSize);
      }
    }

    // Check stop losses
    checkStopLosses();

  } catch (error) {
    console.error("Trading loop error:", error);
  }
}

// Web Dashboard
const app = express();
app.use(express.json());

app.get("/api/status", (req, res) => {
  res.json({
    isRunning,
    activePositions: Array.from(activePositions.entries()),
    strategy: CONFIG.strategy,
    timestamp: Date.now()
  });
});

app.get("/api/positions", (req, res) => {
  db.all("SELECT * FROM positions", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/api/history", (req, res) => {
  db.all("SELECT * FROM trades ORDER BY timestamp DESC LIMIT 100", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post("/api/start", (req, res) => {
  isRunning = true;
  res.json({ status: "started" });
});

app.post("/api/stop", (req, res) => {
  isRunning = false;
  res.json({ status: "stopped" });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`📈 Polymarket Trading Bot running on port ${PORT}`);
  console.log(`Strategy: ${CONFIG.strategy}`);
  console.log(`Max Position: $${CONFIG.maxPositionSize}`);
});

// Schedule trading loop every 5 minutes
cron.schedule("*/5 * * * *", tradingLoop);

// Initial start
isRunning = true;
tradingLoop();
