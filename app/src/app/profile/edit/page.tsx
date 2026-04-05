import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import DashboardShell from '@/components/DashboardShell';
import ProfileEditClient from './ProfileEditClient';

export default async function ProfileEditPage() {
  const session = await getSession();
  if (!session) redirect('/');

  const profile = session.user.profile ? JSON.parse(session.user.profile) : null;
  const watcherProfile = session.user.watcherProfile ? JSON.parse(session.user.watcherProfile) : null;

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <ProfileEditClient
          username={session.user.username}
          initialProfile={profile}
          initialWatcherProfile={watcherProfile}
          isWatcher={session.user.role === 'WATCHER' || session.user.role === 'ADMIN' || session.user.role === 'GODHEAD'}
        />
      </div>
    </DashboardShell>
  );
}
