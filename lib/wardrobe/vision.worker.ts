/// <reference lib="webworker" />
import { CLIPVisionModelWithProjection, Tensor, env, type PreTrainedModel } from "@huggingface/transformers";

/**
 * Il modello che "guarda" la foto, in un worker: l'interfaccia resta fluida mentre lavora.
 * È la sola parte immagine di MobileCLIP-S0 (23 MB), scaricata una volta da Hugging Face e poi tenuta
 * nella cache del browser insieme al motore WebAssembly: da lì in poi funziona anche senza rete.
 * La foto non lascia mai il dispositivo.
 */
declare const self: DedicatedWorkerGlobalScope;

const MODEL = "Xenova/mobileclip_s0";
// La stessa revisione con cui `scripts/build-wardrobe-vision.mjs` ha calcolato le descrizioni.
const REVISION = "757d59c9c6870a76a4b0306f05f5061bca15c39f";

export type VisionRequest = { id: number; pixels: Uint8ClampedArray; size: number };
export type VisionReply = { id: number; embedding: Float32Array } | { id: number; error: string };

env.allowLocalModels = false;
// Il motore senza WebGPU: pesa la metà di quello predefinito e qui basta.
const wasm = env.backends.onnx?.wasm;
const version = env.backends.onnx?.versions?.web;
if (wasm && version) {
  const base = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/ort-wasm-simd-threaded`;
  wasm.wasmPaths = { mjs: `${base}.mjs`, wasm: `${base}.wasm` };
}

let loading: Promise<PreTrainedModel> | null = null;

function load(): Promise<PreTrainedModel> {
  loading ??= CLIPVisionModelWithProjection.from_pretrained(MODEL, { revision: REVISION, dtype: "fp16", device: "wasm" }).catch((error) => {
    // Senza rete al primo uso: si riprova alla prossima foto.
    loading = null;
    throw error;
  });
  return loading;
}

/** Da RGBA (0–255, riga per riga) al tensore che il modello si aspetta: tre piani R, G, B tra 0 e 1. */
function toTensor(pixels: Uint8ClampedArray, size: number): Tensor {
  const plane = size * size;
  const data = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    data[i] = pixels[i * 4] / 255;
    data[plane + i] = pixels[i * 4 + 1] / 255;
    data[plane * 2 + i] = pixels[i * 4 + 2] / 255;
  }
  return new Tensor("float32", data, [1, 3, size, size]);
}

self.onmessage = async (event: MessageEvent<VisionRequest>) => {
  const { id, pixels, size } = event.data;
  try {
    const model = await load();
    const { image_embeds } = await model({ pixel_values: toTensor(pixels, size) });
    const embedding = Float32Array.from(image_embeds.data as Float32Array);
    self.postMessage({ id, embedding } satisfies VisionReply, [embedding.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies VisionReply);
  }
};
