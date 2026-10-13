import * as T from "three";

// Four batches, no textures or extra shadow passes for the scenery.
export class PineForest {
  constructor(scene, mobile) {
    this.mobile = mobile;
    this.group = new T.Group();
    scene.add(this.group);
    const count = mobile ? 6 : 9;
    const batch = (geometry, color) => {
      const mesh = new T.InstancedMesh(
        geometry,
        new T.MeshStandardMaterial({ color, flatShading: true, roughness: 1 }),
        count,
      );
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.group.add(mesh);
      return mesh;
    };
    this.trunks = batch(new T.CylinderGeometry(1, 1.25, 1, 5), "#785c43");
    this.lower = batch(new T.ConeGeometry(1, 1, 6), "#365e4c");
    this.upper = batch(new T.ConeGeometry(1, 1, 6), "#527c60");
    this.stones = batch(new T.IcosahedronGeometry(1, 0), "#80948b");
    this.ray = new T.Raycaster();
    this.plane = new T.Plane(new T.Vector3(0, 1, 0), 3);
    this.point = new T.Vector3();
    this.ndc = new T.Vector2();
    this.dummy = new T.Object3D();
  }
  layout(camera, radius, menu) {
    const key = `${camera.aspect}:${camera.position.length().toFixed(3)}:${menu}`;
    if (key === this.key) return;
    this.key = key;
    const portrait = camera.aspect < 0.8;
    const anchors = this.mobile
      ? portrait
        ? [[0.09, 0.4, 0.65], [0.91, 0.4, 0.65], [0.12, 0.77, 0.55]]
        : [[0.08, 0.65, 0.55], [0.9, 0.5, 0.6], [0.76, 0.24, 0.45]]
      : [[190 / 1280, 530 / 900, 1], [245 / 1280, 640 / 900, 0.8],
         [1080 / 1280, 360 / 900, 1], [1130 / 1280, 640 / 900, 1.05],
         [950 / 1280, 270 / 900, 0.72]];
    let index = 0;
    const place = (mesh, x, y, z, sx, sy, sz) => {
      this.dummy.position.set(x, y, z);
      this.dummy.scale.set(sx, sy, sz);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
    };
    for (let a = 0; a < anchors.length; a++) {
      // Keep the menu's text and translucent form clear of scenery.
      if (menu && (this.mobile ? a === 2 : a < 2)) continue;
      const [u, v, scale] = anchors[a];
      this.ndc.set(u * 2 - 1, 1 - v * 2);
      this.ray.setFromCamera(this.ndc, camera);
      if (!this.ray.ray.intersectPlane(this.plane, this.point)) continue;
      const copies = !this.mobile && a === anchors.length - 1 ? 1 : 2;
      for (let j = 0; j < copies; j++) {
        let x = this.point.x + j * 1.15, z = this.point.z + j * 0.6;
        // Keep the scenery outside the playable perimeter at every arena size.
        const distance = Math.hypot(x, z), minimum = radius + 2;
        if (distance < minimum) { x *= minimum / distance; z *= minimum / distance; }
        const s = scale * (j ? 0.7 : 1), h = 3.6 * s;
        place(this.trunks, x, -3 + h * 0.29, z, 0.14 * s, h * 0.58, 0.14 * s);
        place(this.lower, x, -3 + h * 0.55, z, s * 1.05, h * 0.62, s * 1.05);
        place(this.upper, x, -3 + h * 0.82, z, s * 0.73, h * 0.5, s * 0.73);
        place(this.stones, x - 0.65, -2.8, z + 0.45, 0.42, 0.3, 0.34);
        index++;
      }
    }
    for (const mesh of this.group.children) {
      mesh.count = index;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
}
