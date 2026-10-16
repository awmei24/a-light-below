/* A Light Below — an original incremental text game. */
(() => {
'use strict';

const SAVE_KEY = 'a-light-below-v1';
const SPEED_KEY = 'a-light-below-speed';
const SPEEDS = { classic: 0.5, normal: 1, testing: 5 }; // multiplier on the clock and all cooldowns
const LAMP = ['dark', 'guttering', 'dim', 'steady', 'bright'];
const RES = ['moss', 'meat', 'hide', 'stone', 'leather', 'ration', 'scrap', 'ore', 'iron'];
const N = 31, C = 15; // map size and centre

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lbl = k => (k === 'ration' ? 'rations' : k);
const costStr = c => Object.entries(c).map(([k, v]) => v + ' ' + lbl(k)).join(', ');

/* ---------- data ---------- */

const BUILD = {
  snare:    { max: 10, cost: n => ({ moss: 10 + n * 5 }), req: s => s.flags.keeper >= 3,
              note: 'a snare of braided root, set across a rat run.' },
  cot:      { max: 20, cost: n => ({ moss: 40 + n * 15 }), req: s => s.flags.keeper >= 3,
              note: 'a cot of dried moss. room for four more souls.' },
  barrow:   { max: 1, cost: () => ({ moss: 30 }), req: s => s.flags.keeper >= 3,
              note: 'a barrow. more moss can be hauled at once.' },
  den:      { label: "trappers' den", max: 1, cost: () => ({ moss: 80, hide: 5 }), req: s => (s.bld.snare || 0) >= 2,
              note: 'the den is ready. trappers can work the far tunnels.' },
  rack:     { label: 'curing rack', max: 1, cost: () => ({ moss: 60, meat: 5 }), req: s => s.seen.meat,
              note: 'smoke curls around the curing rack. meat will keep now.' },
  quarry:   { max: 1, cost: () => ({ moss: 100 }), req: s => s.pop >= 1,
              note: 'a quarry face is cut into the warren wall.' },
  tannery:  { max: 1, cost: () => ({ moss: 120, stone: 20 }), req: s => s.seen.hide && s.seen.stone,
              note: 'the tannery stinks, but hide becomes leather.' },
  workshop: { max: 1, cost: () => ({ moss: 150, stone: 40, leather: 10 }), req: s => s.seen.leather,
              note: 'the keeper sets up a workshop. she can make real tools now.' },
  mine:     { max: 1, cost: () => ({ moss: 120, stone: 40, ration: 5 }), req: s => s.flags.mine,
              note: 'a crew is sent out to work the ore seam.' },
  smelter:  { max: 1, cost: () => ({ moss: 200, stone: 80, leather: 10 }), req: s => s.seen.ore,
              note: 'the smelter roars. the warren is warmer than it has ever been.' },
};

const JOBS = {
  gatherer: { req: null,      in: {},                   out: { moss: 2 } },
  trapper:  { req: 'den',     in: {},                   out: { meat: 1, hide: 1 } },
  quarrier: { req: 'quarry',  in: {},                   out: { stone: 1 } },
  miner:    { req: 'mine',    in: { ration: 1 },        out: { ore: 2 } },
  curer:    { req: 'rack',    in: { meat: 2, moss: 2 }, out: { ration: 1 } },
  tanner:   { req: 'tannery', in: { hide: 2, moss: 1 }, out: { leather: 1 } },
  smelter:  { req: 'smelter', in: { ore: 1, moss: 2 },  out: { iron: 1 } },
};

const CRAFT = {
  waterskin: { cost: { leather: 10 }, desc: 'carry 20 water' },
  pack:      { cost: { leather: 20 }, desc: 'carry 25 rations' },
  spear:     { cost: { moss: 30, stone: 10, leather: 5 }, desc: '3 damage' },
  wrap:      { label: 'leather wrap', cost: { leather: 30 }, desc: '20 health' },
  lantern:   { cost: { scrap: 10, leather: 5 }, desc: 'see further in the dark' },
  blade:     { label: 'iron blade', cost: { iron: 20, leather: 10 }, desc: '6 damage' },
  plate:     { label: 'iron plate', cost: { iron: 40, leather: 20 }, req: 'wrap', desc: '35 health' },
  cask:      { cost: { leather: 40, iron: 10 }, req: 'waterskin', desc: 'carry 40 water' },
  frame:     { label: 'frame pack', cost: { leather: 60, iron: 15 }, req: 'pack', desc: 'carry 50 rations' },
  pick:      { label: 'iron pick', cost: { iron: 35, stone: 20 }, desc: 'breaks fused iron' },
};

const FOES = {
  1: [{ name: 'blind rat', hp: 4, dmg: 1, acc: .7, loot: () => ({ meat: rnd(1, 3), hide: rnd(0, 1) }) },
      { name: 'pale crawler', hp: 6, dmg: 1, acc: .75, loot: () => ({ meat: rnd(1, 2), scrap: rnd(0, 1) }) }],
  2: [{ name: 'tunnel scavenger', hp: 12, dmg: 2, acc: .65, loot: () => ({ scrap: rnd(2, 5), ration: rnd(0, 2) }) },
      { name: 'gristle hound', hp: 10, dmg: 3, acc: .6, loot: () => ({ meat: rnd(3, 6), hide: rnd(1, 3) }) }],
  3: [{ name: 'hollow-eyed raider', hp: 18, dmg: 3, acc: .65, loot: () => ({ iron: rnd(2, 5), scrap: rnd(3, 8), ration: rnd(1, 3) }) },
      { name: 'deep crawler', hp: 22, dmg: 3, acc: .6, loot: () => ({ meat: rnd(5, 9), hide: rnd(3, 6) }) }],
};

const EVENTS = [
  { id: 'voice', once: true, avail: s => s.flags.passage && s.pop >= 2, title: 'a voice from the old city',
    text: ['a digger stumbles back from the tunnels, pale and shaking.',
           '"there is a stair," he says. "far out, past the stations. it climbs and climbs."',
           '"something guards it. and the top is sealed with iron. you would need a strong pick."'],
    opts: [{ label: 'remember the stair', fx: () => 'somewhere out there, a stair leads up.' }] },
  { id: 'tremor', avail: s => s.pop >= 1, title: 'a tremor',
    text: ['the ground shudders. dust pours from the ceiling of the warren.', 'somewhere close, stone grinds against stone.'],
    opts: [
      { label: 'shore up the walls', cost: { stone: 20 }, fx: () => 'the props hold. nothing is lost.' },
      { label: 'wait for it to pass', fx: () => {
          if ((S.bld.cot || 0) > 1) {
            const before = S.pop; S.bld.cot--; setPop(S.pop);
            return 'a cot is buried under fallen stone.' + (before > S.pop ? ' ' + (before - S.pop) + ' people are gone with it.' : '');
          }
          const l = Math.floor((S.res.moss || 0) * 0.2); S.res.moss -= l;
          return 'part of the moss store is crushed. ' + l + ' moss lost.';
        } }] },
  { id: 'rats', avail: s => (s.res.meat || 0) >= 10, title: 'scratching in the stores',
    text: ['something has been at the meat.', 'tiny tracks lead into a crack in the wall.'],
    opts: [
      { label: 'smoke them out', cost: { moss: 25 }, fx: () => { add('meat', 4); add('hide', 4); return 'the rats bolt straight into the snares.'; } },
      { label: 'let them have it', fx: () => { const l = Math.ceil(S.res.meat * 0.3); S.res.meat -= l; return 'the rats take ' + l + ' meat.'; } }] },
  { id: 'wanderer', avail: s => (s.res.moss || 0) >= 50 || (s.res.hide || 0) >= 20, title: 'the wanderer',
    text: ['a hunched figure with a cart of rattling junk taps at the edge of the light.', '"moss for metal?" she asks. "hide for iron?"'],
    opts: [
      { label: 'trade moss for scrap', cost: { moss: 50 }, fx: () => { add('scrap', 10); return 'the wanderer leaves 10 scrap and is gone.'; } },
      { label: 'trade hide for iron', cost: { hide: 20 }, fx: () => { add('iron', 5); return 'the wanderer leaves 5 iron and is gone.'; } },
      { label: 'send her away', fx: () => 'she shrugs and shuffles back into the dark.' }] },
  { id: 'fever', avail: s => s.pop >= 3, title: 'fever',
    text: ['one of the diggers is burning with fever.', 'the others keep their distance.'],
    opts: [
      { label: 'share the rations', cost: { ration: 5 }, fx: () => 'with food and rest, the fever breaks.' },
      { label: 'brew a moss poultice', cost: { moss: 15 }, fx: () => {
          if (Math.random() < .5) return 'the poultice works. the fever breaks by morning.';
          setPop(S.pop - 1); return 'the poultice is not enough. by morning, the digger is gone.';
        } },
      { label: 'keep the others away', fx: () => { setPop(S.pop - 1); return 'the digger dies alone in the night. the warren is quieter.'; } }] },
];

/* ---------- state ---------- */

function fresh() {
  return {
    v: 1, t: 0,
    lamp: 0, lampClock: 0, litAt: -1,
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
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return null;
    const f = fresh();
    return Object.assign(f, s, { flags: Object.assign(f.flags, s.flags), stats: Object.assign(f.stats, s.stats) });
  } catch (e) { return null; }
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* no storage */ } }

let S = load() || fresh();

// speed lives outside the save so it survives a restart
let speed = 'normal';
try { const v = localStorage.getItem(SPEED_KEY); if (SPEEDS[v]) speed = v; } catch (e) { /* no storage */ }
const rate = () => SPEEDS[speed];

// while paused, time stands still at the moment of pausing
let pausedAt = 0;
const now = () => pausedAt || Date.now();

/* ---------- helpers ---------- */

const has = c => Object.entries(c).every(([k, v]) => (S.res[k] || 0) >= v);
const pay = c => { for (const [k, v] of Object.entries(c)) S.res[k] = (S.res[k] || 0) - v; };
const add = (k, n) => { S.res[k] = (S.res[k] || 0) + n; if (n > 0) S.seen[k] = true; };
const cooling = k => { const c = S.cd[k]; return !!c && now() < c.end; };
const cool = (k, ms) => { ms /= rate(); S.cd[k] = { end: now() + ms, len: ms }; };
function note(msg) { S.log.unshift(msg); if (S.log.length > 30) S.log.length = 30; }
function noteOnce(id, msg) { if (!S.once[id]) { S.once[id] = true; note(msg); } }

const cap = () => (S.bld.cot || 0) * 4;
const assigned = () => Object.values(S.jobs).reduce((a, b) => a + b, 0);
const gatherers = () => Math.max(0, S.pop - assigned());
function fixJobs() {
  let over = assigned() - S.pop;
  for (const id of Object.keys(JOBS).reverse()) {
    while (over > 0 && (S.jobs[id] || 0) > 0) { S.jobs[id]--; over--; }
  }
}
function setPop(n) { S.pop = clamp(n, 0, cap()); fixJobs(); }

const weapon = () => S.gear.blade ? { name: 'iron blade', dmg: 6 } : S.gear.spear ? { name: 'spear', dmg: 3 } : { name: 'bare hands', dmg: 1 };
const maxHp = () => S.gear.plate ? 35 : S.gear.wrap ? 20 : 10;
const maxWater = () => S.gear.cask ? 40 : S.gear.waterskin ? 20 : 10;
const carry = () => S.gear.frame ? 50 : S.gear.pack ? 25 : 10;
const sight = () => S.gear.lantern ? 3 : 2;
const bname = id => BUILD[id].label || id;
const cname = id => CRAFT[id].label || id;

/* ---------- the clock ---------- */

function tick() {
  if (S.flags.won) return;
  S.t++;

  // the lamp burns down
  if (S.lamp > 0 && ++S.lampClock >= 45) {
    S.lampClock = 0; S.lamp--;
    note(['the lamp goes out. the dark rushes back in.', 'the lamp gutters.', 'the lamp is dimming.', 'the lamp burns steady.'][S.lamp]);
  }

  // a draft from the crack
  if (S.flags.lit && !S.flags.warren && S.t - S.litAt >= 6) {
    S.flags.warren = true;
    note('cold air moves through a crack in the far wall. beyond it, something pale grows on the stone.');
  }

  // the stranger
  const k = S.flags.keeper;
  if (S.flags.lit && k === 0) {
    if (++S.keeperClock >= 12) {
      S.flags.keeper = 1; S.keeperClock = 0;
      note('a gaunt figure crawls out of the dark toward the light. she is shaking too hard to speak.');
    }
  } else if (k === 1 || k === 2) {
    if (S.lamp >= 2) {
      if (++S.keeperClock >= 25) {
        S.keeperClock = 0; S.flags.keeper++;
        note(k === 1 ? 'the stranger has stopped shaking. she watches the flame and says nothing.'
                     : 'the stranger speaks at last. she built things once, before the city fell. bring her moss and she will build again.');
      }
    } else if (++S.coldNag >= 20) {
      S.coldNag = 0; note('the stranger shivers. the lamp is too low.');
    }
  }

  // work
  if (++S.incomeClock >= 10) { S.incomeClock = 0; income(); }

  // newcomers
  if (S.pop < cap() && S.lamp >= 1 && !S.event) {
    if (++S.popClock >= S.popNext) {
      S.popClock = 0; S.popNext = rnd(25, 50);
      const n = Math.min(cap() - S.pop, rnd(1, 3));
      S.pop += n;
      note(n === 1 ? pick(['a lone digger follows the light down through the old pipes.', 'a hungry stranger finds the warren, and stays.'])
                   : pick(['a family of {n} climbs down from a collapsed stair.', '{n} people come out of the tunnels, blinking at the light.']).replace('{n}', n));
    }
  }

  // events
  if (S.pop >= 1 && !S.event && !S.exp && ++S.eventClock >= S.eventNext) {
    S.eventClock = 0; S.eventNext = rnd(120, 240);
    triggerEvent();
  }

  render();
  if (S.t % 5 === 0) save();
}

function income() {
  const order = ['gatherer', 'trapper', 'quarrier', 'miner', 'curer', 'tanner', 'smelter'];
  for (const id of order) {
    const j = JOBS[id];
    const n = id === 'gatherer' ? gatherers() : (S.jobs[id] || 0);
    for (let i = 0; i < n; i++) {
      if (!has(j.in)) break;
      pay(j.in);
      for (const [r, v] of Object.entries(j.out)) add(r, v);
    }
  }
}

function triggerEvent() {
  const pool = EVENTS.filter(e => !(e.once && S.eventsSeen[e.id]) && e.avail(S));
  if (!pool.length) return;
  const ev = pool.find(e => e.once) || pick(pool);
  S.event = ev.id; S.eventsSeen[ev.id] = true;
}

/* ---------- the old city ---------- */

function genMap() {
  const t = [], seen = [];
  for (let y = 0; y < N; y++) { t.push(Array(N).fill('.')); seen.push(Array(N).fill(0)); }
  t[C][C] = 'W';
  const place = (ch, count, dmin, dmax) => {
    for (let tries = 0; count > 0 && tries < 5000; tries++) {
      const x = rnd(0, N - 1), y = rnd(0, N - 1), d = Math.abs(x - C) + Math.abs(y - C);
      if (d < dmin || d > dmax || t[y][x] !== '.') continue;
      t[y][x] = ch; count--;
    }
  };
  place('X', 1, 14, 16); place('V', 1, 5, 8); place('S', 2, 8, 13); place('N', 2, 6, 12);
  place('M', 2, 4, 10); place('C', 5, 4, 13); place('H', 10, 2, 12);
  return { t, seen, used: [] };
}

function reveal(x, y, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= N || ny >= N || dx * dx + dy * dy > r * r + 1) continue;
    S.map.seen[ny][nx] = 1;
  }
}
const markUsed = key => { if (!S.map.used.includes(key)) S.map.used.push(key); };
const distHome = () => Math.abs(S.exp.x - C) + Math.abs(S.exp.y - C);

