'use strict';
// Save state, settings, timing and small helpers.

function fresh() {
  return {
    v: 1, t: 0,
    lamp: 0, lampClock: 0, litAt: -1, darkFor: 0,
    keeperClock: 0, coldNag: 0,
    incomeClock: 0, popClock: 0, popNext: 20,
    eventClock: 0, eventNext: 150,
    flags: { lit: false, keeper: 0, warren: false, passage: false, mine: false, won: false },
    res: { moss: 4 }, seen: { moss: true },
    bld: {}, pop: 0, jobs: {}, gear: {}, cd: {}, once: {},
    log: ['it is dark. somewhere, water drips.'],
    tab: 'hollow', outfit: 5,
    map: null, exp: null, event: null, eventsSeen: {},
    stats: { steps: 0, kills: 0, deaths: 0 },
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || s.v !== 1) return null;
    const f = s.exp && s.exp.fight;
    if (f) { // resume a fight with a fresh wind-up
      Object.assign(f, { busy: false, plan: f.plan || 1, spd: f.spd || 2.5, verb: f.verb || 'strikes' });
      s.cd.foe = { end: Date.now() + f.spd * 1000, len: f.spd * 1000 };
    }
    const base = fresh();
    return Object.assign(base, s, { flags: Object.assign(base.flags, s.flags), stats: Object.assign(base.stats, s.stats) });
  } catch (e) { return null; }
}

function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* no storage */ } }

let S = load() || fresh();

// Testing-mode start points.
// The dark's layout carries over, so skipping stages never reshuffles the map.
function jumpTo(id) {
  const g = STAGES[id], map = S.map;
  S = fresh();
  S.map = map;
  Object.assign(S.flags, { lit: true, keeper: 3, warren: true, passage: !!g.passage, mine: !!g.mine });
  Object.assign(S, { t: g.t, litAt: 0, lamp: 4, pop: g.pop, bld: { ...g.bld }, jobs: { ...g.jobs }, res: { ...g.res } });
  for (const k in S.res) S.seen[k] = true;
  for (const k of g.gear) S.gear[k] = true;
  S.once = { gather: true, minehint: !!g.mine, dark: !!g.mine };
  S.outfit = Math.min(S.res.ration || 0, carry());
  if (g.passage) S.eventsSeen.voice = true;
  S.log = ['[dev mode] skipped to: ' + g.label + '.'];
  if (!g.mine) return;
  S.map = S.map || genMap();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ch = S.map.t[y][x];
    if (ch === 'V') { markUsed(x + ',' + y); reveal(x, y, 2); }
    if (ch === 'X' && g.stair) reveal(x, y, 2);
  }
  reveal(C, C, 4);
}

/* ---------- settings ---------- */

const SPEED_KEY = 'a-light-below-speed';
const SPEEDS = { classic: 1, hyper: 2, testing: 10 };
const BASE_SPEED = 2; // the timings in the code are tuned for 2×

// Testing mode is unlocked by a password; only its salted SHA-256 hash is stored.
// New hash: printf '%s' 'a-light-below:PASSWORD' | shasum -a 256
const TEST_SALT = 'a-light-below:';
const TEST_HASH = '62c99ee2221bbff900cd78411b4ee3b6ce9167c70cf3b142847aebe855f3f085';
const UNLOCK_KEY = 'a-light-below-unlocked';

const stored = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* no storage */ } };

let unlocked = stored(UNLOCK_KEY) === TEST_HASH;
const savedSpeed = stored(SPEED_KEY);
let speed = SPEEDS[savedSpeed] && (savedSpeed !== 'testing' || unlocked) ? savedSpeed : 'hyper';
let lastSpeed = speed === 'testing' ? 'hyper' : speed;
const rate = () => SPEEDS[speed] / BASE_SPEED;

/* ---------- timing ---------- */

// Time stops while paused or during a cutscene; cooldowns are shifted forward afterwards.
let pausedAt = 0, cutAt = 0;
const now = () => pausedAt || cutAt || Date.now();
const pace = ms => ms / Math.max(1, rate()); // animations speed up in testing, never slow down
const shiftCooldowns = since => { const gap = Date.now() - since; for (const c of Object.values(S.cd)) c.end += gap; };
const cooling = k => { const c = S.cd[k]; return !!c && now() < c.end; };
const cool = (k, ms) => { ms /= rate(); S.cd[k] = { end: now() + ms, len: ms }; };

/* ---------- helpers ---------- */

const has = c => Object.entries(c).every(([k, v]) => (S.res[k] || 0) >= v);
const pay = c => { for (const [k, v] of Object.entries(c)) S.res[k] = (S.res[k] || 0) - v; };
const add = (k, n) => { S.res[k] = (S.res[k] || 0) + n; if (n > 0) S.seen[k] = true; };

let logSeq = 0; // total notes ever, so the log can tell which lines are new
function note(msg) { S.log.unshift(msg); S.log.length = Math.min(S.log.length, 30); logSeq++; }
function noteOnce(id, msg) { if (!S.once[id]) { S.once[id] = true; note(msg); } }

const cap = () => (S.bld.cot || 0) * 4;
const assigned = () => Object.values(S.jobs).reduce((a, b) => a + b, 0);
const gatherers = () => Math.max(0, S.pop - assigned());
// After the lamp has been out a while, the warren stops working until it's relit.
const DARK_LIMIT = 20;
const stalled = () => S.flags.lit && S.lamp === 0 && S.darkFor >= DARK_LIMIT;
const NEEDS_LIGHT = ['rubble', 'snares', 'build', 'craft', 'embark']; // actions blocked while stalled
const workers = id => id === 'gatherer' ? gatherers() : (S.jobs[id] || 0);
function setPop(n) {
  S.pop = clamp(n, 0, cap());
  let over = assigned() - S.pop;
  for (const id of Object.keys(JOBS).reverse()) while (over > 0 && S.jobs[id] > 0) { S.jobs[id]--; over--; }
}

const weapon = () => S.gear.blade ? { name: 'iron blade', dmg: 6, cd: 1100 }
  : S.gear.spear ? { name: 'spear', dmg: 3, cd: 1400 } : { name: 'bare hands', dmg: 1, cd: 1000 };
const maxHp = () => S.gear.plate ? 35 : S.gear.wrap ? 20 : 10;
const maxWater = () => S.gear.cask ? 40 : S.gear.waterskin ? 20 : 10;
const carry = () => S.gear.frame ? 50 : S.gear.pack ? 25 : 10;
const sight = () => S.gear.lantern ? 3 : 2;
const lbl = k => (k === 'ration' ? 'rations' : k);
const bname = id => BUILD[id].label || id;
const cname = id => CRAFT[id].label || id;
const costStr = c => Object.entries(c).map(([k, v]) => v + ' ' + lbl(k)).join(', ');
