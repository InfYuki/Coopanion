# cortico-world-dsh-monitor

盯着 DeepSeek Harness（DSH），把「谁做完了」和「花了多少 token」告诉 Coo。

**只读。** 这个 World 不写 DSH 的任何文件、不发任何网络请求、不需要 DSH 的 API token——它只读 DSH 自己写下的会话投影缓存。

## 它读什么

`<DSH_HOME>/storages/session_projcache/sessions/<sessionId>.json`

DSH 的 `dsh-session-projection-cache` 插件按「每 200 个事件或每 5 秒」把每个会话的状态投影成这个 JSON。里面有：

| 行 | 内容 | 本 World 的用法 |
|---|---|---|
| `tokenUsage.totals` | 未命中缓存的输入 / 输出 / 缓存命中 / 缓存写入 | token 用量（四项分开，因为缓存命中占绝对多数，混在一起算钱会错） |
| `sessionStats` | 轮数、步数、解码 token、各段耗时、`openStep` | 「在跑」判据之一 |
| `turnBoundary` | `openTurnStartSeq`、`lastStepBoundary.kind` | 「在跑 / 已结算」判据之二 |
| `contextPressure` | 已占用的 surface token 与窗口大小 | 上下文占比 |
| `goal.current.goal` | 当前目标的 `phase`（`active`/`complete`/`blocked`） | 目标结束事件 |
| `todos` | 待办与状态 | 进度汇报 |
| `subagentCatalog` | 派出去的子代理 | 一并列出 |

**为什么不信 mtime**：投影缓存是「攒够 200 个事件或 5 秒」才写的，所以刚停下的会话 mtime 也可能很新。本 World 用 DSH 自己的两组投影交叉判断——`sessionStats.openStep` 归 null、`turnBoundary.openTurnStartSeq` 归 null、最后一步以 `end` 收尾——三者同时成立才算结算，再叠上「文件已安静够久」作为保险。

## 它推什么

| 事件 | 何时 | trigger |
|---|---|---|
| `dsh.task.completed` | 某个会话又做完一轮，且已结算 | `preempt` |
| `dsh.goal.settled` | 某个目标的 phase 离开 `active` | `preempt` |
| `dsh.usage.threshold` | 累计 token 越过配置里的档位 | `flush` |
| `dsh.usage.spike` | 两次采样之间用量涨得异常快 | `flush` |

事件正文是一句事实陈述（哪个会话、第几轮、多少 token）；用什么语气说由 Coo 决定，World 不代写台词。

> **`reportCompleted` 默认 `false`。** 进度与完成现在由**桌宠自己**弹气泡（见下节），这些事件只当背景；把它们再交给 Coo 就会让同一件事被说两遍。需要模型旁白时再把这个开关打开。

## 桌宠上的进度气泡（不经过模型）

桌宠 World 有一条自己的进度链路，**不依赖模型、不产生对话轮次**，所以即使没配 API Key 也能提醒：

| 时机 | 气泡内容 |
|---|---|
| 某个子代理把子任务做完 | `子代理「查资料」做完了子任务` |
| 某个会话做完一轮 | `「重构认证模块」第 3 轮做完了` |
| 某个待办被勾掉 | `「…」完成待办：写测试（2/5）` |
| 某个目标状态变了 | `「…」的目标状态变成 complete` |
| **任务完成**（一轮结算 / 目标完成） | 一条简洁汇报：会话名 + `N 轮 · 12.3k tokens` +（有目标时）目标原文 |

行为要点：

- 每 `progress.intervalSeconds`（默认 20 秒）看一眼，**首拍只记基线**，不念旧账。
- 多个关键节点**合并成一条**气泡（最多 3 行，多的折成「…还有 N 项」），两次进度气泡之间至少隔 `progress.coalesceSeconds`（默认 15 秒）。
- 只在桌宠页面连着、它没在说话、且 bot 空闲时才弹——避免气泡排队憋成十几秒的延迟。
- 完成汇报优先于进度提醒，每次最多 2 条。
- 这些气泡同时写进对话页历史（`desktop-pet.self` 事件，`deliver: false`，不进 bot 上下文）。

实现在桌宠包里：`src/progress.ts`（文案，纯函数）+ `src/world.ts` 的 `tickProgress()`；判定用本包的 `detectMilestones()`（`src/milestones.ts`）。

