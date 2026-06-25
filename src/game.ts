import { Block } from "./block";
import { BLOCK_TYPES, LEVELS_PER_BLOCK, type BlockType } from "./blocks";
import { Grid } from "./grid";
import { generateLevelsFor } from "./levels";
import { Progress } from "./progress";
import { Renderer } from "./renderer";
import { solve } from "./solver";
import type { Direction, Level } from "./types";

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: "south",
  ArrowDown: "north",
  ArrowLeft: "west",
  ArrowRight: "east",
  w: "south",
  s: "north",
  a: "west",
  d: "east",
  W: "south",
  S: "north",
  A: "west",
  D: "east",
};

type Screen = "menu" | "levels" | "game";

export class Game {
  private renderer: Renderer;
  private progress = new Progress();

  // Per-block generated level cache.
  private levelCache = new Map<string, Level[]>();

  // Active play state.
  private block!: BlockType;
  private levelIndex = 0;
  private grid!: Grid;
  private level!: Level;
  private piece!: Block;
  private history: Block[] = [];
  private steps = 0;
  private won = false;
  private screen: Screen = "menu";

  // Screens
  private elMenu = document.getElementById("menu-screen")!;
  private elLevels = document.getElementById("levels-screen")!;
  private elGame = document.getElementById("game-ui")!;
  private elLoading = document.getElementById("loading")!;
  private elModal = document.getElementById("modal-overlay")!;

  // Game HUD
  private elStepsUsed = document.getElementById("steps-used")!;
  private elStepsReq = document.getElementById("steps-required")!;
  private elStatus = document.getElementById("status")!;
  private elGameLevelName = document.getElementById("game-level-name")!;

  // Level select
  private elBlockCards = document.getElementById("block-cards")!;
  private elLevelGrid = document.getElementById("level-grid")!;
  private elLevelsBlockName = document.getElementById("levels-block-name")!;
  private elLevelsProgress = document.getElementById("levels-progress")!;

