// Skyline Run — everything drawn on the canvas: a chase camera over a polygon
// valley (river, fields, pines, one runway), the airplane in frame, target rings,
// and a lit instrument panel with attitude, speed, altitude and heading gauges.
// Plain canvas 2D with a hand-rolled perspective projection; no images, no fonts
// to load, so the first load is just the code itself.

import { COURSE, RUNWAY, SKY } from './config.js';
import { SCREEN, headingDegrees } from './engine.js';
import {
  fieldKind,
  hash2,
  heightAt,
  runwayCentreX,
  valleyCentreX,
  waterHeight,
} from './terrain.js';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function rgb(r, g, b) {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Blend two [r,g,b] colours and format for the canvas. */
function blend(c1, c2, t) {
  return rgb(mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t));
}

/** Blend two [r,g,b] colours, keeping the result an array for further blending. */
function mixc(c1, c2, t) {
  return [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
}

const COL = {
  water: [58, 116, 178],
  field: [
    [127, 174, 76],
    [151, 189, 94],
    [201, 180, 88],
    [111, 159, 69],
  ],
  grassLow: [93, 146, 66],
  grassHigh: [134, 166, 83],
  rock: [122, 112, 98],
  snow: [238, 244, 250],
  fog: [207, 228, 246],
  pine: [34, 84, 48],
  pineLight: [52, 116, 66],
  asphalt: [58, 63, 70],
};

/** A camera: position plus heading/pitch/roll, turned into a projection basis. */
export function makeCamera(pos, heading, pitch, roll) {
  const cp = Math.cos(pitch);
  const forward = { x: Math.sin(heading) * cp, y: Math.sin(pitch), z: Math.cos(heading) * cp };
  let right = norm(cross({ x: 0, y: 1, z: 0 }, forward));
  let up = cross(forward, right);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const rolledRight = {
    x: right.x * cr + up.x * sr,
    y: right.y * cr + up.y * sr,
    z: right.z * cr + up.z * sr,
  };
  const rolledUp = {
    x: up.x * cr - right.x * sr,
    y: up.y * cr - right.y * sr,
    z: up.z * cr - right.z * sr,
  };
  return { pos, forward, right: rolledRight, up: rolledUp };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** Project a world point; returns {x, y, depth} in screen space or null if behind. */
function project(cam, focal, cx, cy, px, py, pz) {
  const dx = px - cam.pos.x;
  const dy = py - cam.pos.y;
  const dz = pz - cam.pos.z;
  const depth = dx * cam.forward.x + dy * cam.forward.y + dz * cam.forward.z;
  if (depth < 1.5) return null;
  const rx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const ry = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  return { x: cx + (rx * focal) / depth, y: cy - (ry * focal) / depth, depth };
}

/** The chase camera that trails the plane, tilted by half its bank. */
export function chaseCamera(plane) {
  const cp = Math.cos(plane.pitch);
  const back = { x: Math.sin(plane.heading) * cp, y: Math.sin(plane.pitch), z: Math.cos(plane.heading) * cp };
  const pos = {
    x: plane.x - back.x * 15,
    y: plane.y - back.y * 15 + 4.6,
    z: plane.z - back.z * 15,
  };
  return makeCamera(pos, plane.heading, plane.pitch * 0.82 - 0.015, plane.roll * 0.48);
}

/** A slow sightseeing camera for the title screen, drifting down the valley. */
export function attractCamera(time) {
  const z = 260 + ((time * 26) % 3900);
  const x = valleyCentreX(z);
  const ahead = valleyCentreX(z + 120);
  const heading = Math.atan2(ahead - x, 120);
  return makeCamera({ x, y: heightAt(x, z) + 66, z }, heading, -0.03, Math.sin(time * 0.24) * 0.07);
}

/** Draw the whole frame for the current game state. */
export function renderFrame(ctx, view, game, world) {
  const { width: W, height: H } = view;
  const cam = game.screen === SCREEN.TITLE ? attractCamera(view.time) : chaseCamera(game.plane);
  const focal = H * 0.5 / Math.tan((62 * Math.PI) / 360);
  const cx = W / 2;
  const cy = H * 0.46;

  drawSky(ctx, view, cam, focal, cx, cy, world);
  drawTerrain(ctx, view, cam, focal, cx, cy);
  drawRiver(ctx, view, cam, focal, cx, cy);
  drawRunway(ctx, view, cam, focal, cx, cy);
  drawTrees(ctx, view, cam, focal, cx, cy, world.trees);
  drawRings(ctx, view, cam, focal, cx, cy, game);
  if (game.screen !== SCREEN.TITLE) {
    drawPlane(ctx, view, game);
    drawHud(ctx, view, game);
  }
  drawOverlays(ctx, view, game);
}

function drawSky(ctx, view, cam, focal, cx, cy, world) {
  const { width: W, height: H } = view;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, SKY.top);
  grad.addColorStop(0.42, SKY.mid);
  grad.addColorStop(0.62, SKY.horizon);
  grad.addColorStop(1, SKY.horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Sun: a soft disc where the sun direction projects.
  const sun = project(cam, focal, cx, cy,
    cam.pos.x + SKY.sunDirection.x * 4000,
    cam.pos.y + SKY.sunDirection.y * 4000,
    cam.pos.z + SKY.sunDirection.z * 4000);
  if (sun) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 90);
    glow.addColorStop(0, 'rgba(255,246,200,0.95)');
    glow.addColorStop(0.25, 'rgba(255,240,180,0.55)');
    glow.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - 90, sun.y - 90, 180, 180);
  }
  // Clouds: flat puffs of overlapping ellipses, fogged with distance.
  for (const cloud of world.clouds) {
    const c = project(cam, focal, cx, cy, cloud.x, cloud.y, cloud.z);
    if (!c || c.depth > 3200) continue;
    const r = (cloud.r * focal) / c.depth;
    if (r < 6) continue;
    const alpha = clamp(1 - c.depth / 3400, 0.12, 0.85);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (const [ox, oy, s] of [[0, 0, 1], [-0.7, 0.12, 0.66], [0.72, 0.1, 0.7], [0.1, -0.22, 0.6]]) {
      ctx.beginPath();
      ctx.ellipse(c.x + ox * r, c.y + oy * r * 0.4, r * s, r * s * 0.34, 0, 0, TAU);
      ctx.fill();
    }
  }
}

