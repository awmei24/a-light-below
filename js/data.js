'use strict';
// Game content. Everything here is static data.

const SAVE_KEY = 'a-light-below-v1';
const LAMP = ['dark', 'guttering', 'dim', 'steady', 'bright'];
const LAMP_BURN = 45; // ticks before the lamp drops a level
const DARK_LIMIT = 20; // ticks of darkness before the warren stops working
const NEEDS_LIGHT = ['rubble', 'snares', 'build', 'craft', 'embark']; // actions blocked once it has
const RES = ['moss', 'meat', 'hide', 'stone', 'leather', 'ration', 'scrap', 'ore', 'iron'];
const N = 31, C = 15; // map size and centre

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// tool: listed in the tools box (the others appear as jobs or crafting). note: logged when built. desc: the tooltip
const BUILD = {
  snare:    { tool: true, max: 10, cost: n => ({ moss: 10 + n * 5 }), req: s => s.flags.keeper >= 3,
              note: 'a snare of braided root, set across a rat run.',
              desc: 'catches meat and hide in the far tunnels. the more snares, the bigger each catch.' },
  cot:      { tool: true, max: 20, cost: n => ({ moss: 40 + n * 15 }), req: s => s.flags.keeper >= 3,
              note: 'a cot of dried moss. room for four more souls.',
              desc: 'room for four more people in the warren.' },
  barrow:   { tool: true, max: 1, cost: () => ({ moss: 30 }), req: s => s.flags.keeper >= 3,
              note: 'a barrow. more moss can be hauled at once.',
              desc: 'gather twice as much moss each time.' },
  den:      { label: "trappers' den", max: 1, cost: () => ({ moss: 80, hide: 5 }), req: s => (s.bld.snare || 0) >= 2,
              note: 'the den is ready. trappers can work the far tunnels.',
              desc: 'lets people work as trappers, bringing in meat and hide.' },
  rack:     { label: 'curing rack', max: 1, cost: () => ({ moss: 60, meat: 5 }), req: s => s.seen.meat,
              note: 'smoke curls around the curing rack. meat will keep now.',
              desc: 'lets people cure meat into rations for the dark.' },
  quarry:   { max: 1, cost: () => ({ moss: 100 }), req: s => s.pop >= 1,
              note: 'a quarry face is cut into the warren wall.',
              desc: 'lets people cut stone from the warren wall.' },
  tannery:  { max: 1, cost: () => ({ moss: 120, stone: 20 }), req: s => s.seen.hide && s.seen.stone,
              note: 'the tannery stinks, but hide becomes leather.',
              desc: 'lets people tan hide into leather.' },
  workshop: { max: 1, cost: () => ({ moss: 150, stone: 40, leather: 10 }), req: s => s.seen.leather,
              note: 'the keeper sets up a workshop. she can make real tools now.',
              desc: 'the keeper can craft tools and gear. opens the way into the dark.' },
  mine:     { max: 1, cost: () => ({ moss: 120, stone: 40, ration: 5 }), req: s => s.flags.mine,
              note: 'a crew is sent out to work the ore seam.',
              desc: 'lets people mine ore. miners eat a ration each cycle.' },
  smelter:  { max: 1, cost: () => ({ moss: 200, stone: 80, leather: 10 }), req: s => s.seen.ore,
              note: 'the smelter roars. the warren is warmer than it has ever been.',
              desc: 'lets people smelt ore into iron.' },
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
// Places in the dark: [tile, how many, min distance, max distance] from the warren.
const PLACES = [['X', 1, 14, 16], ['V', 1, 5, 8], ['S', 2, 8, 13], ['N', 2, 6, 12], ['M', 2, 4, 10], ['C', 5, 4, 13], ['H', 10, 2, 12],
  ['L', 1, 6, 11], ['R', 2, 5, 12], ['K', 1, 10, 14]];

const EAT_CD = 4000, FLEE_CD = 2000;
const CISTERN_COST = { rations: 5, water: 10 }; // dug on an empty map tile, paid from what you carry

// start: runs as the event card appears. memory: one of the keeper's memories, shown as soon as avail is true
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
  // the lamp's reach: a bright lamp is seen from far away, by people and by other things
  { id: 'travellers', avail: s => s.lamp >= 3 && s.pop >= 2 && s.pop < cap(), title: 'a band of travellers',
    text: ['ragged figures stand at the edge of the light, shielding their eyes.', '"we saw your lamp from three tunnels away," one says. "we followed it for days."'],
    opts: [
      { label: 'take them in', fx: () => { const n = Math.min(cap() - S.pop, rnd(2, 4)); S.pop += n; return n + ' travellers find a place among the cots.'; } },
      { label: 'turn them away', fx: () => 'they go back into the dark without a word.' }] },
  { id: 'drawn', avail: s => s.lamp >= 4 && s.pop >= 3, title: 'drawn to the light',
    text: ['the bright lamp has been seen. something pale and many-legged gathers at the edge of the light.', 'more come every minute.'],
    opts: [
      { label: 'shade the lamp', fx: () => { S.lamp--; return 'you bank the flame. in the dimmer light, the crawling things lose interest.'; } },
      { label: 'drive them off with torches', cost: { moss: 30 }, fx: () => { add('hide', 3); return 'burning moss sends them scattering. they leave a few husks behind.'; } },
      { label: 'let them come', fx: () => { const l = Math.ceil((S.res.meat || 0) * 0.4); S.res.meat = (S.res.meat || 0) - l; return 'they swarm the stores in the night. ' + l + ' meat is gone by morning.'; } }] },
  { id: 'flood', avail: s => s.pop >= 4, title: 'rising water',
    text: ['water wells up through the warren floor, black and cold.', 'it is rising toward the stores.'],
    opts: [
      { label: 'dig a channel', cost: { stone: 15 }, fx: () => 'the water drains off down a new channel into the dark.' },
      { label: 'move the stores up', fx: () => {
          const m = Math.floor((S.res.moss || 0) * 0.15), f = Math.floor((S.res.meat || 0) * 0.15);
          S.res.moss -= m; S.res.meat = (S.res.meat || 0) - f;
          return 'you save what you can. ' + m + ' moss and ' + f + ' meat are soaked through.';
        } }] },
  { id: 'cough', avail: s => s.pop >= 6, title: 'a child\u2019s cough',
    text: ['a child has been coughing for three nights.', 'the sound carries through the whole warren.'],
    opts: [
      { label: 'give her rations', cost: { ration: 3 }, fx: () => 'with food in her, the child sleeps through the night.' },
      { label: 'ask the keeper', cost: { moss: 20, hide: 5 }, fx: () => 'the keeper brews something bitter. by morning the cough is gone.' },
      { label: 'wait it out', fx: () => {
          if (Math.random() < .6) return 'the cough eases on its own.';
          setPop(S.pop - 1); return 'the coughing stops in the night. the warren is quieter.';
        } }] },
  { id: 'traders', avail: s => s.flags.passage && (s.res.leather || 0) >= 15, title: 'lights in the tunnel',
    text: ['a line of small lamps bobs toward the warren.', 'traders, from a warren further down. they have iron, and they are hungry.'],
    opts: [
      { label: 'leather for iron', cost: { leather: 15 }, fx: () => { add('iron', 6); return 'the traders leave 6 iron and take the leather with them.'; } },
      { label: 'meat for rations', cost: { meat: 20 }, fx: () => { add('ration', 8); return 'they pack the meat in salt and leave 8 rations behind.'; } },
      { label: 'send them on', fx: () => 'their lamps bob away into the dark.' }] },

  // the keeper's memories: shown once each, as soon as their moment comes
  { id: 'mem-lamps', memory: true, avail: s => s.flags.keeper >= 3 && Object.keys(s.bld).length > 0, title: 'the keeper remembers',
    text: ['"i made lamps, once," she says, turning a scrap of root in her fingers.', '"the whole city ran on them. ten thousand wicks, and a keeper for every street."'],
    opts: [{ label: 'listen', fx: () => null }] },
  { id: 'mem-voices', memory: true, avail: s => s.pop >= 8, title: 'the keeper remembers',
    text: ['she sits a long time, listening to the warren.', '"the city had a sound," she says. "voices, carts, water in the pipes. this is the first time i have heard it since."'],
    opts: [{ label: 'listen', fx: () => null }] },
  { id: 'mem-fall', memory: true, avail: s => s.stats.steps > 0 && !s.exp, title: 'the keeper remembers',
    text: ['she watches you shake the dust of the dark from your clothes.', '"the lights went out street by street," she says. "we told ourselves the dark would stop at the next corner. it never did."'],
    opts: [{ label: 'listen', fx: () => null }] },
  { id: 'mem-ore', memory: true, avail: s => s.flags.mine && !s.exp, title: 'the keeper remembers',
    text: ['"ore," she says, and almost smiles.', '"my daughter worked the seams. she could find iron by the taste of the water."'],
    opts: [{ label: 'listen', fx: () => null }] },
  { id: 'mem-stair', memory: true, avail: s => s.gear.pick, title: 'the keeper remembers',
    text: ['she runs a thumb along the edge of the pick.', '"when the last lamp failed, my daughter went up the stair. she said she would send light back down."', '"i never saw it. maybe you will."'],
    opts: [{ label: 'listen', fx: () => null }] },
];
