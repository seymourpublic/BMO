import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { Photo, PhotoKind, PhotoSetting, deletePhoto, listPhotos, photoFileName } from '../utils/photoAlbum';
import { ImageError, shrinkPickedPhoto } from '../utils/images';

interface AlbumPanelProps {
  version: number;                 // Changes whenever the album changes, to reload it
  photoSetting: PhotoSetting;
  onTakePhoto: () => void;
  onAddMemory: (photo: { album: Blob; forAi: Blob }, caption: string) => void;
  onChanged: () => void;
  onClose: () => void;
}

const MAX_CAPTION = 200;
const formatDate = (time: number) => new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// Object URLs for the photos being shown, freed when they're no longer needed
const usePhotoUrls = (photos: Photo[]) => {
  const urls = useMemo(() => new Map(photos.map(p => [p.id, URL.createObjectURL(p.blob)])), [photos]);
  useEffect(() => () => urls.forEach(url => URL.revokeObjectURL(url)), [urls]);
  return urls;
};

export const AlbumPanel: React.FC<AlbumPanelProps> = ({ version, photoSetting, onTakePhoto, onAddMemory, onChanged, onClose }) => {
  const [tab, setTab] = useState<PhotoKind>('snapshot');
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [open, setOpen] = useState<Photo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picked, setPicked] = useState<{ album: Blob; forAi: Blob; preview: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    listPhotos().then(all => { if (current) setPhotos(all); });
    return () => { current = false; };
  }, [version]);

  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.preview); }, [picked]);

  const shown = useMemo(() => (photos ?? []).filter(p => p.kind === tab), [photos, tab]);
  const urls = usePhotoUrls(photos ?? []);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setWorking(true);
    try {
      const shrunk = await shrinkPickedPhoto(file);
      setPicked({ ...shrunk, preview: URL.createObjectURL(shrunk.album) });
    } catch (err) {
      setError(err instanceof ImageError ? err.message : "BMO couldn't open that picture. Try a different one?");
    } finally {
      setWorking(false);
      if (fileRef.current) fileRef.current.value = '';  // Allow picking the same file again
    }
  };

  const addMemory = () => {
    if (!picked) return;
    onAddMemory({ album: picked.album, forAi: picked.forAi }, caption.trim());
    setPicked(null);
    setCaption('');
  };

  const remove = async (photo: Photo) => {
    await deletePhoto(photo.id);
    setOpen(null);
    setConfirmDelete(false);
    onChanged();
  };

  // Larger view of one photo
  if (open) {
    const canDownload = open.kind === 'memory' || photoSetting === 'download';
    return (
      <Sheet title={open.kind === 'memory' ? 'Our memory' : "BMO's photo"} onClose={() => setOpen(null)}>
        <img src={urls.get(open.id)} alt={open.caption || open.comment || 'Photo'} className="w-full rounded-xl bg-white p-2 shadow" />
        {open.caption && <p className="mt-3 font-semibold">{open.caption}</p>}
        {open.comment && <p className="mt-2 text-sm italic opacity-80">BMO said: “{open.comment}”</p>}
        <p className="mt-1 text-xs opacity-60">{formatDate(open.createdAt)}</p>
        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" onClick={() => { setOpen(null); setConfirmDelete(false); }} className="rounded-full px-4 py-2 text-sm font-semibold bg-white border">
            ← Back
          </button>
          {canDownload && (
            <a href={urls.get(open.id)} download={photoFileName(open)} className="rounded-full px-4 py-2 text-sm font-semibold bg-[#43b649] text-white">
              ⬇️ Save to phone
            </a>
          )}
          {confirmDelete ? (
            <>
              <button type="button" onClick={() => remove(open)} className="rounded-full px-4 py-2 text-sm font-bold text-white bg-[#e43d3d]">
                Delete it
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-full px-3 py-2 text-sm">Keep it</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-full px-4 py-2 text-sm font-semibold text-[#c62828]">
              Delete
            </button>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="BMO's photo album" onClose={onClose}>
      <button
        type="button"
        onClick={onTakePhoto}
        className="w-full rounded-2xl py-3 text-base font-bold text-white bg-[#2d4f9e] shadow active:translate-y-[1px]"
      >
        📸 Take a photo with BMO
      </button>
      {photoSetting === 'comment' && (
        <p className="mt-2 text-xs opacity-70 text-center">BMO looks at its photos but doesn't keep them (change this in Settings).</p>
      )}

      <div className="flex gap-2 mt-5 mb-3" role="tablist">
        {([['snapshot', "BMO's photos"], ['memory', 'Our memories'], ['look', 'Our looks']] as const).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={tab === kind}
            onClick={() => setTab(kind)}
            className={`flex-1 rounded-full py-2 text-sm font-semibold border-2 ${tab === kind ? 'bg-white border-[#e43d3d]' : 'border-transparent bg-white/50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'memory' && (
        <div className="mb-4 rounded-2xl bg-white p-3 border">
          {picked ? (
            <>
              <img src={picked.preview} alt="Memory to add" className="w-full max-h-48 object-contain rounded-lg" />
              <input
                type="text"
                value={caption}
                maxLength={MAX_CAPTION}
                onChange={e => setCaption(e.target.value)}
                placeholder="What's this memory? (optional)"
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={addMemory} className="flex-1 rounded-full py-2 text-sm font-bold text-white bg-[#43b649]">
                  Show BMO
                </button>
                <button type="button" onClick={() => setPicked(null)} className="rounded-full px-3 py-2 text-sm">Cancel</button>
              </div>
            </>
          ) : (
            <label className={`block text-center rounded-xl border-2 border-dashed py-3 text-sm font-semibold cursor-pointer ${working ? 'opacity-60' : ''}`}>
              {working ? 'BMO is getting it ready…' : '＋ Add a memory from your phone'}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={working}
                onChange={e => pickFile(e.target.files?.[0])}
              />
            </label>
          )}
          {error && <p className="mt-2 text-sm text-[#c62828]">{error}</p>}
        </div>
      )}

      {photos === null ? (
        <p className="text-sm opacity-70 text-center py-4">Opening the album…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm opacity-70 text-center py-4">
          {tab === 'memory' ? 'No memories yet. Add a favourite photo and BMO will keep it safe!'
            : tab === 'look' ? 'No looks yet. Say "BMO, fashion show!" and strike a pose!'
            : 'No photos yet. Say "BMO, take a picture!" or press the blue dot.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 items-start">
          {shown.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setOpen(photo)}
              className="bg-white p-1.5 pb-2 rounded shadow text-left"
              style={{ transform: `rotate(${i % 2 ? 1.5 : -1.5}deg)` }}
            >
              <img src={urls.get(photo.id)} alt={photo.caption || photo.comment || 'Photo'} className="w-full aspect-square object-cover rounded-sm" loading="lazy" />
              <span className="block mt-1 text-xs leading-tight line-clamp-2">{photo.caption || photo.comment || ' '}</span>
              <span className="block text-[10px] opacity-60">{formatDate(photo.createdAt)}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
};
