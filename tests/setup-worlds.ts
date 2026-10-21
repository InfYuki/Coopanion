/** Worlds must not discover the developer's Codex profile during timer tests. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

const original = process.env.CODEX_HOME;
const home = mkdtempSync(join(tmpdir(), 'coopanion-empty-codex-'));
process.env.CODEX_HOME = home;
afterAll(() => {
  if (original === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = original;
  rmSync(home, { recursive: true, force: true });
});
