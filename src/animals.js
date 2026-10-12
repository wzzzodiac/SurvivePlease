import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
const mat = (color) =>
  new T.MeshStandardMaterial({ color, roughness: 0.78, flatShading: true });
export function animal(kind, color) {
  const root = new T.Group(),
    body = new T.Group();
  root.add(body);
  const fur = mat(
      kind === "fox"
        ? "#ed9754"
        : kind === "penguin"
          ? "#293e4b"
          : kind === "frog"
            ? "#91bd73"
            : "#e6d7f1",
    ),
    cream = mat("#fff2d6"),
    dark = mat("#21313a"),
    accent = mat(color),
    pink = mat("#eea1a0");
  function part(geo, m, x, y, z, rx = 0, rz = 0) {
    const p = new T.Mesh(geo, m);
    p.position.set(x, y, z);
    p.rotation.set(rx, 0, rz);
    p.castShadow = true;
    p.receiveShadow = true;
    body.add(p);
    return p;
  }
  const ball = (m, x, y, z, sx, sy, sz) => {
    const p = part(new T.SphereGeometry(1, 12, 8), m, x, y, z);
    p.scale.set(sx, sy, sz);
    return p;
  };
  ball(fur, 0, 0.55, 0, 0.36, 0.44, 0.29);
  ball(cream, 0, 0.49, 0.235, 0.23, 0.28, 0.08);
  ball(fur, 0, 1.03, 0.03, 0.43, 0.36, 0.35);
  for (const x of [-1, 1]) {
    ball(dark, x * 0.16, 1.08, 0.337, 0.054, 0.07, 0.035);
    ball(cream, x * 0.145, 1.11, 0.364, 0.015, 0.02, 0.009);
    ball(
      kind === "penguin" ? pink : fur,
      x * 0.23,
      0.17,
      0.15,
      0.13,
      0.1,
      0.19,
    );
    ball(fur, x * 0.36, 0.55, 0.02, 0.1, 0.24, 0.12);
  }
  if (kind === "fox") {
    for (const x of [-1, 1]) {
      part(
        new T.ConeGeometry(0.19, 0.43, 3),
        fur,
        x * 0.28,
        1.4,
        0,
        0,
        -x * 0.14,
      );
      part(new T.ConeGeometry(0.1, 0.25, 3), pink, x * 0.28, 1.41, 0.1);
    }
    ball(cream, 0, 0.95, 0.33, 0.27, 0.16, 0.16);
    ball(dark, 0, 1, 0.47, 0.07, 0.05, 0.04);
    const tail = ball(fur, 0, 0.5, -0.45, 0.2, 0.2, 0.42);
    tail.rotation.x = -0.4;
    ball(cream, 0, 0.65, -0.73, 0.15, 0.14, 0.15);
  }
  if (kind === "rabbit") {
    for (const x of [-1, 1]) {
      ball(fur, x * 0.23, 1.65, 0, 0.12, 0.43, 0.12);
      ball(pink, x * 0.23, 1.67, 0.09, 0.055, 0.29, 0.035);
    }
    ball(cream, 0, 0.91, 0.34, 0.22, 0.14, 0.1);
    ball(pink, 0, 0.98, 0.43, 0.055, 0.04, 0.04);
    ball(cream, 0, 0.5, -0.33, 0.18, 0.18, 0.18);
  }
  if (kind === "penguin") {
    ball(cream, 0, 1.04, 0.26, 0.31, 0.26, 0.13);
    for (const x of [-1, 1]) {
      ball(dark, x * 0.145, 1.09, 0.38, 0.046, 0.06, 0.025);
      ball(cream, x * 0.135, 1.11, 0.399, 0.012, 0.016, 0.007);
    }
    part(
      new T.ConeGeometry(0.12, 0.24, 4),
      mat("#f0b24d"),
      0,
      0.95,
      0.45,
      Math.PI / 2,
    );
  }
  if (kind === "frog") {
    for (const x of [-1, 1]) {
      ball(fur, x * 0.28, 1.3, 0.12, 0.17, 0.17, 0.17);
      ball(cream, x * 0.28, 1.32, 0.24, 0.11, 0.1, 0.05);
      ball(dark, x * 0.28, 1.32, 0.28, 0.05, 0.07, 0.026);
    }
    ball(pink, 0, 0.92, 0.37, 0.13, 0.025, 0.02);
  }
  // A tiny toy blaster and a colored scarf make team ownership readable.
  part(
    new T.TorusGeometry(0.3, 0.055, 6, 16),
    accent,
    0,
    0.78,
    0.01,
    Math.PI / 2,
  );
  part(new T.BoxGeometry(0.17, 0.16, 0.4), dark, 0.34, 0.62, 0.37);
  part(
    new T.CylinderGeometry(0.07, 0.07, 0.14, 8),
    accent,
    0.34,
    0.62,
    0.63,
    Math.PI / 2,
  );
  root.userData.body = body;
  // These pieces animate together. Bake their local transforms and batch by
  // material so a character needs ~5 draw calls instead of ~20.
  body.updateMatrixWorld(true);
  const batches = new Map();
  for (const mesh of [...body.children]) {
    const geometries = batches.get(mesh.material) || [];
    geometries.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));
    batches.set(mesh.material, geometries);
    body.remove(mesh);
    mesh.geometry.dispose();
  }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw Error("No se pudo preparar el modelo animal");
    const mesh = new T.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  return root;
}
