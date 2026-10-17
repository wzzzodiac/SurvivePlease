export const CONFIG = Object.freeze({
  maxRooms: 5,
  maxPlayers: 8,
  minPlayers: 2,
  roundTime: 20,
  minTime: 7,
  timeDrop: 3,
  shrinkEvery: 3,
  revealTime: 2.2,
  resultTime: 2.3,
  shrinkTime: 1.5,
  speed: 4,
  hitRadius: 0.48,
  afkDistance: 0.7,
  afkRounds: 3,
  baseRadius: 3,
  finalRadius: 1.05,
  ringWidth: 1.15,
});
export const ANIMALS = ["fox", "rabbit", "penguin", "frog", "cat", "bear", "panda", "raccoon"];
export const PALETTE = [
  "#ffab63",
  "#c5a4f5",
  "#64ccdc",
  "#b3dc77",
  "#ff7787",
  "#ffe098",
  "#8daff1",
  "#eee3d1",
];
export const wrap = (s) => ((s % 1) + 1) % 1;
// Each corner owns the adjacent half-edges; boundaries belong clockwise.
export const cornerFor = (s) =>
  Math.floor(wrap(s) * 6 + 0.5 + Number.EPSILON * 8) % 6;
export const radiusFor = (rings) =>
  CONFIG.baseRadius + (rings - 1) * CONFIG.ringWidth;
