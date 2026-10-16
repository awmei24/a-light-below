'use strict';
// Rendering. Panels are built as HTML strings; setHTML only touches the DOM when they change.

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function setHTML(el, h) { if (el._h !== h) { el._h = h; el.innerHTML = h; } }

// Cooldowns aren't baked into the markup; updateCooldowns applies them every frame.
function btn(a, label, o = {}) {
  const off = o.disabled || (NEEDS_LIGHT.includes(a) && stalled());
  return '<button class="btn" data-a="' + a + '" data-arg="' + esc(o.arg ?? '') + '"' +
    (o.cd ? ' data-cd="' + o.cd + '"' : '') + (off ? ' disabled data-hard="1"' : '') +
    (o.title ? ' title="' + esc(o.title) + '"' : '') + '>' + esc(label) +
    (o.sub ? '<span class="cost">' + esc(o.sub) + '</span>' : '') + (o.cd ? '<span class="cd"></span>' : '') + '</button>';
}
const mini = (a, arg, label, dis) => '<button class="mini" data-a="' + a + '" data-arg="' + arg + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';
const link = (a, arg, label, cls = '', title = '') =>
  '<button class="link ' + cls + '" data-a="' + a + '" data-arg="' + arg + '"' + (title ? ' title="' + title + '"' : '') + '>' + label + '</button>';

// Lines that fade in one after another.
const stagger = i => ' style="animation-delay:' + i * 380 + 'ms"';
const paras = lines => lines.map((t, i) => '<p' + stagger(i) + '>' + esc(t) + '</p>').join('');

// "+2 meat" / "−4 moss" (costs in red), and how long a work cycle takes at this speed.
const amount = (v, k) => '<span' + (v < 0 ? ' class="neg"' : '') + '>' + (v < 0 ? '−' : '+') + Math.abs(v) + (k ? ' ' + lbl(k) : '') + '</span>';
const cycle = () => +(10 / rate()).toFixed(1) + 's';

function tabs() {
  if (S.exp) return [['map', 'the dark']];
  const t = [['hollow', S.lamp > 0 ? 'a lamplit hollow' : 'a dark hollow']];
  const p = S.pop;
  if (S.flags.warren) t.push(['warren', p === 0 ? 'a narrow cave' : p < 5 ? 'a huddle' : p < 15 ? 'a small warren' : 'the warren']);
  if (S.flags.passage) t.push(['passage', 'the dark']);
  return t;
}

function hollowPanel() {
  const k = S.flags.keeper;
  let h = '<p class="desc">' + (S.lamp ? 'the lamp is ' + LAMP[S.lamp] + '.'
    : S.flags.lit ? 'the lamp is out. it is cold, and very dark.' : 'it is dark. you cannot see your own hands.') + '</p>';
  if (k) h += '<p class="desc">' + ['', 'a stranger huddles near the lamp, shaking.', 'the stranger sits close to the lamp, watching it.',
    'the keeper sits by the lamp, sorting scraps of root and stone.'][k] + '</p>';

  h += '<div class="row">' + (S.lamp === 0
    ? btn('light', 'light the lamp', { sub: S.flags.lit ? '1 moss' : '', disabled: S.flags.lit && !has({ moss: 1 }) })
    : btn('feed', 'feed the lamp', { sub: '1 moss', cd: 'feed', disabled: !has({ moss: 1 }) || S.lamp >= 4 })) + '</div>';

  const builds = k >= 3 ? Object.keys(BUILD).filter(id => BUILD[id].req(S) && !(BUILD[id].max === 1 && S.bld[id])) : [];
  if (builds.length) {
    h += '<h3>build</h3><div class="row">' + builds.map(id => {
      const b = BUILD[id], n = S.bld[id] || 0, maxed = n >= b.max, c = b.cost(n);
      return btn('build', bname(id), { arg: id, sub: maxed ? 'no more room' : costStr(c), disabled: maxed || !has(c) });
    }).join('') + '</div>';
  }

  const crafts = S.bld.workshop ? Object.keys(CRAFT).filter(id => {
    const c = CRAFT[id];
    return !S.gear[id] && (!c.req || S.gear[c.req]) && Object.keys(c.cost).every(r => S.seen[r]);
  }) : [];
  if (crafts.length) {
    h += '<h3>craft</h3><div class="row">' + crafts.map(id =>
      btn('craft', cname(id), { arg: id, sub: costStr(CRAFT[id].cost), title: CRAFT[id].desc, disabled: !has(CRAFT[id].cost) })).join('') + '</div>';
  }
  return h;
}

