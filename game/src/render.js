// Everything drawn: the projected 3D world (terrain, runway, rings,
// scenery), the aircraft in chase view, the lit cockpit panel, the HUD and
// the title/results screens. Canvas 2D with a small perspective projector —
// no library, no network, deterministic for a given world state.

import { FIELD, FONT, MONO, RING, RUNWAY, WATER_LEVEL } from './config.js';
import { terrainHeight, wrapAngle } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_RESULTS = 'results';
export const SCREEN_CRASHED = 'crashed';

export const CAM_CHASE = 'chase';
export const CAM_COCKPIT = 'cockpit';

const W = FIELD.width;
const H = FIELD.height;
let FOCAL = 610; // widens slightly at speed for a sense of velocity
const KT = 1.94384; // m/s to knots
const FT = 3.28084; // metres to feet

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function mix(hexA, hexB, t) {
  const a = hexRgb(hexA), b = hexRgb(hexB);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
function shade(hex, f) {
  const c = hexRgb(hex);
  return `rgb(${Math.round(clamp(c[0] * f, 0, 255))},${Math.round(clamp(c[1] * f, 0, 255))},${Math.round(clamp(c[2] * f, 0, 255))})`;
}

/** Camera basis + position for the current view. Attitude is smoothed so
 * the chase camera trails the aircraft with a soft, cinematic lag. */
const smoothCam = { heading: null, pitch: 0, roll: 0 };
function makeCamera(world, mode) {
  const p = world.plane;
  const chase = mode === CAM_CHASE;
  if (smoothCam.heading === null || !chase) {
    smoothCam.heading = p.heading; smoothCam.pitch = p.pitch; smoothCam.roll = p.roll;
  } else {
    const k = 0.14;
    smoothCam.heading += wrapAngle(p.heading - smoothCam.heading) * k;
    smoothCam.pitch += (p.pitch - smoothCam.pitch) * k;
    smoothCam.roll += (p.roll - smoothCam.roll) * k;
  }
  const heading = chase ? smoothCam.heading : p.heading;
  const pitch = chase ? smoothCam.pitch * 0.72 : p.pitch;
  const roll = chase ? smoothCam.roll * 0.55 : p.roll;
  const f = {
    x: Math.sin(heading) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(heading) * Math.cos(pitch),
  };
  let r = { x: f.z * -1, y: 0, z: f.x }; // cross(F, up) with up=(0,1,0), unnormalised z/x swap
  r = { x: -f.z, y: 0, z: f.x };
  const rl = Math.hypot(r.x, r.z) || 1;
  r.x /= rl; r.z /= rl;
  const u = {
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  };
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const right = { x: r.x * cr - u.x * sr, y: r.y * cr - u.y * sr, z: r.z * cr - u.z * sr };
  const up = { x: u.x * cr + r.x * sr, y: u.y * cr + r.y * sr, z: u.z * cr + r.z * sr };
  const pos = chase
    ? { x: p.x - f.x * 15, y: p.y - f.y * 15 + 4.6, z: p.z - f.z * 15 }
    : { x: p.x + f.x * 1.2, y: p.y + 1.1, z: p.z + f.z * 1.2 };
  return { pos, f, right, up };
}

function project(cam, x, y, z) {
  const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  const cz = dx * cam.f.x + dy * cam.f.y + dz * cam.f.z;
  if (cz < 1.5) return null;
  return { x: W / 2 + (cx / cz) * FOCAL, y: H / 2 - (cy / cz) * FOCAL, d: cz };
}

/**
 * Like project(), but never null: depth is clamped to the near plane and
 * screen coordinates to a generous box, so ground polygons that pass under
 * the camera still fill the lower frame instead of vanishing.
 */
function projectClamped(cam, x, y, z) {
  const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  const cz = Math.max(2, dx * cam.f.x + dy * cam.f.y + dz * cam.f.z);
  return {
    x: clamp(W / 2 + (cx / cz) * FOCAL, -1600, W + 1600),
    y: clamp(H / 2 - (cy / cz) * FOCAL, -1600, H + 1600),
    d: cz,
  };
}

function poly(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawSky(ctx, pal, cam) {
  const horizonY = H / 2 + Math.tan(-Math.asin(clamp(cam.f.y, -1, 1))) * FOCAL * 0.4;
  const grad = ctx.createLinearGradient(0, 0, 0, Math.max(horizonY, 1));
  grad.addColorStop(0, pal.skyTop);
  grad.addColorStop(0.35, mix(pal.skyTop, pal.skyMid, 0.65));
  grad.addColorStop(0.62, pal.skyMid);
  grad.addColorStop(0.85, mix(pal.skyMid, pal.skyLow, 0.6));
  grad.addColorStop(1, pal.skyLow);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Ground haze below the horizon, so any gap in the terrain mesh reads as
  // distant ground rather than sky.
  ctx.fillStyle = pal.fog;
  ctx.fillRect(0, clamp(horizonY, 0, H), W, H);
  // Sun glow toward the west.
  const sun = project(cam, cam.pos.x - 4000, cam.pos.y + 900, cam.pos.z - 3000);
  if (sun) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 260);
    glow.addColorStop(0, pal.sun);
    glow.addColorStop(0.18, pal.sun + '88');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - 260, sun.y - 260, 520, 520);
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
    ctx.fillStyle = pal.sun;
    ctx.fill();
    // Slow sun rays, subtle enough to read as glare rather than decoration.
    ctx.save();
    ctx.translate(sun.x, sun.y);
    ctx.rotate(0.4);
    ctx.fillStyle = pal.sun + '14';
    for (let i = 0; i < 6; i += 1) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(420, -16);
      ctx.lineTo(420, 16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  // Distant mountain silhouettes: two parallax layers whose offset follows
  // the camera heading, so the horizon always has depth.
  const heading = Math.atan2(cam.f.x, -cam.f.z);
  const layers = [
    { base: horizonY + 6, amp: 74, colour: mix(pal.fog, pal.rock, 0.35), seed: 3.1, par: 90 },
    { base: horizonY + 26, amp: 46, colour: mix(pal.fog, pal.rock, 0.62), seed: 7.7, par: 170 },
  ];
  for (const layer of layers) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 32) {
      const t = (x + heading * layer.par) * 0.012 + layer.seed;
      const y = layer.base - (Math.abs(Math.sin(t)) * 0.7 + Math.abs(Math.sin(t * 2.7)) * 0.3) * layer.amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = layer.colour;
    ctx.fill();
  }
  // A loose flock of birds crossing the valley.
  ctx.strokeStyle = 'rgba(30,38,48,0.55)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i += 1) {
    const bx = ((i * 173 + 220) % (W + 120)) - 60;
    const by = 120 + i * 17 + Math.sin(i * 2.3) * 8;
    const flap = Math.sin(i * 1.7) * 3;
    ctx.beginPath();
    ctx.moveTo(bx - 7, by + flap);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + 7, by + flap);
    ctx.stroke();
  }
}

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function terrainColor(pal, h, slope, depth, gx = 0, gz = 0) {
  let base;
  if (h < WATER_LEVEL) base = pal.water;
  else if (h < WATER_LEVEL + 1.1) base = '#e6ddc0'; // pale shoreline foam line
  else if (h < WATER_LEVEL + 2.5) base = '#c2b280';
  else if (h > 150) base = mix(pal.rock, '#f4f6f0', clamp((h - 150) / 60, 0, 1)); // snow fades in with height
  else if (slope > 0.55) base = pal.rock;
  else base = h > 90 ? pal.grassHigh : pal.grass;
  // Fine noise so the ground has texture instead of flat colour blocks.
  const noise = 0.92 + hash2(gx, gz) * 0.16;
  // Sun-facing slopes brighten, shaded slopes deepen (cheap directional light).
  const sunFace = 1 + clamp((hash2(gx + 40, gz) - 0.5) * slope * 0.9, -0.22, 0.22);
  // Water shimmer and a bright sun glint path.
  let waterGlow = 1;
  if (h < WATER_LEVEL) {
    const shimmer = Math.abs(Math.sin(gx * 0.021 + gz * 0.017)) * 0.5 + Math.abs(Math.sin(gx * 0.005 - gz * 0.009)) * 0.5;
    const glint = Math.pow(Math.abs(Math.sin(gx * 0.004 + gz * 0.011)), 6) * 0.8;
    waterGlow = 0.9 + shimmer * 0.4 + glint;
  }
  // Farmland patches on the flat valley floor: 520 m blocks alternate
  // between green, golden and ploughed brown, so the ground reads as
  // fields from the air.
  let patch = 1;
  if (h >= WATER_LEVEL && h < 70 && slope < 0.2) {
    const bx = Math.floor(gx / 520), bz = Math.floor(gz / 520);
    const hash = hash2(bx * 7, bz * 13);
    if (hash > 0.78) base = '#8a6a45';
    else if (hash > 0.55) base = '#b3a355';
    else if (hash > 0.4) base = '#6f9a52';
    patch = 0.96 + hash * 0.08;
  }
  const lit = shade(base, clamp((1.06 - slope * 0.35) * patch * waterGlow * noise * sunFace, 0.55, 1.45));
  // Atmospheric perspective: distance dissolves into haze.
  const fogT = clamp(1 - Math.exp(-depth / 1150), 0, 0.97);
  return fogT < 0.02 ? lit : mixRgb(lit, pal.fog, fogT);
}

