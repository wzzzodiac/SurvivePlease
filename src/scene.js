import * as T from "three";
import { animal } from "./animals.js";
import { actorVisible } from "./presentation.js";
import { perimeterPoint, radiusFor, PALETTE } from "../shared/game.js";
export class ArenaScene {
  constructor(container, labels) {
    this.labels = labels;
    this.scene = new T.Scene();
    this.scene.background = new T.Color("#d8e5df");
    this.scene.fog = new T.Fog("#d8e5df", 36, 70);
    this.camera = new T.PerspectiveCamera(36, 1, 0.1, 100);
    this.mobile = matchMedia("(pointer: coarse), (max-width: 760px)").matches;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, this.mobile ? 1.25 : 1.75),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.append(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    this.scene.add(new T.HemisphereLight("#fff8e9", "#617b7e", 3));
    const sun = new T.DirectionalLight("#fff3d3", 4);
    sun.position.set(-8, 16, 9);
    sun.castShadow = true;
    const shadowSize = this.mobile ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, {
      left: -14,
      right: 14,
      top: 14,
      bottom: -14,
      far: 45,
    });
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.actors = new Map();
    this.rings = [];
    this.world = new T.Group();
    this.scene.add(this.world);
    this.targetRadius = radiusFor(3);
    this.displayRadius = this.targetRadius;
    this.buildArena(3);
    this.aimLine = new T.Line(
      new T.BufferGeometry().setAttribute(
        "position",
        new T.BufferAttribute(new Float32Array(6), 3),
      ),
      new T.LineDashedMaterial({
        color: "#fff4cf",
        dashSize: 0.28,
        gapSize: 0.16,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.aimLine.position.y = 0.68;
    this.aimLine.geometry.setAttribute(
      "lineDistance",
      new T.BufferAttribute(new Float32Array(2), 1),
    );
    this.scene.add(this.aimLine);
    this.shotGroup = new T.Group();
    this.scene.add(this.shotGroup);
    this.raycaster = new T.Raycaster();
    this.plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    this.resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    };
    new ResizeObserver(this.resize).observe(container);
    this.resize();
    this.decorate();
  }
  buildArena(n) {
    for (const r of this.rings) {
      this.world.remove(r);
      r.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    }
    this.rings = [];
    for (let i = n; i >= 1; i--) {
      const r = radiusFor(i),
        g = new T.Group(),
        mat = new T.MeshStandardMaterial({
          color: i % 2 ? "#6faaa1" : "#83b8a9",
          roughness: 0.9,
          flatShading: true,
        });
      const disk = new T.Mesh(
        new T.CylinderGeometry(r, r * 0.97, 0.44, 6),
        mat,
      );
      disk.rotation.y = Math.PI / 6;
      disk.position.y = -(i - 1) * 0.075;
      disk.receiveShadow = true;
      disk.castShadow = true;
      g.add(disk);
      const points = Array.from(
        { length: 7 },
        (_, j) =>
          new T.Vector3(
            Math.cos((j * Math.PI) / 3) * r,
            0.23 - (i - 1) * 0.075,
            Math.sin((j * Math.PI) / 3) * r,
          ),
      );
      const border = new T.Line(
        new T.BufferGeometry().setFromPoints(points),
        new T.LineBasicMaterial({ color: i === n ? "#ffedb8" : "#b9dbc4" }),
      );
      g.add(border);
      const posts = new T.InstancedMesh(
        new T.CylinderGeometry(0.095, 0.13, 0.34, 6),
        new T.MeshStandardMaterial({ color: "#fff1ce" }),
        6,
      );
      for (let j = 0; j < 6; j++) {
        const a = (j * Math.PI) / 3;
        posts.setMatrixAt(
          j,
          new T.Matrix4().makeTranslation(
            Math.cos(a) * r,
            0.35 - (i - 1) * 0.075,
            Math.sin(a) * r,
          ),
        );
      }
      posts.castShadow = true;
      g.add(posts);
      this.world.add(g);
      this.rings.push(g);
    }
    const core = this.rings[this.rings.length - 1];
    const emblem = new T.Mesh(
      new T.TorusGeometry(0.65, 0.035, 6, 6),
      new T.MeshStandardMaterial({ color: "#c0d9b9" }),
    );
    emblem.rotation.x = Math.PI / 2;
    emblem.position.y = 0.24;
    core.add(emblem);
  }
  decorate() {
    const ground = new T.Mesh(
      new T.PlaneGeometry(200, 200),
      new T.MeshStandardMaterial({ color: "#d8e5df", roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3;
    ground.receiveShadow = true;
    this.scene.add(ground);
    for (let i = 0; i < 16; i++) {
      const a = i * 2.399,
        r = 11 + (i % 4) * 2;
      const rock = new T.Mesh(
        new T.IcosahedronGeometry(0.3 + (i % 3) * 0.25, 0),
        new T.MeshStandardMaterial({
          color: i % 2 ? "#a6bdb4" : "#bdccc0",
          flatShading: true,
          roughness: 1,
        }),
      );
      rock.position.set(Math.cos(a) * r, -2.5, Math.sin(a) * r);
      rock.rotation.set(i, i * 0.7, 0);
      this.scene.add(rock);
    }
    const base = new T.Mesh(
      new T.CylinderGeometry(2.8, 1.8, 1.4, 6),
      new T.MeshStandardMaterial({
        color: "#365c60",
        flatShading: true,
        roughness: 1,
      }),
    );
    base.rotation.y = Math.PI / 6;
    base.position.y = -0.9;
    base.castShadow = true;
    this.base = base;
    this.scene.add(base);
  }
  aim(clientX, clientY, own) {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new T.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = new T.Vector3();
    if (
      this.raycaster.ray.intersectPlane(this.plane, hit) &&
      own?.s !== undefined
    ) {
      const p = perimeterPoint(own.s, this.displayRadius);
      return Math.atan2(hit.z - p.z, hit.x - p.x);
    }
    return null;
  }
  draw(state, you, time, dt, menu = false) {
    const n = state?.initialRings || 3;
    if (this.rings.length !== n) this.buildArena(n);
    this.targetRadius = state?.radius || radiusFor(3);
    this.displayRadius = T.MathUtils.damp(
      this.displayRadius,
      this.targetRadius,
      5,
      dt,
    );
    for (let i = 0; i < this.rings.length; i++) {
      const index = n - i;
      const g = this.rings[i];
      const shrinking =
        state?.phase === "shrink" && !state.duel && index === state.rings + 1;
      g.visible = index <= (state?.rings || 3) || shrinking;
      const k =
        shrinking || (state?.duel && index === 1)
          ? this.displayRadius / radiusFor(index)
          : 1;
      g.scale.set(k, 1, k);
      g.traverse((o) => {
        if (o.material) {
          o.material.transparent = shrinking;
          o.material.opacity = shrinking
            ? Math.max(0, 1 - state.clock / 1.5)
            : 1;
        }
      });
      g.position.y = Math.sin(time * 0.7) * 0.055;
    }
    const radius = this.displayRadius,
      dist = Math.max(
        radius * 3 + 6,
        ((radius + 1.5) /
          Math.tan(Math.PI / 10) /
          Math.min(this.camera.aspect, 1.3)) *
          0.9,
      );
    const baseScale = Math.min(1, radius / radiusFor(1));
    this.base.scale.set(baseScale, 1, baseScale);
    this.scene.fog.near = dist + 12;
    this.scene.fog.far = dist + 55;
    this.camera.position.set(dist * 0.37, dist * 0.67, dist * 0.78);
    this.camera.lookAt(menu ? -1 : 0, 0, 0);
    const players = state?.players || [
      {
        id: "a",
        animal: "fox",
        name: "Miso",
        s: 0.37,
        aim: 0.3,
        color: PALETTE[0],
        alive: true,
      },
      {
        id: "b",
        animal: "rabbit",
        name: "Luna",
        s: 0.13,
        aim: 2.8,
        color: PALETTE[1],
        alive: true,
      },
      {
        id: "c",
        animal: "penguin",
        name: "Pip",
        s: 0.74,
        aim: 1,
        color: PALETTE[2],
        alive: true,
      },
      {
        id: "d",
        animal: "frog",
        name: "Mochi",
        s: 0.91,
        aim: 3,
        color: PALETTE[3],
        alive: true,
      },
    ];
    for (const [id, a] of this.actors)
      if (!players.some((p) => p.id === id)) {
        this.scene.remove(a.model);
        a.label.remove();
        a.model.traverse((o) => {
          o.geometry?.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material?.dispose();
        });
        this.actors.delete(id);
      }
    for (const p of players) {
      let a = this.actors.get(p.id);
      if (!a) {
        const model = animal(p.animal, p.color);
        this.scene.add(model);
        const label = document.createElement("div");
        label.className = "nameplate";
        label.textContent = p.name;
        this.labels.append(label);
        a = { model, label, s: p.s ?? 0 };
        this.actors.set(p.id, a);
      }
      const visible = actorVisible(p, state);
      a.model.visible = visible;
      a.label.hidden = !visible || menu;
      if (!visible) continue;
      let delta = ((p.s - a.s + 1.5) % 1) - 0.5;
      a.s = (a.s + delta * Math.min(1, dt * 18) + 1) % 1;
      const pos = perimeterPoint(a.s, radius);
      a.model.position.set(pos.x, 0.25 + Math.sin(time * 3) * 0.025, pos.z);
      a.model.rotation.y = Math.PI / 2 - p.aim;
      const fallen =
        !p.alive && !(state?.phase === "reveal" && state.clock < 0.65);
      if (fallen) {
        a.model.rotation.z = T.MathUtils.damp(
          a.model.rotation.z,
          Math.PI / 2,
          7,
          dt,
        );
        a.model.scale.setScalar(T.MathUtils.damp(a.model.scale.x, 0.6, 7, dt));
        a.label.classList.add("out");
      } else {
        a.model.rotation.z = 0;
        a.model.scale.setScalar(1);
        a.model.userData.body.rotation.z =
          Math.sin(time * (p.locked ? 2 : 7) + a.s * 30) *
          (p.locked ? 0.015 : 0.045);
        a.label.classList.remove("out");
      }
      const v = new T.Vector3(pos.x, fallen ? 0.95 : 2, pos.z).project(
        this.camera,
      );
      a.label.style.left = (v.x * 0.5 + 0.5) * this.canvas.clientWidth + "px";
      a.label.style.top = (-v.y * 0.5 + 0.5) * this.canvas.clientHeight + "px";
      a.label.classList.toggle("self", p.id === you);
    }
    const own = players.find((p) => p.id === you),
      showAim =
        own?.alive && own.s !== undefined && state?.phase === "position";
    this.aimLine.visible = !!showAim;
    if (showAim) {
      const from = perimeterPoint(own.s, radius),
        end = {
          x: from.x + Math.cos(own.aim) * radius * 2.2,
          z: from.z + Math.sin(own.aim) * radius * 2.2,
        };
      const positions = this.aimLine.geometry.attributes.position;
      positions.setXYZ(0, from.x, 0, from.z);
      positions.setXYZ(1, end.x, 0, end.z);
      positions.needsUpdate = true;
      this.aimLine.geometry.computeBoundingSphere();
      const distances = this.aimLine.geometry.attributes.lineDistance;
      distances.setX(1, Math.hypot(end.x - from.x, end.z - from.z));
      distances.needsUpdate = true;
      this.aimLine.material.color.set(own.locked ? "#ffb76b" : "#fff4cf");
    }
    const signature = state?.shots?.length
      ? state.round + ":" + state.phase
      : "";
    if (signature !== this.shotKey) {
      this.shotKey = signature;
      for (const o of [...this.shotGroup.children]) {
        this.shotGroup.remove(o);
        o.geometry.dispose();
        o.material.dispose();
      }
      for (const shot of state?.shots || []) {
        const p = players.find((p) => p.id === shot.id);
        const from = new T.Vector3(shot.from.x, 0.85, shot.from.z),
          to = new T.Vector3(shot.to.x, 0.85, shot.to.z);
        const direction = to.clone().sub(from),
          beam = new T.Mesh(
            new T.CylinderGeometry(0.035, 0.035, direction.length(), 8),
            new T.MeshBasicMaterial({
              color: p?.color || "#fff2c6",
              transparent: true,
              opacity: 0.9,
            }),
          );
        beam.position.copy(from.clone().add(to).multiplyScalar(0.5));
        beam.quaternion.setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          direction.normalize(),
        );
        this.shotGroup.add(beam);
        if (shot.hit) {
          const impact = new T.Mesh(
            new T.IcosahedronGeometry(0.35, 1),
            new T.MeshBasicMaterial({ color: "#ffe0a0", wireframe: true }),
          );
          impact.position.copy(to);
          this.shotGroup.add(impact);
        }
      }
    }
    this.shotGroup.visible =
      ["reveal", "results", "finished"].includes(state?.phase) &&
      !(state?.phase === "reveal" && state.clock < 0.65);
    for (const o of this.shotGroup.children)
      if (o.geometry.type === "IcosahedronGeometry") {
        o.rotation.y = time * 3;
        o.scale.setScalar(1 + Math.sin(time * 12) * 0.2);
      }
    this.renderer.render(this.scene, this.camera);
  }
}