function scene(title, text, loot = {}) {
  const l = {};
  for (const [k, v] of Object.entries(loot)) if (v > 0) l[k] = v;
  S.exp.scene = { title, text, loot: l };
}

function startFight(fd, o = {}) {
  const loot = fd.loot ? fd.loot() : {};
  if (o.loot) for (const [k, v] of Object.entries(o.loot)) loot[k] = (loot[k] || 0) + v;
  S.exp.fight = {
    name: fd.name, hp: fd.hp, maxHp: fd.hp, dmg: fd.dmg, acc: fd.acc, loot,
    mark: o.mark || null, flee: o.flee !== false, ending: !!o.ending,
    log: [o.intro || ('a ' + fd.name + ' lunges out of the dark.')],
  };
}
function flog(m) { const f = S.exp.fight; f.log.unshift(m); if (f.log.length > 5) f.log.length = 5; }

function move(dir) {
  const e = S.exp;
  if (!e || e.fight || e.scene || S.event) return;
  const [dx, dy] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[dir];
  const nx = e.x + dx, ny = e.y + dy;
  if (nx < 0 || ny < 0 || nx >= N || ny >= N) return;
  e.x = nx; e.y = ny; e.steps++; S.stats.steps++;

  if (e.water > 0) { e.water--; if (e.water === 3) note('your water is running low.'); }
  else { e.hp -= 2; note('thirst burns in your throat.'); }
  if (++e.foodClock >= 2) {
    e.foodClock = 0;
    if (e.rations > 0) e.rations--;
    else { e.hp -= 2; note('hunger gnaws at you.'); }
  }
  reveal(nx, ny, sight());
  if (e.hp <= 0) return die('you collapse in the dark.');

  const tile = S.map.t[ny][nx];
  if (tile === 'W') return goHome();
  if (tile !== '.') return enterPlace(tile, nx + ',' + ny);
  const d = distHome();
  if (d >= 2 && Math.random() < 0.1) startFight(pick(FOES[d <= 5 ? 1 : d <= 10 ? 2 : 3]));
}