function warrenPanel() {
  let h = '<p class="desc">' + (stalled() ? 'the warren is dark and still. no one will work until the lamp is lit.'
    : S.pop === 0 ? 'a low cave beyond the crack. pale moss furs the walls, and the air smells of old water.'
    : S.pop < 15 ? 'a handful of cots huddle in the lamplight. people talk quietly, when they talk at all.'
    : 'the warren hums with work. children chase each other between the cots.') + '</p>';
  h += '<div class="row">' + btn('gather', 'gather moss', { cd: 'gather' }) +
    (S.flags.keeper >= 3 ? btn('rubble', 'search the rubble', { cd: 'rubble' }) : '') +
    (S.bld.snare ? btn('snares', 'check snares', { cd: 'snares' }) : '') + '</div>';

  if (cap() > 0) {
    h += '<h3>people ' + S.pop + ' / ' + cap() + ' <span class="per">· ' + (stalled() ? 'idle in the dark' : 'every ' + cycle()) + '</span></h3>';
    for (const [id, j] of Object.entries(JOBS)) {
      if (j.req && !S.bld[j.req]) continue;
      // totals for everyone in the job; with nobody assigned, what one worker would do
      const n = workers(id), m = n || 1;
      const eff = [...Object.entries(j.in).map(([k, v]) => amount(-v * m, k)), ...Object.entries(j.out).map(([k, v]) => amount(v * m, k))].join('');
      h += '<div class="job"><span>' + id + '</span><span>' + n + '</span><span>' +
        (id === 'gatherer' ? '' : mini('job', id + ':-1', '−', !n) + mini('job', id + ':1', '+', !gatherers())) +
        '</span><span class="je' + (n ? '' : ' idle') + '">' + eff + '</span></div>';
    }
  }
  return h;
}

function passagePanel() {
  const max = Math.min(Math.floor(S.res.ration || 0), carry()), w = weapon();
  S.outfit = clamp(S.outfit, 0, max);
  const row = (a, b, c) => '<div class="orow"><span>' + a + '</span><span>' + b + '</span><span>' + c + '</span></div>';
  return '<p class="desc">the tunnel mouth breathes stale, cold air. beyond it, the dark lies silent.</p><h3>supplies</h3>' +
    row('water', maxWater(), '<span class="dim">filled at the warren</span>') +
    row('rations', S.outfit + ' / ' + carry(), mini('outfit', '-5', '−5', S.outfit <= 0) + mini('outfit', '-1', '−', S.outfit <= 0) +
      mini('outfit', '1', '+', S.outfit >= max) + mini('outfit', '5', '+5', S.outfit >= max)) +
    row('weapon', w.name, '<span class="dim">' + w.dmg + ' damage</span>') +
    row('health', maxHp(), '') +
    '<div class="row">' + btn('embark', 'embark', { disabled: S.outfit < 1 }) + '</div>' +
    (stalled() ? '<p class="hint">no one will see you off in the dark. light the lamp first.</p>' : '') +
    (max < 1 ? '<p class="hint">you need rations to travel. cure meat on a curing rack.</p>' : '') +
    '<p class="hint">every step costs water. every second step costs a ration. cisterns refill your water.</p>';
}

// While revealing, each tile carries its distance from you so the map fades in ring by ring.
function mapText(rv) {
  const e = S.exp, m = S.map;
  const sp = (x, y, cls, ch) => '<span class="' + cls + '"' + (rv ? ' style="--d:' + Math.round(Math.hypot(x - e.x, y - e.y)) + '"' : '') + '>' + ch + '</span>';
  let out = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const ch = m.t[y][x], used = m.used.includes(x + ',' + y);
      out += x === e.x && y === e.y ? sp(x, y, 'me', '@')
        : !m.seen[y][x] ? ' '
        : ch === '.' ? sp(x, y, 'fl', '.')
        : ch === 'W' ? sp(x, y, 'home', 'W')
        : sp(x, y, 'lm' + (used ? ' used' : ''), used ? ch.toLowerCase() : ch);
    }
    out += '\n';
  }
  return out;
}

const bar = (name, v, max, k) => '<div class="bar ' + k + '">' + esc(name) + ' ' + Math.max(0, v) + ' / ' + max +
  '<div class="track"><div class="fill" style="width:' + clamp(v / max * 100, 0, 100) + '%"></div></div></div>';