export function perimeterPoint(s, radius) {
  const v = wrap(s) * 6,
    i = Math.floor(v),
    t = v - i,
    a = (i * Math.PI) / 3,
    b = ((i + 1) * Math.PI) / 3;
  return {
    x: radius * ((1 - t) * Math.cos(a) + t * Math.cos(b)),
    z: radius * ((1 - t) * Math.sin(a) + t * Math.sin(b)),
  };
}
export function player(id, name, animal = "fox", bot = false) {
  return {
    id,
    name,
    animal: ANIMALS.includes(animal) ? animal : "fox",
    bot,
    alive: true,
    ready: false,
    s: 0,
    aim: Math.PI,
    locked: false,
    move: 0,
    afk: 0,
    excursion: 0,
    startS: 0,
  };
}
export function createGame(players, config = {}) {
  if (players.length < 2 || players.length > 8)
    throw Error("A match needs 2 to 8 players");
  const rings = players.length <= 4 ? 3 : players.length <= 6 ? 5 : 7;
  const g = {
    config: { ...CONFIG, ...config },
    players: players.map((p, i) => ({
      ...p,
      alive: true,
      s: i / players.length,
      startS: i / players.length,
      aim: Math.atan2(
        -Math.sin((i / players.length) * 2 * Math.PI),
        -Math.cos((i / players.length) * 2 * Math.PI),
      ),
      locked: false,
      afk: 0,
      excursion: 0,
      move: 0,
    })),
    rings,
    initialRings: rings,
    duel: false,
    radius: radiusFor(rings),
    round: 1,
    phase: "position",
    remaining: config.roundTime ?? CONFIG.roundTime,
    shots: [],
    eliminated: [],
    winner: null,
    draw: false,
    clock: 0,
  };
  planBots(g);
  return g;
}
function planBots(g) {
  for (const p of g.players.filter((p) => p.bot && p.alive)) {
    p.botStop = 0.5 + Math.random() * Math.min(5, g.remaining * 0.4);
    p.botLock = p.botStop + 0.4 + Math.random() * 1.5;
    p.move = Math.random() < 0.5 ? -1 : 1;
    p.botAimOffset = (Math.random() - 0.5) * 0.55;
  }
}
export function input(g, id, data) {
  const p = g.players.find((p) => p.id === id);
  if (!p || !p.alive || p.locked || g.phase !== "position") return;
  if (Number.isFinite(data.move)) p.move = Math.sign(data.move);
  if (Number.isFinite(data.aim))
    p.aim = wrap(data.aim / (2 * Math.PI)) * 2 * Math.PI;
  if (data.lock) {
    p.locked = true;
    p.move = 0;
  }
}
export function rayHit(origin, angle, target, radius = CONFIG.hitRadius) {
  const dx = target.x - origin.x,
    dz = target.z - origin.z,
    ux = Math.cos(angle),
    uz = Math.sin(angle),
    t = dx * ux + dz * uz,
    d2 = dx * dx + dz * dz - t * t;
  // A ray starting inside another player's hitbox hits immediately, even
  // when their center is behind or perpendicular to the firing direction.
  if (dx * dx + dz * dz <= radius * radius) return 0;
  if (t <= 0 || d2 > radius * radius) return null;
  return Math.max(0, t - Math.sqrt(Math.max(0, radius * radius - d2)));
}
export function resolve(g) {
  const alive = g.players.filter((p) => p.alive),
    dead = new Map();
  g.shots = [];
  for (const p of alive) {
    p.locked = true;
    p.move = 0;
    p.afk = p.excursion >= g.config.afkDistance ? 0 : p.afk + 1;
    if (p.afk >= g.config.afkRounds) dead.set(p.id, "AFK");
    const from = perimeterPoint(p.s, g.radius);
    let best = null,
      dist = g.radius * 2.5;
    for (const q of alive) {
      if (q.id === p.id || cornerFor(q.s) === cornerFor(p.s)) continue;
      const target = perimeterPoint(q.s, g.radius);
      // No contact kills, including close players across a corner-zone boundary.
      if (Math.hypot(target.x - from.x, target.z - from.z) <= g.config.hitRadius)
        continue;
      const hit = rayHit(
        from,
        p.aim,
        target,
        g.config.hitRadius,
      );
      if (hit !== null && hit < dist) {
        dist = hit;
        best = q;
      }
    }
    if (best) dead.set(best.id, p.name);
    g.shots.push({
      id: p.id,
      from,
      to: {
        x: from.x + Math.cos(p.aim) * dist,
        z: from.z + Math.sin(p.aim) * dist,
      },
      hit: best?.id ?? null,
    });
  }
  g.eliminated = [...dead].map(([id, by]) => ({ id, by }));
  for (const p of alive) if (dead.has(p.id)) p.alive = false;
  g.phase = "reveal";
  g.remaining = g.config.revealTime;
  g.clock = 0;
}
function nextRound(g) {
  g.round++;
  g.phase = "position";
  g.remaining = Math.max(
    g.config.minTime,
    g.duel
      ? g.config.minTime
      : g.config.roundTime - (g.initialRings - g.rings) * g.config.timeDrop,
  );
  g.shots = [];
  g.eliminated = [];
  g.clock = 0;
  for (const p of g.players) {
    p.locked = false;
    p.move = 0;
    p.startS = p.s;
    p.excursion = 0;
  }
  planBots(g);
}
export function tick(g, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || g.phase === "finished") return;
  dt = Math.min(dt, 0.1);
  g.remaining -= dt;
  g.clock += dt;
  if (g.phase === "position") {
    for (const p of g.players.filter((p) => p.alive && !p.locked)) {
      if (p.bot) {
        if (g.clock >= p.botStop) p.move = 0;
        const point = perimeterPoint(p.s, g.radius);
        p.aim = Math.atan2(-point.z, -point.x) + p.botAimOffset;
        if (g.clock >= p.botLock) {
          p.locked = true;
          p.move = 0;
        }
      }
      // Keep the tiny final perimeter controllable: same angular pace as ring 1.
      const speed =
        g.config.speed * (g.duel ? g.radius / g.config.baseRadius : 1);
      p.s = wrap(p.s + (p.move * speed * dt) / (6 * g.radius));
      const delta = Math.abs(p.s - p.startS);
      p.excursion = Math.max(
        p.excursion,
        Math.min(delta, 1 - delta) * 6 * g.radius,
      );
    }
    if (
      g.remaining <= 0 ||
      g.players.filter((p) => p.alive).every((p) => p.locked)
    )
      resolve(g);
    return;
  }
  if (g.remaining > 0) return;
  if (g.phase === "reveal") {
    g.phase = "results";
    g.remaining = g.config.resultTime;
    g.clock = 0;
    return;
  }
  if (g.phase === "results") {
    const survivors = g.players.filter((p) => p.alive);
    if (survivors.length <= 1) {
      g.phase = "finished";
      g.winner = survivors[0]?.id ?? null;
      g.draw = !survivors.length;
      return;
    }
    if (g.round % g.config.shrinkEvery === 0 && g.rings > 1) {
      g.rings--;
      g.radius = radiusFor(g.rings);
      g.phase = "shrink";
      g.remaining = g.config.shrinkTime;
      g.clock = 0;
      return;
    }
    if (
      g.round % g.config.shrinkEvery === 0 &&
      g.rings === 1 &&
      !g.duel &&
      survivors.length === 2
    ) {
      g.duel = true;
      g.radius = g.config.finalRadius;
      g.phase = "shrink";
      g.remaining = g.config.shrinkTime;
      g.clock = 0;
      return;
    }
    nextRound(g);
    return;
  }
  if (g.phase === "shrink") nextRound(g);
}
// Only self carries live coordinates in the hidden phase, even for spectators.
export function view(g, id) {
  const hidden = g.phase === "position";
  return {
    phase: g.phase,
    remaining: Math.max(0, g.remaining),
    round: g.round,
    rings: g.rings,
    initialRings: g.initialRings,
    duel: g.duel,
    radius: g.radius,
    clock: g.clock,
    winner: g.winner,
    draw: g.draw,
    shots: hidden ? [] : g.shots,
    eliminated: hidden ? [] : g.eliminated,
    players: g.players.map((p, i) => {
      const base = {
        id: p.id,
        name: p.name,
        animal: p.animal,
        color: PALETTE[i],
        alive: p.alive,
        locked: p.locked,
        afk: p.id === id ? p.afk : undefined,
      };
      return !hidden || p.id === id ? { ...base, s: p.s, aim: p.aim } : base;
    }),
  };
}
