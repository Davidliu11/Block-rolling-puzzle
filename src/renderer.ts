import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Block } from "./block";
import type { Grid } from "./grid";
import type { Direction } from "./types";

const COLORS = {
  sky: 0xbfe9ff,
  floor: 0xb7eccf,
  floorAlt: 0xfff3cf,
  barrier: 0xff9eb5,
  rock: 0x9aa0c8,
  snow: 0xffffff,
  cloud: 0xffffff,
  target: 0xffd6e8,
  targetEdge: 0xff5d99,
  block: 0x5ec8ff,
  blockEdge: 0x2a6f9e,
};

interface Season {
  sky: number;
  floor: number;
  floorAlt: number;
  rock: number;
  snow: number;
  cloud: number;
  target: number;
  targetEdge: number;
}

/** One theme per grade: 1 Spring, 2 Summer, 3 Autumn, 4 Winter. */
const SEASONS: Record<number, Season> = {
  // Spring — fresh greens, cherry-blossom pink, soft blue sky.
  1: {
    sky: 0xd2f1ff,
    floor: 0xbdeeb0,
    floorAlt: 0xeaf8cb,
    rock: 0x9aa0c8,
    snow: 0xffffff,
    cloud: 0xffffff,
    target: 0xffd6e8,
    targetEdge: 0xff5d99,
  },
  // Summer — lush grass, sunny sand, vivid sky.
  2: {
    sky: 0x8fdcff,
    floor: 0x86d96a,
    floorAlt: 0xf3e6a4,
    rock: 0x9aa0c8,
    snow: 0xffffff,
    cloud: 0xffffff,
    target: 0xfff0a8,
    targetEdge: 0xff9f1c,
  },
  // Autumn — amber and wheat, warm peach sky, brown peaks.
  3: {
    sky: 0xffe6c2,
    floor: 0xe8a85a,
    floorAlt: 0xf6cf8e,
    rock: 0x8a6f63,
    snow: 0xfff3e6,
    cloud: 0xfff3e6,
    target: 0xffd9a0,
    targetEdge: 0xc0532b,
  },
  // Winter — icy whites and frost blue, snowy peaks, pale sky.
  4: {
    sky: 0xdcefff,
    floor: 0xeaf4ff,
    floorAlt: 0xc9e4f5,
    rock: 0xb9c2d8,
    snow: 0xffffff,
    cloud: 0xffffff,
    target: 0xcfe9ff,
    targetEdge: 0x4aa6ff,
  },
};

const ROLL_MS = 180;

export class Renderer {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;

  private boardGroup = new THREE.Group();
  private blockGroup = new THREE.Group();

  private cubeGeo = new THREE.BoxGeometry(0.92, 0.92, 0.92);
  private cubeMat = new THREE.MeshStandardMaterial({
    color: COLORS.block,
    metalness: 0.0,
    roughness: 0.55,
  });
  private edgeMat = new THREE.LineBasicMaterial({ color: COLORS.blockEdge });

  private animating = false;
  private seasonGrade = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(COLORS.sky);
    this.scene.fog = new THREE.Fog(COLORS.sky, 22, 48);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 30;

    this.setupLights();
    this.scene.add(this.boardGroup);
    this.scene.add(this.blockGroup);

