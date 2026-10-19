import {
  CONFIG,
  ANIMALS,
  player,
  createGame,
  input,
  tick,
  view,
} from "../shared/game.js";
import { randomBytes } from "node:crypto";

function human(id, name, animal) {
  if (name !== undefined && typeof name !== "string")
    throw Error("Name must be text");
  return player(id, (name || "Animal").trim().slice(0, 18) || "Animal", animal);
}

export class Rooms {
  constructor({
    now = Date.now,
    lobbyIdleMs = 15 * 60000,
    lobbyMaxMs = 60 * 60000,
    finishedIdleMs = 5 * 60000,
  } = {}) {
    this.rooms = new Map();
    this.now = now;
    this.limits = { lobbyIdleMs, lobbyMaxMs, finishedIdleMs };
  }
  create(id, name, animal) {
    if (this.rooms.size >= CONFIG.maxRooms)
      throw Error("All five rooms are occupied");
    let code;
    do {
      code = randomBytes(3).toString("hex").toUpperCase();
    } while (this.rooms.has(code));
    // Validate and construct the first member before publishing the room.
    const firstPlayer = human(id, name, animal);
    const room = {
      code,
      host: id,
      players: [firstPlayer],
      game: null,
      revision: 0,
      lobbyOpenedAt: this.now(),
      lastLobbyActivityAt: this.now(),
      finishedAt: null,
    };
    this.rooms.set(code, room);
    return room;
  }
  join(code, id, name, animal) {
    const r = this.rooms.get(code);
    if (!r) throw Error("Room not found");
    if (r.game) throw Error("The match has already started");
    if (r.players.length >= CONFIG.maxPlayers) throw Error("Room full");
    if (r.players.some((p) => p.id === id))
      throw Error("You have already joined");
    r.players.push(human(id, name, animal));
    this.changed(r);
    return r;
  }
  ready(r, id) {
    if (r.game) return;
    const p = r.players.find((p) => p.id === id);
    if (p && !p.bot) {
      p.ready = !p.ready;
      this.changed(r);
    }
  }
  bot(r, id, remove = false) {
    if (r.host !== id) throw Error("Only the host can change bots");
    if (r.game) throw Error("The match has already started");
    if (remove) {
      const index = r.players.findLastIndex((p) => p.bot);
      if (index >= 0) {
        r.players.splice(index, 1);
        this.changed(r);
      }
      return;
    }
    if (r.players.length >= CONFIG.maxPlayers) throw Error("Room full");
    const bot = player(
      "bot-" + randomBytes(6).toString("hex"),
      "Bot " + (r.players.filter((p) => p.bot).length + 1),
      ANIMALS[r.players.length % ANIMALS.length],
      true,
    );
    bot.ready = true;
    r.players.push(bot);
    this.changed(r);
  }
  start(r, id) {
    if (r.game) throw Error("The match has already started");
    if (r.host !== id) throw Error("Only the host can start");
    if (r.players.length < 2 || !r.players.every((p) => p.ready))
      throw Error("At least two players must join and everyone must be ready");
    r.game = createGame(r.players);
    this.changed(r);
  }
  leave(r, id) {
    r.players = r.players.filter((p) => p.id !== id);
    const humans = r.players.filter((p) => !p.bot);
    if (!humans.length) {
      this.rooms.delete(r.code);
      return;
    }
    if (r.host === id) r.host = humans[0].id;
    this.changed(r);
    if (r.game) {
      const p = r.game.players.find((p) => p.id === id);
      if (p) {
        p.alive = false;
        p.move = 0;
        p.locked = true;
      }
    }
  }
  rematch(r, id) {
    if (r.host !== id) throw Error("Only the host can request a rematch");
    if (r.game?.phase !== "finished") throw Error("Wait until the match ends");
    r.game = null;
    r.lobbyOpenedAt = this.now();
    r.finishedAt = null;
    r.players = r.players.map((p) => ({
      ...player(p.id, p.name, p.animal, p.bot),
      ready: p.bot,
    }));
    this.changed(r);
  }
  changed(r) {
    r.revision++;
    if (!r.game) r.lastLobbyActivityAt = this.now();
  }
  expire(now = this.now()) {
    const expired = [];
    for (const r of this.rooms.values()) {
      const staleLobby =
        !r.game &&
        (now - r.lastLobbyActivityAt >= this.limits.lobbyIdleMs ||
          now - r.lobbyOpenedAt >= this.limits.lobbyMaxMs);
      const staleResult =
        r.game?.phase === "finished" &&
        r.finishedAt !== null &&
        now - r.finishedAt >= this.limits.finishedIdleMs;
      if (!staleLobby && !staleResult) continue;
      this.rooms.delete(r.code);
      expired.push(r);
    }
    return expired;
  }
  state(r, id) {
    return {
      type: "state",
      code: r.code,
      host: r.host,
      you: id,
      lobby: r.players.map(({ id, name, animal, ready, bot }) => ({
        id,
        name,
        animal,
        ready,
        bot,
      })),
      game: r.game ? view(r.game, id) : null,
    };
  }
  step(dt) {
    for (const r of this.rooms.values())
      if (r.game) {
        tick(r.game, dt);
        if (r.game.phase === "finished" && r.finishedAt === null) {
          r.finishedAt = this.now();
          this.changed(r);
        }
      }
  }
  input(r, id, data) {
    if (r.game) input(r.game, id, data);
  }
}
