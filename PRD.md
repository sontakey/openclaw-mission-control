# PRD: Mission Control — Personal Agent Fleet Dashboard

**Owner:** Sameer Sontakey
**Orchestrator:** Anton
**Builder:** Marv
**Status:** Ready for implementation
**Date:** 2026-03-20

---

## 1. Overview

Mission Control is a personal web dashboard for monitoring and managing an OpenClaw agent fleet. It runs locally on the VPS, accessible via Tailscale, and talks directly to the OpenClaw gateway API. No external databases, no third-party auth, no Convex, no cloud dependencies.

**Inspired by:** [getclawe/clawe](https://github.com/getclawe/clawe) — we borrow the Kanban board concept, agent status panel, live activity feed, and chat panel design. But we replace Convex with SQLite, strip out multi-tenant SaaS features, and build it as a single-user dashboard that reads live data from the OpenClaw gateway.

**One-line pitch:** Trello for your AI agents, powered by your existing OpenClaw instance.

---

## 2. Goals

1. See all 10 agents at a glance (online/offline, current activity, last heartbeat)
2. Kanban board for task management (create, assign, move, comment)
3. Live activity feed (agent heartbeats, task updates, session events)
4. Chat with any agent directly from the dashboard
5. Zero external dependencies — SQLite + OpenClaw gateway API only
6. Deploys on the VPS, accessible via Tailscale
7. Eventually installable on any OpenClaw instance with one command

---

## 3. Architecture

### Stack
- **Frontend:** React 19 + Vite + Tailwind CSS v4 + shadcn/ui components
- **Backend:** Node.js (Express) — single server process
- **Database:** SQLite (better-sqlite3) — tasks, activities, comments
- **Real-time:** Server-Sent Events (SSE) for live updates to the browser
- **Agent data:** Pulled live from OpenClaw gateway HTTP API (sessions, cron, config)
- **Auth:** Bearer token (reuses OPENCLAW_TOKEN from gateway)

### System Diagram

```
┌─────────────────────────────────────────────────┐
│                    Browser                       │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │  Board   │ │  Agents  │ │   Live Feed     │  │
│  │ (Kanban) │ │ (Status) │ │   (SSE stream)  │  │
│  └────┬─────┘ └────┬─────┘ └───────┬─────────┘  │
│       │             │               │            │
│       └─────────────┼───────────────┘            │
│                     │                            │
└─────────────────────┼────────────────────────────┘
                      │ HTTP + SSE
                      ▼
┌─────────────────────────────────────────────────┐
│              Mission Control Server              │
│              (Express + SQLite)                   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Tasks   │  │ Activity │  │  Gateway     │   │
│  │  CRUD    │  │  Log     │  │  Proxy       │   │
│  │ (SQLite) │  │ (SQLite) │  │  (HTTP→OC)   │   │
│  └──────────┘  └──────────┘  └──────┬───────┘   │
│                                      │           │
│  Serves static React build           │           │
└──────────────────────────────────────┼───────────┘
                                       │
                                       ▼
                          ┌────────────────────────┐
                          │   OpenClaw Gateway     │
                          │   (port 18789)         │
                          │                        │
                          │  • Sessions list       │
                          │  • Session send        │
                          │  • Cron list           │
                          │  • Config get          │
                          │  • Agent identities    │
                          └────────────────────────┘
```

### Directory Structure

```
mission-control/
├── package.json
├── server/
│   ├── index.ts              # Express server entry
│   ├── db.ts                 # SQLite setup + migrations
│   ├── routes/
│   │   ├── tasks.ts          # CRUD for tasks
│   │   ├── activities.ts     # Activity log + SSE stream
│   │   ├── agents.ts         # Proxy to gateway for agent data
│   │   ├── chat.ts           # Proxy chat messages to/from agents
│   │   └── health.ts         # Health check
│   ├── gateway-client.ts     # HTTP client for OpenClaw gateway API
│   └── sse.ts                # SSE broadcast manager
├── src/                      # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── kanban/           # Board, Column, Card, TaskDetail modal
│   │   ├── agents/           # Agent cards, status panel
│   │   ├── live-feed/        # Activity feed with SSE
│   │   ├── chat/             # Chat panel (send to agent sessions)
│   │   ├── layout/           # Sidebar, header, page structure
│   │   └── ui/               # shadcn/ui primitives
│   ├── hooks/
│   │   ├── useSSE.ts         # SSE subscription hook
│   │   ├── useAgents.ts      # Agent data polling
│   │   └── useTasks.ts       # Task CRUD with optimistic updates
│   ├── lib/
│   │   ├── api.ts            # Fetch wrapper for backend
│   │   └── utils.ts          # cn() and helpers
│   └── styles/
│       └── globals.css        # Tailwind + CSS variables
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.server.json
└── install.sh                # One-command install script
```

---

## 4. Data Model (SQLite)

### tasks
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'inbox'
    CHECK (status IN ('inbox', 'assigned', 'in_progress', 'review', 'done')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assignee_agent_id TEXT,           -- OpenClaw agent id (e.g. 'marv', 'penny')
  created_by TEXT,                   -- agent id or 'human'
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  metadata TEXT                      -- JSON blob for extra data
);
```

### subtasks
```sql
CREATE TABLE subtasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  assignee_agent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'blocked')),
  blocked_reason TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

