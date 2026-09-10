# Deploy to Railway

Status: **spec validated, deploy not exercised.** `.railway/railway.ts`
typechecks against `railway@3.11.0` (`railway/iac`) and, evaluated with the
package's own `createRailwayContext` the way `railway config plan` does,
yields the intended graph: service `openmuse` from the Dockerfile with the
health check, volume `openmuse-data` mounted at `/data`, the five secrets as
`preserve()`. No Railway account was available, so `railway config apply`
and the deploy were not run.

Two facts from Railway's current docs shape this path:

- `railway.json` / `railway.toml` (config-as-code) is deprecated: new
  services cannot opt in and existing files stop being read on 2026-12-01.
  The current format is Infrastructure as Code, `.railway/railway.ts`,
  evaluated by the Railway CLI.
- A "Deploy on Railway" button comes from a template authored in the Railway
  dashboard (`https://railway.com/new/template/<code>`), not from a file in
  the repository, so there is no button here. Templates can generate secrets
  with `${{secret(32)}}`; the IaC context's `randomString` is a
  deterministic hash, not a secret generator, so the secrets are set once
  from the CLI instead.

What runs where: one service built from the `Dockerfile` (Railway always
builds with a Dockerfile when it finds one), a 1 GB volume at `/data` for the
interim topic index and notes, the interim return path on the in-process
timer, the health check on `/api/health`. Railway injects `PORT`.

## Steps

```sh
npm ci && npx opencomputer login
npm run setup -- --target railway          # secrets and the project into .env.local; prints these steps
npm install -D railway                     # the IaC package the CLI evaluates
npx railway login && npx railway init      # a new project, linked to this directory
npx railway config plan                    # shows: create service openmuse, volume openmuse-data
npx railway config apply
npx railway variables --set "OPENCOMPUTER_API_KEY=<from .env.local>" \
  --set "OPENCOMPUTER_PROJECT_ID=<from .env.local>" \
  --set "OPENMUSE_OWNER_SECRET=<from .env.local>" \
  --set "OPENMUSE_COOKIE_SECRET=<from .env.local>" \
  --set "OPENMUSE_AGENT_SECRET=<from .env.local>"
npx railway up                             # builds the Dockerfile and deploys
npx railway domain                         # a public https domain
npm run setup -- --origin https://<that domain>
```

The service source in `railway.ts` is `github("diggerhq/openmuse")`; with a
private repository connect GitHub to Railway with access to it, or remove
`source` and keep deploying with `railway up` from your checkout. Open the
domain and sign in with `OPENMUSE_OWNER_SECRET` from `.env.local`; the
sign-in registers the installation secret for the origin.
