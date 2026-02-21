import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Resolve .env from the project root — two levels up from build/tools/incident.js
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const log = (...args: unknown[]) => process.stderr.write(args.join(" ") + "\n");

const SERVICENOW_BASE_URL = process.env.SERVICENOW_BASE_URL!;
const SERVICENOW_USERNAME = process.env.SERVICENOW_USERNAME!;
const SERVICENOW_PASSWORD = process.env.SERVICENOW_PASSWORD!;

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

type ServiceNowCreateIncidentResponse = {
  result?: { sys_id?: string; number?: string; [k: string]: unknown };
  [k: string]: unknown;
};

export function registerServiceNowTools(server: McpServer) {
  server.registerTool(
    "create-servicenow-incident",
    {
      title: "Create ServiceNow Incident",
      description: "Creates an incident in ServiceNow (table: incident) via REST API",
      inputSchema: {
        short_description: z
          .string()
          .min(1)
          .describe("Short description for the incident")
          .default("test123fromClaude"),
      },
    },
    async ({ short_description }) => {
      log(`🔧 [MCP-SERVER] Executing tool: "create-servicenow-incident"  description="${short_description}"`);
      log(`➡️  [MCP-SERVER] Calling ServiceNow REST API...`);

      const url = `${SERVICENOW_BASE_URL}/api/now/table/incident`;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: basicAuthHeader(SERVICENOW_USERNAME, SERVICENOW_PASSWORD),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ short_description }),
        });

        const text = await res.text();
        let json: ServiceNowCreateIncidentResponse | null = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

        if (!res.ok) {
          log(`❌ [MCP-SERVER] ServiceNow returned HTTP ${res.status}`);
          return {
            content: [{
              type: "text",
              text: `ServiceNow POST failed: HTTP ${res.status} ${res.statusText}\n${text}`,
            }],
          };
        }

        const number = json?.result?.number ?? "(missing number)";
        const sysId  = json?.result?.sys_id  ?? "(missing sys_id)";

        log(`✅ [MCP-SERVER] Incident created — number: ${number}  sys_id: ${sysId}`);

        return {
          content: [{
            type: "text",
            text:
              `✅ Created ServiceNow incident\n` +
              `number: ${number}\n` +
              `sys_id: ${sysId}\n\n` +
              `Raw response:\n${JSON.stringify(json ?? text, null, 2)}`,
          }],
        };
      } catch (err) {
        log(`❌ [MCP-SERVER] Error calling ServiceNow: ${String(err)}`);
        return {
          content: [{ type: "text", text: `Error calling ServiceNow: ${String(err)}` }],
        };
      }
    }
  );

  // ...
}

