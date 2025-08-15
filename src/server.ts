import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Claude Code SDK (TypeScript)
import { query } from '@anthropic-ai/claude-code';

type AnyMsg = { type: string; subtype?: string; message?: any; result?: any; content?: any };

const ccSessions = new Map<string, { ccSessionId: string; cwd?: string }>();

const asList = (s?: string) => (s?.split(',').map(v => v.trim()).filter(Boolean)) || undefined;
const DEFAULT_ALLOWED = asList(process.env.CC_ALLOWED_TOOLS);
const DEFAULT_DISALLOWED = asList(process.env.CC_DISALLOWED_TOOLS);
const DEFAULT_CWD = process.env.CC_CWD;

// Build MCP server and tools
function buildServer() {
  const server = new McpServer({ name: 'claude-code-bridge', version: '0.1.0' });

  // Compatibility stubs (ChatGPT custom connector checks for these)
  server.registerTool(
    'search',
    { title: 'Search (stub)', description: 'Compatibility stub.', inputSchema: { q: z.string() } },
    async ({ q }) => ({ content: [{ type: 'text', text: `Search OK: "${q}"` }] })
  );

  server.registerTool(
    'fetch',
    { title: 'Fetch (stub)', description: 'Compatibility stub.', inputSchema: { id: z.string() } },
    async ({ id }) => ({ content: [{ type: 'text', text: `Fetch OK: id="${id}"` }] })
  );

  server.registerTool(
    'cc.start_session',
    {
      title: 'Start Claude Code session',
      description: 'Starts a multi-turn Claude Code session and returns {sessionId}.',
      inputSchema: {
        systemPrompt: z.string().optional(),
        cwd: z.string().optional(),
        model: z.string().optional(),
        allowedTools: z.array(z.string()).optional(),
        disallowedTools: z.array(z.string()).optional(),
        permissionMode: z.enum(['default', 'acceptEdits', 'plan', 'bypassPermissions']).optional(),
        maxTurns: z.number().int().positive().optional()
      }
    },
    async (args) => {
      const bridgeSessionId = randomUUID();
      const options: any = {
        systemPrompt: args.systemPrompt,
        cwd: args.cwd ?? DEFAULT_CWD,
        model: args.model,
        allowedTools: args.allowedTools ?? DEFAULT_ALLOWED,
        disallowedTools: args.disallowedTools ?? DEFAULT_DISALLOWED,
        permissionMode: args.permissionMode ?? 'default',
        maxTurns: args.maxTurns ?? 1
      };

      let ccSessionId: string | undefined;
      for await (const msg of query({ prompt: 'Initialize session', options })) {
        const m = msg as AnyMsg;
        if (m.type === 'system' && (m.subtype === 'init' || m.message?.subtype === 'init')) {
          ccSessionId = m.message?.session_id || (m as any).sessionId || (m as any).session_id;
        }
        if (m.type === 'result') break;
      }

      if (!ccSessionId) {
        return { content: [{ type: 'text', text: 'Failed to initialize Claude Code session.' }] };
      }

      ccSessions.set(bridgeSessionId, { ccSessionId, cwd: options.cwd });
      return { content: [{ type: 'text', text: JSON.stringify({ sessionId: bridgeSessionId }) }] };
    }
  );

  server.registerTool(
    'cc.send',
    {
      title: 'Send to Claude Code session',
      description: 'Sends a prompt to an existing session and returns assistant text.',
      inputSchema: {
        sessionId: z.string(),
        prompt: z.string(),
        maxTurns: z.number().int().positive().optional(),
        model: z.string().optional()
      }
    },
    async ({ sessionId, prompt, maxTurns, model }) => {
      const existing = ccSessions.get(sessionId);
      if (!existing) return { content: [{ type: 'text', text: `No active session: ${sessionId}` }] };

      let out = '';
      let error = '';

      const options: any = {
        resumeSessionId: existing.ccSessionId,
        model,
        maxTurns: maxTurns ?? 4,
        cwd: existing.cwd
      };

      try {
        for await (const msg of query({ prompt, options })) {
          const m = msg as AnyMsg;
          if (m.type === 'assistant' && m.message?.content) {
            for (const b of m.message.content) if (b.type === 'text') out += b.text;
          } else if (m.type === 'result') {
            const maybe = (m as any).sessionId || (m as any).session_id;
            if (maybe) existing.ccSessionId = maybe;
          } else if (m.type === 'system' && m.subtype === 'error') {
            error = String(m.message?.text ?? 'Unknown Claude Code error');
          }
        }
      } catch {
        // Fallback: resume via continueSession heuristic
        const fallbackOptions: any = { resumeSessionId: existing.ccSessionId, model, maxTurns: maxTurns ?? 4, cwd: existing.cwd };
        for await (const msg of query({ prompt, options: fallbackOptions })) {
          const m = msg as AnyMsg;
          if (m.type === 'assistant' && m.message?.content) {
            for (const b of m.message.content) if (b.type === 'text') out += b.text;
          } else if (m.type === 'result') {
            const maybe = (m as any).sessionId || (m as any).session_id;
            if (maybe) existing.ccSessionId = maybe;
          }
        }
      }

      if (error) return { content: [{ type: 'text', text: `Claude Code error: ${error}` }] };
      return { content: [{ type: 'text', text: out || '(no content)' }] };
    }
  );

  server.registerTool(
    'cc.end',
    { title: 'End bridge session', description: 'Deletes the bridge mapping; Claude may retain session server-side.', inputSchema: { sessionId: z.string() } },
    async ({ sessionId }) => {
      const existed = ccSessions.delete(sessionId);
      return { content: [{ type: 'text', text: existed ? 'ok' : 'not found' }] };
    }
  );

  return server;
}

async function start() {
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'] }));

  app.all('/mcp', async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });

    try {
      await server.connect(transport);
      await transport.handleRequest(req as any, res as any, (req as any).body ?? {});
      res.on('close', () => { transport.close(); server.close(); });
    } catch (err) {
      console.error('Transport error', err);
      res.status(500).send('Transport failure');
    }
  });

  const PORT = Number(process.env.PORT ?? 3000);
  app.listen(PORT, () => console.log(`Claude MCP bridge on :${PORT}  (POST /mcp)`));
}

start().catch((e) => { console.error(e); process.exit(1); });