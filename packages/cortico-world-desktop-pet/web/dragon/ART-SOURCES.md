<!-- Owner: tex/ / model.json -->
# 素材来源与生成约束

制作日期：2026-10-20。使用内置 `image_gen`，未使用 API/CLI。用户明确选择允许 AI 补全被遮挡部件并接受局部细节变化。主体仍直接读取上传原图的 RGB。

## 原图

- 主站姿：`幼年体大肥龙-侧身版.png`。SHA256 `3228534127B9FBCD99332FD78932C8731BE73E76FB3F8F884112328617E52029`。
- 主坐姿：`幼年体大肥龙坐姿母版1.0.png`。SHA256 `D7932A28936F3F1F05F3F7A3CD309ACF4AD242FFECE357EF406D80652589A9B4`。
- 无头裙装图用于核对袖口、腰带、笔袋和裙摆，并作为衣裙补片的编辑输入。
- 三视图、镜像修正三视图与无脸图作为补充设计参考存档，未覆盖主体 RGB，也未使用无脸图替换默认原脸。

六张上传原图的逐字节副本与完整哈希表保存在研究目录 `remake-v02/originals/` 和 `remake-v02/source-hashes.json`。本包两个 `*-source.png` 是其中站/坐姿的原始文件副本。

## 最终提示词集

以下记录各次生成的最终目标与固定约束；生产素材始终保留生成工具输出的 alpha。

### 站姿、坐姿透明图（分别调用）

Use case: background-extraction / identity-preserve. Edit the provided original illustration ONLY by cleanly removing the plain white exterior background to genuine transparent alpha. Preserve the character with extraordinary fidelity: do not redraw or redesign her face, eyes, mouth, bangs, horns, curl outlines, pale blue-white garment fabric, sleeve shape, ribbon, pen pocket, tail scales, bare legs or fluffy slippers. Keep all white highlights and white dress and white hair opaque. Clear background inside hair loops while preserving fine lavender outlines. No ground shadow, no pedestal, no checkerboard painted into the image. CRITICAL REGISTRATION: keep the exact original 1024x1536 canvas, original character location, size and pose, original pixels and silhouette as far as possible. Do NOT recenter, enlarge, crop, rotate, mirror or simplify. Same approximately 5.5-head proportions as the reference. Return the same full body figure on transparency with nothing else.

仅使用这些生成图的透明度，颜色仍来自用户原图。输出为 `stand-alpha.png` 与 `sit-alpha.png`。

### 遮挡补全图集

Use case: precise-object-edit, animation component restoration. Create a production sprite atlas of exactly SIX separate isolated body parts from the standing reference. The headless reference clarifies original sleeves, outfit and tail underneath the hair. Strict identity/style fidelity: same extremely pale icy blue and lilac pencil-like lineart, fine watercolor shading, same curls, fabric, pen details and fluffy rose slippers. Genuine transparent background. Three columns by two rows, equal cells, transparent margins, no labels, lines or assembled figures. Reading order: complete long voluminous back-hair curtain with hidden locks restored, no face/horns/front bangs/outfit/skin; complete hanging icy-blue dragon tail with curled tip and restored thick root, fine diamond scales and left-edge fin spikes; near sleeve/hand from the large viewer-left sleeve, shoulder ruffle to wrist cuff and relaxed five-finger hand; far sleeve/hand in the narrower perspective; viewer-left bare lower leg and original fluffy rose slipper; viewer-right bare lower leg and original fluffy rose slipper. No stockings, skirts or extra limbs in leg cells. These are animation layers, not stickers. Keep natural original proportions and thin elegant outlines; hidden-pixel completion should be modest and conservative.

输出为 `parts-atlas.png`。当前使用近臂、后发及后鞋遮挡补片；其余图集单元作为备用素材。v0.2.1 的腿部优化复用这张图集，未增加 AI 重绘。

### 表情图集

Use case: precise-object-edit / identity-preserve. Make an expression atlas for the EXACT same character. Preserve original gentle half-lidded pale-blue eyes, fine mauve thin lashes, tiny nose and mouth, soft watercolor shading and light skin. No round cartoon eyes, thick black outlines or identity/view changes. Square three-by-three regular grid. Every head/neck portrait at the same size and location, slightly right-facing. Identical horn, ahoge, bangs, viewer-left blue flower clip, viewer-right white rose and tassel registration. Full head with transparent padding, no body, labels or borders. Only eyes, brows and mouth change. Reading order: reference neutral; both eyes fully closed with delicate eyelashes and tiny closed mouth; gentle happy crescent-eye smile and subtle blush; sad downturned eyes/brows/mouth, no tears; softly angry narrow eyes and tiny pout; surprised wider pale-blue eyes and tiny O mouth; flustered > < eyes, pink blush, wavering mouth, no sweat; pale-blue heart irises in the same narrow eyes and tender smile; reference neutral eyes with a tiny softly open talking mouth. All nine faces are the same original person. High-resolution light outlines and crisp details.

输出为 `faces-atlas.png`。只覆盖眼睛与嘴附近，默认 neutral 不使用生成脸。

### 衣裙补片

Use case: precise-object-edit, hidden animation layer. Keep the exact 1024x1536 headless-reference canvas and outfit position/size. Remove both sleeves/hands, both legs/slippers and dragon tail. Leave only off-shoulder torso, shoulder/neck skin and complete skirt with original waist ribbon, bow and tails, pen pocket/pens, both small hem bows and layered back ruffles. Fill the small fabric regions behind sleeves with plausible continuous pale-lavender folds. Preserve visible details, pale color and delicate lineart; no head, arms, hair, hands, legs, shoes, extra ornaments or background. Genuine transparency while white cloth remains opaque; no text, shadow, checkerboard, recentering or cropping.

输出为 `torso-fill.png`。生成的全衣裙轮廓与母版有局部差异，因此运行时只用于原近臂遮挡区与腿后裙摆遮挡区，不能作为全身主体使用。补全裙摆限制在原腿部像素与标定裙摆范围的交集内；母版中可见的后裙摆另行按原像素分层，保留原色。两者均绘制在腿后方，前裙摆仍遮住腿根。v0.2.7 的分割修复未增加AI素材。

## 校验边界

后腿大腿补全在运行时参考前腿对应行的宽度与透明边缘；v0.2.9 改用后腿自身的颜色、阴影和边线完成隐藏侧，避免前腿肤色产生色差。未增加AI图片；站姿直接绘制完整母版。原始PNG文件不变。

主体原图文件哈希保持不变。运行时存在透明蒙版、GPU 插值与小幅动作变形，因此渲染截图不宣称逐像素等于原图。原脸静止时不加表情补片；非 neutral 状态允许局部 AI 表情差异。公开包不包含旧部件 PNG。
