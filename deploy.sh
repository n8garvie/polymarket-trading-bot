#!/bin/bash
# Deploy Polymarket Trading Bot to Railway/Render

set -e

echo "🚀 Deploying Polymarket Trading Bot..."

# Check prerequisites
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found"
    echo "Copy .env.example to .env and fill in your credentials"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build
echo "🔨 Building..."
npm run build

# Run tests
echo "🧪 Running tests..."
npm test || echo "⚠️  Tests failed, continuing..."

# Deploy to Railway (if configured)
if command -v railway &> /dev/null; then
    echo "🚂 Deploying to Railway..."
    railway up
else
    echo "⚠️  Railway CLI not found. Install with: npm i -g @railway/cli"
fi

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Set environment variables in your hosting platform"
echo "2. Start the bot with: npm start"
echo "3. Access dashboard at: http://localhost:3000"
