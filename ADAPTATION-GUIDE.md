# Adaptation Guide — Clawe → Mission Control

This project ports the UI from getclawe/clawe (MIT licensed). The component files in src/ are copied
directly from that repo. Your job is to adapt them, NOT rewrite them.

## What Needs to Change

### 1. Import Path Rewrites (EVERY file)

Replace these import patterns:

| Clawe import | Mission Control import |
|---|---|
| `from "@clawe/ui/components/..."` | `from "@/components/ui/..."` |
| `from "@clawe/ui/lib/utils"` | `from "@/lib/utils"` |
| `from "@clawe/backend"` | REMOVE (no Convex) |
| `from "@clawe/backend/types"` | `from "@/lib/types"` (create local types) |
| `from "@clawe/shared/agents"` | `from "@/lib/agents"` |
| `from "@clawe/shared/squadhub"` | REMOVE |
| `from "@clawe/shared/timezone"` | REMOVE |
| `from "@dashboard/..."` | `from "@/components/layout/..."` |
| `from "@/providers/..."` | `from "@/providers/..."` (keep as-is) |
| `from "@/hooks/..."` | `from "@/hooks/..."` (keep as-is) |
| `from "@/components/..."` | `from "@/components/..."` (keep as-is) |
| `"use client"` | REMOVE (not Next.js, just Vite + React) |

### 2. Data Layer — Replace Convex with Fetch

Every component that uses `useQuery(api.xxx, {})` or `useMutation(api.xxx)` needs to be
rewritten to use our own hooks:

- `useQuery(api.tasks.list, {})` -> `useTasks()` hook (fetches GET /api/tasks)
- `useQuery(api.agents.squad, {})` -> `useAgents()` hook (fetches GET /api/agents)
- `useQuery(api.activities.feed, { limit })` -> `useActivities(limit)` hook (SSE-powered)
- `useMutation(api.tasks.approve)` -> `fetch('/api/tasks/:id', { method: 'PATCH', body: { status: 'done' } })`
- `useMutation(api.tasks.requestChanges)` -> `fetch('/api/tasks/:id/comments', { method: 'POST' })` + status patch

### 3. Routing — Next.js -> React Router

Replace Next.js routing:
- `useRouter()` -> `useNavigate()` from react-router-dom
- `usePathname()` -> `useLocation().pathname`
- `<Link href="...">` -> `<Link to="...">` (react-router-dom)
- File-based routes -> explicit `<Routes>` in App.tsx

### 4. Components to Remove (not needed)

- `squad-switcher.tsx` — single user, no squad switching
- `nav-user.tsx` — no auth/user accounts
- `runtime-config.tsx` — no runtime config injection
- `squadhub-status.tsx` — we have our own gateway health
- Auth providers, onboarding guard, API client provider
- `weekly-routine-grid.tsx` — replace with cron jobs list from gateway
- `documents-section.tsx` and `document-viewer-modal.tsx` — skip for MVP

### 5. Components to Simplify

- `squad-provider.tsx` -> becomes a simple context that holds agent list + gateway config
- `chat-panel-provider.tsx` -> keep as-is (just open/close state)
- `drawer-provider.tsx` -> keep as-is
- `theme-provider.tsx` -> simplify to localStorage dark/light toggle

### 6. Chat Panel — Rewrite Data Layer

Replace Clawe's WebSocket gateway client with:
- `POST /api/chat/send` body: `{ sessionKey, message }` -> proxies to OpenClaw gateway sessions_send
- `GET /api/chat/history/:sessionKey` -> proxies to gateway sessions_history
- Simple polling or SSE for new messages (no WebSocket needed)

### 7. New Files to Create

These don't exist in Clawe and must be written:

- `src/hooks/useTasks.ts` — fetch /api/tasks, CRUD with optimistic updates, SSE refresh
- `src/hooks/useAgents.ts` — fetch /api/agents (polls every 30s)
- `src/hooks/useActivities.ts` — SSE subscription to /api/activities/stream
- `src/hooks/useSSE.ts` — generic SSE subscription hook
- `src/hooks/useChat.ts` — send/receive via /api/chat endpoints
- `src/lib/api.ts` — fetch wrapper with auth header
- `src/lib/types.ts` — TypeScript types for Task, Agent, Activity, etc.
- `src/App.tsx` — React Router setup with Board, Agents, Settings routes
- `src/pages/settings.tsx` — gateway info, cron list, theme toggle

### 8. CSS / Theme

The globals.css from Clawe UI package is already copied with the full oklch theme.
Change the brand color from rose to teal:

```css
/* Light mode */
--brand: oklch(0.65 0.15 180);
--brand-foreground: oklch(1 0 0);

/* Dark mode */
--brand: oklch(0.72 0.14 180);
--brand-foreground: oklch(0.13 0 0);
```

### 9. Server Routes (already scaffolded)

The server files in server/ are already created with correct structure.
They need their route handlers implemented:
- `server/routes/tasks.ts` — full CRUD (see PRD section 5)
- `server/routes/agents.ts` — proxy to gateway
- `server/routes/activities.ts` — DB query + SSE stream
- `server/routes/chat.ts` — proxy to gateway sessions
- `server/gateway-client.ts` — HTTP client for OpenClaw gateway (see PRD section 6)
- `server/sse.ts` — SSE broadcast manager (see PRD section 8)
