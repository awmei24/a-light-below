'use strict';
// Game content. Everything here is static data.

const SAVE_KEY = 'a-light-below-v1';
const LAMP = ['dark', 'guttering', 'dim', 'steady', 'bright'];
const RES = ['moss', 'meat', 'hide', 'stone', 'leather', 'ration', 'scrap', 'ore', 'iron'];
const N = 31, C = 15; // map size and centre

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// tool: listed in the tools box (the others appear as jobs or crafting)
const BUILD = {
  snare:    { tool: true, max: 10, cost: n => ({ moss: 10 + n * 5 }), req: s => s.flags.keeper >= 3,
              note: 'a snare of braided root, set across a rat run.' },
  cot:      { tool: true, max: 20, cost: n => ({ moss: 40 + n * 15 }), req: s => s.flags.keeper >= 3,
              note: 'a cot of dried moss. room for four more souls.' },
  barrow:   { tool: true, max: 1, cost: () => ({ moss: 30 }), req: s => s.flags.keeper >= 3,
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

// spd: seconds between attacks. combo: a chance of a quick flurry, announced by `tell`.
const FOES = {
  1: [{ name: 'blind rat', hp: 4, dmg: 1, acc: .7, spd: 1.4, verb: 'bites', loot: () => ({ meat: rnd(1, 3), hide: rnd(0, 1) }) },
      { name: 'pale crawler', hp: 6, dmg: 1, acc: .75, spd: 2.2, verb: 'lashes', loot: () => ({ meat: rnd(1, 2), scrap: rnd(0, 1) }) }],
  2: [{ name: 'tunnel scavenger', hp: 12, dmg: 2, acc: .65, spd: 2.4, verb: 'swings at',
        combo: { hits: 2, gap: .4, chance: .3, tell: 'the scavenger shifts its grip.' },
        loot: () => ({ scrap: rnd(2, 5), ration: rnd(0, 2) }) },
      { name: 'gristle hound', hp: 10, dmg: 2, acc: .6, spd: 1.3, verb: 'snaps at',
        combo: { hits: 2, gap: .3, chance: .35, tell: 'the hound drops low, haunches tight.' },
        loot: () => ({ meat: rnd(3, 6), hide: rnd(1, 3) }) }],
  3: [{ name: 'hollow-eyed raider', hp: 18, dmg: 3, acc: .65, spd: 2, verb: 'punches',
        combo: { hits: 2, gap: .35, chance: .4, tell: 'the raider raises both fists.' },
        loot: () => ({ iron: rnd(2, 5), scrap: rnd(3, 8), ration: rnd(1, 3) }) },
      { name: 'deep crawler', hp: 22, dmg: 4, acc: .6, spd: 2.9, verb: 'slams into',
        loot: () => ({ meat: rnd(5, 9), hide: rnd(3, 6) }) }],
};
const BOSSES = {
  station: { name: 'station scavenger', hp: 14, dmg: 2, acc: .65, spd: 2, verb: 'stabs at',
             combo: { hits: 2, gap: .4, chance: .3, tell: 'the scavenger feints left.' } },
  queen:   { name: 'rat queen', hp: 22, dmg: 3, acc: .65, spd: 2.4, verb: 'bites',
             combo: { hits: 3, gap: .3, chance: .3, tell: 'the queen’s brood swarms forward.' } },
  warden:  { name: 'warden', hp: 45, dmg: 5, acc: .7, spd: 2.2, verb: 'strikes',
             combo: { hits: 3, gap: .45, chance: .3, tell: 'the warden draws back, every limb at once.' } },
};
const EAT_CD = 4000, FLEE_CD = 2000;
const CISTERN_COST = { rations: 5, water: 10 }; // dug on an empty map tile, paid from what you carry

// start: runs as the event card appears
const EVENTS = [
  { id: 'voice', once: true, avail: s => s.flags.passage && s.pop >= 2, title: 'a voice from the dark',
    text: ['a digger stumbles back from the tunnels, pale and shaking.',
           '"there is a stair," he says. "far out, past the stations. it climbs and climbs."',
           '"something guards it. and the top is sealed with iron. you would need a strong pick."'],
    opts: [{ label: 'remember the stair', fx: () => 'somewhere out there, a stair leads up.' }] },
  { id: 'tremor', avail: s => s.pop >= 1, title: 'a tremor', start: () => quake(),
    text: ['the ground shudders. dust pours from the ceiling of the warren.', 'somewhere close, stone grinds against stone.'],
    opts: [
      { label: 'shore up the walls', cost: { stone: 20 }, fx: () => 'the props hold. nothing is lost.' },
      { label: 'wait for it to pass', fx: () => {
          quake(true);
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

// Testing-mode starting points.
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
