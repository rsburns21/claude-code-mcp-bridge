#!/usr/bin/env node
// scripts/cc-probe.mjs
const MCP_URL = process.argv[2] || "http://localhost:3000/mcp";
const CMD = process.argv[3] || "wrangler --version";

const post = async (body) => {
  const r = await fetch(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
};

(async () => {
  const init = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "cc-probe", version: "1.0" } },
  });
  if (init?.result?.protocolVersion !== "2025-03-26") throw new Error("initialize failed");

  const list = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const names = (list?.result?.tools || []).map((t) => t.name);
  if (!names.includes("cc.start_session") || !names.includes("cc.send")) throw new Error(`bridge missing cc tools: ${names}`);

  const start = await post({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "cc.start_session", arguments: { allowedTools: ["Bash", "Read", "Git"], permissionMode: "bypassPermissions", maxTurns: 1 } },
  });
  const txt = start?.result?.content?.[0]?.text || start?.result?.content?.[0]?.resource?.text || "{}";
  const sess = JSON.parse(txt).sessionId;
  if (!sess) throw new Error("no sessionId from start");

  const send = await post({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "cc.send", arguments: { sessionId: sess, prompt: `Run: ${CMD}\nReturn only stdout.`, maxTurns: 2 } },
  });
  const out = send?.result?.content?.[0]?.text || send?.result?.content?.[0]?.resource?.text || "";
  console.log(out.trim() || "(no output)");

  process.exit(0);
})().catch((e) => { console.error("cc-probe failed:", e?.message || e); process.exit(1); });