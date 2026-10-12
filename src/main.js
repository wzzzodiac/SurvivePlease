import "./style.css";
import { ArenaScene } from "./scene.js";
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
  '<main id="stage" aria-label="Arena 3D"></main><div id="labels"></div><div id="ui"></div><div id="toast" role="status"></div>';
let scene;
try {
  scene = new ArenaScene($("#stage"), $("#labels"));
} catch (e) {
  $("#ui").innerHTML =
    '<div class="fatal">Tu navegador necesita WebGL para jugar. Activa la aceleración gráfica y recarga.</div>';
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
  muted = false,
  lastKey = "",
  lastPhase = "",
  netSend = 0,
  held = 0,
  pointerAim = null,
  lastNow = performance.now();
const names = {
  fox: "Zorro",
  rabbit: "Conejo",
  penguin: "Pingüino",
  frog: "Rana",
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
function choices() {
  return `<fieldset class="animals"><legend>Elige tu pequeño superviviente</legend>${ANIMALS.map((a, i) => `<button type="button" data-animal="${a}" class="animal ${selected === a ? "selected" : ""}" aria-pressed="${selected === a}" style="--animal:${PALETTE[i]}"><span>${["◆", "♧", "◒", "●"][i]}</span>${names[a]}</button>`).join("")}</fieldset>`;
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
      `<header>${badge()}<span class="edition">PROTO 01 <i></i> ARENA DE BOLSILLO</span><button class="sound" data-action="sound" aria-label="Activar o desactivar sonido">${muted ? "♪ OFF" : "♪ ON"}</button></header><section class="welcome"><div class="eyebrow"><span></span> PEQUEÑOS ANIMALES. GRANDES SOSPECHAS.</div><h1>Apunta.<br> Respira.<br> <em>Sobrevive.</em></h1><p class="intro">Nadie sabe dónde estás.<br>Hasta que todos disparan.</p><div class="setup"><label for="player-name">TU NOMBRE</label><input id="player-name" maxlength="18" placeholder="Miso" value="${escape(name)}" autocomplete="nickname">${choices()}${route === "home" ? '<button class="primary" data-action="practice">Jugar práctica <span>↗</span></button><button class="secondary" data-action="online">Jugar con amigos <span>2—8</span></button>' : `<div class="online-form"><label for="server-url">SERVIDOR WEBSOCKET</label><input id="server-url" value="${escape(localStorage.getItem("sp-server") || import.meta.env.VITE_WS_URL || "ws://localhost:3001")}" placeholder="wss://tu-servidor"><button class="primary" data-action="create">Crear sala <span>+</span></button><div class="join"><input id="room-code" aria-label="Código de sala" maxlength="6" placeholder="CÓDIGO"><button class="secondary" data-action="join">Unirme ↗</button></div><button class="text-button" data-action="home">← Volver</button></div>`}</div><p class="micro">${route === "home" ? "Práctica con 3 bots · Sin cuenta · Sin esperas" : "El multijugador requiere un servidor disponible."}</p></section><aside class="world-note"><span class="coordinate">ISLA 001 / EL CLARO</span><h2>Un lugar tranquilo.<br>Durante veinte segundos.</h2><p>Muévete por el borde. Elige tu ángulo.<br>La revelación lo cambia todo.</p></aside><footer><span><b>01</b> MUÉVETE EN SECRETO</span><span><b>02</b> FIJA TU DISPARO</span><span><b>03</b> TODOS A LA VEZ</span><small>HECHO PARA JUGAR OTRA.</small></footer>`;
    return;
  }
  if (route === "lobby") {
    $("#ui").innerHTML =
      `<header>${badge()}<button class="text-button" data-action="home">Salir de la sala ↗</button></header><section class="lobby-panel"><div class="eyebrow">PUNTO DE ENCUENTRO</div><h1>La pandilla.</h1><button class="code" data-action="copy" aria-label="Copiar código de sala">${escape(room.code)} <small>COPIAR CÓDIGO ↗</small></button><p>Comparte el código y la dirección del servidor.</p><ul class="roster">${room.lobby.map((p, i) => `<li><span class="avatar" style="background:${PALETTE[i]}">${names[p.animal]?.slice(0, 1)}</span><strong>${escape(p.name)} ${p.id === you ? "(tú)" : ""}</strong><span>${p.ready ? "✓ Listo" : "Preparándose"}</span></li>`).join("")}</ul><button class="primary" data-action="ready">${room.lobby.find((p) => p.id === you)?.ready ? "Ya no estoy listo" : "Estoy listo ✓"}</button>${room.host === you ? '<button class="secondary" data-action="start">Iniciar partida ↗</button>' : '<p class="micro">El anfitrión iniciará cuando todos estén listos.</p>'}<p class="micro">${room.lobby.length}/8 animales · Mínimo 2 · Todos listos</p></section>`;
    return;
  }
  if (route === "play" && g) {
    $("#ui").innerHTML =
      `<header>${badge()}<div class="mode-tag">${local ? "PRÁCTICA / 3 BOTS" : "SALA / " + escape(room?.code || "")} <i></i></div><button class="text-button" data-action="home">Salir ↗</button></header><div class="match-top"><div class="round"><span>RONDA</span><strong>${String(g.round).padStart(2, "0")}</strong></div><div class="phase"><span id="phase-label"></span><strong id="timer"></strong><div class="time-track"><i id="time-fill"></i></div></div><div class="round right"><span>EN PIE</span><strong id="alive"></strong></div></div><aside class="match-note"><span class="eyebrow">EL CLARO</span><p id="hint"></p><div id="shrink-notice"></div></aside><div id="phase-banner" role="status"></div><div class="bottom-hud"><div class="control-help"><b>A / D</b> moverte por el borde<br><b>RATÓN</b> apuntar · <b>ESPACIO</b> fijar</div><div class="touch-move"><button data-hold="-1" aria-label="Mover a la izquierda">←</button><button data-hold="1" aria-label="Mover a la derecha">→</button></div><div class="shoot-area"><div id="afk" role="status"></div><button id="shoot" class="primary" data-action="shoot">FIJAR DISPARO <span>↗</span></button><small id="shot-status"></small></div><div class="touch-help">Toca la arena<br>para apuntar</div><div class="ring-count"><span>ANILLOS</span><b>${g.rings}/${g.initialRings}</b></div></div><div id="result-overlay"></div>`;
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
    position: "POSICIÓN OCULTA",
    reveal: "LA REVELACIÓN",
    results: "RESULTADO",
    shrink: "LA ISLA SE REDUCE",
    finished: "FIN DE PARTIDA",
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
        ? "Tus rivales están ocultos. Predice su próximo movimiento."
        : "Has sido eliminado. La siguiente revelación mostrará el duelo."
      : "Todas las posiciones, al descubierto.";
  $("#shrink-notice").textContent =
    g.round % 3 === 0 && g.rings > 1
      ? "↓ Contracción al terminar esta ronda"
      : "";
  const shoot = $("#shoot");
  shoot.disabled = phase !== "position" || !p?.alive || p.locked;
  const shootLabel = p?.locked
    ? "DISPARO FIJADO <span>✓</span>"
    : "FIJAR DISPARO <span>↗</span>";
  if (shoot.innerHTML !== shootLabel) shoot.innerHTML = shootLabel;
  $("#shot-status").textContent =
    phase === "position"
      ? p?.locked
        ? "Posición y ángulo bloqueados. Esperando al resto."
        : "Tu disparo saldrá con los demás."
      : phase === "reveal"
        ? "Todos los disparos se resuelven simultáneamente."
        : "";
  $("#afk").textContent =
    p?.afk >= 2 && p.alive
      ? "¡Muévete! Otra ronda inmóvil te elimina."
      : p?.afk === 1 && p.alive
        ? "Muévete al menos 0,7 m esta ronda."
        : "";
  const kills = g.eliminated
    .map(
      (e) =>
        `${g.players.find((p) => p.id === e.id)?.name || "Animal"} ${e.by === "AFK" ? "· inactividad" : "· eliminado"}`,
    )
    .join(" / ");
  const banner =
    phase === "reveal"
      ? "<span>AHORA NOS VEMOS.</span>"
      : phase === "results"
        ? `<span>${kills ? escape(kills) : "Nadie cae. La tensión sube."}</span>`
        : phase === "shrink"
          ? "<span>MENOS ESPACIO. MÁS NERVIOS.</span>"
          : "";
  if ($("#phase-banner").innerHTML !== banner) {
    $("#phase-banner").innerHTML = banner;
  }
  if (phase === "finished" && !$("#result-overlay").firstElementChild) {
    const win = g.players.find((p) => p.id === g.winner);
    $("#result-overlay").innerHTML =
      `<section class="end-card"><div class="eyebrow">${g.draw ? "NADIE SE LO ESPERABA" : "ÚLTIMO ANIMAL EN PIE"}</div><h1>${g.draw ? "¡Empate!" : escape(win?.name || "Ganador") + " sobrevive."}</h1><p>${g.draw ? "Todos cayeron en la misma resolución." : "Un buen ángulo lo cambia todo."}</p><p class="micro">${g.round} rondas · ${g.initialRings - g.rings} contracciones</p><button class="primary" data-action="${local ? "practice" : "home"}">${local ? "Otra partida ↗" : "Volver al menú ↗"}</button></section>`;
  } else if (phase !== "finished") $("#result-overlay").innerHTML = "";
  if (phase !== lastPhase) {
    lastPhase = phase;
    if (phase === "reveal") sound();
  }
}
let audio;
function sound() {
  if (muted) return;
  try {
    audio ??= new AudioContext();
    audio.resume();
    const o = audio.createOscillator(),
      gain = audio.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(420, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(70, audio.currentTime + 0.23);
    gain.gain.setValueAtTime(0.09, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
    o.connect(gain).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.3);
  } catch {}
}
function send(data) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
}
function act(data) {
  if (local) input(local, you, data);
  else send({ type: "input", ...data });
}
function reset() {
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
    url = $("#server-url").value.trim(),
    code = $("#room-code")?.value;
  try {
    const parsed = new URL(url);
    if (!["ws:", "wss:"].includes(parsed.protocol))
      throw Error("Usa una dirección ws:// o wss://");
    if (location.protocol === "https:" && parsed.protocol !== "wss:")
      throw Error("Una página HTTPS necesita un servidor wss://");
    if (socket) socket.close();
    socket = new WebSocket(url);
    localStorage.setItem("sp-server", url);
    toast("Conectando al servidor…");
    socket.onopen = () => send({ type, ...who, code });
    socket.onmessage = (e) => {
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
      toast("No se pudo conectar. Comprueba el servidor y su dirección.");
    socket.onclose = () => {
      if (route === "play" || route === "lobby") {
        reset();
        route = "online";
        render();
        toast("Conexión cerrada. Puedes volver a unirte a una sala nueva.");
      }
    };
  } catch (e) {
    toast(e.message);
  }
}
document.addEventListener("click", (e) => {
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
  if (action === "shoot") act({ lock: true });
  if (action === "copy")
    navigator.clipboard
      ?.writeText(room.code)
      .then(() => toast("Código copiado"))
      .catch(() => toast(room.code));
  if (action === "sound") {
    muted = !muted;
    lastKey = "";
    render();
  }
});
document.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
  const key = e.key.toLowerCase();
  if (["a", "d", " ", "arrowleft", "arrowright"].includes(key))
    e.preventDefault();
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
  if (["a", "d", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    held = 0;
    act({ move: 0 });
  }
});
function stop() {
  held = 0;
  act({ move: 0 });
}
window.addEventListener("blur", stop);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});
document.addEventListener("pointerdown", (e) => {
  const button = e.target.closest("[data-hold]");
  if (button) {
    held = Number(button.dataset.hold);
    button.setPointerCapture(e.pointerId);
    act({ move: held });
  }
});
document.addEventListener("pointerup", stop);
document.addEventListener("pointercancel", stop);
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
  updateHUD();
  scene.draw(state, you, now / 1000, dt, route !== "play");
  requestAnimationFrame(loop);
}
render();
requestAnimationFrame(loop);