function enterPlace(t, key) {
  const e = S.exp;
  if (t === 'C') {
    e.water = e.maxWater;
    return scene('a cistern', ['black water stands in a cracked stone basin. it tastes of iron, but it is clean enough.', 'you fill your waterskins.']);
  }
  if (t === 'X') return stair();
  if (S.map.used.includes(key)) { note('you have already picked this place clean.'); return; }

  if (t === 'H') {
    const loot = { moss: rnd(5, 15), scrap: rnd(0, 4), ration: Math.random() < .3 ? rnd(1, 3) : 0 };
    if (Math.random() < .35) return startFight(pick(FOES[1]), { loot, mark: key, intro: 'something has made a nest in this house, and it does not want to share.' });
    markUsed(key);
    return scene('a crushed house', [pick([
      'half the roof lies on the floor. the other half is holding up the street above.',
      'a kitchen, still set for a meal no one came back to eat.',
      'children\u2019s drawings, faded to ghosts, cover one wall.'])], loot);
  }
  if (t === 'S') {
    return startFight({ name: 'station scavenger', hp: 14, dmg: 2, acc: .65, loot: () => ({}) },
      { loot: { scrap: rnd(8, 15), iron: rnd(4, 8), ration: rnd(2, 5) }, mark: key,
        intro: 'an old transit station, the trains turned to stone. someone has made camp on the platform, and they do not want company.' });
  }
  if (t === 'N') {
    return startFight({ name: 'rat queen', hp: 22, dmg: 3, acc: .65, loot: () => ({}) },
      { loot: { meat: rnd(10, 15), hide: rnd(8, 12) }, mark: key,
        intro: 'the tunnel floor is a carpet of small bones. something enormous stirs in the dark ahead.' });
  }
  if (t === 'V') {
    markUsed(key); S.flags.mine = true;
    return scene('an ore seam', ['a seam of rust-red ore runs through the tunnel wall, glinting in the light.', 'the keeper will want to hear about this.'], { ore: rnd(4, 8) });
  }
  if (t === 'M') {
    markUsed(key);
    const room = cap() - S.pop;
    if (room > 0) {
      const n = Math.min(room, rnd(2, 4)); S.pop += n;
      return scene('a lost camp', ['a cold fire ring. ' + n + ' people huddle around it, watching you.', 'you tell them about the lamp. they gather their things and start toward the warren.']);
    }
    return scene('a lost camp', ['a cold fire ring and a few hollow faces.', 'there is no room for them in the warren. they press what they have into your hands anyway.'], { scrap: rnd(3, 6), ration: rnd(1, 3) });
  }
}

