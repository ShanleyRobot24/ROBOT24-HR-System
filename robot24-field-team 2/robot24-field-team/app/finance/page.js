'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page moved. Old links and bookmarks still work.
const MAP = { '': '/money', upload: '/money?tab=inbox', month: '/money?tab=bills', missing: '/money?tab=missing', direct: '/jobs?tab=travel', team: '/people?tab=records' };

export default function Moved() {
  const router = useRouter();
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab') || '';
    router.replace(MAP[tab] || MAP['']);
  }, [router]);
  return null;
}
