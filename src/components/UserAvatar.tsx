import { useEffect, useState } from 'react';
import { User } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';

const signedUrlCache = new Map<string, { expiresAt: number; promise: Promise<string | null> }>();

interface UserAvatarProps {
  userId: string;
  path?: string | null;
  size: number;
  revision?: number;
  className?: string;
}

export default function UserAvatar({ userId, path, size, revision = 0, className = '' }: UserAvatarProps) {
  const key = `${userId}:${path ?? ''}:${revision}`;
  const [resolved, setResolved] = useState<{ key: string; url: string | null } | null>(null);
  const validPath = path === `${userId}/profile.webp` || path === `${userId}/profile.jpg`;

  useEffect(() => {
    if (!validPath || !path) return;
    let current = true;
    let cached = signedUrlCache.get(key);
    if (!cached || cached.expiresAt < Date.now()) {
      const promise = supabase.storage.from('avatars').createSignedUrl(path, 3600)
        .then(({ data, error }) => error || !data ? null : `${data.signedUrl}&v=${revision}`);
      cached = { expiresAt: Date.now() + 50 * 60 * 1000, promise };
      signedUrlCache.set(key, cached);
    }
    void cached.promise.then(url => {
      if (current) setResolved({ key, url });
      if (!url) signedUrlCache.delete(key);
    });
    return () => { current = false; };
  }, [key, path, revision, validPath]);

  const url = validPath && resolved?.key === key ? resolved.url : null;
  return (
    <span
      className={`inline-flex flex-none items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-gray-400 ${className}`}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="Foto de perfil" className="h-full w-full object-cover" onError={() => {
          signedUrlCache.delete(key);
          setResolved({ key, url: null });
        }} />
      ) : (
        <User size={Math.round(size * 0.48)} weight="regular" aria-label="Sin foto de perfil" />
      )}
    </span>
  );
}
