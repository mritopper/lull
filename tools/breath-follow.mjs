// Emulator-only demo helper: moves both emulated hands like a person following
// the breathing guide (slight lag, imperfect amplitude). Runs in-page, returns at once.
export default async function run({ frame }) {
  return await frame.evaluate(() => {
    const dev = window.IWER_DEVICE;
    const l = window.lull;
    if (!dev || !l) return 'missing device or app';
    clearInterval(window.__lullBreath);
    let base = null;
    const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
    const guide = (t) => {
      if (t < 0) return 0;
      const c = t % 10;
      return c < 4 ? ease(c / 4) : 1 - ease((c - 4) / 6);
    };
    const setP = (h, x, y, z) => {
      const p = h.position;
      if (typeof p.set === 'function') p.set(x, y, z); else { p.x = x; p.y = y; p.z = z; }
    };
    window.__lullBreath = setInterval(() => {
      const L = dev.hands.left, R = dev.hands.right;
      if (!L || !R) return;
      if (l.phase !== 'breathe') { base = null; return; }
      if (!base) {
        // Let go of any anchor pin left by earlier scripted steps.
        L.setPin?.(null); R.setPin?.(null);
        // Hold the hands where the lantern waits, in front of the chest.
        const lp = l.lantern.position;
        base = { cx: lp.x, y: lp.y - 0.03, z: lp.z + 0.03 };
      }
      const t = l.breathT - 0.35; // human reaction lag
      const g = guide(t) * (0.9 + 0.08 * Math.sin(t * 0.7));
      const half = 0.05 + g * 0.17;
      const sway = Math.sin(t * 0.9) * 0.006;
      // Ease in from wherever the hands were, then track the target.
      const k = 0.06;
      setP(L, L.position.x + (base.cx - half - L.position.x) * k, L.position.y + (base.y + sway - L.position.y) * k, L.position.z + (base.z - L.position.z) * k);
      setP(R, R.position.x + (base.cx + half - R.position.x) * k, R.position.y + (base.y - sway - R.position.y) * k, R.position.z + (base.z - R.position.z) * k);
    }, 16);
    return 'following';
  });
}
