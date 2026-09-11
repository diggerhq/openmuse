# Evidence

What ran against the real OpenComputer Development environment, with the
session ids to look up. Newest first; each subsection is dated.

Runs in OpenComputer Development, project `openmuse-dev`
(`prj_549520fd4be643b1aa6068cbc2610593`), app reached through an HTTPS tunnel
at port 3100 (times UTC). The transcripts are in the sessions named below;
the numbers come from their event logs.

## Event subscriptions, 2026-09-11

The delivery half of event subscriptions reached production during the
day. The app's retry created subscription
`evs_82f0ecf829ca46509f42751e4e1e8377` (worker `turn.completed`,
`turn.failed`, `turn.cancelled`; destination coordinator
`6bb1964b-8f29-f974-586c-6d208e84a06b`) at 00:31:29 and the fallback pass
stood down. The platform delivered worker `d0d81be6-5216-fc11-ec77-c861c40a8f61`
turn `70ac612e-9d6a-4755-8dde-c046f2a81eaf` (`turn.failed`) to that
coordinator: the source turn's `deliveries` entry reads `delivered`, attempt
1, receipt turn `c5b725b6-ed91-4df5-8c0a-f937c96c55b2`. The bare
`POST /sessions/<id>/interrupt` cancelled worker
`c812ebb4-c57e-700c-4910-6a0e479f1bd9` turn `72715bbf-6689-4f42-bb6f-76465f46d598`
without a replacement turn. A subscription selects turns admitted after it
was created: the turn cancelled at 00:40 had been admitted at 00:27, before
the subscription, and carried no delivery.

The same hour showed the runtime failing: from 00:42 every turn on the
Durable Object runtime, including a fresh session
`79028956-d77d-9480-4dbc-a58aea416e94` asked for the word "ok", ended in
`turn.failed runtime_failed` one second after `turn.started`; before that,
worker `c812ebb4` had stalled at 00:28:36 after a message delta with no
further events, and after its interrupt the next queued turn
`4c6c47b4-159f-405e-9cca-27ebdcc8ac68` never started while the session read
`idle`.

The coordinator on the rewritten instructions (deployment
`openmuse-dev:604d67c0…`, session `6bb1964b…`): asked which model it runs on
and what it can do, it named `anthropic/claude-sonnet-4.6` and listed
remembering preferences, answering directly, handing research and computer
work to topics, and keeping notes; asked for options in Sardinia, it
created topic `sardinia-trip-options-adcb29` through `start_topic` (worker
`c812ebb4…`) and said so. That worker fetched Wikipedia pages with `curl`
until rate-limited, then stalled as above.

## Project memory, 2026-09-11

Both agents deployed with the `profile` (4,096 bytes) and `topics` (8,192
bytes) declarations; `GET /projects/<id>/memory?environment=development`
lists both as declared. `npm run seed` created `profile/owner`,
`topics/workshop-demo` and `topics/conference-budget` (revision `1`,
`writer: owner`).

**Coordinator bound to memory.** Session `f86ac3c4-8455-a297-e86e-75c7395df196`
created with `{ profile: document owner read-write, topics: collection read }`;
inspection lists the bindings with `writable`. First turn, "what do you know
about me, which topics are open, and remember that I prefer British
English": answered from the profile text and the collection overview, and
`memory_save` committed profile revision `2` (217 bytes, `writer: agent`
with that session id); the `memory.saved` event followed at once.

**Coordinator reads a topic, delegates.** Session `7c82857f-c878-9d0a-0162-e0200be93ce8`,
turn `7c2f185c-5530-408f-980c-8c43e7122aca`: `memory_read({ id:
"conference-budget" })` on the collection, then `start_topic` through the
tunnel (`201`, 3.8 s), which created worker session
`090318da-6124-58ad-61f6-1ea8326ae5e5` bound to `topics/conference-budget`
read-write and `profile/owner` read.

**Worker saves through its binding.** That worker's turn
`4ea9d68f-244f-4b71-a386-15f60046adeb` (00:04:46 to 00:05:41): the harness
`read` and `glob` failed on the Durable Object runtime, `sandbox_exec` found
and read the CSV and ran `python3`; `memory_save` committed revision `3`
(802 bytes, totals by category and status). It also saved an 11-byte
placeholder as revision `2` on its first step; the worker prompt now says a
save replaces the whole document.

