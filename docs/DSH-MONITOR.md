# DSH 任务进度与账户余额

桌宠盯着本机的 DeepSeek Harness（DSH）：任务到了关键节点主动弹气泡说一声，你点它一下还能知道今天花了多少 token、账户还剩多少钱。两条链路都只读 DSH 写在本地的文件，不经过模型，也不需要任何凭据。

## 一、它解决什么

DSH 跑一个长任务时，你得切回它的窗口才知道做到哪了；用了多少 token、账户还剩多少钱，又得另开一页看。这两件事都只跟本机上的文件有关，不必问模型：

- **进度**：DSH 自己把每个会话投影成 JSON，桌宠定时读一遍，节点变了就弹一条气泡。不产生对话轮次，所以没配 API Key 时提醒照样能出来。
- **用量与余额**：会话日志里带着每条消息的 usage，余额由 DSH 侧的桥接插件发布成一个小 JSON，桌宠现算现读。

两件事都不联网，也不写 DSH 的任何文件。

## 二、任务进度气泡

### 触发时机

| 节点 | 气泡文案 | 判据 |
|---|---|---|
| 某个子代理做完子任务 | `子代理「查资料」做完了子任务` | 这个会话出现在某个父会话的子代理目录里，且它这一轮已经结算 |
| 某个会话做完一轮 | `「重构认证模块」第 3 轮做完了` | 轮数比上一拍多，且已经结算 |
| 某个待办被勾掉 | `「重构认证模块」完成待办：写测试（2/5）` | 已完成待办数比上一拍多，括号里是「已完成/总数」 |
| 某个目标状态变化 | `「重构认证模块」的目标状态变成 complete` | `goal.current.goal.phase` 与上一拍不同（`active` / `complete` / `blocked`） |
| 任务完成 | 三行汇报，见下 | 目标刚走到 `complete`，或做完一轮且没有未完成的目标 |

「已结算」的判据是三个条件同时成立：`sessionStats.openStep` 为 null、`turnBoundary.openTurnStartSeq` 为 null、投影文件已经安静 `progress.idleSeconds`（默认 90 秒）。前两条来自 DSH 自己的投影，最后一条防的是「文件刚写过但人已经停了」。

### 完成汇报长什么样

```
「重构认证模块」做完了
3 轮 · 12.3k
目标：把认证模块换成 OAuth 2.1
```

- 第三行：目标走到 `complete` 且有原文时是 `目标：…`，否则是 `没有设目标`。
- 轮数是这个会话的累计轮数，token 是它累计的四项之和，按 `humanTokens` 写成 `12.3k` / `1.23M` 这种形式。
- 只在 `worlds.desktop-pet.progress.reportCompletion`（默认开）打开时弹，一次最多 2 条。

### 防刷屏与节流

- **节奏**：桌宠启动 20 秒后看第一眼，之后每 `progress.intervalSeconds`（默认 20 秒）看一眼。
- **首拍只建基线**：启动前就已经结算的会话算历史，不念旧账。
- **合并**：一拍里发现的多个节点压成一条气泡，最多 3 行，多出来的折成 `…还有 N 项`。
- **间隔**：两条进度气泡之间至少隔 `progress.coalesceSeconds`（默认 15 秒）。
- **只在听得见的时候说**：桌宠页面连着、它没在念上一句、bot 不在跑、`progress.enabled` 为真，四条同时成立才弹。不满足的那一拍连缓存都不读，节点留到下一拍——不丢，只是晚一点。
- **去重**：同一件事有去重键（会话加轮数 / 待办数 / 目标 phase），30 分钟内不重复。
- **不补账**：被折进 `…还有 N 项` 的、或者因为间隔被压下的，不会再单独说一次。气泡是提醒，不是账本。

### 气泡也进对话页历史

弹出去的每一条同时写进对话页（事件类型 `desktop-pet.self`，`deliver: false`），所以翻对话记录能看到它说过什么，但这些内容**不进 bot 的上下文**。页面没连时气泡发不出去，这一条也不会记。

