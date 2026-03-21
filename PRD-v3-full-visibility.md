# PRD: Mission Control v3 — Full Fleet Visibility

**Date:** 2026-03-21
**Owner:** Anton → Marv (build)
**Status:** Ready for implementation

---

## Context

Mission Control v1 shipped: Kanban board, agent grid/tree, activity feed, chat panel, cron viewer, settings. The v2 PRD (hierarchy + parent tasks) partially landed (DB schema + API done, but the Ralph loop failed on gateway credential errors before UI work).

This PRD covers the remaining gaps to give Sameer full real-time visibility into the agent fleet from a single dashboard.

---

## What Already Works (do NOT rebuild)

- Kanban board with drag-drop, 5 columns (inbox/assigned/in_progress/review/done)
- Task CRUD with subtasks, comments, parent/child relationships
- Agent grid + tree view (reads from gateway config, shows sessions)
- SSE live updates for board changes
- Cron jobs API endpoint (`GET /api/gateway/crons`)
- Chat panel (send messages to agent sessions)
- Gateway config viewer in settings
- SQLite DB with tasks, subtasks, comments, activities tables
- systemd-ready server (Express + Vite SSR)

---

## Feature 1: Agent Work Queue Bridge (auto-sync)

### Problem
Anton tracks active Ralph loops in `~/.openclaw/workspace-anton/agent-work-queue.json`. These are the real tasks agents are working on, but they don't appear on the Kanban board.

### Solution
Add a server-side sync that reads `agent-work-queue.json` and creates/updates board tasks.

### Implementation

1. **New route:** `GET /api/work-queue` — returns parsed agent-work-queue.json
2. **New route:** `POST /api/work-queue/sync` — reads the JSON file, upserts tasks:
   - Each work queue item maps to a task via `metadata.work_queue_id`
   - Status mapping: `pending` -> `assigned`, `running` -> `in_progress`, `completed` -> `done`, `failed` -> `review`
   - Sets `assignee_agent_id` from `owner_agent`
   - Title from `name`, description auto-generated from fields (harness, model, loop manager, tmux session, deploy URL)
   - If task already exists (by work_queue_id), update status + description only
   - Creates a `system` comment on status transitions with timestamp
3. **Auto-sync:** On server startup and every 60 seconds, run sync automatically
4. **Work queue file path:** Configurable via `WORK_QUEUE_PATH` env var, default `~/.openclaw/workspace-anton/agent-work-queue.json`

### UI Changes
- Tasks synced from work queue get a small badge/icon (e.g. a "synced" or "auto" chip) to distinguish auto-created vs manual tasks
- Work queue metadata shown in task detail drawer: harness, model, loop manager, tmux session, started_at, completed_at, deploy_url

---

## Feature 2: Cron Dashboard Page

### Problem
Cron data is API-only (`/api/gateway/crons`). No UI to view it.

### Solution
New `/crons` page showing all scheduled jobs.

### Implementation

1. **New page:** `src/pages/crons.tsx`
2. **Add route** in App.tsx: `/crons`
3. **Add sidebar link** in dashboard-sidebar
4. **UI:** Table with columns:
   - Name | Schedule (human-readable) | Status (active/disabled badge) | Last Run (relative time) | Next Run (relative time)
   - Click row to expand: show full cron config, payload type, session target, delivery mode
5. **Data source:** `GET /api/gateway/crons` (already exists)
6. **Polling:** Refresh every 30 seconds

---

## Feature 3: Agent Detail Drawer

### Problem
Clicking an agent shows nothing useful. Need per-agent deep dive.

### Solution
Click an agent card to open a slide-out drawer with session history, current task, and recent activity.

### Implementation

