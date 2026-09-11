import { defineConfig } from "vitest/config";

// Unit tests run in Node; component tests opt into happy-dom per file with
// `// @vitest-environment happy-dom`.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { include: ["test/**/*.test.ts", "test/**/*.test.tsx"], environment: "node" },
});
