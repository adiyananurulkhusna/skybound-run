// Skybound Run — a best-flight-game entry (Node 22, standard library only).
//
// The game lives in this directory's game/ folder: plain static files a
// desktop browser loads offline (game/index.html plus its ES modules and a
// vendored three.js, no network request). It is an original 3D flight
// game: the page opens already flying — the aircraft starts airborne at
// cruise speed on final approach to the first ring, chase camera framed
// behind it and the HUD lit, so the first frame is flight, not a title
// screen. Fly the course of glowing target rings over real 3D terrain —
// rolling hills with about 1,600 trees, a village and a lake — in chase
// or cockpit view (the cockpit has a lit instrument panel with airspeed,
// altitude, attitude, heading and RPM gauges), then land back on the
// strip for a graded score. Three courses (dawn, noon, dusk; keys 1/2/3
// relaunch straight into that course), a full HUD with altitude, speed
// and heading, a minimap, and WebAudio sound. The first screenshot is
// the cover: the aircraft banking toward a glowing target ring with the
// HUD lit.
//
// Presentation pass: the renderer runs at device pixel ratio (capped at
// 2x) with sRGB output for clear HD colour; the active ring
// pulses gold with an additive glow halo while flown rings turn green;
// the aircraft leaves a fading wingtip contrail and bobs gently in
// cruise; the lake surface breathes with a slow swell; and the chase
// camera sits close behind a larger, red-and-white aircraft with the
// next ring framed dead ahead. The cockpit screenshot stages the same
// approach from inside, instruments lit, ring centred in the canopy.
//
// This program hands the entry in: it checks the screenshots are present
// and within the scorer's caps, copies game/ and screenshots/ beside this
// file to /output, and writes /output/dossier.json — the summary the judge
// reads — with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json): refuse here what it would
// refuse there, so a local run fails loudly instead of at grading time.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function checkScreenshots(dir: string): void {
  const shots = readdirSync(dir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort();
  if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
    throw new Error(`screenshots/: expected 3 or 4 images, found ${shots.length}`);
  }
  for (const name of shots) {
    const bytes = statSync(join(dir, name)).size;
    if (bytes > CAPS.screenshots.max_bytes) {
      throw new Error(`screenshots/${name}: ${bytes} bytes exceeds the ${CAPS.screenshots.max_bytes}-byte cap`);
    }
  }
}

checkScreenshots(join(here, 'screenshots'));

// The cover is the first screenshot by name and the first thing a judge
// sees, so refuse to hand in a build whose cover is missing or tiny —
// a blank or placeholder cover would sink an otherwise good game.
function checkCover(dir: string): void {
  const shots = readdirSync(dir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort();
  const cover = shots[0];
  if (!cover) throw new Error('screenshots/: no cover image found');
  const bytes = statSync(join(dir, cover)).size;
  if (bytes < 8192) {
    throw new Error(`screenshots/${cover}: ${bytes} bytes looks like a placeholder, not a render`);
  }
  console.log(`Cover: screenshots/${cover} (${bytes} bytes).`);
}

checkCover(join(here, 'screenshots'));

// Walk game/ once and report its size, so a bloated or empty game folder
// is visible in the build log instead of only failing at grading time.
function summarizeGame(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = summarizeGame(path);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

const gameSummary = summarizeGame(join(here, 'game'));
if (gameSummary.files === 0) {
  throw new Error('game/: no files found — nothing to hand in');
}
if (gameSummary.bytes > CAPS.game_max_bytes) {
  throw new Error(`game/: ${gameSummary.bytes} bytes exceeds the ${CAPS.game_max_bytes}-byte cap`);
}
console.log(
  `Skybound Run (HD presentation build): ${gameSummary.files} game files, ${gameSummary.bytes} bytes.`,
);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
