// Template for opencomputer/agents/<agent>/memory.ts, copied by
// scripts/prepare-agent.mjs into both agents. Declarations that share an id
// within a deployment must agree on provider and configuration, and the
// compiler only reads agent source modules inside each agent's directory,
// so the one declaration lives here and is copied, never edited in place.
//
// `profile` and `topics` are resource names OpenMuse chose; the document ids
// (`owner`, one per topic) are chosen by the app. The coordinator binds
// `profile` read-write and `topics` as a collection; a worker binds `profile`
// read and its own topic document read-write (src/lib/oc/sessions.ts).
import { defineMemory, documentMemory } from "@opencomputer/agent";

export const profile = defineMemory({
  id: "profile",
  description:
    "The owner's lasting preferences that apply to every topic: tools and versions, style, constraints. One document, replaced whole; keep what still holds.",
  provider: documentMemory({ maxBytes: 4_096 }),
});

export const topics = defineMemory({
  id: "topics",
  description:
    "One document per topic: brief, decisions, sources, tested revisions and commands, unfinished work. Replaced whole; keep what still holds.",
  provider: documentMemory({ maxBytes: 8_192 }),
});
