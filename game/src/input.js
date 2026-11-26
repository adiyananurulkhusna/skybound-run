// Keyboard and mouse input. The stick follows flight-sim convention: pull
// back (ArrowDown, or mouse below centre) to climb, push forward to descend.
// Mouse steering arms on the first click so the title screen stays calm.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, active: false };
    this.gear = true;
    this.flaps = false;
    this.pressed = new Set(); // one-shot keys read by the shell each frame

    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
      if (!event.repeat) this.pressed.add(key);
      this.keys.add(key);
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    });
    canvas.addEventListener('pointerdown', () => {
      this.mouse.active = true;
    });
  }

  /** True once for a key pressed since the last frame; the shell clears it. */
  takePress(key) {
    const hit = this.pressed.has(key);
    if (hit) this.pressed.delete(key);
    return hit;
  }

  clearPresses() {
    this.pressed.clear();
  }

  /** The stick for this step: pitch/roll/rudder in [-1, 1], throttle delta, toggles. */
  read() {
    const k = this.keys;
    let pitch = 0;
    let roll = 0;
    let rudder = 0;
    let throttle = 0;
    if (k.has('arrowdown')) pitch += 1; // pull back: climb
    if (k.has('arrowup')) pitch -= 1;
    if (k.has('arrowright')) roll += 1;
    if (k.has('arrowleft')) roll -= 1;
    if (k.has('d')) rudder += 1;
    if (k.has('a')) rudder -= 1;
    if (k.has('w') || k.has('shift')) throttle += 1;
    if (k.has('s') || k.has('control')) throttle -= 1;
    if (this.mouse.active && pitch === 0 && roll === 0) {
      roll = clamp(this.mouse.x * 1.6, -1, 1);
      pitch = clamp(this.mouse.y * 1.6, -1, 1); // mouse below centre pulls back
    }
    return {
      pitch, roll, rudder, throttle,
      gear: this.gear,
      flaps: this.flaps,
      brake: k.has(' ') || k.has('b'),
    };
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
