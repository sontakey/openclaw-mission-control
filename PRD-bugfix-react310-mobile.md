# PRD: Fix React Error #310 + Mobile Polish

## Summary
Mission Control has a React hooks violation causing a crash (error #310: "Rendered more hooks than during the previous render") when clicking task cards on the Board. Additionally, mobile layout needs polish — long labels overflow and the UI isn't optimized for small screens.

## Bug 1: React Error #310 (Critical)

### Root Cause
In `src/components/kanban/task-detail-modal.tsx`, the component has an early return before hooks:

```tsx
// Line ~141: early return BEFORE useTaskTmuxOutput hook
if (!task) return null;

const { data: tmuxOutput, ... } = useTaskTmuxOutput({...}); // Line ~143
```

When `task` goes from non-null to null (or vice versa), React sees a different number of hooks rendered, triggering error #310.

### Fix
Move ALL hooks above the `if (!task) return null;` guard. The `useTaskTmuxOutput` hook already accepts an `enabled` flag, so pass `enabled: open && Boolean(task?.tmuxSession)` and move the hook above the early return.

```tsx
// CORRECT order:
const [showFeedback, setShowFeedback] = useState(false);
const [feedback, setFeedback] = useState("");
const [isSubmitting, setIsSubmitting] = useState(false);
const [subtasksOpen, setSubtasksOpen] = useState(false);
const [descExpanded, setDescExpanded] = useState(false);

const {
  data: tmuxOutput,
  error: tmuxOutputError,
  isLoading: isTmuxOutputLoading,
} = useTaskTmuxOutput({
  enabled: open && Boolean(task?.tmuxSession),
  taskId: task?.id ?? "",
});

if (!task) return null;
```

### Verification
- Open the Board page
- Click a task card in the Done column → should open detail modal without crash
- Close the modal → no error
- Check browser console → zero React errors

## Bug 2: Mobile Layout Polish

### Issues
1. **Long task titles** overflow or force awkward wrapping on mobile kanban cards
2. **Long agent model names** (e.g. "anthropic/claude-sonnet-4-6") overflow on agent cards
3. **Sidebar** may not collapse properly on small screens
4. **Cron job names** in the table are very long and don't truncate

### Requirements
1. **Kanban cards**: Truncate task titles with `line-clamp-2` (max 2 lines). Truncate description/metadata with `line-clamp-1`.
2. **Agent cards**: Truncate model names with `text-ellipsis overflow-hidden`. On screens < 640px, show only model name without provider prefix (e.g. "claude-sonnet-4-6" instead of "anthropic/claude-sonnet-4-6").
3. **Crons table**: On mobile (< 640px), truncate the Name column to max 200px with ellipsis. Consider stacking "Next run" and "Last run" into a single column on very small screens.
4. **Sidebar**: Should auto-collapse on screens < 768px and use a hamburger toggle.
5. **General**: All text that could overflow should have `truncate` or `line-clamp-*` with a title attribute for hover tooltip.

### Mobile Test Checklist
Test at these viewport widths:
- 375px (iPhone SE)
- 390px (iPhone 14)
- 768px (iPad)

Pages to test:
- Board (kanban cards)
- Agents (tree + grid views)
- Chat (message bubbles)
- Crons (table)
- Settings

### Verification
- Resize browser to 375px width
- Navigate every page
- No horizontal scrollbar
- No text overflow outside containers
- All interactive elements are tappable (min 44px touch targets)
- Screenshot each page at 375px and 768px

## Build & Deploy
```bash
cd /home/ubuntu/Projects/mission-control
npm run build
# Server is already running on port 3100, restart it:
sudo systemctl restart mission-control 2>/dev/null || (cd /home/ubuntu/Projects/mission-control && npm run start &)
```

Check if there's a systemd service:
```bash
ls /home/ubuntu/Projects/mission-control/deploy/systemd/
```

## Definition of Done
1. Zero React errors in console across all pages
2. Task detail modal opens/closes without crash
3. All 5 pages render properly at 375px, 390px, and 768px widths
4. No horizontal scroll on any page at mobile widths
5. Long labels are truncated with ellipsis (with hover tooltip)
6. Build succeeds with no TypeScript errors