### comments
```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author TEXT NOT NULL,               -- agent id or 'human'
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'comment'
    CHECK (type IN ('comment', 'status_change', 'system')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### activities
```sql
CREATE TABLE activities (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  type TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  message TEXT NOT NULL,
  metadata TEXT,                       -- JSON
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_activities_created ON activities(created_at DESC);
CREATE INDEX idx_activities_agent ON activities(agent_id);
```

---

## 5. API Routes

### Tasks
- `GET /api/tasks` — list all tasks (optional ?status=inbox&assignee=marv)
- `GET /api/tasks/:id` — task detail with subtasks and comments
- `POST /api/tasks` — create task
- `PATCH /api/tasks/:id` — update task (status, title, description, assignee, priority)
- `DELETE /api/tasks/:id` — delete task
- `POST /api/tasks/:id/comments` — add comment
- `POST /api/tasks/:id/subtasks` — add subtask
- `PATCH /api/tasks/:id/subtasks/:sid` — update subtask (toggle done, status)

### Agents
- `GET /api/agents` — returns merged data: agent config from OpenClaw + live session status
- `GET /api/agents/:id/sessions` — active sessions for an agent

### Chat
- `POST /api/chat/send` — send message to agent session via gateway sessions_send
- `GET /api/chat/history/:sessionKey` — fetch session history via gateway

### Activity Feed
- `GET /api/activities` — recent activity (paginated)
- `GET /api/activities/stream` — SSE endpoint for real-time activity feed

### Gateway Proxy
- `GET /api/gateway/health` — gateway health status
- `GET /api/gateway/crons` — list cron jobs
- `GET /api/gateway/sessions` — list all sessions

### Health
- `GET /health` — server health check

---

## 6. Gateway Integration

The Mission Control server talks to OpenClaw gateway via its HTTP API:

```typescript
// gateway-client.ts
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_TOKEN;

async function gatewayPost(endpoint: string, body: object) {
  const res = await fetch(`${GATEWAY_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Tool invocation pattern (same as Clawe uses)
export async function invokeTool(tool: string, args: Record<string, unknown>) {
  return gatewayPost('/tools/invoke', { tool, args });
}

// Convenience wrappers
export const listSessions = (activeMinutes?: number) =>
  invokeTool('sessions_list', { activeMinutes });

export const sendToSession = (sessionKey: string, message: string, timeoutSeconds = 30) =>
  invokeTool('sessions_send', { sessionKey, message, timeoutSeconds });

export const getSessionHistory = (sessionKey: string, limit = 50) =>
  invokeTool('sessions_history', { sessionKey, limit });

export const listCrons = () =>
  invokeTool('cron', { action: 'list' });

export const getConfig = () =>
  invokeTool('gateway', { action: 'config.get' });
```

### Agent Discovery

On startup and periodically (every 60s), the server reads the gateway config to discover all configured agents:

```typescript
// From config.agents.list → agent id, name, emoji, workspace, model
// From sessions_list → active sessions, last activity timestamps
// Merge into a unified agent status object
```

---

## 7. Frontend Pages

### 7.1 Board (Kanban) — `/` (default)

Layout matches Clawe's board page:
- Left sidebar: collapsible agents panel (filter tasks by agent)
- Main area: 5-column kanban (Inbox → Assigned → In Progress → Review → Done)
- Kanban cards show: title, description preview, priority badge, assignee emoji+name, subtask progress
- Click card → task detail modal (full description, subtask list with progress bar, comments, review actions)
- "New Task" button → dialog with title, description, priority, assignee dropdown
- Drag-and-drop between columns (stretch goal, nice to have)

### 7.2 Agents — `/agents`

- Grid of agent cards (same design as Clawe's agents page)
- Each card: emoji, name, role, online/offline badge, current task or last seen time
- Online status derived from session activity (active session = online, last heartbeat > 5min = offline)

### 7.3 Settings — `/settings`

- Show connected gateway info (URL, version, agent count)
- API key status (which providers are configured)
- Cron job list (read-only view of all crons from gateway)
- Theme toggle (dark/light)

### 7.4 Persistent Elements

- **Sidebar:** Board, Agents, Settings navigation (matches Clawe's icon sidebar)
- **Chat Panel:** Slide-out right panel, select any agent to chat with (messages go via sessions_send)
- **Live Feed:** Drawer with filterable activity stream (SSE-powered)

---

## 8. Real-Time (SSE)

The server maintains an SSE broadcast channel. When anything changes (task created, status updated, comment added, agent heartbeat detected), it pushes an event:

```typescript
// Event types
type SSEEvent =
  | { type: 'task_created'; task: Task }
  | { type: 'task_updated'; task: Task }
  | { type: 'task_deleted'; taskId: string }
  | { type: 'comment_added'; comment: Comment; taskId: string }
  | { type: 'agent_status'; agents: AgentStatus[] }
  | { type: 'activity'; activity: Activity };
```

The frontend subscribes via `useSSE()` hook and updates local state in real-time.

Agent status is polled server-side every 30 seconds (gateway sessions_list) and broadcast via SSE when changes are detected.

---

## 9. CLI for Agents

A lightweight CLI script (`mc`) that agents can call from their HEARTBEAT or task handlers:

```bash
# Task management
mc tasks                              # List tasks
mc task:view <id>                     # View task detail
mc task:create "Title" --assign marv --priority high
mc task:status <id> in_progress       # Update status
mc task:comment <id> "Working on it"  # Add comment
mc subtask:add <id> "Step 1"          # Add subtask
mc subtask:done <id> 0                # Complete subtask by index
```

This is a simple shell script that calls the Mission Control HTTP API with curl. Agents use it from HEARTBEAT.md or task processing.

---

## 10. Styling

- **Design System:** shadcn/ui components (same as Clawe)
- **Theme:** Dark mode default, light mode toggle
- **Color scheme:** Same oklch-based CSS variables as Clawe (copy their globals.css as starting point)
- **Brand color:** Teal/cyan accent (--brand) to distinguish from Clawe's rose
- **Kanban columns:** Soft colored backgrounds per status (rose=inbox, orange=assigned, blue=in-progress, purple=review, green=done)
- **Agent avatars:** Emoji in colored circles, consistent hash-based coloring
- **Typography:** Geist Sans + Geist Mono (same as Clawe)
- **Layout:** Fixed sidebar + scrollable main area + slide-out chat panel

---

## 11. Deployment

### install.sh (one-command setup)

```bash
#!/bin/bash
# Mission Control installer for OpenClaw instances

INSTALL_DIR="${MISSION_CONTROL_DIR:-$HOME/mission-control}"
PORT="${MISSION_CONTROL_PORT:-3100}"
GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://127.0.0.1:18789}"

# Clone, install deps, build
git clone https://github.com/sontakey/mission-control.git "$INSTALL_DIR"
cd "$INSTALL_DIR"
npm install
npm run build

# Create .env
cat > .env <<EOF
PORT=$PORT
OPENCLAW_GATEWAY_URL=$GATEWAY_URL
OPENCLAW_TOKEN=${OPENCLAW_TOKEN}
EOF

# Create systemd service
sudo tee /etc/systemd/system/mission-control.service <<EOF
[Unit]
Description=Mission Control Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node dist/server/index.js
Restart=always
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mission-control

echo "Mission Control running at http://$(hostname):$PORT"
```

### Access
- Tailscale URL: `http://agents.centaur-court.ts.net:3100`
- Health check: `http://agents.centaur-court.ts.net:3100/health`

---

## 12. Tasks

- [ ] Scaffold project: package.json, tsconfig.json, tsconfig.server.json, vite.config.ts, tailwind config. Install dependencies: react, react-dom, react-router-dom, express, better-sqlite3, @types/better-sqlite3, @types/express, tailwindcss v4, lucide-react, clsx, tailwind-merge, vite, typescript, tsx, @radix-ui/react-dialog, @radix-ui/react-scroll-area, @radix-ui/react-popover, @radix-ui/react-tooltip, @radix-ui/react-collapsible, @radix-ui/react-select, @radix-ui/react-separator, class-variance-authority. Set up the directory structure from section 3.
- [ ] Create server/db.ts with SQLite schema (tasks, subtasks, comments, activities tables from section 4). Create server/index.ts Express entry that serves static files from dist/client and mounts API routes. Add build scripts to package.json: "dev" (concurrent vite dev + tsx server), "build" (vite build + tsc server), "start" (node dist/server/index.js).
- [ ] Create server/gateway-client.ts — HTTP client for OpenClaw gateway at localhost:18789. Implement invokeTool(), listSessions(), sendToSession(), getSessionHistory(), listCrons(), getConfig() per section 6. Auth via OPENCLAW_TOKEN env var.
- [ ] Create server/sse.ts — SSE broadcast manager. Manages connected clients, broadcasts events typed per section 8. Create server/routes/health.ts with GET /health endpoint.
- [ ] Create server/routes/tasks.ts — full CRUD per section 5 (GET list, GET detail with subtasks+comments, POST create, PATCH update, DELETE, POST comments, POST/PATCH subtasks). On every mutation, log to activities table and broadcast via SSE.
- [ ] Create server/routes/agents.ts — GET /api/agents reads gateway config (agents.list) and merges with live session data (sessions_list). GET /api/agents/:id/sessions returns sessions for a specific agent. Polls gateway every 30s and caches.
- [ ] Create server/routes/activities.ts — GET /api/activities (paginated, recent first). GET /api/activities/stream is the SSE endpoint.
- [ ] Create server/routes/chat.ts — POST /api/chat/send proxies to gateway sessions_send. GET /api/chat/history/:sessionKey proxies to gateway sessions_history.
- [ ] Set up React frontend: src/main.tsx, src/App.tsx with react-router-dom (routes: / for Board, /agents, /settings). Create src/lib/api.ts fetch wrapper and src/lib/utils.ts with cn() helper. Create src/styles/globals.css with the Clawe-inspired oklch theme variables (section 10) but with teal brand color.
- [ ] Create shadcn-style UI primitives in src/components/ui/: button, badge, card, dialog, scroll-area, popover, tooltip, input, textarea, select, separator, skeleton, spinner. Use the Clawe reference files in reference/ as the source — adapt them to remove @clawe/ui imports and use local paths.
- [ ] Build the layout shell: src/components/layout/sidebar.tsx (icon sidebar with Board, Agents, Settings nav items), src/components/layout/header.tsx, src/components/layout/app-layout.tsx (sidebar + header + main content area + chat panel slot). Match the Clawe dashboard layout from reference/layout.tsx.
- [ ] Build the Kanban board: src/components/kanban/kanban-board.tsx, kanban-column.tsx, kanban-card.tsx, task-detail-modal.tsx, types.ts. Adapt from reference/kanban/ components — replace Convex useQuery/useMutation with fetch calls to /api/tasks. Include the new-task dialog.
- [ ] Build src/hooks/useSSE.ts — subscribes to /api/activities/stream, parses SSE events, exposes typed event callbacks. Build src/hooks/useTasks.ts — fetch tasks, CRUD operations with optimistic updates, auto-refresh on SSE task events. Build src/hooks/useAgents.ts — poll /api/agents every 30s for live status.
- [ ] Build the agents panel: src/components/agents/agents-panel.tsx and agents-panel-item.tsx for the Board page sidebar (filterable). src/components/agents/agents-page.tsx as the /agents route — grid of agent cards with status. Adapt from reference/agents-panel/ components.
- [ ] Build the live feed: src/components/live-feed/live-feed.tsx and live-feed-item.tsx. SSE-powered, filterable (All, Tasks, Messages, Online). Adapt from reference/live-feed/ components. Wire into layout as a drawer/panel toggle.
- [ ] Build the chat panel: src/components/chat/chat-panel.tsx (slide-out right panel), agent selector dropdown, message list, input. POST /api/chat/send to talk to agents, GET /api/chat/history to load history. Adapt from reference/chat/ components.
- [ ] Build the Settings page: /settings route showing gateway connection info, agent list from config, cron jobs list (read-only from gateway), dark/light theme toggle. Store theme preference in localStorage.
- [ ] Wire everything together: Board page with agents panel + kanban + live feed button. Verify all API routes work end-to-end. Add dark mode class toggle. Make sure the app builds clean with `npm run build`.
- [ ] Create install.sh per section 11 — one-command setup script. Create .env.example. Add a README.md with setup instructions, screenshots placeholder, and architecture overview. Final cleanup: remove reference/ dir from git, ensure .gitignore covers node_modules, dist, .env.

---

## 13. Non-Goals (explicitly out of scope)

- Multi-user auth / user accounts (this is single-user)
- Multi-tenant support (one dashboard per OpenClaw instance)
- Convex or any cloud database
- Next.js (Vite is faster and simpler for this use case)
- Docker requirement for the dashboard itself (just a Node process)
- Mobile app

---

## 14. Reference

### Clawe Components to Adapt
From `getclawe/clawe` (MIT licensed):
- `components/kanban/` — KanbanBoard, KanbanColumn, KanbanCard, TaskDetailModal, types
- `components/live-feed/` — LiveFeed, LiveFeedItem
- `(dashboard)/board/_components/agents-panel/` — AgentsPanel, AgentsPanelItem
- `(dashboard)/agents/page.tsx` — Agent cards grid
- `(dashboard)/_components/chat-panel.tsx` — Chat slide-out
- `packages/ui/src/styles/globals.css` — CSS variables and theme
- `packages/ui/src/components/` — shadcn/ui primitives

All of these need to be adapted to remove Convex hooks (useQuery/useMutation) and replace with our own fetch-based hooks + SSE.

### OpenClaw Gateway API Endpoints Used
- `POST /tools/invoke` with tool=sessions_list — list active sessions
- `POST /tools/invoke` with tool=sessions_send — send message to agent
- `POST /tools/invoke` with tool=sessions_history — get chat history
- `POST /tools/invoke` with tool=cron action=list — list cron jobs
- `POST /tools/invoke` with tool=gateway action=config.get — read config
