# Claude Code MCP Bridge (Node/Express) + Optional Cloudflare Worker Front Door

This repo stands up a **remote MCP server** that exposes:
- Minimal `search`/`fetch` tools (compat stubs for ChatGPT custom-connector checks), and
- **Claude Code** tools:
  - `cc.start_session` – start a Claude Code multi-turn session (returns `{ sessionId }`)
  - `cc.send` – send subsequent prompts/commands into that session
  - `cc.end` – end/forget the bridge mapping

> **Why:** ChatGPT Agent Mode speaks MCP. This bridge lets GPT-5 Pro drive **Claude Code** to execute CLI tasks (Wrangler, Git, etc.) while keeping the connector contract intact.

## Quick start

### 0) Prereqs
- **Node 20+**
- **Anthropic API key**: `ANTHROPIC_API_KEY`
- **Windows** users: install **WSL** (recommended) or **Git Bash** so the Claude "Bash" tool has a POSIX shell.

### 1) Configure
```bash
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY
```

### 2) Install & Run (dev)
```bash
npm i
npm run dev    # tsx watch, runs on http://localhost:3000/mcp
```

### 3) Probe the bridge
```bash
# validates that cc.start_session/cc.send work and that a CLI command runs
node scripts/cc-probe.mjs http://localhost:3000/mcp "wrangler --version"
```

### 4) Hook into ChatGPT (Agent Mode)
- Settings → **Connectors** → **Custom** → Add → URL: `http://<your-host>:3000/mcp`
- Paste the **Agent kick-off prompt** below.

---

## Optional: Cloudflare Worker "front door"
If you want a Cloudflare URL, deploy the **proxy** Worker in `cf-frontdoor/`.

```bash
cd cf-frontdoor
npm i
# set the URL of the Node bridge (publicly reachable)
npx wrangler secret put BRIDGE_BASE_URL
# paste: https://your-node-bridge.example.com
npm run deploy
```
The Worker simply **forwards** `/mcp` POSTs to your Node bridge and forwards back responses, adding CORS headers needed by browser clients.

---

## Agent kick-off prompt (copy/paste)

> **Mission:** Use my custom **Claude Code** MCP connector to run CLI tasks on my repo.  
> **Start:** call `cc.start_session` with `allowedTools=["Bash","Read","Git"]`, `permissionMode="plan"` on Windows; switch to `"bypassPermissions"` only for idempotent one‑liners (e.g., `wrangler --version`).  
> **Then iterate:** use `cc.send` to:
> 1) `wrangler --version` and `git status` (return succinct text),  
> 2) `npx wrangler deploy` (return the deployed `*.workers.dev` URL),  
> 3) run health checks with my MCP verifier, and  
> 4) report final status.  
> Prefer WSL/Git Bash syntax; on PowerShell‑only shells, prefix commands with `powershell -c "<cmd>"`.

Example first tools calls the Agent should make:
1. `cc.start_session` → returns `{ "sessionId": "..." }`  
2. `cc.send` with: `Run: wrangler --version; return only the version.`  
3. `cc.send` with: `Run: git status --porcelain; summarize.`  
4. `cc.send` with: `Run: npx wrangler deploy; return the *.workers.dev URL only.`

---

## Files
- `src/server.ts` – Express + MCP Streamable HTTP transport
- `scripts/cc-probe.mjs` – local sanity probe (start session → run a CLI)
- `scripts/start-claude-bridge.ps1` – Windows NPX launcher
- `cf-frontdoor/` – optional Cloudflare Worker proxy
- `package.json` / `tsconfig.json` / `.env.example`

## Security
- Keep `ANTHROPIC_API_KEY` on the Node bridge (never in the Worker).
- Gate Claude tools with `CC_ALLOWED_TOOLS`/`CC_DISALLOWED_TOOLS` in `.env`.
- If exposing publicly, add IP allowlists / auth middleware as needed.

## License
MIT