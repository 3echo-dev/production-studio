// Parses workflows/post.md into a state table.
// Rows: | # | State | Director | Skill | Playbook | Human | Output | State after | Rollback to |
const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseWorkflow(mdPath) {
  const text = fs.readFileSync(mdPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  let headers = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) { inTable = false; headers = null; continue; }
    const cells = line.slice(1, -1).split('|').map(c => c.trim());
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue;
    if (!headers) {
      headers = cells.map((c, i) => {
        const s = slug(c);
        return s || (i === 0 ? 'n' : `col${i}`);
      });
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ''; });
    if (row.n && /^\d+$/.test(row.n)) rows.push(row);
  }
  return rows;
}

module.exports = { parseWorkflow, path: path.join(PLUGIN_ROOT, 'workflows/post.md'), PLUGIN_ROOT };
