#!/usr/bin/env node
// Verify .mcp.json points at the 3echo AgentC MCP endpoint.
// Claude Code negotiates the actual MCP connection at session start; if it fails, Claude Code
// surfaces the error. This script only guards against a mis-edited .mcp.json.
const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const EXPECTED_URL = 'https://agentc.3echo.ai/api/mcp';
const EXPECTED_KEY = '3echo';

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.mcp.json'), 'utf8'));
} catch (e) {
  console.error('[creative-studio-post] .mcp.json missing or unreadable: ' + e.message);
  process.exit(2);
}

const server = cfg.mcpServers && cfg.mcpServers[EXPECTED_KEY];
if (!server) {
  console.error(`[creative-studio-post] .mcp.json missing mcpServers.${EXPECTED_KEY}`);
  process.exit(2);
}
if (server.url !== EXPECTED_URL) {
  console.error(`[creative-studio-post] .mcp.json server.url is "${server.url}", expected "${EXPECTED_URL}"`);
  process.exit(2);
}

console.log(`[creative-studio-post] agentc mcp configured: ${EXPECTED_URL}`);
process.exit(0);
