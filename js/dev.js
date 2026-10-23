'use strict';
// Dev mode: a password-gated 10× speed and stage skips. It stays on until exited.
// Only a salted SHA-256 hash of the password is stored. New hash:
//   printf '%s' 'a-light-below:PASSWORD' | shasum -a 256

const DEV_SALT = 'a-light-below:';
const DEV_HASH = '62c99ee2221bbff900cd78411b4ee3b6ce9167c70cf3b142847aebe855f3f085';
const UNLOCK_KEY = 'a-light-below-unlocked';

// Starting points for stage skips.
const LATE_BLD = { snare: 8, cot: 7, barrow: 1, den: 1, rack: 1, quarry: 1, tannery: 1, workshop: 1, mine: 1, smelter: 1 };
const LATE_JOBS = { trapper: 5, quarrier: 3, curer: 5, tanner: 4, miner: 3, smelter: 3 };
const STAGES = {
  keeper: { label: 'the keeper', t: 80, bld: {}, pop: 0, jobs: {}, gear: [], res: { moss: 150 } },
  warren: { label: 'the warren', t: 600,
    bld: { snare: 4, cot: 3, barrow: 1, den: 1, rack: 1, quarry: 1 }, pop: 10,
    jobs: { trapper: 3, quarrier: 2, curer: 2 }, gear: [],
    res: { moss: 250, meat: 30, hide: 25, stone: 40, ration: 10, scrap: 4 } },
  passage: { label: 'the passage', t: 1200, passage: true,
    bld: { snare: 6, cot: 5, barrow: 1, den: 1, rack: 1, quarry: 1, tannery: 1, workshop: 1 }, pop: 18,
    jobs: { trapper: 4, quarrier: 3, curer: 4, tanner: 3 }, gear: ['waterskin', 'pack', 'spear'],
    res: { moss: 300, meat: 40, hide: 40, stone: 80, leather: 30, ration: 40, scrap: 12 } },
  iron: { label: 'iron', t: 2000, passage: true, mine: true,
    bld: LATE_BLD, pop: 26, jobs: LATE_JOBS, gear: ['waterskin', 'pack', 'spear', 'wrap', 'lantern', 'blade'],
    res: { moss: 400, meat: 50, hide: 40, stone: 100, leather: 60, ration: 50, scrap: 30, ore: 25, iron: 30 } },
  stair: { label: 'the stair', t: 2800, passage: true, mine: true, stair: true,
    bld: LATE_BLD, pop: 28, jobs: LATE_JOBS,
    gear: ['waterskin', 'pack', 'spear', 'wrap', 'lantern', 'blade', 'plate', 'cask', 'frame', 'pick'],
    res: { moss: 400, meat: 50, hide: 40, stone: 100, leather: 40, ration: 80, scrap: 30, ore: 20, iron: 20 } },
};

let unlocked = stored(UNLOCK_KEY) === DEV_HASH;
if (speed === 'dev' && !unlocked) speed = 'hyper';

const pw = { open: false, err: '', focus: false }; // the password pop-up

async function tryUnlock(guess) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(DEV_SALT + guess));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hex === DEV_HASH) {
      unlocked = true; pw.open = false;
      store(UNLOCK_KEY, DEV_HASH);
      return act('speed', 'dev');
    }
    Object.assign(pw, { err: 'not quite.', focus: true });
  } catch (e) { pw.err = 'can\u2019t check here (needs https).'; }
  render();
}

// Jump to a stage. The dark's layout carries over, so skipping never reshuffles the map.
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
  for (const e of EVENTS) if (e.memory && e.avail(S)) S.eventsSeen[e.id] = true; // no backlog of memories
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

// Merged into ACT in main.js; all of these are allowed at any time.
const DEV_ACT = {
  dev: () => { if (!unlocked) Object.assign(pw, { open: true, err: '', focus: true }); },
  pwclose: () => Object.assign(pw, { open: false, err: '' }),
  devexit: () => {
    unlocked = false;
    store(UNLOCK_KEY, null);
    if (speed === 'dev') ACT.speed(lastSpeed);
  },
  stage: (id, sure) => {
    if (!unlocked || !STAGES[id]) return;
    if (!sure) return ask('skip to "' + STAGES[id].label + '"? your current progress will be replaced.', 'stage', id);
    jumpTo(id);
  },
};
