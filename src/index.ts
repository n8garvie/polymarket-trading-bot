import { ClobClient } from "@polymarket/clob-client";
import OpenAI from "openai";
import { ethers } from "ethers";
import cron from "node-cron";
import { Telegraf } from "telegraf";
import express from "express";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

// Configuration
const CONFIG = {
  apiKey: process.env.POLYMARKET_API_KEY || "",
  secret: process.env.POLYMARKET_SECRET || "",
  passphrase: process.env.POLYMARKET_PASSPHRASE || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
  maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || "100"),
  stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || "5"),
  takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT || "10"),
  strategy: process.env.TRADING_STRATEGY || "momentum",
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
};

// Initialize clients
const clobClient = new ClobClient({
  host: "https://clob.polymarket.com",
  chainId: 137, // Polygon
  signatureType: 0,
  funder: new ethers.Wallet(CONFIG.secret),
});

const openai = new OpenAI({ apiKey: CONFIG.openaiKey });

const bot = CONFIG.telegramToken 
  ? new Telegraf(CONFIG.telegramToken)
  : null;

// Database setup
const db = new Database("trades.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    marketId TEXT,
    side TEXT,
    size REAL,
    price REAL,
    timestamp INTEGER,
    status TEXT,
    pnl REAL
  );
  
  CREATE TABLE IF NOT EXISTS positions (
    marketId TEXT PRIMARY KEY,
    side TEXT,
    size REAL,
    entryPrice REAL,
    currentPrice REAL,
    unrealizedPnl REAL,
    timestamp INTEGER
  );
`);

// State
let isRunning = false;
let activePositions: Map<string, any> = new Map();

// Market Analysis with AI
async function analyzeMarket(marketId: string, marketData: any): Promise<{
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
          
Market: ${marketData.title}
Current Price: ${marketData.price}
Volume: ${marketData.volume}
Liquidity: ${marketData.liquidity}

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

    // Execute trade via Polymarket API
    const order = await clobClient.createOrder({
      tokenId: marketId,
      side: side === "buy" ? "BUY" : "SELL",
      size: size.toString(),
      price: "0", // Market order
    });

    // Record trade
    const stmt = db.prepare(`
      INSERT INTO trades (marketId, side, size, price, timestamp, status, pnl)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(marketId, side, size, order.price, Date.now(), "filled", 0);

    // Update positions
    if (side === "buy") {
      activePositions.set(marketId, {
        side: "long",
        size,
        entryPrice: parseFloat(order.price),
        timestamp: Date.now()
      });
    } else {
      activePositions.delete(marketId);
    }

    // Notify
    const message = `🚀 Trade Executed\nMarket: ${marketId}\nSide: ${side.toUpperCase()}\nSize: $${size}`;
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
    // Get current price (simplified - would fetch from API)
    const currentPrice = position.entryPrice; // Placeholder
    const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    
    if (pnlPercent <= -CONFIG.stopLossPercent) {
      console.log(`Stop loss triggered for ${marketId}`);
      executeTrade(marketId, "sell", position.size);
    }
    
    if (pnlPercent >= CONFIG.takeProfitPercent) {
      console.log(`Take profit triggered for ${marketId}`);
      executeTrade(marketId, "sell", position.size);
    }
  }
}

// Main Trading Loop
async function tradingLoop() {
  if (!isRunning) return;

  try {
    console.log("📊 Running trading analysis...");

    // Get active markets
    const markets = await clobClient.getMarkets();
    
    // Filter for liquid markets
    const tradableMarkets = markets.filter((m: any) => 
      m.volume > 10000 && m.liquidity > 5000
    ).slice(0, 10); // Top 10 markets

    for (const market of tradableMarkets) {
      // Analyze with AI
      const analysis = await analyzeMarket(market.id, market);
      
      console.log(`Market: ${market.title}`);
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
  const positions = db.prepare("SELECT * FROM positions").all();
  res.json(positions);
});

app.get("/api/history", (req, res) => {
  const trades = db.prepare("SELECT * FROM trades ORDER BY timestamp DESC LIMIT 100").all();
  res.json(trades);
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
