(function (root) {
  const NLC = (root.NLC = root.NLC || {});
  let audioCtx = null;

  function ensureCtx() {
    if (!NLC.state.soundOn) return null;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    } catch (_) {
      return null;
    }
  }

  NLC.playTone = function (freq, duration = 0.05, type = "sine", gainVal = 0.05) {
    const ctx = ensureCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.type = type;
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_) {}
  };

  NLC.playSoundEffect = function (effect) {
    const ctx = ensureCtx();
    if (!ctx) return;
    try {
      if (effect === "bat_crack") {
        NLC.playTone(620, 0.045, "triangle", 0.09);
        NLC.playTone(250, 0.065, "sine", 0.08);
      } else if (effect === "six_fanfare") {
        [392, 523, 659, 784, 1046].forEach((f, i) => {
          setTimeout(() => NLC.playTone(f, 0.18, "triangle", 0.075), i * 55);
        });
      } else if (effect === "boundary_cheer") {
        [330, 440, 554, 660].forEach((f, i) => {
          setTimeout(() => NLC.playTone(f, 0.15, "triangle", 0.065), i * 50);
        });
      } else if (effect === "wicket_shatter") {
        [440, 320, 220, 155].forEach((f, i) => {
          setTimeout(() => NLC.playTone(f, 0.09, "sawtooth", 0.07), i * 38);
        });
      } else if (effect === "noball_siren") {
        NLC.playTone(740, 0.12, "sawtooth", 0.06);
        setTimeout(() => NLC.playTone(540, 0.16, "sawtooth", 0.06), 110);
      } else if (effect === "coin_flip") {
        NLC.playTone(1046, 0.08, "sine", 0.05);
        setTimeout(() => NLC.playTone(1318, 0.14, "sine", 0.06), 90);
      }
    } catch (_) {}
  };

  NLC.triggerHaptic = function (pattern = 25) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) {}
  };
})(window);