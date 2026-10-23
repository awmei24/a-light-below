# A Light Below

A slow, quiet text game about a dying lamp, a buried city, and the long way up.
Inspired by *A Dark Room* by Doublespeak Games. All code and writing here are original.

## Play
Open `index.html` in a browser. Progress saves automatically in the browser.

## Code
Plain HTML, CSS and JavaScript with no build step. Scripts load in order and share globals.

    js/data.js     game content: buildings, jobs, crafts, foes, events, lamp rules
    js/state.js    save state, settings, timing, helpers
    js/world.js    the clock, the dark, combat
    js/scenes.js   cutscenes
    js/dev.js      dev mode: password, 10× speed, stage skips
    js/ui.js       rendering
    js/main.js     actions, input, start-up
    css/base.css   layout and controls
    css/effects.css  lamplight, fades, cutscenes, fight motion

## Dev mode
The `dev mode` switch in the footer asks for a password, then unlocks 10× speed, stage skips and an
exit button. Only a salted hash is stored (`DEV_HASH` in `js/dev.js`). 