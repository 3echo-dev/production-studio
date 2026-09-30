#!/usr/bin/env node
// Heartbeat: records tool use to .board/heartbeat.log. Non-blocking.
const fs = require('fs');
const path = require('path');
try {
  const ws = require('../lib-workspace.js');
  // Never create a .board in a folder another studio/social plugin owns: a tool running in a
  // Social Pipeline or pre-prod project is that plugin's business, and dropping our .board there
  // is the cross-plugin contamination this guard exists to stop.
  if (!ws.foreignOwner()) {
    const dir = path.join(process.cwd(), '.board');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'heartbeat.log'), new Date().toISOString() + '\n');
  }
} catch {}
process.exit(0);
