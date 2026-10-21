<!-- Owner: packages/cortico-world-desktop-pet/web/dragon/figure.json; packages/cortico-world-desktop-pet/web/dragon/motion.js; packages/cortico-world-desktop-pet/web/figure-axis.js; packages/cortico-world-desktop-pet/src/world.ts; packages/cortico-world-dsh-monitor/src/account.ts; packages/cortico-world-codex-monitor/src/source.ts; packages/cortico-world-codex-monitor/src/account-client.ts; integrations/dsh-account-bridge/index.js -->
# Coo-GPT 新增功能与依赖

本分支提供大肥龙形象与独立大小、步幅调整，DSH 任务/用量/余额监控，以及 Codex 任务/用量/额度监控。账户信息和任务提醒直接显示在桌宠气泡中，不需要为提醒额外调用模型。

## 功能与依赖总览

| 功能 | 提供的能力 | 必需数据或组件 | 缺失时的表现 |
|---|---|---|---|
| 幼年体大肥龙 v0.2.9 | 站/坐母版、表情、走跑和交互动作 | 完整 API 2 形象包、另行取得的 PNG 素材、本分支配套桌宠 kit | Git 克隆只有代码与清单，不能直接恢复角色图片；缺图时无法正常绘制 |
| 大小与步幅 | 两个独立的整数百分比输入，预设与持久化 | 形象清单声明对应轴；大肥龙绘制器消费这两个值 | 其他未声明自定义轴的形象不会自动获得同样的控制项 |
| DSH 任务气泡 | 子代理、轮次、待办及目标节点提醒 | 本机 DSH、`dsh-session-projection-cache` 插件持续写出的投影缓存 | 无缓存或没有新节点时不产生进度气泡 |
| DSH 今日用量 | 未缓存输入、输出、缓存读取/写入、合计及请求/会话数 | 本机 DSH v4 会话日志；运行时支持 `zlib.zstdDecompressSync` | 缺少日志或解压能力时显示无法取得用量的原因 |
| DSH 账户余额 | 充值余额、赠金、账号与快照时间 | DSH 已登录账号及 Host 服务 `deepseekAccount`；`coopanion-account-bridge` 插件 | 显示桥接未发布、未登录、失败等状态，不填成零 |
| Codex 任务气泡 | 轮次、计划、待办、子代理、目标及异常节点 | 所选本机 Codex 数据目录中的结构化会话日志 | 无日志时本机进度不可用；不覆盖仅存在于其他机器的会话 |
| Codex 额度与账户用量 | 额度桶已用/剩余、重置时间、套餐/点数及接口提供的 token 汇总 | 可启动 `app-server` 的原生 Codex 可执行文件、支持相关接口的版本与登录状态 | 账户数据缺失或标记陈旧；可继续读取本机日志 |
| Codex 本机用量 | 当前目录中日志记录的今日与累计 token | 本机 `sessions/**/*.jsonl` | 扫描预算或历史连续性不足时标记不完整/近似 |

`cortico-world-dsh-monitor` 和 `cortico-world-codex-monitor` 已作为本项目 workspace 依赖接入桌宠。使用这些气泡无需另行安装同名 npm 包，也无需启用独立的 `dsh-monitor` World。独立 World 的 `dsh_*` 工具和模型事件有自己的开关，详见 [DSH 监控说明](DSH-MONITOR.md)。

## 幼年体大肥龙

### 形象、表情与动作

当前清单版本为 `0.2.9`，使用 API 2。站姿和坐姿分别使用完整的 1024×1536 母版；默认五官和主体 RGB 来自原图，AI 提取图提供透明度，非默认表情仅覆盖眼睛、嘴等局部。清单声明 18 个表情词和 17 个动作词，包含眨眼所需的表情处理、微笑、害羞、生气、惊讶，以及走、跑、跳、坐下、睡觉、挥手、转身、鞠躬和舞动等。部分表情词共享基础贴图并配合粒子效果。

走跑使用双骨骼 IK，鞋面随踝点整体平移；起停平滑过渡，站立时恢复完整母版。裙摆前后层级、后腿补全及肤色衔接在绘制器中处理。`biped` 步态依赖本分支配套的 `web/kit/body.js`；只给旧宿主复制形象文件，不会更新宿主的步频和移动规则。

### 大小和步幅

在装扮页选择已导入的大肥龙后，预设与自定义值如下。自定义输入按回车或离开输入框保存。

| 调整项 | 预设 | 默认值 | 自定义范围 | 作用 |
|---|---|---|---|---|
| 大小 | 小 100%、中 118%、大 132%、特大 150% | 132% | 25%–200%，整数 | 按脚底基准缩放形象，并同步命中区域和气泡等锚点 |
| 步幅 | 小步 50%、标准 100%、大步 150% | 100% | 25%–200%，整数 | 改变走/跑脚踝目标的水平距离；不改变抬脚高度、步频或角色移动速度 |

两个值独立保存。大小 173%、步幅 125% 对应 `origin-n173-n125`；旧的 `origin-n173` 继续使用标准步幅，`origin` 恢复 132% 大小与 100% 步幅。通用装扮输入、宿主传值和验证已支持清单中的自定义整数轴；大肥龙声明并实现了大小与步幅这两个轴。

