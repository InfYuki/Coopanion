<!-- Owner: packages/cortico-world-desktop-pet/web/dragon/figure.json; packages/cortico-world-desktop-pet/web/kit/body.js; packages/cortico-world-dsh-monitor/src/paths.ts -->
# Coo-GPT 工作交接

更新时间：2026-10-21。项目：`https://github.com/InfYuki/Coopanion`，工作分支：`Coo-GPT`。本文件用于新会话恢复当前项目；先读取仓库 `AGENTS.md`。

## 仓库与交付边界

- 当前本地仓库：`D:\CODE\Coopanion`。新分支从当前工作分支 `Coo-DS` 的 `10bca87614c270d580d6372f5c18e24427f863b9` 建立，保留既有 DSH 监控、账户和进度面板工作。
- 建立分支时远端 `main` 为 `07dfa744696f0c63292a7af1b7dfc25a09c87cc2`；本次只推送 `Coo-GPT`，不合并 main，不创建 PR，不改写已发布历史。最终提交号以 `git rev-parse HEAD` 为准。
- `vendor/cortico` 保持 `087289dfcdf262a771c573d16dbaf2392ce6764b`，未修改子模块。
- Git 包含源码、形象清单、标定数据、测试和本文。仓库 `AGENTS.md` 禁止提交第三方角色图片，因此角色 PNG 留在本地，`.gitignore` 已排除 dragon 的 tex/thumbs PNG。新克隆需要另行携带下述素材包。
- `scratch/`、构建目录、安装数据和本地历史分析报告 `COOPANION-项目分析报告.md` 不属于本次发布内容。

## 当前形象：幼年体大肥龙 v0.2.9

最近一项用户请求是：稍微增大脚/鞋的运动幅度，并消除补全后腿的突兀色差。v0.2.9 已实现并完成自动校验，仍需用户确认视觉效果。没有其他新指定的待办；新会话应根据用户下一项反馈继续。

用户要求：保留上传母版的线稿、配色、默认脸和比例；允许 AI 补全被遮挡部件并接受局部细节变化。走跑应接近正常人类的小步行走，腿脚不能明显扭曲，鞋子保持整体形状。

关键文件位于 `packages/cortico-world-desktop-pet/`：

| 文件 | 职责 |
| --- | --- |
| `web/dragon/figure.json` | API 2 清单，版本 0.2.9，18 个表情词、17 个动作词，大小与步幅轴 |
| `web/dragon/model.json` | 母版坐标、腿部关节、遮罩、裙摆层级和补全区域 |
| `web/dragon/figure.js` | 原图 RGB 与 alpha 合成、腿部分层、大腿补全、表情局部覆盖和渲染 |
| `web/dragon/motion.js` | 双骨骼 IK、足部目标、连续网格动作、大小与步幅解析 |
| `web/kit/body.js` | 仅对 `gait = 'biped'` 的形象提供配套步频、速度、支撑期及 phase |
| `web/figure-axis.js`、`web/dress.js`、`web/dress.css` | 装扮页通用整数自定义输入 |
| `src/packs.ts`、`src/self.ts`、`web/body-host.js` | 自定义轴验证、持久化与宿主传递 |
| `examples/dragon/` | 隔离浏览器校验及预览 |
| 根目录 `tests/dragon-gait.test.js`、`tests/dress-axis.test.js` | 步态及自定义轴回归测试 |

必须保留的实现约束：

