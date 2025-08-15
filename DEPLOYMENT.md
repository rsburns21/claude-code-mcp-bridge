# Claude Code MCP Bridge - Deployment Guide

## Overview

This project provides two deployment options:
1. **Local Node.js Bridge** - Run locally with direct Claude Code SDK integration
2. **Cloudflare Worker (Standalone)** - Deploy globally with MCP protocol support

## Deployed Endpoints

### Production (Cloudflare Workers)
- **MCP Endpoint:** `https://claude-code-mcp-standalone.rburns-fresno.workers.dev/mcp`
- **Health Check:** `https://claude-code-mcp-standalone.rburns-fresno.workers.dev/health`
- **Version:** 0.2.0
- **Protocol:** MCP 2025-03-26

### Local Development
- **MCP Endpoint:** `http://localhost:8080/mcp`
- **Default Port:** 8080 (configurable via PORT env var)

## Available Tools

The MCP server exposes the following tools:

1. **cc.start_session** - Initialize a new Claude Code session
   - Parameters: `systemPrompt`, `cwd`, `model`, `allowedTools`, `disallowedTools`, `permissionMode`, `maxTurns`
   
2. **cc.send** - Send a prompt to an existing Claude Code session
   - Parameters: `sessionId`, `prompt`, `maxTurns`
   
3. **cc.end** - End a Claude Code session
   - Parameters: `sessionId`

4. **search** (stub) - Compatibility stub for search operations
5. **fetch** (stub) - Compatibility stub for fetch operations

## Quick Start

### Testing the Deployed Server

```bash
# Test health endpoint
curl https://claude-code-mcp-standalone.rburns-fresno.workers.dev/health

# Test MCP protocol
curl -X POST https://claude-code-mcp-standalone.rburns-fresno.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

### Running Tests

```bash
# Test local server
node test-mcp.js

# Test Cloudflare deployment
node test-cloudflare-mcp.js
```

## Deployment Instructions

### Deploy to Cloudflare Workers

1. Navigate to the Cloudflare Worker directory:
```bash
cd cf-frontdoor
```

2. Install dependencies:
```bash
npm install
```

3. Configure your account in `wrangler.toml`:
```toml
account_id = "your-account-id"
```

4. Deploy:
```bash
npx wrangler deploy
```

5. Set secrets (if using Claude API):
```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```env
ANTHROPIC_API_KEY=your-api-key
PORT=8080
CC_ALLOWED_TOOLS=Bash,Read,Git,Write,Edit
CC_CWD=C:\\Users\\your-path
```

3. Run the server:
```bash
npx tsx src/server.ts
```

## Architecture

### Standalone Cloudflare Worker
- Direct MCP protocol implementation
- Session management in Worker memory
- CORS support for browser clients
- SSE (Server-Sent Events) response format
- Global deployment on Cloudflare edge network

### Node.js Bridge
- Full Claude Code SDK integration
- Local file system access
- Direct Claude API communication
- Development and testing environment

## Integration with ChatGPT

Use this prompt for ChatGPT Agent Mode:

```
You are connected via the Claude Code MCP bridge at https://claude-code-mcp-standalone.rburns-fresno.workers.dev/mcp

Step 1: Initialize with cc.start_session using:
- allowedTools: ["Bash", "Read", "Git"]
- permissionMode: "plan" or "bypassPermissions"
- maxTurns: 4

Step 2: For each task, use cc.send with:
- sessionId: from start_session response
- prompt: your command or question
- maxTurns: 2

Step 3: End with cc.end when complete
```

## Security Considerations

1. **API Keys**: Never commit API keys to the repository
2. **CORS**: Currently allows all origins (`*`) - restrict in production
3. **Rate Limiting**: Cloudflare Workers have built-in DDoS protection
4. **Session Management**: Sessions reset on Worker restart

## Monitoring

- Cloudflare Dashboard: https://dash.cloudflare.com
- Worker Analytics: Real-time metrics and logs
- Health endpoint for uptime monitoring

## Support

- GitHub Repository: https://github.com/rsburns21/claude-code-mcp-bridge
- Issues: https://github.com/rsburns21/claude-code-mcp-bridge/issues

## Version History

- **v0.2.0** - Standalone Cloudflare Worker with full MCP protocol
- **v0.1.0** - Initial Node.js bridge implementation