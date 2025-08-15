const MCP_URL = "https://claude-code-mcp-standalone.rburns-fresno.workers.dev/mcp";

async function testCloudflareMP() {
  console.log("Testing Cloudflare MCP Server...\n");
  
  // Helper function to make requests
  let sessionId = null;
  
  async function mcpRequest(method, params = {}, id = 1) {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    };
    
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }
    
    const response = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params
      })
    });
    
    // Capture session ID from response
    const newSessionId = response.headers.get("Mcp-Session-Id");
    if (newSessionId) {
      sessionId = newSessionId;
    }
    
    const text = await response.text();
    
    // Parse SSE response if needed
    if (text.startsWith('event:')) {
      const lines = text.split('\n');
      const dataLine = lines.find(l => l.startsWith('data:'));
      if (dataLine) {
        return JSON.parse(dataLine.substring(5));
      }
    }
    
    return JSON.parse(text);
  }
  
  try {
    // 1. Initialize
    console.log("1. Initializing MCP server...");
    const init = await mcpRequest("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0" }
    });
    console.log("✅ Initialized:", init.result.serverInfo);
    console.log();
    
    // 2. List tools
    console.log("2. Listing available tools...");
    const tools = await mcpRequest("tools/list", {}, 2);
    
    if (tools.result && tools.result.tools) {
      console.log("✅ Available tools:");
      tools.result.tools.forEach(tool => {
        console.log(`   - ${tool.name}: ${tool.description}`);
      });
    } else {
      console.log("⚠️ No tools list received, response:", JSON.stringify(tools, null, 2));
    }
    console.log();
    
    // 3. Start a Claude Code session
    console.log("3. Starting Claude Code session...");
    const startSession = await mcpRequest("tools/call", {
      name: "cc.start_session",
      arguments: {
        allowedTools: ["Bash", "Read", "Git"],
        permissionMode: "bypassPermissions",
        maxTurns: 1
      }
    }, 3);
    
    const sessionData = JSON.parse(startSession.result.content[0].text);
    console.log("✅ Session started:", sessionData);
    console.log();
    
    // 4. Send a command to the session
    console.log("4. Sending command to session...");
    const sendCommand = await mcpRequest("tools/call", {
      name: "cc.send",
      arguments: {
        sessionId: sessionData.sessionId,
        prompt: "echo 'Hello from Cloudflare MCP!'",
        maxTurns: 1
      }
    }, 4);
    
    console.log("✅ Command response:", sendCommand.result.content[0].text);
    console.log();
    
    // 5. End the session
    console.log("5. Ending session...");
    const endSession = await mcpRequest("tools/call", {
      name: "cc.end",
      arguments: {
        sessionId: sessionData.sessionId
      }
    }, 5);
    
    console.log("✅ Session ended:", endSession.result.content[0].text);
    
    console.log("\n🎉 All tests passed! Cloudflare MCP server is working correctly.");
    console.log(`   Endpoint: ${MCP_URL}`);
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error(error);
  }
}

testCloudflareMP();