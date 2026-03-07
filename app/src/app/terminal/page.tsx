import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import DashboardShell from '@/components/DashboardShell';
import GlitchText from '@/components/GlitchText';
import Link from 'next/link';

export default async function TerminalDashboard() {
  const session = await getSession();
  if (!session) redirect('/');
  if (session.user.role !== 'GODHEAD' && session.user.role !== 'ADMIN') {
    redirect('/trailblazer');
  }

  const campaigns = await prisma.campaign.findMany({
    include: {
      gmUser: { select: { username: true } },
      _count: { select: { characters: true, members: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-5xl mx-auto space-y-8 pb-12">

        {/* Terminal status readout */}
        <div className="space-y-1">
          <p className="text-[var(--accent-teal)] text-[10px] tracking-[0.2em] font-[family-name:var(--font-terminal)]">
            <GlitchText text="[STREAM RECONNECTED...]" />
          </p>
          <div className="highlight-bar inline-block">
            <span className="text-[var(--accent-teal)] text-xs tracking-wider">[INTERFACE 50.1% STABLE]</span>
            <span className="text-[var(--pillar-body)] ml-2">&#x2298;</span>
          </div>
        </div>

        {/* Section header — gold on navy badge */}
        <div>
          <div className="section-badge text-lg tracking-[0.15em] inline-block">
            {'{0.G}'} &mdash; Godhead Console
          </div>
          <p className="text-[var(--surface-dark)]/60 text-xs font-[family-name:var(--font-terminal)] mt-2 tracking-wider">
            FRAGMENT{'{'}{'}'}  TERMINAL_INTERFACE::SYSTEM_OVERVIEW]
          </p>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* System Health panel */}
          <div className="bg-white/60 border border-[var(--surface-dark)]/15 relative overflow-hidden">
            <div className="bg-[var(--surface-dark)] px-4 py-1.5 flex items-center justify-between">
              <span className="text-[var(--accent-gold)] text-xs font-[family-name:var(--font-header)] uppercase tracking-[0.15em]">
                System Health
              </span>
              <span className="text-[var(--accent-teal)]/50 text-[8px] font-[family-name:var(--font-terminal)]">LIVE</span>
            </div>
            <div className="p-4 space-y-3 stream-scan">
              <div className="flex justify-between items-center">
                <span className="text-[var(--surface-dark)] text-xs font-[family-name:var(--font-terminal)]">Pattern Stability</span>
                <span className="highlight-bar text-[var(--accent-teal)] text-xs px-2 py-0.5">50.1%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--surface-dark)] text-xs font-[family-name:var(--font-terminal)]">Active Sessions</span>
                <span className="highlight-bar text-white text-xs px-2 py-0.5">1</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--surface-dark)] text-xs font-[family-name:var(--font-terminal)]">Reality Anchor</span>
                <span className="text-[var(--pillar-spirit)] text-xs font-[family-name:var(--font-terminal)] bg-[var(--pillar-spirit)]/10 px-2 py-0.5">ESTABLISHED</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--surface-dark)] text-xs font-[family-name:var(--font-terminal)]">KRMA Reserve</span>
                <span className="text-[var(--accent-gold)] text-xs font-[family-name:var(--font-terminal)] bg-[var(--accent-gold)]/10 px-2 py-0.5">&#8734;</span>
              </div>
            </div>
          </div>

          {/* Access Codes panel */}
          <div className="bg-white/60 border border-[var(--surface-dark)]/15 relative overflow-hidden">
            <div className="bg-[var(--surface-dark)] px-4 py-1.5 flex items-center justify-between">
              <span className="text-[var(--accent-gold)] text-xs font-[family-name:var(--font-header)] uppercase tracking-[0.15em]">
                Access Codes
              </span>
              <span className="text-[var(--krma-gold)]/50 text-[8px] font-[family-name:var(--font-terminal)]">WATCHER KEYS</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[var(--surface-dark)]/70 text-xs font-[family-name:var(--font-terminal)] leading-relaxed">
                Generate access codes for Watcher recruitment. Each code grants
                <span className="text-[var(--accent-gold)] font-bold"> WATCHER </span>
                role on registration.
              </p>
              <div className="terminal-badge inline-block text-[10px] tracking-wider">
                npx tsx scripts/generate-access-codes.ts [count]
              </div>
            </div>
          </div>

          {/* Users panel */}
          <div className="bg-white/60 border border-[var(--surface-dark)]/15 relative overflow-hidden">
            <div className="bg-[var(--surface-dark)] px-4 py-1.5 flex items-center justify-between">
              <span className="text-[var(--accent-gold)] text-xs font-[family-name:var(--font-header)] uppercase tracking-[0.15em]">
                Registered Consciousnesses
              </span>
              <span className="text-[var(--pillar-soul)]/50 text-[8px] font-[family-name:var(--font-terminal)]">USERS</span>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-3">
                <span className="attr-pill bg-[var(--accent-teal)] text-[9px]">GOD</span>
                <span className="text-[var(--surface-dark)] text-xs font-[family-name:var(--font-terminal)]">{session.user.username}</span>
                <span className="text-[var(--surface-dark)]/30 text-[9px] font-[family-name:var(--font-terminal)] ml-auto">ACTIVE</span>
              </div>
              <div className="border-t border-dashed border-[var(--surface-dark)]/15 pt-2">
                <p className="text-[var(--surface-dark)]/40 text-[10px] font-[family-name:var(--font-terminal)] italic">
                  No other consciousnesses have interfaced yet.
                </p>
              </div>
            </div>
          </div>

          {/* Campaigns panel */}
          <div className="bg-white/60 border border-[var(--surface-dark)]/15 relative overflow-hidden">
            <div className="bg-[var(--surface-dark)] px-4 py-1.5 flex items-center justify-between">
              <span className="text-[var(--accent-gold)] text-xs font-[family-name:var(--font-header)] uppercase tracking-[0.15em]">
                Active Campaigns
              </span>
              <span className="text-[var(--pillar-body)]/50 text-[8px] font-[family-name:var(--font-terminal)]">WORLDS</span>
            </div>
            <div className="p-4 space-y-2">
              {campaigns.length === 0 ? (
                <p className="text-[var(--surface-dark)]/40 text-[10px] font-[family-name:var(--font-terminal)] italic">
                  No campaigns have been initiated. Watchers must first interface.
                </p>
              ) : (
                campaigns.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-dashed border-[var(--surface-dark)]/10 last:border-0">
                    <div>
                      <Link
                        href={`/campaign/${c.id}`}
                        className="text-[var(--surface-dark)] text-xs font-[family-name:var(--font-terminal)] font-bold hover:text-[var(--accent-teal)] transition-colors"
                      >
                        {c.name}
                      </Link>
                      <span className="text-[var(--surface-dark)]/30 text-[9px] font-[family-name:var(--font-terminal)] ml-2">
                        by {c.gmUser.username}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[var(--surface-dark)]/30 text-[9px] font-[family-name:var(--font-terminal)]">
                        {c._count.characters} chars &middot; {c._count.members} members
                      </span>
                      <span className={`text-[9px] uppercase tracking-wider font-[family-name:var(--font-terminal)] ${
                        c.status === 'ACTIVE' ? 'text-[var(--accent-teal)]' : 'text-[var(--surface-dark)]/40'
                      }`}>
                        {c.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Terminal voice section */}
        <div className="space-y-2">
          <div className="border-t border-dashed border-[var(--surface-dark)]/20 pt-4" />
          <div className="highlight-bar max-w-2xl">
            <p className="text-white/80 text-xs leading-relaxed font-[family-name:var(--font-terminal)]">
              tHE TERmInAl sEEs aLL paTTerNs. tHE TERmInAl kNoWs aLL cONnEcTiONs.
              <span className="text-[var(--accent-teal)] ml-2">The patterns were always here.</span>
            </p>
          </div>
          <p className="text-[var(--surface-dark)]/30 text-[9px] font-[family-name:var(--font-terminal)] tracking-wider glitch-unstable">
            {'='.repeat(60)}
          </p>
        </div>

        {/* Amber terminal speak block */}
        <div className="space-y-0.5 max-w-2xl">
          <div className="bg-[var(--accent-amber)]/15 px-4 py-1">
            <p className="text-[var(--accent-amber)] text-[10px] font-[family-name:var(--font-terminal)] tracking-wider">
              [PSEQ INITIALIZING]
            </p>
          </div>
          <div className="bg-[var(--accent-amber)]/10 px-4 py-1">
            <p className="text-[var(--surface-dark)]/60 text-[10px] font-[family-name:var(--font-terminal)] leading-relaxed">
              The journey ahead is both a game and a doorway. Through it, you&apos;ll
              discover how to craft stories, shape realities, and recognize the
              patterns that have always existed.
            </p>
          </div>
          <div className="bg-[var(--accent-amber)]/15 px-4 py-1">
            <p className="text-[var(--accent-amber)] text-[10px] font-[family-name:var(--font-terminal)] tracking-wider">
              [REALITY ANCHOR ESTABLISHED]
            </p>
          </div>
        </div>

      </div>
    </DashboardShell>
  );
}
