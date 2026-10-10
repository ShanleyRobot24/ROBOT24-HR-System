'use client';
import { useEffect, useState } from 'react';

const TONES = ['#1a2e6c', '#2f56b0', '#4a74c9', '#5f86d4', '#24409a', '#3a5fae', '#16306f', '#456bbf'];

export default function Avatar({ name = '', url, size = 40 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const tone = TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (url && !broken) return <img className="avatar" src={url} alt="" style={style} onError={() => setBroken(true)} />;
  return <span className="avatar initials" style={{ ...style, background: tone }} aria-hidden>{initials}</span>;
}
