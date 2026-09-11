// Railway Infrastructure as Code (https://docs.railway.com/infrastructure-as-code),
// the current format: railway.json/railway.toml config-as-code is deprecated
// and closed to new services. Evaluated by the Railway CLI:
//   npm install -D railway && npx railway login && npx railway init
//   npx railway config plan && npx railway config apply
// One service built from the Dockerfile (Railway always builds with a
// Dockerfile when it finds one), a volume at /data for the session map, the
// health check on /api/health. Secrets are `preserve()`: the file
// never carries them; set them once with `railway variables --set` (the IaC
// context's randomString is a deterministic hash, not a secret generator).
// Status: typechecked against railway@3.11.0 `railway/iac`; a deploy has not
// been exercised. There is no repository-driven Deploy on Railway button:
// buttons come from templates made in the Railway dashboard.
import { defineRailway, github, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const data = volume("openmuse-data", { sizeMB: 1024 });
  const web = service("openmuse", {
    source: github("diggerhq/openmuse", { branch: "main" }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheck: "/api/health",
    healthcheckTimeout: 60,
    volumeMounts: { "/data": data },
    env: {
      OPENMUSE_STATE_DIR: "/data",
      OPENCOMPUTER_API_KEY: preserve(),
      OPENCOMPUTER_PROJECT_ID: preserve(),
      OPENMUSE_OWNER_SECRET: preserve(),
      OPENMUSE_COOKIE_SECRET: preserve(),
      OPENMUSE_AGENT_SECRET: preserve(),
    },
  });
  return project("openmuse", { resources: [web, data] });
});
