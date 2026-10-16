'use strict';
// Cutscenes: a full-screen overlay that plays a list of steps while game time stands still.
//   step: { text, type (ms per letter), fx(box), wait (ms before the next step) }
//   opts: { cls, instant (no fade-in), delay, done(), keep (stay up at the end), end() (html to add when kept) }

let cutSkip = null, holdDark = false, revealUntil = 0;

function cutscene(steps, o = {}) {
  const box = $('#cut');
  box.className = o.cls || '';
  box.innerHTML = '<div class="glow"></div><div class="lines"></div><p class="skip">click to skip</p>';
  const lines = box.querySelector('.lines'), timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  let i = 0, over = false;

  cutAt = Date.now();
  box.hidden = false;
  if (o.instant) box.style.transition = 'none';
  void box.offsetWidth; // start from transparent so the fade-in runs
  box.classList.add('on');
  void box.offsetWidth;
  box.style.transition = '';

  const show = (s, now) => {
    if (s.fx) s.fx(box);
    if (!s.text) return 0;
    const p = lines.appendChild(document.createElement('p'));
    if (!s.type || now) { p.textContent = s.text; return 0; }
    const per = pace(s.type);
    [...s.text].forEach((ch, k) => later(() => { p.textContent += ch; }, per * k));
    return per * s.text.length;
  };
  const end = () => {
    if (over) return;
    over = true; cutSkip = null;
    timers.forEach(clearTimeout);
    shiftCooldowns(cutAt);
    cutAt = 0;
    if (o.done) o.done();
    if (o.keep) {
      box.querySelector('.skip').remove();
      if (o.end) box.insertAdjacentHTML('beforeend', o.end());
    } else closeCut();
    render();
  };
  const run = () => {
    if (over) return;
    if (i >= steps.length) return void later(end, pace(400));
    const s = steps[i++];
    later(run, show(s) + pace(s.wait));
  };
  cutSkip = () => {
    if (o.keep) { timers.forEach(clearTimeout); lines.innerHTML = ''; steps.forEach(s => show(s, true)); }
    end();
  };
  later(run, pace(o.delay ?? 700));
}

function closeCut() {
  const box = $('#cut');
  box.classList.remove('on');
  setTimeout(() => { if (!cutAt && !box.classList.contains('on')) box.hidden = true; }, 900);
}

// The room shakes and dust sifts down from the ceiling; an aftershock is smaller.
function quake(after) {
  document.body.classList.remove('quake', 'aftershock');
  void document.body.offsetWidth;
  document.body.classList.add(after ? 'aftershock' : 'quake');
  setTimeout(() => document.body.classList.remove('quake', 'aftershock'), 1400);

  const dust = document.body.appendChild(document.createElement('div'));
  dust.className = 'dust';
  for (let i = 0, n = after ? 14 : 40; i < n; i++) {
    const d = dust.appendChild(document.createElement('i'));
    d.style.cssText = 'left:' + Math.random() * 100 + '%;width:' + rnd(1, 3) + 'px;height:' + rnd(1, 3) + 'px;' +
      'animation-delay:' + Math.random() * 700 + 'ms;animation-duration:' + rnd(1400, 2600) + 'ms';
  }
  setTimeout(() => dust.remove(), 3500);
}

function blackout() {
  const b = $('#black');
  b.classList.remove('fade'); b.classList.add('on');
  setTimeout(() => { b.classList.add('fade'); b.classList.remove('on'); }, pace(900));
}

const glow = (box, cls) => {
  const g = box.querySelector('.glow');
  g.classList.remove('spark'); void g.offsetWidth; g.classList.add(cls);
};

// The room stays dark until the scene has gone, then the lamplight rises.
function flintScene() {
  holdDark = true;
  cutscene([
    { text: 'your fingers find the flint in the dark.', wait: 1500 },
    { fx: b => glow(b, 'spark'), wait: 450 },
    { fx: b => glow(b, 'spark'), wait: 700 },
    { fx: b => glow(b, 'spark'), wait: 300 },
    { fx: b => glow(b, 'lit'), text: 'a small flame catches.', wait: 2400 },
    { text: 'the dark draws back a little.', wait: 2000 },
  ], { instant: true, done: () => setTimeout(() => { holdDark = false; render(); }, 900) });
}

function embarkScene() {
  cutscene([
    { text: 'you squeeze past the rubble.', wait: 1500 },
    { text: 'the warren’s light falls away behind you.', wait: 1700 },
    { text: 'ahead, the dark waits.', wait: 1900 },
  ], { done: () => { revealUntil = Date.now() + 2600; } });
}

function wardenScene() {
  cutscene([
    { text: 'you set foot on the stair.', type: 55, wait: 900 },
    { text: 'far above, something unfolds from the shadows.', type: 55, wait: 1100 },
    { text: 'the warden has guarded this way since the city fell.', type: 65, wait: 1300 },
    { text: 'it will not let you pass.', type: 95, wait: 1700 },
  ], { cls: 'dim' });
}

function endingScene() {
  const who = S.pop ? S.pop + ' people begin' : 'the keeper begins';
  const dawn = n => b => b.classList.add('dawn' + n);
  cutscene([
    { text: 'the warden falls, and the stair is yours.', wait: 2200 },
    { text: 'you climb until your legs shake.', wait: 2000 },
    { text: 'you swing the pick. the iron screams, then gives.', wait: 1600, fx: dawn(1) },
    { text: 'light pours down the stair.', wait: 2200, fx: dawn(2) },
    { text: 'not lamplight. something wider, and colder, and blue.', wait: 2800, fx: dawn(3) },
    { text: 'below you, the warren stirs. ' + who + ' the long climb toward the sound.', wait: 2400 },
  ], {
    cls: 'ending', keep: true, delay: 1200,
    end: () => '<div class="coda"><p class="dim">' + Math.max(1, Math.round(S.t / 60)) + ' minutes below · ' +
      S.stats.steps + ' steps · ' + S.stats.kills + ' foes · ' + S.stats.deaths + ' deaths</p>' +
      btn('restart', 'begin again') + '</div>',
  });
}
