// Skybound Run shell: the fixed-step loop, the screen state machine, best
// scores and the ?shot= scenes the screenshots are taken from. The world
// simulates, render.js draws, input.js reads the stick, audio.js hums.

import { BEST_KEY, COURSES, STEP } from './config.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import {
  CAM_CHASE, CAM_COCKPIT, SCREEN_CRASHED, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_RESULTS, SCREEN_TITLE, render,
} from './render.js';
import { stageShot } from './shots.js';
import { EVENT_CRASHED, EVENT_LANDED, EVENT_RING, World } from './world.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
// The canvas backing store is 1920x1080 while the game draws in a 1280x720
// logical space, so every frame renders at 1.5x for a sharp, HD picture.
const RENDER_SCALE = 1.5;

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 1;
const shotName = params.get('shot');

const world = new World();
world.reset(seed, 0);
const input = new Input(canvas);
const sound = new Sound();

let screen = SCREEN_TITLE;
let camera = CAM_CHASE;
let courseIndex = 0;
let best = loadBest();
let accumulator = 0;
let last = performance.now();

if (shotName) {
  const staged = stageShot(shotName, world);
  screen = staged.screen;
  camera = staged.camera;
}

function loadBest() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
    return COURSES.map((_, i) => Number(parsed[i]) || 0);
  } catch {
    return COURSES.map(() => 0);
  }
}

function saveBest() {
  if (world.score > (best[courseIndex] || 0)) {
    best[courseIndex] = world.score;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* private mode */ }
  }
}

function startFlight() {
  world.reset(seed, courseIndex);
  input.gear = true;
  input.flaps = false;
  screen = SCREEN_PLAY;
  sound.unlock();
  sound.click();
  announce(`Course ${world.course.name}. Throttle up with W, pull back to lift off.`);
}

function announce(text) {
  if (status) status.textContent = text;
}

function handleKeys() {
  if (input.takePress('m')) sound.muted = !sound.muted;
  if (screen === SCREEN_TITLE) {
    for (let i = 0; i < COURSES.length; i += 1) {
      if (input.takePress(String(i + 1))) {
        courseIndex = i;
        world.reset(seed, courseIndex);
        sound.unlock();
        sound.click();
      }
    }
    if (input.takePress('enter')) startFlight();
    return;
  }
  if (screen === SCREEN_PLAY) {
    if (input.takePress('p') || input.takePress('escape')) screen = SCREEN_PAUSED;
    if (input.takePress('c')) camera = camera === CAM_CHASE ? CAM_COCKPIT : CAM_CHASE;
    if (input.takePress('g')) input.gear = !input.gear;
    if (input.takePress('f')) input.flaps = !input.flaps;
    if (input.takePress('r')) startFlight();
    return;
  }
  if (screen === SCREEN_PAUSED) {
    if (input.takePress('p') || input.takePress('escape') || input.takePress('enter')) screen = SCREEN_PLAY;
    if (input.takePress('r')) startFlight();
    return;
  }
  if (screen === SCREEN_RESULTS) {
    if (input.takePress('r')) startFlight();
    if (input.takePress('enter')) {
      courseIndex = (courseIndex + 1) % COURSES.length;
      startFlight();
    }
    return;
  }
  if (screen === SCREEN_CRASHED && input.takePress('r')) startFlight();
}

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;

  handleKeys();
  input.clearPresses();

  if (!shotName && screen === SCREEN_PLAY) {
    accumulator += elapsed;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      const events = world.step(STEP, input.read());
      if (events & EVENT_RING) {
        sound.ring();
        announce(`Ring ${world.nextRing} of ${world.rings.length}. Score ${world.score}.`);
      }
      if (events & EVENT_LANDED) {
        sound.touchdown();
        saveBest();
        screen = SCREEN_RESULTS;
        announce(`Landed. Final score ${world.score}, grade ${world.grade()}.`);
      }
      if (events & EVENT_CRASHED) {
        sound.crash();
        saveBest();
        screen = SCREEN_CRASHED;
        announce(`Crashed: ${world.crashReason}`);
      }
    }
  }

  sound.update(world.plane, screen === SCREEN_PLAY);
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  render(ctx, world, { screen, camera, best });
}

requestAnimationFrame(frame);
