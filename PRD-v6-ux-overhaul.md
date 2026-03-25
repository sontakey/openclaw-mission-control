# PRD v6: UX Overhaul — Sidebar Roster, Gateway Health, Dashboard Home

**Date:** 2026-03-25
**Owner:** Anton → Marv (build)
**Status:** Ready for implementation

---

## Problem

Mission Control works but the UX doesn't give Sameer instant situational awareness. He has to navigate to the Agents page to see who's online. There's no gateway health indicator. The landing page is a raw Kanban board with no summary. Compared to best-in-class agent dashboards, we're missing the "at a glance" layer.

---

## Goal

Three changes that make the dashboard feel alive and give immediate situational awareness:

1. **Sidebar agent roster** — live agent status dots visible from every page
2. **Gateway health indicator** — always-visible connection status in the header
3. **Dashboard home page** — summary view with stats, activity feed, and agent overview as the default landing

---

## What Already Exists (do NOT rebuild)

- Sidebar with flat nav (Board, Agents, Chat, Crons, Settings) using shadcn/ui sidebar components
- `useAgents` hook with 30s polling, returns agent list with status/emoji/name/sessions
- `AgentDetailDrawer` component for agent deep-dive
- `gateway-client.ts` with `GATEWAY_URL` and health check capability
- Activity feed component (`LiveFeed`) currently opened via drawer on the Board page
- SSE infrastructure for real-time updates
- Full agent API (`/api/agents`) returning Agent[] with status, emoji, name, role, sessionKey, lastHeartbeat
- All existing pages: Board, Agents, Chat, Crons, Settings

---

## Feature 1: Sidebar Agent Roster

### Design

Add an "AGENTS" section to the bottom of the sidebar, below the navigation items. Each agent shows:

- Agent emoji (from gateway config)
- Agent name (truncated if needed)
- Status dot: green pulse for online, gray for offline
- When sidebar is collapsed (icon mode): show only emoji + status dot

Online = agent has an active session (sessionKey is not null). Offline = no active session.

### Implementation

1. **New component:** `src/components/layout/sidebar-agents.tsx`
   - Receives agents list from a shared context or hook
   - Renders inside `<SidebarContent>` below the nav, with a `<SidebarGroup>` header "AGENTS"
   - Each agent is a `<SidebarMenuItem>` with emoji, name, and status dot
   - Clicking an agent opens the `AgentDetailDrawer` (reuse existing component)
   - Uses `<SidebarGroupLabel>` for the "AGENTS" header text

2. **Shared agents context:** Create `src/providers/agents-provider.tsx`
   - Wraps the `AgentsStore` in a React context so both the sidebar and agents page share the same data/polling
   - Provides `agents`, `isLoading`, `status`, and `refetch`
   - Replaces direct `useAgents()` calls in pages with `useAgentsContext()`

3. **Update `dashboard-sidebar.tsx`:**
   - Import and render `<SidebarAgents>` below nav
   - Pass click handler that opens agent detail drawer

4. **Collapsed mode:**
   - In icon-collapsed sidebar, show only the emoji with a tiny status dot overlay
   - Tooltip on hover shows agent name + status

### Agent sort order
- Online agents first, then offline
- Within each group, alphabetical by name

---

## Feature 2: Gateway Health Indicator

### Design

Top-right of the header bar, a small chip showing:
- Green dot + "Gateway" when connected
- Red dot + "Disconnected" when gateway is unreachable
- Pulsing/spinner during initial check

### Implementation

1. **New component:** `src/components/layout/gateway-status.tsx`
   - On mount, pings `GET /api/health` (the MC server health endpoint)
   - Also pings gateway via a new endpoint: `GET /api/gateway/health`
   - Polls every 30 seconds
   - Shows green/red chip based on response

2. **New server endpoint:** `GET /api/gateway/health`
   - Server-side: fetches `${GATEWAY_URL}/health` with the auth token
   - Returns `{ status: "ok" | "error", latencyMs: number, gatewayUrl: string }`
   - If gateway is unreachable, returns `{ status: "error", error: "..." }`

3. **Update header in `App.tsx`:**
   - Add `<GatewayStatus />` to the right side of the header bar
   - Position: right-aligned in the header, before any existing header actions

### Visual spec
- Chip style: `rounded-full px-2.5 py-1 text-xs font-medium`
- Green state: `bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400`
- Red state: `bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`
- Dot: 6px circle, matching color, with subtle pulse animation when online

---

## Feature 3: Dashboard Home Page

### Design

New `/` route that replaces the Board as the default landing page. Board moves to `/board` (already has this route, just swap the default).

