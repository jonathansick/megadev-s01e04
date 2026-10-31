import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { countStatuses, readNight } from '../src/digest/read.js';

const night = readNight('runs', '2026-10-28');
if (night === null) throw new Error('fixture runs/2026-10-28.jsonl is missing');

describe('readNight on runs/2026-10-28.jsonl', () => {
  it('has 5 jobs and 1 bad line', () => {
    expect(night.night).toBe('2026-10-28');
    expect(night.rows).toHaveLength(5);
    expect(night.badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    const jobs = night.rows.map((r) => r.job);
    expect(jobs).toEqual([...jobs].sort());
    expect(jobs).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
  });

  it('fixtures/refresh retried 3 times and ended ok', () => {
    const row = night.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toMatchObject({
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('notes/backup failed with its error', () => {
    const row = night.rows.find((r) => r.job === 'notes/backup');
    expect(row).toMatchObject({ runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('digest/render keeps its row with owner null', () => {
    const row = night.rows.find((r) => r.job === 'digest/render');
    expect(row).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });

  it('lane/sync drops the retry error once the next run is ok', () => {
    const row = night.rows.find((r) => r.job === 'lane/sync');
    expect(row).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: null });
  });

  it('counts rows by last status', () => {
    expect(countStatuses(night.rows)).toEqual({ ok: 4, retry: 0, fail: 1 });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2000-01-01')).toBeNull();
    expect(readNight('runs', '2000-01-01')).toBeNull();
  });

  it('reads an empty file as 0 rows and 0 bad lines', () => {
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts unparseable and malformed lines without throwing', () => {
    writeFileSync(
      join(dir, '2026-01-02.jsonl'),
      [
        '{"at":"2026-01-02T22:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        'not json',
        '{"at":"2026-01-02T22:01:00+01:00","job":"b","status":"bogus","owner":"x"}',
        '{"job":"c","status":"ok","owner":"x"}',
        '[1,2,3]',
        '',
      ].join('\n'),
    );
    const got = readNight(dir, '2026-01-02');
    expect(got?.badLines).toBe(4);
    expect(got?.rows.map((r) => r.job)).toEqual(['a']);
  });
});
