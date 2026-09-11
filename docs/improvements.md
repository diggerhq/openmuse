# Improvements

What this example carries that the platform should carry instead, in two
parts: code the platform has made unnecessary since it was written, and
code that works around gaps the platform still has. A reader who wants to
know what OpenComputer does for an application can read the first list as
"already done" and the second as "coming"; a contributor can read both as a
cut list.

## What the platform now makes unnecessary

Event subscriptions and the bare interrupt route reached production on
2026-09-11. Everything the app kept for the interim is dead code and is
marked to delete:

| Piece | Where | Status |
| --- | --- | --- |
| The fallback return path: the timer, the cron pass, the local cron trigger, the delivery ledger | `src/lib/return-path/`, the timer start and `scheduled` handler in `src/server.ts`, `triggers.crons` in `wrangler.jsonc`, `returnPath` in `src/lib/state/store.ts` | to delete |
| The interrupt-mode Stop: a turn in `interrupt` mode when the interrupt route answered 404, and the `STOP_*` messages it sent | `interruptSession` in `src/lib/oc/sessions.ts`, `STOP_COORDINATOR` in `src/lib/conversation/service.ts`, `STOP_WORKER` in `src/lib/topics/service.ts`, `StopNote` in `src/components/app/conversation/message.tsx` | to delete |
| The text-outcome parser in the coordinator, which read the fallback's outcome text; the agent reads `input.event` and nothing else | `OUTCOME_TEXT` and `deliveredOutcome` in `opencomputer/agents/coordinator/agent.ts`, `outcomeText` in `src/lib/return-path/index.ts` | to delete |

## Platform gaps this example works around

Each ask names what the platform would add and what that deletes here.

| Ask | What | What it deletes here |
| --- | --- | --- |
| P1 Session lookup by key | `GET /sessions?idempotencyKey=`, or a `name` on create and `?name=` | The session map and its three stores (`src/lib/state/`, `src/lib/store/`), the volume on every container host, the KV namespace on Cloudflare |
| P2 Sessions follow the active deployment | Opt-in per agent, or the default for this agent type | The replace-coordinator and new-computer actions, the previous-session history links, the deployment id in every session key |
| P3 Shared agent modules | Agents import from a sibling directory of the project, compiled into each | The template copy of `memory.ts` into both agents by `scripts/prepare-agent.mjs` |
| P4 Connection origin from configuration | `defineConnection` reads `origin` from a project environment variable at deploy | The origin stamped into `tools/app.ts` by `prepare-agent`, and the secret the app registers for its origin on every sign-in (`src/lib/oc/installation.ts`) |
| P5 One tool-event shape, tool activity in `@opencomputer/react` | The runtimes emit the same tool events; the hook exposes per-turn tool calls next to `messages` | The event reducer for two runtime shapes in `src/lib/events/messages.ts` |
| P6 Side-effect-free SDK import | No dispatcher swap or connection pre-warm at import, or a subpath export for the managed-agents surface | The hand-written management client `src/lib/oc/client.ts` and the two-call topic start that `startSessionOnDocument` already does |
| P7 Sandbox runtime with `toolCallId` | Republish the sandbox runtime so a code tool's `run` receives the tool call id | The message-id-and-arguments fallback in `opencomputer/agents/coordinator/tools/start-topic.ts` |
| P8 Durable Object runtime parity | The built-in `shell`, `read`, `glob` and `grep` tools work; `useModel` accepts the catalogue | `sandbox_exec` and the model note in the worker's instructions |
| P9 Subscriptions by source session | A `sessionId` selector on create | The one-installation-per-project rule and the test installation's subscription cleanup |
| P10 Session GET without internals | Drop `memoryObject` and `memoryAdmission` from the public shape | Nothing here; the Memory Durable Object name carries the account id |

Notes from building against the current platform, under the ask each belongs
to:

- P1, P2. Session create with a reused `Idempotency-Key` returns `409` after
  a redeploy because the resolved deployment id differs, and the same key
  with different memory bindings is also a `409`; the keys here include the
  deployment id, so a redeploy admits a new session on purpose.
- P5. Tool events differ between runtimes: `{ tool, input, output }` on the
  microVM, `{ id, input, content }` with the name on `tool.progress` on the
  Durable Object. The public event log needs polling (`/events?after=`);
  `@opencomputer/react` polls it from a cursor through the app's session
  proxy.
- P6. `@opencomputer/sdk` runs `configureHttp2()` and pre-warms 48
  connections when imported; the app imports it for types only.
- P7. `toolCallId` is typed on `ToolExecutionContext`, and `messageId`
  arrives, but the deployed sandbox runtime does not pass the tool call id
  into `run`.
- P8. On the Durable Object runtime `useModel` with anything but
  `anthropic/claude-sonnet-4.6` fails every turn, the harness `shell`,
  `read`, `glob` and `grep` fail with `path ... Received 'undefined'` or
  `Search path does not exist`, and the sandbox is reachable only through
  the host-added `sandbox_exec`. `fetch(..., { redirect: "error" })` is not
  implemented in workerd; the client uses `manual` and refuses redirects
  itself.
- P9. Two installations in one project and environment would deliver each
  other's worker outcomes; the end-to-end suite deletes its subscription
  when it ends.
- P10. `GET /sessions/<id>` returns `memoryObject`
  (`<accountId>:<projectId>:<environment>`) and `memoryAdmission`.
- A subscription selects turns admitted after it was created; a turn already
  running when the subscription is made settles without a delivery.

## The cut list, in order

| Step | Depends on | Removes | Lines |
| --- | --- | --- | --- |
| 1. Delete the fallback return path, the interrupt-mode Stop and the text-outcome parser; keep the README to the product; move evidence and platform notes out; drop unused UI files and the unexercised host specs | nothing | the first table above, the trims | about 1,100 |
| 2. Register the connection secret in `setup`, not at sign-in | nothing | `src/lib/oc/installation.ts` | about 80 |
| 3. Use the SDK for management calls | P6 | `src/lib/oc/client.ts` | about 250 |
| 4. Shared agent modules, origin from configuration | P3, P4 | `scripts/prepare-agent.mjs`, `scripts/templates/` | about 130 |
| 5. Tool activity from `@opencomputer/react` | P5 | `src/lib/events/messages.ts` | about 200 |
| 6. A stateless app: coordinator and workers found by key, sessions that follow the deployment | P1, P2 | the session map, the replacement UI, volumes, KV, the host matrix | about 500 |
| 7. Prompts without runtime workarounds | P7, P8 | the `sandbox_exec` and model notes, the invocation fallback | about 60 |

Step 1 puts the product on the first screen without any platform change.
Steps 3 to 7 make the platform do visibly more; P1 and P2 carry the most
weight, because together they turn the app into a stateless web app.
