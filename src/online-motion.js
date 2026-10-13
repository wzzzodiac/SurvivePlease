import { CONFIG, wrap } from "../shared/game.js";

// Presentation only: authoritative state and hit resolution stay on the server.
// Predict the local animal between snapshots and gently reconcile on the edge.
export class OnlineMotion {
  constructor() { this.reset(); }
  reset() { this.s = null; this.key = null; this.received = 0; }
  receive(game, now) { this.received = now; }
  frame(game, you, held, aim, now, dt) {
    const own = game.players.find((p) => p.id === you);
    const age = Math.max(0, Math.min((now - this.received) / 1000, 0.12));
    const display = { ...game, clock: game.clock + age, remaining: Math.max(0, game.remaining - age) };
    const key = `${you}:${game.round}:${game.phase}:${game.radius}`;
    if (!own || own.s === undefined || !own.alive || own.locked || game.phase !== "position") {
      this.s = null; this.key = null;
      return display;
    }
    const speed = CONFIG.speed * (game.duel ? game.radius / CONFIG.baseRadius : 1) / (6 * game.radius);
    if (this.key !== key || this.s == null) { this.s = own.s; this.key = key; }
    // Stop extrapolating when snapshots stop arriving instead of drifting forever.
    const move = now - this.received < 250 ? held : 0;
    this.s = wrap(this.s + move * speed * dt);
    const target = wrap(own.s + move * speed * Math.min(age + 0.05, 0.12));
    const error = wrap(target - this.s + 0.5) - 0.5;
    this.s = wrap(this.s + error * (1 - Math.exp(-8 * dt)));
    display.players = game.players.map((p) => p.id === you ? { ...p, s: this.s, aim: aim ?? p.aim } : p);
    return display;
  }
}
