## Local Setup Guide

## Prerequisites
- [Node.js v18+](https://nodejs.org)
- [ngrok account](https://ngrok.com) (free tier)

---

## 1. Install Dependencies

```bash
cd "server&client/mcp-server" && npm install
cd "../mcp-client" && npm install
cd "../../proxy4pdi" && npm install
```

## 2. Create `.env` Files

**`server&client/mcp-server/.env`**
```properties
SERVICENOW_BASE_URL="https://your-instance.service-now.com/"
SERVICENOW_USERNAME="your-username"
SERVICENOW_PASSWORD="your-password"
```

**`proxy4pdi/.env`**
```properties
ANTHROPIC_API_KEY="sk-ant-..."
NGROK_AUTHTOKEN="your-ngrok-token"
```

## 3. Run

```bash
chmod +x scripts/start.sh && ./scripts/start.sh
```

> ✅ The ngrok public URL will be printed — POST to `/prompt` to use it.