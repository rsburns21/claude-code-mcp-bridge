const MCP_URL = "http://localhost:8080/mcp";

async function testMCP() {
  console.log("Testing MCP Bridge...");
  
  // Simple test - just check if server responds
  try {
    const response = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0" }
        }
      })
    });
    
    const text = await response.text();
    console.log("Server response:", text);
    
    if (text.includes('"protocolVersion":"2025-03-26"')) {
      console.log("✅ MCP Bridge is working!");
    } else {
      console.log("❌ Unexpected response");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testMCP();