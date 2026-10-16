'use strict';
// The clock, the warren's economy, and the dark: exploring and fighting.

function tick() {
  if (S.flags.won || cutAt) return;
  S.t++;

  if (S.lamp > 0 && ++S.lampClock >= 45) {
    S.lampClock = 0; S.lamp--;
    if (S.lamp === 0 && !S.exp) blackout();
    note(['the lamp goes out. the dark rushes back in.', 'the lamp gutters.', 'the lamp is dimming.', 'the lamp burns steady.'][S.lamp]);
  }
  if (S.flags.lit && S.lamp === 0 && ++S.darkFor === DARK_LIMIT) {
    note('in the dark, the warren falls still. no one will work until the lamp is lit.');
  }

  if (S.flags.lit && !S.flags.warren && S.t - S.litAt >= 6) {
    S.flags.warren = true;
    note('cold air moves through a crack in the far wall. beyond it, something pale grows on the stone.');
  }

  // the stranger warms up to the lamp in three steps
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

  if (++S.incomeClock >= 10) { S.incomeClock = 0; income(); }

  if (S.pop < cap() && S.lamp >= 1 && !S.event && ++S.popClock >= S.popNext) {
    S.popClock = 0; S.popNext = rnd(25, 50);
    const n = Math.min(cap() - S.pop, rnd(1, 3));
    S.pop += n;
    note(n === 1 ? pick(['a lone digger follows the light down through the old pipes.', 'a hungry stranger finds the warren, and stays.'])
                 : pick(['a family of {n} climbs down from a collapsed stair.', '{n} people come out of the tunnels, blinking at the light.']).replace('{n}', n));
  }

  if (S.pop >= 1 && !S.event && !S.exp && ++S.eventClock >= S.eventNext) {
    S.eventClock = 0; S.eventNext = rnd(120, 240);
    const pool = EVENTS.filter(e => !(e.once && S.eventsSeen[e.id]) && e.avail(S));
    const ev = pool.find(e => e.once) || (pool.length && pick(pool));
    if (ev) { S.event = ev.id; S.eventsSeen[ev.id] = true; if (ev.start) ev.start(); }
  }

  render();
  if (S.t % 5 === 0) save();
}

function income() {
  if (stalled()) return;
  for (const [id, j] of Object.entries(JOBS)) {
    for (let i = 0; i < workers(id) && has(j.in); i++) {
      pay(j.in);
      for (const [r, v] of Object.entries(j.out)) add(r, v);
    }
  }
}

/* ---------- the dark ---------- */

function genMap() {
  const t = [], seen = [];
  for (let y = 0; y < N; y++) { t.push(Array(N).fill('.')); seen.push(Array(N).fill(0)); }
  t[C][C] = 'W';
  const place = (ch, count, dmin, dmax) => {
    for (let tries = 0; count > 0 && tries < 5000; tries++) {
      const x = rnd(0, N - 1), y = rnd(0, N - 1), d = Math.abs(x - C) + Math.abs(y - C);
      if (d >= dmin && d <= dmax && t[y][x] === '.') { t[y][x] = ch; count--; }
    }
  };
  place('X', 1, 14, 16); place('V', 1, 5, 8); place('S', 2, 8, 13); place('N', 2, 6, 12);
  place('M', 2, 4, 10); place('C', 5, 4, 13); place('H', 10, 2, 12);
  return { t, seen, used: [] };
}

function reveal(x, y, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < N && ny < N && dx * dx + dy * dy <= r * r + 1) S.map.seen[ny][nx] = 1;
  }
}
const canDig = () => S.bld.quarry && S.exp && !S.exp.fight && !S.exp.scene && S.map.t[S.exp.y][S.exp.x] === '.';
const canAffordDig = () => S.exp.rations >= CISTERN_COST.rations && S.exp.water >= CISTERN_COST.water;
const markUsed = key => { if (!S.map.used.includes(key)) S.map.used.push(key); };
const distHome = () => Math.abs(S.exp.x - C) + Math.abs(S.exp.y - C);

