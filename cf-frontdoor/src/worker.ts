export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }
    // Proxy JSON-RPC body to the Node bridge /mcp
    const target = `${env.BRIDGE_BASE_URL}/mcp`;
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await request.text()
    };
    const resp = await fetch(target, init);
    // Forward body + expose MCP session header for browser clients
    const out = new Response(resp.body, {
      status: resp.status,
      headers: resp.headers
    });
    out.headers.set("Access-Control-Allow-Origin", "*");
    out.headers.set("Access-Control-Expose-Headers", "Mcp-Session-Id");
    return out;
  }
};