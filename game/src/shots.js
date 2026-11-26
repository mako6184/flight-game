// Skyline Run — the screenshot scenes behind ?shot=cover|rings|approach|title.
// Each scene starts a real flight, places the airplane at a chosen moment with a
// chosen score on the clock, and steps the real physics forward a fixed number of
// fixed-size steps under a gentle scripted hand on the stick. The frame the maker
// captures is the game's own render of that moment — nothing is composited.

import { SCREEN, startFlight, stepGame } from './engine.js';
import { floorHeight, valleyCentreX } from './terrain.js';

const STEP = 1 / 60;

/** Fly `seconds` of scripted input (a steady hand, a slight bank) from the staged pose. */
function settle(game, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) stepGame(game, input, STEP);
}

/** Pose the plane at (x, y, z) flying the course; x defaults to the valley centre. */
function pose(game, z, y, speed, throttle, x) {
  const p = game.plane;
  p.x = x === undefined ? valleyCentreX(z) : x;
  p.y = y;
  p.z = z;
  p.heading = 0;
  p.pitch = 0.01;
  p.roll = 0;
  p.speed = speed;
  p.throttle = throttle;
}

/** Mark the first `flown` rings flown and the next `missed` ones missed, with score. */
function markRings(game, flown, missed, score) {
  for (let i = 0; i < flown; i += 1) game.rings[i].state = 'flown';
  for (let i = 0; i < missed; i += 1) game.rings[flown + i].state = 'missed';
  game.nextRing = flown + missed;
  game.ringsFlown = flown;
  game.score = score;
}

/**
 * Stage the named scene on a fresh game and return the screen to show.
 * Scenes: cover (default), rings, approach, title.
 */
export function stageShot(name, game) {
  if (name === 'title') {
    game.screen = SCREEN.TITLE;
    return game;
  }
  startFlight(game);
  if (name === 'rings') {
    // Dead on the fifth ring's centre line, close enough to fill the view.
    const ring = game.rings[4];
    markRings(game, 4, 0, 690);
    game.time = 57;
    game.plane.fuel = 71;
    pose(game, ring.z - 120, ring.y + 2, 66, 0.7, ring.x);
    settle(game, 0.5, { pitch: 0, roll: 0.1, throttleDelta: 0 });
    return game;
  }
  if (name === 'approach') {
    // Every ring resolved; on final, gear-down energy, runway growing ahead.
    markRings(game, 8, 2, 1490);
    game.time = 121;
    game.plane.fuel = 38;
    pose(game, 4980 - 760, floorHeight(4220) + 74, 46, 0.3);
    game.plane.pitch = -0.055;
    settle(game, 0.5, { pitch: -0.12, roll: 0, throttleDelta: 0 });
    game.message = '';
    game.messageTime = 0;
    return game;
  }
  // Cover: three rings down, banking gently toward the fourth, valley in full view.
  const ring = game.rings[3];
  markRings(game, 3, 0, 480);
  game.time = 38;
  game.plane.fuel = 82;
  pose(game, ring.z - 215, ring.y + 12, 69, 0.74, ring.x + 26);
  settle(game, 0.6, { pitch: 0.05, roll: -0.22, throttleDelta: 0 });
  return game;
}
