import type { Cell, Cell2D, Direction } from "./types";

/**
 * The block is a rigid set of unit cubes. A "roll" rotates the whole set 90°
 * about its supporting bottom edge in one of four directions, so a flat tile
 * tumbles up onto its end, a tall stack topples down, etc.
 *
 * Coordinates are integer cube indices. The cube at (x,y,z) occupies the
 * region [x,x+1] x [y,y+1] x [z,z+1]; its centre is (x+0.5, y+0.5, z+0.5).
 */
export class Block {
  readonly cells: Cell[];

  constructor(cells: Cell[]) {
    // Store a normalized copy (sorted) so equality/keys are stable.
    this.cells = cells
      .map((c) => ({ ...c }))
      .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  }

  /** Build a flat block (all z = 0) from a 2D footprint. */
  static fromFootprint(footprint: Cell2D[]): Block {
    return new Block(footprint.map((c) => ({ x: c.x, y: c.y, z: 0 })));
  }

  /** Canonical string key for the solver's visited set. */
  key(): string {
    return this.cells.map((c) => `${c.x},${c.y},${c.z}`).join("|");
  }

  /** Columns (x,y) the block occupies on the floor plan. */
  footprintColumns(): Cell2D[] {
    const seen = new Set<string>();
    const out: Cell2D[] = [];
    for (const c of this.cells) {
      const k = `${c.x},${c.y}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ x: c.x, y: c.y });
      }
    }
    return out;
  }

  /** True when every cube sits in the floor layer (z === 0). */
  isFlat(): boolean {
    return this.cells.every((c) => c.z === 0);
  }

  /**
   * Roll the block one step in a direction, returning a NEW Block.
   * The pivot is the bottom edge of the floor-contact footprint on that side.
   */
  roll(dir: Direction): Block {
    const bottom = this.cells.filter((c) => c.z === 0);

    let next: Cell[];
    switch (dir) {
      case "east": {
        const x0 = Math.max(...bottom.map((c) => c.x)) + 1;
        next = this.cells.map(({ x, y, z }) => ({
          // centres: cx = x+0.5, cz = z+0.5
          // new cx = x0 + cz ; new cz = x0 - cx
          x: Math.floor(x0 + (z + 0.5)),
          y,
          z: Math.floor(x0 - (x + 0.5)),
        }));
        break;
      }
      case "west": {
        const x0 = Math.min(...bottom.map((c) => c.x));
        next = this.cells.map(({ x, y, z }) => ({
          // new cx = x0 - cz ; new cz = cx - x0
          x: Math.floor(x0 - (z + 0.5)),
          y,
          z: Math.floor(x + 0.5 - x0),
        }));
        break;
      }
      case "north": {
        const y0 = Math.max(...bottom.map((c) => c.y)) + 1;
        next = this.cells.map(({ x, y, z }) => ({
          x,
          // new cy = y0 + cz ; new cz = y0 - cy
          y: Math.floor(y0 + (z + 0.5)),
          z: Math.floor(y0 - (y + 0.5)),
        }));
        break;
      }
      case "south": {
        const y0 = Math.min(...bottom.map((c) => c.y));
        next = this.cells.map(({ x, y, z }) => ({
          x,
          // new cy = y0 - cz ; new cz = cy - y0
          y: Math.floor(y0 - (z + 0.5)),
          z: Math.floor(y + 0.5 - y0),
        }));
        break;
      }
    }

    return new Block(next);
  }
}

/** Centre point of a cube cell in world units. */
export function cellCentre(c: Cell): [number, number, number] {
  return [c.x + 0.5, c.z + 0.5, c.y + 0.5];
}