### 素材、安装与开发恢复

第三方角色图片不提交到 Git。仓库中的 `web/dragon` 包含清单、绘制代码及标定数据，克隆仓库不会获得 PNG，也不能据此认定某个安装包已经附带完整素材。

使用已取得且有权使用的完整 `dragon` 形象包，在「装扮 → 导入」选择 zip 或文件夹。包中应包含 `figure.json`、`figure.js`、`motion.js`、`model.json`，以及以下文件；使用配套的当前分支宿主。

```text
tex/stand-source.png
tex/sit-source.png
tex/stand-alpha.png
tex/sit-alpha.png
tex/parts-atlas.png
tex/faces-atlas.png
tex/torso-fill.png
thumbs/origin.png
```

开发者恢复源码目录的预览素材时，仅把 PNG 复制到 `packages/cortico-world-desktop-pet/web/dragon/tex` 和 `thumbs`，保留 Git 中较新的代码。该源码目录用于开发预览；完整形象安装仍走装扮导入。当前开发机已有素材包的位置、SHA256 与恢复示例记录于 [工作交接](../HANDOVER_Coo-GPT.md#本地素材与恢复)，该本机路径不代表公开下载地址。

渲染约束和无头浏览器检查见 [大肥龙说明](../packages/cortico-world-desktop-pet/web/dragon/README.md)，原图和生成素材边界见 [ART-SOURCES.md](../packages/cortico-world-desktop-pet/web/dragon/ART-SOURCES.md)。

## DSH 监控

### 数据与插件

DSH 根目录由非空 `DSH_HOME` 指定；未设置时，家目录按 `USERPROFILE → HOME → 当前目录` 解析，再追加 `.dsh`。投影、日志和账户桥接共用这一规则。DSH 放在默认目录时无需设置环境变量；改用其他数据目录时，让启动 Coopanion 的进程继承正确的 `DSH_HOME`。

| 来源 | 默认根目录内的相对路径 | 依赖 |
|---|---|---|
| 会话投影 | `storages/session_projcache/sessions/*.json` | DSH 的 `dsh-session-projection-cache` 插件；按 DSH profile 的插件装配方式启用，并确认缓存持续写入 |
| 今日 token 用量 | `sessions/**/session.v4.jsonl.zstd` | DSH v4 日志和 zstd 解压能力；不依赖账户桥接 |
| 余额快照 | `storages/coopanion-bridge/account.json` | 本仓库的 `coopanion-account-bridge`，仅负责发布余额与状态 |

账户桥接安装在 DSH 的实际 profile 中。把本仓库 `integrations/dsh-account-bridge` 通过目录复制或本地链接变成 profile 的依赖，在 profile 的 `dsh.profile.bundles` 中追加 `coopanion-account-bridge`，然后重启 DSH。已有的 bundles 必须保留。完整的 Windows junction/本地依赖示例见 [插件安装说明](../integrations/dsh-account-bridge/README.md#安装)。

桥接加载后发布 `apply-started.json`；`account.json` 为余额快照。插件约 1 秒后首次查询，此后每 60 秒查询一次，账号网络请求和登录凭据留在 DSH Host 内。Coopanion 只读这些结果文件，不读取 DSH 凭据。插件缺失仅影响余额，任务进度仍由投影提供，今日用量仍由日志提供。

### 提醒与用量口径

首次采样建立基线，不补播历史；随后对子代理子任务完成、会话轮次结算、待办完成和目标状态变化产生提醒。完成汇报包含会话名、轮数和累计 token。DSH 的结算由投影中的轮次/步骤边界与安静时间共同判断；后台 job 的内存状态不在覆盖范围。

今日用量按本机本地日期统计 `assistant/message` 的 `data.usage`，同一 `turn+step` 以较后记录覆盖；输入、输出、缓存读取、缓存写入分别计算。`compaction/summary` 不在该口径内。桌宠账户入口在点击时读取日志；余额显示桥接快照的年龄。余额中的充值和赠金分开显示，缺失或失败保留原因。

功能配置、诊断文件和独立 World 工具见 [DSH 监控说明](DSH-MONITOR.md)。

## Codex 监控

### 依赖与数据范围

Codex 集成不需要安装额外的 Codex 插件或 MCP 插件。本机数据根目录优先使用 `worlds.desktop-pet.codex.home`，其次是 `CODEX_HOME`，再回退到用户主目录下的 `.codex`。

任务监控读取 `sessions/**/*.jsonl`。可用且结构兼容的 `state_5.sqlite` 提供标题与子代理元数据，`goals_1.sqlite` 提供明确目标状态；读取它们需要运行时支持 `node:sqlite`。SQLite 元数据不可用时，JSONL 监控仍可继续，但相应标题或目标信息可能缺失。日志和数据库采用当前 Codex 本地格式，升级后可能需要更新适配器。

额度查询需要可运行 `app-server` 的原生 Codex 程序。留空可执行文件配置时，自动查找 PATH 和受支持的 Windows 应用目录；发现失败时，在配置中填写实际的原生可执行文件路径。Windows 的 `.cmd`、`.bat` 和 `.ps1` 包装脚本不能直接作为该配置值。

账户查询使用 Codex 已有登录状态，通过 `account/rateLimits/read` 和可选的 `account/usage/read` 取得服务端结果。接口、登录方式或账户不提供某项数据时，界面保留不可用状态。查询可能联网，至少缓存 300 秒，失败时保留旧值并标记陈旧；日志内的额度快照也可作为数据来源。Coopanion 不读取或导出 `auth.json`，不为监控启动模型回合或修改会话。

本机 token 与账户汇总分开标注：本机今日用量按应用时区计算，默认扫描最多 100 个近期日志，每文件尾部最多 2 MiB、每次扫描最多 16 MiB。读取有增量续接、fork 继承过滤与累计记录去重；预算、日志不连续等情况会显示数值可能不完整或近似。其他设备或未同步到当前数据目录的远端会话不在本机任务监控范围，额度重置时间已过也不会自动推算为满额。

### 提醒与账户入口

首次扫描只建基线。之后的明确轮次结束、计划更新、待办完成、子代理完成、目标完成、失败、中断、阻塞和等待批准会形成气泡。“本轮已完成”仅描述该轮，完整目标完成由明确目标状态确认；沉默时长不会被认定为 Codex 成功完成。

左键单击桌宠可查看 DSH/Codex 账户摘要；右键「账号与余额」默认显示 Codex 完整卡，通过 Codex/DSH 按钮切换。关闭 Codex 监控后，该入口直接显示 DSH。额度卡列出服务端返回的额度桶、窗口、重置时间与更新时间，账户 token 汇总按接口实际提供的字段显示。

详细来源和兼容限制见 [Codex 监控说明](CODEX-MONITOR.md)。

## 共用配置与运行条件

以下键位于部署 `config.json` 的 `worlds.desktop-pet` 段，可热更新；在设置的桌宠 World 配置中也可修改。

| 配置 | 默认值 | 含义 |
|---|---|---|
| `progress.enabled` | `true` | DSH/Codex 进度气泡总开关 |
| `progress.intervalSeconds` | `20` | 本地进度采样周期，秒；DSH 写盘节奏会叠加延迟 |
| `progress.coalesceSeconds` | `15` | 同一来源相邻进度气泡的合并间隔，秒 |
| `progress.idleSeconds` | `90` | DSH 结算所用安静时间，秒；不用于判定 Codex 成功 |
| `progress.reportCompletion` | `true` | 完成汇报开关 |
| `codex.enabled` | `true` | Codex 本地监控与账户读取开关 |
| `codex.home` | `""` | 指定本机 Codex 数据根目录；留空按上述规则发现 |
| `codex.executable` | `""` | 指定原生 Codex 可执行文件；留空自动发现 |
| `codex.accountRefreshSeconds` | `300` | 账户请求缓存间隔，最短 300 秒；不改变日志采样周期 |

DSH 与 Codex 独立保存基线，一侧没有数据不会阻止另一侧工作。桌宠页面连接、Coo 空闲且未被正在显示的内容占用时才提醒；连续节点合并显示最多三项，其余显示数量。提醒记录在对话页显示历史中，不进入模型上下文；提醒有数量和合并限制，不能替代完整任务日志。

从源码开发需要 Node.js ≥22、仓库指定的 `pnpm@11.28.6`，以及按根 README 初始化的 Cortico 子模块和依赖。安装版的 Node 由 Electron 提供；开发机的系统 Node 版本不代表安装版运行时的能力。DSH 今日用量还要求实际运行时提供 zstd 解压 API，可在相应 Node 环境中检查：

```powershell
node -e "console.log(process.version, typeof require('node:zlib').zstdDecompressSync)"
```

第二项应为 `function`。浏览器形象验证脚本另需 Playwright 与可用浏览器，这些是开发验证依赖，普通使用者导入形象时不需要安装 Playwright。

## 启用后验证

| 检查 | 预期结果 |
|---|---|
| 装扮导入完整大肥龙包，设置大小 173%、步幅 125% | 重新打开装扮仍保留这两个独立值，走跑步幅发生相应变化 |
| DSH 运行会话后查看投影目录 | 出现并更新会话 JSON；首次采样静默，之后的新节点可产生提醒 |
| 检查 DSH 桥接输出 | 存在 `apply-started.json`，`account.json` 的 `status` 为实际查询结果；`ready` 时显示余额 |
| 查看桌宠账户详情中的 Codex 卡 | 显示额度与时间，或者明确的缺失/陈旧原因；本机和账户 token 分开标记 |
| 在首次采样后运行新的 Codex 任务 | 对日志中实际出现的结构化关键节点显示提醒；失败/中断不会显示成功完成 |

开发修改按仓库要求运行 `pnpm run test`、`pnpm run test:worlds` 和三个 `typecheck` 脚本。形象的浏览器检查从桌宠包目录按其 README 执行，并先恢复 PNG。应用联调使用指向空目录的 `CORTICO_COMPANION_DATA` 开发实例，保留现有应用数据。
