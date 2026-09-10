// The server entry, in the universal fetch-handler shape every host accepts.
// Cloudflare calls fetch(request, env, ctx) and scheduled(event, env, ctx);
// Node (srvx) and the Vite dev server call fetch(request). The Workers
// bindings are the only host-specific input and stay in this file.
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
  fetch(request: Request, bindings?: WorkerBindings): Promise<Response> | Response {
    bind(bindings);
    ensureReturnPathTimer();
    return handler.fetch(request);
  },
  // Cloudflare cron trigger (wrangler.jsonc `triggers.crons`): one pass of the
  // interim return path.
  async scheduled(
    _event: unknown,
    bindings: WorkerBindings | undefined,
    context: { waitUntil(promise: Promise<unknown>): void },
  ) {
    bind(bindings);
    context.waitUntil(tick());
  },
};
