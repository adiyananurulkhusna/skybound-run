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
    // Mid-course in chase view: two rings banked, the third ahead over the hills.
    world.reset(world.seed, 0);
    const p = world.plane;
    p.x = -640; p.y = 228; p.z = -2520;
    p.heading = -0.34; p.pitch = 0.02; p.roll = -0.28;
    p.speed = 57; p.throttle = 0.66; p.airborne = true; p.gear = false;
    world.started = true;
    world.rings[0].passed = true;
    world.rings[1].passed = true;
    world.nextRing = 2;
    world.score = 200;
    world.time = 62;
    flySeconds(world, 2.4, world.rings[2], 58);
    return { screen: SCREEN_PLAY, camera: CAM_CHASE };
  }
  if (name === 'cockpit') {
    // Final approach to runway 36 from the cockpit, instruments lit.
    world.reset(world.seed, 0);
    const p = world.plane;
    p.x = 20; p.y = 122; p.z = 1180;
    p.heading = 0.015; p.pitch = -0.04; p.roll = 0.03;
    p.speed = 43; p.throttle = 0.32; p.vy = -2.5; p.airborne = true; p.gear = true; p.flaps = true;
    world.started = true;
    for (const ring of world.rings) ring.passed = true;
    world.nextRing = world.rings.length;
    world.score = 600;
    world.time = 138;
    flySeconds(world, 2.2, { x: 0, y: 58, z: -320 }, 42);
    return { screen: SCREEN_PLAY, camera: CAM_COCKPIT };
  }
  if (name === 'end') {
    // A completed flight: every ring flown and a smooth touchdown banked.
    world.reset(world.seed, 0);
    const p = world.plane;
    for (const ring of world.rings) ring.passed = true;
    world.nextRing = world.rings.length;
    world.score = 600;
    world.time = 121;
    p.x = 3; p.y = 12; p.z = -60;
    p.heading = 0; p.pitch = 0; p.roll = 0;
    p.speed = 33; p.throttle = 0.12; p.vy = -1.2;
    p.airborne = false; p.gear = true; p.flaps = true;
    world.land(p);
    return { screen: SCREEN_RESULTS, camera: CAM_CHASE };
  }
  // start: the title over the dawn runway, aircraft ready at the threshold.
  world.reset(world.seed, 0);
  return { screen: SCREEN_TITLE, camera: CAM_CHASE };
}
