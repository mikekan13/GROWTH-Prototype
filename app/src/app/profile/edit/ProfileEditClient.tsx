'use client';

import ProfileEditForm from '@/components/profile/ProfileEditForm';
import WatcherProfileForm from '@/components/profile/WatcherProfileForm';

interface ProfileEditClientProps {
  initialProfile: Record<string, unknown> | null;
  initialWatcherProfile: Record<string, unknown> | null;
  isWatcher: boolean;
}

export default function ProfileEditClient({ initialProfile, initialWatcherProfile, isWatcher }: ProfileEditClientProps) {
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
    <div className="space-y-8">
      <ProfileEditForm initial={initialProfile as never} onSave={saveProfile} />
      {isWatcher && (
        <div className="border-t border-[var(--accent-gold)]/20 pt-6">
          <WatcherProfileForm initial={initialWatcherProfile as never} onSave={saveWatcherProfile} />
        </div>
      )}
    </div>
  );
}
