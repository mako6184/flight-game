// Skyline Run — boot and the frame loop: wire the canvas, input and sound to the
// engine and renderer, run the simulation in fixed steps so the flying feels the
// same on any display, and honour ?shot=<scene> for the maker's screenshots.

import { createAudio } from './audio.js';
import { EVENT, SCREEN, createGame, startFlight, stepGame } from './engine.js';
import { createInput } from './input.js';
import { renderFrame } from './render.js';
import { stageShot } from './shots.js';
import { buildClouds, buildTrees } from './terrain.js';

const STEP = 1 / 60;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

const game = createGame();
const world = { trees: buildTrees(420), clouds: buildClouds(30) };
const input = createInput(canvas);
const audio = createAudio();

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const shotMode = shotName !== null;
if (shotMode) stageShot(shotName, game);

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let accumulator = 0;
let announced = '';

function frame(now) {
  requestAnimationFrame(frame);
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > 0.25) elapsed = 0.25;
  const view = {
    width: canvas.width,
    height: canvas.height,
    time: now / 1000,
  };

  if (shotMode) {
    // A staged still: the scene was stepped deterministically in stageShot.
    renderFrame(ctx, view, game, world);
    window.__shotReady = true;
    return;
  }

  handleKeys();
  if (game.screen === SCREEN.FLYING) {
    accumulator += elapsed;
    while (accumulator >= STEP) {
      const events = stepGame(game, input.sample(), STEP);
      if (events & EVENT.RING) audio.ring();
      if (events & EVENT.MISS) audio.miss();
      if (events & EVENT.STALL) audio.stall();
      if (events & EVENT.CRASH) audio.crash();
      if (events & EVENT.LAND) audio.landed();
      accumulator -= STEP;
      if (game.screen !== SCREEN.FLYING) {
        accumulator = 0;
        break;
      }
    }
    audio.updateEngine(game.plane.throttle, true);
  } else {
    audio.updateEngine(0, false);
  }

  renderFrame(ctx, view, game, world);
  announce();
}

function handleKeys() {
  if (input.wasPressed('Enter')) {
    audio.unlock();
    if (game.screen === SCREEN.TITLE || game.screen === SCREEN.CRASHED || game.screen === SCREEN.LANDED) {
      startFlight(game);
    }
  }
  if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
    if (game.screen === SCREEN.FLYING) game.screen = SCREEN.PAUSED;
    else if (game.screen === SCREEN.PAUSED) game.screen = SCREEN.FLYING;
  }
  if (game.screen === SCREEN.FLYING) audio.unlock();
}

function announce() {
  const text =
    game.screen === SCREEN.TITLE
      ? 'Skyline Run. Press Enter to take off.'
      : game.screen === SCREEN.LANDED
        ? `Touchdown. Final score ${game.score}.`
        : game.screen === SCREEN.CRASHED
          ? `Crashed. ${game.crashReason} Score ${game.score}.`
          : `Score ${game.score}. Rings ${game.ringsFlown} of ${game.rings.length}.`;
  if (text !== announced) {
    announced = text;
    if (status) status.textContent = text;
  }
}

requestAnimationFrame(frame);