function mapPanel() {
  const e = S.exp, rv = Date.now() < revealUntil;
  const stat = (low, s) => '<span' + (low ? ' class="neg"' : '') + '>' + s + '</span>';
  let h = '<div class="stats">' + stat(e.hp <= e.maxHp / 3, 'health ' + e.hp + '/' + e.maxHp) +
    stat(e.water <= 3, 'water ' + e.water + '/' + e.maxWater) + stat(e.rations <= 1, 'rations ' + e.rations) +
    '<span class="dim">' + distHome() + ' from home</span></div>' +
    '<div id="map"' + (rv ? ' class="reveal"' : '') + '>' + mapText(rv) + '</div>';
  const carried = Object.entries(e.loot).filter(([, v]) => v > 0);
  return h + '<div class="dpad"><span></span>' + mini('move', 'n', '↑') + '<span></span>' + mini('move', 'w', '←') +
    '<span></span>' + mini('move', 'e', '→') + '<span></span>' + mini('move', 's', '↓') + '<span></span></div>' +
    '<div class="row">' + btn('eat', 'eat a ration', { sub: '+8 health', disabled: !e.rations || e.hp >= e.maxHp }) +
    (canDig() ? btn('cistern', 'dig a cistern', { sub: costStr(CISTERN_COST), disabled: !canAffordDig() }) : '') + '</div>' +
    (carried.length ? '<p class="dim">carrying: ' + carried.map(([k, v]) => v + ' ' + lbl(k)).join(', ') + '</p>' : '') +
    '<p class="legend">@ you · W warren · H house · C cistern · S station · N nest · M camp · V ore · X stair' +
    '<br>arrow keys or WASD to walk. return to W to bring your finds home.</p>';
}

/* ---------- pop-up cards ---------- */

function fightCard() {
  const e = S.exp, f = e.fight;
  return '<div class="card fight' + (f.busy ? ' busy' : '') + '"><h2>' + esc(f.name) + '</h2>' +
    bar('you', e.hp, e.maxHp, 'you') + bar(f.name, f.hp, f.maxHp, 'foe') +
    '<div class="windup' + (f.plan > 1 ? ' combo' : '') + '" data-cd="foe" data-up="1"><span class="cd"></span></div>' +
    '<div class="row">' + btn('attack', 'strike', { sub: weapon().name, cd: 'attack' }) +
    btn('eat', 'eat a ration', { sub: e.rations + ' left', cd: 'eat', disabled: !e.rations || e.hp >= e.maxHp }) +
    (f.flee ? btn('flee', 'run', { cd: 'flee' }) : '') + '</div>' +
    '<div class="flog">' + f.log.map(l => '<p>' + esc(l) + '</p>').join('') + '</div></div>';
}

function sceneCard() {
  const sc = S.exp.scene, loot = Object.entries(sc.loot);
  let i = sc.text.length;
  return '<div class="card reading"><h2>' + esc(sc.title) + '</h2>' + paras(sc.text) +
    (loot.length ? '<p class="dim"' + stagger(i++) + '>you find: ' + loot.map(([k, v]) => v + ' ' + lbl(k)).join(', ') + '</p>' : '') +
    '<div class="row"' + stagger(i) + '>' + (loot.length ? btn('take', 'take it all') + btn('leave', 'leave it') : btn('leave', 'move on')) + '</div></div>';
}

// What each job adds to or takes from every resource per cycle: { moss: [[job, workers, amount], ...] }
function flows() {
  const f = {};
  if (stalled()) return f;
  for (const [id, j] of Object.entries(JOBS)) {
    const n = workers(id);
    if (!n) continue;
    for (const [k, v] of Object.entries(j.in)) (f[k] = f[k] || []).push([id, n, -v * n]);
    for (const [k, v] of Object.entries(j.out)) (f[k] = f[k] || []).push([id, n, v * n]);
  }
  return f;
}

const section = (title, rows) => rows ? '<fieldset class="box"><legend>' + title + '</legend>' + rows + '</fieldset>' : '';
const item = (name, value = '', tip = '') => '<div class="store' + (tip ? ' has-tip" tabindex="0' : '') + '"><span>' + name + '</span><span>' + value + '</span>' + tip + '</div>';

// Hover breakdown of where a resource's income comes from.
const incomeTip = parts => '<div class="tip"><p class="total">' + amount(parts.reduce((a, [, , v]) => a + v, 0)) + ' per ' + cycle() + '</p>' +
  parts.map(([id, n, v]) => '<p><span>' + id + ' ×' + n + '</span>' + amount(v) + '</p>').join('') + '</div>';

function storesPanel() {
  if (!S.flags.lit) return '';
  const f = flows();
  return section('stores', RES.filter(k => S.seen[k]).map(k => item(lbl(k), Math.floor(S.res[k] || 0), f[k] ? incomeTip(f[k]) : '')).join('')) +
    section('gear', Object.keys(CRAFT).filter(id => S.gear[id]).map(id => item(cname(id))).join('')) +
    section('tools', Object.keys(BUILD).filter(id => BUILD[id].tool && S.bld[id]).map(id => item(bname(id), BUILD[id].max > 1 ? S.bld[id] : '')).join(''));
}

function eventCard() {
  const ev = S.event && EVENTS.find(x => x.id === S.event);
  if (!ev) return '';
  return '<div class="card reading"><h2>' + esc(ev.title) + '</h2>' + paras(ev.text) + '<div class="row"' + stagger(ev.text.length) + '>' +
    ev.opts.map((o, i) => btn('choose', o.label, { arg: i, sub: o.cost ? costStr(o.cost) : '', disabled: o.cost && !has(o.cost) })).join('') + '</div></div>';
}

