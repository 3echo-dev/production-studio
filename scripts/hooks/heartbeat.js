#!/usr/bin/env node
// Heartbeat: records tool use to .board/heartbeat.log. Non-blocking.
const fs = require('fs');
const path = require('path');
try {
  const cwd = process.cwd();
  const dir = path.join(cwd, '.board');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'heartbeat.log'), new Date().toISOString() + '\n');
} catch {}
process.exit(0);
