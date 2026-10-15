let ctx;
function audio() {
    try {
        ctx ??= new AudioContext();
        return ctx;
    }
    catch {
        return undefined;
    }
}
export function playSound(cue, enabled = true) {
    if (!enabled)
        return;
    const c = audio();
    if (!c)
        return;
    const now = c.currentTime, osc = c.createOscillator(), gain = c.createGain();
    const cfg = { draw: [420, .035, .05], discard: [240, .055, .07], chow: [520, .07, .08], pong: [410, .09, .1], kong: [330, .13, .11], win: [660, .32, .12], button: [560, .025, .035] };
    const [freq, dur, vol] = cfg[cue];
    osc.frequency.setValueAtTime(freq, now);
    osc.type = cue === 'win' ? 'sine' : 'triangle';
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + dur);
    if (cue === 'win') {
        const o2 = c.createOscillator(), g2 = c.createGain();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(880, now + .12);
        g2.gain.setValueAtTime(.001, now);
        g2.gain.linearRampToValueAtTime(.08, now + .12);
        g2.gain.exponentialRampToValueAtTime(.001, now + .34);
        o2.connect(g2).connect(c.destination);
        o2.start(now + .1);
        o2.stop(now + .35);
    }
}
//# sourceMappingURL=sound.js.map