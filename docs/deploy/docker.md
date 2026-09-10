# Deploy the Docker image

Status: **verified locally** (2026-09-10, evidence below): the image builds,
runs the Playwright smoke, keeps its state on a volume across restarts, and
stops on SIGTERM. Publishing to GHCR runs on every push to `main` and every
`v*` tag (`.github/workflows/image.yml`); the run for the publishing commit
is recorded below.

The image is the Node build of the app (`Dockerfile`, multi-stage on
`node:22-alpine`, runs as the `node` user, listens on `PORT`, default 3000,
health check on `GET /api/health`). It sets `OPENMUSE_STATE_DIR=/data` for the
interim topic index and notes (mount a volume there) and
`OPENMUSE_RETURN_PATH=timer` so the interim return path runs in-process.
Everything else comes from the environment (`.env.example`).

## Run

```sh
npm ci
npx opencomputer login
npm run setup -- --target docker         # secrets and the project into .env.local; prints the steps
docker run -d --name openmuse -p 3000:3000 \
  --env-file .env.local \
  -v openmuse-data:/data \
  ghcr.io/diggerhq/openmuse:latest
```

The package is private while the repository is: `docker login ghcr.io` with a
GitHub token that has `read:packages`, or build it yourself with
`docker build -t openmuse .`.

Put an https origin in front of port 3000 (your reverse proxy, or a tunnel
such as `ngrok http --domain=<host> 3000`); the agents call back to that
origin and the browser's cookie is `Secure`. The server trusts
`X-Forwarded-Proto` and `X-Forwarded-Host` from that proxy (`src/server.ts`),
so do not expose the container to the internet without one. Then:

```sh
npm run setup -- --origin https://<that origin>   # deploys the agents pinned to it
```

Open the origin and sign in with `OPENMUSE_OWNER_SECRET` from `.env.local`;
the sign-in registers the installation secret with the platform for that
origin.

The state directory holds `state.json` (the topic index) and the fixture
notes under `memory/`; back up or move the volume to keep topics across
hosts. On a host without a volume set `OPENMUSE_STATE_STORE=memory` and
accept that topics are lost on restart.

## Evidence

Local build with Docker 29.5 (colima, arm64) on 2026-09-10:

- `docker build -t openmuse:local .`: 43.6 s cold (dependency install
  dominates; the build step itself is 2 s). Image `openmuse:local`
  **475 MB** (Node 22 on Alpine 3.24 is 170 MB of it; production
  `node_modules` 205 MB, of which `lucide-react` 44 MB and
  `@tanstack/start-plugin-core` with its `esbuild`/`prettier`/`@babel`
  dependencies 60 MB; the app's own `dist/` is 3 MB).
- `docker run -d -p 3300:3000 --env-file .env.local -v openmuse-matrix-test:/data openmuse:local`:
  `GET /api/health` returned `{"ok":true,"stateStore":"fs","environment":"development"}`
  in 111 ms; `/` redirected to `/login`; the log shows
  `return_path.timer_started` (interval 2 s); Docker reported the container
  `healthy` after the start period.
- Playwright smoke (`BASE_URL=http://localhost:3300 npx playwright test e2e/smoke.spec.ts --project=desktop`):
  2 passed in 1.3 s, against the real coordinator session in OpenComputer
  Development.
- The volume held `state.json` and `memory/profile/owner.json` plus the
  topics after the run; `docker stop` took 1 s (SIGTERM honoured by the
  in-process server, no kill wait); after `docker start` the health check
  answered 200 and `state.json` was unchanged. Container and volume removed.
- GHCR: see the workflow run recorded in the README's Deploy section once
  the publishing commit is on `main`.
