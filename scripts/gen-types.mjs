// Regenerates lib/db/database.types.ts from the live Supabase schema.
//
// Runs outside Next, so it loads .env.local itself using Node's built-in
// env-file support — no dotenv. The output is captured first and written
// only after the CLI succeeds, so a failed run can never truncate the
// committed types file.
//
// Usage: npm run db:gen-types

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

const ENV_FILE = ".env.local";
const TYPE_FILE = "lib/db/database.types.ts";

if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

const projectId = process.env.SUPABASE_PROJECT_ID;
if (!projectId || !/^[a-z0-9]+$/i.test(projectId)) {
  console.error(
    `[db:gen-types] SUPABASE_PROJECT_ID is missing or malformed — add the project ref to ${ENV_FILE}.`,
  );
  process.exit(1);
}

let generated;
try {
  generated = execSync(
    `supabase gen types typescript --project-id ${projectId} --schema public`,
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
} catch (error) {
  console.error("[db:gen-types] `supabase gen types` failed.");
  if (error.stderr) process.stderr.write(error.stderr);
  else console.error(error.message ?? String(error));
  process.exit(1);
}

mkdirSync(dirname(TYPE_FILE), { recursive: true });
writeFileSync(TYPE_FILE, generated);
console.log(`[db:gen-types] wrote ${TYPE_FILE}`);
