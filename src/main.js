import "./style.css";
import { ArenaScene } from "./scene.js";
import { GameAudio } from "./audio.js";
import { OnlineMotion } from "./online-motion.js";
import {
  ANIMALS,
  PALETTE,
  createGame,
  player,
  tick,
  input,
  view,
} from "../shared/game.js";
const $ = (s) => document.querySelector(s),
  escape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
$("#app").innerHTML =
  '<main id="stage" aria-label="3D arena"></main><div id="labels"></div><div id="ui"></div><div id="toast" role="status"></div>';
let scene;
try {
  scene = new ArenaScene($("#stage"), $("#labels"));
} catch (e) {
  $("#ui").innerHTML =
    '<div class="fatal">Your browser needs WebGL to play. Enable graphics acceleration and reload.</div>';
  throw e;
}
let route = "home",
  selected = "fox",
  name = localStorage.getItem("sp-name") || "",
  local = null,
  state = null,
  you = "you",
  socket = null,
  room = null,
  muted = localStorage.getItem("sp-muted") === "true",
  lastKey = "",
  lastPhase = "",
  netSend = 0,
  held = 0,
  movePointer = null,
  lastDraw = 0,
  lastHUD = 0,
  pointerAim = null,
  lastNow = performance.now();
const savedVolume = Number(localStorage.getItem("sp-volume") ?? 0.75);
let volume = Number.isFinite(savedVolume) ? Math.max(0, Math.min(1, savedVolume)) : 0.75;
const audio = new GameAudio(muted, volume);
const onlineMotion = new OnlineMotion();
function soundButton() {
  return `<div class="audio-controls"><button class="sound" data-action="sound" aria-label="${muted ? "Enable all audio" : "Mute all audio"}" aria-pressed="${!muted}" title="Music and sound effects">${muted ? "♪ OFF" : "♪ ON"}</button><details class="volume-control"><summary aria-label="Adjust volume" title="Adjust volume">⌄</summary><div class="volume-popover"><label for="audio-volume">MASTER VOLUME <output id="volume-value">${Math.round(volume * 100)}%</output></label><input id="audio-volume" type="range" min="0" max="100" step="1" value="${Math.round(volume * 100)}" aria-label="Master volume"><small>Music · Shots · Eliminations</small></div></details></div>`;
}
const names = {
  fox: "Fox",
  rabbit: "Rabbit",
  penguin: "Penguin",
  frog: "Frog",
};
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4000);
}
function identity() {
  name =
    ($("#player-name")?.value || name || "Miso").trim().slice(0, 18) || "Miso";
  localStorage.setItem("sp-name", name);
  return { name, animal: selected };
}
function serverURL() {
  return import.meta.env.VITE_WS_URL || "ws://localhost:3001";
}
function choices() {
  return `<fieldset class="animals"><legend>Choose your little survivor</legend>${ANIMALS.map((a, i) => `<button type="button" data-animal="${a}" class="animal ${selected === a ? "selected" : ""}" aria-pressed="${selected === a}" style="--animal:${PALETTE[i]}"><span>${["◆", "♧", "◒", "●"][i]}</span>${names[a]}</button>`).join("")}</fieldset>`;
}
function badge() {
  return '<a class="brand" href="#" data-action="home"><span class="brand-icon">S<span>!</span></span><span>SURVIVE<span class="please">PLEASE</span></span></a>';
}
function render() {
  const g = state,
    phase = g?.phase,
    key = [
      route,
      selected,
      room?.code,
      JSON.stringify(room?.lobby),
      phase,
      g?.round,
      g?.winner,
      g?.draw,
    ].join("|");
  if (key === lastKey) return;
  lastKey = key;
  $("#app").className = route === "play" ? "playing" : "menu";
  if (route === "home" || route === "online") {
    $("#ui").innerHTML =
      `<header>${badge()}<span class="edition">PROTO 01 <i></i> POCKET ARENA</span>${soundButton()}</header><section class="welcome"><div class="eyebrow"><span></span> SMALL ANIMALS. BIG SUSPICIONS.</div><h1>Aim.<br> Breathe.<br> <em>Survive.</em></h1><p class="intro">Nobody knows where you are.<br>Until everyone fires.</p><div class="setup"><label for="player-name">YOUR NAME</label><input id="player-name" maxlength="18" placeholder="Miso" value="${escape(name)}" autocomplete="nickname">${choices()}${route === "home" ? '<button class="primary" data-action="practice">Play practice <span>↗</span></button><button class="secondary" data-action="online">Play with friends <span>2—8</span></button>' : `<div class="online-form"><button class="primary" data-action="create">Create room <span>+</span></button><div class="join"><input id="room-code" aria-label="Room code" maxlength="6" placeholder="CODE"><button class="secondary" data-action="join">Join ↗</button></div><button class="text-button" data-action="home">← Back</button></div>`}</div><p class="micro">${route === "home" ? "Practice with 3 bots · No account · No waiting" : "Create a room or join with a code."}</p></section><aside class="world-note"><span class="coordinate">ISLAND 001 / THE CLEARING</span><h2>A quiet place.<br>For twenty seconds.</h2><p>Move along the edge. Pick your angle.<br>The reveal changes everything.</p></aside><footer><span><b>01</b> MOVE IN SECRET</span><span><b>02</b> LOCK YOUR SHOT</span><span><b>03</b> ALL AT ONCE</span><small>MADE FOR ONE MORE.</small></footer>`;
    return;
  }
  if (route === "lobby") {
    $("#ui").innerHTML =
      `<header>${badge()}<div class="header-actions">${soundButton()}<button class="text-button" data-action="home">Leave room ↗</button></div></header><section class="lobby-panel"><div class="eyebrow">MEETING POINT</div><h1>The crew.</h1><button class="code" data-action="copy" aria-label="Copy room code">${escape(room.code)} <small>COPY CODE ↗</small></button><p>Share this code with your friends.</p><ul class="roster">${room.lobby.map((p, i) => `<li><span class="avatar" style="background:${PALETTE[i]}">${names[p.animal]?.slice(0, 1)}</span><strong>${escape(p.name)} ${p.bot ? "(bot)" : p.id === you ? "(you)" : ""}</strong><span>${p.ready ? "✓ Ready" : "Getting ready"}</span></li>`).join("")}</ul><button class="primary" data-action="ready">${room.lobby.find((p) => p.id === you)?.ready ? "Not ready" : "Ready ✓"}</button>${room.host === you ? `<div class="bot-controls"><button class="secondary" data-action="add-bot" ${room.lobby.length >= 8 ? "disabled" : ""}>Add bot +</button><button class="secondary" data-action="remove-bot" ${room.lobby.some((p) => p.bot) ? "" : "disabled"}>Remove bot −</button></div><button class="secondary" data-action="start">Start match ↗</button>` : '<p class="micro">The host will start when everyone is ready.</p>'}<p class="micro">${room.lobby.length}/8 animals · Humans + bots · Everyone ready</p></section>`;
    return;
  }
  if (route === "play" && g) {
    $("#ui").innerHTML =
      `<header>${badge()}<div class="mode-tag">${local ? "PRACTICE / 3 BOTS" : "ROOM / " + escape(room?.code || "")} <i></i></div><div class="header-actions">${soundButton()}<button class="text-button" data-action="home">Leave ↗</button></div></header><div class="match-top"><div class="round"><span>ROUND</span><strong>${String(g.round).padStart(2, "0")}</strong></div><div class="phase"><span id="phase-label"></span><strong id="timer"></strong><div class="time-track"><i id="time-fill"></i></div></div><div class="round right"><span>ALIVE</span><strong id="alive"></strong></div></div><aside class="match-note"><span class="eyebrow">THE CLEARING</span><p id="hint"></p><div id="shrink-notice"></div></aside><div id="phase-banner" role="status"></div><div class="bottom-hud"><div class="control-help"><b>A / D</b> move along the edge<br><b>MOUSE</b> aim · <b>SPACE</b> lock</div><div class="touch-move"><button data-hold="-1" aria-label="Move left">←</button><button data-hold="1" aria-label="Move right">→</button></div><div class="shoot-area"><div id="afk" role="status"></div><button id="shoot" class="primary" data-action="shoot">LOCK SHOT <span>↗</span></button><small id="shot-status"></small></div><div class="touch-help">Tap the arena<br>to aim</div><div class="ring-count"><span>RINGS</span><b>${g.rings}/${g.initialRings}</b></div></div><div id="result-overlay"></div>`;
    updateHUD();
  }
}
function updateHUD() {
  if (route !== "play" || !state) return;
  const g = state,
    p = g.players.find((p) => p.id === you),
    alive = g.players.filter((p) => p.alive).length,
    phase = g.phase;
  $("#phase-label").textContent = {
    position: "HIDDEN POSITIONS",
    reveal: "THE REVEAL",
    results: "RESULTS",
    shrink: "THE ISLAND SHRINKS",
    finished: "MATCH OVER",
  }[phase];
  $("#timer").textContent =
    phase === "position"
      ? Math.ceil(g.remaining).toString().padStart(2, "0")
      : phase === "reveal"
        ? "!"
        : phase === "shrink"
          ? "↓"
          : "·";
  $("#time-fill").style.width =
    (phase === "position" ? Math.max(0, g.remaining / 20) * 100 : 100) + "%";
  $("#alive").textContent = alive + "/" + g.players.length;
  $("#hint").textContent =
    phase === "position"
      ? p?.alive
        ? scene.mobile
          ? "Tap to aim. Only other corners can be hit."
          : "Rivals are hidden. Aim for another corner."
        : "You are out. Watch the next reveal."
      : "All positions revealed.";
  $("#shrink-notice").textContent =
    g.round % 3 === 0 && (g.rings > 1 || (!g.duel && alive === 2))
      ? g.rings === 1
        ? "↓ Core duel after this round"
        : "↓ Shrink after this round"
      : "";
  $(".ring-count span").textContent = g.duel ? "CORE" : "RINGS";
  $(".ring-count b").textContent = g.duel
    ? "DUEL"
    : g.rings + "/" + g.initialRings;
  const shoot = $("#shoot");
  shoot.disabled = phase !== "position" || !p?.alive || p.locked;
  const shootLabel = p?.locked
    ? scene.mobile
      ? "LOCKED <span>✓</span>"
      : "SHOT LOCKED <span>✓</span>"
    : scene.mobile
      ? "FIRE <span>↗</span>"
      : "LOCK SHOT <span>↗</span>";
  if (shoot.innerHTML !== shootLabel) shoot.innerHTML = shootLabel;
  $("#shot-status").textContent =
    phase === "position"
      ? p?.locked
        ? "Position and aim locked. Waiting for the others."
        : "Your shot fires with everyone else's."
      : phase === "reveal"
        ? "All shots resolve simultaneously."
        : "";
  $("#afk").textContent =
    p?.afk >= 2 && p.alive
      ? "Move! One more inactive round will eliminate you."
      : p?.afk === 1 && p.alive
        ? "Move at least 0.7 m this round."
        : "";
  const kills = g.eliminated
    .map(
      (e) =>
        `${g.players.find((p) => p.id === e.id)?.name || "Animal"} ${e.by === "AFK" ? "· inactivity" : "· eliminated"}`,
    )
    .join(" / ");
  const banner =
    phase === "reveal"
      ? "<span>NOW WE SEE YOU.</span>"
      : phase === "results"
        ? `<span>${kills ? escape(kills) : "Nobody falls. The tension rises."}</span>`
        : phase === "shrink"
          ? "<span>LESS SPACE. MORE NERVES.</span>"
          : "";
  if ($("#phase-banner").innerHTML !== banner) {
    $("#phase-banner").innerHTML = banner;
  }
  if (phase === "finished" && !$("#result-overlay").firstElementChild) {
    const win = g.players.find((p) => p.id === g.winner);
    $("#result-overlay").innerHTML =
      `<section class="end-card"><div class="eyebrow">${g.draw ? "NOBODY SAW THAT COMING" : "LAST ANIMAL STANDING"}</div><h1>${g.draw ? "Draw!" : escape(win?.name || "Winner") + " survives."}</h1><p>${g.draw ? "Everyone fell in the same reveal." : "A good angle changes everything."}</p><p class="micro">${g.round} rounds · ${g.initialRings - g.rings + (g.duel ? 1 : 0)} shrinks</p><button class="primary" data-action="${local ? "practice" : "home"}">${local ? "Play again ↗" : "Back to menu ↗"}</button></section>`;
  } else if (phase !== "finished") $("#result-overlay").innerHTML = "";
  lastPhase = phase;
}
function send(data) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
}
function act(data) {
  if (local) input(local, you, data);
  else send({ type: "input", ...data });
}
function reset() {
  audio.reset();
  onlineMotion.reset();
  held = 0;
  pointerAim = null;
  local = null;
  state = null;
  room = null;
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  lastKey = "";
  lastPhase = "";
}
function practice() {
  const who = identity();
  reset();
  you = "you";
  local = createGame([
    player(you, who.name, who.animal),
    player("bot1", "Luna", "rabbit", true),
    player("bot2", "Pip", "penguin", true),
    player("bot3", "Mochi", "frog", true),
  ]);
  route = "play";
  state = view(local, you);
  render();
}
function connect(type) {
  const who = identity(),
    url = serverURL(),
    code = $("#room-code")?.value;
  try {
    const parsed = new URL(url);
    if (!["ws:", "wss:"].includes(parsed.protocol))
      throw Error("Use a ws:// or wss:// address");
    if (location.protocol === "https:" && parsed.protocol !== "wss:")
      throw Error("An HTTPS page needs a wss:// server");
    if (socket) { socket.onclose = null; socket.close(); }
    const connection = new WebSocket(url);
    socket = connection;
    toast("Connecting to server…");
    socket.onopen = () => { if (socket === connection) send({ type, ...who, code }); };
    socket.onmessage = (e) => {
      if (socket !== connection) return;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.type === "error") toast(m.message);
      if (m.type === "state") {
        room = m;
        you = m.you;
        state = m.game;
        onlineMotion.receive(state, performance.now());
        route = state ? "play" : "lobby";
        render();
      }
      if (m.type === "left") {
        reset();
        route = "home";
        render();
      }
    };
    socket.onerror = () =>
      toast("Could not connect. Check your internet connection and try again.");
    socket.onclose = (e) => {
      if (socket !== connection) return;
      if (route === "play" || route === "lobby") {
        reset();
        route = "online";
        render();
        toast(e.code === 1008 ? "Too many actions. Please rejoin the room." : "Connection lost. Please join a new room.");
      }
    };
  } catch (e) {
    toast(e.message);
  }
}
// Unlock on touch, mouse or keyboard; keep retries available after interruptions.
for (const event of ["pointerdown", "keydown"]) {
  document.addEventListener(event, (e) => {
    if (e.isTrusted && !e.target.closest('[data-action="sound"]')) audio.unlock();
  }, { capture: true });
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".audio-controls")) $(".volume-control")?.removeAttribute("open");
  const animalButton = e.target.closest("[data-animal]");
  if (animalButton) {
    identity();
    selected = animalButton.dataset.animal;
    render();
    return;
  }
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  e.preventDefault();
  if (action === "practice") practice();
  if (action === "home") {
    reset();
    route = "home";
    render();
  }
  if (action === "online") {
    identity();
    route = "online";
    render();
  }
  if (action === "create" || action === "join") connect(action);
  if (action === "ready" || action === "start") send({ type: action });
  if (action === "add-bot" || action === "remove-bot") send({ type: action });
  if (action === "shoot") act({ lock: true });
  if (action === "copy")
    navigator.clipboard
      ?.writeText(room.code)
      .then(() => toast("Room code copied."))
      .catch(() => toast(room.code));
  if (action === "sound") {
    muted = !muted;
    localStorage.setItem("sp-muted", String(muted));
    audio.setMuted(muted);
    const button = e.target.closest('[data-action="sound"]');
    button.textContent = muted ? "♪ OFF" : "♪ ON";
    button.setAttribute("aria-label", muted ? "Enable all audio" : "Mute all audio");
    button.setAttribute("aria-pressed", String(!muted));
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id !== "audio-volume") return;
  volume = Number(e.target.value) / 100;
  audio.setVolume(volume);
  localStorage.setItem("sp-volume", String(volume));
  $("#volume-value").textContent = `${Math.round(volume * 100)}%`;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $(".volume-control")?.removeAttribute("open");
  if (e.target.closest(".audio-controls")) return;
  if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
  const key = e.key.toLowerCase();
  if (["a", "d", " ", "arrowleft", "arrowright"].includes(key))
    e.preventDefault();
  if (e.repeat) return;
  if (key === "a" || key === "arrowleft") {
    held = -1;
    act({ move: held });
  }
  if (key === "d" || key === "arrowright") {
    held = 1;
    act({ move: held });
  }
  if (key === " " || key === "enter") act({ lock: true });
});
document.addEventListener("keyup", (e) => {
  if (["a", "d", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
    held = 0;
    act({ move: 0 });
  }
});
function stop() {
  movePointer = null;
  held = 0;
  act({ move: 0 });
}
window.addEventListener("blur", stop);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
  audio.setVisible(!document.hidden, state);
});
document.addEventListener("pointerdown", (e) => {
  const button = e.target.closest("[data-hold]");
  if (button) {
    movePointer = e.pointerId;
    held = Number(button.dataset.hold);
    button.setPointerCapture(e.pointerId);
    act({ move: held });
  }
});
function releaseMove(e) {
  if (e.pointerId === movePointer) stop();
}
document.addEventListener("pointerup", releaseMove);
document.addEventListener("pointercancel", releaseMove);
document.addEventListener("lostpointercapture", releaseMove);
function aim(e) {
  if (route !== "play") return;
  const p = state?.players.find((p) => p.id === you),
    angle = scene.aim(e.clientX, e.clientY, p);
  if (angle !== null) {
    pointerAim = angle;
    if (local) act({ aim: angle });
  }
}
scene.canvas.addEventListener("pointermove", aim);
scene.canvas.addEventListener("pointerdown", (e) => {
  aim(e);
  if (e.pointerType === "mouse") act({ aim: pointerAim, lock: true });
});
function loop(now) {
  requestAnimationFrame(loop);
  if (document.hidden || now - lastDraw < 1000 / 60 - 0.5) return;
  lastDraw = now;
  const dt = Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;
  if (local) {
    input(local, you, {
      move: held,
      ...(pointerAim !== null ? { aim: pointerAim } : {}),
    });
    tick(local, dt);
    state = view(local, you);
  } else if (state && now - netSend > 70) {
    netSend = now;
    act({ move: held, ...(pointerAim !== null ? { aim: pointerAim } : {}) });
  }
  render();
  if (now - lastHUD >= 100 || state?.phase !== lastPhase) {
    updateHUD();
    lastHUD = now;
  }
  const display = !local && state ? onlineMotion.frame(state, you, held, pointerAim, now, dt) : state;
  audio.update(route === "play" ? display : null);
  scene.draw(display, you, now / 1000, dt, route !== "play");
}
render();
requestAnimationFrame(loop);
