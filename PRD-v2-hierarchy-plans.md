# PRD: Mission Control v2 — Agent Hierarchy + Task Plans

**Date:** 2026-03-20
**Owner:** Anton → Marv (build)

---

## Feature 1: Agent Hierarchy View

### Goal
Replace the flat agent card grid on /agents with an org-chart-style tree that shows the delegation structure.

### Data Source
Read `agents.list[].subagents.allowAgents` from the OpenClaw gateway config. Build a tree:

1. Find the root: the agent with `default: true` (Anton)
2. For each non-root agent, find who delegates to them. The "closest" delegator is their parent.
   - If only Anton delegates to an agent, Anton is the parent (direct report)
   - If both Anton AND Marv delegate to Kevin, Marv is the parent (more specific)
3. Agents with no one delegating to them are standalone (e.g., Voice)

### API Changes
- `GET /api/agents` response adds: `parentId`, `children` (agent ids), `delegatesTo` (allowAgents list)

### UI Design

```
              ┌─────────────┐
              │  🎯 Anton   │
              │ Orchestrator │
              │  ● Online    │
              └──────┬──────┘
       ┌─────────┬───┴───┬──────────┬──────────┐
  ┌────┴────┐ ┌──┴───┐ ┌─┴──┐ ┌───┴───┐ ┌───┴───┐
  │🔧 Marv │ │📢Harry│ │⚖️  │ │💰 Ava │ │🔬 Rae │
  │Engineer │ │Market.│ │Harv│ │Billing│ │Clinical│
  │● Online │ │● Online│ │● On│ │○ Off │ │○ Off  │
  └───┬─────┘ └──┬────┘ └────┘ └───────┘ └───────┘
  ┌───┴───┐  ┌───┴───┐
  │🧪Kevin│  │📝Penny│
  │  QA   │  │Research│
  │● Online│  │● Online│
  └───────┘  └───────┘

  Standalone: 🗣️ Voice (no parent)
```

Each node shows:
- Emoji + name
- Role
- Online/offline dot
- Current task (if any, truncated)
- Click to expand: model, heartbeat interval, last seen

### Implementation
- New component: `src/components/agents/agent-tree.tsx`
- Uses CSS flexbox for the tree layout (no external lib needed)
- Connecting lines via CSS borders/pseudo-elements
- Responsive: collapses to indented list on mobile
- Keep the flat card grid as an alternative view (toggle button: Tree / Grid)

---

## Feature 2: Task Plans (Parent-Child Tasks)

### Goal
Support grouping tasks under a "plan" (parent task). When Anton breaks a project into pieces for different agents, the plan is the umbrella and individual tasks are children.

### Data Model Change

```sql
-- Add parent_task_id to existing tasks table
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
```

A task with `parent_task_id = NULL` is either a standalone task or a plan (parent).
A task with `parent_task_id = <some_id>` is a child of that plan.
A plan is any task that has at least one child.

### API Changes
- `GET /api/tasks` response adds `parent_task_id` and `children` count
- `POST /api/tasks` body accepts optional `parent_task_id`
- `GET /api/tasks/:id` response includes `children` array (child tasks) and `parent` object
- New: `GET /api/tasks?plan=true` returns only parent tasks (plans) with child summary
- New: `GET /api/tasks?parent_id=<id>` returns children of a specific plan

### Board UI Changes

#### Plan Cards
When a task has children, it renders as a **plan card** (visually distinct):
- Thicker left border (brand color)
- Plan title in bold
- Progress bar: X/Y children done
- Agent avatars for all assigned agents across children
- Expandable: click to show child task list inline
- Each child shows: status dot, title, assignee emoji+name

#### New Task Dialog
- Add "Part of plan" dropdown (optional) — lists existing plans
- Add "Create as plan" toggle — creates a parent task

#### Plan View (stretch)
- Click plan card title to open full plan view
- Shows: plan description, all child tasks in a mini-kanban or list, timeline

### Board Kanban Behavior
- **Default view:** Plans show as grouped cards. Standalone tasks show as normal cards.
- **Plan card position:** A plan card appears in the column of its "furthest-behind" child status
  (e.g., if 3 children are done and 1 is in_progress, the plan card shows in In Progress)
- **Expand plan:** Clicking expand shows children inline within the column
- **Filter by plan:** Click plan header to filter board to just that plan's tasks

---

## Tasks

- [x] Add `parent_task_id` column to tasks table via migration in server/db.ts. Add index. Handle existing DB gracefully (ALTER TABLE IF NOT EXISTS pattern).
- [x] Update server/routes/tasks.ts: POST accepts parent_task_id, GET returns parent/children data, add plan filter query params. Include child count and completion stats in list response.
- [x] Update server/routes/agents.ts: add parentId, children, delegatesTo fields to agent response. Build hierarchy tree from config subagents.allowAgents. Root = default agent.
- [x] Create src/components/agents/agent-tree.tsx: org-chart tree component. CSS flexbox layout with connecting lines. Each node: emoji, name, role, status badge, current task. Click to expand details. Standalone agents shown separately below.
- [ ] Update src/pages/agents.tsx: add Tree/Grid toggle. Default to tree view. Grid view uses existing agent cards.
- [ ] Create src/components/kanban/plan-card.tsx: visually distinct plan card with thick left border, progress bar, multi-agent avatars, expand/collapse for children list.
- [ ] Update src/components/kanban/kanban-board.tsx and kanban-column.tsx: group tasks by parent. Plans render as plan-cards. Standalone tasks render as normal cards. Plan position = furthest-behind child status.
- [ ] Update src/components/kanban/new-task-dialog.tsx: add "Part of plan" dropdown and "Create as plan" toggle.
- [ ] Update src/hooks/useTasks.ts: handle parent_task_id in create, fetch plan data, group tasks by parent for board rendering.
- [ ] Update src/lib/types.ts: add parent_task_id, children, parent fields to Task type. Add AgentHierarchyNode type.
- [ ] Build and deploy. Verify: tree renders, plans group on board, create child task under a plan, see progress bar update.
