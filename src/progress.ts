/**
 * Nightly progress, kept on-device in localStorage. Each completed ritual adds
 * a star; seven stars complete a constellation and the next one begins.
 */
export const JAR_KEYS = ['tomorrow', 'rest', 'release'] as const;
export type JarKey = (typeof JAR_KEYS)[number];

export interface NightRecord {
  date: string; // YYYY-MM-DD local
  filed: Record<JarKey, number>;
  calm: number; // 0..1 breath-follow score
}

export interface Progress {
  nights: NightRecord[];
  /** Thoughts set aside for "Tomorrow" on the most recent night. */
  tomorrow: string[];
}

const KEY = 'lull.progress.v1';
export const STARS_PER_CONSTELLATION = 7;

export interface ConstellationDef {
  name: string;
  color: number;
  /** Star positions in a 1x1 box, x right, y up. */
  stars: [number, number][];
  /** Index pairs to connect once both stars are earned. */
  lines: [number, number][];
}

export const CONSTELLATIONS: ConstellationDef[] = [
  {
    name: 'The Lantern',
    color: 0xffd7a1,
    stars: [
      [0.5, 0.95],
      [0.3, 0.72],
      [0.7, 0.72],
      [0.22, 0.38],
      [0.78, 0.38],
      [0.38, 0.1],
      [0.62, 0.1],
    ],
    lines: [
      [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 6],
    ],
  },
  {
    name: 'The Heron',
    color: 0xb9d8ff,
    stars: [
      [0.15, 0.85],
      [0.32, 0.7],
      [0.45, 0.5],
      [0.62, 0.42],
      [0.85, 0.5],
      [0.55, 0.15],
      [0.68, 0.12],
    ],
    lines: [
      [0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [3, 6],
    ],
  },
  {
    name: 'The Hearth',
    color: 0xffb3c7,
    stars: [
      [0.5, 0.9],
      [0.2, 0.55],
      [0.8, 0.55],
      [0.5, 0.5],
      [0.3, 0.15],
      [0.7, 0.15],
      [0.5, 0.25],
    ],
    lines: [
      [0, 1], [0, 2], [1, 4], [2, 5], [4, 5], [3, 6], [0, 3],
    ],
  },
];

export function todayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      if (Array.isArray(p.nights)) return { nights: p.nights, tomorrow: p.tomorrow ?? [] };
    }
  } catch {
    /* storage unavailable: start fresh */
  }
  return { nights: [], tomorrow: [] };
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Consecutive nights ending today or yesterday. */
export function streak(p: Progress, now = new Date()): number {
  const dates = new Set(p.nights.map((n) => n.date));
  let count = 0;
  const d = new Date(now);
  if (!dates.has(todayKey(d))) d.setDate(d.getDate() - 1);
  while (dates.has(todayKey(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

/**
 * Record tonight. Repeat sessions on the same date update that night rather
 * than earning extra stars, so the sky reflects real nights.
 */
export function recordNight(
  p: Progress,
  filed: Record<JarKey, number>,
  calm: number,
  tomorrow: string[],
): { progress: Progress; newStar: boolean } {
  const date = todayKey();
  const existing = p.nights.find((n) => n.date === date);
  const nights = existing
    ? p.nights.map((n) =>
        n.date === date
          ? {
              date,
              filed: {
                tomorrow: n.filed.tomorrow + filed.tomorrow,
                rest: n.filed.rest + filed.rest,
                release: n.filed.release + filed.release,
              },
              calm: Math.max(n.calm, calm),
            }
          : n,
      )
    : [...p.nights, { date, filed, calm }];
  return { progress: { nights, tomorrow }, newStar: !existing };
}

export function skyState(totalNights: number): {
  constellation: ConstellationDef;
  earned: number;
  completed: number;
} {
  const completed = Math.floor(totalNights / STARS_PER_CONSTELLATION);
  const earned = totalNights % STARS_PER_CONSTELLATION;
  return {
    constellation: CONSTELLATIONS[completed % CONSTELLATIONS.length],
    earned,
    completed,
  };
}