function scene(title, text, loot = {}) {
  const l = {};
  for (const [k, v] of Object.entries(loot)) if (v > 0) l[k] = v;
  S.exp.scene = { title, text, loot: l };
}

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
  if (S.map.used.includes(key)) return note('you have already picked this place clean.');

  if (t === 'H') {
    const loot = { moss: rnd(5, 15), scrap: rnd(0, 4), ration: Math.random() < .3 ? rnd(1, 3) : 0 };
    if (Math.random() < .35) return startFight(pick(FOES[1]), { loot, mark: key, intro: 'something has made a nest in this house, and it does not want to share.' });
    markUsed(key);
    return scene('a crushed house', [pick([
      'half the roof lies on the floor. the other half is holding up the street above.',
      'a kitchen, still set for a meal no one came back to eat.',
      'children’s drawings, faded to ghosts, cover one wall.'])], loot);
  }
  if (t === 'S') {
    return startFight(BOSSES.station, { loot: { scrap: rnd(8, 15), iron: rnd(4, 8), ration: rnd(2, 5) }, mark: key,
      intro: 'an old transit station, the trains turned to stone. someone has made camp on the platform, and they do not want company.' });
  }
  if (t === 'N') {
    return startFight(BOSSES.queen, { loot: { meat: rnd(10, 15), hide: rnd(8, 12) }, mark: key,
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
  startFight(BOSSES.warden, { ending: true,
    intro: 'as you set foot on the stair, something unfolds from the shadows above. the warden has guarded this way since the city fell.' });
  wardenScene();
}

function die(msg) {
  blackout();
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

/* ---------- fighting ---------- */

// The foe attacks whenever its 'foe' cooldown runs out. Each attack is planned as it
// winds up: usually one blow, sometimes a combo of quick hits.
function startFight(fd, o = {}) {
  const loot = fd.loot ? fd.loot() : {};
  for (const [k, v] of Object.entries(o.loot || {})) loot[k] = (loot[k] || 0) + v;
  S.exp.fight = {
    name: fd.name, hp: fd.hp, maxHp: fd.hp, dmg: fd.dmg, acc: fd.acc, spd: fd.spd, verb: fd.verb,
    combo: fd.combo || null, plan: 1, left: 0, loot,
    mark: o.mark || null, flee: o.flee !== false, ending: !!o.ending,
    log: [o.intro || ('a ' + fd.name + ' lunges out of the dark.')],
  };
  cool('foe', fd.spd * 1000 + 600);
  planAttack(S.exp.fight);
}

function planAttack(f) {
  f.plan = f.combo && Math.random() < f.combo.chance ? f.combo.hits : 1;
  if (f.plan > 1) flog(f.combo.tell);
}

function flog(m) { const f = S.exp.fight; f.log.unshift(m); f.log.length = Math.min(f.log.length, 5); }

function fightLoop() {
  const f = S.exp && S.exp.fight;
  if (!f || f.busy || pausedAt || cutAt || cooling('foe')) return;
  const again = f.left > 0;
  f.left = again ? f.left - 1 : f.plan - 1;

  const e = S.exp;
  if (Math.random() < f.acc) { e.hp -= f.dmg; flog('the ' + f.name + ' ' + f.verb + ' you' + (again ? ' again' : '') + '. (-' + f.dmg + ')'); }
  else flog('the ' + f.name + ' misses' + (again ? ' again' : '') + '.');

  if (e.hp <= 0) die('the ' + f.name + ' brings you down.');
  else if (f.left > 0) cool('foe', f.combo.gap * 1000);
  else { planAttack(f); cool('foe', f.spd * 1000); }
  render(); save();
}

function win() {
  const e = S.exp, f = e.fight;
  S.stats.kills++;
  if (f.mark) markUsed(f.mark);
  e.fight = null;
  if (!f.ending) return scene('the ' + f.name + ' is dead.', [], f.loot);
  S.flags.won = true; S.exp = null;
  endingScene();
}
