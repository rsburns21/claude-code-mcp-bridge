# Cloudflare Worker front door (proxy)

This Worker forwards `/mcp` requests to your Node bridge and passes back responses,
adding CORS headers so browser-based clients (e.g., ChatGPT) can read `Mcp-Session-Id`.

## Deploy
```bash
npm i
# set your public Node bridge base URL
npx wrangler secret put BRIDGE_BASE_URL
npx wrangler deploy
```