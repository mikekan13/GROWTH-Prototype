import { getSession } from '@/lib/auth';
import DashboardShell from '@/components/DashboardShell';
import HubClient from './HubClient';
import Link from 'next/link';

export default async function HubPage() {
  const session = await getSession();

  const content = (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-header)] text-3xl tracking-wider text-[var(--surface-dark)]">
          {'EŶ∃tehrNET'}
        </h1>
        <p className="text-xs text-[var(--surface-dark)]/40 font-[family-name:var(--font-terminal)] mt-1">
          Discover campaigns and find your table
        </p>
      </div>

      <HubClient />

      {!session && (
        <div className="p-4 bg-[var(--accent-teal)]/5 border border-[var(--accent-teal)]/20 text-center space-y-2">
          <p className="text-sm text-[var(--surface-dark)]/60">
            Create a free account to apply to campaigns
          </p>
          <Link href="/" className="inline-block px-4 py-1.5 bg-[var(--accent-teal)] text-white text-sm font-[family-name:var(--font-terminal)] tracking-wider uppercase hover:bg-[var(--accent-teal)]/80 transition-colors">
            Sign Up
          </Link>
        </div>
      )}
    </div>
  );

  if (session) {
    return (
      <DashboardShell username={session.user.username} role={session.user.role}>
        {content}
      </DashboardShell>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-calm)] p-8">
      {content}
    </div>
  );
}
