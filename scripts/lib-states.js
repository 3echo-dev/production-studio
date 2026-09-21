// The state table as data, so it can be validated and translated instead of retyped.
//
// Twelve workflow rows become these states; two gates. `next` lists the states a job may move
// to. `rollback` is where "start over" at a gate sends it. An empty `next` means terminal.
const STATES = [
  { id: 'INTAKE_PENDING',  label: 'Waiting for the intake declarations',           next: ['PLANNED', 'BLOCKED', 'CANCELLED'] },
  { id: 'PLANNED',         label: 'Routed; ingesting the footage',                  next: ['INGESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  // Picture
  { id: 'INGESTED',        label: 'Footage catalogued; cutting the first pass',     next: ['CUT_DRAFTED', 'INGESTED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'CUT_DRAFTED',     label: 'First cut on the board; shortlisting music',     next: ['BGM_PROPOSED', 'CUT_DRAFTED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  // Audio
  { id: 'BGM_PROPOSED',    label: 'Three tracks on the board; the pick is yours',   next: ['BGM_CHOSEN', 'VO_PLACED', 'BGM_PROPOSED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'BGM_CHOSEN',      label: 'Music chosen; placing the voice-over',           next: ['VO_PLACED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'VO_PLACED',       label: 'Voice-over placed; syncing the mix',             next: ['SYNCED', 'VO_PLACED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'SYNCED',          label: 'Mix synced; reviewing picture and audio',        next: ['REVIEWED', 'SYNCED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'REVIEWED',        label: 'Reviewed; ready for your lock',                  next: ['AWAITING_GATE_A', 'CUT_DRAFTED', 'VO_PLACED', 'SYNCED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'AWAITING_GATE_A', label: 'Gate A: picture and audio lock is yours to give', gate: 'A', rollback: 'CUT_DRAFTED',
    next: ['GATE_A_PASSED', 'CUT_DRAFTED', 'BGM_PROPOSED', 'VO_PLACED', 'SYNCED', 'REVIEWED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'GATE_A_PASSED',   label: 'Picture and audio locked; finish opens',         next: ['FINISHING', 'PACKAGED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  // Finish
  { id: 'FINISHING',       label: 'B-roll and motion graphics on request',          next: ['FINISHING', 'PACKAGED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'PACKAGED',        label: 'Bundle built; ready for release',                next: ['AWAITING_GATE_B', 'FINISHING', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'AWAITING_GATE_B', label: "Gate B: release is the production lead's call",  gate: 'B', rollback: 'FINISHING',
    next: ['RELEASED', 'FINISHING', 'PACKAGED', 'CHANGES_REQUESTED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'RELEASED',        label: 'Bundle released to the editor',                  next: ['CHANGES_REQUESTED', 'COMPLETE', 'CANCELLED'] },
  // Anywhere
  { id: 'CHANGES_REQUESTED', label: 'Making the change you asked for',
    next: ['INGESTED', 'CUT_DRAFTED', 'BGM_PROPOSED', 'VO_PLACED', 'SYNCED', 'FINISHING', 'PACKAGED', 'BLOCKED', 'ESCALATED', 'CANCELLED'] },
  { id: 'BLOCKED',         label: 'Waiting on something before I can carry on',
    next: ['INTAKE_PENDING', 'PLANNED', 'INGESTED', 'CUT_DRAFTED', 'BGM_PROPOSED', 'VO_PLACED', 'FINISHING', 'ESCALATED', 'CANCELLED'] },
  { id: 'ESCALATED',       label: 'Stuck, needs you',
    next: ['INGESTED', 'CUT_DRAFTED', 'FINISHING', 'CHANGES_REQUESTED', 'BLOCKED', 'CANCELLED'] },
  { id: 'COMPLETE',        label: 'Editor has the bundle; job done',                next: [] },
  { id: 'CANCELLED',       label: 'Cancelled',                                      next: [] },
];

const BY_ID = Object.fromEntries(STATES.map(s => [s.id, s]));
const get = id => BY_ID[id] || null;
const exists = id => Boolean(BY_ID[id]);
const label = id => (BY_ID[id] ? BY_ID[id].label : id);
const isGate = id => Boolean(BY_ID[id] && BY_ID[id].gate);
const gateOf = id => (BY_ID[id] ? BY_ID[id].gate || null : null);
const rollbackOf = id => (BY_ID[id] ? BY_ID[id].rollback || null : null);
const ids = () => STATES.map(s => s.id);

function canMove(from, to) {
  if (!exists(from) || !exists(to)) return false;
  if (from === to) return true;
  return (BY_ID[from].next || []).includes(to);
}

const APPROVED_STATE = { A: 'GATE_A_PASSED', B: 'RELEASED' };
const AWAITING_STATE = Object.fromEntries(STATES.filter(s => s.gate).map(s => [s.gate, s.id]));

// The state each row of workflows/post.md earns, by row number, and the gate a row opens.
const ROW_STATE = { 1: 'PLANNED', 2: 'INGESTED', 3: 'CUT_DRAFTED', 4: 'BGM_PROPOSED', 5: 'VO_PLACED', 6: 'SYNCED',
  7: 'REVIEWED', 8: 'AWAITING_GATE_A', 9: 'FINISHING', 10: 'FINISHING', 11: 'PACKAGED', 12: 'AWAITING_GATE_B' };
const ROW_GATE = { 8: 'A', 12: 'B' };

// The board's own word for where a project is. projects/{id}.status on Post Control takes these.
const BOARD_STATUS = {
  INTAKE_PENDING: 'intake', PLANNED: 'intake',
  INGESTED: 'picture', CUT_DRAFTED: 'picture',
  BGM_PROPOSED: 'audio', BGM_CHOSEN: 'audio', VO_PLACED: 'audio', SYNCED: 'audio', REVIEWED: 'audio',
  AWAITING_GATE_A: 'gate_a', GATE_A_PASSED: 'finish', FINISHING: 'finish', PACKAGED: 'finish',
  AWAITING_GATE_B: 'gate_b', RELEASED: 'released', COMPLETE: 'released', CANCELLED: 'killed',
};
const boardStatusOf = id => BOARD_STATUS[id] || null;

// The board items a director is holding while the job sits in a state. Entering the state
// marks them Working; delivery (record-version.js) marks them Draft.
const ITEMS_OF = {
  PLANNED: ['ingest'], INGESTED: ['sequence'], CUT_DRAFTED: ['bgm'], BGM_CHOSEN: ['vo_drop'],
  VO_PLACED: ['sync'], SYNCED: ['review'], GATE_A_PASSED: ['broll', 'mograph'], FINISHING: ['package'],
};
const itemsWorkedIn = id => ITEMS_OF[id] || [];

// One sentence per state, in the words a person reads.
const SENTENCES = {
  INTAKE_PENDING: 'Waiting for the intake declarations (aspect ratio, duration, who leads) before the work can start.',
  PLANNED: 'Routed. The footage and audio files are being catalogued.',
  INGESTED: 'The footage is catalogued and the first cut is being sequenced against the storyboard.',
  CUT_DRAFTED: 'The first cut is on the board and three music candidates are being shortlisted.',
  BGM_PROPOSED: 'Three tracks are on the board. Pick one; the sync will not start without it.',
  BGM_CHOSEN: 'Music chosen. The voice-over is being placed against the script markers.',
  VO_PLACED: 'Voice-over placed. The mix is being synced and ducked.',
  SYNCED: 'The mix is synced. Picture and audio are being reviewed together.',
  REVIEWED: 'Reviewed. Gate A is ready for your lock on the board.',
  AWAITING_GATE_A: 'Gate A: lock picture and audio on the board, or say what to change. Nothing downstream starts until you do.',
  GATE_A_PASSED: 'Picture and audio are locked. B-roll requests and the motion-graphics template are open.',
  FINISHING: 'Finishing: B-roll shots on request, motion graphics from the approved sample, then the bundle.',
  PACKAGED: 'The Premiere bundle is built and checked. Gate B is ready for release.',
  AWAITING_GATE_B: 'Gate B: the production lead releases the bundle on the board; the editor acknowledges the handoff.',
  RELEASED: 'The bundle is released. The editor opens project.fcpxml in Premiere.',
  CHANGES_REQUESTED: 'Making the change you asked for.',
  BLOCKED: 'Waiting on something before I can carry on.',
  ESCALATED: 'Stuck, and it needs you.',
  COMPLETE: 'The editor has the bundle. Job done.',
  CANCELLED: 'Cancelled.',
};
const sentence = id => SENTENCES[id] || 'Working on it.';

module.exports = {
  STATES, get, exists, label, isGate, gateOf, rollbackOf, ids, canMove,
  APPROVED_STATE, AWAITING_STATE, ROW_STATE, ROW_GATE, BOARD_STATUS, boardStatusOf, ITEMS_OF, itemsWorkedIn,
  SENTENCES, sentence,
};