1. **Drawer component:** `src/components/agents/agent-detail-drawer.tsx`
2. **Contents:**
   - Agent info header (emoji, name, role, status, last heartbeat relative time)
   - **Current task** section: shows assigned board task (if any), linked from tasks DB
   - **Active sessions** section: list from `GET /api/agents/:id/sessions` (already exists)
   - **Recent activity** section: filtered from `GET /api/activities?agent_id=:id` (need to add agent filter to activities route)
   - **Work queue entries** section: any items from agent-work-queue.json for this agent (via the new `/api/work-queue` endpoint, filtered client-side)
3. **Activities route update:** Add optional `?agent_id=` query param to `GET /api/activities`

---

## Feature 4: Live Output Tail (tmux integration)

### Problem
For running Ralph loops, Sameer has to SSH in and check tmux to see progress.

### Solution
Show last N lines of tmux output in the task detail and agent detail views.

### Implementation

1. **New route:** `GET /api/work-queue/:id/output` — for a given work queue item ID:
   - Check if `tmux_session` exists: `tmux -S ~/.tmux/sock has-session -t <name>`
   - If alive: `tmux -S ~/.tmux/sock capture-pane -t <name> -p -S -30` (last 30 lines)
   - If dead: return `last_output_tail` from the work queue JSON
   - Return `{ alive: boolean, lines: string[], tmuxSession: string }`
2. **UI:** Monospace output block in task detail drawer and agent detail drawer
   - Auto-refresh every 10 seconds when tmux session is alive
   - Collapsed by default, expand to view
3. **tmux socket:** Use `-S ~/.tmux/sock` for all tmux commands (matches Ralph convention)

---

## Feature 5: systemd Service (production deploy)

### Problem
Server runs ad-hoc. Doesn't survive reboots.

### Implementation

1. **Create** `mission-control.service` in project root:
   ```ini
   [Unit]
   Description=Mission Control Dashboard
   After=network.target

   [Service]
   Type=simple
   User=ubuntu
   WorkingDirectory=/home/ubuntu/Projects/mission-control
   ExecStart=/usr/bin/node dist/server/index.js
   Environment=PORT=3100
   Environment=OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
   EnvironmentFile=/home/ubuntu/Projects/mission-control/.env
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=default.target
   ```
2. **Create** `.env` file with `OPENCLAW_TOKEN=<token>`
3. **Update** `install.sh` to symlink service and enable it
4. **Bind** to `0.0.0.0:3100` so it's accessible via Tailscale IP

---

## Feature 6: Dashboard Home / Overview (stretch)

### Problem
Landing page is just the Kanban board. A summary view would be more useful as the default.

### Solution
Optional: Add a `/` dashboard page with:
- Agent count (online/total)
- Task counts by status (inbox/assigned/in_progress/review/done)
- Last 5 activity feed items
- Next 3 upcoming cron jobs
- Any failed/stuck work queue items (attention needed)

This is stretch. Board as default is fine for v3 if time is tight.

---

## Task Order (priority)

1. Agent work queue bridge (Feature 1) — this is what Sameer asked for
2. Cron dashboard page (Feature 2) — low effort, API exists
3. Agent detail drawer (Feature 3) — high value for monitoring
4. Live output tail (Feature 4) — SSH replacement
5. systemd service (Feature 5) — stability
6. Dashboard overview (Feature 6) — stretch/nice-to-have

---

## Tech Constraints

- SQLite only. No external DBs.
- Node 22 + Express. No new frameworks.
- React 19 + Tailwind v4 + shadcn/ui. Match existing component patterns.
- OPENCLAW_TOKEN from env for gateway auth.
- tmux socket at `~/.tmux/sock`
- All new routes need error handling (try/catch, 502 on gateway failures)
- No breaking changes to existing API or DB schema (additive only)

---

## Acceptance Criteria

- [x] Work queue items from agent-work-queue.json appear on the Kanban board automatically
- [x] Cron jobs viewable on a dedicated /crons page
- [x] Clicking an agent opens a detail drawer with sessions, tasks, activity
- [x] Running Ralph loops show live tmux output in the UI
- [x] Server runs as systemd service, survives reboot
- [x] All existing tests still pass
- [x] No regressions to board, agents, chat, or settings pages
