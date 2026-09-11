// Demo notes into project memory: the owner profile and the two example
// topics under fixtures/notes, created only where the document does not
// exist yet (`If-None-Match: *`), so running it again changes nothing. The
// app creates an empty profile on first use by itself; this is the demo
// content the README walks through. Needs the agents deployed first: a
// resource exists in an environment once a deployment declares it.
//
//   npm run seed                      # Development, from .env.local
//   npm run seed -- --environment production
import { readdir, readFile } from "node:fs/promises";
import { readEnvFile, root } from "./env-file.mjs";
import { parseNote } from "./notes.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const env = await readEnvFile();
const apiKey = env.OPENCOMPUTER_API_KEY;
const projectId = env.OPENCOMPUTER_PROJECT_ID;
const environment = option("--environment") ?? env.OPENCOMPUTER_ENVIRONMENT ?? "development";
const apiUrl = new URL(env.OPENCOMPUTER_API_URL ?? "https://app.opencomputer.dev").origin;
if (!apiKey || !projectId)
  throw new Error("OPENCOMPUTER_API_KEY and OPENCOMPUTER_PROJECT_ID must be in .env.local; run npm run setup");

async function create(resource, id, note) {
  const url = `${apiUrl}/api/managed-agents/projects/${encodeURIComponent(projectId)}/memory/${resource}/documents/${encodeURIComponent(id)}?environment=${environment}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "x-api-key": apiKey,
      accept: "application/json",
      "content-type": "application/json",
      "if-none-match": "*",
    },
    body: JSON.stringify({ title: note.title, text: note.text, summary: note.summary }),
  });
  if (response.status === 201) return "created";
  if (response.status === 412) return "exists";
  const body = await response.text();
  throw new Error(`${resource}/${id}: ${response.status} ${body.slice(0, 300)}`);
}

const profile = parseNote(await readFile(new URL("fixtures/notes/profile.md", root), "utf8"));
console.log(`profile/owner: ${await create("profile", "owner", profile)}`);
for (const name of (await readdir(new URL("fixtures/notes/topics/", root))).filter((n) => n.endsWith(".md")).sort()) {
  const id = name.replace(/\.md$/, "");
  const note = parseNote(await readFile(new URL(`fixtures/notes/topics/${name}`, root), "utf8"));
  console.log(`topics/${id}: ${await create("topics", id, note)}`);
}
console.log(`Seeded ${environment} memory of project ${projectId}.`);
