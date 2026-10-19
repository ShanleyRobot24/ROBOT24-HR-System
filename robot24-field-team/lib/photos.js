'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// Shrinks a photo to a small square JPEG before upload, so pages stay fast.
export function resizePhoto(file, size = 480) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      canvas.toBlob((b) => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('Could not read the photo')); }, 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a photo this browser can read. Try a JPG or PNG.')); };
    img.src = url;
  });
}

// Turns a list of storage paths into viewable links, in one request.
export function usePhotoUrls(paths) {
  const [urls, setUrls] = useState({});
  const key = [...new Set(paths.filter(Boolean))].sort().join('|');
  useEffect(() => {
    const list = key ? key.split('|') : [];
    if (!list.length) { setUrls({}); return; }
    let live = true;
    supabase.storage.from('photos').createSignedUrls(list, 3600).then(({ data }) => {
      if (!live || !data) return;
      setUrls(Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl])));
    });
    return () => { live = false; };
  }, [key]);
  return urls;
}