- 主体为 1024×1536 的站/坐完整母版。RGB 直接读取上传原图；AI 抠图只取 alpha。默认脸不覆盖；其他表情只替换眼睛/嘴附近。素材和生成约束见 `web/dragon/ART-SOURCES.md`。
- 髋点隐藏在裙内，不能把贴图可见起点当髋关节。近腿 hip=(555,780)、knee=(507,1040)、ankle=(472,1400)；远腿 hip=(614,785)、knee=(582,1024)、ankle=(570,1379)。IK 选择朝角色前方弯曲的分支。
- 鞋面随踝点整体平移，不旋转或拉伸。v0.2.9 足部水平位移和抬脚幅度比 v0.2.8 增加约 25%，走/跑 kx=0.15/0.225、ky=0.05；膝部混合范围为关节上下各 28 母版像素。
- 腿部按原图肤色行跨度分离，两腿共享边界分配原像素；可见后裙摆位于腿后方，前裙摆仍覆盖腿根。遮挡补片只作用于缺失区域，不能把整张 AI 裙装覆盖在母版上。
- 后大腿完整宽度参考前腿对应高度；颜色、阴影和边线取后腿自身。原遮挡边界以 12 像素过渡，膝下渐回原轮廓。不要再直接复制前腿 RGB 到后腿。
- 静止站姿使用完整未切片母版，避免呼吸导致腿顶细黑线闪烁。走跑才使用分层网格；停步过渡结束后恢复完整母版。
- biped 走/跑步频上限为 1.05/1.65 Hz，速度上限为 42/120 舞台像素/秒，支撑期为 64%/38%。其他形象保持原有 kit 行为。形象包和宿主 kit 需要配套更新。
- 大小预设 100/118/132/150%，默认 132%，自定义整数 25–200%。步幅预设 50/100/150%，默认 100%，自定义整数 25–200%。两轴独立，回车或失焦保存。`origin-n173-n125` 表示大小 173%、步幅 125%；旧的 `origin-n173` 按默认步幅解析。`origin` 恢复 132%/100%。步幅输入只改变水平距离，不改变步频或移动速度。
- 旧 v0.1 的 27 部件切片及程序化默认脸不属于当前实现，不能用它们覆盖 v0.2.9。

## 本地素材与恢复

完整形象包：`D:\DSH-personal\_research\dragon\remake-v02\dragon-v0.2.9.zip`（10,986,954 字节）。

SHA256：`665E2C5BE7030051B7249941D9065548B9FF7A263C2D445AB545CAF57B94D9CB`。

只从 zip 恢复 PNG，保留 Git 中较新的源码。以下 PowerShell 从仓库根目录运行，解压目录需尚不存在：

```powershell
$assetCache = Join-Path $PWD 'scratch/dragon-assets-v029'
Expand-Archive -LiteralPath 'D:\DSH-personal\_research\dragon\remake-v02\dragon-v0.2.9.zip' -DestinationPath $assetCache
$figureRoot = Join-Path $PWD 'packages/cortico-world-desktop-pet/web/dragon'
New-Item -ItemType Directory -Force -Path "$figureRoot/tex", "$figureRoot/thumbs" | Out-Null
Copy-Item -Path "$assetCache/tex/*.png" -Destination "$figureRoot/tex"
Copy-Item -Path "$assetCache/thumbs/*.png" -Destination "$figureRoot/thumbs"
```

运行所需图片为 `tex/stand-source.png`、`sit-source.png`、`stand-alpha.png`、`sit-alpha.png`、`parts-atlas.png`、`faces-atlas.png`、`torso-fill.png` 和 `thumbs/origin.png`。旧 PNG 可以留在本地，但当前绘制器不引用它们。

原始上传文件在 `C:\Users\27932\Downloads`，逐字节存档在 `D:\DSH-personal\_research\dragon\remake-v02\originals`，哈希表为同目录上层 `source-hashes.json`。主站姿为 `幼年体大肥龙-侧身版.png`，主坐姿为 `幼年体大肥龙坐姿母版1.0.png`。研究历史见 `D:\DSH-personal\_research\dragon\HANDOVER.md`，其中旧版本章节不代表当前实现。

本地曾同步 v0.2.9 至 `build/data/home/companion/data/figures/dragon`。该路径是安装数据，不是源码；本次发布没有启动或操作用户安装的应用来验证。后续遵循 AGENTS：用隔离测试或空数据目录的开发实例验证。

## DSH 与进度面板状态

本分支继承 Coo-DS 的三个提交：`06f9903`（DSH 监控）、`23e462c`（桌宠进度/账户面板）、`10bca87`（DSH 文档）。本次同时保留工作区中的以下修正：

