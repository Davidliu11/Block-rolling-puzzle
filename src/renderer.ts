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
  target: 0xffd6e8,
  targetEdge: 0xff5d99,
  block: 0x5ec8ff,
  blockEdge: 0x2a6f9e,
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
          const barGeo = new THREE.BoxGeometry(0.9, 1.2, 0.9);
          const barMat = new THREE.MeshStandardMaterial({
            color: COLORS.barrier,
            roughness: 0.6,
            metalness: 0.1,
          });
          const bar = new THREE.Mesh(barGeo, barMat);
          bar.position.set(x + 0.5, 0.6, y + 0.5);
          bar.castShadow = true;
          bar.receiveShadow = true;
          this.boardGroup.add(bar);
        }
      }
    }

    // Centre the controls/camera on the board.
    this.controls.target.set(w / 2, 0, h / 2);
    this.camera.position.set(w / 2, Math.max(w, h) * 1.1, h * 1.35);
    this.controls.update();

    this.setBlock(block);
  }

  /** Snap the rendered block to a logical state (no animation). */
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
