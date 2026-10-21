`src/source.ts`, `src/account-client.ts`: read-only Codex rollout and account monitoring.

`new CodexSource({ home, timezone }).scan()` reads active rollouts under `sessions/` incrementally. The first scan establishes a notification baseline; subsequent scans report explicit turn, goal, plan, approval and subagent milestones. Silence never completes a task. A completed turn leaves an ordinary session idle; an explicit completed goal settles the goal.

The home resolves from the supplied path, `CODEX_HOME`, then `USERPROFILE/.codex` or the OS home. Optional read-only `state_5.sqlite` and `goals_1.sqlite` metadata supply titles, agent paths and goal states. Missing SQLite support leaves rollout monitoring available. The monitor never reads `auth.json` or sends conversation messages.

First reads use a bounded tail and at most 64 KiB of the session header. Default limits are 100 rollouts, 2 MiB per tail and 16 MiB per scan. `usage.partial` identifies truncated history, incomplete records, counter resets or incomplete file coverage. Local token totals cover the selected rollouts and are separate from account billing. Copied fork metadata cannot replace the owning session identity; inherited ordinals and other threads' usage records are excluded when ownership metadata is available. A missing fork header leaves bounded-tail totals approximate.

Daily tokens follow `timezone`, or the system timezone when omitted. Cumulative usage records and token-count records are deduplicated. Counter resets add subsequent usage and mark coverage partial. Quota buckets preserve independent IDs, source and observation timestamps; reset timestamps use Unix milliseconds.

`CodexAccountClient.read()` starts a temporary stdio `codex app-server` process and requests `account/rateLimits/read` and optional `account/usage/read`. It never starts a model turn or changes a thread. The process uses Codex's own credential handling. Failed refreshes preserve the previous quota as stale and throttle retries. Unsupported usage reads leave the quota available.

Run `pnpm test` and `pnpm typecheck` in this directory. Tests use temporary rollout folders, real SQLite fixture files and a local fake JSON-RPC child process; they require no network.
