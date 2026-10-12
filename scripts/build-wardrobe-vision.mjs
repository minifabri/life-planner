// Prepara il riconoscimento dei capi dalla foto: calcola una volta, qui, l'impronta di ogni descrizione
// di `lib/wardrobe/vision-labels.ts` con la parte "testo" del modello. Nel dispositivo arriva così solo
// la parte "immagine" (23 MB invece di 190) e il confronto è un prodotto scalare.
// Uso: `pnpm build:vision` dopo ogni modifica alle descrizioni. Scarica il modello di testo (170 MB)
// in `node_modules/.cache/wardrobe-vision`, una volta sola.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Tokenizer } from "@huggingface/tokenizers";
import { build } from "esbuild";
import * as ort from "onnxruntime-web";

const MODEL = "Xenova/mobileclip_s0";
const REVISION = "757d59c9c6870a76a4b0306f05f5061bca15c39f";
const CONTEXT = 77;
const OUT = "lib/wardrobe/vision-embeddings.gen.json";
const CACHE = "node_modules/.cache/wardrobe-vision";

async function cached(file) {
  const path = `${CACHE}/${REVISION.slice(0, 8)}-${file.replaceAll("/", "_")}`;
  if (!existsSync(path)) {
    await mkdir(CACHE, { recursive: true });
    console.log(`Scarico ${file}…`);
    const res = await fetch(`https://huggingface.co/${MODEL}/resolve/${REVISION}/${file}`);
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
  }
  return readFile(path);
}

const bundled = await build({ entryPoints: ["lib/wardrobe/vision-labels.ts"], bundle: true, write: false, format: "esm" });
const labels = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const prompts = labels.visionPrompts();
const all = [...prompts.types, ...prompts.styles, ...prompts.materials];

const tokenizer = new Tokenizer(JSON.parse(await cached("tokenizer.json")), JSON.parse(await cached("tokenizer_config.json")));
const session = await ort.InferenceSession.create(await cached("onnx/text_model.onnx"));

const rows = [];
for (const prompt of all) {
  const { ids } = tokenizer.encode(prompt);
  if (ids.length > CONTEXT) throw new Error(`Descrizione troppo lunga: ${prompt}`);
  const input = new BigInt64Array(CONTEXT); // il riempimento è il token 0
  ids.forEach((id, i) => (input[i] = BigInt(id)));
  const out = await session.run({ input_ids: new ort.Tensor("int64", input, [1, CONTEXT]) });
  const vector = Array.from(out.text_embeds.data);
  const norm = Math.hypot(...vector);
  rows.push(vector.map((x) => x / norm));
}

// Vettori unitari a 16 bit: un decimo del peso del JSON in chiaro, con un errore sul coseno sotto 1e-4.
const dim = rows[0].length;
const packed = new Int16Array(rows.length * dim);
rows.forEach((row, r) => row.forEach((x, i) => (packed[r * dim + i] = Math.round(x * 32767))));

const result = {
  model: MODEL,
  revision: REVISION,
  dim,
  promptsHash: createHash("sha256").update(JSON.stringify(prompts)).digest("hex"),
  data: Buffer.from(packed.buffer).toString("base64"),
};
await writeFile(OUT, `${JSON.stringify(result)}\n`);
console.log(`${OUT}: ${rows.length} descrizioni da ${dim} valori`);
