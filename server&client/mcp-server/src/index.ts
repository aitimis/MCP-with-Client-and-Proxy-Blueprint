import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerServiceNowTools } from "./tools/incident.js";

// All logs go to stderr — stdout is reserved for JSON-RPC messages
const log = (...args: unknown[]) => process.stderr.write(args.join(" ") + "\n");

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";

async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const headers = { "User-Agent": USER_AGENT, Accept: "application/geo+json" };
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return (await response.json()) as T;
  } catch (error) {
    log("❌ [MCP-SERVER] NWS request failed:", String(error));
    return null;
  }
}

interface AlertFeature {
  properties: {
    event?: string; areaDesc?: string;
    severity?: string; status?: string; headline?: string;
  };
}
interface AlertsResponse { features: AlertFeature[] }
interface PointsResponse { properties: { forecast?: string } }
interface ForecastPeriod {
  name?: string; temperature?: number; temperatureUnit?: string;
  windSpeed?: string; windDirection?: string; shortForecast?: string;
}
interface ForecastResponse { properties: { periods: ForecastPeriod[] } }

function formatAlert(feature: AlertFeature): string {
  const p = feature.properties;
  return [
    `Event: ${p.event ?? "Unknown"}`, `Area: ${p.areaDesc ?? "Unknown"}`,
    `Severity: ${p.severity ?? "Unknown"}`, `Status: ${p.status ?? "Unknown"}`,
    `Headline: ${p.headline ?? "No headline"}`, "---",
  ].join("\n");
}

const server = new McpServer({ name: "weather", version: "1.0.0" });

// ── Tool: get-alerts ──────────────────────────────────────────────────────────
server.registerTool(
  "get-alerts",
  {
    title: "Get Weather Alerts",
    description: "Get weather alerts for a state",
    inputSchema: {
      state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
    },
  },
  async ({ state }) => {
    log(`🔧 [MCP-SERVER] Executing tool: "get-alerts"  state=${state}`);

    const stateCode = state.toUpperCase();
    const alertsData = await makeNWSRequest<AlertsResponse>(
      `${NWS_API_BASE}/alerts?area=${stateCode}`
    );

    if (!alertsData) {
      return { content: [{ type: "text", text: "Failed to retrieve alerts data" }] };
    }

    const features = alertsData.features ?? [];
    log(`✅ [MCP-SERVER] "get-alerts" done — ${features.length} alert(s) found`);

    if (features.length === 0) {
      return { content: [{ type: "text", text: `No active alerts for ${stateCode}` }] };
    }

    return {
      content: [{
        type: "text",
        text: `Active alerts for ${stateCode}:\n\n${features.map(formatAlert).join("\n")}`,
      }],
    };
  }
);

// ── Tool: get-forecast ────────────────────────────────────────────────────────
server.registerTool(
  "get-forecast",
  {
    title: "Get Weather Forecast",
    description: "Get weather forecast for a location",
    inputSchema: {
      latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
      longitude: z.number().min(-180).max(180).describe("Longitude of the location"),
    },
  },
  async ({ latitude, longitude }) => {
    log(`🔧 [MCP-SERVER] Executing tool: "get-forecast"  lat=${latitude} lon=${longitude}`);

    const pointsData = await makeNWSRequest<PointsResponse>(
      `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`
    );

    if (!pointsData) {
      return {
        content: [{
          type: "text",
          text: `Failed to retrieve grid point data for ${latitude}, ${longitude}. Only US locations are supported.`,
        }],
      };
    }

    const forecastUrl = pointsData.properties?.forecast;
    if (!forecastUrl) {
      return { content: [{ type: "text", text: "Failed to get forecast URL from grid point data" }] };
    }

    const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
    if (!forecastData) {
      return { content: [{ type: "text", text: "Failed to retrieve forecast data" }] };
    }

    const periods = forecastData.properties?.periods ?? [];
    log(`✅ [MCP-SERVER] "get-forecast" done — ${periods.length} period(s)`);

    if (periods.length === 0) {
      return { content: [{ type: "text", text: "No forecast periods available" }] };
    }

    const formattedForecast = periods.map((p: ForecastPeriod) =>
      [
        `${p.name ?? "Unknown"}:`,
        `Temperature: ${p.temperature ?? "?"}°${p.temperatureUnit ?? "F"}`,
        `Wind: ${p.windSpeed ?? "?"} ${p.windDirection ?? ""}`,
        `${p.shortForecast ?? "No forecast"}`,
        "---",
      ].join("\n")
    );

    return {
      content: [{
        type: "text",
        text: `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join("\n")}`,
      }],
    };
  }
);

// ── ServiceNow tools ──────────────────────────────────────────────────────────
registerServiceNowTools(server);

// ── Start server ──────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("✅ [MCP-SERVER] Server live — listening on stdio for tool calls");
}

main().catch((error) => {
  log("❌ [MCP-SERVER] Fatal error:", error);
  process.exit(1);
});