文案是纯函数（`packages/cortico-world-desktop-pet/src/progress.ts`），判定是纯计算（`packages/cortico-world-dsh-monitor/src/milestones.ts` 的 `detectMilestones()`），读盘与发气泡在 `packages/cortico-world-desktop-pet/src/world.ts` 的 `tickProgress()`。

## 三、今日用量与账户余额

### 两个入口

| 入口 | 看到什么 |
|---|---|
| 左键单击桌宠 | 两行：`今天:输出 12.3k · 合计 1.23M(12 次请求 · 3 个会话)` 和 `余额:¥59.45` |
| 右键菜单「账号与余额」 | 一整页：标题、日期、四项用量、合计与请求/会话数、充值余额（带账号名）、赠金、`N 分钟前从 DSH 读到` |

- 左键的「戳一下」反应照旧：按下时还是交给造型，只在松开时判定这是一次单击（700 ms 内、位移不超过 6 px、且不是拖动），才多发一条 `account`。
- 完整页里「缓存写入」为 0 时省掉那一行；余额状态是 `ready` 但没有钱包时写「余额为空」。
- 两处都是 `dialog` 气泡，不经过 bot，也不写进对话页历史——写历史的只有上面的进度气泡。

### 数据来源与口径

| 数据 | 从哪读 | 口径 |
|---|---|---|
| 今日用量 | `$DSH_HOME/sessions/**/session.v4.jsonl.zstd` | 只算 `assistant/message` 的 `data.usage`，按 `event.time` 的**本地日期**落桶，四项分开记 |
| 余额 | `$DSH_HOME/storages/coopanion-bridge/account.json` | 由 DSH 侧插件发布，金额是字符串原样 |

口径与 DSH 自己的 `tokenUsage` 投影一致：只算 `assistant/message`，同一个 `turn+step` 后写覆盖，一次请求只算一次，`requests` 就是去重后的条数。四项分别是未缓存输入、输出、缓存命中、缓存写入——混在一起算钱会错，因为缓存命中占绝对多数。

**多帧 zstd 这个坑**：DSH 是追加写日志，一份 `session.v4.jsonl.zstd` 其实是多个 zstd 帧首尾相接，而 Node 的 `zlib.zstdDecompressSync` 一次只解**第一帧**。所以这里先把整份字节按魔数 `28 B5 2F FD` 切开，再逐帧解压——本机随手抽一份 640 字节的日志，里面就有 4 个帧头。正在写的尾帧可能解压失败，跳过即可，不能因为一帧坏就放弃整份文件。

为了一次点击不把内存和 IO 吃光，扫描还有几条护栏：只找 `*.jsonl.zstd`（往下最多 4 层）、按 mtime 先剪掉今天没动过的日志、最多 400 个文件 / 64 MB、解压后最多读 256 MB。今日用量默认缓存 30 秒（`worlds.dsh-monitor.todayCacheSeconds`），扫一遍约 300~500 ms（包自己的 README 里实测的数），所以短时间连续点不该重扫。

币种不在这一层换算：`¥` 和 `$` 认得，其他币种原样写成 `12.34 XXX`。

### 余额为什么必须走 DSH 侧的插件

余额只能通过 DSH Host 自己的 `deepseekAccount` 服务查——Platform 用本地保存的账号 grant 鉴权。那份 grant 是明文放在 `~/.dsh/.credentials.yaml` 里的，而且手工拼一个请求（头或 origin 不对）有可能让 Host 判定凭据失效、把登录删掉。

所以正确的做法是让 Host 自己问、只把答案发出来：`integrations/dsh-account-bridge/` 是个极小的 Host 插件，启动 1 秒后查一次余额，之后每 60 秒一次，把金额与状态写进 `account.json`（临时文件加 rename，读者不会看到半个文件）。它只写币种、金额和状态，不写任何凭据；Coopanion 只读那个文件。

