<!-- Owner: figure.js / motion.js / model.json / figure.json -->
# 幼年体大肥龙 · v0.2.9

主体使用用户上传的站姿与坐姿 PNG 原图，保持原始 1024×1536 分辨率。运行时从原图读取 RGB，只用 AI 提取图的 alpha 抠出背景；白发、白裙、发饰、蕾丝、笔袋、鞋面与默认五官都保留原图颜色。

`figure.js` 将整张原图交给 kit 的 WebGL 网格渲染器，`motion.js` 提供连续变形。走、跑、跳、被拎、转身和舞动继续由 kit 驱动；尾巴、卷发与呼吸用小幅变形，避免部件断开。站姿和坐姿使用两张完整母版，切换时短暂交叉淡入，坐姿不再把站姿上下半身拼在一起。

走跑使用双骨骼 IK，保持原图骨长，膝盖选择朝角色前方弯曲的解；目标幅度按立绘收小，鞋面随踝点整体平移。膝部采用宽范围混合以减轻贴图挤压。腿部图层在运行时从原图像素分出；后鞋的遮挡区域用现有图集填充。起步和停步平滑过渡。

后裙摆在腿部后方保留独立遮挡层，使用已有裙装补全图，只显示在原腿部像素与后裙摆范围的交集内；腿移开后仍有裙摆覆盖。该层跟随身体、位于两条腿后方，并随坐姿切换淡出。定位见 `model.json.skirtFill`。

原图可见的后裙摆也由 `backSkirtMask` 分到腿后方，前裙摆仍覆盖腿根。腿部蒙版按原图肤色行跨度保留细轮廓，排除误带入的裙料，并在两腿共享边界处分配像素；原图像素各归属一个图层。

后腿大腿的隐藏侧按前腿对应高度的轮廓和透明边缘补全，使完整宽度一致；肤色、阴影和边线取自后腿自身，保留后腿可见部分，平滑处理内部旧遮挡边线，在膝盖下方渐变回原轮廓。定位见 `legs[].thighFill`。

站姿使用未切片的完整站姿纹理，避免腿顶与裙摆的独立网格在呼吸时形成细缝。走跑使用分层网格；停步过渡结束后恢复完整母版，挥手仍保留原近臂切换。

关节在母版像素坐标中标定：近腿髋点(555,780)、膝点(507,1040)，远腿髋点(614,785)、膝点(582,1024)。髋点是裙内遮挡位置的估计，膝点依据原图轮廓和高光定位；腿部贴图遮罩仍从裙摆下缘开始，遮罩起点不作为髋点。

`figure.gait = 'biped'` 启用配套 kit 的步态：走/跑周期上限1.05/1.65次每秒，速度上限42/120舞台像素每秒，支撑期64%/38%。`frame.phase` 与实际脚位置传给绘制器；其他形象保持原kit步态。安装本包时还需更新宿主 `web/kit/body.js`，仅覆盖形象目录不会更新宿主步频。

默认表情不覆盖原脸。眨眼、微笑、难过、生气、惊讶、喜欢和慌张使用 AI 表情图的局部眼睛/嘴补片；害羞加轻微腮红。部分词共享基础表情并配合 kit 粒子，不是每个词都有独立贴图。说话替换嘴部。挥手暂时隐藏近臂区域，用补全后的头发、衣裙与完整袖手填充和活动。

## 文件

- `figure.json`：manifest/API 2，18 个表情词、17 个动作词；原版配色、大小及步幅轴。
- `model.json`：原图坐标、站/坐姿映射、脸部定位、图集坐标及两条腿的关节/遮罩；不再使用旧版 27 个部件的 box。
- `figure.js`：贴图加载、原图颜色合成、表情局部补片、WebGL 挂载、资源释放。
- `motion.js`：连续网格变形、大小解析；每个实例独立保存缩放和动画状态。
- `tex/stand-source.png`、`sit-source.png`：上传原图的逐字节副本。
- `tex/stand-alpha.png`、`sit-alpha.png`：AI 提取的透明图；运行时只取 alpha。
- `tex/parts-atlas.png`：补全的后发、尾巴、袖手与腿鞋图集；当前使用近臂、后发和后鞋遮挡补片，其余保留备用。
- `tex/torso-fill.png`：AI 衣裙补全，用于挥手近臂遮挡区与腿后裙摆遮挡区。
- `tex/faces-atlas.png`：3×3 表情图集，运行时仅取眼睛与嘴附近。
- `thumbs/origin.png`：装扮页缩略图。

旧版同名部件 PNG 仍可能留在工作目录或安装目录中；v0.2.0 不引用它们，发布 zip 只包含上述素材。

## 大小

小=100%、中=118%、大=132%、特大=150%，默认大。自定义支持 25%–200% 的整数百分比，按回车或离开输入框保存。173% 编码为 `origin-n173`。缩放绕脚底 `(128,256)`，`extent`、`hits` 和 `anchors` 随当前大小变化。

## 步幅

装扮页提供标准100%、小步50%、大步150%，以及25%–200%的自定义整数百分比。按回车或离开输入框保存，和大小独立。步幅只调整走/跑时脚踝目标的水平距离，抬脚高度、步频和角色移动速度保持原设置。

大小173%、步幅125%保存为 `origin-n173-n125`；旧版只有大小的组合仍按标准步幅显示。默认预设 `origin` 对应大小132%、步幅100%。

## 验证

`examples/dragon/smoke.mjs` 和 `check-entry.mjs` 使用真实无头浏览器。安装了 Playwright 时直接运行；也可通过 `PLAYWRIGHT_MODULE` 指定现有 Playwright 的 `index.mjs`，通过 `PLAYWRIGHT_CHANNEL` 指定 `msedge` 或 `chrome`。

- `node examples/dragon/smoke.mjs`：12,880 帧、透明背景、原图局部颜色、实际闭眼、比例、脚底、大小、实例隔离和资源释放后重新挂载。
- `node examples/dragon/check-entry.mjs`：真实 kit body 在 `sandbox allow-scripts`、`connect-src 'none'` 的 iframe 中加载和执行表情/动作、自定义大小。
- `node examples/dragon/check-gait.mjs`：真实kit控制器的步频、速度、支撑/腾空阶段、phase传递和IK可达性。
- `node examples/dragon/check-skirt.mjs`：走/跑完整周期的裙腿交界透明裂口检查。
- `node examples/dragon/check-layers.mjs`：腿部轮廓连续性、后腿像素归属和裙摆层级检查。
- `node examples/dragon/check-stride.mjs`：真实绘制器中的自定义步幅、大小独立性、旧组合兼容及默认预设恢复。
- `node examples/dragon/check-thigh-idle.mjs`：前后大腿完整宽度匹配、补全部分肤色衔接、站姿呼吸240帧的腿顶暗线与透明裂口检查。
- `node --experimental-strip-types --no-warnings examples/dragon/check-manifest.mjs`：仓库清单和词表校验。

预览：`examples/dragon/?enter=none`；静态检查：`examples/dragon/debug.html?bg=dark&scheme=origin-s`。

来源、提示词和原图哈希见 `ART-SOURCES.md`。素材不进入 Git 提交。
