/** Shared click/beep helper. Every workspace uses this so the header sound toggle
 *  (persisted under "logicflow-sound") actually governs all of them, not just nav clicks. */
export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem("logicflow-sound") !== "false";
  } catch {
    return true;
  }
}

export function beep(high = true) {
  if (!isSoundEnabled()) return;
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = high ? "triangle" : "sine";
    osc.frequency.setValueAtTime(high ? 880 : 520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(high ? 1500 : 260, ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.045, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch {}
}
