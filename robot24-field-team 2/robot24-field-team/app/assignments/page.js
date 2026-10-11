'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page moved. Old links and bookmarks still work.
const MAP = { '': '/jobs', jobs: '/jobs?tab=jobs', calendar: '/jobs?tab=calendar', travel: '/jobs?tab=travel' };

export default function Moved() {
  const router = useRouter();
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab') || '';
    router.replace(MAP[tab] || MAP['']);
  }, [router]);
  return null;
}
