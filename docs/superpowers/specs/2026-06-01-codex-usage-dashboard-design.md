# Codex 用量 Dashboard 设计记录

## 目标

做一个本地运行的 Codex 用量监控工具，能够读取本机 `~/.codex` 下的会话 JSONL，展示额度窗口、token 消耗、项目占比和最近会话。首版只使用本地可观测数据，不接官方账户或账单 API。

## 产品形态

首版采用 `本地采集器 + SQLite 本地库 + React 本地网页 Dashboard`。

- 采集器读取 `~/.codex/sessions` 和 `~/.codex/archived_sessions`。
- 解析 `session_meta`、`token_count`、`task_started`、`task_complete` 事件。
- SQLite 保存归一化后的 session、token event、task event 和扫描状态。
- React Dashboard 通过本地 API 轮询刷新。
- 默认本地访问地址由 Vite 提供，API 通过同源代理访问。

## 首版信息架构

- 顶部：产品名、Local live 状态、刷新按钮、时间窗口切换。
- 主区：5 小时额度与 7 天额度两个环形仪表。
- 指标卡：今日 token、近 7 天 token、本月 token、活跃会话、最耗 token 项目。
- 项目分布：项目 token 占比环图和排行表。
- 右侧栏：最近会话，展示项目、模型、分支、路径、token 和状态。

## 数据口径

- token 消耗使用 `token_count.info.last_token_usage.total_tokens` 聚合，避免重复累加会话累计值。
- 额度窗口使用最新 `token_count.rate_limits` 中的 primary/secondary 数据。
- 项目归因优先使用 `session_meta.git.repository_url` 和 `session_meta.payload.cwd`。
- 今天、本月按本机时区计算；近 7 天按当前时间向前滚动 7 天。
- “活跃会话”使用最近 task event 判断；首版作为本地观测值，不承诺与 Codex 官方账户页面完全一致。

## 技术约束

- Node.js 使用内置 `node:sqlite`，避免引入原生 SQLite npm 依赖。
- 前端使用 React + Vite。
- 数据库默认路径：`data/codex-usage.sqlite`。
- 采集源和数据库路径均可通过环境变量覆盖。
- 为了部署到另一台设备，运行时必须只依赖该设备本机的 Codex 数据目录；默认读取 `~/.codex`，也支持通过 `CODEX_HOME` 或 `CODEX_USAGE_SOURCE_ROOTS` 指向自定义目录。
- 生产部署使用 `npm run build && npm start`，由 Node API 同时提供静态页面和 JSON API。
