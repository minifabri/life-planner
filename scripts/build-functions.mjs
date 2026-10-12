// Prepara il codice condiviso con le Edge Function (Deno): la logica pura di `lib/` viene impacchettata
// in un solo file accanto alla funzione, così in produzione gira lo stesso codice coperto dai test.
// Le librerie restano fuori dal pacchetto: Deno le prende da npm, alle stesse versioni di package.json.
// Uso: `pnpm build:functions`, poi si pubblica la funzione. `--check` fallisce se il file non è aggiornato.
import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
/** "date-fns/locale" → "npm:date-fns@4.4.0/locale" */
// Pacchetti CommonJS: Deno non ne vede gli export per nome, quindi si passa dal default.
const commonJs = { rrule: ["RRule"] };
const npmSpecifiers = {
  name: "npm-specifiers",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.namespace === "cjs-shim") return { path: `npm:${args.path}@${pkg.dependencies[args.path]}`, external: true };
      if (commonJs[args.path]) return { path: args.path, namespace: "cjs-shim" };
      const name = args.path.split("/").slice(0, args.path.startsWith("@") ? 2 : 1).join("/");
      const version = pkg.dependencies[name];
      if (!version) return { errors: [{ text: `${name} non è tra le dipendenze di package.json` }] };
      return { path: `npm:${name}@${version}${args.path.slice(name.length)}`, external: true };
    });
    b.onLoad({ filter: /.*/, namespace: "cjs-shim" }, (args) => ({
      contents: `import pkg from "${args.path}";\n${commonJs[args.path].map((n) => `export const ${n} = pkg.${n};`).join("\n")}`,
    }));
  },
};

const targets = [
  { entry: "lib/reminders/plan.ts", out: "supabase/functions/dispatch-reminders/plan.gen.js" },
  { entry: "lib/health/edge.ts", out: "supabase/functions/health-workouts/health.gen.js" },
  { entry: "lib/wardrobe/recognize.ts", out: "supabase/functions/wardrobe-recognize/recognize.gen.js" },
];
const check = process.argv.includes("--check");
let stale = false;

for (const { entry, out } of targets) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    plugins: [npmSpecifiers],
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
