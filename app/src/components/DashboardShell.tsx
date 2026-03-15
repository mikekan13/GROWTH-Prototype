'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import GrowthLogo from './GrowthLogo';
import GlitchText from './GlitchText';
import EyetehrnetLogo from './EyetehrnetLogo';

interface DashboardShellProps {
  username: string;
  role: string;
  children: React.ReactNode;
}

export default function DashboardShell({ username, role, children }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();

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

  // Role-specific dashboard path
  const dashboardPath = {
    TRAILBLAZER: '/trailblazer',
    WATCHER: '/watcher',
    GODHEAD: '/terminal',
    ADMIN: '/terminal',
  }[role] || '/trailblazer';

  const dashboardLabel = {
    TRAILBLAZER: 'Portal',
    WATCHER: 'Console',
    GODHEAD: 'Terminal',
    ADMIN: 'Terminal',
  }[role] || 'Dashboard';

  // Build nav items based on role
  const navItems: { href: string; label: React.ReactNode; key: string }[] = [
    { href: '/hub', label: <EyetehrnetLogo scale={0.55} />, key: 'hub' },
    { href: dashboardPath, label: dashboardLabel, key: 'dashboard' },
    { href: '/profile/edit', label: 'Profile', key: 'profile' },
  ];

  function isActive(href: string) {
    if (href === '/hub') return pathname === '/hub' || pathname.startsWith('/hub/');
    if (href === '/profile/edit') return pathname.startsWith('/profile');
    return pathname.startsWith(href);
  }

  return (
    <div className="h-screen bg-black relative overflow-x-clip flex flex-col">
      {/* Blocky colored accents — positioned relative to content column via calc */}
      {/* Left gutter blocks — anchored to left edge of content (50% - 28rem) */}
      <div className="fixed top-[80px] z-0" style={{ left: 'calc(50% - 34rem)', width: '120px', height: '80px', background: 'rgba(247,82,95,0.10)' }} />
      <div className="fixed top-[80px] z-0" style={{ left: 'calc(50% - 34rem)', width: '120px', height: '18px', background: 'rgba(247,82,95,0.20)' }} />
      <div className="fixed top-[160px] z-0" style={{ left: 'calc(50% - 33rem)', width: '60px', height: '200px', background: 'rgba(88,42,114,0.08)' }} />
      <div className="fixed top-[40%] z-0" style={{ left: 'calc(50% - 35rem)', width: '140px', height: '220px', background: 'rgba(34,171,148,0.08)' }} />
      <div className="fixed top-[40%] z-0" style={{ left: 'calc(50% - 35rem)', width: '140px', height: '18px', background: 'rgba(34,171,148,0.15)' }} />
      <div className="fixed top-[60%] z-0" style={{ left: 'calc(50% - 34rem)', width: '80px', height: '120px', background: 'rgba(0,47,108,0.10)' }} />
      <div className="fixed bottom-[100px] z-0" style={{ left: 'calc(50% - 36rem)', width: '200px', height: '80px', background: 'rgba(88,42,114,0.08)' }} />
      <div className="fixed bottom-[100px] z-0" style={{ left: 'calc(50% - 36rem)', width: '200px', height: '18px', background: 'rgba(88,42,114,0.15)' }} />
      <div className="fixed bottom-[180px] z-0" style={{ left: 'calc(50% - 34rem)', width: '60px', height: '100px', background: 'rgba(247,82,95,0.08)' }} />
      <div className="fixed top-[25%] z-0" style={{ left: 'calc(50% - 32rem)', width: '24px', height: '24px', background: 'rgba(255,204,120,0.10)' }} />

      {/* Right gutter blocks — anchored to right edge of content (50% + 28rem) */}
      <div className="fixed top-[80px] z-0" style={{ left: 'calc(50% + 30rem)', width: '160px', height: '100px', background: 'rgba(0,47,108,0.15)' }} />
      <div className="fixed top-[180px] z-0" style={{ left: 'calc(50% + 32rem)', width: '80px', height: '200px', background: 'rgba(0,47,108,0.10)' }} />
      <div className="fixed top-[80px] z-0" style={{ left: 'calc(50% + 30rem)', width: '60px', height: '18px', background: 'rgba(34,171,148,0.12)' }} />
      <div className="fixed top-[35%] z-0" style={{ left: 'calc(50% + 30rem)', width: '160px', height: '250px', background: 'rgba(88,42,114,0.10)' }} />
      <div className="fixed top-[35%] z-0" style={{ left: 'calc(50% + 30rem)', width: '160px', height: '18px', background: 'rgba(34,171,148,0.15)' }} />
      <div className="fixed top-[55%] z-0" style={{ left: 'calc(50% + 32rem)', width: '80px', height: '150px', background: 'rgba(88,42,114,0.08)' }} />
      <div className="fixed top-[55%] z-0" style={{ left: 'calc(50% + 30rem)', width: '100px', height: '18px', background: 'rgba(34,171,148,0.10)' }} />
      <div className="fixed bottom-[100px] z-0" style={{ left: 'calc(50% + 30rem)', width: '200px', height: '90px', background: 'rgba(247,82,95,0.08)' }} />
      <div className="fixed bottom-[100px] z-0" style={{ left: 'calc(50% + 30rem)', width: '200px', height: '18px', background: 'rgba(255,204,120,0.10)' }} />
      <div className="fixed bottom-[118px] z-0" style={{ left: 'calc(50% + 30rem)', width: '200px', height: '18px', background: 'rgba(88,42,114,0.12)' }} />
      <div className="fixed bottom-[190px] z-0" style={{ left: 'calc(50% + 33rem)', width: '60px', height: '100px', background: 'rgba(0,47,108,0.08)' }} />
      <div className="fixed top-[75%] z-0" style={{ left: 'calc(50% + 31rem)', width: '40px', height: '40px', background: 'rgba(247,82,95,0.06)' }} />

      {/* Header — terminal window title bar aesthetic */}
      <header className="sticky top-0 z-50 bg-[var(--surface-dark)] border-b-2 border-[var(--accent-teal)]/40">
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
          {/* Left: Logo + role */}
          <div className="flex items-center gap-5">
            <Link href="/hub" className="bg-[#222] p-[2px] hover:opacity-80 transition-opacity">
              <GrowthLogo scale={0.22} />
            </Link>
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

          {/* Center: Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map(item => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`text-[9px] tracking-[0.2em] uppercase font-[family-name:var(--font-terminal)] transition-colors px-3 py-1.5 border ${
                    active
                      ? 'bg-[var(--accent-teal)]/15 text-[var(--accent-teal)] border-[var(--accent-teal)]/50'
                      : 'text-[var(--accent-teal)]/40 hover:text-[var(--accent-teal)] border-[var(--accent-teal)]/10 hover:border-[var(--accent-teal)]/30'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: User + logout */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <Link href={`/profile/${username}`} className="text-[var(--accent-teal)]/70 hover:text-[var(--accent-teal)] text-[10px] font-[family-name:var(--font-terminal)] tracking-wider block transition-colors">
                {username}
              </Link>
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

      {/* Content area — fills remaining height, children handle their own scrolling */}
      <main className="flex-1 min-h-0 overflow-hidden px-8">
        {children}
      </main>

      {/* Footer bar */}
      <footer className="shrink-0 bg-[var(--surface-dark)]/90 border-t border-[var(--accent-teal)]/20 px-6 py-1 flex justify-between items-center">
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
