import { Block } from "./block";
import type { BlockType } from "./blocks";
import { LEVELS_PER_BLOCK } from "./blocks";
import { Grid } from "./grid";
import { hashSeed, mulberry32 } from "./rng";
import { DIRECTIONS, type Cell2D, type Direction, type Level } from "./types";

const W = 7;
const H = 8;

type Rng = () => number;

function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

function pick<T>(rng: Rng, arr: T[]): T {
  return arr[randInt(rng, arr.length)];
}

function inBounds(c: Cell2D): boolean {
  return c.x >= 0 && c.x < W && c.y >= 0 && c.y < H;
}

function translate(cells: Cell2D[], dx: number, dy: number): Cell2D[] {
  return cells.map((c) => ({ x: c.x + dx, y: c.y + dy }));
}

/** Difficulty band (in BFS steps) for a level index 0..19. */
function targetSteps(index: number): { min: number; max: number } {
  const min = 2 + index; // level 1 ~ 2 steps, level 20 ~ 21 steps
  return { min, max: min + 6 };
}

function barrierBudget(index: number): number {
  return Math.min(2 + Math.floor(index / 2), 12);
}

/** A reachable flat resting place and its exact minimum step distance. */
interface FlatTarget {
  footprint: Cell2D[];
  steps: number;
}

/**
 * BFS flood from `start`, returning every reachable FLAT state (other than the
 * start) together with its exact minimum number of rolls. Exploration is capped
 * at `maxDepth` since deeper targets are never wanted.
 */
function exploreFlatTargets(
  grid: Grid,
  start: Block,
  maxDepth: number
): FlatTarget[] {
  const visited = new Set<string>([start.key()]);
  let frontier: Block[] = [start];
  const out: FlatTarget[] = [];

  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const nextFrontier: Block[] = [];
    for (const cur of frontier) {
      for (const dir of DIRECTIONS) {
        const next = cur.roll(dir);
        if (!grid.isLegal(next)) continue;
        const k = next.key();
        if (visited.has(k)) continue;
        visited.add(k);
        if (next.isFlat()) {
          out.push({ footprint: next.footprintColumns(), steps: depth });
        }
        nextFrontier.push(next);
      }
    }
    frontier = nextFrontier;
  }
  return out;
}

/**
 * Deterministically generate level `index` (0-based) for a block type.
 * The same (block, index) always produces the same puzzle.
 */
export function generateLevelFor(block: BlockType, index: number): Level {
  const baseSeed = hashSeed(`${block.id}:${index}`);
  const band = targetSteps(index);

  let best: Level | null = null;
  let bestSteps = -1;

  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = mulberry32((baseSeed + attempt * 2654435761) >>> 0);
    const candidate = tryGenerate(block, index, band, rng);
    if (!candidate) continue;

    if (candidate.requiredSteps >= band.min && candidate.requiredSteps <= band.max) {
      return candidate;
    }
    // Fallback: keep the hardest level we have seen so far.
    if (candidate.requiredSteps > bestSteps) {
      bestSteps = candidate.requiredSteps;
      best = candidate;
    }
  }

  return best ?? trivialLevel(block, index);
}

/** Generate all 20 levels for a block (deterministic, cacheable). */
export function generateLevelsFor(block: BlockType): Level[] {
  const levels: Level[] = [];
  for (let i = 0; i < LEVELS_PER_BLOCK; i++) {
    levels.push(generateLevelFor(block, i));
  }
  return levels;
}

function tryGenerate(
  block: BlockType,
  index: number,
  band: { min: number; max: number },
  rng: Rng
): Level | null {
  const barrierCount = barrierBudget(index);
  const barrierSet = new Set<string>();
  const barriers: Cell2D[] = [];
  while (barriers.length < barrierCount) {
    const c = { x: randInt(rng, W), y: randInt(rng, H) };
    const k = `${c.x},${c.y}`;
    if (!barrierSet.has(k)) {
      barrierSet.add(k);
      barriers.push(c);
    }
  }

  // Place the start shape on clear ground.
  let start: Cell2D[] | null = null;
  for (let i = 0; i < 80; i++) {
    const dx = randInt(rng, W);
    const dy = randInt(rng, H);
    const placed = translate(block.footprint, dx, dy);
    if (placed.every((c) => inBounds(c) && !barrierSet.has(`${c.x},${c.y}`))) {
      start = placed;
      break;
    }
  }
  if (!start) return null;

  const level: Level = {
    id: `${block.id}-${index}`,
    name: `Level ${index + 1}`,
    width: W,
    height: H,
    barriers,
    start,
    target: start,
    requiredSteps: 0,
  };
  const grid = new Grid(level);

  const targets = exploreFlatTargets(grid, grid.startBlock(), band.max);
  if (targets.length === 0) return null;

  const inBand = targets.filter(
    (t) => t.steps >= band.min && t.steps <= band.max
  );

  let chosen: FlatTarget;
  if (inBand.length) {
    // Pick from the easier end of the band for a smooth difficulty curve;
    // the band's minimum already rises with the level index.
    inBand.sort((a, b) => a.steps - b.steps);
    const easy = inBand.slice(0, Math.max(1, Math.ceil(inBand.length / 3)));
    chosen = pick(rng, easy);
  } else {
    // Band unreachable on this map — take the hardest target available.
    targets.sort((a, b) => b.steps - a.steps);
    chosen = targets[0];
  }

  level.target = chosen.footprint;
  level.requiredSteps = chosen.steps;
  return level;
}

/** Last-resort guaranteed level: roll the block a couple of times. */
function trivialLevel(block: BlockType, index: number): Level {
  const start = translate(block.footprint, 1, 1);
  let b = Block.fromFootprint(start);
  const moves: Direction[] = ["east", "north"];
  for (const m of moves) {
    const next = b.roll(m);
    if (next.footprintColumns().every((c) => inBounds(c))) b = next;
  }
  return {
    id: `${block.id}-${index}`,
    name: `Level ${index + 1}`,
    width: W,
    height: H,
    barriers: [],
    start,
    target: b.footprintColumns(),
    requiredSteps: Math.max(2, moves.length),
  };
}
