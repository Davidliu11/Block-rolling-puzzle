import type { Cell2D } from "./types";

/** A selectable piece. Each block type is a difficulty grade. */
export interface BlockType {
  id: string;
  name: string;
  grade: number;
  /** Short difficulty label. */
  difficulty: string;
  /** Flat footprint (normalized so min x/y = 0). */
  footprint: Cell2D[];
  /** Hex colour for the rendered cubes. */
  color: number;
  /** CSS colour string mirroring {@link color} for UI previews. */
  cssColor: string;
}

export const LEVELS_PER_BLOCK = 20;

export const BLOCK_TYPES: BlockType[] = [
  {
    id: "domino",
    name: "Domino",
    grade: 1,
    difficulty: "Easy",
    color: 0x5ec8ff,
    cssColor: "#5ec8ff",
    // XX
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  },
  {
    id: "square",
    name: "Square",
    grade: 2,
    difficulty: "Medium",
    color: 0x6ee7a8,
    cssColor: "#6ee7a8",
    // XX
    // XX
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
  },
  {
    id: "pento",
    name: "U-Block",
    grade: 3,
    difficulty: "Hard",
    color: 0xffd24c,
    cssColor: "#ffd24c",
    // 2x3 with the middle cell removed
    // X.X
    // XXX
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
    ],
  },
  {
    id: "slab",
    name: "Slab",
    grade: 4,
    difficulty: "Expert",
    color: 0xff8aa0,
    cssColor: "#ff8aa0",
    // 2x4 with a middle cell removed
    // X.XX
    // XXXX
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ],
  },
];

export function getBlockType(id: string): BlockType | undefined {
  return BLOCK_TYPES.find((b) => b.id === id);
}
