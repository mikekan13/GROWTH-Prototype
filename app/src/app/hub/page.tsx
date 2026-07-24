import { getSession } from '@/lib/auth';
import DashboardShell from '@/components/DashboardShell';
import HubLogo from './HubLogo';
import HubClient from './HubClient';
import Link from 'next/link';

export default async function HubPage() {
  const session = await getSession();

  const content = (
    <div className="max-w-4xl mx-auto h-full relative flex flex-col overflow-hidden">
      {/* Logo — in flow, takes its natural height */}
      <div className="shrink-0 relative z-20">
        <HubLogo />
      </div>

      {/* Cards feed — fills remaining height below logo */}
      <div className="flex-1 min-h-0 flex flex-col">
        <HubClient />
      </div>

      {/* Sign-up CTA for unauthenticated users */}
      {!session && (
        <div className="shrink-0 bg-[var(--surface-dark)] border border-[var(--accent-teal)]/20 mt-4">
          <div className="relative">
            <div className="h-[2px] bg-[var(--accent-teal)]/30" />
            <div className="bg-[var(--pillar-spirit)] py-3 px-6 relative overflow-visible">
              <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-[var(--krma-gold)]/40" />
              <div className="relative z-10 text-center space-y-2">
                <p className="text-white/70 text-sm font-[family-name:var(--font-terminal)] tracking-wider">
                  The Terminal awaits your connection.
                </p>
                <Link
                  href="/"
                  className="inline-block px-6 py-1.5 bg-[var(--accent-teal)] text-black text-xs font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase hover:bg-[var(--accent-teal)]/80 transition-colors"
                >
                  [ Interface ]
                </Link>
              </div>
            </div>
            <div className="h-[2px] bg-[var(--accent-teal)]/30" />
          </div>
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
    <div className="h-screen bg-black relative overflow-hidden flex flex-col">
      {/* Blocky colored accents */}
      <div className="absolute top-0 z-0" style={{ left: 'calc(50% - 34rem)', width: '120px', height: '80px', background: 'rgba(247,82,95,0.10)' }} />
      <div className="absolute top-0 z-0" style={{ left: 'calc(50% - 34rem)', width: '120px', height: '18px', background: 'rgba(247,82,95,0.20)' }} />
      <div className="absolute top-[80px] z-0" style={{ left: 'calc(50% - 33rem)', width: '60px', height: '200px', background: 'rgba(88,42,114,0.08)' }} />
      <div className="absolute top-[40%] z-0" style={{ left: 'calc(50% - 35rem)', width: '140px', height: '220px', background: 'rgba(34,171,148,0.08)' }} />
      <div className="absolute top-[40%] z-0" style={{ left: 'calc(50% - 35rem)', width: '140px', height: '18px', background: 'rgba(34,171,148,0.15)' }} />
      <div className="absolute bottom-0 z-0" style={{ left: 'calc(50% - 36rem)', width: '200px', height: '80px', background: 'rgba(88,42,114,0.08)' }} />
      <div className="absolute bottom-0 z-0" style={{ left: 'calc(50% - 36rem)', width: '200px', height: '18px', background: 'rgba(88,42,114,0.15)' }} />
      <div className="absolute top-0 z-0" style={{ left: 'calc(50% + 30rem)', width: '160px', height: '100px', background: 'rgba(0,47,108,0.15)' }} />
      <div className="absolute top-[100px] z-0" style={{ left: 'calc(50% + 32rem)', width: '80px', height: '200px', background: 'rgba(0,47,108,0.10)' }} />
      <div className="absolute top-[35%] z-0" style={{ left: 'calc(50% + 30rem)', width: '160px', height: '250px', background: 'rgba(88,42,114,0.10)' }} />
      <div className="absolute top-[35%] z-0" style={{ left: 'calc(50% + 30rem)', width: '160px', height: '18px', background: 'rgba(34,171,148,0.15)' }} />
      <div className="absolute bottom-0 z-0" style={{ left: 'calc(50% + 30rem)', width: '200px', height: '90px', background: 'rgba(247,82,95,0.08)' }} />
      <div className="absolute bottom-0 z-0" style={{ left: 'calc(50% + 30rem)', width: '200px', height: '18px', background: 'rgba(255,204,120,0.10)' }} />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col p-8">
        {content}
      </div>
    </div>
  );
}
