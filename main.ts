// Skybound Run — a best-flight-game entry (Node 22, standard library only).
//
// The game lives in this directory's game/ folder: plain static files a
// desktop browser loads offline (game/index.html plus its ES modules, no
// library and no network request). It is an original flight game: take off
// from runway 36, fly a course of target rings over hills, a lake and a
// mountain ridge in chase or cockpit view, then land back on the strip for
// a graded score. Three courses (dawn, noon, dusk), a full HUD with
// altitude, speed and heading, and WebAudio sound.
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

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
