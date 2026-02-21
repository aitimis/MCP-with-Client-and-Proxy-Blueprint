#!/bin/bash

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"  # Go one level up to workspace root

echo "🔨 Building MCP Weather Server..."
cd "$ROOT_DIR/mcp+client/weather-server-typescript"
npm run build
echo "✅ Weather server built"

echo ""
echo "🔨 Building MCP Client..."
cd "$ROOT_DIR/mcp+client/mcp-client-typescript"
npm run build
echo "✅ MCP client built"

echo ""
echo "🚀 Starting Proxy Server..."
cd "$ROOT_DIR/proxy4pdi"
node index.js