import { Block } from "./block";
import type { Grid } from "./grid";
import { DIRECTIONS, type Direction } from "./types";

export interface SolveResult {
  /** Sequence of moves from the given start to a solved state. */
  moves: Direction[];
  /** Length of that sequence (the minimum number of rolls). */
  steps: number;
}

/**
 * Breadth-first search over block placements. Every roll costs 1, so BFS
 * yields the true minimum number of rolls to reach a solved state.
 */
export function solve(grid: Grid, start: Block): SolveResult | null {
  if (grid.isSolved(start)) return { moves: [], steps: 0 };

  const startKey = start.key();
  const visited = new Set<string>([startKey]);
  const queue: Block[] = [start];
  // Track how we reached each state to reconstruct the path.
  const parent = new Map<string, { prev: string; dir: Direction }>();

  while (queue.length) {
    const current = queue.shift()!;
    const curKey = current.key();

    for (const dir of DIRECTIONS) {
      const next = current.roll(dir);
      if (!grid.isLegal(next)) continue;

      const nextKey = next.key();
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      parent.set(nextKey, { prev: curKey, dir });

      if (grid.isSolved(next)) {
        const moves = reconstruct(parent, startKey, nextKey);
        return { moves, steps: moves.length };
      }
      queue.push(next);
    }
  }

  return null;
}

function reconstruct(
  parent: Map<string, { prev: string; dir: Direction }>,
  startKey: string,
  endKey: string
): Direction[] {
  const moves: Direction[] = [];
  let k = endKey;
  while (k !== startKey) {
    const step = parent.get(k)!;
    moves.push(step.dir);
    k = step.prev;
  }
  moves.reverse();
  return moves;
}
