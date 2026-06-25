import { BLOCK_TYPES, LEVELS_PER_BLOCK } from "./blocks";

const STORAGE_KEY = "brp.progress.v1";

type ProgressData = Record<string, number[]>; // blockId -> completed level indices

function load(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProgressData;
  } catch {
    /* ignore corrupt storage */
  }
  return {};
}

function save(data: ProgressData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage may be unavailable; progress is best-effort */
  }
}

export class Progress {
  private data: ProgressData = load();

  private completedSet(blockId: string): Set<number> {
    return new Set(this.data[blockId] ?? []);
  }

  isCompleted(blockId: string, index: number): boolean {
    return this.completedSet(blockId).has(index);
  }

  /** Level 0 is always unlocked; level i unlocks when i-1 is completed. */
  isUnlocked(blockId: string, index: number): boolean {
    if (index <= 0) return true;
    return this.isCompleted(blockId, index - 1);
  }

  countCompleted(blockId: string): number {
    return this.completedSet(blockId).size;
  }

  markCompleted(blockId: string, index: number) {
    const set = this.completedSet(blockId);
    if (!set.has(index)) {
      set.add(index);
      this.data[blockId] = [...set].sort((a, b) => a - b);
      save(this.data);
    }
  }

  isBlockComplete(blockId: string): boolean {
    return this.countCompleted(blockId) >= LEVELS_PER_BLOCK;
  }

  reset() {
    this.data = {};
    save(this.data);
  }
}

export function totalCompleted(progress: Progress): number {
  return BLOCK_TYPES.reduce((n, b) => n + progress.countCompleted(b.id), 0);
}
