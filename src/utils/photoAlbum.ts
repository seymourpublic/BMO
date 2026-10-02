// BMO's photo album, stored only on this device (IndexedDB).
// Every function fails safe: if storage is unavailable the album is just empty.
import { newId, runDb } from './localDb';

export type PhotoKind = 'snapshot' | 'memory' | 'look';  // look: from the fashion show

export interface Photo {
  id: string;
  kind: PhotoKind;
  blob: Blob;
  comment: string;     // What BMO said about it
  caption?: string;    // The friend's own words (memories)
  createdAt: number;
}

export const MAX_PHOTOS = 60;

// Which photos to remove so at most `limit` remain (oldest first)
export const trimToLimit = (photos: Pick<Photo, 'id' | 'createdAt'>[], limit: number = MAX_PHOTOS): string[] =>
  [...photos].sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.max(0, photos.length - limit)).map(p => p.id);

const run = <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => runDb<T>('photos', mode, action);

export const listPhotos = async (): Promise<Photo[]> => {
  const all = (await run<Photo[]>('readonly', store => store.getAll() as IDBRequest<Photo[]>)) ?? [];
  return all.sort((a, b) => b.createdAt - a.createdAt);  // Newest first
};

export const addPhoto = async (photo: Omit<Photo, 'id' | 'createdAt'>): Promise<Photo | null> => {
  const saved: Photo = { ...photo, id: newId(), createdAt: Date.now() };
  const ok = await run('readwrite', store => store.put(saved));
  if (ok === null) return null;
  // Keep the album to its limit
  for (const id of trimToLimit(await listPhotos())) await deletePhoto(id);
  return saved;
};

export const deletePhoto = async (id: string): Promise<void> => {
  await run('readwrite', store => store.delete(id));
};

export const clearPhotos = async (): Promise<void> => {
  await run('readwrite', store => store.clear());
};

// What happens to photos BMO takes with its camera (memories are always kept)
export type PhotoSetting = 'album' | 'comment' | 'download';
const SETTING_KEY = 'bmo-photo-setting';
const SETTINGS: PhotoSetting[] = ['album', 'comment', 'download'];

export const loadPhotoSetting = (): PhotoSetting => {
  try {
    const saved = localStorage.getItem(SETTING_KEY) as PhotoSetting | null;
    return saved && SETTINGS.includes(saved) ? saved : 'album';
  } catch {
    return 'album';
  }
};

export const savePhotoSetting = (setting: PhotoSetting) => {
  try {
    localStorage.setItem(SETTING_KEY, setting);
  } catch {
    // Not critical
  }
};

// File name for saving a photo to the phone
export const photoFileName = (photo: Pick<Photo, 'createdAt' | 'kind'>) =>
  `bmo-${photo.kind === 'memory' ? 'memory' : 'photo'}-${new Date(photo.createdAt).toISOString().slice(0, 19).replace(/[T:]/g, '-')}.jpg`;
