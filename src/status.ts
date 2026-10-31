import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';
import { countStatuses, readNight } from './digest/read.js';
import type { StatusCounts } from './digest/types.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// counts is null when the night's log can't be read.
export type NightSummary = { night: string; counts: StatusCounts | null };

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    // Counts are by each job's LAST status, as on the digest page.
    nights: nightsOnDisk(config.runsDir).map((night) => {
      const read = readNight(config.runsDir, night);
      return { night, counts: read ? countStatuses(read.rows) : null };
    }),
  };
}
