// Beams and falls become visible 0.65 seconds into each reveal.
// Consume muted/hidden reveals too, so returning never replays old effects.
export class RevealCues {
  reset() { this.round = null; }
  update(game, audible) {
    if (game?.phase !== "reveal" || game.round === this.round) return null;
    if (!audible) { this.round = game.round; return null; }
    if (game.clock < 0.65) return null;
    this.round = game.round;
    if (game.clock > 1.4) return null;
    return { shots: game.shots.length, deaths: game.eliminated.length };
  }
}

export class GameAudio {
  constructor(muted = false, volume = 0.75) {
    this.muted = muted;
    this.volume = volume;
    this.cues = new RevealCues();
    this.voices = new Set();
    this.visible = !document.hidden;
  }
  // Called synchronously from a real pointer/key gesture, never from a timer.
  unlock() {
    if (this.muted || !this.visible) return;
    try {
      if (!this.context) {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
        this.music = new Audio();
        this.music.preload = "none";
        this.music.loop = true;
        this.music.src = `${import.meta.env.BASE_URL}audio/meeting-the-forest.mp3`;
        const musicGain = this.context.createGain();
        musicGain.gain.value = 0.16;
        this.context.createMediaElementSource(this.music).connect(musicGain).connect(this.master);
        this.unlocked = true;
      }
      if (this.context.state !== "running") this.context.resume().catch(() => {});
      if (this.music.paused) this.music.play().catch(() => {});
    } catch { /* Audio is optional; unsupported devices can still play. */ }
  }
  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.volume;
    if (muted) { this.music?.pause(); this.stopEffects(); }
    else this.unlock();
  }
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.02);
  }
  setVisible(visible, game) {
    this.visible = visible;
    this.cues.update(game, false);
    if (!visible) {
      this.stopEffects();
      this.music?.pause();
      this.context?.suspend().catch(() => {});
    } else if (this.unlocked) this.unlock();
  }
  stopEffects() {
    for (const voice of this.voices) {
      try { voice.stop(); } catch {}
    }
    this.voices.clear();
  }
  reset() { this.cues.reset(); this.stopEffects(); }
  tone(type, startHz, endHz, delay, duration, volume) {
    const context = this.context, start = context.currentTime + delay;
    const voice = context.createOscillator(), gain = context.createGain();
    voice.type = type;
    voice.frequency.setValueAtTime(startHz, start);
    voice.frequency.exponentialRampToValueAtTime(endHz, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    voice.connect(gain).connect(this.master);
    this.voices.add(voice);
    voice.onended = () => { voice.disconnect(); gain.disconnect(); this.voices.delete(voice); };
    voice.start(start);
    voice.stop(start + duration);
  }
  update(game) {
    const cue = this.cues.update(game, this.visible && !this.muted && this.context?.state === "running");
    if (!cue) return;
    // One mixed burst for simultaneous shots: eight players stay as quiet as two.
    if (cue.shots) {
      this.tone("triangle", 880, 110, 0, 0.16, 0.22);
      this.tone("sine", 170, 65, 0, 0.11, 0.15);
    }
    if (cue.deaths) {
      this.tone("sine", 520, 130, 0.12, 0.42, 0.18);
      this.tone("triangle", 260, 65, 0.18, 0.40, 0.08);
    }
  }
}