function footer() {
  const pb = $('#pause');
  pb.textContent = pausedAt ? 'resume' : 'pause';
  pb.classList.toggle('on', !!pausedAt);

  // One switch that flips between classic and hyper. From testing it returns to the last of the two.
  const base = speed === 'testing' ? lastSpeed : speed, other = base === 'hyper' ? 'classic' : 'hyper';
  setHTML($('#speed'), link('speed', speed === 'testing' ? base : other, base, '', SPEEDS[base] + '× speed'));
  setHTML($('#testing'), link('testing', '', 'dev mode', unlocked ? 'on' : '', unlocked ? SPEEDS.testing + '× speed' : 'password required'));
  setHTML($('#stages'), unlocked ? '<span>skip to:</span>' + Object.keys(STAGES).map(id => link('stage', id, STAGES[id].label)).join('') : '');
  $('#testexit').hidden = !unlocked;

  // Password pop-up (static markup in index.html).
  const pop = $('#pwbox'), input = $('#pw input'), err = $('#pw .err');
  if (pop.hidden === pw.open) { pop.hidden = !pw.open; input.value = ''; }
  err.textContent = pw.err; err.hidden = !pw.err;
  if (pw.focus) { pw.focus = false; input.value = ''; input.focus(); }
}

function render() {
  if (S.exp) S.tab = 'map';
  else if (!tabs().some(([id]) => id === S.tab)) S.tab = S.tab === 'map' && S.flags.passage ? 'passage' : 'hollow';

  document.body.dataset.lamp = holdDark ? 0 : S.exp ? sight() : S.lamp;
  document.body.classList.toggle('paused', !!pausedAt);
  setHTML($('#tabs'), tabs().map(([id, name]) => '<button class="tab' + (S.tab === id ? ' on' : '') + '" data-a="tab" data-arg="' + id + '">' + name + '</button>').join(''));
  setHTML($('#panel'), { map: mapPanel, warren: warrenPanel, passage: passagePanel }[S.tab]?.() ?? hollowPanel());
  setHTML($('#stores'), storesPanel());
  const e = S.exp, card = eventCard() || (e && e.fight ? fightCard() : e && e.scene ? sceneCard() : '');
  setHTML($('#modal'), card);
  $('#modal').hidden = !card;
  renderLog();
  fightFx();
  footer();
  updateCooldowns();
}

// New log lines are prepended in place so only they animate.
function renderLog() {
  const box = $('#log');
  if (box._s !== S) {
    box._s = S; box._seq = logSeq;
    box.innerHTML = S.log.map(m => '<p>' + esc(m) + '</p>').join('');
    return;
  }
  const n = Math.min(logSeq - box._seq, S.log.length);
  box._seq = logSeq;
  for (let i = n - 1; i >= 0; i--) {
    const p = document.createElement('p');
    p.className = 'new'; p.textContent = S.log[i];
    p.style.animationDelay = (n - 1 - i) * 300 + 'ms';
    box.prepend(p);
  }
  while (box.children.length > S.log.length) box.lastChild.remove();
}

// Health bars slide from their previous value and flinch on a hit.
let lastFight = null;
function fightFx() {
  const e = S.exp, f = e && e.fight, panel = $('#modal');
  const was = f && lastFight && lastFight.f === f ? lastFight : null;
  lastFight = f ? { f, you: e.hp, foe: f.hp } : null;
  if (!f) return;
  if (!was) return panel.querySelector('.fight')?.classList.add('enter');
  for (const [k, max] of [['you', e.maxHp], ['foe', f.maxHp]]) {
    if (was[k] === lastFight[k]) continue;
    const b = panel.querySelector('.bar.' + k), fill = b.querySelector('.fill');
    fill.style.transition = 'none';
    fill.style.width = clamp(was[k] / max * 100, 0, 100) + '%';
    void fill.offsetWidth;
    fill.style.transition = '';
    fill.style.width = clamp(lastFight[k] / max * 100, 0, 100) + '%';
    b.classList.add(lastFight[k] < was[k] ? 'hit' : 'heal');
  }
}

// Cooldown bars drain (or, with data-up, fill) and buttons disable while cooling.
function updateCooldowns() {
  const t = now();
  document.querySelectorAll('[data-cd]').forEach(el => {
    const c = S.cd[el.dataset.cd], on = c && t < c.end, left = on ? (c.end - t) / c.len * 100 : 0;
    const bar = el.querySelector('.cd');
    if (bar) bar.style.width = (el.dataset.up ? 100 - left : left) + '%';
    if (el.tagName === 'BUTTON') el.disabled = on || el.dataset.hard === '1';
  });
}
