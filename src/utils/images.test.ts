import { describe, expect, it } from 'vitest';
import { fitWithin } from './images';
import { MAX_PHOTOS, trimToLimit } from './photoAlbum';
import { detectPhrase } from './easterEggs';

describe('fitWithin', () => {
  it('shrinks a big landscape phone photo to the longest side', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('shrinks a portrait photo by its height', () => {
    expect(fitWithin(3024, 4032, 768)).toEqual({ width: 576, height: 768 });
  });

  it('never enlarges a small picture', () => {
    expect(fitWithin(640, 480, 1600)).toEqual({ width: 640, height: 480 });
  });

  it('never returns a zero size', () => {
    expect(fitWithin(10000, 1, 768).height).toBe(1);
  });
});

describe('trimToLimit', () => {
  const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, createdAt: 1000 + i }));

  it('removes the oldest photos beyond the limit', () => {
    expect(trimToLimit(photos(MAX_PHOTOS + 2))).toEqual(['p0', 'p1']);
  });

  it('removes nothing when the album has room', () => {
    expect(trimToLimit(photos(5))).toEqual([]);
  });
});

describe('camera phrases', () => {
  it.each(['BMO take a picture!', 'can you take a photo', 'BMO is camera!', "let's take a selfie"])('"%s" opens the camera', text => {
    expect(detectPhrase(text)).toBe('camera');
  });

  it('does not open the camera for ordinary talk about pictures', () => {
    expect(detectPhrase('I like drawing pictures')).toBeNull();
  });
});