function stair() {
  if (!S.gear.pick) {
    return scene('the long stair', ['a stair is cut into the living rock, climbing up and up into the dark.',
      'at the top, a hatch of fused iron seals the way. it will not move by hand.', 'you will need a pick.']);
  }
  startFight({ name: 'warden', hp: 45, dmg: 5, acc: .7 },
    { ending: true, intro: 'as you set foot on the stair, something unfolds from the shadows above. the warden has guarded this way since the city fell.' });
}

function enemyTurn() {
  const e = S.exp, f = e.fight;
  if (Math.random() < f.acc) { e.hp -= f.dmg; flog('the ' + f.name + ' strikes you. (-' + f.dmg + ')'); }
  else flog('the ' + f.name + ' misses.');
  if (e.hp <= 0) die('the ' + f.name + ' brings you down.');
}

function win() {
  const e = S.exp, f = e.fight;
  S.stats.kills++;
  if (f.mark) markUsed(f.mark);
  e.fight = null;
  if (f.ending) return endGame();
  scene('the ' + f.name + ' is dead.', [], f.loot);
}

function die(msg) {
  S.stats.deaths++;
  S.exp = null; S.tab = 'hollow';
  note(msg + ' you wake in the warren. someone dragged you home. everything you carried is gone.');
}

function goHome() {
  const e = S.exp, got = [];
  for (const [k, v] of Object.entries(e.loot)) if (v > 0) { add(k, v); got.push(v + ' ' + lbl(k)); }
  if (e.rations) add('ration', e.rations);
  S.exp = null; S.tab = 'passage';
  note(got.length ? 'you return to the warren with ' + got.join(', ') + '.' : 'you return to the warren empty-handed.');
  if (S.flags.mine) noteOnce('minehint', 'the keeper turns the ore over in her hands. "dig a mine," she says. "then build a smelter."');
}