## 它给的工具

| 工具 | 用途 |
|---|---|
| `dsh_status` | 此刻全貌：几个会话在跑、token 合计、当前目标 |
| `dsh_usage` | token 明细，可总量或逐会话，可限定时间窗口 |
| `dsh_tasks` | 在跑 / 刚结束的任务，含目标、待办进度、子代理 |
| `dsh_balance` | 今天用了多少 + 账号余额与赠金 |

## 今日用量与余额（桌宠上点得出来）

桌宠上**左键点一下**会冒一个两行的气泡（今天的输出与合计、余额），**右键菜单里的「账号与余额」**会打开一页完整信息。两条都走 `account` 消息 → 桌宠 World 读文件 → 回 `dialog` 气泡，**不经过 bot、不进对话上下文**。

数据来源（都只读，都不需要凭据）：

| 数据 | 来源 | 说明 |
|---|---|---|
| 今日用量 | `$DSH_HOME/sessions/**/session.v4.jsonl.zstd` | 按 `assistant/message` 的 `data.usage`、按本地日期现算。日志是**多帧 zstd 拼接**，按魔数 `28 B5 2F FD` 切片逐帧解压（`zstdDecompressSync` 一次只解第一帧）。实测扫 7 个文件约 300~500 ms，默认缓存 30 秒。 |
| 余额 | `$DSH_HOME/storages/coopanion-bridge/account.json` | 由 DSH 侧的小插件 [coopanion-account-bridge](../../integrations/dsh-account-bridge/README.md) 用 Host 自己的 `deepseekAccount.getBalance()` 查出来发布。凭据从不离开 DSH。 |

口径与 DSH 自己的 `tokenUsage` 投影一致：只算 `assistant/message`，同 `turn+step` 后写覆盖。实测 33 个会话里 31 个与该投影逐字段相等——另两个的差异是 `compaction/summary` 的用量，DSH 自己也不计入。

余额没拿到时会照实说：`桥接插件未装` / `signed-out` / `failed` / 具体错误，**不会伪造成 0**。

## 配置

`config.json` 的 `worlds.dsh-monitor` 段（设置 → 扩展 → World 页里也能改，标了热改的键立刻生效）：

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `false` | 定义里恒为 false，由 Bot 的 `declares` 或部署决定是否启用 |
| `cacheDir` | `''` | 留空则用 `$DSH_HOME/storages/session_projcache/sessions` |
| `pollSeconds` | `20` | 轮询间隔 |
| `idleSeconds` | `90` | 会话安静多久算结束 |
| `reportCompleted` | `false` | 把「一轮做完」的事件交给 Coo（默认关：桌宠自己弹气泡，见上节） |
| `thresholds` | `500000, 1000000, 2000000` | token 档位，逗号分隔，留空关闭 |
| `repeatMinutes` | `30` | 同一提醒的最短重复间隔 |
| `maxSessions` | `40` | 每次最多看多少个最近的会话 |

## 启用

World 定义里 `enabled` 恒为 false（框架惯例：由 Bot 的 `declares` 或部署决定）。三种启用方式：

1. 设置 → 扩展 → World 页里打开它的开关；
2. 在 `config.json` 里写 `"worlds": { "dsh-monitor": { "enabled": true } }`；
3. 由宿主 Bot 的 `declares` 声明（Coopanion 内置的三个 World 就是这么做的）。

## 已知限制

- **看不到后台作业（job）的粒度**。DSH 的 `dsh-jobs-local` 把 job 状态完全放在内存里，磁盘上没有任何 job 文件；对外 RPC 又要进程级 token。所以这里用「会话 / 回合」粒度替代。要 job 粒度，得等 DSH 提供可鉴权的本地接口。
- **没有按天 / 按模型的聚合力**。投影缓存只有会话级累计。按天或按模型需要解析 `~/.dsh/sessions/**/session.v4.jsonl.zstd`（多帧 zstd，Node 原生解压只出第一帧，得按魔数切片），本 World 暂不做。
- **延迟**：最多一个轮询间隔 + DSH 自己 5 秒的写盘节奏。
- **跨 profile 共用**：投影缓存按 `DSH_HOME` 隔离，不按 profile 隔离，同一个 `.dsh` 下所有 profile 的数据都会看到。

## 许可

AGPL-3.0-or-later，随 Coopanion 仓库。
