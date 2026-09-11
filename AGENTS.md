# OpenMuse for agents

A personal assistant on OpenComputer Serverless Agents: a TanStack Start
app, two agents, and the platform holding sessions, sandboxes, notes and
outcome delivery. The README serves people; this file serves agents.

## Map

- `opencomputer/agents/coordinator/` the coordinator: `agent.ts`, `tools/start-topic.ts`; deployed as `openmuse-dev`
- `opencomputer/agents/topic-worker/` the worker: `agent.ts`; deployed as `openmuse-dev--topic-worker`
- `scripts/templates/` `memory.ts` (the two `defineMemory` declarations) and `app-connection.ts`, copied into each agent by `scripts/prepare-agent.mjs`
- `src/routes/api/` the owner routes, the session proxy and the one agent-facing route `agent/start-topic`
- `src/lib/memory/` the client for the platform's memory documents (conditional create, revision checks)
- `src/lib/conversation/`, `src/lib/topics/` the coordinator session with its outcome subscription; topics, workers, archive
- `src/lib/oc/` the management API client and session helpers; `src/lib/auth/` the owner cookie
- `src/lib/state/`, `src/lib/store/` the session map (which sessions this installation owns) and its fs, kv and memory drivers
- `src/components/` the interface; `src/lib/events/` the tool-activity reducer; `src/lib/transcript.ts` the dev-only log
- `docs/configuration.md` credentials, origin and storage; `docs/development.md` checks, session replacement and outcome delivery
- `docs/deploy/` one page per host; `e2e/` Playwright; `test/` Vitest

## Commands

- `npm run setup -- --origin https://<host>` secrets into `.env.local`, project link, agents deployed, demo notes seeded
- `npm run dev` port 3100, strict; `npm run check` typecheck, lint, unit tests, agent doctor
- `npm run test:e2e` its own server on 3101 as installation `e2e`; aborts unless `/api/health` reports it
- `npm run deploy:agents` both agents to Development; then replace the coordinator and the workers, sessions pin their deployment
- `npm run seed` the demo notes into project memory where absent

## Invariants

- The server routes are the only holder of the OpenComputer key; the browser gets an owner cookie and three proxied session routes.
- One installation per project and environment: sessions are keyed by installation, and the outcome subscription selects by agent.
- Notes live in project memory (`profile/owner`, `topics/<id>`); the app stores only the session map, nothing about content.
- Agents are deployed with the OpenComputer CLI from `opencomputer/`; `prepare-agent` regenerates the copied modules first.
- Agent saves go through the platform's `memory_save`; owner edits go through the app with the document's revision.
- Never print or commit secrets; `.env.local` holds them and is ignored.

## Where things are decided

The public contracts are the OpenComputer docs on memory, sessions, events
and the management API (linked from the README). Design notes and the run
log are kept outside this repository.
