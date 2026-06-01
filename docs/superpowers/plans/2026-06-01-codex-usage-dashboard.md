# Codex 用量 Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first working local Codex token usage dashboard backed by a SQLite database and a React web UI.

**Architecture:** A Node API process scans Codex JSONL session files, stores normalized events in SQLite, and serves aggregate JSON endpoints. A Vite React app renders the quota gauges, token metrics, project distribution, and recent sessions, polling the local API for fresh data.

**Tech Stack:** Node.js ESM, experimental `node:sqlite`, native `http`, React, Vite, lucide-react, Node test runner.

---

### Task 1: Project Skeleton

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `scripts/dev.mjs`

- [x] Define scripts for dev, API, collect, test, build, and preview.
- [x] Configure Vite to proxy `/api` requests to the local Node API.
- [x] Add a dev runner that starts the API and Vite together.

### Task 2: Collector And SQLite

**Files:**
- Create: `server/config.mjs`
- Create: `server/db.mjs`
- Create: `server/project.mjs`
- Create: `server/parser.mjs`
- Create: `server/collector.mjs`
- Create: `test/parser.test.mjs`

- [x] Create the SQLite schema for source files, sessions, token events, and task events.
- [x] Parse Codex JSONL lines into normalized records.
- [x] Scan current and archived Codex session roots.
- [x] Upsert metadata and token events idempotently.
- [x] Add parser tests for session metadata and token count extraction.

### Task 3: API Server

**Files:**
- Create: `server/index.mjs`

- [x] Serve `GET /api/summary` with quota, totals, project rows, recent sessions, and health data.
- [x] Serve `POST /api/collect` to trigger a manual rescan.
- [x] Run the collector on startup and then periodically.
- [x] Serve the Vite build output when `dist` exists.

### Task 4: React Dashboard

**Files:**
- Create: `src/main.jsx`
- Create: `src/App.jsx`
- Create: `src/api.js`
- Create: `src/components/Gauge.jsx`
- Create: `src/components/MetricCard.jsx`
- Create: `src/components/ProjectDistribution.jsx`
- Create: `src/components/RangeTabs.jsx`
- Create: `src/components/SessionRail.jsx`
- Create: `src/styles.css`

- [x] Implement the dark dashboard visual system from the accepted reference direction.
- [x] Render quota gauges, metric cards, project distribution, and recent sessions from API data.
- [x] Add range switching, polling refresh, manual sync, and loading/error states.
- [x] Keep the UI responsive for desktop and mobile widths.

### Task 5: Verification

**Files:**
- Modify: implementation files as needed.

- [ ] Run `npm install`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start `npm run dev`.
- [ ] Verify the rendered dashboard through the Browser plugin or Playwright fallback.

