<!-- Owner: ../model.json / ../figure.js -->
# v0.2.0 贴图

主体为 1024×1536 的 stand-source.png / sit-source.png，逐字节复制上传原图。
stand-alpha.png / sit-alpha.png 只提供透明蒙版；运行时与原图合成，不使用 AI 输出的 RGB 替换主体颜色。
faces-atlas.png 为 3×3 局部表情源，parts-atlas.png 为 3×2 遮挡补全图集，torso-fill.png 用于挥手近臂区和腿后裙摆遮挡区的填充。
这些新文件之外的旧部件 PNG 不再被 v0.2.0 引用。
