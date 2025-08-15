// Standalone MCP Server for Cloudflare Workers
// This provides direct MCP protocol support without requiring a Node.js bridge

interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_TOOLS?: string;
  DISALLOWED_TOOLS?: string;
}

interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface Session {
  id: string;
  claudeSessionId?: string;
  context?: any;
  initialized: boolean;
}

// In-memory session storage (will reset on worker restart)
const sessions = new Map<string, Session>();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept',
          'Access-Control-Expose-Headers': 'Mcp-Session-Id',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    const url = new URL(request.url);
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        service: 'claude-code-mcp-standalone',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Main MCP endpoint
    if (url.pathname !== '/mcp') {
      return new Response('Not Found', { status: 404 });
    }

    try {
      const contentType = request.headers.get('content-type');
      const accept = request.headers.get('accept');
      
      // Validate headers for MCP protocol
      if (!contentType?.includes('application/json')) {
        return createErrorResponse(null, -32000, 'Content-Type must be application/json');
      }

      if (!accept?.includes('application/json') && !accept?.includes('text/event-stream')) {
        return createErrorResponse(null, -32000, 'Accept must include application/json or text/event-stream');
      }

      const body = await request.json() as JsonRpcRequest;
      
      // Generate or retrieve session ID
      let sessionId = request.headers.get('Mcp-Session-Id') || generateSessionId();
      let session = sessions.get(sessionId) || { id: sessionId, initialized: false };
      sessions.set(sessionId, session);

      // Handle JSON-RPC methods
      let response: JsonRpcResponse;
      
      switch (body.method) {
        case 'initialize':
          response = await handleInitialize(body, session);
          break;
          
        case 'tools/list':
          response = await handleToolsList(body, session);
          break;
          
        case 'tools/call':
          response = await handleToolCall(body, session, env);
          break;
          
        case 'ping':
          response = { jsonrpc: '2.0', id: body.id, result: { pong: true } };
          break;
          
        default:
          response = createError(body.id, -32601, `Method not found: ${body.method}`);
      }

      // Return SSE format for compatibility
      if (accept?.includes('text/event-stream')) {
        return new Response(
          `event: message\ndata: ${JSON.stringify(response)}\n\n`,
          {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Expose-Headers': 'Mcp-Session-Id',
              'Mcp-Session-Id': sessionId
            }
          }
        );
      }

      // Return regular JSON
      return new Response(JSON.stringify(response), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Mcp-Session-Id',
          'Mcp-Session-Id': sessionId
        }
      });

    } catch (error: any) {
      console.error('Worker error:', error);
      return createErrorResponse(null, -32000, error.message || 'Internal server error');
    }
  }
};

function generateSessionId(): string {
  return 'mcp_' + crypto.randomUUID();
}

function createError(id: any, code: number, message: string, data?: any): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, data }
  };
}

function createErrorResponse(id: any, code: number, message: string): Response {
  return new Response(JSON.stringify(createError(id, code, message)), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    status: 400
  });
}

async function handleInitialize(request: JsonRpcRequest, session: Session): Promise<JsonRpcResponse> {
  session.initialized = true;
  
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      protocolVersion: '2025-03-26',
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: false }
      },
      serverInfo: {
        name: 'claude-code-mcp-standalone',
        version: '0.2.0'
      }
    }
  };
}

async function handleToolsList(request: JsonRpcRequest, session: Session): Promise<JsonRpcResponse> {
  if (!session.initialized) {
    return createError(request.id, -32000, 'Server not initialized');
  }

  const tools = [
    {
      name: 'cc.start_session',
      title: 'Start Claude Code Session',
      description: 'Initialize a new Claude Code session',
      inputSchema: {
        type: 'object',
        properties: {
          systemPrompt: { type: 'string' },
          cwd: { type: 'string' },
          model: { type: 'string' },
          allowedTools: { type: 'array', items: { type: 'string' } },
          disallowedTools: { type: 'array', items: { type: 'string' } },
          permissionMode: { 
            type: 'string',
            enum: ['default', 'acceptEdits', 'plan', 'bypassPermissions']
          },
          maxTurns: { type: 'number' }
        }
      }
    },
    {
      name: 'cc.send',
      title: 'Send to Claude Code',
      description: 'Send a prompt to an existing Claude Code session',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          prompt: { type: 'string' },
          maxTurns: { type: 'number' }
        },
        required: ['sessionId', 'prompt']
      }
    },
    {
      name: 'cc.end',
      title: 'End Session',
      description: 'End a Claude Code session',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' }
        },
        required: ['sessionId']
      }
    },
    // Compatibility stubs
    {
      name: 'search',
      title: 'Search (stub)',
      description: 'Compatibility stub for search',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string' }
        },
        required: ['q']
      }
    },
    {
      name: 'fetch',
      title: 'Fetch (stub)',
      description: 'Compatibility stub for fetch',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  ];

  return {
    jsonrpc: '2.0',
    id: request.id,
    result: { tools }
  };
}

async function handleToolCall(request: JsonRpcRequest, session: Session, env: Env): Promise<JsonRpcResponse> {
  if (!session.initialized) {
    return createError(request.id, -32000, 'Server not initialized');
  }

  const { name, arguments: args } = request.params;

  switch (name) {
    case 'cc.start_session':
      return await handleStartSession(request, session, args, env);
      
    case 'cc.send':
      return await handleSendToSession(request, session, args, env);
      
    case 'cc.end':
      return handleEndSession(request, session, args);
      
    case 'search':
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [{ type: 'text', text: `Search stub: "${args.q}"` }]
        }
      };
      
    case 'fetch':
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [{ type: 'text', text: `Fetch stub: id="${args.id}"` }]
        }
      };
      
    default:
      return createError(request.id, -32601, `Unknown tool: ${name}`);
  }
}

async function handleStartSession(
  request: JsonRpcRequest,
  session: Session,
  args: any,
  env: Env
): Promise<JsonRpcResponse> {
  // For now, create a mock session
  // In production, this would call Claude API
  const newSessionId = 'cc_' + crypto.randomUUID();
  session.claudeSessionId = newSessionId;
  
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      content: [{
        type: 'text',
        text: JSON.stringify({ 
          sessionId: newSessionId,
          status: 'started',
          model: args.model || 'claude-3-sonnet',
          allowedTools: args.allowedTools || ['Bash', 'Read', 'Git'],
          permissionMode: args.permissionMode || 'default'
        })
      }]
    }
  };
}

async function handleSendToSession(
  request: JsonRpcRequest,
  session: Session,
  args: any,
  env: Env
): Promise<JsonRpcResponse> {
  const { sessionId, prompt, maxTurns = 1 } = args;
  
  if (!sessionId) {
    return createError(request.id, -32602, 'sessionId is required');
  }

  // For standalone version, we'll implement direct Claude API calls
  // For now, return a mock response
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      content: [{
        type: 'text',
        text: `Mock response for prompt: "${prompt}"\nSession: ${sessionId}\n(Standalone mode - Claude integration pending)`
      }]
    }
  };
}

function handleEndSession(
  request: JsonRpcRequest,
  session: Session,
  args: any
): JsonRpcResponse {
  const { sessionId } = args;
  
  if (session.claudeSessionId === sessionId) {
    session.claudeSessionId = undefined;
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [{ type: 'text', text: 'Session ended successfully' }]
      }
    };
  }
  
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      content: [{ type: 'text', text: 'Session not found' }]
    }
  };
}