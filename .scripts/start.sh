#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "🔨 Building MCP Server..."
cd "$ROOT/server&client/mcp-server" && npm install && npm run build

echo "🔨 Building MCP Client..."
cd "$ROOT/server&client/mcp-client" && npm install && npm run build

echo "🚀 Starting Proxy..."
cd "$ROOT/proxy" && npm install && node index.js