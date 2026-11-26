// Skyline Run — the flight model and the rules of the course: an arcade airplane
// with throttle, pitch and bank, a stall that bites at low speed, ten rings to thread
// down the valley, a tank of fuel that makes the throttle a decision, and a runway
// at the end that rewards a gentle arrival. Fixed-step simulation, no randomness,
// so a staged scene (shots.js) always flies the same way.

import { COURSE, PLANE, RUNWAY, WORLD } from './config.js';
import { buildRings, floorHeight, heightAt, onRunway, valleyCentreX } from './terrain.js';

export const SCREEN = {
  TITLE: 'title',
  FLYING: 'flying',
  PAUSED: 'paused',
  CRASHED: 'crashed',
  LANDED: 'landed',
};

export const EVENT = { NONE: 0, RING: 1, MISS: 2, CRASH: 4, LAND: 8, STALL: 16 };

export function createPlane() {
  const z = WORLD.startZ;
  return {
    x: valleyCentreX(z),
    y: floorHeight(z) + 58,
    z,
    heading: 0,
    pitch: 0.02,
    roll: 0,
    speed: PLANE.startSpeed,
    throttle: 0.68,
    fuel: PLANE.startFuel,
    stalled: false,
  };
}

export function createGame() {
  return {
    screen: SCREEN.TITLE,
    plane: createPlane(),
    rings: buildRings(),
    nextRing: 0,
    ringsFlown: 0,
    score: 0,
    time: 0,
    message: '',
    messageTime: 0,
    crashReason: '',
    landing: null,
    propPhase: 0,
    events: EVENT.NONE,
  };
}

export function startFlight(game) {
  const fresh = createGame();
  game.plane = fresh.plane;
  game.rings = fresh.rings;
  game.nextRing = 0;
  game.ringsFlown = 0;
  game.score = 0;
  game.time = 0;
  game.message = '';
  game.messageTime = 0;
  game.crashReason = '';
  game.landing = null;
  game.screen = SCREEN.FLYING;
}

/** Wrap an angle to (-pi, pi]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

function showMessage(game, text) {
  game.message = text;
  game.messageTime = 2.4;
}

/**
 * Advance the simulation by dt seconds. `input` is {pitch, roll, throttleDelta}
 * with pitch/roll in -1..1. Returns the EVENT bitmask of what happened.
 */
