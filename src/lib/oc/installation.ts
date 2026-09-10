// The installation secret is what the agents present to /api/agent/*; the
// platform attaches it to their managed connection to this app's origin. The
// app owns it: on every owner sign-in it tells the platform the current value
// and the origin it is allowed for, so a host that generated
// OPENMUSE_AGENT_SECRET (Render), a rotation, or a moved origin needs no
// separate upload step. One installation is live per project: the last
// sign-in owns the secret, and its origin must be the one the agents were
// deployed with (npm run setup -- --origin).
import { env } from "@/lib/env";
import { oc } from "@/lib/oc/client";

export const INSTALLATION_SECRET_NAME = "OPENMUSE_AGENT_SECRET";

/** The origin the platform is told about: OPENMUSE_APP_ORIGIN when set, else the sign-in request's own origin. */
export function installationOrigin(request: Request): string {
  return env().appOrigin ?? new URL(request.url).origin;
}

/** Registers the installation secret for `origin`; never throws. Sign-in succeeds either way; the result is logged. */
export async function registerInstallation(origin: string): Promise<"registered" | "skipped" | "failed"> {
  if (!origin.startsWith("https://")) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "installation.skipped",
        origin,
        message: "the app origin is not https; set OPENMUSE_APP_ORIGIN to the public https origin the agents can reach",
      }),
    );
    return "skipped";
  }
  try {
    await oc.putSecret(INSTALLATION_SECRET_NAME, env().agentSecret, [origin]);
    console.log(JSON.stringify({ level: "info", event: "installation.registered", origin }));
    return "registered";
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "installation.register_failed",
        origin,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return "failed";
  }
}
