const MAIN_MAX_DIM = 1600;
const THUMB_MAX_DIM = 400;
const QUALITY = 0.82;

/** Dimensioni scalate per restare dentro `maxDim` sul lato più lungo, senza deformare l'immagine. */
export function fitWithin(width: number, height: number, maxDim: number): { width: number; height: number } {
  if (width <= maxDim && height <= maxDim) return { width, height };
  const scale = maxDim / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function resize(source: ImageBitmap, maxDim: number, quality: number): Promise<Blob> {
  const { width, height } = fitWithin(source.width, source.height, maxDim);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  ctx.drawImage(source, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Compressione non riuscita"))), "image/jpeg", quality);
  });
}

/**
 * Foto principale compressa e la sua miniatura, pronte per l'upload.
 * Riduce le dimensioni e il peso prima di salvare: un guardaroba di centinaia di capi resta ben dentro
 * il piano gratuito di Storage (1 GB).
 */
export async function compressImage(file: File): Promise<{ main: Blob; thumb: Blob }> {
  const bitmap = await createImageBitmap(file);
  try {
    const [main, thumb] = await Promise.all([resize(bitmap, MAIN_MAX_DIM, QUALITY), resize(bitmap, THUMB_MAX_DIM, QUALITY)]);
    return { main, thumb };
  } finally {
    bitmap.close();
  }
}
