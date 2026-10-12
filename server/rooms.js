import {
  CONFIG,
  player,
  createGame,
  input,
  tick,
  view,
} from "../shared/game.js";
import { randomBytes } from "node:crypto";
export class Rooms {
  constructor() {
    this.rooms = new Map();
  }
  create(id, name, animal) {
    if (this.rooms.size >= CONFIG.maxRooms)
      throw Error("Las cinco salas están ocupadas");
    let code;
    do {
      code = randomBytes(3).toString("hex").toUpperCase();
    } while (this.rooms.has(code));
    const room = { code, host: id, players: [], game: null };
    this.rooms.set(code, room);
    this.join(code, id, name, animal);
    return room;
  }
  join(code, id, name, animal) {
    const r = this.rooms.get(code);
    if (!r) throw Error("No existe esa sala");
    if (r.game) throw Error("La partida ya comenzó");
    if (r.players.length >= CONFIG.maxPlayers) throw Error("Sala llena");
    if (r.players.some((p) => p.id === id)) throw Error("Ya estás dentro");
    r.players.push(
      player(
        id,
        String(name || "Animal")
          .trim()
          .slice(0, 18) || "Animal",
        animal,
      ),
    );
    return r;
  }
  ready(r, id) {
    if (r.game) return;
    const p = r.players.find((p) => p.id === id);
    if (p) p.ready = !p.ready;
  }
  start(r, id) {
    if (r.game) throw Error("La partida ya comenzó");
    if (r.host !== id) throw Error("Solo el anfitrión puede iniciar");
    if (r.players.length < 2 || !r.players.every((p) => p.ready))
      throw Error("Hacen falta dos jugadores y todos listos");
    r.game = createGame(r.players);
  }
  leave(r, id) {
    r.players = r.players.filter((p) => p.id !== id);
    if (!r.players.length) {
      this.rooms.delete(r.code);
      return;
    }
    if (r.host === id) r.host = r.players[0].id;
    if (r.game) {
      const p = r.game.players.find((p) => p.id === id);
      if (p) {
        p.alive = false;
        p.move = 0;
        p.locked = true;
      }
    }
  }
  state(r, id) {
    return {
      type: "state",
      code: r.code,
      host: r.host,
      you: id,
      lobby: r.players.map(({ id, name, animal, ready }) => ({
        id,
        name,
        animal,
        ready,
      })),
      game: r.game ? view(r.game, id) : null,
    };
  }
  step(dt) {
    for (const r of this.rooms.values()) if (r.game) tick(r.game, dt);
  }
  input(r, id, data) {
    if (r.game) input(r.game, id, data);
  }
}
