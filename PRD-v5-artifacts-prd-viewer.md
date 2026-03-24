# PRD v5: Task Artifacts & PRD Viewer

**Date:** 2026-03-24
**Owner:** Anton → Marv (build)
**Status:** Ready for implementation

---

## Problem

When Sameer looks at a task on the Mission Control board, he can see the title, status, assignee, subtasks, and live tmux output. But he can't see:

1. **What the agent produced** — files, URLs, screenshots, commits, deployed sites. The output of the work.
2. **What the agent is working against** — the PRD or spec driving the task. The input/plan.

He has to SSH in, open files, check git logs, or ask Anton. That defeats the purpose of a dashboard.

---

## Goal

Add two new sections to the task detail modal:

1. **Artifacts panel** — a list of outputs/deliverables the agent produced, viewable and clickable directly in the dashboard.
2. **PRD viewer** — inline rendered markdown of the PRD file associated with the task.

---

## What Already Exists (do NOT rebuild)

- Task detail modal (`src/components/kanban/task-detail-modal.tsx`) with description, subtasks, tmux output, review actions
- Task metadata stores `work_queue.prd_file` and `work_queue.project_dir` for work-queue-sourced tasks
- `work_queue.deploy_url` already captured but only shown in the description text
- Server reads files from disk (work-queue.ts reads agent-work-queue.json)
- SSE live updates, task CRUD API, all working

---

## Feature 1: Artifacts Panel

### Data Model

Add an `artifacts` array to task metadata. No DB schema change needed (metadata is already a JSON blob).

```typescript
type Artifact = {
  type: "url" | "file" | "commit" | "image" | "log";
  label: string;           // Human-readable name
  value: string;           // URL, file path, commit hash, etc.
  timestamp?: number;       // When it was produced (unix seconds)
};

// In task metadata:
{
  artifacts: Artifact[]
}
```

### Auto-extraction from existing metadata

On task detail fetch, the server should auto-extract artifacts from existing work_queue metadata fields. This gives us artifacts for all existing tasks without any agent-side changes:

- `deploy_url` → `{ type: "url", label: "Deploy URL", value: "<url>" }`
- `prd_file` → `{ type: "file", label: "PRD", value: "<project_dir>/<prd_file>" }`
- `project_dir` → `{ type: "file", label: "Project directory", value: "<path>" }`
- `last_output_tail` → `{ type: "log", label: "Last output", value: "<text>" }` (only if task is done and tmux is dead)

### API

**New endpoint:** `POST /api/tasks/:id/artifacts`

```json
{
  "type": "url",
  "label": "Live site",
  "value": "https://chatppg.com"
}
```

Appends to the `artifacts` array in task metadata. Returns updated task.

**New endpoint:** `DELETE /api/tasks/:id/artifacts/:index`

Removes an artifact by array index. Returns updated task.

Artifacts are also returned as part of the existing `GET /api/tasks/:id` response, extracted from metadata.

### Frontend

New section in `task-detail-modal.tsx`, below the description, above tmux output:

**"Artifacts" section:**
- Collapsible, default open if artifacts exist
- Each artifact rendered as a row with icon + label + action:
  - `url` → external link icon, clickable opens in new tab
  - `file` → file icon, clicking opens the PRD viewer (if .md) or shows path for copy
  - `commit` → git icon, shows short hash
  - `image` → thumbnail preview (stretch goal, v5.1)
  - `log` → terminal icon, expandable monospace block
- Empty state: "No artifacts yet"

---

## Feature 2: PRD Viewer

### API

**New endpoint:** `GET /api/tasks/:id/prd`

Server-side logic:
1. Read task metadata for `work_queue.prd_file` and `work_queue.project_dir`
2. If both exist, resolve the full path: `<project_dir>/<prd_file>`
3. Read the file from disk, return as `{ content: string, path: string, exists: boolean }`
4. If file doesn't exist or metadata is missing, return `{ content: null, path: null, exists: false }`
5. Cap file size at 100KB to prevent huge renders

Security: only allow reading .md files within known project directories. Reject path traversal (no `..` segments after resolution, must be under `/home/ubuntu/`).

### Frontend

New tab or section in `task-detail-modal.tsx`:

**Option A (recommended): Tabbed view in the modal**
- Two tabs at the top of the modal content: "Overview" (current content) | "PRD"
- PRD tab shows rendered markdown with a simple markdown renderer
- Use `react-markdown` (already common in React projects) or a lightweight alternative
- Show file path in a subtle header above the content
- If no PRD is associated: show "No PRD linked to this task"

**Markdown rendering:**
- Headers, lists, code blocks, tables, bold/italic
- No need for full GFM (GitHub Flavored Markdown) — keep it simple
- Monospace font for code blocks, match the tmux output styling
- Scroll within the modal, don't blow out the page

### Loading states
- PRD tab shows a skeleton/spinner while loading
- Cache the PRD content for the duration the modal is open (don't re-fetch on tab switch)
- Show error state if file read fails

---

## Implementation Order

1. **Server: PRD endpoint** (`GET /api/tasks/:id/prd`) — file read with path validation
2. **Server: Artifacts extraction** — auto-extract from existing work_queue metadata on task detail fetch
3. **Server: Artifacts CRUD** (`POST` and `DELETE /api/tasks/:id/artifacts`)
4. **Frontend: Install react-markdown** (or equivalent lightweight renderer)
5. **Frontend: Add tabs to task detail modal** — "Overview" | "PRD"
6. **Frontend: PRD tab** — fetch + render markdown
7. **Frontend: Artifacts section** — list with icons and actions in Overview tab
8. **Tests** — API endpoint tests, artifact extraction tests

---

## Tech Constraints

- SQLite only. No schema migration (artifacts live in the metadata JSON blob).
- Node 22 + Express. Match existing route patterns in `server/routes/tasks.ts`.
- React 19 + Tailwind v4 + shadcn/ui. Match existing component patterns.
- File reads are local disk only. No remote fetching.
- Path validation: resolved path must be under `/home/ubuntu/` and must end in `.md` for PRD reads.
- Keep `react-markdown` minimal. No plugins unless needed for code blocks.
- All existing tests must continue to pass.

---

## Acceptance Criteria

- [ ] `GET /api/tasks/:id/prd` returns rendered PRD content for tasks with a linked PRD file
- [ ] PRD content displays as formatted markdown in a "PRD" tab within the task detail modal
- [ ] Tasks with `deploy_url`, `prd_file`, or `project_dir` in metadata auto-generate artifact entries
- [ ] `POST /api/tasks/:id/artifacts` adds an artifact to the task
- [ ] `DELETE /api/tasks/:id/artifacts/:index` removes an artifact
- [ ] Artifacts section shows in the Overview tab with appropriate icons and click actions
- [ ] URL artifacts open in a new browser tab when clicked
- [ ] Path traversal attempts on the PRD endpoint return 400
- [ ] Modal tabs switch between Overview and PRD without re-fetching data
- [ ] No regressions to existing board, task detail, tmux output, or agent views
- [ ] All existing tests pass plus new tests for PRD and artifact endpoints
