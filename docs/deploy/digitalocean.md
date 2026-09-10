# Deploy to DigitalOcean App Platform

Status: **spec validated, deploy not exercised.** The app spec inside
`.do/deploy.template.yaml` passes `doctl apps spec validate --schema-only`
(doctl 1.168; an unknown field fails it). No DigitalOcean account was
available, so the button and the deploy were not run. The Deploy to
DigitalOcean button only supports public repositories, so it cannot work
while this repository is private.

What runs where: one service built from the `Dockerfile`, the health check
on `/api/health`, `apps-s-1vcpu-0.5gb` in `lon`. App Platform containers
have no persistent disk, so the interim topic index runs in process memory
(`OPENMUSE_STATE_STORE=memory`): topics are lost on every deploy or restart;
the coordinator session is found again by its idempotency key. The interim
return path runs on the in-process timer; App Platform has no cron for
services (its job components run around deploys, not on a schedule).
DigitalOcean does not generate secret values: the five secrets are prompted
for when the app is created, from `.env.local`.

## Steps

1. Locally, once: `npm ci && npx opencomputer login && npm run setup -- --target digitalocean`.
2. Click the button (once the repository is public):

   [![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/diggerhq/openmuse/tree/main)

   Paste `OPENCOMPUTER_API_KEY`, `OPENCOMPUTER_PROJECT_ID`,
   `OPENMUSE_OWNER_SECRET`, `OPENMUSE_COOKIE_SECRET` and
   `OPENMUSE_AGENT_SECRET` from `.env.local` when prompted.

   With a private repository, create the app from the control panel
   instead (GitHub source, this repository, the Dockerfile) and enter the
   same environment variables; or `doctl apps create --spec` with the
   `spec:` block of `.do/deploy.template.yaml` after switching `git` to a
   `github` source your account can read.
3. When the app is live, run `npm run setup -- --origin https://<app>.ondigitalocean.app`
   locally to deploy the agents pinned to that origin.
4. Open the URL and sign in with `OPENMUSE_OWNER_SECRET` from `.env.local`;
   the sign-in registers the installation secret for the origin.
