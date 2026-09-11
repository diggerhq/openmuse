# Development

## Checks

```sh
npm run check
```

Runs TypeScript, Biome, unit tests and the OpenComputer agent doctor. Agent
preparation copies the shared [memory declarations](../scripts/templates/memory.ts)
and [app connection](../scripts/templates/app-connection.ts) into the agent
directories. Edit the templates rather than the generated copies.

## Browser tests

```sh
npm run test:e2e
```

Playwright runs against real OpenComputer Development sessions. It starts
its own app server on port 3101 with installation `e2e` and state under
`.openmuse-e2e/`. Before running, it checks that the target's `/api/health`
reports installation `e2e`; otherwise it aborts. The tests create and use
their own sessions. See [the test configuration](../playwright.config.ts)
and [environment setup](../e2e/env.ts).

## Local transcripts

The dev server writes `.openmuse/transcript.jsonl`: one record per owner
message, reply, topic start, worker outcome and Stop, with timestamps and
session/turn IDs. Production builds do not write it. The file contains
conversation content and stays in the ignored local state directory.

## Redeploying agents

```sh
npm run deploy:agents
```

This prepares and deploys both agents to Development. Existing sessions
pin their original deployment. To use the new code, replace the coordinator
from the owner menu and choose **New computer** in a topic's **Work** panel.

Replacement starts from the current memory documents; it does not copy the
old conversation into the new session. Previous sessions remain linked for
inspection. Saved notes are independent of the session and computer.

## Outcome delivery

The [coordinator service](../src/lib/conversation/service.ts) creates a
platform event subscription for the worker agent's completed, failed and
cancelled turns. Each outcome becomes a turn in the coordinator session
with `source: "event"` input.

If the subscription cannot be created, the
[fallback return path](../src/lib/return-path/index.ts) reads worker events
and queues reports itself. Node drives it with a two-second timer;
Cloudflare uses the cron trigger in [wrangler.jsonc](../wrangler.jsonc).
It does nothing once the coordinator has a subscription.

Closing the browser leaves both workers and the return path running. In a
local setup, the app server and tunnel still need to run for delegation and
fallback delivery. The local transcript records `subscription.created`
when native delivery is configured and `outcome.queued` when the fallback
queues a report.

## Stopping work

Stop interrupts the agent loop. A computer command already dispatched may
continue until it finishes or times out; Stop does not undo its effects.
