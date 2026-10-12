# SurvivePlease

**Muévete en secreto. Fija tu disparo. Todos a la vez.**

Prototipo web 3D de estrategia y predicción: animales de juguete en una arena hexagonal flotante. Modelos procedurales originales; sin assets de Roblox.

![Menú de escritorio](qa/desktop-menu.png)

## Jugar

Node.js **22.12 o superior** y npm. Desde este directorio:

```sh
npm ci
npm run dev
```

Abre **http://localhost:5173** y pulsa **Jugar práctica**. Tres bots permiten jugar una partida completa sin backend. Para multijugador, abre otra terminal:

```sh
npm run server
```

En dos navegadores o sesiones independientes, entra en **Jugar con amigos**, usa `ws://localhost:3001`, crea una sala y comparte su código. Todos deben pulsar **Estoy listo**; el anfitrión pulsa **Iniciar partida**. Para otra partida online, vuelve al menú y crea una nueva sala.

Desde otro dispositivo de la red, utiliza la IP del equipo en ambos enlaces, por ejemplo `http://192.168.1.20:5173` y `ws://192.168.1.20:3001`. Añade explícitamente el origen del frontend a `ALLOWED_ORIGINS` antes de iniciar el backend. No se han modificado reglas del firewall.

## Controles

| Acción | PC | Móvil / táctil |
| --- | --- | --- |
| Recorrer el perímetro | A / D, o flechas | Mantener ← / → |
| Apuntar | Ratón sobre la arena | Tocar o arrastrar sobre la arena |
| Fijar posición y disparo | Botón, espacio, Enter o clic en la arena | Botón **FIJAR DISPARO** |

Al fijar, quedas bloqueado hasta la siguiente ronda. El disparo sale con todos los demás. Si no confirmas, se registra el ángulo actual al vencer el tiempo: no pierdes por olvidar el botón.

## Reglas implementadas

- 2–8 jugadores por sala; hasta 5 salas por proceso. Práctica con tres bots que se mueven, apuntan, confirman, eliminan y mueren.
- Movimiento continuo por los seis bordes, incluyendo esquinas. Sin entrada al interior.
- Posicionamiento oculto de hasta 20 segundos. Termina antes si todos los vivos confirman.
- Revelación de personajes y nombres, pausa visual breve, disparos simultáneos, impactos, resultados y siguiente ronda.
- Rayos contra el primer círculo válido de radio 0,48 m. Una sola instantánea para todos: también dispara quien muere en esa resolución. Hay eliminaciones mutuas y empate si no sobrevive nadie.
- 3 anillos para 2–4 participantes, 5 para 5–6, 7 para 7–8. Contracción cada tres rondas, manteniendo la coordenada proporcional del perímetro y su ángulo. Advertencia previa y transición animada.
- Cada contracción resta 3 segundos; mínimo 7 segundos y un anillo. El duelo continúa en el mínimo.
- Anti-AFK: máxima excursión real desde el punto inicial de la ronda, sobre el perímetro. Menos de 0,7 m incrementa el contador; dos rondas avisan, tres eliminan. Pulsaciones o vibraciones de milímetros no cuentan. Movimiento suficiente reinicia el contador.
- Zorro, conejo, pingüino y rana, con animaciones sencillas, sombras, nombres y sonido sintetizado de revelación.
- Menú, selección de personaje, lobby, HUD adaptable y resultados.

## Autoridad y privacidad

El cliente envía intención de movimiento (`-1`, `0`, `1`), ángulo y confirmación. El servidor calcula posición, reloj, bloqueo, colisiones, inactividad, contracción y ganador. No acepta coordenadas ni impactos declarados por clientes. La práctica comparte este motor de reglas. Los bots eligen ángulos hacia el centro con variación aleatoria sin consultar posiciones rivales ocultas.

Durante posicionamiento, cada paquete personalizado omite `s` y `aim` de todos los demás jugadores, incluso para espectadores eliminados. Identidad del lobby y confirmaciones son públicas. Durante revelación, todos reciben posiciones congeladas y los mismos rayos. Servidor a 20 Hz; el render interpola sobre el perímetro sin cortar esquinas por el interior.

Protecciones básicas: origen permitido, máximo 2 KiB por mensaje, 40 mensajes/s por conexión, 12 conexiones simultáneas y 20 aperturas/minuto por IP, cinco creaciones/minuto por IP y 10 segundos entre creaciones por conexión, ping/pong y limpieza de salas vacías. Una desconexión elimina al participante activo y transfiere el anfitrión. No hay cuentas, persistencia, reconexión ni protección DDoS de infraestructura.

