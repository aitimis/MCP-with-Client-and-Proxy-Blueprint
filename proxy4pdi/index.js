const express = require("express");
const http = require("http");
const ngrok = require("@ngrok/ngrok");
require("dotenv").config();

const { default: MCPClient } = require(
  "/Users/alexandru.timis/AgentsToolkitProjects/mcp+client/mcp-client-typescript/build/index.js"
);

const app = express();
app.use(express.json());

let mcpClient;

async function initMCP() {
  try {
    mcpClient = new MCPClient();
    await mcpClient.connectToServer(
      "/Users/alexandru.timis/AgentsToolkitProjects/mcp+client/weather-server-typescript/build/index.js"
    );
    console.log("✅ [PROXY] MCP client ready\n");
  } catch (err) {
    console.error("❌ [PROXY] Failed to initialize MCP client:", err);
  }
}

app.post("/prompt", async (req, res) => {
  const { prompt } = req.body;
  console.log(`\n${"─".repeat(50)}`);
  console.log(`📨 [PROXY] Received prompt: "${prompt}"`);

  if (!mcpClient) {
    return res.status(503).json({ error: "MCP client not ready yet" });
  }

  try {
    const answer = await mcpClient.processQuery(prompt);
    console.log(`📤 [PROXY] Sending response back to caller`);
    console.log(`${"─".repeat(50)}\n`);
    res.json({ response: answer });
  } catch (err) {
    console.error("❌ [PROXY] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);
const PORT = 4000;

server.listen(PORT, async () => {
  console.log(`🌐 [PROXY] Listening on http://localhost:${PORT}`);
  await initMCP();

  const listener = await ngrok.connect({ addr: PORT, authtoken_from_env: true });
  console.log(`🚀 [PROXY] ngrok tunnel: ${listener.url()}\n`);
});