import { Anthropic } from "@anthropic-ai/sdk";
import {
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const ANTHROPIC_MODEL = "claude-sonnet-4-5";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, "../soul.md"), "utf-8");

class MCPClient {
  private mcp: Client;
  private _anthropic: Anthropic | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];

  constructor() {
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  private get anthropic(): Anthropic {
    return this._anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async connectToServer(serverScriptPath: string) {
    const isJs = serverScriptPath.endsWith(".js");
    const isPy = serverScriptPath.endsWith(".py");
    if (!isJs && !isPy) throw new Error("Server script must be .js or .py");

    const command = isPy
      ? process.platform === "win32" ? "python" : "python3"
      : process.execPath;

    this.transport = new StdioClientTransport({ command, args: [serverScriptPath] });

    console.log("🔌 [MCP] Connecting to MCP server...");
    await this.mcp.connect(this.transport);
    console.log("✅ [MCP] Connected — handshake complete");

    const toolsResult = await this.mcp.listTools();
    this.tools = toolsResult.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    console.log(`🧰 [MCP] Tools available: [${this.tools.map(t => t.name).join(", ")}]`);
  }

  async processQuery(query: string): Promise<string> {
    console.log(`\n💬 [QUERY] "${query}"`);

    const messages: MessageParam[] = [{ role: "user", content: query }];

    // ── Round 1: send user message to Claude ─────────────────────────────
    console.log("➡️  [CLAUDE] Sending query to Claude...");
    const response = await this.anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages,
      tools: this.tools,
    });
    console.log(`⬅️  [CLAUDE] Response received  (stop_reason: "${response.stop_reason}")`);

    const finalText: string[] = [];

    for (const content of response.content) {

      if (content.type === "text") {
        const hasToolCall = response.content.some(b => b.type === "tool_use");
        if (hasToolCall) {
          console.log("💬 [CLAUDE] Text block alongside tool call (preamble) — skipping");
          // Don't push anything, we only want Round 2's response
        } else {
          console.log("✅ [CLAUDE] Answered directly — no tool needed");
          finalText.push(content.text);
        }
      }

      else if (content.type === "tool_use") {
        console.log(`🔧 [CLAUDE] Wants to call tool: "${content.name}"  args: ${JSON.stringify(content.input)}`);

        // ── Tool execution on the MCP server ────────────────────────────
        console.log(`➡️  [MCP]    Forwarding tool call to MCP server...`);
        const result = await this.mcp.callTool({
          name: content.name,
          arguments: content.input as Record<string, unknown>,
        });
        console.log(`⬅️  [MCP]    Tool result received`);

        // ── Round 2: send tool result back to Claude ────────────────────
        messages.push({ role: "user", content: result.content as string });

        console.log("➡️  [CLAUDE] Sending tool result back to Claude...");
        const response2 = await this.anthropic.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages,
        });
        console.log(`⬅️  [CLAUDE] Final answer received  (stop_reason: "${response2.stop_reason}")`);

        const finalBlock = response2.content[0];
        finalText.push(finalBlock.type === "text" ? finalBlock.text : "");
      }
    }

    console.log("🏁 [DONE]   Query complete\n");
    return finalText.join("\n");
  }

  async chatLoop() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log('\nMCP Client started. Type "quit" to exit.\n');
      while (true) {
        const message = await rl.question("Query: ");
        if (message.toLowerCase() === "quit") break;
        console.log("\n" + (await this.processQuery(message)));
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    await this.mcp.close();
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: node build/index.js <path_to_server_script>");
    return;
  }
  const client = new MCPClient();
  try {
    await client.connectToServer(process.argv[2]);
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log("ANTHROPIC_API_KEY missing. Exiting.");
      return;
    }
    await client.chatLoop();
  } catch (e) {
    console.error("Error:", e);
    await client.cleanup();
    process.exit(1);
  } finally {
    await client.cleanup();
    process.exit(0);
  }
}

main();
export default MCPClient;