// Skybound Run — every tuning number, course and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size. World units are
// metres: x runs east, z runs south, y is altitude above sea level.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The home airfield: a north-south runway centred on the origin. */
export const RUNWAY = {
  length: 900,
  width: 46,
  elevation: 12,
  heading: 0, // radians; 0 faces north (-z), the landing direction for runway 36
};

export const PLANE = {
  minSpeed: 16, // m/s, below this the wing gives up
  stallSpeed: 24,
  cruiseSpeed: 56,
  maxSpeed: 92,
  rotateSpeed: 31, // lift-off speed on the runway
  gearDrag: 0.92,
  flapLift: 6, // m/s of stall margin the flaps buy
  pitchRate: 0.85, // rad/s at full stick
  rollRate: 2.1,
  maxPitch: 0.62,
  maxRoll: 1.15,
  turnFactor: 0.62, // heading rate per radian of bank
  sinkWhenStalled: 9,
};

export const SCORE = {
  ring: 100,
  perfectRing: 50, // bonus for threading the middle of a ring
  landingBase: 300,
  perfectBonus: 150,
  timeBonusPerSecond: 4,
};

/** Water sits at this altitude; terrain below it renders as lake. */
export const WATER_LEVEL = 4;

/**
 * The three courses. Rings are flown in order; each ring faces the course
 * direction. `par` is the seconds a good run takes, for the time bonus.
 * Palettes carry the time of day the screenshots show.
 */
export const COURSES = [
  {
    id: 'dawn-valley',
    name: 'Dawn Valley',
    par: 150,
    wind: { x: 0, z: 0 },
    rings: [
      { x: 0, y: 150, z: -1400 },
      { x: -420, y: 190, z: -2300 },
      { x: -900, y: 240, z: -3200 },
      { x: -700, y: 200, z: -4300 },
      { x: 150, y: 170, z: -5100 },
      { x: 500, y: 150, z: -4000 },
    ],
    palette: {
      skyTop: '#2e4a7a', skyMid: '#7fa8c9', skyLow: '#f6c177', sun: '#ffd9a0',
      fog: '#c8b299', grass: '#5d8a4c', grassHigh: '#7d9b57', rock: '#8a7a68',
      water: '#3d6e8f', panel: '#1c2431', accent: '#ffb454',
      fogScale: 0.72, mist: 0.55, lights: 0.35, // thin morning mist, lamps just waking
    },
  },
  {
    id: 'coastal-noon',
    name: 'Coastal Noon',
    par: 190,
    wind: { x: 3.5, z: 1.2 },
    rings: [
      { x: 0, y: 160, z: -1500 },
      { x: 650, y: 210, z: -2400 },
      { x: 1400, y: 260, z: -3100 },
      { x: 1900, y: 220, z: -4200 },
      { x: 1500, y: 300, z: -5400 },
      { x: 600, y: 240, z: -5800 },
      { x: -350, y: 190, z: -4900 },
      { x: -250, y: 160, z: -3300 },
    ],
    palette: {
      skyTop: '#2f6fb4', skyMid: '#79b5dd', skyLow: '#dceef7', sun: '#fff3c4',
      fog: '#bcd6e4', grass: '#4f9455', grassHigh: '#86b364', rock: '#97907f',
      water: '#2f7fa8', panel: '#16222e', accent: '#ffd166',
      fogScale: 1, mist: 0, lights: 0.08, // clear midday air
    },
  },
  {
    id: 'dusk-canyon',
    name: 'Dusk Canyon',
    par: 230,
    wind: { x: -5, z: 2.5 },
    rings: [
      { x: 0, y: 150, z: -1400 },
      { x: -600, y: 230, z: -2200 },
      { x: -1300, y: 320, z: -3000 },
      { x: -1700, y: 260, z: -4200 },
      { x: -1200, y: 380, z: -5400 },
      { x: -200, y: 300, z: -6200 },
      { x: 800, y: 360, z: -5600 },
      { x: 1300, y: 250, z: -4300 },
      { x: 900, y: 200, z: -3000 },
      { x: 350, y: 160, z: -1900 },
    ],
    palette: {
      skyTop: '#3b3561', skyMid: '#8a5a7d', skyLow: '#f0915c', sun: '#ffb37a',
      fog: '#a97e72', grass: '#5c7a45', grassHigh: '#8a8a52', rock: '#9c6b52',
      water: '#4a5f83', panel: '#201a2e', accent: '#ff9e5e',
      fogScale: 0.9, mist: 0.18, lights: 1, // dusk: village and airfield lights on
    },
  },
];

export const RING = { radius: 34, tube: 2.6 };

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = 'ui-monospace, "SF Mono", Consolas, monospace';

/** Where best scores are kept between visits (this browser only). */
export const BEST_KEY = 'skybound-run.best';
