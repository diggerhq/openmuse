// The server entry, in the universal fetch-handler shape every host accepts.
// Cloudflare calls fetch(request, env, ctx); Node (srvx) and the Vite dev
// server call fetch(request). The Workers bindings are the only
// host-specific input and stay in this file.
//
// On Node the server sits behind the host's TLS-terminating proxy (Render,
// Railway, Fly, DigitalOcean, or your own in front of the Docker image), so
// srvx is told to trust X-Forwarded-Proto and X-Forwarded-Host: request.url
// then carries the public https origin the browser sees, which the origin
// check on every state-changing route compares against. Never expose the
// Node server to the internet without a proxy; the app origin must be https
// for the agents to reach it anyway. Cloudflare ignores the extra key.
import handler from "@tanstack/react-start/server-entry";
import { tick } from "@/lib/return-path";
import { ensureReturnPathTimer } from "@/lib/return-path/timer";
import { bindKvNamespace, type KvNamespaceLike } from "@/lib/store/kv";

interface WorkerBindings {
  readonly OPENMUSE_STORE?: KvNamespaceLike;
}

function bind(bindings: WorkerBindings | undefined): void {
  if (bindings?.OPENMUSE_STORE) bindKvNamespace(bindings.OPENMUSE_STORE);
}

export default {
  trustProxy: true,
  fetch(request: Request, bindings?: WorkerBindings): Promise<Response> | Response {
    bind(bindings);
    ensureReturnPathTimer();
    return handler.fetch(request);
  },
  // Cloudflare cron trigger (wrangler.jsonc `triggers.crons`): one pass of the
  // fallback return path; a no-op once the coordinator has its subscription.
  async scheduled(
    _event: unknown,
    bindings: WorkerBindings | undefined,
    context: { waitUntil(promise: Promise<unknown>): void },
  ) {
    bind(bindings);
    context.waitUntil(tick());
  },
};
