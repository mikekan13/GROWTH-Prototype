'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import ProfileEditForm from '@/components/profile/ProfileEditForm';
import WatcherProfileForm from '@/components/profile/WatcherProfileForm';

interface ProfileEditClientProps {
  username: string;
  initialProfile: Record<string, unknown> | null;
  initialWatcherProfile: Record<string, unknown> | null;
  isWatcher: boolean;
}

export default function ProfileEditClient({ username, initialProfile, initialWatcherProfile, isWatcher }: ProfileEditClientProps) {
  const [activeTab, setActiveTab] = useState<'player' | 'watcher'>('player');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    (initialProfile?.avatarUrl as string) || null
  );
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Upload failed');
        return;
      }
      const data = await res.json();
      setAvatarUrl(data.avatarUrl);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function saveProfile(profile: any) {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save profile');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function saveWatcherProfile(watcherProfile: any) {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watcherProfile }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save watcher profile');
    }
  }

  return (
    <div className="space-y-5">
      {/* Profile header with avatar */}
      <div className="flex items-center gap-5">
        <div className="relative group">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="relative w-20 h-20 rounded-full overflow-hidden cursor-pointer group-hover:ring-2 group-hover:ring-[var(--accent-teal)]/50 transition-all"
            style={{ background: 'linear-gradient(135deg, var(--accent-teal), var(--pillar-soul))' }}
          >
            {avatarUrl ? (
              <Image src={avatarUrl} alt="Avatar" fill className="object-cover" />
            ) : (
              <span className="flex items-center justify-center w-full h-full text-3xl font-bold font-[family-name:var(--font-header)] text-white">
                {username.charAt(0).toUpperCase()}
              </span>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-[10px] font-[family-name:var(--font-terminal)] uppercase tracking-wider">
                {uploading ? 'Uploading...' : 'Change'}
              </span>
            </div>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleAvatarUpload}
            className="hidden"
          />
        </div>
        <div>
          <h1 className="font-[family-name:var(--font-header)] text-2xl tracking-wider text-white">
            {username}
          </h1>
          <p className="text-sm text-white/40 font-[family-name:var(--font-terminal)]">
            Edit your profile — shared when you apply to campaigns
          </p>
        </div>
      </div>

      {/* Tab bar (only if watcher) */}
      {isWatcher && (
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => setActiveTab('player')}
            className={`flex-1 py-2 text-sm font-[family-name:var(--font-terminal)] tracking-wider rounded-md transition-all ${
              activeTab === 'player'
                ? 'bg-[var(--accent-teal)] text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Trailblazer Profile
          </button>
          <button
            onClick={() => setActiveTab('watcher')}
            className={`flex-1 py-2 text-sm font-[family-name:var(--font-terminal)] tracking-wider rounded-md transition-all ${
              activeTab === 'watcher'
                ? 'bg-[var(--accent-gold)] text-black'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Watcher Profile
          </button>
        </div>
      )}

      {activeTab === 'player' && (
        <ProfileEditForm initial={initialProfile as never} onSave={saveProfile} />
      )}
      {activeTab === 'watcher' && isWatcher && (
        <WatcherProfileForm initial={initialWatcherProfile as never} onSave={saveWatcherProfile} />
      )}
    </div>
  );
}
