import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import DashboardShell from '@/components/DashboardShell';

export default async function TerminalDashboard() {
  const session = await getSession();
  if (!session) redirect('/');
  if (session.user.role !== 'GODHEAD' && session.user.role !== 'ADMIN') {
    redirect('/trailblazer');
  }

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="section-badge inline-block">
          Terminal Admin
        </div>

        <div className="space-y-4">
          <div className="terminal-badge inline-block">
            tHE TERmInAl sEEs aLL
          </div>

          <div className="highlight-bar">
            System overview and godhead controls will appear here.
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