function mixRgb(rgb, hexB, t) {
  const m = rgb.match(/\d+/g).map(Number);
  const b = hexRgb(hexB);
  return `rgb(${Math.round(lerp(m[0], b[0], t))},${Math.round(lerp(m[1], b[1], t))},${Math.round(lerp(m[2], b[2], t))})`;
}

function drawTerrain(ctx, world, cam) {
  const pal = world.course.palette;
  const step = 60;
  const radius = 3400;
  const cx = Math.round(cam.pos.x / step) * step;
  const cz = Math.round(cam.pos.z / step) * step;
  const quads = [];
  for (let gx = cx - radius; gx < cx + radius; gx += step) {
    for (let gz = cz - radius; gz < cz + radius; gz += step) {
      const h00 = terrainHeight(gx, gz);
      const h10 = terrainHeight(gx + step, gz);
      const h11 = terrainHeight(gx + step, gz + step);
      const h01 = terrainHeight(gx, gz + step);
      const p00 = projectClamped(cam, gx, h00, gz);
      const p10 = projectClamped(cam, gx + step, h10, gz);
      const p11 = projectClamped(cam, gx + step, h11, gz + step);
      const p01 = projectClamped(cam, gx, h01, gz + step);
      // Skip quads whose centre is behind the camera: clamped corners would
      // otherwise paint a screen-filling polygon over the sky.
      const ccx = gx + step / 2 - cam.pos.x, ccy = (h00 + h11) / 2 - cam.pos.y, ccz = gz + step / 2 - cam.pos.z;
      if (ccx * cam.f.x + ccy * cam.f.y + ccz * cam.f.z < 2) continue;
      const depth = (p00.d + p11.d) / 2;
      const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00)) / step;
      quads.push({ pts: [p00, p10, p11, p01], depth, h: (h00 + h11) / 2, slope, gx, gz });
    }
  }
  quads.sort((a, b) => b.depth - a.depth);
  for (const q of quads) {
    poly(ctx, q.pts, terrainColor(pal, q.h, q.slope, q.depth, q.gx, q.gz));
    // Field boundaries: a darker seam where farmland blocks meet.
    if (q.depth < 2200 && q.h >= WATER_LEVEL && q.h < 70 && q.slope < 0.2
      && (q.gx % 520 === 0 || q.gz % 520 === 0)) {
      ctx.beginPath();
      ctx.moveTo(q.pts[0].x, q.pts[0].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(q.pts[i].x, q.pts[i].y);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(46,58,32,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

/** Roads draped over the terrain: a grey ribbon with a dashed centreline. */
function drawRoads(ctx, world, cam) {
  for (const road of world.roads || []) {
    const pts = [];
    for (let i = 0; i < road.length - 1; i += 1) {
      const [x1, z1] = road[i];
      const [x2, z2] = road[i + 1];
      const segs = Math.max(2, Math.round(Math.hypot(x2 - x1, z2 - z1) / 90));
      for (let s = 0; s < segs; s += 1) {
        const x = lerp(x1, x2, s / segs), z = lerp(z1, z2, s / segs);
        const p = project(cam, x, terrainHeight(x, z) + 0.4, z);
        if (p) pts.push(p);
      }
    }
    if (pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = 'rgba(88,90,94,0.9)';
    ctx.lineWidth = Math.max(1, 260 / pts[0].d);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = 'rgba(240,240,230,0.55)';
    ctx.lineWidth = Math.max(0.6, 70 / pts[0].d);
    ctx.setLineDash([8, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawRunway(ctx, world, cam) {
  const e = RUNWAY.elevation + 0.35;
  const hw = RUNWAY.width / 2, hl = RUNWAY.length / 2;
  const corners = [
    projectClamped(cam, -hw, e, -hl), projectClamped(cam, hw, e, -hl),
    projectClamped(cam, hw, e, hl), projectClamped(cam, -hw, e, hl),
  ];
  poly(ctx, corners, '#33383f');
  const line = (x1, z1, x2, z2, width, colour) => {
    const a = project(cam, x1, e + 0.05, z1);
    const b = project(cam, x2, e + 0.05, z2);
    if (!a || !b) return;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1, width * FOCAL / Math.max(a.d, 1));
    ctx.stroke();
  };
  // Threshold stripes at both ends and the centreline dashes.
  for (const end of [-1, 1]) {
    for (let i = -3; i <= 3; i += 1) {
      line(i * 5.4, end * (hl - 26), i * 5.4, end * (hl - 58), 2.4, '#e8ecf0');
    }
  }
  for (let z = -hl + 90; z < hl - 90; z += 60) line(0, z, 0, z + 32, 1.1, '#dfe5ea');
  line(-hw + 1.5, -hl, -hw + 1.5, hl, 0.7, '#cfd6dd');
  line(hw - 1.5, -hl, hw - 1.5, hl, 0.7, '#cfd6dd');
  // Edge lights.
  ctx.fillStyle = '#ffe9a8';
  for (let z = -hl; z <= hl; z += 75) {
    for (const x of [-hw - 2, hw + 2]) {
      const s = project(cam, x, e + 0.8, z);
      if (s) ctx.fillRect(s.x - 1.6, s.y - 1.6, 3.2, 3.2);
    }
  }
  // Runway numbers, sized by depth.
  ctx.fillStyle = '#eef2f5';
  ctx.textAlign = 'center';
  for (const [label, z] of [['36', -hl + 95], ['18', hl - 95]]) {
    const s = project(cam, 0, e + 0.1, z);
    if (s && s.d < 1400) {
      ctx.font = `700 ${clamp(9000 / s.d, 8, 44)}px ${FONT}`;
      ctx.fillText(label, s.x, s.y);
    }
  }
}

function ringAxes(world, index) {
  const ring = world.rings[index];
  const prev = index === 0 ? { x: 0, y: ring.y, z: RUNWAY.length / 2 } : world.rings[index - 1];
  let nx = ring.x - prev.x, ny = ring.y - prev.y, nz = ring.z - prev.z;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  let ax = -nz, ay = 0, az = nx;
  const al = Math.hypot(ax, az) || 1;
  ax /= al; az /= al;
  const bx = ay * nz - az * ny, by = az * nx - ax * nz, bz = ax * ny - ay * nx;
  return { a: { x: ax, y: ay, z: az }, b: { x: bx, y: by, z: bz } };
}

function drawRings(ctx, world, cam) {
  const pal = world.course.palette;
  for (let i = world.rings.length - 1; i >= 0; i -= 1) {
    const ring = world.rings[i];
    const { a, b } = ringAxes(world, i);
    const pts = [];
    let visible = true;
    for (let s = 0; s <= 26; s += 1) {
      const t = (s / 26) * Math.PI * 2;
      const x = ring.x + (a.x * Math.cos(t) + b.x * Math.sin(t)) * RING.radius;
      const y = ring.y + (a.y * Math.cos(t) + b.y * Math.sin(t)) * RING.radius;
      const z = ring.z + (a.z * Math.cos(t) + b.z * Math.sin(t)) * RING.radius;
      const p = project(cam, x, y, z);
      if (!p) { visible = false; break; }
      pts.push(p);
    }
    if (!visible) continue;
    const isNext = i === world.nextRing;
    const colour = ring.passed ? '#57d977' : isNext ? pal.accent : '#39c2c9';
    // Translucent disc inside the ring so the gate reads as a target.
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fillStyle = colour + (isNext ? '14' : '0a');
    ctx.fill();
    // Outer glow, then the bright rim; the next ring gets a rotating dash.
    ctx.save();
    if (isNext) { ctx.shadowColor = colour; ctx.shadowBlur = 18; }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = colour + '55';
    ctx.lineWidth = Math.max(2.5, 340 / pts[0].d);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1.4, 140 / pts[0].d);
    if (isNext) { ctx.setLineDash([14, 9]); ctx.lineDashOffset = -world.time * 26; }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    if (isNext) {
      // Chevrons on the ring rim point at the centre, so the target reads
      // instantly even at a distance.
      const centre = project(cam, ring.x, ring.y, ring.z);
      if (centre) {
        ctx.fillStyle = colour;
        for (let k = 0; k < 4; k += 1) {
          const rim = pts[k * 6];
          const dx = centre.x - rim.x, dy = centre.y - rim.y;
          const dl = Math.hypot(dx, dy) || 1;
          const tip = { x: rim.x + (dx / dl) * 10, y: rim.y + (dy / dl) * 10 };
          const px = -dy / dl, py = dx / dl;
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(rim.x + px * 6, rim.y + py * 6);
          ctx.lineTo(rim.x - px * 6, rim.y - py * 6);
          ctx.closePath();
          ctx.fill();
        }
        // Ring number above the target.
        ctx.font = `800 ${clamp(2600 / centre.d, 11, 30)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = colour;
        ctx.fillText(String(i + 1), centre.x, centre.y - Math.max(14, (RING.radius * FOCAL / centre.d) + 10));
      }
      // A soft light pillar to the ground marks the target from far off,
      // and a pulsing halo draws the eye to the ring itself.
      const top = project(cam, ring.x, ring.y, ring.z);
      const foot = project(cam, ring.x, terrainHeight(ring.x, ring.z), ring.z);
      if (top && foot) {
        const pillar = ctx.createLinearGradient(top.x, top.y, foot.x, foot.y);
        pillar.addColorStop(0, colour + '55');
        pillar.addColorStop(1, colour + '08');
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(foot.x, foot.y);
        ctx.strokeStyle = pillar;
        ctx.lineWidth = Math.max(3, 420 / top.d);
        ctx.stroke();
        const pulse = 1 + 0.18 * Math.sin(world.time * 3.2);
        ctx.beginPath();
        ctx.arc(top.x, top.y, Math.max(3, (RING.radius * FOCAL / top.d) * pulse), 0, Math.PI * 2);
        ctx.strokeStyle = colour + '66';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(top.x, top.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
      }
    }
  }
}

function drawScenery(ctx, world, cam) {
  const pal = world.course.palette;
  // Town blocks east of the field.
  for (const block of world.blocks) {
    const base = project(cam, block.x, block.y, block.z);
    const top = project(cam, block.x, block.y + block.h, block.z);
    if (!base || !top || base.d > 2600) continue;
    const wpx = (block.w * FOCAL) / base.d;
    ctx.fillStyle = mixRgb(shade(pal.rock, 0.92), pal.fog, clamp(1 - Math.exp(-base.d / 2100), 0, 0.9));
    ctx.fillRect(base.x - wpx / 2, top.y, wpx, base.y - top.y);
    ctx.fillStyle = shade(pal.rock, 0.7);
    ctx.fillRect(base.x - wpx / 2, top.y, wpx, Math.max(1.5, wpx * 0.08));
    if (base.d < 900) {
      ctx.fillStyle = '#ffd98a';
      for (let wy = top.y + 4; wy < base.y - 3; wy += 7) {
        for (let wx = base.x - wpx / 2 + 3; wx < base.x + wpx / 2 - 3; wx += 7) {
          if ((Math.floor(wx + wy) % 3) !== 0) ctx.fillRect(wx, wy, 2.4, 3);
        }
      }
    }
  }
  // Houses: walls with a pitched roof and a lit window or two.
  for (const house of world.houses || []) {
    const base = project(cam, house.x, house.y, house.z);
    const top = project(cam, house.x, house.y + house.h, house.z);
    if (!base || !top || base.d > 3200) continue;
    const wpx = (house.w * FOCAL) / base.d;
    const wall = house.tone > 0.5 ? '#e6dcc8' : '#d8c9ae';
    ctx.fillStyle = mixRgb(shade(wall, 0.95), pal.fog, clamp(1 - Math.exp(-base.d / 2200), 0, 0.9));
    ctx.fillRect(base.x - wpx / 2, top.y, wpx, base.y - top.y);
    ctx.beginPath();
    ctx.moveTo(base.x - wpx * 0.62, top.y);
    ctx.lineTo(base.x, top.y - wpx * 0.34);
    ctx.lineTo(base.x + wpx * 0.62, top.y);
    ctx.closePath();
    ctx.fillStyle = house.tone > 0.5 ? '#a84a3a' : '#7a4a34';
    ctx.fill();
    if (base.d < 1100) {
      ctx.fillStyle = '#ffd98a';
      ctx.fillRect(base.x - wpx * 0.28, top.y + (base.y - top.y) * 0.35, Math.max(1.6, wpx * 0.16), Math.max(2, wpx * 0.2));
      ctx.fillRect(base.x + wpx * 0.12, top.y + (base.y - top.y) * 0.35, Math.max(1.6, wpx * 0.16), Math.max(2, wpx * 0.2));
    }
  }
  // Trees: pines as stacked triangles, broadleaf as a shaded canopy ball.
  for (const tree of world.trees) {
    const base = project(cam, tree.x, tree.y, tree.z);
    if (!base || base.d > 2400) continue;
    const hpx = (tree.s * FOCAL) / base.d;
    if (tree.pine) {
      ctx.fillStyle = '#2f5d33';
      for (let layer = 0; layer < 3; layer += 1) {
        const ly = base.y - hpx * (layer * 0.3);
        const lw = hpx * (0.5 - layer * 0.12);
        ctx.beginPath();
        ctx.moveTo(base.x, ly - hpx * 0.42);
        ctx.lineTo(base.x - lw / 2, ly);
        ctx.lineTo(base.x + lw / 2, ly);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = '#5d4630';
      ctx.lineWidth = Math.max(1, hpx * 0.08);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x, base.y - hpx * 0.45);
      ctx.stroke();
      const canopy = ctx.createRadialGradient(base.x - hpx * 0.1, base.y - hpx * 0.72, hpx * 0.05, base.x, base.y - hpx * 0.62, hpx * 0.42);
      canopy.addColorStop(0, '#5d8a44');
      canopy.addColorStop(1, '#33512a');
      ctx.fillStyle = canopy;
      ctx.beginPath();
      ctx.arc(base.x, base.y - hpx * 0.62, hpx * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Clouds drift slowly east, with soft shadows pooled on the ground.
  for (const cloud of world.clouds) {
    const x = cloud.x + ((world.time * cloud.drift) % 400);
    const shadow = project(cam, x + 180, terrainHeight(x + 180, cloud.z) + 1, cloud.z);
    if (shadow && shadow.d < 5200) {
      const sr = (cloud.r * FOCAL) / shadow.d;
      ctx.fillStyle = 'rgba(20,34,24,0.13)';
      ctx.beginPath();
      ctx.ellipse(shadow.x, shadow.y, sr * 0.8, sr * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const c = project(cam, x, cloud.y, cloud.z);
    if (!c || c.d > 6500) continue;
    const r = (cloud.r * FOCAL) / c.d;
    // Layered puffs with radial falloff: bright tops, shaded bellies.
    const puffs = [[0, 0, 0.52], [-0.45, 0.1, 0.38], [0.42, 0.08, 0.42], [-0.18, -0.14, 0.34], [0.2, -0.12, 0.3]];
    for (const [ox, oy, orr] of puffs) {
      const px = c.x + ox * r, py = c.y + oy * r, pr = r * orr;
      const puffGrad = ctx.createRadialGradient(px, py - pr * 0.35, pr * 0.1, px, py, pr);
      puffGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
      puffGrad.addColorStop(0.7, 'rgba(248,250,252,0.34)');
      puffGrad.addColorStop(1, 'rgba(240,245,250,0)');
      ctx.fillStyle = puffGrad;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(120,140,165,0.15)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + r * 0.2, r * 0.72, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Wind turbines on the ridge: tower plus three rotating blades.
  for (const t of world.turbines || []) {
    const base = project(cam, t.x, t.y, t.z);
    const hub = project(cam, t.x, t.y + 46, t.z);
    if (!base || !hub || base.d > 4200) continue;
    ctx.strokeStyle = '#e8edf2';
    ctx.lineWidth = Math.max(1, 900 / base.d);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(hub.x, hub.y);
    ctx.stroke();
    const blade = (26 * FOCAL) / base.d;
    ctx.lineWidth = Math.max(1, 500 / base.d);
    for (let b = 0; b < 3; b += 1) {
      const ang = t.phase + world.time * 0.9 + b * (Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.moveTo(hub.x, hub.y);
      ctx.lineTo(hub.x + Math.cos(ang) * blade, hub.y + Math.sin(ang) * blade);
      ctx.stroke();
    }
  }
  // Lighthouse on the lake shore, with a rotating beam.
  if (world.lighthouse) {
    const lh = world.lighthouse;
    const base = project(cam, lh.x, lh.y, lh.z);
    const top = project(cam, lh.x, lh.y + 34, lh.z);
    if (base && top && base.d < 4200) {
      const wpx = Math.max(2, (7 * FOCAL) / base.d);
      ctx.fillStyle = '#f2f4f6';
      ctx.fillRect(base.x - wpx / 2, top.y, wpx, base.y - top.y);
      ctx.fillStyle = '#c94f42';
      ctx.fillRect(base.x - wpx / 2, top.y + (base.y - top.y) * 0.3, wpx, (base.y - top.y) * 0.18);
      ctx.fillRect(base.x - wpx / 2, top.y + (base.y - top.y) * 0.62, wpx, (base.y - top.y) * 0.18);
      ctx.fillStyle = '#2c3440';
      ctx.fillRect(top.x - wpx * 0.7, top.y - wpx * 0.5, wpx * 1.4, wpx * 0.5);
      const beam = Math.sin(world.time * 0.7) * 0.5;
      ctx.save();
      ctx.translate(top.x, top.y - wpx * 0.25);
      ctx.rotate(beam);
      const beamGrad = ctx.createLinearGradient(0, 0, 240, 0);
      beamGrad.addColorStop(0, 'rgba(255,240,180,0.5)');
      beamGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(240, -14);
      ctx.lineTo(240, 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  // Sailboats bobbing on the lake.
  for (const boat of world.boats || []) {
    const s = project(cam, boat.x, WATER_LEVEL + 1, boat.z);
    if (!s || s.d > 3600) continue;
    const wpx = (10 * FOCAL) / s.d;
    const bob = Math.sin(world.time * 1.3 + boat.phase) * wpx * 0.06;
    ctx.fillStyle = '#eef2f5';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + bob - wpx * 0.9);
    ctx.lineTo(s.x, s.y + bob);
    ctx.lineTo(s.x + wpx * 0.55, s.y + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a5a3c';
    ctx.fillRect(s.x - wpx * 0.5, s.y + bob, wpx, Math.max(1, wpx * 0.16));
  }
  // One hot-air balloon drifting over the valley.
  if (world.balloon) {
    const b = world.balloon;
    const bx = b.x + Math.sin(world.time * 0.05) * 160;
    const s = project(cam, bx, b.y + Math.sin(world.time * 0.4) * 6, b.z);
    if (s && s.d < 5200) {
      const r = (16 * FOCAL) / s.d;
      const stripes = ['#c94f42', '#f2e3c9', '#3d6e8f', '#f2e3c9'];
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = stripes[i];
        ctx.beginPath();
        ctx.ellipse(s.x + (i - 1.5) * r * 0.42, s.y, r * 0.34, r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(40,40,40,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x - r * 0.4, s.y + r * 0.8);
      ctx.lineTo(s.x - r * 0.22, s.y + r * 1.25);
      ctx.moveTo(s.x + r * 0.4, s.y + r * 0.8);
      ctx.lineTo(s.x + r * 0.22, s.y + r * 1.25);
      ctx.stroke();
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(s.x - r * 0.24, s.y + r * 1.25, r * 0.48, r * 0.3);
    }
  }
}

function drawAircraft(ctx, world, lift = 0) {
  const p = world.plane;
  const cx = W / 2;
  // Fine engine vibration, stronger with throttle.
  const buzz = Math.sin(world.time * 42) * 0.7 * p.throttle;
  const cy = H * 0.6 + p.pitch * 26 + lift + buzz;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(p.roll * 0.85);
  ctx.scale(1.62, 1.62);
  // Exhaust shimmer behind the cowling at high throttle.
  if (p.throttle > 0.55) {
    ctx.fillStyle = 'rgba(200,205,210,0.18)';
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(0, 34 + i * 7, 5 + i * 2.4, 4 + i * 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Propeller: a translucent disc with two blurred blades sweeping round.
  ctx.beginPath();
  ctx.ellipse(0, -6, 7, 30, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(220,230,240,0.13)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,238,246,0.4)';
  ctx.lineWidth = 2.4;
  const propAng = world.time * (6 + p.throttle * 26);
  for (let b = 0; b < 2; b += 1) {
    const a = propAng + b * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(Math.cos(a) * 6.4, -6 + Math.sin(a) * 29);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, -6, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = '#8a939e';
  ctx.fill();
  // Wings.
  ctx.beginPath();
  ctx.moveTo(-118, 8); ctx.lineTo(-30, -2); ctx.lineTo(30, -2); ctx.lineTo(118, 8);
  ctx.lineTo(112, 16); ctx.lineTo(28, 8); ctx.lineTo(-28, 8); ctx.lineTo(-112, 16);
  ctx.closePath();
  const wingGrad = ctx.createLinearGradient(-118, 0, 118, 0);
  wingGrad.addColorStop(0, '#c94f42');
  wingGrad.addColorStop(0.5, '#e8e4da');
  wingGrad.addColorStop(1, '#c94f42');
  ctx.fillStyle = wingGrad;
  ctx.fill();
  // Wing stripes, panel lines and ailerons.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(-86, 4, 26, 4);
  ctx.fillRect(60, 4, 26, 4);
  ctx.strokeStyle = 'rgba(60,52,44,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-104, 6); ctx.lineTo(-40, 1);
  ctx.moveTo(104, 6); ctx.lineTo(40, 1);
  ctx.moveTo(-64, 3); ctx.lineTo(-62, 13);
  ctx.moveTo(64, 3); ctx.lineTo(62, 13);
  ctx.stroke();
  // Fuselage with a metallic highlight running down its spine.
  const fuseGrad = ctx.createLinearGradient(-15, 0, 15, 0);
  fuseGrad.addColorStop(0, '#b9b2a4');
  fuseGrad.addColorStop(0.38, '#f4f0e6');
  fuseGrad.addColorStop(0.55, '#ffffff');
  fuseGrad.addColorStop(1, '#a89f8e');
  ctx.beginPath();
  ctx.ellipse(0, 2, 15, 34, 0, 0, Math.PI * 2);
  ctx.fillStyle = fuseGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,52,44,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 15, 34, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Cheatline stripe along the fuselage.
  ctx.fillStyle = '#c94f42';
  ctx.fillRect(-14, 8, 28, 3);
  ctx.beginPath();
  ctx.ellipse(0, -12, 9, 15, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#37506b';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-3, -18, 3.4, 7, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(200,225,245,0.75)';
  ctx.fill();
  // Tail.
  ctx.beginPath();
  ctx.moveTo(-34, 30); ctx.lineTo(34, 30); ctx.lineTo(28, 38); ctx.lineTo(-28, 38);
  ctx.closePath();
  ctx.fillStyle = '#c94f42';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 18); ctx.lineTo(0, 40); ctx.lineTo(7, 40); ctx.lineTo(5, 20);
  ctx.closePath();
  ctx.fillStyle = '#a83e33';
  ctx.fill();
  // Gear legs when down.
  if (p.gear) {
    ctx.strokeStyle = '#2c2f36';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-16, 14); ctx.lineTo(-20, 30);
    ctx.moveTo(16, 14); ctx.lineTo(20, 30);
    ctx.stroke();
    ctx.fillStyle = '#1c1e24';
    ctx.fillRect(-25, 29, 10, 5);
    ctx.fillRect(15, 29, 10, 5);
  }
  // Navigation lights: red left, green right, blinking white tail.
  const navGlow = (x, y, colour) => {
    const g = ctx.createRadialGradient(x, y, 0.5, x, y, 9);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
  };
  navGlow(-116, 10, '#ff5a4e');
  navGlow(116, 10, '#4ee08a');
  if (Math.floor(world.time * 1.4) % 2 === 0) navGlow(0, 38, '#ffffff');
  ctx.restore();
  // Ground shadow.
  const ground = terrainHeight(p.x, p.z);
  const alt = Math.max(0, p.y - ground);
  if (alt < 260) {
    const s = clamp(1 - alt / 320, 0.25, 1);
    ctx.beginPath();
    ctx.ellipse(cx + p.roll * 30, cy + 120 + alt * 0.12, 70 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(10,16,10,${0.3 * s})`;
    ctx.fill();
  }
}

function gauge(ctx, x, y, r, label, value, min, max, unit) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#10151d';
  ctx.fill();
  ctx.strokeStyle = '#8fa3b8';
  ctx.lineWidth = 2;
  ctx.stroke();
  const t = clamp((value - min) / (max - min), 0, 1);
  const ang = Math.PI * 0.75 + t * Math.PI * 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(ang) * r * 0.78, y + Math.sin(ang) * r * 0.78);
  ctx.strokeStyle = '#ffb454';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#d7e1ea';
  ctx.fill();
  ctx.fillStyle = '#d7e1ea';
  ctx.font = `600 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + r * 0.52);
  ctx.font = `700 13px ${MONO}`;
  ctx.fillText(`${Math.round(value)}${unit}`, x, y + r * 0.78);
}

function drawCockpit(ctx, world) {
  const p = world.plane;
  const pal = world.course.palette;
  const top = H * 0.68;
  // Glareshield and panel.
  ctx.fillStyle = pal.panel;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, top + 26);
  ctx.quadraticCurveTo(W / 2, top - 22, W, top + 26);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, top + 30, W, 3);
  // Windshield pillars.
  ctx.fillStyle = pal.panel;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(64, 0); ctx.lineTo(150, top + 30); ctx.lineTo(0, top + 40);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, 0); ctx.lineTo(W - 64, 0); ctx.lineTo(W - 150, top + 30); ctx.lineTo(W, top + 40);
  ctx.closePath(); ctx.fill();
  // Artificial horizon.
  const hx = W / 2, hy = top + 108, hr = 62;
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(hx, hy);
  ctx.rotate(-p.roll);
  const pitchPx = p.pitch * 90;
  ctx.fillStyle = '#4a86b8';
  ctx.fillRect(-hr * 1.6, -hr * 1.6 + pitchPx, hr * 3.2, hr * 1.6);
  ctx.fillStyle = '#7a5c38';
  ctx.fillRect(-hr * 1.6, pitchPx, hr * 3.2, hr * 1.6);
  ctx.fillStyle = '#e8eef4';
  ctx.fillRect(-hr * 1.6, pitchPx - 1, hr * 3.2, 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.strokeStyle = '#8fa3b8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx - 30, hy); ctx.lineTo(hx - 8, hy); ctx.lineTo(hx, hy + 6); ctx.lineTo(hx + 8, hy); ctx.lineTo(hx + 30, hy);
  ctx.stroke();
  // Gauges: airspeed, altimeter, vertical speed.
  gauge(ctx, hx - 190, hy, 56, 'AIRSPEED', p.speed * KT, 0, 200, '');
  gauge(ctx, hx + 190, hy, 56, 'ALTITUDE', p.y * FT, 0, 3000, '');
  gauge(ctx, hx + 330, hy, 46, 'FT/MIN', p.vy * 196.85, -2000, 2000, '');
  // Heading indicator with a rotating compass card.
  const hdgDeg = ((p.heading * 180 / Math.PI) % 360 + 360) % 360;
  gauge(ctx, hx - 330, hy + 6, 42, 'HDG', hdgDeg, 0, 360, '');
  // Control yoke that moves with the stick.
  ctx.save();
  ctx.translate(hx, hy + 96);
  ctx.rotate(p.roll * 0.5);
  ctx.strokeStyle = '#39424e';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-46, 0);
  ctx.quadraticCurveTo(0, 16 + p.pitch * 10, 46, 0);
  ctx.stroke();
  ctx.fillStyle = '#2c3440';
  ctx.fillRect(-54, -6, 14, 12);
  ctx.fillRect(40, -6, 14, 12);
  ctx.restore();
  // Throttle lever.
  const tx = hx - 440, ty = hy - 40;
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(tx - 8, ty, 16, 84);
  ctx.fillStyle = '#ffb454';
  ctx.fillRect(tx - 12, ty + 84 * (1 - p.throttle) - 5, 24, 10);
  ctx.fillStyle = '#d7e1ea';
  ctx.font = `600 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('THROTTLE', tx, ty + 102);
  // Lamps.
  const lamp = (x, label, on, colour) => {
    ctx.beginPath();
    ctx.arc(x, top + 34, 7, 0, Math.PI * 2);
    ctx.fillStyle = on ? colour : '#39424e';
    ctx.fill();
    ctx.fillStyle = '#aeb9c6';
    ctx.font = `600 10px ${FONT}`;
    ctx.fillText(label, x, top + 56);
  };
  lamp(hx - 250, 'GEAR', p.gear, '#4ee08a');
  lamp(hx - 200, 'FLAPS', p.flaps, '#ffd166');
  lamp(hx + 200, 'STALL', p.stalled, '#ff5a4e');
  lamp(hx + 250, 'BRAKE', p.brake, '#ff9e5e');
}

function tape(ctx, x, y, h, value, step, label, fmt) {
  ctx.fillStyle = 'rgba(12,18,26,0.62)';
  ctx.fillRect(x - 34, y - h / 2, 68, h);
  ctx.strokeStyle = 'rgba(190,210,225,0.5)';
  ctx.strokeRect(x - 34, y - h / 2, 68, h);
  ctx.fillStyle = '#d7e1ea';
  ctx.font = `600 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - h / 2 - 6);
  const pxPerUnit = h / (step * 6);
  ctx.font = `600 12px ${MONO}`;
  for (let v = Math.floor(value / step) * step - step * 3; v <= value + step * 3; v += step) {
    const yy = y - (v - value) * pxPerUnit;
    if (yy < y - h / 2 + 8 || yy > y + h / 2 - 8) continue;
    ctx.fillRect(x - 30, yy, 10, 1.6);
    ctx.fillText(fmt(v), x + 8, yy + 4);
  }
  ctx.fillStyle = '#ffb454';
  ctx.fillRect(x - 34, y - 11, 68, 22);
  ctx.fillStyle = '#141a22';
  ctx.font = `700 14px ${MONO}`;
  ctx.fillText(fmt(value), x, y + 5);
}

function drawHud(ctx, world, cam, mode) {
  const p = world.plane;
  const pal = world.course.palette;
  const headingDeg = ((p.heading * 180 / Math.PI) % 360 + 360) % 360;
  // Compass ribbon.
  const cw = 360, cx = W / 2, cy = 30;
  ctx.fillStyle = 'rgba(12,18,26,0.62)';
  ctx.fillRect(cx - cw / 2, cy - 14, cw, 28);
  ctx.strokeStyle = 'rgba(190,210,225,0.5)';
  ctx.strokeRect(cx - cw / 2, cy - 14, cw, 28);
  ctx.font = `600 12px ${MONO}`;
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 10) {
    const deg = ((Math.round(headingDeg / 10) * 10 + d) % 360 + 360) % 360;
    const x = cx + (d - (headingDeg % 10)) * 3;
    if (x < cx - cw / 2 + 12 || x > cx + cw / 2 - 12) continue;
    const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg / 10);
    ctx.fillStyle = '#d7e1ea';
    ctx.fillText(label, x, cy + 4);
  }
  ctx.fillStyle = '#ffb454';
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - 14); ctx.lineTo(cx + 6, cy - 14); ctx.lineTo(cx, cy - 5);
  ctx.closePath(); ctx.fill();
  ctx.font = `700 13px ${MONO}`;
  ctx.fillText(`HDG ${String(Math.round(headingDeg)).padStart(3, '0')}`, cx, cy + 30);

  tape(ctx, 62, H / 2, 240, p.speed * KT, 20, 'KT', (v) => String(Math.round(v)));
  tape(ctx, W - 62, H / 2, 240, p.y * FT, 200, 'FT', (v) => String(Math.round(v)));

  // Pitch ladder + flight-path marker.
  ctx.strokeStyle = 'rgba(215,225,234,0.75)';
  ctx.lineWidth = 1.6;
  for (const deg of [-20, -10, 10, 20]) {
    const y = H / 2 - (deg * Math.PI / 180 - p.pitch) * FOCAL * 0.9;
    if (y < 80 || y > H - 120) continue;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 46, y); ctx.lineTo(W / 2 - 14, y);
    ctx.moveTo(W / 2 + 14, y); ctx.lineTo(W / 2 + 46, y);
    ctx.stroke();
  }
  const fpmY = H / 2 - clamp(Math.atan2(p.vy, Math.max(p.speed, 8)), -0.4, 0.4) * FOCAL * 0.9;
  ctx.strokeStyle = '#7dffb0';
  ctx.beginPath();
  ctx.arc(W / 2, fpmY, 9, 0, Math.PI * 2);
  ctx.moveTo(W / 2 - 20, fpmY); ctx.lineTo(W / 2 - 9, fpmY);
  ctx.moveTo(W / 2 + 9, fpmY); ctx.lineTo(W / 2 + 20, fpmY);
  ctx.stroke();

  // Next-ring marker or edge arrow; after the last ring, point home.
  const ring = world.targetRing();
  const target = ring ? { x: ring.x, y: ring.y, z: ring.z } : { x: 0, y: RUNWAY.elevation, z: -RUNWAY.length / 2 + 120 };
  const s = project(cam, target.x, target.y, target.z);
  const bearing = wrapAngle(Math.atan2(target.x - p.x, -(target.z - p.z)) - p.heading);
  if (s && s.x > 30 && s.x < W - 30 && s.y > 60 && s.y < H - 40) {
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 11); ctx.lineTo(s.x + 11, s.y); ctx.lineTo(s.x, s.y + 11); ctx.lineTo(s.x - 11, s.y);
    ctx.closePath(); ctx.stroke();
  } else {
    const ex = clamp(W / 2 + Math.sin(bearing) * 420, 44, W - 44);
    const ey = clamp(H / 2 - Math.cos(bearing) * 120, 70, H - 90);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(bearing);
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(9, 8); ctx.lineTo(0, 3); ctx.lineTo(-9, 8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  const dist = Math.hypot(target.x - p.x, target.z - p.z);
  ctx.fillStyle = '#d7e1ea';
  ctx.font = `600 12px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(ring ? `RING ${world.nextRing + 1}/${world.rings.length} · ${Math.round(dist)}m` : `LAND RUNWAY 36 · ${Math.round(dist)}m`, W / 2, 86);

  // Score block on a frosted-glass card.
  ctx.fillStyle = 'rgba(10,16,24,0.5)';
  ctx.beginPath();
  ctx.roundRect(10, 10, 252, 52, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,210,225,0.35)';
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.font = `700 17px ${MONO}`;
  ctx.fillStyle = '#f2f6fa';
  ctx.fillText(`SCORE ${world.score}`, 18, 30);
  ctx.font = `600 13px ${MONO}`;
  ctx.fillStyle = '#b9c6d4';
  const mins = Math.floor(world.time / 60), secs = Math.floor(world.time % 60);
  ctx.fillText(`${world.course.name} · ${mins}:${String(secs).padStart(2, '0')}`, 18, 52);
  ctx.textAlign = 'right';
  ctx.fillText(mode === CAM_COCKPIT ? 'COCKPIT' : 'CHASE', W - 18, 30);
  ctx.fillText(`THR ${Math.round(p.throttle * 100)}%`, W - 18, 52);

  // Ring progress pips under the compass: filled = banked, pulsing = next.
  const pipY = 108;
  const pipGap = 22;
  const pipStart = W / 2 - ((world.rings.length - 1) * pipGap) / 2;
  world.rings.forEach((r, i) => {
    const x = pipStart + i * pipGap;
    ctx.beginPath();
    ctx.arc(x, pipY, i === world.nextRing ? 6 + Math.sin(world.time * 4) * 1.2 : 5, 0, Math.PI * 2);
    ctx.fillStyle = r.passed ? '#57d977' : i === world.nextRing ? pal.accent : 'rgba(190,210,225,0.35)';
    ctx.fill();
  });

  // Wind and height above ground, bottom right.
  const wind = world.windNow();
  const windKt = Math.round(Math.hypot(wind.x, wind.z) * KT);
  const agl = Math.max(0, Math.round((p.y - terrainHeight(p.x, p.z)) * FT));
  ctx.textAlign = 'right';
  ctx.font = `600 12px ${MONO}`;
  ctx.fillStyle = '#b9c6d4';
  ctx.fillText(`WIND ${windKt} KT · AGL ${agl} FT`, W - 18, H - 34);

  // Speed streaks at the frame edges when the aircraft is moving fast.
  if (p.speed > 58) {
    const intensity = clamp((p.speed - 58) / 34, 0, 1);
    ctx.strokeStyle = `rgba(235,244,250,${0.16 * intensity})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const y = 90 + i * 78 + ((world.time * 260 + i * 47) % 60);
      const len = 40 + intensity * 70;
      ctx.beginPath();
      ctx.moveTo(6, y);
      ctx.lineTo(6 + len, y);
      ctx.moveTo(W - 6, y + 30);
      ctx.lineTo(W - 6 - len, y + 30);
      ctx.stroke();
    }
  }
  // Gentle vignette to seat the scene.
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(6,10,16,0.22)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Throttle bar + lamps (chase view; the panel carries them in cockpit).
  if (mode === CAM_CHASE) {
    ctx.fillStyle = 'rgba(12,18,26,0.62)';
    ctx.fillRect(18, H - 64, 170, 14);
    ctx.fillStyle = '#ffb454';
    ctx.fillRect(20, H - 62, 166 * p.throttle, 10);
    ctx.fillStyle = '#b9c6d4';
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`GEAR ${p.gear ? 'DOWN' : 'UP'} · FLAPS ${p.flaps ? 'ON' : 'OFF'}`, 18, H - 34);
  }

  // Minimap: runway, rings and the aircraft on a glass card, bottom right.
  const mmSize = 148, mmX = W - mmSize - 16, mmY = H - mmSize - 52;
  ctx.fillStyle = 'rgba(10,16,24,0.55)';
  ctx.beginPath();
  ctx.roundRect(mmX, mmY, mmSize, mmSize, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,210,225,0.4)';
  ctx.stroke();
  const mmScale = mmSize / 10200;
  const mmPx = (x, z) => [mmX + mmSize / 2 + x * mmScale, mmY + mmSize / 2 + z * mmScale + 28];
  const [rwx, rwy] = mmPx(0, 0);
  ctx.fillStyle = '#d7e1ea';
  ctx.fillRect(rwx - 1.5, rwy - 10, 3, 20);
  world.rings.forEach((r, i) => {
    const [rx, ry] = mmPx(r.x, r.z);
    ctx.beginPath();
    ctx.arc(rx, ry, i === world.nextRing ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = r.passed ? '#57d977' : i === world.nextRing ? pal.accent : 'rgba(190,210,225,0.6)';
    ctx.fill();
  });
  const [ax, ay] = mmPx(p.x, p.z);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(p.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#b9c6d4';
  ctx.font = `600 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('MAP', mmX + mmSize / 2, mmY + 14);

  // Score popup: floats up and fades after each ring.
  if (world.popup) {
    const age = world.time - world.popup.at;
    if (age < 1.6) {
      const rise = age * 46;
      const alpha = clamp(1 - age / 1.6, 0, 1);
      ctx.textAlign = 'center';
      ctx.font = `800 34px ${FONT}`;
      ctx.fillStyle = `rgba(255,213,110,${alpha})`;
      ctx.fillText(world.popup.text, W / 2, H * 0.4 - rise);
      ctx.font = `700 16px ${FONT}`;
      ctx.fillStyle = `rgba(240,248,255,${alpha})`;
      ctx.fillText(world.popup.sub, W / 2, H * 0.4 - rise + 24);
    }
  }

  // Warnings.
  ctx.textAlign = 'center';
  if (p.stalled) {
    // Pulsing red frame edge while the wing is stalled.
    const pulse = 0.25 + 0.2 * Math.sin(world.time * 9);
    ctx.strokeStyle = `rgba(255,70,55,${pulse})`;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, W - 10, H - 10);
  }
  if (p.stalled && Math.floor(world.time * 2.4) % 2 === 0) {
    ctx.fillStyle = '#ff5a4e';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText('STALL', W / 2, H * 0.34);
  } else if (p.airborne && !p.gear && p.y - terrainHeight(p.x, p.z) < 90 && p.vy < -1) {
    ctx.fillStyle = '#ffd166';
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText('GEAR UP', W / 2, H * 0.34);
  } else if (p.airborne && p.vy < -7.5 && p.y - terrainHeight(p.x, p.z) < 130) {
    ctx.fillStyle = '#ffd166';
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText('SINK RATE', W / 2, H * 0.34);
  }
  if (!p.airborne && !world.finished) {
    ctx.fillStyle = '#eef4f9';
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(p.speed < 31 ? 'W — throttle up, then pull back (Down arrow) to lift off' : 'Pull back (Down arrow) to lift off', W / 2, H * 0.78);
  }
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,16,24,0.94)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,210,225,0.35)';
  ctx.stroke();
}

function drawTitle(ctx, world, best) {
  const pal = world.course.palette;
  ctx.textAlign = 'center';
  // Gradient wordmark with a soft drop shadow.
  ctx.save();
  ctx.shadowColor = 'rgba(8,12,20,0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 5;
  const titleGrad = ctx.createLinearGradient(0, 62, 0, 134);
  titleGrad.addColorStop(0, '#ffffff');
  titleGrad.addColorStop(0.55, '#dceef7');
  titleGrad.addColorStop(1, pal.accent);
  ctx.fillStyle = titleGrad;
  ctx.font = `800 68px ${FONT}`;
  ctx.fillText('SKYBOUND RUN', W / 2, 130);
  ctx.restore();
  ctx.font = `600 17px ${FONT}`;
  ctx.fillStyle = pal.accent;
  ctx.fillText('Fly the rings. Land it smooth.', W / 2, 162);
  // Feature chips.
  const chips = ['3 COURSES', 'CHASE + COCKPIT', 'GRADED LANDINGS', 'OFFLINE'];
  ctx.font = `700 11px ${FONT}`;
  let chipX = W / 2 - 262;
  for (const chip of chips) {
    const w = ctx.measureText(chip).width + 22;
    ctx.fillStyle = 'rgba(10,16,24,0.55)';
    ctx.beginPath();
    ctx.roundRect(chipX, 176, w, 22, 11);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,210,225,0.4)';
    ctx.stroke();
    ctx.fillStyle = '#d7e1ea';
    ctx.fillText(chip, chipX + w / 2, 191);
    chipX += w + 10;
  }
  panel(ctx, W / 2 - 315, 206, 630, 216);
  ctx.textAlign = 'left';
  ctx.font = `700 16px ${FONT}`;
  ctx.fillStyle = '#eef4f9';
  ctx.fillText('COURSES — press 1, 2 or 3, then Enter', W / 2 - 285, 232);
  ctx.font = `600 15px ${MONO}`;
  world.constructor; // (no-op keeps linters quiet about the import graph)
  const names = ['1  Dawn Valley      6 rings · calm', '2  Coastal Noon     8 rings · crosswind', '3  Dusk Canyon     10 rings · gusty'];
  names.forEach((line, i) => {
    const selected = world.courseIndex === i;
    ctx.fillStyle = selected ? pal.accent : '#c3d0dd';
    ctx.fillText(`${selected ? '▸' : ' '} ${line}   best ${best[i] || 0}`, W / 2 - 285, 264 + i * 30);
  });
  ctx.font = `500 13.5px ${FONT}`;
  ctx.fillStyle = '#aeb9c6';
  const help = [
    'W/S throttle · Down/Up pitch · Left/Right roll · A/D rudder · mouse steers after a click',
    'F flaps · G gear · Space brake · C camera · P pause · M mute · R restart',
  ];
  help.forEach((line, i) => ctx.fillText(line, W / 2 - 285, 362 + i * 22));
  ctx.textAlign = 'center';
  ctx.font = `700 19px ${FONT}`;
  ctx.fillStyle = '#f6f9fc';
  ctx.fillText('Press ENTER to fly', W / 2, 446);
}

function drawResults(ctx, world, best) {
  const pal = world.course.palette;
  const r = world.landingReport;
  panel(ctx, W / 2 - 300, 150, 600, 400);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f6f9fc';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(world.plane.landed ? 'FLIGHT COMPLETE' : 'FLIGHT OVER', W / 2, 206);
  if (r && r.perfect) {
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = '#7dffb0';
    ctx.fillText('★ SMOOTH LANDING ★', W / 2, 230);
  }
  ctx.font = `800 84px ${FONT}`;
  ctx.fillStyle = pal.accent;
  ctx.fillText(world.grade(), W / 2, 296);
  // Score bar: how close the flight came to a perfect run.
  const maxScore = world.rings.length * 150 + 300 + 150 + world.course.par * 4;
  const ratio = clamp(world.score / maxScore, 0, 1);
  ctx.fillStyle = 'rgba(190,210,225,0.18)';
  ctx.beginPath();
  ctx.roundRect(W / 2 - 200, 310, 400, 10, 5);
  ctx.fill();
  ctx.fillStyle = pal.accent;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 200, 310, 400 * ratio, 10, 5);
  ctx.fill();
  ctx.font = `600 12px ${MONO}`;
  ctx.fillStyle = '#aeb9c6';
  ctx.fillText(`${Math.round(ratio * 100)}% of a perfect flight`, W / 2, 338);
  ctx.font = `600 15px ${MONO}`;
  ctx.fillStyle = '#d7e1ea';
  const rows = [
    [`Rings ${world.rings.filter((x) => x.passed).length}/${world.rings.length}`, world.ringScore],
  ];
  if (r) {
    rows.push([`Landing${r.perfect ? ' (perfect!)' : ''}`, r.landingScore]);
    rows.push(['Time bonus', r.timeBonus]);
    rows.push([`Touchdown ${r.sink.toFixed(1)} m/s · ${Math.round(r.offset)} m off centre`, '']);
  }
  rows.push(['TOTAL', world.score]);
  rows.push(['Best', Math.max(best[world.courseIndex] || 0, world.score)]);
  rows.forEach((row, i) => {
    ctx.textAlign = 'left';
    ctx.fillText(row[0], W / 2 - 250, 368 + i * 26);
    ctx.textAlign = 'right';
    ctx.fillText(String(row[1]), W / 2 + 250, 368 + i * 26);
  });
  ctx.textAlign = 'center';
  ctx.font = `600 15px ${FONT}`;
  ctx.fillStyle = '#aeb9c6';
  ctx.fillText('R — fly again · Enter — next course', W / 2, 538);
}

function drawCrashed(ctx, world) {
  panel(ctx, W / 2 - 300, 220, 600, 240);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff8a7d';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText('CRASHED', W / 2, 286);
  ctx.fillStyle = '#eef4f9';
  ctx.font = `600 17px ${FONT}`;
  ctx.fillText(world.crashReason, W / 2, 326);
  ctx.font = `600 15px ${MONO}`;
  ctx.fillStyle = '#b9c6d4';
  ctx.fillText(`Score ${world.score} · rings ${world.rings.filter((x) => x.passed).length}/${world.rings.length}`, W / 2, 362);
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText('R — try again', W / 2, 414);
}

/**
 * Draw one frame. `ui` carries the screen, camera mode and best scores.
 * The 3D world always renders; screens draw over it.
 */
export function render(ctx, world, ui) {
  FOCAL = 610 - clamp((world.plane.speed - 58) / 40, 0, 1) * 64;
  const cam = makeCamera(world, ui.camera);
  drawSky(ctx, world.course.palette, cam);
  drawTerrain(ctx, world, cam);
  drawRoads(ctx, world, cam);
  drawRunway(ctx, world, cam);
  drawRings(ctx, world, cam);
  drawScenery(ctx, world, cam);
  if (ui.camera === CAM_CHASE) drawAircraft(ctx, world, ui.screen === SCREEN_PLAY || ui.screen === SCREEN_PAUSED ? 0 : 86);
  else drawCockpit(ctx, world);
  if (ui.screen === SCREEN_PLAY || ui.screen === SCREEN_PAUSED) drawHud(ctx, world, cam, ui.camera);
  if (ui.screen === SCREEN_TITLE) drawTitle(ctx, world, ui.best);
  if (ui.screen === SCREEN_RESULTS) drawResults(ctx, world, ui.best);
  if (ui.screen === SCREEN_CRASHED) drawCrashed(ctx, world);
  if (ui.screen === SCREEN_PAUSED) {
    ctx.fillStyle = 'rgba(8,12,18,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f6f9fc';
    ctx.font = `800 36px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('P — resume', W / 2, H / 2 + 36);
  }
}
