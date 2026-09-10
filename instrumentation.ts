// Starts the interim return-path poller in a resident Node process. Hosts
// without one (Vercel functions) call POST /api/internal/return-path/tick
// from a cron instead. See lib/return-path/watcher.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.OPENMUSE_RETURN_PATH_POLL !== "0") {
    const { startWatcher } = await import("@/lib/return-path/watcher");
    startWatcher();
  }
}