export function stepGame(game, input, dt) {
  game.events = EVENT.NONE;
  if (game.screen !== SCREEN.FLYING) return game.events;
  const p = game.plane;
  game.time += dt;
  if (game.messageTime > 0) game.messageTime -= dt;

  // Controls: pitch and bank ease toward the stick, then settle back to level.
  const pitchTarget = input.pitch * (input.pitch > 0 ? PLANE.maxPitch : -PLANE.minPitch);
  const rollTarget = input.roll * PLANE.maxRoll;
  p.pitch += clamp(pitchTarget - p.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
  p.roll += clamp(rollTarget - p.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
  if (input.pitch === 0) p.pitch += (0 - p.pitch) * Math.min(1, dt * 0.55);
  if (input.roll === 0) p.roll += (0 - p.roll) * Math.min(1, dt * 1.4);

  // Throttle and fuel: an empty tank leaves the engine at idle, a glider.
  p.throttle = clamp(p.throttle + input.throttleDelta * dt * 0.55, 0, 1);
  const burning = p.fuel > 0;
  if (burning) {
    p.fuel = Math.max(0, p.fuel - (PLANE.fuelBurnIdle + (PLANE.fuelBurnFull - PLANE.fuelBurnIdle) * p.throttle) * dt);
  }
  const effectiveThrottle = burning ? p.throttle : 0;

  // Speed: the engine pulls toward its throttle speed, the slope of the flight
  // path trades speed for height, and drag grows with the square of speed.
  const throttleSpeed = PLANE.idleSpeed + effectiveThrottle * (PLANE.maxSpeed - PLANE.idleSpeed);
  const gravityTrade = -Math.sin(p.pitch) * 9.8 * 0.62;
  const drag = (p.speed - throttleSpeed) * 0.16;
  p.speed = clamp(p.speed + (gravityTrade - drag * Math.abs(p.speed - throttleSpeed) * 0.12 - drag) * dt, PLANE.minSpeed, PLANE.maxSpeed + 14);

  // Stall: below the stall speed the wing lets go — sink and a dropping nose.
  const wasStalled = p.stalled;
  p.stalled = p.speed < PLANE.stallSpeed;
  if (p.stalled) {
    p.pitch += (-0.34 - p.pitch) * Math.min(1, dt * 1.6);
    if (!wasStalled) game.events |= EVENT.STALL;
  }

  // Heading follows the bank; the turn is livelier with speed on.
  p.heading = wrapAngle(p.heading - p.roll * (p.speed / 55) * 0.92 * dt);

  // Move along the flight path.
  const cosPitch = Math.cos(p.pitch);
  const vx = Math.sin(p.heading) * cosPitch * p.speed;
  const vz = Math.cos(p.heading) * cosPitch * p.speed;
  let vy = Math.sin(p.pitch) * p.speed;
  if (p.stalled) vy -= (PLANE.stallSpeed - p.speed) * 0.42;
  const prevZ = p.z;
  const prevY = p.y;
  p.x += vx * dt;
  p.z += vz * dt;
  p.y += vy * dt;
  p.vy = vy;
  game.propPhase += dt * (4 + effectiveThrottle * 26);

  resolveRings(game, prevZ, prevY);
  resolveGround(game);
  return game.events;
}

function resolveRings(game, prevZ, prevY) {
  const p = game.plane;
  while (game.nextRing < game.rings.length) {
    const ring = game.rings[game.nextRing];
    if (prevZ > ring.z) {
      // Already staged past this ring (screenshot scenes): leave it alone.
      game.nextRing += 1;
      continue;
    }
    if (p.z < ring.z) return;
    // Crossed the ring's plane this step: judge the height at the crossing
    // (x barely moves inside one step, so the current x is the crossing x).
    const t = (ring.z - prevZ) / Math.max(1e-6, p.z - prevZ);
    const crossY = prevY + (p.y - prevY) * t;
    const dist = Math.hypot(p.x - ring.x, crossY - ring.y);
    if (dist <= COURSE.ringRadius && p.z > prevZ) {
      const centred = 1 - dist / COURSE.ringRadius;
      const points = COURSE.ringPoints + Math.round(centred * COURSE.ringCentreBonus);
      ring.state = 'flown';
      game.ringsFlown += 1;
      game.score += points;
      game.events |= EVENT.RING;
      showMessage(game, `RING ${game.ringsFlown}  +${points}`);
    } else {
      ring.state = 'missed';
      game.events |= EVENT.MISS;
      showMessage(game, 'RING MISSED');
    }
    game.nextRing += 1;
    return;
  }
}

function resolveGround(game) {
  const p = game.plane;
  const ground = heightAt(p.x, p.z);
  if (p.y > ground + PLANE.groundClearance) return;
  const descent = -(p.vy ?? 0);
  if (onRunway(p.x, p.z) && descent < 3.6 && p.speed < 50 && p.pitch > -0.06 && Math.abs(p.roll) < 0.35) {
    p.y = ground + PLANE.groundClearance;
    const timeBonus = Math.max(0, Math.round((COURSE.parSeconds - game.time)) * COURSE.landingTimeBonusPerSecond);
    const smoothBonus = Math.round(Math.max(0, (3.6 - descent)) * 60);
    const total = COURSE.landingBasePoints + timeBonus + smoothBonus;
    game.score += total;
    game.landing = { timeBonus, smoothBonus, base: COURSE.landingBasePoints, descent, speed: p.speed };
    game.screen = SCREEN.LANDED;
    game.events |= EVENT.LAND;
    return;
  }
  game.crashReason = onRunway(p.x, p.z)
    ? 'Too fast and too steep for the runway — the landing gear folded.'
    : p.y <= floorHeight(p.z) - 1
      ? 'Down in the river. The valley keeps another airplane.'
      : 'Into the hillside. The ridge was closer than it looked.';
  game.screen = SCREEN.CRASHED;
  game.events |= EVENT.CRASH;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Compass heading in degrees, 0 = north (the way the course runs). */
export function headingDegrees(plane) {
  const deg = (plane.heading * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** Altitude above the valley floor under the plane, in metres. */
export function altitudeAboveGround(plane) {
  return plane.y - heightAt(plane.x, plane.z);
}
