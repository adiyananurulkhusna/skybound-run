// The simulated world: terrain, the aircraft's flight model, the ring
// course and scoring. Pure logic with no drawing — render.js reads the
// state this file keeps, and shots.js stages scenes by stepping it.

import { COURSES, PLANE, RING, RUNWAY, SCORE, WATER_LEVEL } from './config.js';
import { makeRandom, range } from './random.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_TAKEOFF = 8;

const TAU = Math.PI * 2;

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(angle) {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

/**
 * Terrain height at a point, in metres. Rolling hills from layered sines, a
 * mountain ridge to the west, a lake basin to the east, and a flattened
 * apron around the runway so the airfield sits level.
 */
export function terrainHeight(x, z) {
  let h =
    26 +
    20 * Math.sin(x * 0.0009 + 1.7) * Math.cos(z * 0.0011) +
    13 * Math.sin(x * 0.0028) * Math.sin(z * 0.0023 + 0.6) +
    5 * Math.sin(x * 0.008 + z * 0.006);
  // Western ridge.
  const ridge = Math.max(0, 1 - Math.abs(x + 2350) / 1600);
  h += ridge * ridge * 290 * (0.7 + 0.3 * Math.sin(z * 0.0016));
  // Snowy north-west peaks, tall enough to catch the light from the valley.
  const peaks = Math.max(0, 1 - Math.hypot(x + 2700, z + 5400) / 1600);
  h += peaks * peaks * 210 * (0.82 + 0.18 * Math.sin(z * 0.0021 + x * 0.0013));
  // A winding river channel east of the field, cut below water level so it
  // renders as a bright ribbon through the farmland.
  const riverX = 980 + 520 * Math.sin(z * 0.00055 + 0.8);
  const river = Math.max(0, 1 - Math.abs(x - riverX) / 190);
  h -= river * river * 30;
  // Eastern lake basin.
  const lake = Math.max(0, 1 - Math.hypot(x - 2300, z + 3600) / 1700);
  h -= lake * lake * 46;
  // Southern hills so the return leg has something to look at.
  const south = Math.max(0, 1 - Math.abs(z - 1800) / 1400);
  h += south * south * 60;
  // Flatten near the runway (a rounded rectangle around the strip).
  const dx = Math.max(0, Math.abs(x) - RUNWAY.width * 1.6);
  const dz = Math.max(0, Math.abs(z) - RUNWAY.length * 0.62);
  const flat = Math.min(1, Math.hypot(dx, dz) / 420);
  return RUNWAY.elevation + (h - RUNWAY.elevation) * flat;
}

/** True when the point is over the runway strip itself. */
export function onRunway(x, z) {
  return Math.abs(x) <= RUNWAY.width / 2 && Math.abs(z) <= RUNWAY.length / 2;
}

/** Distance from the runway centreline, for landing scoring. */
export function centrelineOffset(x) {
  return Math.abs(x);
}

function freshPlane() {
  return {
    x: 0, y: RUNWAY.elevation, z: RUNWAY.length / 2 - 60,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, throttle: 0, vy: 0,
    airborne: false, gear: true, flaps: false, brake: false,
    stalled: false, crashed: false, landed: false,
    touchdown: null,
  };
}

export class World {
  constructor() {
    this.reset(1, 0);
  }

  reset(seed = 1, courseIndex = 0) {
    this.seed = seed;
    this.courseIndex = courseIndex;
    this.course = COURSES[courseIndex];
    this.plane = freshPlane();
    this.time = 0;
    this.started = false; // the clock starts at lift-off
    this.rings = this.course.rings.map((ring) => ({ ...ring, passed: false }));
    this.nextRing = 0;
    this.score = 0;
    this.ringScore = 0;
    this.finished = false;
    this.crashReason = '';
    this.landingReport = null;
    this.popup = null; // { text, sub, at } score feedback the HUD floats up
    this.gust = 0;
    // Scenery the renderer draws: clouds, trees and town blocks, seeded.
    const random = makeRandom(seed * 7919 + courseIndex * 131);
    this.clouds = [];
    for (let i = 0; i < 42; i += 1) {
      this.clouds.push({
        x: range(random, -5200, 5200), y: range(random, 420, 760), z: range(random, -7200, 2400),
        r: range(random, 120, 340), drift: range(random, 1, 3),
      });
    }
    this.trees = [];
    for (let i = 0; i < 560; i += 1) {
      // Clustered woods: pick a grove centre, then scatter trees around it.
      const gx = range(random, -4200, 4200);
      const gz = range(random, -6800, 2000);
      const x = gx + range(random, -140, 140);
      const z = gz + range(random, -140, 140);
      if (onRunway(x, z) || Math.abs(x) < 180 && Math.abs(z) < 720) continue;
      const y = terrainHeight(x, z);
      if (y < WATER_LEVEL + 1) continue;
      this.trees.push({ x, y, z, s: range(random, 9, 21), pine: random() > 0.45 });
    }
    this.blocks = [];
    for (let i = 0; i < 46; i += 1) {
      const x = 520 + range(random, -260, 260);
      const z = 420 + range(random, -320, 320);
      this.blocks.push({ x, y: terrainHeight(x, z), z, w: range(random, 16, 34), h: range(random, 10, 38) });
    }
    // Villages and farmhouses: small homes with pitched roofs, clustered
    // near the town and scattered over the farmland.
    this.houses = [];
    const houseSpots = [
      [760, 180], [820, 260], [700, 320], [880, 120], [-520, -900], [-460, -1020],
      [-620, -820], [420, -1500], [520, -1420], [1180, -1900], [1260, -2020],
      [-980, -2400], [-900, -2520], [300, 900], [420, 980], [-700, 500], [-780, 620],
    ];
    for (const [hx, hz] of houseSpots) {
      const x = hx + range(random, -30, 30);
      const z = hz + range(random, -30, 30);
      const y = terrainHeight(x, z);
      if (y < WATER_LEVEL + 1) continue;
      this.houses.push({ x, y, z, w: range(random, 12, 20), h: range(random, 7, 12), tone: random() });
    }
    // Roads the renderer drapes over the terrain: airfield to town, then
    // north past the farms toward the river bridge.
    this.roads = [
      [[60, 300], [300, 330], [520, 360], [760, 300], [980, 180], [1150, -120], [1180, -700], [1120, -1300], [1150, -1900], [1300, -2400]],
      [[-80, -200], [-420, -600], [-520, -950], [-700, -1500], [-950, -2400], [-1250, -3200]],
    ];
    // Landmarks: wind turbines on the western ridge, a lighthouse on the
    // lake shore, sailboats on the water and one hot-air balloon drifting
    // over the valley. All placed on real terrain heights.
    this.turbines = [];
    for (let i = 0; i < 6; i += 1) {
      const x = -2350 + range(random, -180, 180);
      const z = -4200 + i * 620 + range(random, -120, 120);
      this.turbines.push({ x, y: terrainHeight(x, z), z, phase: range(random, 0, 6.28) });
    }
    this.lighthouse = { x: 1520, z: -2680, y: terrainHeight(1520, -2680) };
    this.boats = [];
    for (let i = 0; i < 4; i += 1) {
      this.boats.push({ x: 2100 + range(random, -420, 420), z: -3500 + range(random, -420, 420), phase: range(random, 0, 6.28) });
    }
    this.balloon = { x: -620, y: 330, z: -2600 };
    return this;
  }

  /** The ring the pilot should fly to next, or null when the course is done. */
  targetRing() {
    return this.nextRing < this.rings.length ? this.rings[this.nextRing] : null;
  }

  /** Wind at this moment: the course wind plus a slow gust. */
  windNow() {
    const gust = Math.sin(this.time * 0.37 + this.seed) * 1.6;
    return { x: this.course.wind.x + gust, z: this.course.wind.z + gust * 0.4 };
  }

  /**
   * Advance the flight by one fixed step. `input` carries pitch, roll and
   * rudder in [-1, 1], a throttle delta, and toggles already applied.
   * Returns a bitmask of EVENT_* flags.
   */
  step(dt, input) {
    const p = this.plane;
    if (p.crashed || this.finished) return 0;
    let events = 0;
    this.time += dt;

    p.throttle = Math.min(1, Math.max(0, p.throttle + input.throttle * dt * 0.55));
    p.gear = input.gear;
    p.flaps = input.flaps;
    p.brake = input.brake;

    // Attitude follows the stick, with gentle self-levelling.
    p.pitch += input.pitch * PLANE.pitchRate * dt;
    p.pitch += -p.pitch * 0.35 * dt;
    p.pitch = Math.min(PLANE.maxPitch, Math.max(-PLANE.maxPitch, p.pitch));
    p.roll += input.roll * PLANE.rollRate * dt;
    p.roll += -p.roll * 1.1 * dt;
    p.roll = Math.min(PLANE.maxRoll, Math.max(-PLANE.maxRoll, p.roll));

    const stallLimit = PLANE.stallSpeed - (p.flaps ? PLANE.flapLift : 0);
    p.stalled = p.airborne && p.speed < stallLimit;

    // Speed chases the throttle's target, bleeding off in climbs and turns.
    let target = PLANE.minSpeed + p.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
    if (p.gear) target *= PLANE.gearDrag;
    if (p.flaps) target *= 0.94;
    const accel = p.airborne ? 0.35 : 0.9;
    p.speed += (target - p.speed) * Math.min(1, accel * dt * 2.2);
    p.speed -= Math.sin(p.pitch) * 9 * dt;
    p.speed -= Math.abs(p.roll) * 2.4 * dt;
    if (p.brake) p.speed -= (p.airborne ? 6 : 16) * dt;
    p.speed = Math.min(PLANE.maxSpeed + 12, Math.max(0, p.speed));

    // Heading turns with bank, plus a touch of rudder.
    const turnRate = p.roll * PLANE.turnFactor * Math.min(1, p.speed / 40) + input.rudder * 0.12;
    p.heading = wrapAngle(p.heading + turnRate * dt);

    const wind = this.windNow();
    const groundY = terrainHeight(p.x, p.z);

    if (!p.airborne) {
      // Ground roll: steer with rudder, lift off past rotate speed.
      p.heading = wrapAngle(p.heading + input.rudder * 0.5 * dt * Math.min(1, p.speed / 18));
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += -Math.cos(p.heading) * p.speed * dt;
      p.y = groundY;
      p.vy = 0;
      if (p.speed >= PLANE.rotateSpeed && p.pitch > 0.06) {
        p.airborne = true;
        p.y = groundY + 1.6; // clear the strip so the contact check does not re-trigger
        this.started = true;
        events |= EVENT_TAKEOFF;
      } else if (!onRunway(p.x, p.z) && p.speed > 12) {
        return this.crash('Ran off the runway');
      }
      return events;
    }

    // Airborne: climb from pitch and speed, sink when stalled.
    let vy = p.speed * Math.sin(p.pitch) * 0.72;
    if (p.stalled) {
      vy -= PLANE.sinkWhenStalled;
      p.pitch -= 0.5 * dt; // the nose drops on its own
    }
    vy -= Math.abs(p.roll) * 1.8;
    p.vy = vy;

    const prev = { x: p.x, y: p.y, z: p.z };
    p.x += (Math.sin(p.heading) * p.speed * Math.cos(p.pitch) + wind.x) * dt;
    p.z += (-Math.cos(p.heading) * p.speed * Math.cos(p.pitch) + wind.z) * dt;
    p.y += vy * dt;

    // Ring pass: the segment prev->now crosses the ring's plane inside it.
    const ring = this.targetRing();
    if (ring) {
      const dist = this.ringDistance(prev, p, ring);
      if (dist <= RING.radius) {
        ring.passed = true;
        this.nextRing += 1;
        const perfect = dist <= RING.radius * 0.4;
        const points = SCORE.ring + (perfect ? SCORE.perfectRing : 0);
        this.score += points;
        this.ringScore += points;
        this.popup = { text: `+${points}`, sub: perfect ? 'PERFECT' : `RING ${this.nextRing}`, at: this.time };
        events |= EVENT_RING;
      }
    }

    // Ground contact: only when settling onto the surface, never while
    // climbing away from it (the first airborne steps sit just above it).
    const floor = terrainHeight(p.x, p.z);
    if (p.y <= floor + 0.6 && p.vy <= 1.2) {
      p.y = floor;
      if (onRunway(p.x, p.z) && p.gear && this.nextRing >= this.rings.length) {
        return events | this.land(p);
      }
      if (onRunway(p.x, p.z) && p.gear && p.vy > -6 && p.speed < 46) {
        // A touch-and-go before the course is done: roll and climb away.
        p.airborne = false;
        p.pitch = 0;
        p.roll = 0;
        return events;
      }
      if (p.vy <= -6) return this.crash('Hit the ground too hard');
      if (!p.gear) return this.crash('Belly landing — gear was up');
      return this.crash('Came down off the runway');
    }
    if (p.y > 1400) p.y = 1400;
    return events;
  }

  /** Closest approach of the flight segment to the ring centre, in metres. */
  ringDistance(prev, now, ring) {
    const dx = now.x - prev.x, dy = now.y - prev.y, dz = now.z - prev.z;
    const len2 = dx * dx + dy * dy + dz * dz || 1;
    let t = ((ring.x - prev.x) * dx + (ring.y - prev.y) * dy + (ring.z - prev.z) * dz) / len2;
    t = Math.min(1, Math.max(0, t));
    const cx = prev.x + dx * t, cy = prev.y + dy * t, cz = prev.z + dz * t;
    return Math.hypot(ring.x - cx, ring.y - cy, ring.z - cz);
  }

  land(p) {
    const sink = Math.abs(p.vy);
    const offset = centrelineOffset(p.x);
    const speedPenalty = Math.max(0, p.speed - 34) * 4;
    const sinkPenalty = Math.max(0, sink - 1.5) * 26;
    const offsetPenalty = offset * 2.2;
    const timeBonus = Math.max(0, Math.round((this.course.par - this.time) * SCORE.timeBonusPerSecond));
    const perfect = sink < 1.6 && offset < 6 && p.speed < 36;
    const landingScore = Math.max(40, Math.round(SCORE.landingBase - sinkPenalty - offsetPenalty - speedPenalty)) + (perfect ? SCORE.perfectBonus : 0);
    this.landingReport = { sink, offset, speed: p.speed, landingScore, timeBonus, perfect };
    this.score += landingScore + timeBonus;
    p.landed = true;
    p.airborne = false;
    this.finished = true;
    return EVENT_LANDED;
  }

  crash(reason) {
    this.plane.crashed = true;
    this.crashReason = reason;
    this.finished = true;
    return EVENT_CRASHED;
  }

  /** Letter grade for the results screen. */
  grade() {
    const max = this.rings.length * (SCORE.ring + SCORE.perfectRing) + SCORE.landingBase + SCORE.perfectBonus + this.course.par * SCORE.timeBonusPerSecond;
    const ratio = this.score / max;
    if (ratio >= 0.82) return 'S';
    if (ratio >= 0.66) return 'A';
    if (ratio >= 0.5) return 'B';
    if (ratio >= 0.34) return 'C';
    return 'D';
  }
}
