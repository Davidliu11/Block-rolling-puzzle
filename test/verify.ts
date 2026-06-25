import { Block } from "../src/block";
import { BLOCK_TYPES, LEVELS_PER_BLOCK } from "../src/blocks";
import { Grid } from "../src/grid";
import { generateLevelsFor, generateLevelFor } from "../src/levels";
import { solve } from "../src/solver";
import type { Direction } from "../src/types";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error("  FAIL:", msg);
    failures++;
  }
}

// --- Roll physics sanity ----------------------------------------------------
console.log("Roll physics:");
const cube = new Block([{ x: 1, y: 1, z: 0 }]);
const rolled = cube.roll("east");
check(
  rolled.cells.length === 1 &&
    rolled.cells[0].x === 2 &&
    rolled.cells[0].y === 1 &&
    rolled.cells[0].z === 0,
  `cube east -> ${JSON.stringify(rolled.cells)}`
);

const domino = Block.fromFootprint([
  { x: 0, y: 0 },
  { x: 1, y: 0 },
]);
const up = domino.roll("east");
check(!up.isFlat() && up.footprintColumns().length === 1, "domino tips upright");
const flat = up.roll("east");
const cols = flat.footprintColumns().sort((a, b) => a.x - b.x);
check(
  flat.isFlat() && cols.length === 2 && cols[0].x === 3 && cols[1].x === 4,
  `domino flat again -> ${JSON.stringify(cols)}`
);

for (const d of ["east", "west", "north", "south"] as Direction[]) {
  const inv: Record<Direction, Direction> = {
    east: "west",
    west: "east",
    north: "south",
    south: "north",
  };
  const there = domino.roll(d);
  const back = there.roll(inv[d]);
  check(back.key() === domino.key(), `domino ${d} then ${inv[d]} round-trips`);
}

// --- Determinism ------------------------------------------------------------
console.log("Determinism:");
for (const block of BLOCK_TYPES) {
  const a = generateLevelFor(block, 0);
  const b = generateLevelFor(block, 0);
  check(
    JSON.stringify(a) === JSON.stringify(b),
    `${block.name} level 1 is deterministic`
  );
}

// --- All blocks: 20 solvable, difficulty-increasing levels ------------------
console.log("Block level generation:");
for (const block of BLOCK_TYPES) {
  const t0 = Date.now();
  const levels = generateLevelsFor(block);
  const ms = Date.now() - t0;
  check(levels.length === LEVELS_PER_BLOCK, `${block.name}: 20 levels`);

  let solvableAll = true;
  const steps: number[] = [];
  for (const lvl of levels) {
    const grid = new Grid(lvl);
    const res = solve(grid, grid.startBlock());
    if (!res || res.steps !== lvl.requiredSteps) solvableAll = false;
    steps.push(lvl.requiredSteps);
    let p = grid.startBlock();
    if (res) for (const m of res.moves) p = p.roll(m);
    if (res && !grid.isSolved(p)) solvableAll = false;
  }
  check(solvableAll, `${block.name}: all levels solvable & exact`);

  const firstHalf = steps.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const secondHalf = steps.slice(10).reduce((a, b) => a + b, 0) / 10;
  check(
    secondHalf > firstHalf,
    `${block.name}: difficulty increases (${firstHalf.toFixed(
      1
    )} -> ${secondHalf.toFixed(1)})`
  );
  console.log(
    `  OK ${block.name}: steps ${Math.min(...steps)}..${Math.max(
      ...steps
    )} in ${ms}ms`
  );
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
