# Codex Usage Monitor

本地 Codex 用量看板。它读取当前设备上的 Codex 会话 JSONL，归一化写入 SQLite，并用网页 Dashboard 展示额度窗口、token 消耗、项目占比和最近会话。

## 适用范围

- 默认读取当前设备的 `~/.codex/sessions` 和 `~/.codex/archived_sessions`。
- 可以部署到另一台设备上独立采集，只要那台设备有 Codex 本地数据目录。
- 首版只展示本地可观测值，不等同于官方账单或账户后台的最终统计。

## 本机开发

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/`。

## 生产运行

```bash
npm install
npm run build
npm start
```

默认打开 `http://127.0.0.1:4177/`。生产模式下 Node API 会直接提供构建后的静态页面。

## 部署到另一台设备

1. 把仓库放到目标设备。
2. 确认目标设备已经运行过 Codex，并且存在 `~/.codex/sessions`。
3. 运行：

```bash
npm install
npm run build
npm start
```

如果目标设备的 Codex 数据目录不在默认位置，可以指定：

```bash
CODEX_HOME=/path/to/.codex npm start
```

也可以显式指定多个采集目录。macOS/Linux 用 `:` 分隔，Windows 用 `;` 分隔：

```bash
CODEX_USAGE_SOURCE_ROOTS="/path/to/sessions:/path/to/archived_sessions" npm start
```

## 常用配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CODEX_HOME` | `~/.codex` | Codex 本地数据根目录 |
| `CODEX_USAGE_SOURCE_ROOTS` | 空 | 显式采集目录，优先级高于 `CODEX_HOME` |
| `CODEX_USAGE_DB` | `./data/codex-usage.sqlite` | 本地 SQLite 数据库路径 |
| `CODEX_USAGE_HOST` | `127.0.0.1` | HTTP 监听地址 |
| `CODEX_USAGE_PORT` | `4177` | HTTP 端口 |
| `CODEX_USAGE_SCAN_INTERVAL_MS` | `10000` | 后台扫描间隔 |

需要在局域网访问时，可以使用：

```bash
CODEX_USAGE_HOST=0.0.0.0 npm start
```

只在可信网络中这样做，因为页面会暴露本机 Codex 用量和项目路径信息。

## 最近 Codex 线程状态

最近线程默认按项目合并。展开项目后可以看到该项目下的多个 Codex session，因为 Codex 会按 thread、subagent、review lane 或后台任务生成不同 session，同一个 `cwd` 或 git repo 会归到同一个项目。

- `运行中`：最后任务事件是 `task_started`。
- `已完成`：最后任务事件是 `task_complete`，或没有未闭合任务。
- `无 Token`：有会话记录，但当前时间窗口内没有 token 事件。

每条 session 会显示短 session id 和来源，例如 `main`、`subagent`、`guardian`。

模型字段优先读取 Codex 本地日志里的 `turn_context.model`，例如 `codex-auto` 或 `codex-auto-review`。如果日志没有暴露底层 GPT 型号，就只会显示 Codex 可观测到的 model alias；只剩 provider 时会显示为 `openai provider`，避免把 provider 误当成具体模型。

## 验证命令

```bash
npm test
npm run collect
npm run build
```
