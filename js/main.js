'use strict';
// Player actions, input and start-up.

const pw = { open: false, err: '', focus: false }; // dev-mode password pop-up
let asking = null; // { text, a, arg }: a confirmation card waiting on yes / cancel
const ask = (text, a, arg) => { asking = { text, a, arg }; };

const ACT = {
  tab: id => { S.tab = id; },

  /* the hollow and the warren */
  light: () => {
    if (S.lamp > 0) return;
    if (S.flags.lit) {
      if (!has({ moss: 1 })) return;
      S.res.moss--;
      note(stalled() ? 'the lamp is lit. slowly, the warren stirs back to work.' : 'the lamp is lit.');
    } else {
      S.flags.lit = true; S.litAt = S.t;
      note('you strike the flint. a small flame catches, and the dark draws back a little.');
      flintScene();
    }
    S.lamp = 2; S.lampClock = 0; S.darkFor = 0;
  },
  feed: () => {
    if (cooling('feed') || S.lamp >= 4 || !has({ moss: 1 })) return;
    S.res.moss--; S.lamp++; S.lampClock = 0; cool('feed', 5000);
    note(['', '', 'the lamp is dim.', 'the lamp burns steady.', 'the lamp is bright. the walls glitter with mica.'][S.lamp]);
  },
  gather: () => {
    if (cooling('gather')) return;
    add('moss', S.bld.barrow ? 20 : 10); cool('gather', 12000);
    noteOnce('gather', 'pale moss grows thick on the cave walls. it peels away in dry sheets, and it burns.');
  },
  rubble: () => {
    if (cooling('rubble')) return;
    const st = rnd(3, 6); add('stone', st);
    let m = 'you pry ' + st + ' stone from the rubble';
    if (Math.random() < .3) { const sc = rnd(1, 3); add('scrap', sc); m += ' and find ' + sc + ' scrap underneath'; }
    note(m + '.'); cool('rubble', 20000);
  },
  snares: () => {
    if (cooling('snares') || !S.bld.snare) return;
    const n = S.bld.snare, meat = rnd(n, n * 2), hide = rnd(0, n);
    add('meat', meat); add('hide', hide); cool('snares', 30000);
    note('the snares hold ' + meat + ' meat' + (hide ? ' and ' + hide + ' hide' : '') + '.');
  },
  build: id => {
    const b = BUILD[id], n = S.bld[id] || 0;
    if (!b || n >= b.max || !b.req(S) || !has(b.cost(n))) return;
    pay(b.cost(n)); S.bld[id] = n + 1; note(b.note);
    if (id === 'workshop' && !S.flags.passage) {
      S.flags.passage = true;
      note('the keeper points past the warren, to a tunnel mouth half-choked with rubble. "the dark goes on for miles," she says. "take water."');
    }
  },
  craft: id => {
    const c = CRAFT[id];
    if (!c || S.gear[id] || !S.bld.workshop || !has(c.cost)) return;
    pay(c.cost); S.gear[id] = true;
    note('the keeper hands you the ' + cname(id) + '.');
  },
  job: arg => {
    const [id, d] = arg.split(':');
    if (!JOBS[id] || id === 'gatherer' || (d > 0 && !gatherers()) || (d < 0 && !(S.jobs[id] > 0))) return;
    S.jobs[id] = (S.jobs[id] || 0) + +d;
  },
  choose: i => {
    const ev = EVENTS.find(x => x.id === S.event), o = ev && ev.opts[+i];
    if (!o || (o.cost && !has(o.cost))) return;
    if (o.cost) pay(o.cost);
    note(o.fx());
    S.event = null;
  },

  /* the dark */
  outfit: d => { S.outfit = clamp(S.outfit + +d, 0, Math.min(Math.floor(S.res.ration || 0), carry())); },
  embark: () => {
    const n = clamp(S.outfit, 0, Math.min(Math.floor(S.res.ration || 0), carry()));
    if (n < 1 || S.exp) return;
    S.map = S.map || genMap();
    S.res.ration -= n;
    S.exp = { x: C, y: C, hp: maxHp(), maxHp: maxHp(), water: maxWater(), maxWater: maxWater(),
              rations: n, steps: 0, foodClock: 0, loot: {}, fight: null, scene: null };
    reveal(C, C, sight() + 1);
    note('you squeeze past the rubble and into the dark.');
    if (S.once.dark) revealUntil = Date.now() + 2600; // the cutscene only plays the first time
    else { S.once.dark = true; embarkScene(); }
  },
  move: dir => move(dir),
  cistern: () => {
    if (!canDig() || !canAffordDig()) return;
    S.exp.rations -= CISTERN_COST.rations;
    S.exp.water -= CISTERN_COST.water;
    S.map.t[S.exp.y][S.exp.x] = 'C';
    scene('a new cistern', ['you dig until your hands bleed, eating and drinking just to keep going.',
      'at last the floor gives way. black water seeps in, slow and cold. it will be full when you come back.']);
  },
  take: () => {
    const e = S.exp;
    if (!e || !e.scene) return;
    for (const [k, v] of Object.entries(e.scene.loot)) {
      if (k === 'ration') e.rations += v; else e.loot[k] = (e.loot[k] || 0) + v;
    }
    e.scene = null;
  },
  leave: () => { if (S.exp) S.exp.scene = null; },

  /* fighting */
  attack: () => {
    const f = S.exp && S.exp.fight;
    if (!f || f.busy || cooling('attack')) return;
    const w = weapon();
    if (Math.random() < .8) { f.hp -= w.dmg; flog('you hit the ' + f.name + '. (-' + w.dmg + ')'); }
    else flog('you miss.');
    cool('attack', w.cd);
    if (f.hp > 0) return;
    f.busy = true; // let the killing blow land before the fight gives way
    setTimeout(() => { if (S.exp && S.exp.fight === f) { win(); render(); save(); } }, pace(700));
  },
  eat: () => {
    const e = S.exp, f = e && e.fight;
    if (!e || e.rations < 1 || e.hp >= e.maxHp || (f && (f.busy || cooling('eat')))) return;
    e.rations--; e.hp = Math.min(e.maxHp, e.hp + 8);
    if (f) { flog('you wolf down a ration. (+8)'); cool('eat', EAT_CD); }
  },
  flee: () => {
    const e = S.exp, f = e && e.fight;
    if (!f || !f.flee || f.busy || cooling('flee')) return;
    if (Math.random() < .6) { e.fight = null; note('you escape into the dark.'); }
    else { flog('you cannot get away.'); cool('flee', FLEE_CD); }
  },

  /* footer */
  pause: () => {
    if (pausedAt) { shiftCooldowns(pausedAt); pausedAt = 0; startClock(); }
    else { pausedAt = Date.now(); clearInterval(clock); }
  },
  speed: id => {
    if (!SPEEDS[id] || id === speed || (id === 'testing' && !unlocked)) return;
    if (id !== 'testing') lastSpeed = id;
    speed = id;
    store(SPEED_KEY, id);
    if (!pausedAt) startClock();
  },
  restart: (_, sure) => {
    if (!S.flags.won && !sure) return ask('start over from the beginning? your progress will be lost.', 'restart');
    store(SAVE_KEY, null);
    S = fresh();
    closeCut();
  },

  /* dev mode (speed id 'testing' = 10×): unlocked by password, stays on until exited */
  testing: () => {
    if (!unlocked) Object.assign(pw, { open: true, err: '', focus: true });
  },
  pwclose: () => Object.assign(pw, { open: false, err: '' }),
  testexit: () => {
    unlocked = false;
    store(UNLOCK_KEY, null);
    if (speed === 'testing') ACT.speed(lastSpeed);
  },
  stage: (id, sure) => {
    if (!unlocked || !STAGES[id]) return;
    if (!sure) return ask('skip to "' + STAGES[id].label + '"? your current progress will be replaced.', 'stage', id);
    jumpTo(id);
  },
  yes: () => { const q = asking; asking = null; if (q) ACT[q.a](q.arg, true); },
  no: () => { asking = null; },
};

