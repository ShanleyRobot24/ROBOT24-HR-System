'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

// The open tab lives in the address (?tab=month), so tabs can be linked to, bookmarked and opened by Robbie
export function useTab(valid, fallback) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const t = sp.get('tab');
  const tab = valid.includes(t) ? t : fallback;
  const setTab = (next) => router.replace(`${path}?tab=${next}`, { scroll: false });
  return [tab, setTab];
}
