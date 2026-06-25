import { Block } from "./block";
import type { Cell2D, Level } from "./types";

/** Runtime wrapper around a Level providing fast lookups + rules. */
export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly barrierSet: Set<string>;
  private readonly targetSet: Set<string>;

  constructor(readonly level: Level) {
    this.width = level.width;
    this.height = level.height;
    this.barrierSet = new Set(level.barriers.map((c) => key2d(c)));
    this.targetSet = new Set(level.target.map((c) => key2d(c)));
  }

  inBounds(c: Cell2D): boolean {
    return c.x >= 0 && c.x < this.width && c.y >= 0 && c.y < this.height;
  }

  isBarrier(c: Cell2D): boolean {
    return this.barrierSet.has(key2d(c));
  }

  isTargetCell(c: Cell2D): boolean {
    return this.targetSet.has(key2d(c));
  }

  /** A block placement is legal when every occupied column is on the board
   *  and clear of barriers. */
  isLegal(block: Block): boolean {
    for (const col of block.footprintColumns()) {
      if (!this.inBounds(col) || this.isBarrier(col)) return false;
    }
    return true;
  }

  /** Win = block lies flat and its footprint is exactly the target cells. */
  isSolved(block: Block): boolean {
    if (!block.isFlat()) return false;
    const cols = block.footprintColumns();
    if (cols.length !== this.targetSet.size) return false;
    return cols.every((c) => this.isTargetCell(c));
  }

  startBlock(): Block {
    return Block.fromFootprint(this.level.start);
  }
}

export function key2d(c: Cell2D): string {
  return `${c.x},${c.y}`;
}