- `packages/cortico-world-dsh-monitor/src/paths.ts` 统一 DSH 路径：非空的 DSH_HOME 优先，否则 USERPROFILE → HOME → `.` 下的 `.dsh`。account/source 使用相同默认缓存、桥接及会话路径。
- `packages/cortico-world-desktop-pet/src/world.ts` 在运行中调整进度刷新周期时重新排定计时器，保留基线、预热与合并刷新状态；停止后尚未完成的刷新不会重新开启计时器。
- 对应回归测试位于 dsh-monitor 的 `tests/dsh-source.test.ts` 和 desktop-pet 的 `tests/world-progress.test.ts`；文档为 `docs/DSH-MONITOR.md`。

## 验证与运行

2026-10-21 本次提交前，五项完整检查通过（日志在本地 `scratch/publish-coo-gpt-20261021/`）：

| 命令 | 结果 |
| --- | --- |
| `pnpm run test --maxWorkers=2 --minWorkers=1` | 35 文件，293 通过、1 跳过 |
| `pnpm run test:worlds` | 25 文件，247 通过 |
| `pnpm run typecheck` | 通过 |
| `pnpm run typecheck:web` | 通过 |
| `pnpm run typecheck:worlds` | 通过 |

Node 要求 >=22。本机可用 `C:\Program Files\nodejs\node.exe`，仓库内 pnpm 入口 `.tools/pnpm/package/bin/pnpm.cjs`（11.28.6）。若 pnpm 未在 PATH，替换为 `& 'C:\Program Files\nodejs\node.exe' .tools/pnpm/package/bin/pnpm.cjs run <脚本>`。运行前清除继承的 `ELECTRON_RUN_AS_NODE` 环境变量。新克隆按根 README 安装依赖和初始化子模块。

2026-10-20 的素材/隔离浏览器验证另已覆盖：12,880 帧 smoke、真实 CSP sandbox iframe、大小/步幅独立性、kit 步频与足部轨迹、裙腿交界 828 个采样、大腿宽度误差为 0、补色邻域平均最大差约 0.316/255、站姿呼吸 240 帧无腿顶暗线。这些是自动指标，不代表用户已经确认最新视觉效果。

浏览器脚本从 `packages/cortico-world-desktop-pet` 运行，示例：

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\Users\27932\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs'
$env:PLAYWRIGHT_CHANNEL = 'msedge'
node examples/dragon/check-thigh-idle.mjs
node examples/dragon/check-gait.mjs
node examples/dragon/check-stride.mjs
```

其他脚本及用途见 `web/dragon/README.md`。脚本自建临时本地 HTTP 服务并使用无头浏览器；运行前需恢复图片。本地 Playwright 路径不是跨机器依赖。

当前用户查看的 `http://127.0.0.1:4329/gait.html` 是本地 scratch 预览；进程结束后需重新启动，不能认为新会话中端口必然存在。本机服务文件为 `scratch/dragon-remake-20261020/server.mjs`，可从仓库根目录运行 `node scratch/dragon-remake-20261020/server.mjs`。这些临时文件未入库。跨机器可在 desktop-pet 包目录启动静态 HTTP 服务，打开 `/examples/dragon/index.html?enter=none` 或 `/examples/dragon/debug.html?bg=dark&scheme=origin-s`。

## 新会话起点

1. 读取 `AGENTS.md` 和本文件；确认 `git branch --show-current`、`git status --short`。新环境使用 `git clone --recurse-submodules --branch Coo-GPT https://github.com/InfYuki/Coopanion.git`。
2. 按上文恢复本地素材，阅读 dragon README、motion.js 与 figure.js；不要从旧 zip 覆盖源码。
3. 先取得用户对 v0.2.9 的最新反馈，再调整对应问题。修改关节、遮罩或色彩时同时跑对应数值回归与隔离浏览器检查。
4. 提交前运行 AGENTS 规定的五项检查，按明确路径暂存文件，保持素材、个人数据和 scratch 不入库。没有另行授权时不合并 main 或推送后续改动。
