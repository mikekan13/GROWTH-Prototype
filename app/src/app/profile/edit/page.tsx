import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import DashboardShell from '@/components/DashboardShell';
import ProfileEditClient from './ProfileEditClient';

export default async function ProfileEditPage() {
  const session = await getSession();
  if (!session) redirect('/');

  // Fetch profile server-side for initial data
  const profile = session.user.profile ? JSON.parse(session.user.profile) : null;
  const watcherProfile = session.user.watcherProfile ? JSON.parse(session.user.watcherProfile) : null;

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-[family-name:var(--font-header)] text-3xl tracking-wider text-[var(--surface-dark)]">
            Edit Profile
          </h1>
          <p className="text-xs text-[var(--surface-dark)]/40 font-[family-name:var(--font-terminal)] mt-1">
            Your profile is shared when you apply to campaigns
          </p>
        </div>

        <ProfileEditClient
          initialProfile={profile}
          initialWatcherProfile={watcherProfile}
          isWatcher={session.user.role === 'WATCHER' || session.user.role === 'ADMIN' || session.user.role === 'GODHEAD'}
        />
      </div>
    </DashboardShell>
  );
}
