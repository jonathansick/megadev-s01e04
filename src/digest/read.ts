import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, ReadNight, RunLine, RunStatus, StatusCounts } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

// Parse one log line at the edge. null when it is not a usable run line.
export function parseLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.at !== 'string' || o.at === '') return null;
  if (typeof o.job !== 'string' || o.job === '') return null;
  if (!isStatus(o.status)) return null;
  if (!(o.owner === null || o.owner === undefined || typeof o.owner === 'string')) return null;
  if (!(o.error === undefined || typeof o.error === 'string')) return null;
  const parsed: RunLine = { at: o.at, job: o.job, status: o.status, owner: o.owner ?? null };
  if (o.error !== undefined) parsed.error = o.error;
  return parsed;
}

// Fold parsed lines, in file order, into one row per job, sorted by job.
export function foldLines(lines: readonly RunLine[]): DigestRow[] {
  const byJob = new Map<string, DigestRow>();
  for (const line of lines) {
    const row = byJob.get(line.job);
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    row.lastStatus = line.status;
    row.lastError = line.error ?? null;
    row.lastAt = line.at;
    if (row.owner === null) row.owner = line.owner;
  }
  return [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}

// Read runs/<night>.jsonl. null when the file does not exist; bad lines are counted, never thrown.
export const readNight: ReadNight = (runsDir, night) => {
  const path = join(runsDir, `${night}.jsonl`);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const lines: RunLine[] = [];
  let badLines = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const parsed = parseLine(line);
    if (parsed === null) badLines += 1;
    else lines.push(parsed);
  }
  return { night, rows: foldLines(lines), badLines };
};

// ok / retry / fail counts of a night's rows, by last status.
export function countStatuses(rows: readonly DigestRow[]): StatusCounts {
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of rows) counts[row.lastStatus] += 1;
  return counts;
}
