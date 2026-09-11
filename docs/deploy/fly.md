# Deploy to Fly.io

Status: **verified** (2026-09-10, evidence below) with the steps in this
file on a throwaway app, deleted afterwards. There is no Fly deploy button;
the path is the CLI.

What runs where: one Machine (`shared-cpu-1x`, 512 MB) built from the
`Dockerfile` by Fly's remote builder, a 1 GB volume `openmuse_data` at
`/data` for the session map, the health check on `/api/health`,
`force_https`. The Machine never auto-stops (`auto_stop_machines = "off"`,
`min_machines_running = 1`); that was for the in-process return path the
app no longer has (outcomes are delivered by the platform), so `stop` with
`auto_start_machines` is now an option, not exercised (the agents' callbacks
and the browser both start a stopped Machine).

## Steps

```sh
npm ci && npx opencomputer login
npm run setup -- --target fly                  # secrets and the project into .env.local; prints these steps
fly auth login
fly launch --copy-config --no-deploy           # takes fly.toml; asks for the app name and region
fly secrets import < .env.local                # every value in the file, the OpenComputer key included
fly deploy                                     # builds, creates the volume from [[mounts]], starts the Machine
npm run setup -- --origin https://<app>.fly.dev
```

`fly launch --copy-config` rewrites `fly.toml` with your app name; keep that
change. Open `https://<app>.fly.dev` and sign in with `OPENMUSE_OWNER_SECRET`
from `.env.local`; the sign-in registers the installation secret for that
origin. If `.env.local` carried `OPENMUSE_APP_ORIGIN` from an earlier local
run, the import copied it: `fly secrets unset OPENMUSE_APP_ORIGIN` or set
it to the app's URL, otherwise the sign-in registers the old origin.

Rotation: `npm run setup -- --rotate`, then `fly secrets import < .env.local`
again (a new release restarts the Machine).

## Evidence

App `openmuse-matrix-test`, region `lhr`, personal organisation, 2026-09-10
(UTC), created and deployed with the commands above, then destroyed.

- `fly launch --copy-config --no-deploy --name openmuse-matrix-test --region lhr --yes`:
  4 s; read `fly.toml` (`shared-cpu-1x, 512MB RAM (from your fly.toml)`),
  created the app, validated the configuration, rewrote the file with the
  app name.
- `fly secrets import --stage < .env.local`: staged.
- `fly deploy --remote-only`: 1 min 39 s from build start to
  `Machine 807229f655d108 [app] update finished: success`; remote build,
  image `registry.fly.io/openmuse-matrix-test:deployment-…`, image size
  78 MB (compressed); `Creating a 1 GB volume named 'openmuse_data'` from
  `[[mounts]]` with no separate command. One hiccup outside the app: the
  first deploy logged `Failed to provision IP addresses … org_slug is only
  supported with private_v6 type`; `fly ips allocate-v4 --shared` and
  `fly ips allocate-v6` fixed it in 2 s. Reported to keep the record honest;
  the doc step list does not need it unless it recurs.
- `GET /api/health`: `{"ok":true,"stateStore":"fs","environment":"development"}`
  in 94 ms over https. Plain http: 301 to https (`force_https`).
- Sign-in through `POST /api/auth/login` with `Origin: https://openmuse-matrix-test.fly.dev`:
  200 in 195 ms, `installation: "registered"`, `Secure` cookie. This is the
  proof that the Node server behind Fly's TLS-terminating proxy sees the
  public https origin (the `trustProxy` setting in `src/server.ts`); a
  request with `Origin: https://evil.example` was refused with 403.
- Playwright smoke (`BASE_URL=https://openmuse-matrix-test.fly.dev npx playwright test e2e/smoke.spec.ts --project=desktop`):
  2 passed in 1.7 s (login page for visitors; the owner cookie opens the main
  conversation).
- The state store on the volume: after a sign-in, `GET /api/conversation`
  (200, 2.4 s: the coordinator session admitted through OpenComputer) and
  `GET /api/topics` (200, 115 ms), `fly ssh console -C "ls -la /data"` showed
  `state.json` (236 bytes, mode 600, owner `node`) and `memory/{profile,topics}`
  on the mounted volume.
- Fly's own log: `return_path.timer_started` 5 s after the Machine started;
  the first health check turned green once srvx was listening (the
  `grace_period` of 10 s covers it).
- Destroyed: `fly apps destroy openmuse-matrix-test --yes` (the volume goes
  with the app); the app no longer lists.
