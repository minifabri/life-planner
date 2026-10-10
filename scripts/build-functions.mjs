// Prepara il codice condiviso con le Edge Function (Deno): la logica pura di `lib/` viene impacchettata
// in un solo file accanto alla funzione, così in produzione gira lo stesso codice coperto dai test.
// Uso: `pnpm build:functions`, poi si pubblica la funzione. `--check` fallisce se il file non è aggiornato.
import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const targets = [{ entry: "lib/reminders/plan.ts", out: "supabase/functions/dispatch-reminders/plan.gen.js" }];
const check = process.argv.includes("--check");
let stale = false;

for (const { entry, out } of targets) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    target: "es2022",
    legalComments: "none",
    banner: { js: `// File generato da scripts/build-functions.mjs a partire da ${entry}. Non modificare a mano.` },
  });
  const code = result.outputFiles[0].text;
  if (check) {
    const current = await readFile(out, "utf8").catch(() => "");
    if (current !== code) {
      stale = true;
      console.error(`${out} non è aggiornato: esegui pnpm build:functions`);
    }
  } else {
    await writeFile(out, code);
    console.log(`${out} (${(code.length / 1024).toFixed(0)} kB)`);
  }
}

if (stale) process.exit(1);
