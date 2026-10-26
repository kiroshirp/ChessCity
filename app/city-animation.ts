import * as THREE from "three";
import { constructionTimeline } from "../lib/construction-timeline";
import { BUILDING_COLORS as COLORS } from "../lib/model";
import type { CityEvent } from "../lib/city-events";

/** Transient geometry only: no external models, timers or permanent render loop. */
export function createCityAnimation(
  scene: THREE.Scene,
  event: CityEvent,
  startedAt: number,
  reducedMotion: boolean,
) {
  const root = new THREE.Group(),
    rig = new THREE.Group(),
    workers: THREE.Group[] = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1),
    sphereGeo = new THREE.SphereGeometry(1, 10, 8);
  const mats = [0xd6ac54, 0x393940, 0xe6e4da, 0x51718a, 0xa59b89].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  root.position.set(event.building.x, 0, event.building.z);
  root.add(rig);
  scene.add(root);
  function box(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: number,
  ) {
    const mesh = new THREE.Mesh(boxGeo, mats[mat]);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  }
  const height = event.building.height,
    towerHeight = Math.max(24, height + 15);
  const tower = new THREE.Group();
  root.add(tower);
  tower.position.set(-10, 0, -8);
  box(tower, 0, towerHeight / 2, 0, 1.4, towerHeight, 1.4, 0);
  for (let y = 2; y < towerHeight; y += 4) {
    box(tower, 0, y, 0, 2, 0.25, 2, 1);
  }
  const jib = new THREE.Group();
  jib.position.y = towerHeight;
  tower.add(jib);
  box(jib, 4, 0, 0, 20, 0.7, 1, 0);
  box(jib, -6, -1, 0, 3, 2, 2, 1);
  const cable = box(jib, 10, -6, 0, 0.12, 12, 0.12, 1);
  const load = new THREE.Mesh(
    event.kind === "demolition" ? sphereGeo : boxGeo,
    mats[event.kind === "demolition" ? 1 : 2],
  );
  load.position.set(10, -12, 0);
  load.scale.setScalar(event.kind === "demolition" ? 2.3 : 1.3);
  jib.add(load);
  const scaffold = new THREE.Group();
  rig.add(scaffold);
  for (const x of [-7, 7])
    for (const z of [-7, 7])
      box(scaffold, x, height / 2, z, 0.2, height, 0.2, 1);
  for (let y = 3; y < height; y += 4) {
    box(scaffold, 0, y, -7, 14, 0.15, 0.25, 2);
    box(scaffold, 0, y, 7, 14, 0.15, 0.25, 2);
  }
  for (let i = 0; i < 4; i++) {
    const worker = new THREE.Group();
    root.add(worker);
    workers.push(worker);
    box(worker, 0, 1, 0, 0.65, 1, 0.45, 0);
    box(worker, 0, 1.7, 0, 0.5, 0.5, 0.5, 2);
    box(worker, -0.18, 0.3, 0, 0.2, 0.7, 0.25, 1);
    box(worker, 0.18, 0.3, 0, 0.2, 0.7, 0.25, 1);
  }
  const ghost = new THREE.Group();
  root.add(ghost);
  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: COLORS[event.building.accent],
    roughness: 0.9,
  });
  const body = new THREE.Mesh(boxGeo, ghostMaterial);
  body.position.y = height / 2;
  body.scale.set(event.building.width, height, event.building.depth);
  ghost.add(body);
  const floors = Math.max(1, Math.floor(height / 3));
  const windows = new THREE.InstancedMesh(boxGeo, mats[2], floors * 3 * 4);
  const windowTransform = new THREE.Object3D();
  let pane = 0;
  for (let floor = 0; floor < floors; floor++)
    for (let col = 0; col < 3; col++)
      for (let side = 0; side < 4; side++) {
        const horizontal = (col - 1) * event.building.width * 0.26;
        windowTransform.position.set(
          side < 2
            ? horizontal
            : (side === 2 ? 1 : -1) * (event.building.width / 2 + 0.03),
          1.7 + floor * 3,
          side < 2
            ? (side === 0 ? 1 : -1) * (event.building.depth / 2 + 0.03)
            : horizontal,
        );
        windowTransform.scale.set(
          side < 2 ? 0.7 : 0.08,
          1,
          side < 2 ? 0.08 : 0.7,
        );
        windowTransform.updateMatrix();
        windows.setMatrixAt(pane++, windowTransform.matrix);
      }
  windows.instanceMatrix.needsUpdate = true;
  ghost.add(windows);
  ghost.visible = event.kind === "demolition";
  const rubble = Array.from({ length: 12 }, (_, i) => {
    const chunk = new THREE.Mesh(boxGeo, mats[4]);
    root.add(chunk);
    chunk.scale.setScalar(0.7 + (i % 3) * 0.3);
    return chunk;
  });
  return {
    update(now: number) {
      const elapsed = now - startedAt,
        t = constructionTimeline(event.kind, elapsed, reducedMotion);
      root.visible = elapsed >= 0 && !t.done;
      jib.rotation.y =
        event.kind === "demolition"
          ? -0.7 + t.swing * 0.45
          : -0.5 + t.swing * 0.35;
      const lift =
        event.kind === "demolition" ? 12 : 4 + Math.abs(t.swing) * 10;
      cable.scale.y = lift;
      cable.position.y = -lift / 2;
      load.position.y = -lift;
      scaffold.visible = event.kind !== "demolition" && t.progress < 0.94;
      scaffold.scale.y = Math.max(0.1, t.progress);
      workers.forEach((worker, i) => {
        const phase = elapsed / 1300 + (i * Math.PI) / 2;
        worker.position.set(
          Math.cos(phase) * 9,
          0.1 + Math.abs(Math.sin(elapsed / 120 + i)) * 0.12,
          Math.sin(phase) * 9,
        );
        worker.rotation.y = -phase;
      });
      ghost.scale.y = t.progress;
      ghost.rotation.z =
        event.kind === "demolition" ? (1 - t.progress) * 0.22 : 0;
      rubble.forEach((chunk, i) => {
        chunk.visible = event.kind === "demolition" && t.dust > 0;
        const angle = i * 2.4;
        chunk.position.set(
          Math.cos(angle) * (2 + t.dust * 7),
          Math.sin(i + elapsed / 170) * t.dust + 1,
          Math.sin(angle) * (2 + t.dust * 7),
        );
        chunk.rotation.set(elapsed / 400 + i, i, elapsed / 500);
        chunk.scale.setScalar((0.7 + (i % 3) * 0.3) * t.dust);
      });
      return t;
    },
    dispose() {
      scene.remove(root);
      boxGeo.dispose();
      sphereGeo.dispose();
      mats.forEach((m) => m.dispose());
      ghostMaterial.dispose();
    },
  };
}
