#!/usr/bin/env node
// End-of-turn: warn if .board/outbox.jsonl has queued writes that were not pushed.
const fs = require('fs');
const path = require('path');
try {
  const outbox = path.join(process.cwd(), '.board', 'outbox.jsonl');
  if (fs.existsSync(outbox) && fs.statSync(outbox).size > 0) {
    console.warn('[creative-studio-post] warning: .board/outbox.jsonl has un-pushed writes at end of turn');
  }
} catch {}
process.exit(0);
