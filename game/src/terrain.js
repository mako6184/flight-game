// Skyline Run — the valley the course flies through: a seeded heightfield with a
// meandering river on its floor, patchwork fields on the flats, scattered pines on
// the slopes and one flat runway strip near the end. Pure functions of (x, z) so
// the physics in engine.js and the drawing in render.js always agree on the ground.

import { RING_LAYOUT, RUNWAY, WORLD } from './config.js';

/** Deterministic 32-bit hash of two integer cell coordinates, returned in [0, 1). */
export function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Smooth value noise: bilinear blend of hashed lattice points with a smootherstep. */
export function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz) * 2 - 1;
}

/** The x of the valley centre (and its river) at distance z. */
export function valleyCentreX(z) {
  return 260 * Math.sin(z * 0.0011) + 120 * Math.sin(z * 0.00037 + 1.7);
}

/** The runway sits on the centre line where its middle is. */
export function runwayCentreX() {
  return valleyCentreX((RUNWAY.z0 + RUNWAY.z1) / 2);
}

/** Elevation of the flat valley floor before ridges and noise are added. */
export function floorHeight(z) {
  return WORLD.floorBase + z * WORLD.floorRise;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Ground height in metres at (x, z), runway strip included. */
export function heightAt(x, z) {
  const dx = x - valleyCentreX(z);
  const adx = Math.abs(dx);
  const side = clamp01(adx / WORLD.valleyHalfWidth);
  const ridge = Math.pow(side, 1.7) * WORLD.ridgeHeight;
  const hills =
    noise2(x * 0.004, z * 0.004) * 42 * side +
    noise2(x * 0.021 + 7.3, z * 0.021 - 2.1) * 9 * side;
  let h = floorHeight(z) + ridge + hills;
  // Carve the river channel into the valley floor.
  const channel = 1 - clamp01(adx / WORLD.riverHalfWidth);
  h -= channel * channel * WORLD.waterDrop;
  // Flatten the runway strip: blend the ground to the strip's elevation.
  const rcx = runwayCentreX();
  if (z > RUNWAY.z0 - 90 && z < RUNWAY.z1 + 90) {
    const across = 1 - clamp01((Math.abs(x - rcx) - RUNWAY.halfWidth) / 55);
    const alongEnds = Math.min(
      clamp01((z - (RUNWAY.z0 - 90)) / 90),
      clamp01((RUNWAY.z1 + 90 - z) / 90),
    );
    const blend = Math.min(across, alongEnds);
    const stripHeight = floorHeight(z) - 0.4;
    h = h + (stripHeight - h) * blend * blend;
  }
  return h;
}

/** Water surface height at (x, z), or -Infinity where the ground is dry. */
export function waterHeight(x, z) {
  const adx = Math.abs(x - valleyCentreX(z));
  if (adx > WORLD.riverHalfWidth) return -Infinity;
  return floorHeight(z) - WORLD.waterDrop + 0.9;
}

/** True when (x, z) is over the paved runway strip itself. */
export function onRunway(x, z) {
  return (
    z >= RUNWAY.z0 &&
    z <= RUNWAY.z1 &&
    Math.abs(x - runwayCentreX()) <= RUNWAY.halfWidth
  );
}

/** Slope of the ground at (x, z) as a 0..1 steepness, for colouring rock faces. */
export function slopeAt(x, z) {
  const e = 6;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.min(1, Math.hypot(dx, dz) / (2 * e) / 0.85);
}

/** Patchwork field tint index for a flat cell, or -1 when the cell is not a field. */
export function fieldKind(x, z) {
  const cellX = Math.floor(x / 95);
  const cellZ = Math.floor(z / 95);
  const r = hash2(cellX, cellZ);
  return r < 0.28 ? 0 : r < 0.52 ? 1 : r < 0.74 ? 2 : r < 0.9 ? 3 : -1;
}

/** Absolute ring positions resolved from the layout in config.js. */
export function buildRings() {
  return RING_LAYOUT.map((ring, index) => {
    const x = valleyCentreX(ring.z) + ring.dx;
    return {
      index,
      x,
      z: ring.z,
      y: floorHeight(ring.z) + ring.aboveFloor,
      state: 'next',
    };
  });
}

/** Pre-scattered pine positions on the lower slopes, as {x, z, h, s} records. */
export function buildTrees(count) {
  const trees = [];
  let guard = 0;
  while (trees.length < count && guard < count * 30) {
    guard += 1;
    const z = 100 + hash2(guard, 11) * (WORLD.courseEndZ - 200);
    const sideSign = hash2(guard, 23) < 0.5 ? -1 : 1;
    const dx = sideSign * (90 + hash2(guard, 37) * 520);
    const x = valleyCentreX(z) + dx;
    const h = heightAt(x, z);
    if (h > 150 || slopeAt(x, z) > 0.55) continue;
    trees.push({ x, z, h, s: 0.8 + hash2(guard, 51) * 0.9 });
  }
  return trees;
}

/** Cloud puffs drifting high above the valley, as {x, y, z, r} records. */
export function buildClouds(count) {
  const clouds = [];
  for (let i = 0; i < count; i += 1) {
    clouds.push({
      x: (hash2(i, 71) - 0.5) * 2600,
      y: 235 + hash2(i, 83) * 110,
      z: hash2(i, 97) * WORLD.courseEndZ,
      r: 55 + hash2(i, 109) * 95,
    });
  }
  return clouds;
}