    window.addEventListener("resize", () => this.onResize());
    this.onResize();
    this.animate();
  }

  private setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcdeacb, 1.15));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dir = new THREE.DirectionalLight(0xfff7e6, 1.55);
    dir.position.set(6, 14, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    const d = 16;
    dir.shadow.camera.left = -d;
    dir.shadow.camera.right = d;
    dir.shadow.camera.top = d;
    dir.shadow.camera.bottom = -d;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 50;
    this.scene.add(dir);
  }

  /** Tint the rendered block (e.g. per block type). */
  setBlockColor(color: number) {
    this.cubeMat.color.setHex(color);
  }

  /**
   * Apply a seasonal theme by grade (1 Spring … 4 Winter). Updates the shared
   * palette and the sky/fog. Call before {@link loadGrid} so tiles, summits
   * and target pick up the new colours when they are rebuilt.
   */
  setSeason(grade: number) {
    const s = SEASONS[grade] ?? SEASONS[1];
    this.seasonGrade = grade;
    COLORS.sky = s.sky;
    COLORS.floor = s.floor;
    COLORS.floorAlt = s.floorAlt;
    COLORS.rock = s.rock;
    COLORS.snow = s.snow;
    COLORS.cloud = s.cloud;
    COLORS.target = s.target;
    COLORS.targetEdge = s.targetEdge;
    this.scene.background = new THREE.Color(s.sky);
    (this.scene.fog as THREE.Fog).color.setHex(s.sky);
  }

  /** Build the static board (floor, barriers, target) for a grid. */
  loadGrid(grid: Grid, block: Block) {
    this.disposeGroup(this.boardGroup);

    const { width: w, height: h } = grid;

    // Floor tiles.
    const tileGeo = new THREE.BoxGeometry(0.98, 0.3, 0.98);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const isBarrier = grid.isBarrier({ x, y });
        const isTarget = grid.isTargetCell({ x, y });
        let color = (x + y) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
        if (isTarget) color = COLORS.target;
        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.95,
          metalness: 0.0,
        });
        const tile = new THREE.Mesh(tileGeo, mat);
        tile.position.set(x + 0.5, -0.15, y + 0.5);
        tile.receiveShadow = true;
        this.boardGroup.add(tile);

        if (isTarget) {
          const ring = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(0.99, 0.32, 0.99)),
            new THREE.LineBasicMaterial({ color: COLORS.targetEdge })
          );
          ring.position.copy(tile.position);
          this.boardGroup.add(ring);
        }

        if (isBarrier) {
          const summit = this.makeSummit(x, y);
          summit.position.set(x + 0.5, 0, y + 0.5);
          this.boardGroup.add(summit);
        }
      }
    }

    // A winding river meandering across the board (frozen to ice in winter).
    // this.boardGroup.add(this.makeRiver(w, h));

    // Centre the controls/camera on the board.
    this.controls.target.set(w / 2, 0, h / 2);
    this.camera.position.set(w / 2, Math.max(w, h) * 1.1, h * 1.35);
    this.controls.update();

    this.setBlock(block);
  }

  /** Build a winding S-shaped river with a tributary; ice when winter. */
  private makeRiver(w: number, h: number): THREE.Group {
    const group = new THREE.Group();
    const isWinter = this.seasonGrade === 4;

    const mat = isWinter
      ? new THREE.MeshStandardMaterial({
          color: 0xdaf0ff,
          roughness: 0.12,
          metalness: 0.0,
          transparent: true,
          opacity: 0.94,
          emissive: 0xbfe4ff,
          emissiveIntensity: 0.16,
        })
      : new THREE.MeshStandardMaterial({
          color: 0x53b9ff,
          roughness: 0.22,
          metalness: 0.0,
          transparent: true,
          opacity: 0.82,
        });

    const toWorld = (u: number, v: number) =>
      new THREE.Vector3(u * w, 0, v * h);

    // Main channel: top-left, curving down with an S, off the bottom edge.
    const main = new THREE.CatmullRomCurve3(
      ([
        [0.18, 0],
        [0.26, 0.16],
        [0.30, 0.31],
        [0.34, 0.47],
        [0.42, 0.63],
        [0.46, 0.81],
        [0.47, 1],
      ] as [number, number][]).map(([u, v]) => toWorld(u, v))
    );

    // Tributary: branches off the main channel toward the bottom-right.
    const trib = new THREE.CatmullRomCurve3(
      ([
        [0.37, 0.50],
        [0.55, 0.55],
        [0.70, 0.62],
        [0.82, 0.74],
        [0.93, 0.90],
        [1, 1],
      ] as [number, number][]).map(([u, v]) => toWorld(u, v))
    );

    group.add(new THREE.Mesh(this.buildRibbon(main, 0.2), mat));
    group.add(new THREE.Mesh(this.buildRibbon(trib, 0.17), mat));

    group.position.y = 0.02;
    for (const child of group.children) {
      (child as THREE.Mesh).receiveShadow = true;
      (child as THREE.Mesh).renderOrder = 1;
    }
    return group;
  }

  /** Flat ribbon geometry following a curve in the XZ plane (normals up). */
  private buildRibbon(
    curve: THREE.Curve<THREE.Vector3>,
    width: number
  ): THREE.BufferGeometry {
    const segments = 90;
    const pts = curve.getPoints(segments);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const hw = width / 2;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      // Tangent in XZ, then its left-hand perpendicular.
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      const nx = tz;
      const nz = -tx;
      const p = pts[i];
      positions.push(p.x + nx * hw, 0, p.z + nz * hw);
      positions.push(p.x - nx * hw, 0, p.z - nz * hw);
      normals.push(0, 1, 0, 0, 1, 0);
      const v = i / (pts.length - 1);
      uvs.push(0, v, 1, v);
    }
    const indices: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  /** Build a cute low-poly snow-capped summit ringed by puffy clouds. */
  private makeSummit(x: number, y: number): THREE.Group {
    const group = new THREE.Group();

    // Deterministic per-tile pseudo-random so re-renders stay stable.
    let seed = (x * 73856093) ^ (y * 19349663);
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const height = 1.35 + rand() * 0.35;
    const radius = 0.5;
    const spin = rand() * Math.PI;

    // Rocky mountain body.
    const rockGeo = new THREE.ConeGeometry(radius, height, 6);
    const rockMat = new THREE.MeshStandardMaterial({
      color: COLORS.rock,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
    });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.y = height / 2;
    rock.rotation.y = spin;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);

    // Snow cap: a slightly larger coincident cone covering the top third.
    const capFrac = 0.42;
    const capGeo = new THREE.ConeGeometry(
      radius * capFrac * 1.06,
      height * capFrac,
      6
    );
    const snowMat = new THREE.MeshStandardMaterial({
      color: COLORS.snow,
      roughness: 0.85,
      metalness: 0.0,
      flatShading: true,
    });
    const cap = new THREE.Mesh(capGeo, snowMat);
    // Align the cap's apex with the mountain's apex.
    cap.position.y = height - (height * capFrac) / 2;
    cap.rotation.y = spin;
    cap.castShadow = true;
    group.add(cap);

    // Puffy clouds drifting around the mid-slopes. Each summit gets its own
    // "weather": how many clouds, and how thick/thin they are.
    const cloudMat = new THREE.MeshStandardMaterial({
      color: COLORS.cloud,
      roughness: 1.0,
      metalness: 0.0,
      emissive: 0xffffff,
      emissiveIntensity: 0.18,
    });
    // 2..6 puffs, and a per-summit thickness 0.42 (wispy) .. 0.78 (fluffy).
    const puffCount = 2 + Math.floor(rand() * 5);
    const thickness = 0.42 + rand() * 0.36;
    const spread = 0.9 + rand() * 0.5;
    for (let i = 0; i < puffCount; i++) {
      const angle = (i / puffCount) * Math.PI * 2 + rand() * 0.7;
      const dist = 0.42 + rand() * 0.18;
      const cy = height * (0.32 + rand() * 0.3);
      const puff = new THREE.Group();
      const blobs = 2 + Math.floor(rand() * 4);
      for (let b = 0; b < blobs; b++) {
        const r = (0.13 + rand() * 0.16) * spread;
        const blob = new THREE.Mesh(
          new THREE.SphereGeometry(r, 10, 8),
          cloudMat
        );
        // Flatten and widen so puffs read as soft clouds, not balls.
        blob.scale.set(1.2 + rand() * 0.3, thickness, 1.0 + rand() * 0.2);
        blob.position.set(
          (b - (blobs - 1) / 2) * 0.2 + (rand() - 0.5) * 0.06,
          (rand() - 0.5) * 0.05,
          (rand() - 0.5) * 0.07
        );
        puff.add(blob);
      }
      puff.position.set(Math.cos(angle) * dist, cy, Math.sin(angle) * dist);
      puff.lookAt(0, cy, 0);
      group.add(puff);
    }

    return group;
  }
  setBlock(block: Block) {
    this.disposeGroup(this.blockGroup);
    this.blockGroup.position.set(0, 0, 0);
    this.blockGroup.rotation.set(0, 0, 0);
    for (const c of block.cells) {
      const mesh = new THREE.Mesh(this.cubeGeo, this.cubeMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // world: x -> x, height z -> y, row y -> z
      mesh.position.set(c.x + 0.5, c.z + 0.5, c.y + 0.5);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(this.cubeGeo),
        this.edgeMat
      );
      edges.position.copy(mesh.position);
      this.blockGroup.add(mesh);
      this.blockGroup.add(edges);
    }
  }

  get isAnimating() {
    return this.animating;
  }

  /** Animate a single roll, then snap to the resulting state. */
  rollTo(from: Block, dir: Direction, to: Block): Promise<void> {
    return new Promise((resolve) => {
      if (this.animating) {
        this.setBlock(to);
        resolve();
        return;
      }
      this.animating = true;

      const bottom = from.cells.filter((c) => c.z === 0);
      const pivot = new THREE.Group();
      let axis: "x" | "z";
      let sign: number;

      switch (dir) {
        case "east": {
          const x0 = Math.max(...bottom.map((c) => c.x)) + 1;
          pivot.position.set(x0, 0, 0);
          axis = "z";
          sign = -1;
          break;
        }
        case "west": {
          const x0 = Math.min(...bottom.map((c) => c.x));
          pivot.position.set(x0, 0, 0);
          axis = "z";
          sign = 1;
          break;
        }
        case "north": {
          const y0 = Math.max(...bottom.map((c) => c.y)) + 1;
          pivot.position.set(0, 0, y0);
          axis = "x";
          sign = 1;
          break;
        }
        case "south": {
          const y0 = Math.min(...bottom.map((c) => c.y));
          pivot.position.set(0, 0, y0);
          axis = "x";
          sign = -1;
          break;
        }
      }

      this.scene.add(pivot);
      pivot.attach(this.blockGroup);

      const target = (sign * Math.PI) / 2;
      const start = performance.now();
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / ROLL_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        const angle = target * eased;
        if (axis === "z") pivot.rotation.z = angle;
        else pivot.rotation.x = angle;

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          this.scene.attach(this.blockGroup);
          this.scene.remove(pivot);
          this.setBlock(to);
          this.animating = false;
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private disposeGroup(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      // Recurse into nested groups (e.g. summit mountains + clouds).
      if (child instanceof THREE.Group) {
        this.disposeGroup(child);
        continue;
      }
      const mesh = child as THREE.Mesh;
      if (mesh.geometry && mesh.geometry !== this.cubeGeo) {
        mesh.geometry.dispose();
      }
      const mat = (mesh as THREE.Mesh).material;
      if (
        mat &&
        mat !== this.cubeMat &&
        mat !== this.edgeMat &&
        !Array.isArray(mat)
      ) {
        (mat as THREE.Material).dispose();
      }
    }
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