const META = ['pause', 'speed', 'restart', 'testing', 'pwclose', 'testexit', 'stage', 'yes', 'no']; // allowed any time
function act(a, arg) {
  if (!ACT[a] || cutAt) return;
  if (!META.includes(a) && (pausedAt || S.flags.won || (S.event && a !== 'choose'))) return;
  if (NEEDS_LIGHT.includes(a) && stalled()) return;
  ACT[a](arg);
  render(); save();
}

async function tryUnlock(guess) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TEST_SALT + guess));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hex === TEST_HASH) {
      unlocked = true; pw.open = false;
      store(UNLOCK_KEY, TEST_HASH);
      return act('speed', 'testing');
    }
    Object.assign(pw, { err: 'not quite.', focus: true });
  } catch (e) { pw.err = 'can’t check here (needs https).'; }
  render();
}

/* ---------- input ---------- */

document.addEventListener('click', ev => {
  if (cutSkip) return cutSkip();
  if (ev.target.id === 'pwbox') return act('pwclose');
  const b = ev.target.closest('[data-a]');
  if (b && !b.disabled) act(b.dataset.a, b.dataset.arg);
});

document.addEventListener('submit', ev => {
  ev.preventDefault();
  tryUnlock(ev.target.querySelector('input').value);
});

const KEYS = { ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e', w: 'n', s: 's', a: 'w', d: 'e' };
document.addEventListener('keydown', ev => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (pw.open) { if (ev.key === 'Escape') act('pwclose'); return; }
  if (cutSkip) {
    if ([' ', 'Enter', 'Escape'].includes(ev.key)) { ev.preventDefault(); cutSkip(); }
    return;
  }
  // keys on pop-up buttons (data-key): 1, 2, 3, space, enter, esc
  const name = { ' ': 'space', Enter: 'enter', Escape: 'esc' }[ev.key] || ev.key.toLowerCase();
  const hit = [...document.querySelectorAll('#modal:not([hidden]) [data-key]')].find(b => b.dataset.key.split(' ').includes(name));
  if (hit) { ev.preventDefault(); if (!hit.disabled) act(hit.dataset.a, hit.dataset.arg); return; }
  if (ev.key.toLowerCase() === 'p') { ev.preventDefault(); return act('pause'); }
  const dir = S.exp && KEYS[ev.key.length === 1 ? ev.key.toLowerCase() : ev.key];
  if (dir) { ev.preventDefault(); act('move', dir); }
});

window.addEventListener('beforeunload', save);

/* ---------- start ---------- */

let clock = null;
function startClock() { clearInterval(clock); clock = setInterval(tick, 1000 / rate()); }

render();
startClock();
if (S.flags.won) endingScene();
setInterval(fightLoop, 50);
(function frame() { updateCooldowns(); requestAnimationFrame(frame); })();
