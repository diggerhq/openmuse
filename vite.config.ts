// One build, several hosts. OPENMUSE_TARGET picks the adapter at build time:
//   (unset)     Node: `vite dev` runs the server in this process; `vite build`
//               emits dist/server/server.js (a fetch handler) + dist/client,
//               served by `npm start` (srvx, listens on PORT). Docker, Railway,
//               Render, Fly and DigitalOcean use this shape.
//   cloudflare  Cloudflare Workers through @cloudflare/vite-plugin; dev runs
//               the server in workerd with the bindings from wrangler.jsonc.
// Server code is Web-API only, so the same source builds for both.
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { returnPathDevTrigger } from "./src/lib/return-path/dev-trigger.ts";

const target = process.env.OPENMUSE_TARGET === "cloudflare" ? "cloudflare" : "node";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    ...(target === "cloudflare" ? [cloudflare({ viteEnvironment: { name: "ssr" } }), returnPathDevTrigger()] : []),
    tanstackStart({ srcDirectory: "src", server: { entry: "server.ts" } }),
    viteReact(),
  ],
});
