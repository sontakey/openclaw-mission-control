# PRD v4: Live Sessions & Real-Time Task Movement

## Problem
The board only shows tasks from `agent-work-queue.json` (7 stale completed items). There's no visibility into:
1. **Live subagent sessions** — the actual work happening right now
2. **Cron jobs** — 38+ recurring tasks running across the fleet
3. **Ad-hoc work** — tasks spawned via chat that don't go through Ralph loops

Tasks never move across columns in real time. The board is a static snapshot.

## Goal
Make the board a live operational dashboard where Sameer can see every piece of active work, watch tasks move between columns in real time, and get a complete picture of what the agency is doing.

## Architecture Overview

The gateway already exposes sessions and crons via `/tools/invoke`. The server already has:
- `gateway-client.ts` with `listSessions()` and `listCrons()`
- SSE broadcast infrastructure (`sse.ts`)
- Agent status polling with 30s cache (`routes/agents.ts`)

### Data Sources → Board Mapping

| Source | Board Column | How |
|--------|-------------|-----|
| New subagent spawned | **Assigned** | Session appears with status "accepted" |
| Subagent running | **In Progress** | Session is active, has recent messages |
| Subagent completed | **Review** → **Done** | Session status = "completed" |
| Cron job scheduled | (Crons tab, not board) | Show in dedicated crons view |
| Cron job running | **In Progress** | Active cron execution |
| Work queue item | Mapped by `status` field | Existing behavior, keep it |
| Manual task created via UI | Mapped by `status` field | Existing behavior, keep it |

## Implementation

### 1. Session-to-Task Bridge (server/session-bridge.ts) — NEW

Create a new module that polls gateway sessions every 15 seconds and syncs them to the tasks DB.

```typescript
// Pseudo-logic:
async function syncSessionsToTasks(db, broadcaster) {
  const sessions = await listSessions(60); // active in last 60 min
  const existingSessionTasks = getTasksBySource(db, 'session');
  
  for (const session of sessions) {
    const taskId = sessionKeyToTaskId(session.sessionKey);
    const existing = existingSessionTasks.get(taskId);
    
    if (!existing) {
      // New session → create task in "assigned" or "in_progress"
      createTask(db, {
        title: deriveTitle(session), // e.g. "Marv: Fix React hooks crash"
        status: session.status === 'running' ? 'in_progress' : 'assigned',
        assignee_agent_id: session.agentId,
        metadata: { source: 'session', sessionKey: session.sessionKey, ... }
      });
      broadcaster.broadcast('task_created', { task });
    } else if (statusChanged(existing, session)) {
      // Session status changed → move task
      updateTask(db, taskId, { status: mapSessionStatus(session) });
      broadcaster.broadcast('task_updated', { task });
    }
  }
  
  // Mark orphaned session tasks as done (session ended but task still open)
  for (const [taskId, task] of existingSessionTasks) {
    if (!sessions.find(s => sessionKeyToTaskId(s.sessionKey) === taskId)) {
      if (task.status !== 'done') {
        updateTask(db, taskId, { status: 'done' });
        broadcaster.broadcast('task_updated', { task });
      }
    }
  }
}
```

**Session status mapping:**
- Session kind: `subagent` with status `accepted` → task status `assigned`
- Session kind: `subagent` with status `running`/`active` → task status `in_progress`
- Session kind: `subagent` with status `completed` → task status `done`
- Session kind: `subagent` with status `error`/`failed` → task status `review` (needs attention)
- Session kind: `cron` → skip (handled by cron view)
- Session kind: `main` → skip (not a task)
- Session kind: `heartbeat` → skip

**Title derivation:**
- If the session has a `task` field (subagent spawn), use it (truncated to 100 chars)
- If the session has a `label`, use it
- Otherwise: `{agentName}: {sessionKey suffix}`

**Deduplication:**
- Use `metadata.source = 'session'` and `metadata.sessionKey` to identify session-sourced tasks
- Never create duplicates for the same sessionKey
- Don't sync sessions older than 24 hours (stale cleanup)

