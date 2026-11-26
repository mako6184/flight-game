// Skyline Run — keyboard and mouse input. The keyboard is a held-key state the
// engine samples each frame; the mouse acts as a stick while it is held down
// (offset from the canvas centre pitches and banks) and its wheel trims throttle.

export function createInput(canvas) {
  const keys = new Set();
  const stick = { active: false, pitch: 0, roll: 0 };
  let wheelDelta = 0;
  const pressed = new Set();

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (event) => {
    stick.active = true;
    updateStick(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (stick.active) updateStick(event);
  });
  const release = () => {
    stick.active = false;
    stick.pitch = 0;
    stick.roll = 0;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    wheelDelta += event.deltaY < 0 ? 0.06 : -0.06;
  }, { passive: false });

  function updateStick(event) {
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    stick.roll = clamp(nx * 2.4, -1, 1);
    stick.pitch = clamp(ny * 2.2, -1, 1);
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  return {
    /** Sample the controls for one step: pitch/roll in -1..1, throttleDelta in -1..1. */
    sample() {
      let pitch = 0;
      let roll = 0;
      let throttleDelta = 0;
      // Stick-style pitch: push (up/W) to dive, pull (down/S) to climb.
      if (keys.has('ArrowUp') || keys.has('KeyW')) pitch -= 1;
      if (keys.has('ArrowDown') || keys.has('KeyS')) pitch += 1;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) throttleDelta += 1;
      if (keys.has('ControlLeft') || keys.has('ControlRight')) throttleDelta -= 1;
      if (stick.active) {
        pitch = stick.pitch;
        roll = stick.roll;
      }
      if (wheelDelta !== 0) {
        throttleDelta += Math.sign(wheelDelta);
        wheelDelta = 0;
      }
      return { pitch, roll, throttleDelta };
    },
    /** True once for each fresh key press since the last call. */
    wasPressed(code) {
      const hit = pressed.has(code);
      pressed.delete(code);
      return hit;
    },
    anyPressed() {
      const hit = pressed.size > 0;
      pressed.clear();
      return hit;
    },
  };
}
