// The screenshot scenes behind ?shot=start|play|cockpit|end. Each one puts
// the aircraft into a real flight situation and steps the true simulation
// forward under a small autopilot, so the frame is what playing the game
// really looks like — and the same seed always gives the same frame.

import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_RESULTS, SCREEN_TITLE, CAM_CHASE, CAM_COCKPIT } from './render.js';
import { wrapAngle } from './world.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Steer toward a point: bank into the turn, pitch for a gentle climb/descent, hold speed. */
function autopilot(world, target, targetSpeed) {
  const p = world.plane;
  const want = Math.atan2(target.x - p.x, -(target.z - p.z));
  const err = wrapAngle(want - p.heading);
  const roll = clamp(err * 1.6 - p.roll * 0.4, -1, 1);
  const desiredVy = clamp((target.y - p.y) * 0.08, -4, 4);
  const pitch = clamp((desiredVy - p.vy) * 0.09, -1, 1);
  const throttle = clamp((targetSpeed - p.speed) * 0.04, -1, 1);
  return { pitch, roll, rudder: 0, throttle, gear: p.gear, flaps: p.flaps, brake: false };
}

function flySeconds(world, seconds, target, targetSpeed) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, autopilot(world, target, targetSpeed));
    if (world.finished) break;
  }
}

/**
 * Set `world` to the named scene and return the screen and camera to draw.
 * Any unknown name stages the title scene.
 */
export function stageShot(name, world) {
  if (name === 'play') {
    // Dawn Valley: banking hard toward ring 2 with the village below the
    // left wing, the river shining to the east and mist in the valley.
    world.reset(world.seed, 0);
    const p = world.plane;
    p.x = -275; p.y = 205; p.z = -1980;
    p.heading = -0.34; p.pitch = 0.03; p.roll = -0.72;
    p.speed = 64; p.throttle = 0.8; p.airborne = true; p.gear = false;
    world.started = true;
    world.rings[0].passed = true;
    world.nextRing = 1;
    world.score = 150;
    world.ringScore = 150;
    world.time = 46;
    world.popup = { text: '+150', sub: 'PERFECT', at: 45.55 };
    flySeconds(world, 0.5, world.rings[1], 64);
    return { screen: SCREEN_PLAY, camera: CAM_CHASE };
  }
  if (name === 'cockpit') {
    // Dusk Canyon final approach: lit panel, runway lights ahead and the
    // village lamps coming on below.
    world.reset(world.seed, 2);
    const p = world.plane;
    p.x = 10; p.y = 66; p.z = 640;
    p.heading = 0.008; p.pitch = -0.03; p.roll = 0.015;
    p.speed = 41; p.throttle = 0.28; p.vy = -2.0; p.airborne = true; p.gear = true; p.flaps = true;
    world.started = true;
    for (const ring of world.rings) ring.passed = true;
    world.nextRing = world.rings.length;
    world.score = 1400;
    world.ringScore = 1400;
    world.time = 196;
    flySeconds(world, 1.2, { x: 0, y: 40, z: -320 }, 40);
    return { screen: SCREEN_PLAY, camera: CAM_COCKPIT };
  }
  if (name === 'end') {
    // A completed flight: every ring flown clean and a smooth touchdown
    // banked fast enough for the top grade.
    world.reset(world.seed, 0);
    const p = world.plane;
    for (const ring of world.rings) ring.passed = true;
    world.nextRing = world.rings.length;
    world.score = 900;
    world.ringScore = 900;
    world.time = 80;
    p.x = 3; p.y = 12; p.z = -60;
    p.heading = 0; p.pitch = 0; p.roll = 0;
    p.speed = 33; p.throttle = 0.12; p.vy = -1.2;
    p.airborne = false; p.gear = true; p.flaps = true;
    world.land(p);
    // Let the tyre smoke billow and thin for half a second of effect time.
    for (let i = 0; i < 30; i += 1) world.updateParticles(STEP);
    return { screen: SCREEN_RESULTS, camera: CAM_CHASE };
  }
  // start: the title over the dusk runway, aircraft ready at the threshold.
  world.reset(world.seed, 2);
  return { screen: SCREEN_TITLE, camera: CAM_CHASE };
}
