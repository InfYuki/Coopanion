# coopanion-account-bridge

一个极小的 DeepSeek Harness Host 插件，把**当前登录账号的余额**发布成一个本地 JSON 文件，供 Coopanion 桌宠读取。

## 为什么需要它

余额只能通过 Host 自己的 `deepseekAccount` 服务查——Platform 用本地保存的账号 grant 鉴权。那份 grant：

- 是**明文**存在 `~/.dsh/.credentials.yaml` 里的；
- 手工拼请求（头不对、origin 不对）可能让 Host 判定凭据失效并**删掉登录**。

所以正确的做法是让 Host 自己问、只把答案发出来。这个插件就是那个「问一次」的人，而且它**只写金额与状态，不写任何凭据**。

## 产出

`$DSH_HOME/storages/coopanion-bridge/account.json`（`$DSH_HOME` 缺省为 `~/.dsh`）：

```json
{
  "at": 1792381988588,
  "status": "ready",
  "wallets": [{ "currency": "CNY", "balance": "12.34" }],
  "bonusWallets": [{ "currency": "CNY", "balance": "5.00" }],
  "profile": { "id": "…", "name": "…" }
}
```

`status` 取值：

| 值 | 含义 |
|---|---|
| `ready` | 拿到了余额 |
| `signed-out` | 没有登录，或查询期间登录态变了 |
| `failed` | 已登录但 Platform 拒绝/超时（**不会伪造成 0 余额**） |
| `no-service` | 这个 Host 上没有 `deepseekAccount` 服务（插件仍加载，只是没东西可查） |
| `error` | 调用本身抛错，`error` 里是一句话 |

金额是**字符串原样**，因为 Platform 会发 `0E-16` 这类科学计数法；赠金单独放在 `bonusWallets`，不并入充值余额。

加载与写入的顺序也是自证的（排查时先看这两个文件）：

| 文件 | 说明 |
|---|---|
| `apply-started.json` | `apply()` 一进来就写。**没有它** = 插件没被加载（多半是没重启 DSH，或 bundle 没进 `dsh.profile.bundles`） |
| `apply-error.json` | 出现即说明查询链路抛过错，`error` 里是原因 |
| `account.json` | 真正的余额快照，见上 |

## 行为

- `apply()` 后 1 秒查第一次，之后每 60 秒一次；写盘用「临时文件 + rename」，读者不会看到半个文件。
- 只用 Node 的 `setTimeout` / `setInterval`（`unref()` 过，不拖住退出），并在 `ctx.on('dispose')` 时清理；**不依赖** `ctx.timer`、`ctx.logger`、`ctx.effect` 这些可选 API，也不声明 `inject`（服务在用时才查，缺了就写 `no-service`）。
- 不注册任何工具、不监听任何事件、不开端口、不打印凭据、失败不重试轰炸。

## 安装

插件作为一个 bundle 装进 profile。**推荐用 junction（`link:`）**，改源码重启即生效：

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"
$src = "D:\CODE\Coopanion\integrations\dsh-account-bridge"
New-Item -ItemType Junction -Path "$profile\node_modules\coopanion-account-bridge" -Target $src
# 1) 在 $profile\package.json 的 dependencies 里加：
#      "coopanion-account-bridge": "link:D:/CODE/Coopanion/integrations/dsh-account-bridge"
# 2) 在 $profile\package.json 的 dsh.profile.bundles 里追加：
#      "coopanion-account-bridge"
# 3) 让 lockfile 认这个依赖（不碰 node_modules）：
#      cd $profile; pnpm install --lockfile-only
```

不想用 junction 就把文件 `Copy-Item` 到那个目录、依赖写成 `file:`。

改完**重启 DSH** 生效（Host 只在启动时装配插件）。重启后先看 `storages/coopanion-bridge/apply-started.json` 有没有出现——那是"插件确实被加载了"的证据。

## 许可

AGPL-3.0-or-later，随 Coopanion 仓库。
