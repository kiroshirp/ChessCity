"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createWindowAtlas } from "../lib/vendor/window-atlas";
import { createLayout, type CityBuilding } from "../lib/city-layout";
import {
  identitySeed,
  BUILDING_COLORS as COLORS,
  type Player,
  type Mode,
} from "../lib/model";
import { buildingStage } from "../lib/progression";
import { NEIGHBORHOODS, type Plot } from "../lib/neighborhoods";

import { createCityAnimation } from "./city-animation";
import type { CityEvent } from "../lib/city-events";

interface Props {
  players: Player[];
  selected: string | null;
  mode: Mode;
  daylight: boolean;
  command: { name: string; id: number };
  onSelect: (player: Player) => void;
  plots: Plot[];
  events: CityEvent[];
  placing: boolean;
  onPlotSelect: (plot: Plot) => void;
}

export default function CityViewport({
  players,
  selected,
  mode,
  daylight,
  command,
  onSelect,
  plots,
  events,
  placing,
  onPlotSelect,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const animationStarts = useRef(new Map<string, number>());
  const api = useRef<{
    focus: (id: string | null) => void;
    command: (name: string) => void;
    theme: (light: boolean) => void;
  } | null>(null);
  const clickRef = useRef(onSelect);
  clickRef.current = onSelect;
  const plotClickRef = useRef(onPlotSelect);
  plotClickRef.current = onPlotSelect;
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: "low-power",
      });
    } catch {
      setError(true);
      return;
    }
    setError(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);
    const layout = createLayout(players, mode);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(39, 1, 0.5, 4000);
    camera.position.set(225, 190, 250);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.minDistance = 35;
    controls.maxDistance = 1600;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minPolarAngle = 0.2;
    controls.target.set(0, 12, 0);
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const material = (color: string) => {
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        metalness: 0.05,
      });
      materials.push(m);
      return m;
    };
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    geometries.push(boxGeometry);
    const box = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
    ) => {
      const mesh = new THREE.Mesh(boxGeometry, mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(w, h, d);
      scene.add(mesh);
      return mesh;
    };
    const groundMat = material("#172a31");
    const roadMat = material("#21353b");
    const curbMat = material("#344c4d");
    const parkMat = material("#24564a");
    const trunkMat = material("#6c6250");
    const leafMat = material("#32735e");
    const goldMat = material("#cfb17b");
    const darkGold = material("#7b7153");
    const lightMat = new THREE.MeshBasicMaterial({ color: "#e6c486" });
    materials.push(lightMat);
    const worldExtent = Math.max(
      500,
      ...[...layout, ...plots].flatMap((b) => [
        Math.abs(b.x) * 2 + 100,
        Math.abs(b.z) * 2 + 100,
      ]),
    );
    box(0, -1.2, 0, worldExtent, 2, worldExtent, groundMat);
    const roadRadius = Math.ceil(worldExtent / 32);
    for (let n = -roadRadius; n <= roadRadius; n++) {
      box(n * 16 + 8, 0.05, 0, 3, 0.12, worldExtent, roadMat);
      box(0, 0.06, n * 16 + 8, worldExtent, 0.12, 3, roadMat);
      for (let p = -13; p <= 13; p++) {
        if (Math.abs(n) <= 6 && Math.abs(p) <= 6 && (n + p) % 7 === 0) {
          box(n * 16 + 5.8, 1.7, p * 16 + 5.8, 0.22, 3.4, 0.22, curbMat);
          box(n * 16 + 5.8, 3.5, p * 16 + 5.8, 0.7, 0.4, 0.7, lightMat);
        }
        if (Math.abs(n) <= 6 && Math.abs(p) <= 6 && n % 2 === 0)
          box(n * 16 + 8, 0.15, p * 16, 0.12, 0.03, 1.6, darkGold);
      }
    }
    box(0, 0.2, 0, 38, 0.4, 38, curbMat);
    box(0, 0.45, 0, 34, 0.2, 34, parkMat);
    // A chess plaza, deliberately distinct from Git City's developer monuments.
    for (let x = 0; x < 8; x++)
      for (let z = 0; z < 8; z++)
        box(
          (x - 3.5) * 2.8,
          0.65,
          (z - 3.5) * 2.8,
          2.8,
          0.14,
          2.8,
          (x + z) % 2 ? curbMat : goldMat,
        );
    const queenPoints = [
      [0, 0],
      [4.6, 0],
      [4.6, 1],
      [3.7, 1.6],
      [3.7, 2.4],
      [2.3, 3.2],
      [1.3, 10.2],
      [2.8, 11.7],
      [3.4, 12.4],
      [2.8, 13.5],
      [3.7, 15.4],
      [2.4, 14.7],
      [1.1, 16.6],
      [0, 15.4],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const queenGeo = new THREE.LatheGeometry(queenPoints, 12);
    geometries.push(queenGeo);
    const queen = new THREE.Mesh(queenGeo, goldMat);
    queen.position.y = 0.8;
    scene.add(queen);
    const treeGeo = new THREE.ConeGeometry(1.4, 5, 5);
    geometries.push(treeGeo);
    for (let index = 0; index < 72; index++) {
      const angle = index * 0.59;
      const radius = 20 + (index % 6) * 14;
      const x = Math.sin(angle) * radius,
        z = Math.cos(angle) * radius;
      // Keep trees out of the building footprints and road centres.
      const nx = ((x % 16) + 16) % 16,
        nz = ((z % 16) + 16) % 16;
      if ((nx > 5 && nx < 11) || (nz > 5 && nz < 11)) continue;
      box(x, 1, z, 0.45, 2, 0.45, trunkMat);
      const tree = new THREE.Mesh(treeGeo, leafMat);
      tree.position.set(x, 3.4, z);
      scene.add(tree);
    }
    const freePlots = plots.filter(
      (plot) =>
        !plot.ownerId && (plot.available === undefined || !!plot.available),
    );
    const plotGeo = new THREE.BoxGeometry(12, 0.15, 12);
    geometries.push(plotGeo);
    const plotMat = new THREE.MeshBasicMaterial({
      color: "#79e3ba",
      transparent: true,
      opacity: placing ? 0.3 : 0.06,
      depthWrite: false,
    });
    materials.push(plotMat);
    const plotMeshes = new THREE.InstancedMesh(
      plotGeo,
      plotMat,
      freePlots.length,
    );
    const plotTransform = new THREE.Object3D();
    freePlots.forEach((plot, index) => {
      plotTransform.position.set(plot.x, 0.5, plot.z);
      plotTransform.updateMatrix();
      plotMeshes.setMatrixAt(index, plotTransform.matrix);
    });
    plotMeshes.instanceMatrix.needsUpdate = true;
    scene.add(plotMeshes);
    const labelTextures: THREE.Texture[] = [];
    for (const community of NEIGHBORHOODS) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 96;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "rgba(10,30,36,.85)";
      context.fillRect(0, 0, 512, 96);
      context.fillStyle = community.color;
      context.font = "500 35px sans-serif";
      context.textAlign = "center";
      context.fillText(community.name.toUpperCase(), 256, 58);
      const texture = new THREE.CanvasTexture(canvas);
      labelTextures.push(texture);
      const labelMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      materials.push(labelMat);
      const sprite = new THREE.Sprite(labelMat);
      sprite.position.set(community.x, 5, community.z - 36);
      sprite.scale.set(40, 7.5, 1);
      scene.add(sprite);
    }
    const atlas = createWindowAtlas({
      face: "#172c38",
      windowOff: "#203d48",
      windowLit: ["#80d6c5", "#eed4a3", "#c5e6d1"],
    });
    const aRows = new Float32Array(layout.length),
      aCols = new Float32Array(layout.length);
    const aBand = new Float32Array(layout.length),
      aSeed = new Float32Array(layout.length),
      aAccent = new Float32Array(layout.length * 3);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometries.push(geometry);
    const matrix = new THREE.Object3D();
    const tint = new THREE.Color();
    const shader = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas },
        uDay: { value: daylight ? 1 : 0 },
        uFog: { value: new THREE.Color("#0a1826") },
      },
      vertexShader: `attribute float aBand;attribute float aSeed;attribute vec3 aAccent;attribute float aRows;attribute float aCols;
        varying vec2 vUv;varying vec3 vNormal;varying float vBand;varying float vSeed;varying vec3 vAccent;varying float vDepth;varying float vRows;varying float vCols;
        void main(){vUv=uv;vNormal=normal;vBand=aBand;vSeed=aSeed;vAccent=aAccent;vRows=aRows;vCols=aCols;
        vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.);vDepth=length(mv.xyz);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform sampler2D uAtlas;uniform float uDay;uniform vec3 uFog;
        varying vec2 vUv;varying vec3 vNormal;varying float vBand;varying float vSeed;varying vec3 vAccent;varying float vDepth;varying float vRows;varying float vCols;
        void main(){vec2 at=vec2(fract(vUv.x*vCols+vSeed), (vBand*10.+vUv.y*vRows)/64.);
        vec3 tex=texture2D(uAtlas,at).rgb;float lit=step(.24,max(tex.r,max(tex.g,tex.b)));
        vec3 base=mix(vec3(.095,.16,.2),vAccent*.45,.38);
        vec3 col=mix(base,tex*mix(vAccent,vec3(1.),.62)*1.65,lit);
        col*=vNormal.z>.5?1.:vNormal.x>.5?.68:.86;
        if(abs(vNormal.y)>.5)col=mix(vec3(.12,.21,.25),vAccent,.17);
        col=mix(col,col*1.35+vec3(.08),uDay);
        gl_FragColor=vec4(mix(col,uFog,smoothstep(360.,620.,vDepth)),1.);}`,
    });
    materials.push(shader);
    geometry.setAttribute(
      "aBand",
      new THREE.InstancedBufferAttribute(aBand, 1),
    );
    geometry.setAttribute(
      "aSeed",
      new THREE.InstancedBufferAttribute(aSeed, 1),
    );
    geometry.setAttribute(
      "aAccent",
      new THREE.InstancedBufferAttribute(aAccent, 3),
    );
    geometry.setAttribute(
      "aRows",
      new THREE.InstancedBufferAttribute(aRows, 1),
    );
    geometry.setAttribute(
      "aCols",
      new THREE.InstancedBufferAttribute(aCols, 1),
    );
    const roofGeometry = new THREE.BufferGeometry();
    roofGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 0.4, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5,
          0, 0.4, 0.5,
        ],
        3,
      ),
    );
    roofGeometry.setIndex([
      0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4,
    ]);
    roofGeometry.computeVertexNormals();
    geometries.push(roofGeometry);
    const roofMaterial = material("#b67d5e");
    roofMaterial.side = THREE.DoubleSide;
    const buildings = new THREE.InstancedMesh(geometry, shader, layout.length);
    buildings.frustumCulled = false;
    const decorations = new Map<string, THREE.Object3D[]>();
    layout.forEach((building, index) => {
      const decorationStart = scene.children.length;
      const { x, z, width, depth, height, player } = building;
      matrix.position.set(x, height / 2 + 0.5, z);
      matrix.scale.set(width, height, depth);
      matrix.updateMatrix();
      buildings.setMatrixAt(index, matrix.matrix);
      const stage = buildingStage({
        xp: player.buildingXp ?? 0,
        activeDays: player.activeDays ?? 0,
      }).index;
      aRows[index] = stage < 3 ? stage + 1 : 9;
      aCols[index] = (stage < 3 ? stage + 3 : 10) / 64;
      if (stage < 3) {
        const roofMesh = new THREE.Mesh(roofGeometry, roofMaterial);
        roofMesh.position.set(x, height + 0.5, z);
        roofMesh.scale.set(width + 0.8, 5, depth + 0.8);
        scene.add(roofMesh);
      }
      aBand[index] = building.band;
      aSeed[index] = (identitySeed(player.id) % 40) / 64;
      tint.set(COLORS[player.accent]);
      tint.toArray(aAccent, index * 3);
      box(x, 0.2, z, 12, 0.35, 12, curbMat);
      if (player.roof === "garden")
        box(x, height + 1, z, width * 0.8, 1, depth * 0.8, leafMat);
      else if (player.roof === "crown")
        for (let corner = 0; corner < 4; corner++)
          box(
            x + (corner % 2 ? 1 : -1) * width * 0.38,
            height + 2,
            z + (corner > 1 ? 1 : -1) * depth * 0.38,
            1.3,
            3,
            1.3,
            goldMat,
          );
      else if (stage >= 3) {
        box(x, height + 2, z, 0.25, 4, 0.25, curbMat);
        box(x, height + 4, z, 0.55, 0.55, 0.55, lightMat);
      }
      decorations.set(player.id, scene.children.slice(decorationStart));
    });
    buildings.instanceMatrix.needsUpdate = true;
    scene.add(buildings);
    const outlineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    geometries.push(outlineGeo);
    const outlineMat = new THREE.LineBasicMaterial({ color: "#a4ffe3" });
    materials.push(outlineMat);
    const outline = new THREE.LineSegments(outlineGeo, outlineMat);
    outline.visible = false;
    scene.add(outline);
    const beacon = new THREE.Group();
    beacon.visible = false;
    const beamGeo = new THREE.CylinderGeometry(1.8, 1.8, 130, 20, 1, true);
    geometries.push(beamGeo);
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec2 vUv;void main(){gl_FragColor=vec4(.4,1.,.8,.23*(1.-vUv.y));}",
    });
    materials.push(beamMat);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 65;
    beacon.add(beam);
    const ringGeo = new THREE.RingGeometry(5.7, 6, 48);
    geometries.push(ringGeo);
    const ringMat = new THREE.MeshBasicMaterial({
      color: "#9bffdd",
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    materials.push(ringMat);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.8;
    beacon.add(ring);
    scene.add(beacon);
    const ambient = new THREE.HemisphereLight("#abcbd9", "#14261e", 2.3);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight("#ffe0af", 2);
    sun.position.set(-60, 100, 40);
    scene.add(sun);
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPoint: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      downPoint = { x: event.clientX, y: event.clientY };
    };
    const up = (event: PointerEvent) => {
      if (
        !downPoint ||
        Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y) > 6
      ) {
        downPoint = null;
        return;
      }
      downPoint = null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      if (placing) {
        const plotHit = ray.intersectObject(plotMeshes)[0];
        if (plotHit?.instanceId !== undefined) {
          plotClickRef.current(freePlots[plotHit.instanceId]);
        }
        return;
      }
      const hit = ray.intersectObject(buildings)[0];
      if (hit?.instanceId !== undefined)
        clickRef.current(layout[hit.instanceId].player);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    let request = 0,
      last = 0,
      disposed = false;
    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      schedule();
    };
    const reducedMotion = matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let animations = events.slice(0, 12).map((event) => {
      let started = animationStarts.current.get(event.id);
      if (started === undefined) {
        started = Math.max(Date.now(), event.createdAt);
        animationStarts.current.set(event.id, started);
      }
      return {
        event,
        view: createCityAnimation(scene, event, started, reducedMotion),
        index: layout.findIndex((b) => b.player.id === event.playerId),
      };
    });
    if (animationStarts.current.size > 200) {
      const keep = new Set(events.map((e) => e.id));
      for (const id of animationStarts.current.keys())
        if (!keep.has(id)) animationStarts.current.delete(id);
    }
    const frame = (now: number) => {
      request = 0;
      if (document.hidden || disposed) return;
      if (now - last < 1000 / 30) {
        schedule();
        return;
      }
      last = now;
      controls.update();
      animations = animations.filter((animation) => {
        const state = animation.view.update(Date.now());
        if (animation.event.kind !== "demolition" && animation.index >= 0) {
          const b = layout[animation.index];
          const h =
            (animation.event.building.fromHeight ?? 0) * (1 - state.progress) +
            b.height * state.progress;
          matrix.position.set(b.x, h / 2 + 0.5, b.z);
          matrix.scale.set(b.width, Math.max(0.001, h), b.depth);
          matrix.updateMatrix();
          buildings.setMatrixAt(animation.index, matrix.matrix);
          buildings.instanceMatrix.needsUpdate = true;
          decorations
            .get(b.player.id)
            ?.forEach(
              (mesh) => (mesh.visible = state.done || state.progress > 0.94),
            );
        }
        if (state.done) {
          animation.view.dispose();
          return false;
        }
        return true;
      });
      renderer.render(scene, camera);
      if (animations.length) schedule();
    };
    function schedule() {
      if (!request && !document.hidden && !disposed)
        request = requestAnimationFrame(frame);
    }
    const change = () => schedule();
    controls.addEventListener("change", change);
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(request);
        request = 0;
      } else schedule();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    document.addEventListener("visibilitychange", visibility);
    api.current = {
      focus(id) {
        const building = layout.find((item) => item.player.id === id);
        if (!building) {
          outline.visible = false;
          beacon.visible = false;
          schedule();
          return;
        }
        outline.visible = true;
        beacon.visible = true;
        beacon.position.set(building.x, 0, building.z);
        outline.position.set(building.x, building.height / 2 + 0.5, building.z);
        outline.scale.set(
          building.width + 0.2,
          building.height + 0.3,
          building.depth + 0.2,
        );
        controls.target.set(building.x, building.height * 0.4, building.z);
        camera.position.set(
          building.x + 35,
          building.height + 32,
          building.z + 42,
        );
        schedule();
      },
      command(name) {
        if (name === "reset") {
          camera.position.set(225, 190, 250);
          controls.target.set(0, 12, 0);
        } else if (name === "zoomIn")
          camera.position.lerp(controls.target, 0.18);
        else if (name === "zoomOut")
          camera.position
            .sub(controls.target)
            .multiplyScalar(1.2)
            .add(controls.target);
        schedule();
      },
      theme(light) {
        scene.background = new THREE.Color(light ? "#8faaa9" : "#0a1826");
        scene.fog = new THREE.Fog(light ? "#8faaa9" : "#0a1826", 360, 650);
        shader.uniforms.uFog.value.set(light ? "#8faaa9" : "#0a1826");
        shader.uniforms.uDay.value = light ? 1 : 0;
        ambient.intensity = light ? 3 : 2.3;
        sun.intensity = light ? 3 : 2;
        renderer.toneMappingExposure = light ? 1.5 : 1.25;
        schedule();
      },
    };
    api.current.theme(daylight);
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(request);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      animations.forEach((animation) => animation.view.dispose());
      controls.dispose();
      atlas.dispose();
      labelTextures.forEach((texture) => texture.dispose());
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, [players, mode, plots, placing, events]);
  useEffect(
    () => api.current?.focus(selected),
    [selected, players, mode, plots, placing, events],
  );
  useEffect(() => api.current?.theme(daylight), [daylight]);
  useEffect(() => api.current?.command(command.name), [command]);
  return (
    <div
      className="city-viewport"
      ref={host}
      aria-label="Ciudad 3D de ajedrecistas"
    >
      {error && (
        <div className="webgl-error">
          <h2>La ciudad necesita WebGL 2</h2>
          <p>
            Activa la aceleración gráfica o prueba otro navegador. Puedes seguir
            buscando jugadores y consultando sus perfiles.
          </p>
        </div>
      )}
    </div>
  );
}
