import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import DashboardShell from '@/components/DashboardShell';

export default async function WatcherDashboard() {
  const session = await getSession();
  if (!session) redirect('/');

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="section-badge inline-block">
          Watcher Console
        </div>

        <div className="space-y-4">
          <p className="text-[var(--surface-dark)]/70">
            Your campaigns and the Relations Canvas will live here.
          </p>

          <div className="highlight-bar">
            No campaigns yet. Create one to begin watching.
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
