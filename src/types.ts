/** A single unit cube of the block, in integer grid coordinates.
 *  x = column (east+), y = row (north+), z = height (up+, floor = 0). */
export interface Cell {
  x: number;
  y: number;
  z: number;
}

/** Rolling directions (top of the block tips toward this compass point). */
export type Direction = "north" | "south" | "east" | "west";

export const DIRECTIONS: Direction[] = ["north", "south", "east", "west"];

/** A 2D cell on the board floor. */
export interface Cell2D {
  x: number;
  y: number;
}

/** Static description of a puzzle. */
export interface Level {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Barrier cells the block may never occupy a column over. */
  barriers: Cell2D[];
  /** Flat footprint where the block starts (z = 0 cubes). */
  start: Cell2D[];
  /** Flat footprint the block must land on to win. */
  target: Cell2D[];
  /** Exact number of rolls required to win. */
  requiredSteps: number;
}
