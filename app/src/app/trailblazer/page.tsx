import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import DashboardShell from '@/components/DashboardShell';

export default async function TrailblazerDashboard() {
  const session = await getSession();
  if (!session) redirect('/');

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="section-badge inline-block">
          Trailblazer Portal
        </div>

        <div className="space-y-4">
          <p className="text-[var(--surface-dark)]/70">
            Your characters and campaigns will appear here.
          </p>

          <div className="highlight-bar">
            No characters yet. Join a campaign to begin your journey.
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
