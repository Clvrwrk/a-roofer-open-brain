import { readFileSync } from "node:fs";

const SAFE_ID = /^[a-z0-9-]+$/;

// Persona SOUL.md files are copied from agents/profiles/<id>/SOUL.md into
// runtime/personas/<id>.md so they ship inside the Docker image (build context
// is app/command-center). The sync test keeps the copies identical.
export function loadPersona(personaId, dir = new URL("./personas/", import.meta.url)) {
  if (!SAFE_ID.test(personaId ?? "")) return null;
  try {
    return readFileSync(new URL(`${personaId}.md`, dir), "utf8").trim() || null;
  } catch {
    return null;
  }
}
