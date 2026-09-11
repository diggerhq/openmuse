# Deploy to Cloudflare Workers

Status: **CLI path verified** (2026-09-10, see the evidence below). The
Deploy to Cloudflare button is configured per Cloudflare's docs but **not
exercised**: the button only works for public repositories and this one is
private.

What runs where: the app is one Worker (`wrangler.jsonc`); the session map
(which coordinator and worker sessions this installation owns) lives in a
Workers KV namespace bound as `OPENMUSE_STORE` (`OPENMUSE_STATE_STORE=kv` is
set in `vars`). Notes are project memory on OpenComputer and worker
outcomes are delivered by the platform, so the Worker has no cron trigger
and no scheduled handler. The evidence below predates that change: it was
recorded with the cron trigger and the fixture notes the Worker then had.

## Before either path

```sh
npm ci
npx opencomputer login
npm run setup -- --target cloudflare
```

`setup` generates `OPENMUSE_OWNER_SECRET`, `OPENMUSE_COOKIE_SECRET` and
`OPENMUSE_AGENT_SECRET` into the ignored `.env.local` (mode 600), copies the
OpenComputer key from the CLI login into it, links or creates the project
`openmuse-dev`, and prints the steps below. Cloudflare does not generate
secret values, so the owner login secret is the one `setup` printed; it is
also in `.env.local`.

## Path A: the button (public repository only; not exercised)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/diggerhq/openmuse)

Cloudflare clones the repository into your account, reads `wrangler.jsonc`,
provisions a KV namespace for `OPENMUSE_STORE` (rewriting the placeholder id
in the clone) and prompts for the secrets listed
in `.env.example` with the descriptions from `package.json`
(`cloudflare.bindings`):

| Prompt | Value |
| --- | --- |
| `OPENCOMPUTER_API_KEY` | your key (`~/.opencomputer/config.json` after `npx opencomputer login`) |
| `OPENCOMPUTER_PROJECT_ID` | the id `npm run setup` printed |
| `OPENMUSE_OWNER_SECRET`, `OPENMUSE_COOKIE_SECRET`, `OPENMUSE_AGENT_SECRET` | from `.env.local` |

Build and deploy commands come from `package.json`: `build` (the Node build,
harmless here) and `deploy` (`npm run build:cloudflare && wrangler deploy`).
The same two scripts drive Workers Builds on every push to the clone. Then
run `npm run setup -- --origin https://<worker host>` (step "After the app
is up" below).

## Path B: the CLI (verified)

```sh
npx wrangler login          # with several accounts: export CLOUDFLARE_ACCOUNT_ID=<id>
npm run deploy:cloudflare
```

`scripts/deploy-cloudflare.mjs` creates the KV namespace on first use and
writes its id into `wrangler.jsonc` (commit that), runs `npm run deploy`, and
uploads every value in `.env.local` as a Worker secret (`wrangler secret
bulk`). It prints the Worker URL.

## After the app is up (both paths)

```sh
npm run setup -- --origin https://<worker host>
```

deploys both agents to Development with the managed connection pinned to the
Worker's origin. Open the URL and sign in with `OPENMUSE_OWNER_SECRET`. The
sign-in registers `OPENMUSE_AGENT_SECRET` with the platform for that origin
(`src/lib/oc/installation.ts`); nothing else to upload.

If the Worker was deployed with `OPENMUSE_APP_ORIGIN` set to another origin
(a local tunnel from an earlier `setup`), the sign-in registers that origin
instead; delete the secret (`npx wrangler secret delete OPENMUSE_APP_ORIGIN`)
or set it to the Worker's URL.

## Evidence

Throwaway Worker `openmuse-matrix-test` on account `Igor@digger.dev`, deployed
on 2026-09-10 (UTC) with the CLI path above (`wrangler.jsonc` temporarily
renamed), then deleted together with its KV namespace.

- `npm run deploy:cloudflare`: 29.5 s wall clock end to end: KV namespace
  created; build; upload 3,466 KiB (gzip 657 KiB), 43 static assets, Worker
  startup time 22 ms; `Deployed openmuse-matrix-test triggers` with
  `schedule: * * * * *`; 11 secrets created by `wrangler secret bulk`.
- URL `https://openmuse-matrix-test.<subdomain>.workers.dev`:
  `GET /api/health` returned `{"ok":true,"stateStore":"kv","environment":"development"}`
  in 186 ms; `/` redirected to `/login` (307); `/api/auth/me` without a
  cookie returned 401.
- Playwright smoke (`BASE_URL=<worker url> npx playwright test e2e/smoke.spec.ts --project=desktop`,
  the app's own owner-cookie fixture): 2 passed in 1.9 s (login page for
  visitors; the owner cookie opens the main conversation, which replays the
  real coordinator session from OpenComputer Development).
- Sign-in through `POST /api/auth/login` with the owner secret: 200 in
  157 ms, `installation: "registered"`; a wrong secret: 401. With
  `OPENMUSE_APP_ORIGIN` removed from the Worker, the next sign-in registered
  the Worker's own origin: `npx opencomputer secrets list` showed
  `OPENMUSE_AGENT_SECRET development project https://openmuse-matrix-test.<subdomain>.workers.dev`.
  (Restored to the local tunnel origin afterwards.)
- Cron: `wrangler tail --format json` captured a `scheduled` event with
  `"cron": "* * * * *"` at 22:19:06 UTC, `outcome: ok`, no exceptions
  (the tick found no worker sessions in the fresh store).
- Deleted: `wrangler delete` (Worker) and `wrangler kv namespace delete`;
  the URL answers 404 and the namespace list is empty.
