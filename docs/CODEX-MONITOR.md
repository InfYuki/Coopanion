<!-- Owner: packages/cortico-world-codex-monitor/src/source.ts; packages/cortico-world-codex-monitor/src/account-client.ts; packages/cortico-world-desktop-pet/src/codex.ts -->
# Codex 账户与任务监控 / Codex monitoring

Coo 可显示当前本机 Codex 数据目录中的会话进度、本机 token 用量和账户额度。桌宠左键用量气泡合并显示 DSH 和 Codex 摘要；右键账户详情默认打开 Codex 卡片，使用 Codex / DSH 按钮切换，关闭 Codex 监控后直接显示 DSH 卡片；读取和提醒不消耗模型对话轮次。

Coo shows progress and local token usage from the selected local Codex data directory, plus account limits. A left click shows a combined DSH/Codex preview. Account details open the Codex card with Codex/DSH buttons to switch sources; disabling Codex opens DSH directly. Monitoring does not create model turns.

## 数据来源 / Sources

| 数据 / Data | 来源与范围 / Source and coverage |
|---|---|
| 本机今日与累计 token / Local today and total | `sessions/**/*.jsonl` 中已记录的 token 用量；今日按应用时区计算。只涵盖本机保留的会话，读取有文件数和字节预算，截断或历史不连续时标注数值可能不完整或近似。 / Recorded usage in local session logs, with today calculated in the app timezone. File and byte budgets limit scans; truncated or discontinuous history is labeled as incomplete or approximate. |
| 额度 / Account limits | 本机 Codex `app-server` 的 `account/rateLimits/read`，失败时保留日志中的额度快照。显示已用、剩余、窗口、重置时间及更新时间；旧快照标注过期，重置时间已过时不推算成满额。 / The local Codex app-server account API, with log snapshots as fallback. Cards show usage, remaining quota, windows, resets and timestamps. Old snapshots are labeled stale; a past reset does not imply a full quota. |
| 账户 token 汇总 / Account token aggregates | 当前 Codex 版本支持账户用量接口且返回相应字段时显示，与本机日志统计分开标注；缺少数据时不填零。 / Shown separately from local logs when the installed Codex account usage API supplies them; absent values are not treated as zero. |
| 标题、子代理与目标 / Titles, subagents and goals | 本地会话记录，以及存在且格式兼容时只读查询的 `state_5.sqlite` 和 `goals_1.sqlite`。 / Local rollout records and read-only queries of compatible local metadata databases. |

监控仅针对当前配置的本机 Codex profile/data home。其他设备、未同步到本机的远端会话、已删除或未记录的历史不在本机统计范围内。账户额度代表所登录账户的服务端快照，不等于本机 token 汇总。日志和数据库采用 Codex 当前本地格式；它们可能随 Codex 升级变化，需要更新适配器。

Only the configured local Codex profile/data home is monitored. Other devices, remote sessions absent from local logs, and deleted or unrecorded history are outside local coverage. Account quota is an account snapshot and differs from local token totals. Codex local log and database schemas can change between versions.

## 提醒 / Reminders

首次扫描建立基线，不补播历史完成记录。之后的明确轮次完成、失败、中断、计划更新、待办完成、目标完成、阻塞、等待批准和子代理完成会形成提醒。轮次完成只表示本轮结束；目标完成由明确目标状态确认，不以安静时长判断 Codex 任务完成。

The first scan establishes a baseline without replaying historical completion records. Later explicit turn completion, failure, interruption, plan updates, completed steps, completed goals, blocking, approval requests and subagent completion produce reminders. A completed turn describes that turn; goal completion requires an explicit goal state. Silence does not establish Codex completion.

提醒复用桌宠进度刷新周期、合并间隔和完成汇报开关。连续节点合并显示最多三项，其余显示数量；待处理节点有数量上限，气泡适合关键提示，不作为完整审计记录。DSH 与 Codex 的读取和基线独立，一侧缺失不阻塞另一侧。

Reminders share the pet's progress interval, coalescing interval and completion-report switch. A bubble shows up to three updates plus a count of the rest. Pending updates are bounded, so bubbles are reminders rather than a full audit log. Each source maintains its own baseline and reads independently.

## 配置 / Configuration

以下配置位于 `worlds.desktop-pet`，均可热更新。 / These settings belong to `worlds.desktop-pet` and apply without restarting.

| 配置 / Key | 默认值 / Default | 含义 / Meaning |
|---|---|---|
| `codex.enabled` | `true` | 同时控制 Codex 进度与账户读取。 / Enables local progress and account reads. |
| `codex.home` | `""` | 留空依次使用 `CODEX_HOME`、用户主目录下 `.codex`。 / Empty resolves CODEX_HOME, then .codex under the user home. |
| `codex.executable` | `""` | 留空查找已安装的 Codex 原生可执行文件；也可指定文件路径。 / Empty discovers an installed native Codex executable; an explicit file path is supported. |
| `codex.accountRefreshSeconds` | `300` | 账户请求缓存间隔，最短 300 秒；不改变本地日志扫描间隔。 / Account request cache interval, at least 300 seconds; independent of local scans. |
| `progress.enabled` | `true` | DSH 与 Codex 的进度气泡总开关。 / Master switch for progress bubbles from both sources. |
| `progress.intervalSeconds` | `20` | 本地进度刷新间隔。 / Local progress refresh interval. |
| `progress.coalesceSeconds` | `15` | 相邻进度气泡的最短间隔。 / Minimum gap between progress bubbles. |
| `progress.reportCompletion` | `true` | 完成汇报开关。 / Completion-report switch. |

本地读取不修改 Codex 会话和数据库。账户请求启动短时 `app-server`，使用 Codex 已有登录状态；账户额度读取可能联网。Coopanion 不导出凭据，也不向模型提供日志或额度数据。找不到可执行文件、未登录或接口失败时显示缺失或过期状态，本地进度仍可继续。

Local reads do not modify Codex sessions or databases. Account refresh starts a short-lived app-server using Codex's existing login; quota queries may access the network. Coopanion does not export credentials or send logs or quota data to the model. Missing executables, sign-in issues and API errors leave account data missing or stale while local progress can continue.
