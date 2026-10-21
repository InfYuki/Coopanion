/**
 * DSH 数据目录的推导：余额桥、会话日志、投影缓存三处的根目录都按同一套规则算。
 *
 * 规则只有一条：`DSH_HOME` 有值（去掉首尾空白后非空）时跟着它走，
 * 否则回退到 `<家目录>/.dsh`，家目录按 `USERPROFILE → HOME → .` 兜底。
 * 兜底读的是**传入的 `env`**，不是 `process.env`——调用方给什么环境就用什么环境，
 * 测试与自定义环境因此都可靠。
 */
import { join } from 'node:path';

/** 家目录兜底：USERPROFILE → HOME → `.`（末位保证永远不返回空串）。 */
function homedirFallback(env: NodeJS.ProcessEnv): string {
  return env.USERPROFILE || env.HOME || '.';
}

/** DSH 的数据根目录：`DSH_HOME` 有值时用它，否则 `<家目录>/.dsh`。 */
export function dshHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.DSH_HOME?.trim() || join(homedirFallback(env), '.dsh');
}

/**
 * DSH 把投影缓存放在这里。
 *
 * `DSH_HOME` 有值时跟着走，缺失时回退到 `~/.dsh/storages/session_projcache/sessions`。
 * 从开始菜单 / 普通 shell 启动的进程没有 `DSH_HOME`，以前这里返回空串，
 * 让 `readSessions('')` 直接给空结果、进度气泡与 `dsh_*` 工具静默失效；现在总有可读的默认路径。
 */
export function defaultCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(dshHome(env), 'storages', 'session_projcache', 'sessions');
}

/** 桥接插件写出的目录。 */
export function defaultBridgeDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(dshHome(env), 'storages', 'coopanion-bridge');
}

/** DSH 的会话日志根目录。 */
export function defaultSessionsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(dshHome(env), 'sessions');
}
