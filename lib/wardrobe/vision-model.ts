import embeddings from "./vision-embeddings.gen.json";
import { decodeTable, recognize, type Recognition, type VisionTable } from "./vision";
import type { VisionReply, VisionRequest } from "./vision.worker";

/**
 * Riconoscimento del capo da una foto, nel browser: prepara l'immagine, la passa al modello nel worker
 * e traduce la risposta in proposte. Questo modulo si carica solo quando serve (`import()`), così il resto
 * dell'app non ne porta il peso.
 */

/** Il lato dell'immagine che il modello si aspetta. */
const INPUT_DIM = 256;
const READY_KEY = "wardrobe-vision-ready";

let worker: Worker | null = null;
let table: VisionTable | null = null;
let nextId = 0;
const waiting = new Map<number, { resolve: (embedding: Float32Array) => void; reject: (error: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./vision.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<VisionReply>) => {
    const reply = event.data;
    const entry = waiting.get(reply.id);
    if (!entry) return;
    waiting.delete(reply.id);
    if ("error" in reply) entry.reject(new Error(reply.error));
    else entry.resolve(reply.embedding);
  };
  worker.onerror = () => {
    for (const entry of waiting.values()) entry.reject(new Error("Riconoscimento non disponibile"));
    waiting.clear();
    worker = null;
  };
  return worker;
}

/** Il quadrato centrale della foto, ridotto al lato che serve al modello. */
async function squarePixels(file: Blob): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = INPUT_DIM;
    canvas.height = INPUT_DIM;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas non disponibile");
    ctx.imageSmoothingQuality = "high";
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, INPUT_DIM, INPUT_DIM);
    return ctx.getImageData(0, 0, INPUT_DIM, INPUT_DIM).data;
  } finally {
    bitmap.close();
  }
}

/** Vero dopo il primo riconoscimento riuscito su questo dispositivo: il modello è già stato scaricato. */
export function visionReady(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === "1";
  } catch {
    return false;
  }
}

/** Che capo c'è nella foto. Rifiuta se il modello non si può caricare (prima volta senza rete, browser troppo vecchio). */
export async function recognizeGarment(file: Blob): Promise<Recognition> {
  const pixels = await squarePixels(file);
  const id = nextId++;
  const embedding = await new Promise<Float32Array>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, pixels, size: INPUT_DIM } satisfies VisionRequest, [pixels.buffer]);
  });
  table ??= decodeTable(embeddings);
  try {
    localStorage.setItem(READY_KEY, "1");
  } catch {
    // Senza archivio locale si mostra ogni volta l'avviso del primo scaricamento: innocuo.
  }
  return recognize(embedding, table);
}
