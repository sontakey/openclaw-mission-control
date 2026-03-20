# Mission Control

Mission Control is a dashboard for OpenClaw operators. It serves a React single-page app from an Express server, stores operational state in SQLite, and proxies gateway-backed agent, chat, and cron data into a board, activity feed, and squad view.

## Architecture Overview

- `src/` contains the Vite/React client with routes for the board, squad, and settings views.
- `server/index.ts` boots the Express server, serves the built client from `dist/client`, and exposes API routes under `/api`.
- `server/routes/tasks.ts` and `server/routes/activities.ts` manage task data, comments, and the live SSE activity stream.
- `server/routes/agents.ts`, `server/routes/chat.ts`, and `server/routes/gateway.ts` normalize data from the OpenClaw gateway.
- `server/db.ts` initializes the SQLite schema in `mission-control.db` by default.

## Environment

Copy `.env.example` to `.env` and adjust values for your host:

```bash
cp .env.example .env
```

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Express server port | `3100` in production install, `3000` in local server startup |
| `OPENCLAW_GATEWAY_URL` | Base URL for the OpenClaw gateway | `http://127.0.0.1:18789` |
| `OPENCLAW_TOKEN` | Bearer token for gateway requests | empty |
| `DATABASE_FILE` | SQLite database path | `mission-control.db` |

## Local Setup

Prerequisites:

- Node.js and npm
- An OpenClaw gateway reachable at `OPENCLAW_GATEWAY_URL`

Install dependencies and start the full development stack:

```bash
npm install
cp .env.example .env
npm run dev:full
```

Useful commands:

- `npm test` runs the project test suite.
- `npm run lint` runs the TypeScript checks for client and server code.
- `npm run build` builds the client bundle and server output into `dist/`.
- `npm start` starts the built server from `dist/server/index.js`.

## Production Install

`install.sh` implements the one-command setup described in PRD section 11:

```bash
./install.sh
```

The installer:

1. Clones the repository into `MISSION_CONTROL_DIR` or `$HOME/mission-control`
2. Runs `npm install` and `npm run build`
3. Writes `.env` using `MISSION_CONTROL_PORT`, `OPENCLAW_GATEWAY_URL`, `OPENCLAW_TOKEN`, and `MISSION_CONTROL_DATABASE_FILE`
4. Creates and starts a `systemd` service named `mission-control` by default

Optional installer overrides:

- `MISSION_CONTROL_DIR`
- `MISSION_CONTROL_PORT`
- `MISSION_CONTROL_REPO_URL`
- `MISSION_CONTROL_SERVICE_NAME`
- `MISSION_CONTROL_DATABASE_FILE`
- `MISSION_CONTROL_NODE_BIN`
- `MISSION_CONTROL_NPM_BIN`
- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_TOKEN`

After install, the health check is available at `/health`.
