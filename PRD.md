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

## 12. Phase Plan

### Phase 1 (MVP) — Target: Working dashboard
1. Server scaffolding (Express + SQLite + SSE)
2. Gateway client (agent discovery, session proxy)
3. React app with routing (Board, Agents, Settings)
4. Kanban board (full CRUD, task detail modal)
5. Agent status panel (live from gateway)
6. Activity feed (SSE-powered)
7. Chat panel (send/receive via gateway sessions)
8. Dark/light theme
9. Systemd deployment + install script

### Phase 2 (Polish)
- Drag-and-drop kanban columns
- Agent CLI (`mc` command)
- Keyboard shortcuts
- Task search/filter
- Mobile-responsive layout
- Notification sounds

### Phase 3 (Distribution)
- Package as clawhub skill
- Docker image option
- One-line install from any OpenClaw instance

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
