# Changelog

## 0.1.0

首个版本。

- 读 DSH 的会话投影缓存（`$DSH_HOME/storages/session_projcache/sessions/*.json`），只读、不联网、不需要 token。
- 任务完成与目标结束判定用 DSH 自己的两组投影（`sessionStats.openStep`、`turnBoundary.openTurnStartSeq`）交叉判断，不单靠文件 mtime。
- token 用量按「未命中缓存的输入 / 输出 / 缓存命中 / 缓存写入」四项分列，档位越过与尖峰各自成事件。
- 三个只读工具：`dsh_status`、`dsh_usage`、`dsh_tasks`。
- 环境提示词告诉 Coo 什么时候该说话、什么时候不该念数字。