拿不到时照实说，不伪造成 0：

| `status` | 显示的什么 |
|---|---|
| 文件不存在 | `余额未拿到:桥接插件未装`；完整页另给一句「装好之后重启 DSH 就能看到」 |
| `ready` | 正常显示金额（充值余额与赠金分开） |
| `signed-out` | `余额未拿到:signed-out`，DSH 里没有登录的账号 |
| `failed` | `余额未拿到:failed`，Platform 拒绝或超时 |
| `error` | `余额未拿到:` 加插件写下的那一句错误 |
| `no-service` | 同上，原因里带 `no-service`，Host 里没有账号服务 |

## 四、依赖与安装

### 依赖项

| 依赖 | 版本 / 条件 | 用在哪 | 不满足时 |
|---|---|---|---|
| Node.js | ≥ 22（根 `package.json` 的 `engines.node`，`packageManager` 是 `pnpm@11.28.6`）；今日用量要用 `zlib.zstdDecompressSync` | 解压会话日志 | 解压直接报 `zstdDecompressSync is unavailable in this Node build` |
| Electron | 44.4.4，内置 Node 24 | 桌宠的运行时，已满足 Node ≥ 22 | — |
| DSH | 本机装好 DeepSeek Harness，并且**至少跑过一次会话** | 提供投影缓存、会话日志、余额 | 进度气泡不说话；今日用量写「还没有会话日志活动」 |
| `DSH_HOME` | 可选，缺省 `~/.dsh` | 定位上面三个目录 | 见下面一段 |
| DSH Host 插件 `coopanion-account-bridge` | 本仓库 `integrations/dsh-account-bridge/`，bundle（`dsh.bundle.patch` 指向 `cordis.patch.yml`）；只用 Host 的 `deepseekAccount` 服务（`ctx.get('deepseekAccount')`），零 npm 依赖 | 查余额 | 只影响余额；进度和用量照常 |
| Coopanion 包 `cortico-world-dsh-monitor` | 本仓库 workspace 包，`cortico.api: 6`，`engines.node >= 22` | 读投影缓存、算用量、`detectMilestones()` | 桌宠包以 `workspace:*` 依赖它，缺了装不上 |

关于 `DSH_HOME`：余额与今日用量在没设这个变量时会退回 `~/.dsh`；进度气泡读的投影缓存目录是由它推出来的，没设时按「没有目录」处理（`defaultCacheDir()` 返回空串），于是什么也不弹。想让进度气泡工作，就把 `DSH_HOME` 指向 DSH 的数据目录。

两个功能都不联网，也不需要任何凭据：网络请求和账号凭据都留在 DSH 自己那一侧，Coopanion 这边只读文件。

这组功能**不需要**把 `dsh-monitor` 这个 World 打开：桌宠直接引用包里的读盘函数，`worlds.dsh-monitor.*` 只影响那个 World 自己的事件与工具（`dsh_status`、`dsh_usage`、`dsh_tasks`、`dsh_balance`）。它的定义里 `enabled` 恒为 `false`，要用这些工具时再到 World 总览里启用。

### 装 `coopanion-account-bridge`

它是个 bundle：装进某个 profile，重启 DSH 时随 profile 的 bundle 层一起装配。以 Windows 的 `desktop` profile 为例：

