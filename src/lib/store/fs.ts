// Files under the state directory, one per key; writes go through a temp
// file and rename so a crash never leaves a half-written document. The only
// Node-specific module in the server, loaded on demand so the same bundle
// still evaluates on hosts without a filesystem.
import { assertKey, type BlobStore } from "@/lib/store/blob";

export function fsBlobStore(directory: string): BlobStore {
  const fs = import("node:fs/promises");
  const path = (key: string) => `${directory}/${assertKey(key)}`;
  return {
    async get(key) {
      try {
        return await (await fs).readFile(path(key), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async put(key, value) {
      const { mkdir, rename, writeFile } = await fs;
      const target = path(key);
      await mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true, mode: 0o700 });
      const temp = `${target}.${crypto.randomUUID()}.tmp`;
      await writeFile(temp, value, { mode: 0o600 });
      await rename(temp, target);
    },
    async list(prefix) {
      const { readdir } = await fs;
      const folder = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix.slice(0, prefix.lastIndexOf("/"));
      const stem = prefix.endsWith("/") ? "" : prefix.slice(prefix.lastIndexOf("/") + 1);
      try {
        const entries = await readdir(`${directory}/${folder}`, { withFileTypes: true });
        return entries
          .filter((entry) => entry.isFile() && entry.name.startsWith(stem) && !entry.name.endsWith(".tmp"))
          .map((entry) => (folder ? `${folder}/${entry.name}` : entry.name))
          .sort();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
    },
  };
}
