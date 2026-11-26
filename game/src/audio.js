// Skyline Run — sound from oscillators alone, no audio files: a two-stroke engine
// hum that follows the throttle, a chime for a ring threaded, a low thud for a
// crash and a soft two-note chirp for a landing. Everything is guarded so a
// browser that has not unlocked audio yet (or a screenshot with no gesture)
// simply stays silent.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function startEngine() {
    const ac = ensureContext();
    if (!ac || engineOsc) return;
    try {
      engineOsc = ac.createOscillator();
      engineOsc.type = 'sawtooth';
      engineFilter = ac.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ac.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(ac.destination);
      engineOsc.start();
    } catch {
      engineOsc = null;
    }
  }

  function tone(freq, at, dur, type, peak) {
    const ac = ensureContext();
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t0 = ac.currentTime + at;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch {
      /* silence is an acceptable sound */
    }
  }

  return {
    unlock() {
      ensureContext();
      startEngine();
    },
    /** Keep the engine note glued to the throttle while flying. */
    updateEngine(throttle, flying) {
      if (!engineOsc || !ctx) return;
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(52 + throttle * 64, t, 0.08);
      engineFilter.frequency.setTargetAtTime(240 + throttle * 520, t, 0.08);
      engineGain.gain.setTargetAtTime(flying ? 0.028 + throttle * 0.05 : 0, t, 0.12);
    },
    ring() {
      tone(1318, 0, 0.22, 'sine', 0.16);
      tone(1760, 0.07, 0.3, 'sine', 0.14);
    },
    miss() {
      tone(220, 0, 0.25, 'triangle', 0.1);
    },
    stall() {
      tone(392, 0, 0.12, 'square', 0.05);
      tone(392, 0.16, 0.12, 'square', 0.05);
    },
    crash() {
      tone(72, 0, 0.5, 'sawtooth', 0.22);
      tone(48, 0.03, 0.65, 'triangle', 0.2);
    },
    landed() {
      tone(880, 0, 0.18, 'sine', 0.12);
      tone(1174, 0.12, 0.3, 'sine', 0.12);
    },
  };
}