Dashboard home shows:

**Row 1: Summary stat cards (4 across)**
- "Active Agents" — count of agents with active sessions, with total (e.g. "4 / 12")
- "In Progress" — count of tasks with status `in_progress`
- "In Review" — count of tasks with status `review`
- "Completed" — count of tasks with status `done` (last 24h)

Each card: icon, big number, subtle label below. Clean, minimal.

**Row 2: Two columns**

Left column (wider, ~60%): **Recent Activity**
- Last 10 activity feed items
- Reuse `LiveFeed` component or its data source
- Each item: agent emoji + "Agent did X" + relative timestamp
- Link to full activity feed

Right column (~40%): **Agent Status**
- Compact list of all agents with status dots
- Currently working on: task title (if assigned to an in_progress task)
- Click to open agent detail drawer
- Essentially a richer version of the sidebar roster

**Row 3: Attention Needed (conditional)**
- Only shows if there are stuck/failed items
- Tasks in `review` status for >2 hours
- Work queue items with status `failed`
- Red/amber accent, actionable

### Implementation

1. **New page:** `src/pages/dashboard.tsx`
2. **Update routes in `App.tsx`:** `"/"` renders `DashboardPage`, Board stays at `/board`
3. **Update sidebar nav:** Add "Dashboard" at the top with a `LayoutDashboard` icon, Board moves below it
4. **Stat cards:** Use shadcn `<Card>` component, 4-column responsive grid
5. **Activity data:** New hook `useActivities` or reuse existing activity fetch from `LiveFeed`
6. **Agent status list:** Reuse agents data from shared context

### Stat card visual spec
- Card: `rounded-xl border bg-card p-6`
- Icon: muted color, 20px, top-left
- Number: `text-3xl font-bold tracking-tight`
- Label: `text-muted-foreground text-sm`
- Responsive: 2 columns on mobile, 4 on desktop

---

## Implementation Order

1. **Shared agents context** (provider) — needed by sidebar and dashboard
2. **Gateway health endpoint** (`GET /api/gateway/health`)
3. **Gateway status component** + header integration
4. **Sidebar agent roster** component + drawer integration
5. **Dashboard home page** with stat cards
6. **Dashboard activity feed** section
7. **Dashboard agent status** section
8. **Dashboard attention section** (conditional)
9. **Route updates** — swap default, update sidebar nav
10. **Tests** — new component tests, endpoint tests

---

## Tech Constraints

- React 19 + Tailwind v4 + shadcn/ui. Match existing patterns exactly.
- No new dependencies (use existing lucide-react icons, shadcn components).
- `useAgents` hook already polls every 30s — wrap in context, don't duplicate polling.
- Agent online/offline derived from `sessionKey !== null` (existing logic).
- Gateway health check must not block page render. Show loading state, then resolve.
- Keep dark mode support consistent across all new components.
- Do not use `<AgentDetailDrawer>` import in sidebar directly — use the existing `DrawerProvider` context to open it.
- All existing tests must pass. Add new tests for gateway health endpoint and dashboard page.
- The sidebar must work in both expanded and collapsed (icon) modes.
- Nav items should be grouped under section headers: "OVERVIEW" (Dashboard, Board), "TOOLS" (Chat, Crons), "SYSTEM" (Settings).

---

## Acceptance Criteria

- [ ] Sidebar shows agent roster with emoji, name, and green/red status dot below nav items
- [ ] Sidebar agent roster updates in real-time (30s poll, same as agents page)
- [ ] Clicking a sidebar agent opens the agent detail drawer
- [ ] Collapsed sidebar shows agent emoji with status dot overlay
- [ ] Gateway health chip visible in header on every page
- [ ] Gateway chip shows green "Gateway" when connected, red "Disconnected" when not
- [ ] `GET /api/gateway/health` endpoint returns gateway status with latency
- [ ] Dashboard home page is the default landing route (`/`)
- [ ] Dashboard shows 4 summary stat cards (Active Agents, In Progress, In Review, Completed 24h)
- [ ] Dashboard shows recent activity feed (last 10 items)
- [ ] Dashboard shows agent status list with current task info
- [ ] Dashboard shows "Attention Needed" section when stuck/failed items exist
- [ ] Board page accessible at `/board` 
- [ ] Sidebar nav grouped under section headers (OVERVIEW, TOOLS, SYSTEM)
- [ ] Sidebar nav includes "Dashboard" item with LayoutDashboard icon at top
- [ ] No regressions to existing Board, Agents, Chat, Crons, or Settings pages
- [ ] All existing tests pass plus new tests for added endpoints and components