### 2. Cron Visibility (server/routes/crons.ts) — ENHANCE

The crons page already exists. Enhance it:
- Show last run status with color coding (green=ok, red=error, gray=never run)
- Show "running now" indicator when a cron is actively executing
- Show next run time as relative ("in 12m" vs absolute timestamp)
- Add a "Run Now" button per cron job (calls the cron run API)

### 3. Real-Time SSE Polling (server/session-poller.ts) — NEW

Create a background poller that runs every 15 seconds:

```typescript
let pollInterval: NodeJS.Timeout;

export function startSessionPoller(db, broadcaster, intervalMs = 15000) {
  pollInterval = setInterval(async () => {
    try {
      await syncSessionsToTasks(db, broadcaster);
      // Also broadcast agent status updates
      const agents = await getAgentSnapshot();
      broadcaster.broadcast('agent_status', { agents });
    } catch (err) {
      console.error('Session poll error:', err);
    }
  }, intervalMs);
}

export function stopSessionPoller() {
  clearInterval(pollInterval);
}
```

Start the poller when the server starts (in `server/index.ts`).

### 4. Frontend: Live Board Updates (src/hooks/useSSE.ts) — ENHANCE

The SSE hook already exists. Ensure:
- `task_created` events add cards to the correct column with a slide-in animation
- `task_updated` events move cards between columns with a smooth transition (CSS transition on position)
- `task_deleted` events remove cards with a fade-out
- `agent_status` events update the agent status indicators

**Animation spec:**
- Card entering a column: slide down from top, 300ms ease-out
- Card moving between columns: cross-fade (fade out of old column, fade in to new), 400ms
- Card leaving (deleted/done): fade out + scale down, 200ms

### 5. Frontend: Session Cards (src/components/kanban/) — ENHANCE

Session-sourced task cards should have a distinct visual treatment:
- A small "live" pulse indicator (green dot) for in_progress sessions
- Show the agent name + avatar emoji prominently
- Show the task description (from spawn `task` field) truncated to 2 lines
- Show elapsed time since session started ("running for 2m 14s")
- Clicking opens a detail panel with:
  - Full task/prompt text
  - Session key
  - Agent model
  - If tmux session exists, show live output (existing tmux output feature)

### 6. Board Filters — NEW

Add filter chips above the board:
- **All** (default): show everything
- **Live**: only session-sourced tasks (currently active work)
- **Manual**: only manually created tasks
- **Agent: {name}**: filter by assignee agent

### 7. Task Source Badges — NEW

Each task card should show a small source badge:
- 🔄 for session-sourced (live)
- 📋 for work-queue-sourced
- ✋ for manually created
- This goes in the card's top-right corner, subtle

## API Changes

### New endpoint: POST /api/tasks/sync-sessions
Force an immediate session sync (useful for testing). Returns the number of tasks created/updated/completed.

### Enhanced: GET /api/tasks
Add query param `?source=session|work_queue|manual` to filter by task source.

### New SSE event: session_sync
Broadcast after each sync cycle with summary:
```json
{ "created": 2, "updated": 1, "completed": 3, "total_active": 5 }
```

## Mobile Considerations
- Session cards should be compact on mobile (agent emoji + title only, no metadata)
- Filter chips should horizontally scroll on mobile
- Live pulse indicator should be visible at small sizes (min 8px)

## Build & Deploy
```bash
cd /home/ubuntu/Projects/mission-control
npm run build
# Restart the systemd service
sudo systemctl restart mission-control
```

## Definition of Done
1. Board shows live subagent sessions as task cards in the correct columns
2. Cards move between columns in real time (no page refresh needed)
3. Session-sourced tasks are visually distinct from manual/work-queue tasks
4. Board filters work (All, Live, Manual, per-agent)
5. Completed sessions automatically move to Done
6. Failed sessions move to Review
7. No duplicate tasks for the same session
8. Crons page shows run status, next run time, and "Run Now" button
9. Mobile responsive at 375px
10. Zero console errors
11. Build passes with no TypeScript errors
