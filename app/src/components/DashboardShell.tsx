'use client';

import { useRouter } from 'next/navigation';
import GrowthLogo from './GrowthLogo';
import GlitchText from './GlitchText';

interface DashboardShellProps {
  username: string;
  role: string;
  children: React.ReactNode;
}

export default function DashboardShell({ username, role, children }: DashboardShellProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  const roleLabel = {
    TRAILBLAZER: 'Trailblazer Portal',
    WATCHER: 'Watcher Console',
    GODHEAD: 'Terminal Admin',
    ADMIN: 'Terminal Admin',
  }[role] || 'Dashboard';

  const roleColor = {
    TRAILBLAZER: 'var(--pillar-spirit)',
    WATCHER: 'var(--accent-gold)',
    GODHEAD: 'var(--accent-teal)',
    ADMIN: 'var(--accent-teal)',
  }[role] || 'var(--accent-teal)';

  return (
    <div className="min-h-screen bg-[var(--surface-calm)]">
      {/* Header — terminal window title bar aesthetic */}
      <header className="bg-[var(--surface-dark)] border-b-2 border-[var(--accent-teal)]/40">
        {/* Top micro-bar — window controls echo */}
        <div className="flex items-center justify-between px-3 py-0.5 bg-black/20 border-b border-[var(--accent-teal)]/20">
          <div className="flex items-center gap-1.5">
            <div className="w-[6px] h-[6px] bg-[var(--pillar-body)]" />
            <div className="w-[6px] h-[6px] bg-[var(--pillar-soul)]" />
            <div className="w-[6px] h-[6px] bg-[#002F6C]" />
          </div>
          <span className="text-[var(--accent-teal)]/40 text-[8px] tracking-[0.3em] font-[family-name:var(--font-terminal)]">
            TERMINAL://reality.layer.0
          </span>
          <span className="text-[var(--accent-teal)]/30 text-[8px]">&#x2298; &#x2295;</span>
        </div>

        {/* Main header content */}
        <div className="px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="bg-[#222] p-[2px]">
              <GrowthLogo scale={0.22} />
            </div>
            <div className="flex flex-col gap-0">
              <span
                className="text-[10px] uppercase tracking-[0.25em] font-[family-name:var(--font-terminal)]"
                style={{ color: roleColor }}
              >
                {roleLabel}
              </span>
              <span className="text-white/20 text-[8px] font-[family-name:var(--font-terminal)] tracking-wider">
                <GlitchText text="[PATTERN RECOGNITION: Active]" className="text-white/20" />
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[var(--accent-teal)]/70 text-[10px] font-[family-name:var(--font-terminal)] tracking-wider block">
                {username}
              </span>
              <span className="text-white/20 text-[8px] font-[family-name:var(--font-terminal)]">
                CONSCIOUSNESS: INTERFACED
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-[var(--pillar-body)]/40 hover:text-[var(--pillar-body)] text-[9px] tracking-[0.2em] uppercase font-[family-name:var(--font-terminal)] transition-colors px-2 py-1 border border-[var(--pillar-body)]/20 hover:border-[var(--pillar-body)]/50"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Bottom accent line */}
        <div className="h-[1px] bg-[var(--accent-teal)]/30" />
      </header>

      {/* Content area — powder blue calm surface */}
      <main className="p-8">
        {children}
      </main>

      {/* Footer bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[var(--surface-dark)]/90 border-t border-[var(--accent-teal)]/20 px-6 py-1 flex justify-between items-center backdrop-blur-sm">
        <span className="text-[var(--accent-teal)]/30 text-[8px] font-[family-name:var(--font-terminal)] tracking-wider">
          <GlitchText text="<STREAM STABILIZING>" className="text-[var(--accent-teal)]/30" />
        </span>
        <span className="text-white/15 text-[8px] font-[family-name:var(--font-terminal)] tracking-[0.2em]">
          {'='.repeat(20)}
        </span>
        <span className="text-[var(--accent-teal)]/20 text-[8px] font-[family-name:var(--font-terminal)]">
          REALITY LEVEL: Primary Translation
        </span>
      </footer>
    </div>
  );
}