const GRID_COLS = 30;
const GRID_HALF = 1150;
// Column offsets across the view, packed tighter toward the centre so the river
// and the fields near the flight path get the detail (a tanh spacing).
const GRID_ACROSS = [];
for (let ci = 0; ci <= GRID_COLS; ci += 1) {
  const u = (ci / GRID_COLS) * 2 - 1;
  GRID_ACROSS.push((Math.tanh(u * 1.55) / Math.tanh(1.55)) * GRID_HALF);
}

function drawTerrain(ctx, view, cam, focal, cx, cy) {
  // Distance bands from the camera, growing as they recede.
  const rows = [];
  let d = -70;
  while (d < 1550) {
    rows.push(d);
    d += d < 120 ? 11 : d < 420 ? 22 : 46;
  }
  rows.push(1550);
  // Sample the grid in camera-forward rows so the mesh hugs the view.
  const fwd = cam.forward;
  const rightv = cam.right;
  const heights = [];
  for (let ri = 0; ri < rows.length; ri += 1) {
    const line = [];
    for (let ci = 0; ci <= GRID_COLS; ci += 1) {
      const across = GRID_ACROSS[ci];
      const wx = cam.pos.x + fwd.x * rows[ri] + rightv.x * across;
      const wz = cam.pos.z + fwd.z * rows[ri] + rightv.z * across;
      line.push({ x: wx, z: wz, h: heightAt(wx, wz) });
    }
    heights.push(line);
  }
  // Painter: far rows first.
  for (let ri = rows.length - 2; ri >= 0; ri -= 1) {
    for (let ci = 0; ci < GRID_COLS; ci += 1) {
      const a = heights[ri][ci];
      const b = heights[ri][ci + 1];
      const c = heights[ri + 1][ci + 1];
      const dpt = heights[ri + 1][ci];
      const pa = project(cam, focal, cx, cy, a.x, a.h, a.z);
      const pb = project(cam, focal, cx, cy, b.x, b.h, b.z);
      const pc = project(cam, focal, cx, cy, c.x, c.h, c.z);
      const pd = project(cam, focal, cx, cy, dpt.x, dpt.h, dpt.z);
      if (!pa || !pb || !pc || !pd) continue;
      const midH = (a.h + b.h + c.h + dpt.h) / 4;
      const midX = (a.x + b.x) / 2;
      const midZ = (a.z + dpt.z) / 2;
      // True gradient: height change over the quad's real width and depth.
      const dhdx = (b.h - a.h) / Math.max(8, GRID_ACROSS[ci + 1] - GRID_ACROSS[ci]);
      const dhdz = (dpt.h - a.h) / Math.max(6, rows[ri + 1] - rows[ri]);
      const slope = clamp(Math.hypot(dhdx, dhdz) / 0.95, 0, 1);
      const dist = (pa.depth + pc.depth) / 2;
      const jitter = 0.93 + hash2(ri * 31 + ci * 7, ri - ci) * 0.14;
      ctx.fillStyle = groundColour(midX, midZ, midH, slope, dist, jitter);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.lineTo(pc.x, pc.y);
      ctx.lineTo(pd.x, pd.y);
      ctx.closePath();
      ctx.fill();
      // Stroke with the same colour so neighbouring quads never leave a
      // hairline of sky showing between them.
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function groundColour(x, z, h, slope, dist, jitter) {
  const water = waterHeight(x, z);
  let base;
  if (water > -Infinity && h < water + 0.35) {
    base = COL.water;
  } else if (Math.abs(x - valleyCentreX(z)) < 300 && slope < 0.3) {
    const kind = fieldKind(x, z);
    base = kind >= 0 ? COL.field[kind] : COL.grassLow;
  } else {
    base = mixc(COL.grassLow, COL.grassHigh, clamp(h / 170, 0, 1));
    if (h > 190) base = mixc(base, COL.rock, clamp((h - 190) / 60, 0, 0.55));
  }
  // Rock breaks through on the steep faces, whatever grows below them.
  const rockiness = clamp((slope - 0.4) / 0.38, 0, 1);
  if (rockiness > 0 && base !== COL.water) base = mixc(base, COL.rock, rockiness * 0.85);
  if (h > 235) base = mixc(base, COL.snow, clamp((h - 235) / 45, 0, 0.9));
  const light = (1 - slope * 0.16) * jitter;
  return blend(
    [base[0] * light, base[1] * light, base[2] * light],
    COL.fog,
    clamp((dist - 380) / 1250, 0, 0.92),
  );
}

/**
 * The river drawn as a ribbon of quads along the valley centre, so it reads as
 * water from the air even where the terrain mesh is too coarse to show the
 * carved channel. Segments run far to near for the painter.
 */
function drawRiver(ctx, view, cam, focal, cx, cy) {
  const half = 19;
  const step = 40;
  const zFar = cam.pos.z + 1620;
  const zNear = cam.pos.z - 140;
  for (let z = zFar; z > zNear; z -= step) {
    const corners = [];
    let ok = true;
    for (const [zz, side] of [[z, -1], [z, 1], [z + step, 1], [z + step, -1]]) {
      const centreX = valleyCentreX(zz);
      const wy = waterHeight(centreX, zz);
      if (wy === -Infinity) { ok = false; break; }
      const p = project(cam, focal, cx, cy, centreX + side * half, wy + 0.15, zz);
      if (!p) { ok = false; break; }
      corners.push(p);
    }
    if (!ok) continue;
    const dist = corners[0].depth;
    const sparkle = 0.94 + hash2(Math.round(z / step), 7) * 0.12;
    ctx.fillStyle = blend(
      [COL.water[0] * sparkle, COL.water[1] * sparkle, COL.water[2] * sparkle],
      COL.fog,
      clamp((dist - 380) / 1250, 0, 0.92),
    );
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawRunway(ctx, view, cam, focal, cx, cy) {
  const rcx = runwayCentreX();
  const y = heightAt(rcx, (RUNWAY.z0 + RUNWAY.z1) / 2) + 0.35;
  const SEGMENTS = 10;
  for (let i = 0; i < SEGMENTS; i += 1) {
    const zA = RUNWAY.z0 + ((RUNWAY.z1 - RUNWAY.z0) * i) / SEGMENTS;
    const zB = RUNWAY.z0 + ((RUNWAY.z1 - RUNWAY.z0) * (i + 1)) / SEGMENTS;
    const pts = [
      project(cam, focal, cx, cy, rcx - RUNWAY.halfWidth, y, zA),
      project(cam, focal, cx, cy, rcx + RUNWAY.halfWidth, y, zA),
      project(cam, focal, cx, cy, rcx + RUNWAY.halfWidth, y, zB),
      project(cam, focal, cx, cy, rcx - RUNWAY.halfWidth, y, zB),
    ];
    if (pts.some((p) => !p)) continue;
    ctx.fillStyle = rgb(...COL.asphalt);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < 4; k += 1) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath();
    ctx.fill();
    // Centreline dash on alternate segments.
    if (i % 2 === 0) {
      const m1 = project(cam, focal, cx, cy, rcx, y + 0.05, zA + 6);
      const m2 = project(cam, focal, cx, cy, rcx, y + 0.05, zB - 6);
      if (m1 && m2) {
        ctx.strokeStyle = 'rgba(245,245,240,0.9)';
        ctx.lineWidth = Math.max(1, 90 / m1.depth);
        ctx.beginPath();
        ctx.moveTo(m1.x, m1.y);
        ctx.lineTo(m2.x, m2.y);
        ctx.stroke();
      }
    }
    // Edge lights.
    for (const side of [-1, 1]) {
      const lp = project(cam, focal, cx, cy, rcx + side * (RUNWAY.halfWidth + 2.5), y + 0.4, zA);
      if (lp && lp.depth < 1200) {
        ctx.fillStyle = '#ffd97a';
        ctx.beginPath();
        ctx.arc(lp.x, lp.y, Math.max(1.2, 26 / lp.depth), 0, TAU);
        ctx.fill();
      }
    }
  }
  // Threshold bars.
  for (let b = -3; b <= 3; b += 1) {
    if (b === 0) continue;
    const p = project(cam, focal, cx, cy, rcx + b * 3.1, y + 0.05, RUNWAY.z0 + 14);
    if (p && p.depth < 1500) {
      ctx.fillStyle = 'rgba(250,250,246,0.95)';
      const w = Math.max(1.5, 120 / p.depth);
      ctx.fillRect(p.x - w / 2, p.y - w / 4, w, w / 2);
    }
  }
}

function drawTrees(ctx, view, cam, focal, cx, cy, trees) {
  const { height: H } = view;
  for (const tree of trees) {
    const dz = tree.z - cam.pos.z;
    const dx = tree.x - cam.pos.x;
    if (dz * cam.forward.z + dx * cam.forward.x < 0) continue;
    const base = project(cam, focal, cx, cy, tree.x, tree.h, tree.z);
    if (!base || base.depth > 1050 || base.y < -40 || base.y > H + 60) continue;
    const size = (15 * tree.s * focal) / base.depth;
    if (size < 2.5) continue;
    const fogF = clamp((base.depth - 380) / 1250, 0, 0.85);
    ctx.fillStyle = blend(COL.pine, COL.fog, fogF);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y - size);
    ctx.lineTo(base.x - size * 0.34, base.y);
    ctx.lineTo(base.x + size * 0.34, base.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = blend(COL.pineLight, COL.fog, fogF);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y - size * 1.18);
    ctx.lineTo(base.x - size * 0.24, base.y - size * 0.42);
    ctx.lineTo(base.x + size * 0.24, base.y - size * 0.42);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRings(ctx, view, cam, focal, cx, cy, game) {
  for (const ring of game.rings) {
    if (ring.state === 'flown' || ring.state === 'missed') continue;
    const c = project(cam, focal, cx, cy, ring.x, ring.y, ring.z);
    if (!c || c.depth > 2400) continue;
    const r = (COURSE.ringRadius * focal) / c.depth;
    if (r < 3) continue;
    const isNext = ring.index === game.nextRing;
    const pulse = isNext ? 0.82 + 0.18 * Math.sin(view.time * 5) : 1;
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.strokeStyle = isNext ? `rgba(255,207,77,${0.95 * pulse})` : 'rgba(168,224,255,0.75)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.strokeStyle = isNext ? 'rgba(255,240,190,0.9)' : 'rgba(220,242,255,0.5)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 0.82, 0, TAU);
    ctx.stroke();
    // Four marker lights around the rim.
    ctx.fillStyle = isNext ? '#ffdf8a' : 'rgba(200,235,255,0.8)';
    for (let k = 0; k < 4; k += 1) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, Math.max(1.2, r * 0.05), 0, TAU);
      ctx.fill();
    }
  }
}

/** The airplane, drawn in screen space from behind and above, banking with the stick. */
function drawPlane(ctx, view, game) {
  const { width: W, height: H } = view;
  const p = game.plane;
  const cxp = W / 2 - p.roll * W * 0.03;
  const cyp = H * 0.585 + p.pitch * H * 0.05 + Math.sin(view.time * 9) * 1.2;
  const span = clamp(W * 0.185, 150, 235);
  ctx.save();
  ctx.translate(cxp, cyp);
  ctx.rotate(p.roll * 0.8);
  ctx.scale(1, 1 - Math.abs(p.pitch) * 0.12);

  const body = '#e8ecf1';
  const trim = '#c8352c';
  const dark = '#22303e';
  // Main wing: two panels with a hint of dihedral, red tips.
  for (const s of [-1, 1]) {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -span * 0.02);
    ctx.lineTo(s * span * 0.5, -span * 0.085);
    ctx.lineTo(s * span * 0.5, span * 0.045);
    ctx.lineTo(0, span * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(s * span * 0.44, -span * 0.078);
    ctx.lineTo(s * span * 0.5, -span * 0.085);
    ctx.lineTo(s * span * 0.5, span * 0.045);
    ctx.lineTo(s * span * 0.44, span * 0.03);
    ctx.closePath();
    ctx.fill();
  }
  // Tailplane and fin, nearest the camera.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-span * 0.17, span * 0.3);
  ctx.lineTo(span * 0.17, span * 0.3);
  ctx.lineTo(span * 0.13, span * 0.4);
  ctx.lineTo(-span * 0.13, span * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = trim;
  ctx.beginPath();
  ctx.moveTo(0, span * 0.08);
  ctx.lineTo(-span * 0.045, span * 0.38);
  ctx.lineTo(span * 0.045, span * 0.38);
  ctx.closePath();
  ctx.fill();
  // Fuselage: a tapered body running away from the camera.
  const fus = ctx.createLinearGradient(0, -span * 0.34, 0, span * 0.42);
  fus.addColorStop(0, '#f4f7fa');
  fus.addColorStop(0.55, '#d7dee6');
  fus.addColorStop(1, '#aeb9c4');
  ctx.fillStyle = fus;
  ctx.beginPath();
  ctx.moveTo(0, -span * 0.36);
  ctx.bezierCurveTo(span * 0.075, -span * 0.2, span * 0.085, span * 0.05, span * 0.062, span * 0.3);
  ctx.bezierCurveTo(span * 0.05, span * 0.42, -span * 0.05, span * 0.42, -span * 0.062, span * 0.3);
  ctx.bezierCurveTo(-span * 0.085, span * 0.05, -span * 0.075, -span * 0.2, 0, -span * 0.36);
  ctx.fill();
  // Livery stripe and canopy.
  ctx.fillStyle = trim;
  ctx.fillRect(-span * 0.068, span * 0.1, span * 0.136, span * 0.045);
  const canopy = ctx.createLinearGradient(0, -span * 0.3, 0, -span * 0.05);
  canopy.addColorStop(0, '#7fc4e8');
  canopy.addColorStop(1, '#274b63');
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.ellipse(0, -span * 0.16, span * 0.045, span * 0.11, 0, 0, TAU);
  ctx.fill();
  // Spinner and a blurred prop arc at the nose.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0, -span * 0.365, span * 0.028, span * 0.02, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,36,44,0.4)';
  ctx.lineWidth = Math.max(1.5, span * 0.012);
  const propR = span * 0.16;
  ctx.beginPath();
  ctx.arc(0, -span * 0.365, propR, game.propPhase, game.propPhase + 4.4);
  ctx.stroke();
  ctx.restore();

  // Soft shadow blob on the ground is skipped in chase view; a subtle drop shadow
  // under the plane sells the height over the panel instead.
  ctx.fillStyle = 'rgba(10,20,30,0.10)';
  ctx.beginPath();
  ctx.ellipse(cxp, H * 0.9, span * 0.4, 8, 0, 0, TAU);
  ctx.fill();
}

const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';

function drawHud(ctx, view, game) {
  const { width: W, height: H } = view;
  const p = game.plane;
  const knots = p.speed * 1.944;
  const feet = p.y * 3.281;

  // Top-left stack: score, rings, time.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  panelText(ctx, 18, 14, `SCORE ${game.score}`, 25, '#ffffff');
  panelText(ctx, 18, 46, `RINGS ${game.ringsFlown}/${game.rings.length}`, 16, '#bfe0ff');
  panelText(ctx, 18, 68, `TIME ${formatTime(game.time)}`, 16, '#bfe0ff');

  // Top-right: fuel and throttle bars.
  const barW = Math.min(190, W * 0.2);
  drawBar(ctx, W - barW - 18, 18, barW, 13, p.fuel / 100, p.fuel < 22 ? '#ff6b5e' : '#7ee787', 'FUEL');
  drawBar(ctx, W - barW - 18, 52, barW, 13, p.throttle, '#ffd166', 'THR');

  drawCompassRibbon(ctx, view, game);

  // Centre messages.
  if (game.messageTime > 0 && game.message) {
    ctx.textAlign = 'center';
    panelText(ctx, W / 2, H * 0.3, game.message, 30, '#ffe9a8', true);
  }
  if (p.stalled && game.screen === SCREEN.FLYING) {
    if (Math.floor(view.time * 4) % 2 === 0) {
      ctx.textAlign = 'center';
      panelText(ctx, W / 2, H * 0.36, 'STALL — NOSE DOWN, ADD POWER', 19, '#ff7a6e', true);
    }
  }
  if (game.nextRing >= game.rings.length && game.screen === SCREEN.FLYING) {
    ctx.textAlign = 'center';
    panelText(ctx, W / 2, H * 0.24, 'ALL RINGS DONE — LAND ON THE RUNWAY AHEAD', 17, '#a8e6a1', true);
  }

  drawPanel(ctx, view, game, knots, feet);
}

function panelText(ctx, x, y, text, size, colour, centred) {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillStyle = 'rgba(6,12,20,0.55)';
  const w = ctx.measureText(text).width;
  const bx = centred ? x - w / 2 - 8 : x - 6;
  ctx.fillRect(bx, y - 3, w + 12, size + 8);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

function drawBar(ctx, x, y, w, h, frac, colour, label) {
  ctx.font = `700 11px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(6,12,20,0.55)';
  ctx.fillRect(x - 6, y - 4, w + 12, h + 22);
  ctx.fillStyle = '#dfeaf4';
  ctx.fillText(label, x, y - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 34, y, w - 34, h - 2);
  ctx.fillStyle = colour;
  ctx.fillRect(x + 34, y, (w - 34) * clamp(frac, 0, 1), h - 2);
}

function drawCompassRibbon(ctx, view, game) {
  const { width: W } = view;
  const heading = headingDegrees(game.plane);
  const w = Math.min(340, W * 0.4);
  const x0 = W / 2 - w / 2;
  const y = 14;
  ctx.fillStyle = 'rgba(6,12,20,0.55)';
  ctx.fillRect(x0 - 6, y - 4, w + 12, 30);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, w, 22);
  ctx.clip();
  ctx.font = `700 13px ${FONT}`;
  ctx.textAlign = 'center';
  const pxPerDeg = w / 60;
  for (let d = -40; d <= 40; d += 5) {
    const deg = Math.round((heading + d) / 5) * 5;
    const shown = ((deg % 360) + 360) % 360;
    const x = W / 2 + (deg - heading) * pxPerDeg;
    ctx.fillStyle = '#9fc6e8';
    ctx.fillRect(x, y + 14, 1.5, 6);
    const label = deg % 30 === 0 ? cardinal(shown) : '';
    if (label && x > x0 + 18 && x < x0 + w - 18) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x, y + 1);
    }
  }
  ctx.restore();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 6, y + 24);
  ctx.lineTo(W / 2 + 6, y + 24);
  ctx.lineTo(W / 2, y + 30);
  ctx.closePath();
  ctx.fill();
}

function cardinal(deg) {
  if (deg === 0) return 'N';
  if (deg === 90) return 'E';
  if (deg === 180) return 'S';
  if (deg === 270) return 'W';
  return String(deg).padStart(3, '0');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The bottom instrument panel: attitude, airspeed, altimeter and heading gauges. */
function drawPanel(ctx, view, game, knots, feet) {
  const { width: W, height: H } = view;
  const p = game.plane;
  const ph = clamp(H * 0.165, 100, 134);
  const y0 = H - ph;
  ctx.fillStyle = 'rgba(8,14,22,0.88)';
  ctx.fillRect(0, y0, W, ph);
  ctx.fillStyle = 'rgba(120,190,255,0.5)';
  ctx.fillRect(0, y0, W, 2);
  const r = ph * 0.36;
  const cy = y0 + ph * 0.52;
  const xs = [W * 0.13, W * 0.34, W * 0.66, W * 0.87];
  drawAttitude(ctx, xs[0], cy, r, p);
  drawSpeedGauge(ctx, xs[1], cy, r, knots);
  drawAltimeter(ctx, xs[2], cy, r, feet);
  drawHeadingGauge(ctx, xs[3], cy, r, headingDegrees(p));
  ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(ph * 0.11)}px ${FONT}`;
  ctx.fillStyle = '#8fb8d8';
  ctx.fillText('SKYLINE RUN', W / 2, y0 + ph * 0.14);
  ctx.font = `500 ${Math.round(ph * 0.1)}px ${FONT}`;
  ctx.fillStyle = '#cfe4f6';
  const agl = Math.max(0, Math.round((p.y - heightAt(p.x, p.z)) * 3.281));
  ctx.fillText(`AGL ${agl} FT · WIND CALM · RWY 36 AHEAD ${Math.max(0, Math.round((RUNWAY_Z - p.z) / 100) / 10).toFixed(1)} KM`, W / 2, y0 + ph * 0.34);
}

const RUNWAY_Z = 4980;

function gaugeBezel(ctx, x, y, r, label) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = '#0d1620';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#3d5a74';
  ctx.stroke();
  ctx.font = `700 ${Math.max(9, r * 0.22)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8fb8d8';
  ctx.fillText(label, x, y + r * 0.62);
}

function needle(ctx, x, y, angle, len, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(angle) * len * 0.18, y - Math.sin(angle) * len * 0.18);
  ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
  ctx.stroke();
  ctx.fillStyle = '#e8f2fa';
  ctx.beginPath();
  ctx.arc(x, y, 3.4, 0, TAU);
  ctx.fill();
}

function drawAttitude(ctx, x, y, r, plane) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r - 3, 0, TAU);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-plane.roll);
  const pitchPx = clamp(plane.pitch, -0.6, 0.6) * r * 1.15;
  ctx.fillStyle = '#3f83c4';
  ctx.fillRect(-r, -r * 2 + pitchPx, r * 2, r * 2);
  ctx.fillStyle = '#7a5a36';
  ctx.fillRect(-r, pitchPx, r * 2, r * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.4;
  for (const off of [-0.35, -0.18, 0.18, 0.35]) {
    const ly = pitchPx + off * r * 1.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, ly);
    ctx.lineTo(r * 0.3, ly);
    ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, pitchPx);
  ctx.lineTo(r, pitchPx);
  ctx.stroke();
  ctx.restore();
  // Fixed aircraft symbol.
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.55, y);
  ctx.lineTo(x - r * 0.18, y);
  ctx.lineTo(x, y + r * 0.14);
  ctx.lineTo(x + r * 0.18, y);
  ctx.lineTo(x + r * 0.55, y);
  ctx.stroke();
  gaugeBezelRing(ctx, x, y, r, 'ATT');
}

function gaugeBezelRing(ctx, x, y, r, label) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#3d5a74';
  ctx.stroke();
  ctx.font = `700 ${Math.max(9, r * 0.22)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8fb8d8';
  ctx.fillText(label, x, y + r + 4);
}

function drawSpeedGauge(ctx, x, y, r, knots) {
  gaugeBezel(ctx, x, y, r, 'AIRSPEED');
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  for (let v = 0; v <= 160; v += 20) {
    const a = a0 + (v / 170) * (a1 - a0);
    ctx.strokeStyle = v >= 140 ? '#ff6b5e' : '#cfe4f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
    ctx.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  needle(ctx, x, y, a0 + (clamp(knots, 0, 170) / 170) * (a1 - a0), r * 0.74, '#ffd166');
  digital(ctx, x, y, r, `${Math.round(knots)} KT`);
}

function drawAltimeter(ctx, x, y, r, feet) {
  gaugeBezel(ctx, x, y, r, 'ALTITUDE');
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  for (let v = 0; v <= 1000; v += 200) {
    const a = a0 + (v / 1100) * (a1 - a0);
    ctx.strokeStyle = '#cfe4f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
    ctx.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  needle(ctx, x, y, a0 + (clamp(feet, 0, 1100) / 1100) * (a1 - a0), r * 0.74, '#7ee787');
  digital(ctx, x, y, r, `${Math.round(feet)} FT`);
}

function drawHeadingGauge(ctx, x, y, r, heading) {
  gaugeBezel(ctx, x, y, r, 'HEADING');
  ctx.save();
  ctx.translate(x, y);
  for (let d = 0; d < 360; d += 30) {
    const a = ((d - heading) * Math.PI) / 180 - Math.PI / 2;
    const label = cardinal(d);
    ctx.fillStyle = d % 90 === 0 ? '#ffffff' : '#8fb8d8';
    ctx.font = `700 ${Math.max(9, r * 0.24)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(label.length <= 2 ? label : '', x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66 + 4);
    ctx.strokeStyle = '#cfe4f6';
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.84, y + Math.sin(a) * r * 0.84);
    ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(x - 6, y - r - 2);
  ctx.lineTo(x + 6, y - r - 2);
  ctx.lineTo(x, y - r + 7);
  ctx.closePath();
  ctx.fill();
  digital(ctx, x, y, r, `${String(Math.round(heading)).padStart(3, '0')}°`);
}

function digital(ctx, x, y, r, text) {
  ctx.font = `700 ${Math.max(10, r * 0.3)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaf6ff';
  ctx.fillText(text, x, y + r * 0.34);
}

/** Title, pause, crash and touchdown overlays. */
function drawOverlays(ctx, view, game) {
  const { width: W, height: H } = view;
  if (game.screen === SCREEN.FLYING) return;
  if (game.screen === SCREEN.PAUSED) {
    overlayPanel(ctx, W, H, 'PAUSED', ['Press P to resume', 'Enter restarts the flight'], '#cfe4f6');
    return;
  }
  if (game.screen === SCREEN.TITLE) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(5,10,18,0.55)');
    grad.addColorStop(0.55, 'rgba(5,10,18,0.25)');
    grad.addColorStop(1, 'rgba(5,10,18,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = `800 ${Math.round(W * 0.055)}px ${FONT}`;
    ctx.fillText('SKYLINE RUN', W / 2, H * 0.13);
    ctx.fillStyle = '#eaf6ff';
    ctx.font = `600 ${Math.round(W * 0.016)}px ${FONT}`;
    ctx.fillText('Thread ten rings down the valley — then put her gently on the runway.', W / 2, H * 0.13 + W * 0.062);
    const lines = [
      'FLY   ↑ dive · ↓ climb · ← → bank   (or hold the mouse and steer)',
      'POWER   SHIFT more · CTRL less · or the mouse wheel — mind the fuel',
      'RINGS   gold is next · thread the centre for bonus points',
      'LAND   slow below 95 kt, sink gently, wings level on the strip',
      '',
      'ENTER — take off      P — pause',
    ];
    ctx.font = `500 ${Math.round(W * 0.0145)}px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillStyle = line.startsWith('ENTER') ? '#7ee787' : '#d7e7f5';
      ctx.fillText(line, W / 2, H * 0.34 + i * W * 0.026);
    });
    return;
  }
  if (game.screen === SCREEN.CRASHED) {
    ctx.fillStyle = 'rgba(60,8,4,0.35)';
    ctx.fillRect(0, 0, W, H);
    overlayPanel(ctx, W, H, 'CRASHED', [
      game.crashReason,
      `Score ${game.score} · Rings ${game.ringsFlown}/${game.rings.length} · Time ${formatTime(game.time)}`,
      'ENTER — fly again',
    ], '#ff9d94');
    return;
  }
  if (game.screen === SCREEN.LANDED && game.landing) {
    overlayPanel(ctx, W, H, 'TOUCHDOWN!', [
      `Landing ${game.landing.base} · Time bonus ${game.landing.timeBonus} · Smoothness ${game.landing.smoothBonus}`,
      `Touchdown at ${Math.round(game.landing.speed * 1.944)} kt, sink ${game.landing.descent.toFixed(1)} m/s`,
      `FINAL SCORE ${game.score} · Rings ${game.ringsFlown}/${game.rings.length} · Time ${formatTime(game.time)}`,
      'ENTER — fly again',
    ], '#a8e6a1');
  }
}

function overlayPanel(ctx, W, H, title, lines, colour) {
  const pw = Math.min(620, W * 0.8);
  const ph = 74 + lines.length * 30;
  const x = (W - pw) / 2;
  const y = (H - ph) / 2;
  ctx.fillStyle = 'rgba(7,12,20,0.88)';
  ctx.fillRect(x, y, pw, ph);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, pw, ph);
  ctx.textAlign = 'center';
  ctx.fillStyle = colour;
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(title, W / 2, y + 16);
  ctx.font = `500 16px ${FONT}`;
  lines.forEach((line, i) => {
    ctx.fillStyle = i === lines.length - 1 ? '#7ee787' : '#e6f0f8';
    ctx.fillText(line, W / 2, y + 58 + i * 30);
  });
}
