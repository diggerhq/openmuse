// The Node driver of the fallback return path (see index.ts): one tick every
// two seconds while the process lives. Idempotent across module reloads, and
// never started on edge runtimes (no timers outside a request; Cloudflare
// uses the cron trigger).
import { tick } from "@/lib/return-path";

const KEY = Symbol.for("openmuse.returnPathTimer");
const INTERVAL_MS = 2000;

function edgeRuntime(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

export function ensureReturnPathTimer(): boolean {
  if (edgeRuntime()) return false;
  const global = globalThis as { [KEY]?: ReturnType<typeof setInterval> };
  if (global[KEY]) return true;
  global[KEY] = setInterval(() => {
    void tick().catch((error) =>
      console.error(
        JSON.stringify({
          level: "error",
          event: "return_path.tick_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      ),
    );
  }, INTERVAL_MS);
  const handle = global[KEY] as { unref?: () => void };
  handle.unref?.();
  console.log(JSON.stringify({ level: "info", event: "return_path.timer_started", intervalMs: INTERVAL_MS }));
  return true;
}
