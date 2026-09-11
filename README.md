# OpenMuse

A personal assistant you deploy for yourself. Hand it work, keep talking,
and get the results back in the same conversation.

Longer jobs get a **topic**: its own conversation, notes you can read and
edit, and a cloud computer when needed. Work continues when you close the
browser.

A TanStack Start web app and two agents defined with React-style TypeScript
hooks. [OpenComputer Serverless Agents](https://docs.opencomputer.dev/agents/overview)
runs the agents, provisions their computers and stores their conversations
and [notes](https://docs.opencomputer.dev/agents/memory) in your own
OpenComputer project. No separate agent infrastructure to operate.

![A request for Greece island-hopping options is delegated to a topic; the completed research returns to the main conversation, beside the owner's saved preferences.](docs/screenshots/readme-main-conversation.png)

## Try a task

Setup includes a **Workshop demo** topic linked to a
[sample application's quickstart](https://github.com/diggerhq/opencomputer-example-quickstart-check).
Ask in the main conversation:

> In Workshop demo, run the quickstart from a clean checkout. Fix anything
> that fails, rerun it, and save the verified commands in the topic notes.

Open the topic to watch the commands and inspect its notes. You can ask for
something else while it runs; the worker's result comes back to the main
conversation. Then follow up:

> The workshop attendees use Node 20. Check that too.

The worker continues the same topic. You can also correct its notes directly
before the next task. Those notes survive replacing the topic's computer
and are readable through the OpenComputer API and CLI independently of this app.

## Run locally

You need **Node.js 22**, an OpenComputer account and an HTTPS tunnel to your
machine. The app runs locally; the agents run on OpenComputer.

```sh
git clone https://github.com/diggerhq/openmuse.git
cd openmuse
npm ci
npx opencomputer login
```

Start a tunnel to port 3100 and leave it running. For example:

```sh
ngrok http 3100
```

In another terminal in the repository, replace `https://YOUR-TUNNEL-HOST`
with the HTTPS URL the tunnel printed:

```sh
npm run setup -- --origin https://YOUR-TUNNEL-HOST
npm run dev
```

Setup links or creates the OpenComputer project, generates the login and
application secrets in `.env.local`, deploys both agents to Development,
and seeds the example notes. The public URL lets the coordinator call the
app's delegation tool.

Open that HTTPS URL and sign in with `OPENMUSE_OWNER_SECRET` from
`.env.local`. Keep both terminals running. If the tunnel URL changes, rerun
setup with the new origin, restart the app, sign in again and replace the
coordinator from the owner menu so its callback uses the new origin.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/diggerhq/openmuse)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/diggerhq/openmuse)

Follow the host guide for secrets and agent setup:
[Cloudflare Workers](docs/deploy/cloudflare.md) ·
[Render](docs/deploy/render.md) ·
[Docker](docs/deploy/docker.md) ·
[Fly.io](docs/deploy/fly.md).
The guides record which paths have been tested; the Cloudflare button
requires a public repository.

Access to your app is protected by an owner login.
See [configuration and owner access](docs/configuration.md) for storage,
origins and secret rotation; [.env.example](.env.example) lists the settings.

## How it's built

An agent is a TypeScript function that declares what it needs and returns
its instructions. The [coordinator](opencomputer/agents/coordinator/agent.ts)
starts with:

```ts
useModel("anthropic/claude-sonnet-4.6");
const input = useInput();
const owner = useMemory(profile);
const overview = useMemory(topics);
useTool(startTopic);
```

It answers directly or calls
[start_topic](opencomputer/agents/coordinator/tools/start-topic.ts)
to create or reuse a worker session. The
[worker](opencomputer/agents/topic-worker/agent.ts) uses a computer for its
task and saves useful knowledge with `memory_save`.

Both agents read [project memory](scripts/templates/memory.ts) through
`useMemory`: the coordinator sees the owner profile and topic summaries;
each worker sees the profile and its own topic's notes. Conversation history
belongs to the session; saved notes remain available to later sessions.

The app owns login, the session index and delegation. The browser attaches
to sessions through authenticated routes using
[`useAgent`](https://docs.opencomputer.dev/agents/react); the OpenComputer key
stays on the server. Worker outcomes return through platform event
subscriptions, with an [app-side fallback](docs/development.md#outcome-delivery)
while those routes are unavailable.

## Development

Run `npm run check` for typechecking, lint, unit tests and agent validation.
[Development notes](docs/development.md) cover the live Playwright suite,
local transcripts and redeploying the agents.

Early preview: the interface, agents and platform APIs are still changing.
