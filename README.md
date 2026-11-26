# skybound-run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/adiyananurulkhusna/skybound-run/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/adiyananurulkhusna/skybound-run/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Skybound Run is an original 3D flight game for the desktop browser: take off from runway 36, fly a course of glowing target rings over a sun-lit 3D landscape of rolling hills, pine forests, farmland patchwork, a village and a lake, then land back on the strip for a graded score. Real-time WebGL rendering with soft shadows, atmospheric fog, drifting clouds and a detailed propeller plane with spinning prop and navigation lights. Chase and cockpit views — the cockpit shows a lit instrument panel (airspeed, altimeter, attitude indicator, heading, RPM) — plus a HUD with altitude, speed, heading, ring progress, a minimap and score popups with a PERFECT bonus for threading the middle of a ring. Three courses at dawn, noon and dusk with crosswinds. Built with Three.js vendored locally — no network requests, plays offline from its own files; sound is synthesised with WebAudio.

## Features

- Three courses: Dawn Valley (6 rings, calm), Coastal Noon (8 rings, crosswind), Dusk Canyon (10 rings, gusty)
- True 3D world: heightfield terrain with altitude colours, water, 1,600 instanced pine trees, village houses, hangars and a control tower
- Chase and cockpit cameras; lit cockpit gauges with moving needles and an attitude indicator
- HUD: heading, speed and altitude tapes, ring distance, minimap with live plane and ring markers
- Scoring: 100 per ring, +50 PERFECT bonus through the centre, graded landing (S/A/B) for a smooth touchdown on runway 36
- Stall behaviour, flaps, gear, brakes, mouse steering after a click
- Synthesised engine and ring sounds (WebAudio)

## Controls

| Key | Action |
| --- | --- |
| W / S | Throttle up / down |
| Down / Up | Pitch up / down |
| Left / Right | Roll |
| A / D | Rudder |
| Mouse | Steer after a click |
| F | Flaps |
| G | Gear |
| Space | Brake |
| C | Camera (chase / cockpit) |
| P | Pause |
| M | Mute |
| R | Restart |
| 1–3, Enter | Choose course, start |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080/game/ in a desktop browser. Controls: W/S throttle, Down/Up pitch, Left/Right roll, A/D rudder, mouse steers after a click, F flaps, G gear, Space brake, C camera, P pause, M mute, R restart.

---

<sub>Entered on [make.fun](https://make.fun/?ref=0sc1f0wn&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
