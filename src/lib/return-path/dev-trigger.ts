// Development only, Cloudflare target: workerd has no timers outside a
// request, so this Vite plugin (running in the Node dev process) fires the
// Worker's scheduled handler every two seconds through the local endpoint
// @cloudflare/vite-plugin exposes for cron testing. Deleted with the module.
import type { Plugin } from "vite";

export function returnPathDevTrigger(): Plugin {
  return {
    name: "openmuse:return-path-dev-trigger",
    apply: "serve",
    configureServer(server) {
      let timer: ReturnType<typeof setInterval> | undefined;
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        const port = typeof address === "object" && address ? address.port : Number(server.config.server.port ?? 5173);
        timer = setInterval(() => {
          fetch(`http://127.0.0.1:${port}/cdn-cgi/local/scheduled?cron=*+*+*+*+*`).catch(() => undefined);
        }, 2000);
      });
      server.httpServer?.once("close", () => clearInterval(timer));
    },
  };
}