  // Modal
  private elModalSub = document.getElementById("modal-sub")!;
  private elModalNext = document.getElementById("modal-next") as HTMLButtonElement;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.buildMenu();
    this.bindGameControls();
    this.bindNav();
    this.showScreen("menu");
  }

  // ----------------------------- Screens ------------------------------

  private showScreen(screen: Screen) {
    this.screen = screen;
    this.elMenu.classList.toggle("hidden", screen !== "menu");
    this.elLevels.classList.toggle("hidden", screen !== "levels");
    this.elGame.classList.toggle("hidden", screen !== "game");
  }

  // ------------------------------ Menu --------------------------------

  private buildMenu() {
    this.elBlockCards.innerHTML = "";
    for (const block of BLOCK_TYPES) {
      this.elBlockCards.appendChild(this.makeBlockCard(block));
    }
  }

  private makeBlockCard(block: BlockType): HTMLElement {
    const done = this.progress.countCompleted(block.id);
    const card = document.createElement("div");
    card.className = "block-card";
    card.style.setProperty("--card-color", block.cssColor);

    const preview = this.shapePreview(block);

    card.innerHTML = `
      <div class="card-grade">GRADE ${block.grade}</div>
      ${preview}
      <div class="card-name">${block.name}</div>
      <div class="card-diff">${block.difficulty}</div>
      <div class="card-bar"><span style="width:${(done / LEVELS_PER_BLOCK) * 100}%"></span></div>
      <div class="card-progress">${done} / ${LEVELS_PER_BLOCK} cleared</div>
    `;
    card.addEventListener("click", () => this.selectBlock(block));
    return card;
  }

  private shapePreview(block: BlockType): string {
    const maxX = Math.max(...block.footprint.map((c) => c.x));
    const maxY = Math.max(...block.footprint.map((c) => c.y));
    const filled = new Set(block.footprint.map((c) => `${c.x},${c.y}`));
    let cells = "";
    for (let y = 0; y <= maxY; y++) {
      for (let x = 0; x <= maxX; x++) {
        const on = filled.has(`${x},${y}`) ? "on" : "";
        cells += `<div class="card-cell ${on}"></div>`;
      }
    }
    return `<div class="card-preview" style="grid-template-columns:repeat(${
      maxX + 1
    }, 18px)">${cells}</div>`;
  }

  // -------------------------- Level select ----------------------------

  private selectBlock(block: BlockType) {
    this.block = block;
    if (this.levelCache.has(block.id)) {
      this.openLevelSelect(block);
      return;
    }
    // Generating 20 levels can take a moment — show a loader first.
    this.elLoading.classList.remove("hidden");
    setTimeout(() => {
      const levels = generateLevelsFor(block);
      this.levelCache.set(block.id, levels);
      this.elLoading.classList.add("hidden");
      this.openLevelSelect(block);
    }, 30);
  }

  private openLevelSelect(block: BlockType) {
    this.block = block;
    this.elLevelsBlockName.textContent = `${block.name} · Grade ${block.grade}`;
    this.elLevelsBlockName.style.color = block.cssColor;
    this.elLevelsProgress.textContent = `${this.progress.countCompleted(
      block.id
    )} / ${LEVELS_PER_BLOCK}`;
    this.elLevels.style.setProperty("--card-color", block.cssColor);

    this.elLevelGrid.innerHTML = "";
    for (let i = 0; i < LEVELS_PER_BLOCK; i++) {
      const unlocked = this.progress.isUnlocked(block.id, i);
      const completed = this.progress.isCompleted(block.id, i);
      const btn = document.createElement("button");
      btn.className = `level-btn${unlocked ? "" : " locked"}${
        completed ? " completed" : ""
      }`;
      btn.innerHTML = unlocked
        ? `${i + 1}${completed ? '<span class="check">✓</span>' : ""}`
        : "🔒";
      if (unlocked) btn.addEventListener("click", () => this.startLevel(i));
      this.elLevelGrid.appendChild(btn);
    }
    this.showScreen("levels");
  }

  // ------------------------------ Play --------------------------------

  private levels(): Level[] {
    return this.levelCache.get(this.block.id)!;
  }

  private startLevel(index: number) {
    this.levelIndex = index;
    this.level = this.levels()[index];
    this.grid = new Grid(this.level);
    this.piece = this.grid.startBlock();
    this.history = [];
    this.steps = 0;
    this.won = false;

    this.renderer.setBlockColor(this.block.color);
    this.renderer.setSeason(this.block.grade);
    this.renderer.loadGrid(this.grid, this.piece);

    this.elGameLevelName.textContent = `${this.block.name} · Level ${index + 1}`;
    this.elModal.classList.add("hidden");
    this.updateHud();
    this.setStatus("", "");
    this.showScreen("game");
  }

  private async move(dir: Direction) {
    if (this.screen !== "game" || this.won || this.renderer.isAnimating) return;
    const next = this.piece.roll(dir);
    if (!this.grid.isLegal(next)) {
      this.setStatus("BLOCKED", "bad");
      return;
    }
    this.history.push(this.piece);
    const from = this.piece;
    this.piece = next;
    this.steps++;
    await this.renderer.rollTo(from, dir, next);
    this.updateHud();
    this.checkWin();
  }

  private undo() {
    if (this.won || this.renderer.isAnimating || this.history.length === 0)
      return;
    this.piece = this.history.pop()!;
    this.steps--;
    this.renderer.setBlock(this.piece);
    this.updateHud();
    this.setStatus("", "");
  }

  private restart() {
    this.startLevel(this.levelIndex);
  }

  private checkWin() {
    if (!this.grid.isSolved(this.piece)) {
      if (this.steps >= this.level.requiredSteps) {
        this.setStatus("OUT OF STEPS · RESET", "bad");
      }
      return;
    }
    if (this.steps === this.level.requiredSteps) {
      this.won = true;
      this.setStatus("SOLVED! ✦", "good");
      this.progress.markCompleted(this.block.id, this.levelIndex);
      setTimeout(() => this.showModal(), 450);
    } else if (this.steps < this.level.requiredSteps) {
      this.setStatus(
        `ON TARGET — need exactly ${this.level.requiredSteps}`,
        "info"
      );
    } else {
      this.setStatus("TOO MANY STEPS · RESET", "bad");
    }
  }

  private hint() {
    if (this.won || this.renderer.isAnimating) return;
    const result = solve(this.grid, this.piece);
    if (!result || result.moves.length === 0) {
      this.setStatus("NO SOLUTION FROM HERE", "bad");
      return;
    }
    const remaining = this.level.requiredSteps - this.steps;
    if (result.steps > remaining) {
      this.setStatus("CAN'T FINISH IN TIME · RESET", "bad");
      return;
    }
    this.setStatus(`HINT → ${result.moves[0].toUpperCase()}`, "info");
  }

  // ------------------------------ Modal -------------------------------

  private showModal() {
    const isLast = this.levelIndex >= LEVELS_PER_BLOCK - 1;
    this.elModalSub.textContent = isLast
      ? `You cleared every ${this.block.name} level!`
      : `Solved in exactly ${this.level.requiredSteps} steps.`;
    this.elModalNext.disabled = isLast;
    this.elModalNext.textContent = isLast ? "ALL CLEARED" : "NEXT LEVEL ›";
    this.elModal.classList.remove("hidden");
  }

  private bindNav() {
    document.getElementById("levels-back")!.addEventListener("click", () => {
      this.buildMenu();
      this.showScreen("menu");
    });
    document.getElementById("game-back")!.addEventListener("click", () =>
      this.openLevelSelect(this.block)
    );
    document.getElementById("game-menu")!.addEventListener("click", () => {
      this.buildMenu();
      this.showScreen("menu");
    });

    document.getElementById("modal-next")!.addEventListener("click", () => {
      this.elModal.classList.add("hidden");
      if (this.levelIndex < LEVELS_PER_BLOCK - 1) {
        this.startLevel(this.levelIndex + 1);
      }
    });
    document.getElementById("modal-replay")!.addEventListener("click", () => {
      this.elModal.classList.add("hidden");
      this.restart();
    });
    document.getElementById("modal-menu")!.addEventListener("click", () => {
      this.elModal.classList.add("hidden");
      this.openLevelSelect(this.block);
    });
  }

  private bindGameControls() {
    document
      .getElementById("btn-reset")!
      .addEventListener("click", () => this.restart());
    document
      .getElementById("btn-undo")!
      .addEventListener("click", () => this.undo());
    document
      .getElementById("btn-hint")!
      .addEventListener("click", () => this.hint());

    for (const btn of document.querySelectorAll<HTMLButtonElement>(".pad-btn")) {
      btn.addEventListener("click", () =>
        this.move(btn.dataset.dir as Direction)
      );
    }

    window.addEventListener("keydown", (e) => {
      if (this.screen !== "game") return;
      if (!this.elModal.classList.contains("hidden")) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        this.undo();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        this.restart();
        return;
      }
      if (e.key === "h" || e.key === "H") {
        this.hint();
        return;
      }
      const dir = KEY_TO_DIR[e.key];
      if (dir) {
        e.preventDefault();
        this.move(dir);
      }
    });
  }

  private updateHud() {
    this.elStepsUsed.textContent = String(this.steps);
    this.elStepsReq.textContent = String(this.level.requiredSteps);
  }

  private setStatus(text: string, kind: "" | "good" | "bad" | "info") {
    this.elStatus.textContent = text;
    this.elStatus.className = `status ${kind}`;
  }
}
