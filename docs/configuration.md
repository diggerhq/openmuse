# Configuration and owner access

OpenMuse reads configuration from the server environment. See
[`.env.example`](../.env.example) for every variable and its default, and
[deployment guides](deploy/) for host-specific steps. Restart or redeploy
the app after changing values.

## Setup

After `npx opencomputer login`, run:

```sh
npm run setup -- --origin https://your-app.example
```

Setup writes the ignored `.env.local`, creates or reuses the linked
OpenComputer project, deploys both agents to **Development**, and creates
demo notes where absent. It generates missing secrets and an installation
ID; subsequent runs keep them. Setting `OPENCOMPUTER_ENVIRONMENT=production`
does not change setup's agent deployment target.

The credentials have separate purposes:

- `OPENCOMPUTER_API_KEY`: copied from the CLI login when absent; held by
  the app server, never sent to the browser.
- `OPENMUSE_OWNER_SECRET`: entered in the login form. Setup prints a newly
  generated value; it remains available in `.env.local`.
- `OPENMUSE_COOKIE_SECRET`: signs owner login cookies.
- `OPENMUSE_AGENT_SECRET`: authenticates the coordinator's calls back to
  the app. OpenComputer attaches it through a managed connection; agent
  code does not read its value.

Keep `.env.local` private and out of git. On a host, put its values in the
host's secret store. Render generates the three OpenMuse secrets itself;
use the owner secret from Render's Environment tab to sign in.

## The callback origin

The coordinator calls `/api/agent/start-topic` to start or reuse a topic's
worker. Its managed connection is deployed for one public HTTPS origin;
local development therefore needs an HTTPS tunnel to the app.

Set `OPENMUSE_APP_ORIGIN` to that origin. If unset, sign-in uses the origin
of its request. Every owner sign-in registers the installation secret with
OpenComputer for that origin. Login can succeed even if registration fails;
check the server's `installation.register_failed` log if delegation fails.

When moving hosts, rerun setup with the new origin, update the host's
configuration, and sign in there. Existing sessions keep their deployed
code: replace the coordinator from the owner menu to use the new callback.
Serve Node deployments behind an HTTPS proxy, as described in the
[Docker guide](deploy/docker.md).

Use one installation per OpenComputer project and environment. An
installation ID distinguishes session creation keys; it does not isolate
the shared notes, worker subscriptions or installation secret. Another
installation signing in can replace that secret and its allowed origin.

## State and notes

The app stores `state.json`: current and previous session IDs, subscription
IDs, and the delivery ledger used by the fallback return path. Preserve it
when moving or redeploying the app.

- `fs` stores it under `OPENMUSE_STATE_DIR`, default `.openmuse`. Docker,
  Fly and Render use a persistent volume at `/data`.
- `kv` uses the Cloudflare binding `OPENMUSE_STORE`. KV reads are eventually
  consistent; concurrent writes from different isolates can overwrite one
  another. This is a single-owner app, not a shared multi-user service.
- `memory` loses this index on restart; use it only for disposable runs.

The owner profile and topic notes live in OpenComputer project memory;
conversation history lives in OpenComputer sessions. Losing the local
index does not delete either, but loses the app's links to its sessions.
Local development with the `fs` store also writes conversation content to
`transcript.jsonl` in the state directory; production builds do not.

## Login and rotation

OpenMuse has one owner secret, not user accounts. Login compares the
secret in constant time and limits failed attempts to five per client
address per fifteen minutes **within each process or isolate**. The signed
cookie expires after seven days and has `HttpOnly`, `Secure` and
`SameSite=Lax` attributes. Authenticated browser mutations check the origin
and a CSRF token bound to the cookie; login checks the origin.

For plain HTTP on localhost only, set
`OPENMUSE_ALLOW_INSECURE_COOKIES=1`. Keep secure cookies enabled on hosts.

To recover owner access or invalidate existing login cookies:

```sh
npm run setup -- --rotate --origin https://your-app.example
```

This replaces the owner and cookie secrets in `.env.local`. Copy both new
values to the host and restart or redeploy it; old cookies then stop
working. The command also redeploys the agents and reruns seeding. It keeps
the OpenComputer key, agent secret and installation ID.

You can instead replace the owner and cookie secrets directly in the
host's secret store, then restart the app. Use random values of at least
16 and 32 characters respectively. Replacing only the owner secret does
not invalidate existing cookies.

Rotate an OpenComputer key in OpenComputer and update the app's copy
separately. After changing `OPENMUSE_AGENT_SECRET` (at least 32 random
characters), restart the app and sign in again to register its new value.