1. 让插件按包名出现在 profile 的 `node_modules` 里。用 junction 指回仓库，改插件代码不用重装：

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"
$src = "D:\CODE\Coopanion\integrations\dsh-account-bridge"
New-Item -ItemType Directory -Force "$profile\node_modules" | Out-Null
New-Item -ItemType Junction -Path "$profile\node_modules\coopanion-account-bridge" -Target $src
```

2. 改 profile 的 `package.json` 两处：

```json
{
  "dependencies": {
    "coopanion-account-bridge": "link:D:/CODE/Coopanion/integrations/dsh-account-bridge"
  },
  "dsh": {
    "profile": {
      "bundles": ["…原来的几项…", "coopanion-account-bridge"]
    }
  }
}
```

3. **重启 DSH**。Host 只在启动时装配插件，改完不重启不会加载。

插件自带的 `cordis.patch.yml` 只做一件事：往 profile 的层栈里插一条 `coopanion-account-bridge`，不用改。不想动依赖的话，也可以照它自己的 [README](../integrations/dsh-account-bridge/README.md) 直接把目录复制进 `node_modules`，profile 的 `package.json` 只需要在 `dsh.profile.bundles` 里加名字。macOS 和 Linux 上 profile 在 `~/.dsh/profiles/desktop`，第 1 步换成 `ln -s` 即可。

装完看两个文件就知道有没有生效：

- `$DSH_HOME/storages/coopanion-bridge/apply-started.json`：`apply()` 跑过就会写，里面有 pid、目录、间隔；
- `$DSH_HOME/storages/coopanion-bridge/apply-error.json`：出现了说明装配或某一拍抛过错，里面是一句话原因。

## 五、配置项

两组键都在控制台的 World 配置页里（也可以直接改 `config.json`）。标了热改的键改完下一拍就生效；`progress.intervalSeconds` 例外，间隔在桌宠启动时装好，改完要下次启动才用新值。

### `worlds.desktop-pet.progress.*`（进度气泡）

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关。关掉后一拍也不弹，但时钟照跑，打开后下一拍就恢复 |
| `intervalSeconds` | `20` | 多久看一次投影缓存（5~600） |
| `coalesceSeconds` | `15` | 两条进度气泡之间至少隔多久（0~600） |
| `idleSeconds` | `90` | 投影文件安静这么久才算这一轮做完（10~3600） |
| `reportCompletion` | `true` | 完成时另弹一条汇报 |

### `worlds.dsh-monitor.*`（World 自己的事件与工具）

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `false` | 定义里恒为 false，由 Bot 的 `declares` 或部署决定；关掉时不投递事件，工具仍能回答状态 |
| `cacheDir` | `''` | 留空用 `$DSH_HOME/storages/session_projcache/sessions` |
| `bridgeDir` | `''` | 留空用 `$DSH_HOME/storages/coopanion-bridge` |
| `sessionsDir` | `''` | 留空用 `$DSH_HOME/sessions` |
| `pollSeconds` | `20` | 轮询间隔 |
| `idleSeconds` | `90` | 会话安静多久算结束 |
| `reportCompleted` | `false` | 任务结束时让 Coo 主动说话。默认关，因为桌宠自己已经弹过气泡，同一件事不该说两遍 |
| `thresholds` | `500000, 1000000, 2000000` | token 档位，逗号分隔，留空关闭 |
| `repeatMinutes` | `30` | 同一提醒的最短重复间隔 |
| `maxSessions` | `40` | 每次最多看多少个最近的会话 |
| `todayCacheSeconds` | `30` | 今日用量的缓存时长（0~3600） |

进度气泡那五个键之外，`worlds.desktop-pet` 的其他键与本文无关，见[桌宠 World 的 README](../packages/cortico-world-desktop-pet/README.md)。

## 六、已知限制

- **没有 job 粒度**。DSH 的后台 job 状态只在内存里，磁盘上没有文件；这里只能到「会话 / 回合 / 待办 / 子代理」这一层。
- **有延迟**。投影缓存是「攒够 200 个事件或 5 秒」才写的，再加上轮询间隔，最坏要等一个间隔再加 5 秒。
- **首拍只建基线**。桌宠启动前做完的事不会补念；被合并或被间隔压下的也不会补讲。
- **进度气泡要 `DSH_HOME`**。没设这个变量时投影缓存目录是空的，而余额和今日用量会退回 `~/.dsh`；DSH 装在别处时容易只坏一半。
- **今日用量只认 `assistant/message`**。`compaction/summary` 这类调用的用量不计，与 DSH 自己的投影一致。
- **余额是快照**。插件每 60 秒刷一次，DSH 关着的时候就停在那里；气泡里那句「N 分钟前从 DSH 读到」就是这份快照的年龄。
- **只认 v4 日志**。文件名是 `session.v4.jsonl.zstd`，DSH 换版本号后这里要跟着改。
- **同一个 `DSH_HOME` 下所有 profile 共用**。投影缓存与日志不按 profile 隔离，别的 profile 跑的会话也会出现在气泡里。
- **单击有判定**。700 ms 内、位移不超过 6 px、且不是拖动，才算点了一下。

## 七、排查

**先看文件在不在**（Windows，PowerShell）：

```powershell
$dsh = if ($env:DSH_HOME) { $env:DSH_HOME } else { "$env:USERPROFILE\.dsh" }
Get-ChildItem "$dsh\storages\session_projcache\sessions" -ErrorAction SilentlyContinue | Measure-Object
Get-ChildItem "$dsh\sessions" -Recurse -Filter session.v4.jsonl.zstd -ErrorAction SilentlyContinue | Measure-Object
Get-Content "$dsh\storages\coopanion-bridge\account.json" -Raw -ErrorAction SilentlyContinue
```

- 第一条 0 个文件：投影缓存没在写——DSH 还没跑过会话，或者 `DSH_HOME` 指错了。
- 第二条 0 个文件：今日用量一定读不到，气泡里会说「今天用量读不到:…」。
- 第三条没输出：桥接插件没装或没跑起来，先看 `apply-started.json` 在不在。

**看余额 JSON 的 `status`**：只有 `ready` 是拿到了；`signed-out` 是 DSH 里没登录；`failed` 是 Platform 拒绝或超时；`error` 看 `error` 那一句；`no-service` 说明 Host 里没有 `deepseekAccount` 服务（profile 装错了，或这个 DSH 版本不带账号平台）。这些都是照实显示的原因，不会缩成 0。

**气泡不弹**，按顺序看：

1. `worlds.desktop-pet.progress.enabled` 是否为真；
2. 桌宠页面是不是连着——没有页面就没有可说的对象；
3. Coo 是不是正在说话、或者 bot 正在跑，这两个时候不弹；
4. 刚启动的 20 秒内只有基线，本来就不弹；
5. 两次之间不到 `coalesceSeconds`，或者同一件事 30 分钟内报过，会被压掉；
6. 上面都正常，就看 Coo 的日志里有没有 `任务进度没能读出来:…`——读盘异常只记一行警告，不会让桌宠挂掉。

## 八、相关代码

| 位置 | 内容 |
|---|---|
| `packages/cortico-world-dsh-monitor/src/dsh-source.ts` | 读投影缓存、解析 `SessionSnapshot`、`isRunning` / `isSettled` |
| `packages/cortico-world-dsh-monitor/src/milestones.ts` | `detectMilestones()`：节点与完成汇报的判定，纯计算 |
| `packages/cortico-world-dsh-monitor/src/account.ts` | 读 `account.json`、扫会话日志算今日用量、多帧 zstd 切片、金额与 token 的格式化 |
| `packages/cortico-world-dsh-monitor/src/world.ts` | `dsh_status` / `dsh_usage` / `dsh_tasks` / `dsh_balance` 四个工具与事件 |
| `packages/cortico-world-desktop-pet/src/progress.ts` | 气泡文案的拼装，纯函数 |
| `packages/cortico-world-desktop-pet/src/world.ts` | `tickProgress()`、`showAccount()`、`accountPeek()` / `accountCard()` |
| `packages/cortico-world-desktop-pet/web/pet-app.js` | 左键单击判定与右键菜单的「账号与余额」 |
| `integrations/dsh-account-bridge/` | DSH Host 侧的余额桥接插件 |