**Outcome back in the conversation.** With event subscriptions still
answering 404 on production, the fallback pass delivered that turn's outcome
to the replacement coordinator `ec1673d5-bc90-7ef5-3c97-65847dc65959` as the
platform's outcome text (turn `6`, 00:13:26); the coordinator parsed it and
relayed the totals under the topic title. The end-to-end suite ran as its
own installation (`e2e`, coordinator `327c3012-7a81-da6e-f981-9d974eca708a`,
worker `5fa9acc2-c231-5d0e-4337-961567d7acc6`): 14 passed, including an
owner edit that conflicts on a stale revision and a worker turn that ran
`node --version` in its sandbox.

## Before project memory, 2026-09-10

These runs used the fixture memory (JSON documents in the state store,
recalled into each turn's input) and the interim return path; the platform
parts are unchanged. The first three runs were on the microVM runtime with
`anthropic/claude-sonnet-5`; the later ones on the Durable Object runtime
with `anthropic/claude-sonnet-4.6` (see the platform notes).

**A real conversation.** Coordinator session `bd75ea2a-71f5-5bd1-851c-cc88090aefa3`.
First turn: "What do you know about me, and what topics are open?" answered
from the recalled profile and the topic overview in 6 s.

**Delegated workshop task.** "Get this workshop demo ready: run it from a
clean checkout, fix anything that fails and give me verified setup
instructions" against `diggerhq/opencomputer-example-quickstart-check`, whose
`docs/quickstart.md` is deliberately broken. The coordinator read the
`workshop-demo` notes, called `start_topic` with the existing topic id, and
acknowledged in one sentence. Worker session `06bd5cc6-bb3f-6cb1-b090-864a1c35a4f9`,
turn `93faf510-dac7-41af-920d-94d1f47054b5`: 19:05:47 to 19:07:51 (2 min 4 s),
24 tool calls, USD 0.64 of model spend. It cloned the repository at
`bd7934d`, followed the guide, reproduced `TypeError: orders.map is not a
function`, applied the one-line fix locally, re-ran the guide and the
repository's own `scripts/verify-quickstart.mjs`, reverted its local edit, and
reported the verified command list with Node 22.23.2 / npm 10.9.8.

**A second concurrent topic.** While the workshop ran: "analyse the
conference budget CSV, totals by category and by payment status". A second
`start_topic` on `conference-budget`; worker session
`954dde35-e9be-0589-b0fa-b60fb2d9996a`, turn `2a305529-c404-4a22-bfdb-7bbd8c867777`:
44 s, 3 tool calls, totals computed with `python3` from the shipped fixture
`fixtures/conference-budget.csv`, one refund flagged and shown both ways.

**Browser closed, outcomes returned.** The browser tab was closed while both
workers ran. Both finished; the return path queued two coordinator turns
(`[topic outcome]` messages, idempotent by worker turn id), and the
coordinator relayed both results in the same conversation. Reopening the
page replayed all of it from the session events.

**Replacement after a redeploy.** Sessions pin their deployment. After the
agents were redeployed the coordinator was replaced from the header
(`bd75ea2a…` ended, successor `c42085da…`, then `e5057323…`) and both workers
from their topic panels; each successor was admitted under a key that names
its predecessor and started from the current notes.

**Follow-up on the same topic, with notes saved.** "Attendees will be on Node
20 LTS, not 22; re-verify and save what you verify." The coordinator read the
topic and called `start_topic` with the same `workshop-demo` id; the worker
session `1b74359a-7483-c8d4-b15d-0ed43f4857d6` (Durable Object runtime, the
sandbox started lazily on its first command in 26 s) cloned the repository,
installed Node 20.20.2 with `n`, reproduced the failure and verified the fix,
and saved the notes through `save_notes` (revision `a4e142a2…`, 1,690 bytes,
writer recorded as that session): 19:18:57 to 19:20:56, 25 tool calls. The
topic summary in the panel changed while the worker ran.

**Owner correction outside chat.** The notes were edited through the notes
route: a save with a stale revision returned `409 conflict`; the save with the
current revision appended an owner correction (Node 20 via nvm, npm only, no
internet after 10:00). The next worker turn (`2a650e26…`, 26 s, no computer
work) restated exactly those three constraints, rewrote the install step to a
pre-downloaded tarball, and saved the reconciled notes. The redesigned notes
panel exercises the same route and the conflict state end to end
([docs/ui.md](docs/ui.md)).

**Stop.** A worker turn running `date -u; sleep 150; date -u` was stopped
after 10 s. The platform recorded `turn.cancelled` and started the Stop turn
at once, but the runtime did not interrupt the command: it ran until the
sandbox's own 120 s command timeout killed it (`SIGKILL, timedOut`), and the
reply arrived 1 min 50 s after Stop. The cancelled turn reached the
coordinator as a `cancelled` outcome. Stop is a turn-record interruption
today, not a runtime cancellation; that is the platform's work 020.
