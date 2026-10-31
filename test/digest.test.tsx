import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

let runsDir = '';

function line(at: string, job: string, status: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ at, job, status, owner: 'ops', ...extra });
}

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(
    join(runsDir, '2026-11-01.jsonl'),
    [
      line('2026-11-01T01:00:00+01:00', 'zeta-sync', 'fail', { error: 'disk full' }),
      line('2026-11-01T01:05:00+01:00', 'alpha-backup', 'retry'),
      line('2026-11-01T01:10:00+01:00', 'alpha-backup', 'retry'),
      line('2026-11-01T01:15:00+01:00', 'alpha-backup', 'retry'),
      line('2026-11-01T01:20:00+01:00', 'alpha-backup', 'ok'),
    ].join('\n') + '\n',
  );
  writeFileSync(join(runsDir, '2026-11-02.jsonl'), '');
  writeFileSync(
    join(runsDir, '2026-11-03.jsonl'),
    [line('2026-11-03T02:00:00+01:00', 'alpha-backup', 'ok'), 'not json'].join('\n') + '\n',
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function app() {
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

type Body = { rows: { job: string }[]; badLines: number };

describe('digest routes', () => {
  it('serves a populated night as page and JSON in the same job order', async () => {
    const page = await app().request('/digest/2026-11-01');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('alpha-backup');
    expect(html).toContain('zeta-sync');
    expect(html).toContain('warn');

    const api = await app().request('/api/digest/2026-11-01');
    expect(api.status).toBe(200);
    const body = (await api.json()) as Body;
    expect(body.rows).toHaveLength(2);

    const firstCells = [...html.matchAll(/<tr><td>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(firstCells).toEqual(body.rows.map((r) => r.job));
  });

  it('404s for a night with no file', async () => {
    expect((await app().request('/digest/2026-12-31')).status).toBe(404);
    expect((await app().request('/api/digest/2026-12-31')).status).toBe(404);
  });

  it('handles an empty night', async () => {
    const page = await app().request('/digest/2026-11-02');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    const api = await app().request('/api/digest/2026-11-02');
    expect(api.status).toBe(200);
    const body = (await api.json()) as Body;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts bad lines', async () => {
    const page = await app().request('/digest/2026-11-03');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('1 line(s) did not parse');
    const body = (await (await app().request('/api/digest/2026-11-03')).json()) as Body;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });

  it('404s for a malformed night', async () => {
    expect((await app().request('/digest/nope')).status).toBe(404);
  });
});
