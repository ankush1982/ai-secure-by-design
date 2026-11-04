// Streamable HTTP transport for the MCP server. It is opt-in (--http) and imported only then,
// so a stdio start, which is what the Claude plugin uses, never loads Express.
import { timingSafeEqual } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

function tokenMatches(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, '') ?? '');
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function serveHttp(buildServer: () => McpServer, root: string, host: string, port: number): Promise<void> {
  const token = process.env.SBD_HTTP_TOKEN;
  if (!LOOPBACK.has(host) && !token) {
    throw new Error(`refusing to listen on ${host} without SBD_HTTP_TOKEN; the server reads files in ${root}`);
  }
  const allowedHosts = process.env.SBD_ALLOWED_HOSTS?.split(',').map((h) => h.trim()).filter(Boolean);
  const app = createMcpExpressApp({ host, ...(allowedHosts?.length ? { allowedHosts } : {}) });

  // Stateless mode: one server and transport per request, so nothing leaks between clients.
  app.post('/mcp', async (req: any, res: any) => {
    if (token && !tokenMatches(req.headers.authorization, token)) {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'unauthorized' }, id: null });
      return;
    }
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  const notAllowed = (_req: unknown, res: any) =>
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);

  await new Promise<void>((ok, fail) => {
    const s = app.listen(port, host, () => ok());
    s.on('error', fail);
  });
  process.stderr.write(`secure-by-design MCP server on http://${host}:${port}/mcp (root ${root})\n`);
}
