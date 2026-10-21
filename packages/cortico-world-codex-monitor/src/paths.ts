import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
export function resolveCodexHome(home?: string): string {
  return resolve(home?.trim() || process.env.CODEX_HOME?.trim() || join(process.env.USERPROFILE || homedir(), '.codex'));
}
