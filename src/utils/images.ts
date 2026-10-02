// Shrinking photos on the device, so nothing large is ever uploaded or stored.
// A 12 MB phone photo becomes ~300 KB for the album and ~100 KB for BMO to look at.

export const ALBUM_MAX_SIDE = 1600;   // Sharp enough to view full-screen on a phone
export const ALBUM_QUALITY = 0.85;
export const AI_MAX_SIDE = 768;       // All the AI needs to understand a photo
export const AI_QUALITY = 0.8;
export const MAX_PICK_BYTES = 25 * 1024 * 1024;  // Biggest file accepted from the gallery

export class ImageError extends Error {}

// Size that fits inside maxSide x maxSide, keeping the shape and never enlarging
export const fitWithin = (width: number, height: number, maxSide: number): { width: number; height: number } => {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

type Drawable = ImageBitmap | HTMLVideoElement | HTMLCanvasElement;

const sizeOf = (source: Drawable) =>
  source instanceof HTMLVideoElement
    ? { width: source.videoWidth, height: source.videoHeight }
    : { width: source.width, height: source.height };

// Draw a source into a JPEG no bigger than maxSide (optionally mirrored, like a selfie camera)
export const drawToJpeg = (source: Drawable, maxSide: number, quality: number, mirror = false): Promise<Blob> => {
  const { width, height } = fitWithin(sizeOf(source).width, sizeOf(source).height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new ImageError("BMO couldn't draw that picture"));
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new ImageError("BMO couldn't save that picture"))), 'image/jpeg', quality)
  );
};

// A photo from the gallery → album copy + small copy for BMO to look at
export const shrinkPickedPhoto = async (file: File): Promise<{ album: Blob; forAi: Blob }> => {
  if (!file.type.startsWith('image/') && file.type !== '') throw new ImageError("That isn't a picture BMO can open.");
  if (file.size > MAX_PICK_BYTES) throw new ImageError('That picture is too big for BMO (max 25 MB).');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("BMO couldn't open that picture. Try a different one?");
  }
  try {
    const album = await drawToJpeg(bitmap, ALBUM_MAX_SIDE, ALBUM_QUALITY);
    const forAi = await drawToJpeg(bitmap, AI_MAX_SIDE, AI_QUALITY);
    return { album, forAi };
  } finally {
    bitmap.close();  // Free the full-size decoded image straight away
  }
};

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageError("BMO couldn't read that picture"));
    reader.readAsDataURL(blob);
  });

// --- Photos of text (recipes, notes): sharper than a selfie, still under the server's limit ---
export const READING_MAX_SIDE = 1280;
export const READING_MAX_BYTES = 280 * 1024;  // Server allows 300 KB
const READING_QUALITIES = [0.8, 0.7, 0.6, 0.5, 0.4];

// Encode at falling quality until the result fits (the last try is used even if it's still big)
export const encodeUnder = async (encode: (quality: number) => Promise<Blob>, maxBytes: number, qualities = READING_QUALITIES): Promise<Blob> => {
  let blob: Blob | null = null;
  for (const quality of qualities) {
    blob = await encode(quality);
    if (blob.size <= maxBytes) return blob;
  }
  return blob!;
};

// A readable copy of a page for BMO: 1280 px, then a smaller size if it still doesn't fit
export const drawForReading = async (source: Drawable): Promise<Blob> => {
  const sharp = await encodeUnder(q => drawToJpeg(source, READING_MAX_SIDE, q), READING_MAX_BYTES);
  if (sharp.size <= READING_MAX_BYTES) return sharp;
  return encodeUnder(q => drawToJpeg(source, 1024, q), READING_MAX_BYTES);
};

// A recipe or notes photo from the gallery → a readable copy for BMO
export const shrinkPageForReading = async (file: File): Promise<Blob> => {
  if (!file.type.startsWith('image/') && file.type !== '') throw new ImageError("That isn't a picture BMO can open.");
  if (file.size > MAX_PICK_BYTES) throw new ImageError('That picture is too big for BMO (max 25 MB).');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("BMO couldn't open that picture. Try a different one?");
  }
  try {
    return await drawForReading(bitmap);
  } finally {
    bitmap.close();
  }
};