## Organización y herramientas

```text
shared/game.js       Configuración, geometría, reglas, bots y vistas privadas
server/rooms.js      Salas, participantes, listo/inicio y desconexión
server/index.js      HTTP de salud, WebSocket y límites
src/animals.js       Modelos 3D originales por piezas geométricas
src/scene.js         Arena, cámara, sombras, animación y rayos
src/main.js          Pantallas, entradas, audio y transporte local/online
src/style.css        Identidad visual y adaptación táctil
test/game.test.js    Casos críticos de reglas y salas
qa/                 Pruebas de navegador, resultados y capturas
```

Balance centralizado en `CONFIG`, en `shared/game.js`. Three.js permite crear/renderizar los recursos 3D sin exportador; Vite construye el frontend; `ws` aporta WebSocket sin framework de servidor. JavaScript ESM comparte directamente reglas entre navegador, Node y pruebas. Las fuentes web son opcionales, con fallback de sistema.

## Verificación

```sh
npm test
npm run build
# Con frontend/backend arrancados y Microsoft Edge instalado:
node qa/browser.mjs
node qa/multiplayer.mjs
```

14 pruebas: confirmación anticipada, timeout, eliminaciones simultáneas, primer impacto, movimiento, contracción, mínimo, AFK, privacidad, validación y límites de salas. La prueba de navegador juega una práctica completa hasta el resultado y captura escritorio (1440×1000) y móvil emulado (390×844). La prueba online usa dos contextos de Edge independientes y conexiones WebSocket reales: lobby, movimiento, resolución anticipada, paquetes privados, rayos idénticos, desconexión y rechazo de origen no autorizado.

Resultados: [navegador](qa/browser-results.json), [multijugador](qa/multiplayer-results.json). Capturas: [fase oculta](qa/desktop-hidden.png), [revelación](qa/desktop-reveal.png), [resultado](qa/desktop-results.png), [móvil](qa/mobile-hidden.png), [lobby online](qa/multiplayer-lobby.png).

**Límites:** Edge headless en Windows y emulación táctil; sin pruebas en móvil físico, Safari/Firefox, rendimiento térmico, cinco salas/40 jugadores simultáneos ni red pública. Vite avisa de un bundle ligeramente mayor de 500 kB sin comprimir (aprox. 133 kB gzip), incluido Three.js.

## Desplegar frontend

```sh
npm ci
npm run build
```

Publica **`dist/`** en un alojamiento estático HTTPS. Las rutas relativas de `vite.config.js` permiten subdirectorios como GitHub Pages. El workflow manual **Deploy frontend to Pages** construye y publica la práctica: actívalo desde Actions después de fusionar, con Pages configurado como **GitHub Actions**. No publica al abrir el PR.

Establece `VITE_WS_URL=wss://tu-backend.example` antes de construir, o introduce la URL en el menú. HTTPS requiere `wss://`. **GitHub Pages no ejecuta WebSocket.**

## Desplegar backend

Servicio Node persistente o contenedor con soporte WebSocket. Incluye `package.json`, `package-lock.json`, `server/` y `shared/`; instala `npm ci --omit=dev` y ejecuta `npm run server`.

| Variable | Valor |
| --- | --- |
| `PORT` | Puerto HTTP/WebSocket, predeterminado `3001` |
| `ALLOWED_ORIGINS` | Orígenes exactos separados por comas, sin `/` final; por ejemplo `https://wzzzodiac.github.io` |

PowerShell:

```powershell
$env:PORT='3001'
$env:ALLOWED_ORIGINS='https://wzzzodiac.github.io'
npm run server
```

Docker (archivo preparado; contenedor no probado en esta entrega):

```sh
docker build -t surviveplease-server .
docker run --rm -p 3001:3001 -e ALLOWED_ORIGINS=https://wzzzodiac.github.io surviveplease-server
```

Configura TLS y upgrade WebSocket en el proxy. **`GET /health`** devuelve salud y cantidad de salas. Usa una instancia: las salas viven en memoria y se pierden al reiniciar. Varias réplicas necesitarían afinidad/coordinación. Los límites usan la IP del socket: detrás de un proxy se comparten entre los clientes que llegan desde la misma IP del proxy. No se confía automáticamente en `X-Forwarded-For`; configura el proxy antes de abrir un servicio a gran escala.

## Estado

Práctica completa y multijugador local funcional. **Backend no desplegado públicamente; no se afirma disponibilidad online.** Quedan despliegue público, pruebas de carga/red/dispositivos físicos, reconexión, revancha en la misma sala y más pulido de efectos/audio.
