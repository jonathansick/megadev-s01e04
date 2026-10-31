// Types for the morning digest: one night's run log folded into one row per job.
// Pure data; no I/O here. Times are the raw strings from the log, offset preserved.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One parsed line of runs/<night>.jsonl.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One job's night, in file order.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// A whole night. rows are sorted by job; badLines counts lines that did not parse.
export type DigestNight = {
  night: string;
  rows: DigestRow[];
  badLines: number;
};

// Count of rows per last status, for the board (plan § 2c).
export type StatusCounts = Record<RunStatus, number>;

// readNight(runsDir, night) reads runs/<night>.jsonl; null when there is no such file.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