function endGame() {
  S.flags.won = true; S.exp = null;
  save();
}

/* ---------- actions ---------- */

const ACT = {
  tab: id => { S.tab = id; },
  light: () => {
    if (S.lamp > 0) return;
    if (S.flags.lit) {
      if ((S.res.moss || 0) < 1) return;
      S.res.moss--; note('the lamp is lit.');
    } else {
      S.flags.lit = true; S.litAt = S.t;
      note('you strike the flint. a small flame catches, and the dark draws back a little.');
    }
    S.lamp = 2; S.lampClock = 0;
  },
  feed: () => {
    if (cooling('feed') || S.lamp >= 4 || (S.res.moss || 0) < 1) return;
    S.res.moss--; S.lamp++; S.lampClock = 0; cool('feed', 5000);
    note(['', '', 'the lamp is dim.', 'the lamp burns steady.', 'the lamp is bright. the walls glitter with mica.'][S.lamp]);
  },
  gather: () => {
    if (cooling('gather')) return;
    const n = S.bld.barrow ? 20 : 10;
    add('moss', n); cool('gather', 12000);
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
    if (!b || n >= b.max || !b.req(S)) return;
    const c = b.cost(n);
    if (!has(c)) return;
    pay(c); S.bld[id] = n + 1; note(b.note);
    if (id === 'workshop' && !S.flags.passage) {
      S.flags.passage = true;
      note('the keeper points past the warren, to a tunnel mouth half-choked with rubble. "the old city goes on for miles," she says. "take water."');
    }
  },
  craft: id => {
    const c = CRAFT[id];
    if (!c || S.gear[id] || !S.bld.workshop || !has(c.cost)) return;
    pay(c.cost); S.gear[id] = true;
    note('the keeper hands you the ' + cname(id) + '.');
  },
  job: arg => {
    const [id, d] = arg.split(':'), dd = +d;
    if (!JOBS[id] || id === 'gatherer') return;
    if (dd > 0 && gatherers() < 1) return;
    if (dd < 0 && !(S.jobs[id] > 0)) return;
    S.jobs[id] = (S.jobs[id] || 0) + dd;
  },
  outfit: d => { S.outfit = clamp(S.outfit + (+d), 0, Math.min(Math.floor(S.res.ration || 0), carry())); },
  embark: () => {
    const n = clamp(S.outfit, 0, Math.min(Math.floor(S.res.ration || 0), carry()));
    if (n < 1 || S.exp) return;
    if (!S.map) S.map = genMap();
    S.res.ration -= n;
    S.exp = { x: C, y: C, hp: maxHp(), maxHp: maxHp(), water: maxWater(), maxWater: maxWater(),
              rations: n, steps: 0, foodClock: 0, loot: {}, fight: null, scene: null };
    reveal(C, C, sight() + 1);
    S.tab = 'map';
    note('you squeeze past the rubble and into the old city.');
  },
  move: dir => move(dir),
  eat: () => {
    const e = S.exp;
    if (!e || e.rations < 1 || e.hp >= e.maxHp) return;
    e.rations--; e.hp = Math.min(e.maxHp, e.hp + 8);
    if (e.fight) { flog('you wolf down a ration. (+8)'); enemyTurn(); }
  },
  attack: () => {
    const e = S.exp, f = e && e.fight;
    if (!f) return;
    const w = weapon();
    if (Math.random() < .8) { f.hp -= w.dmg; flog('you hit the ' + f.name + '. (-' + w.dmg + ')'); }
    else flog('you miss.');
    if (f.hp <= 0) return win();
    enemyTurn();
  },
  flee: () => {
    const e = S.exp, f = e && e.fight;
    if (!f || !f.flee) return;
    if (Math.random() < .6) { e.fight = null; note('you escape into the dark.'); }
    else { flog('you cannot get away.'); enemyTurn(); }
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
  choose: i => {
    const ev = EVENTS.find(x => x.id === S.event);
    if (!ev) { S.event = null; return; }
    const o = ev.opts[+i];
    if (!o || (o.cost && !has(o.cost))) return;
    if (o.cost) pay(o.cost);
    note(o.fx());
    S.event = null;
  },
  speed: id => {
    if (!SPEEDS[id] || id === speed) return;
    speed = id;
    try { localStorage.setItem(SPEED_KEY, id); } catch (e) { /* no storage */ }
    if (!pausedAt) startClock();
  },
  pause: () => {
    if (pausedAt) {
      // push cooldowns forward by however long we were paused
      const gap = Date.now() - pausedAt;
      for (const c of Object.values(S.cd)) c.end += gap;
      pausedAt = 0;
      startClock();
    } else {
      pausedAt = Date.now();
      clearInterval(clock);
    }
  },
  restart: () => {
    if (!S.flags.won && !window.confirm('start over from the beginning? your progress will be lost.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    S = fresh();
  },
};

/* ---------- rendering ---------- */

const $ = s => document.querySelector(s);
function setHTML(el, h) { if (el._h !== h) { el._h = h; el.innerHTML = h; } }

function btn(a, label, o = {}) {
  const cd = o.cd ? ' data-cd="' + o.cd + '"' : '';
  const dis = o.disabled || (o.cd && cooling(o.cd));
  return '<button class="btn" data-a="' + a + '" data-arg="' + esc(o.arg || '') + '"' + cd +
    (dis ? ' disabled' : '') + (o.disabled ? ' data-hard="1"' : '') + (o.title ? ' title="' + esc(o.title) + '"' : '') + '>' +
    esc(label) + (o.sub ? '<span class="cost">' + esc(o.sub) + '</span>' : '') + (o.cd ? '<span class="cd"></span>' : '') + '</button>';
}
const mini = (a, arg, label, dis) => '<button class="mini" data-a="' + a + '" data-arg="' + arg + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';

function tabs() {
  if (S.exp) return [['map', 'the old city']];
  const t = [['hollow', S.lamp > 0 ? 'a lamplit hollow' : 'a dark hollow']];
  if (S.flags.warren) {
    const p = S.pop;
    t.push(['warren', p === 0 ? 'a narrow cave' : p < 5 ? 'a huddle' : p < 15 ? 'a small warren' : 'the warren']);
  }
  if (S.flags.passage) t.push(['passage', 'a dark passage']);
  return t;
}

function hollowPanel() {
  let h = '<p class="desc">';
  if (S.lamp === 0) h += S.flags.lit ? 'the lamp is out. it is cold, and very dark.' : 'it is dark. you cannot see your own hands.';
  else h += 'the lamp is ' + LAMP[S.lamp] + '.';
  h += '</p>';
  const k = S.flags.keeper;
  if (k > 0) h += '<p class="desc">' + ['', 'a stranger huddles near the lamp, shaking.', 'the stranger sits close to the lamp, watching it.',
    'the keeper sits by the lamp, sorting scraps of root and stone.'][k] + '</p>';

  h += '<div class="row">';
  if (S.lamp === 0) h += btn('light', 'light the lamp', { sub: S.flags.lit ? '1 moss' : '', disabled: S.flags.lit && (S.res.moss || 0) < 1 });
  else h += btn('feed', 'feed the lamp', { sub: '1 moss', cd: 'feed', disabled: (S.res.moss || 0) < 1 || S.lamp >= 4 });
  h += '</div>';

  if (k >= 3) {
    const list = Object.keys(BUILD).filter(id => BUILD[id].req(S) && !(BUILD[id].max === 1 && S.bld[id]));
    if (list.length) {
      h += '<h3>build</h3><div class="row">';
      for (const id of list) {
        const b = BUILD[id], n = S.bld[id] || 0, maxed = n >= b.max, c = b.cost(n);
        h += btn('build', bname(id) + (n ? ' (' + n + ')' : ''), { arg: id, sub: maxed ? 'no more room' : costStr(c), disabled: maxed || !has(c) });
      }
      h += '</div>';
    }
  }
  if (S.bld.workshop) {
    const list = Object.keys(CRAFT).filter(id => {
      const c = CRAFT[id];
      return !S.gear[id] && (!c.req || S.gear[c.req]) && Object.keys(c.cost).every(r => S.seen[r]);
    });
    if (list.length) {
      h += '<h3>craft</h3><div class="row">';
      for (const id of list) h += btn('craft', cname(id), { arg: id, sub: costStr(CRAFT[id].cost), title: CRAFT[id].desc, disabled: !has(CRAFT[id].cost) });
      h += '</div>';
    }
  }
  return h;
}

function warrenPanel() {
  let h = '<p class="desc">' + (S.pop === 0
    ? 'a low cave beyond the crack. pale moss furs the walls, and the air smells of old water.'
    : S.pop < 15 ? 'a handful of cots huddle in the lamplight. people talk quietly, when they talk at all.'
    : 'the warren hums with work. children chase each other between the cots.') + '</p>';
  h += '<div class="row">' + btn('gather', 'gather moss', { cd: 'gather' });
  if (S.flags.keeper >= 3) h += btn('rubble', 'search the rubble', { cd: 'rubble' });
  if (S.bld.snare) h += btn('snares', 'check snares', { cd: 'snares' });
  h += '</div>';

  const built = Object.keys(BUILD).filter(id => S.bld[id]);
  if (built.length) h += '<h3>built</h3><p class="list">' + built.map(id => bname(id) + (BUILD[id].max > 1 ? ' \u00d7' + S.bld[id] : '')).join(' \u00b7 ') + '</p>';

  if (cap() > 0) {
    h += '<h3>people ' + S.pop + ' / ' + cap() + '</h3>';
    for (const id of Object.keys(JOBS)) {
      const j = JOBS[id];
      if (j.req && !S.bld[j.req]) continue;
      const n = id === 'gatherer' ? gatherers() : (S.jobs[id] || 0);
      const eff = [...Object.entries(j.in).map(([k, v]) => '-' + v + ' ' + lbl(k)), ...Object.entries(j.out).map(([k, v]) => '+' + v + ' ' + lbl(k))].join('  ');
      h += '<div class="job"><span>' + id + '</span><span>' + n + '</span><span>' +
        (id === 'gatherer' ? '' : mini('job', id + ':-1', '\u2212', !n) + mini('job', id + ':1', '+', !gatherers())) +
        '</span><span class="je">' + eff + ' / 10s</span></div>';
    }
  }
  return h;
}

function passagePanel() {
  const max = Math.min(Math.floor(S.res.ration || 0), carry());
  S.outfit = clamp(S.outfit, 0, max);
  const w = weapon();
  let h = '<p class="desc">the tunnel mouth breathes stale, cold air. beyond it, the old city lies buried and silent.</p>';
  h += '<h3>supplies</h3>';
  h += '<div class="orow"><span>water</span><span>' + maxWater() + '</span><span class="dim">filled at the warren</span></div>';
  h += '<div class="orow"><span>rations</span><span>' + S.outfit + ' / ' + carry() + '</span><span>' +
    mini('outfit', '-5', '\u22125', S.outfit <= 0) + mini('outfit', '-1', '\u2212', S.outfit <= 0) +
    mini('outfit', '1', '+', S.outfit >= max) + mini('outfit', '5', '+5', S.outfit >= max) + '</span></div>';
  h += '<div class="orow"><span>weapon</span><span>' + w.name + '</span><span class="dim">' + w.dmg + ' damage</span></div>';
  h += '<div class="orow"><span>health</span><span>' + maxHp() + '</span><span></span></div>';
  h += '<div class="row">' + btn('embark', 'embark', { disabled: S.outfit < 1 }) + '</div>';
  if (max < 1) h += '<p class="hint">you need rations to travel. cure meat on a curing rack.</p>';
  h += '<p class="hint">every step costs water. every second step costs a ration. cisterns refill your water.</p>';
  return h;
}

function mapText() {
  const e = S.exp, m = S.map;
  let out = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (x === e.x && y === e.y) { out += '<span class="me">@</span>'; continue; }
      if (!m.seen[y][x]) { out += ' '; continue; }
      const ch = m.t[y][x];
      if (ch === '.') out += '<span class="fl">.</span>';
      else if (ch === 'W') out += '<span class="home">W</span>';
      else {
        const used = m.used.includes(x + ',' + y);
        out += '<span class="lm' + (used ? ' used' : '') + '">' + (used ? ch.toLowerCase() : ch) + '</span>';
      }
    }
    out += '\n';
  }
  return out;
}

function bar(name, v, max, foe) {
  return '<div class="bar' + (foe ? ' foe' : '') + '">' + esc(name) + ' ' + Math.max(0, v) + ' / ' + max +
    '<div class="track"><div class="fill" style="width:' + clamp(v / max * 100, 0, 100) + '%"></div></div></div>';
}

function mapPanel() {
  const e = S.exp, d = distHome();
  let h = '<div class="stats"><span' + (e.hp <= e.maxHp / 3 ? ' class="low"' : '') + '>health ' + e.hp + '/' + e.maxHp + '</span>' +
    '<span' + (e.water <= 3 ? ' class="low"' : '') + '>water ' + e.water + '/' + e.maxWater + '</span>' +
    '<span' + (e.rations <= 1 ? ' class="low"' : '') + '>rations ' + e.rations + '</span>' +
    '<span class="dim">' + d + ' from home</span></div>';
  h += '<div id="map">' + mapText() + '</div>';

  if (e.fight) {
    const f = e.fight;
    h += '<div class="scene"><h3>' + esc(f.name) + '</h3>' + bar('you', e.hp, e.maxHp) + bar(f.name, f.hp, f.maxHp, true) +
      '<div class="flog">' + f.log.map(l => '<p>' + esc(l) + '</p>').join('') + '</div><div class="row">' +
      btn('attack', 'strike', { sub: weapon().name }) +
      btn('eat', 'eat a ration', { sub: e.rations + ' left', disabled: !e.rations || e.hp >= e.maxHp }) +
      (f.flee ? btn('flee', 'run') : '') + '</div></div>';
  } else if (e.scene) {
    const sc = e.scene, loot = Object.entries(sc.loot);
    h += '<div class="scene"><h3>' + esc(sc.title) + '</h3>' + sc.text.map(t => '<p>' + esc(t) + '</p>').join('');
    if (loot.length) h += '<p class="dim">you find: ' + loot.map(([k, v]) => v + ' ' + lbl(k)).join(', ') + '</p>';
    h += '<div class="row">' + (loot.length ? btn('take', 'take it all') + btn('leave', 'leave it') : btn('leave', 'move on')) + '</div></div>';
  } else {
    h += '<div class="dpad"><span></span>' + mini('move', 'n', '\u2191') + '<span></span>' + mini('move', 'w', '\u2190') +
      '<span></span>' + mini('move', 'e', '\u2192') + '<span></span>' + mini('move', 's', '\u2193') + '<span></span></div>';
    h += '<div class="row">' + btn('eat', 'eat a ration', { sub: '+8 health', disabled: !e.rations || e.hp >= e.maxHp }) + '</div>';
    const carried = Object.entries(e.loot).filter(([, v]) => v > 0);
    if (carried.length) h += '<p class="dim">carrying: ' + carried.map(([k, v]) => v + ' ' + lbl(k)).join(', ') + '</p>';
    h += '<p class="legend">@ you \u00b7 W warren \u00b7 H house \u00b7 C cistern \u00b7 S station \u00b7 N nest \u00b7 M camp \u00b7 V ore \u00b7 X stair' +
      '<br>arrow keys or WASD to walk. return to W to bring your finds home.</p>';
  }
  return h;
}

function storesPanel() {
  if (!S.flags.lit) return '';
  let h = '<fieldset class="box"><legend>stores</legend>';
  for (const k of RES) if (S.seen[k]) h += '<div class="store"><span>' + lbl(k) + '</span><span>' + Math.floor(S.res[k] || 0) + '</span></div>';
  const gear = Object.keys(CRAFT).filter(id => S.gear[id]);
  if (gear.length) h += '<h3>gear</h3>' + gear.map(id => '<div class="store"><span>' + cname(id) + '</span></div>').join('');
  return h + '</fieldset>';
}

function modal() {
  if (S.flags.won) {
    const mins = Math.max(1, Math.round(S.t / 60));
    return '<div class="card"><h2>light</h2>' +
      '<p>the warden falls, and the stair is yours.</p>' +
      '<p>you climb until your legs shake. you swing the pick. the iron screams, then gives.</p>' +
      '<p>light pours down the stair. not lamplight. something wider, and colder, and blue.</p>' +
      '<p>below you, the warren stirs. ' + (S.pop ? S.pop + ' people' : 'the keeper') + ' begin the long climb toward the sound.</p>' +
      '<p class="dim">' + mins + ' minutes below \u00b7 ' + S.stats.steps + ' steps \u00b7 ' + S.stats.kills + ' foes \u00b7 ' + S.stats.deaths + ' deaths</p>' +
      '<div class="row">' + btn('restart', 'begin again') + '</div></div>';
  }
  const ev = S.event && EVENTS.find(x => x.id === S.event);
  if (!ev) return '';
  return '<div class="card"><h2>' + esc(ev.title) + '</h2>' + ev.text.map(t => '<p>' + esc(t) + '</p>').join('') +
    '<div class="row">' + ev.opts.map((o, i) => btn('choose', o.label, { arg: String(i), sub: o.cost ? costStr(o.cost) : '', disabled: !!o.cost && !has(o.cost) })).join('') + '</div></div>';
}

function render() {
  if (S.exp) S.tab = 'map';
  else if (S.tab === 'map' || (S.tab === 'warren' && !S.flags.warren) || (S.tab === 'passage' && !S.flags.passage)) S.tab = S.flags.passage && S.tab === 'map' ? 'passage' : 'hollow';

  document.body.dataset.lamp = S.exp ? String(sight()) : String(S.lamp);
  document.body.classList.toggle('paused', !!pausedAt);
  const pb = $('#pause');
  pb.textContent = pausedAt ? 'resume' : 'pause';
  pb.classList.toggle('on', !!pausedAt);
  $('#pausecard').setAttribute('aria-hidden', String(!pausedAt));
  setHTML($('#tabs'), tabs().map(([id, name]) => '<button class="tab' + (S.tab === id ? ' on' : '') + '" data-a="tab" data-arg="' + id + '">' + name + '</button>').join(''));
  setHTML($('#panel'), S.tab === 'map' ? mapPanel() : S.tab === 'warren' ? warrenPanel() : S.tab === 'passage' ? passagePanel() : hollowPanel());
  setHTML($('#stores'), storesPanel());
  setHTML($('#log'), S.log.map(m => '<p>' + esc(m) + '</p>').join(''));
  setHTML($('#speed'), Object.keys(SPEEDS).map(id => '<button class="link' + (id === 'testing' ? ' test' : '') + (id === speed ? ' on' : '') +
    '" data-a="speed" data-arg="' + id + '" title="' + SPEEDS[id] + '× speed">' + id + '</button>').join(''));
  const m = modal(), el = $('#modal');
  setHTML(el, m);
  el.hidden = !m;
  updateCooldowns();
}

function updateCooldowns() {
  const t = now();
  document.querySelectorAll('[data-cd]').forEach(b => {
    const c = S.cd[b.dataset.cd], bar = b.querySelector('.cd');
    const on = c && t < c.end;
    if (bar) bar.style.width = on ? ((c.end - t) / c.len * 100) + '%' : '0';
    b.disabled = on || b.dataset.hard === '1';
  });
}

/* ---------- input ---------- */

function act(a, arg) {
  const fn = ACT[a];
  if (!fn) return;
  const meta = a === 'restart' || a === 'speed' || a === 'pause';
  if (pausedAt && !meta) return;
  if (S.flags.won && !meta) return;
  if (S.event && a !== 'choose' && !meta) return;
  fn(arg);
  render(); save();
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-a]');
  if (!b || b.disabled) return;
  act(b.dataset.a, b.dataset.arg);
});

document.addEventListener('keydown', ev => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === 'p' || ev.key === 'P') { ev.preventDefault(); act('pause'); return; }
  if (!S.exp) return;
  const dir = { ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e', w: 'n', s: 's', a: 'w', d: 'e' }[ev.key.length === 1 ? ev.key.toLowerCase() : ev.key];
  if (!dir) return;
  ev.preventDefault();
  act('move', dir);
});

window.addEventListener('beforeunload', save);

// small handle for debugging from the browser console
window.lampBelow = { state: () => S, act, tick };

let clock = null;
function startClock() { clearInterval(clock); clock = setInterval(tick, 1000 / rate()); }

render();
startClock();
setInterval(updateCooldowns, 100);
})();
