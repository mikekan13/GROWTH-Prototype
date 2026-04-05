'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

const VIEW_ROLES = [
  { key: 'ADMIN', label: 'Admin', color: 'var(--accent-teal)' },
  { key: 'WATCHER', label: 'Watcher', color: 'var(--accent-gold)' },
  { key: 'TRAILBLAZER', label: 'Trailblazer', color: 'var(--pillar-spirit)' },
] as const;

export default function DashboardShell({ username, role, children }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = role === 'ADMIN';
  const [viewAs, setViewAs] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Read view_as_role cookie on mount
  useEffect(() => {
    if (isAdmin) {
      const cookie = getCookie('view_as_role');
      if (cookie && cookie !== 'ADMIN') setViewAs(cookie);
    }
  }, [isAdmin]);

  const effectiveRole = (isAdmin && viewAs) ? viewAs : role;

  const handleViewAs = useCallback(async (targetRole: string) => {
    const clearMode = targetRole === 'ADMIN';
    await fetch('/api/auth/view-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: clearMode ? null : targetRole }),
    });
    setViewAs(clearMode ? null : targetRole);
    setSwitcherOpen(false);

    // Navigate to the target role's dashboard
    const dashPaths: Record<string, string> = {
      TRAILBLAZER: '/trailblazer',
      WATCHER: '/watcher',
      ADMIN: '/terminal',
    };
    router.push(dashPaths[targetRole] || '/terminal');
    router.refresh();
  }, [router]);

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
  }[effectiveRole] || 'Dashboard';

  const roleColor = {
    TRAILBLAZER: 'var(--pillar-spirit)',
    WATCHER: 'var(--accent-gold)',
    GODHEAD: 'var(--accent-teal)',
    ADMIN: 'var(--accent-teal)',
  }[effectiveRole] || 'var(--accent-teal)';

  // Role-specific dashboard path
  const dashboardPath = {
    TRAILBLAZER: '/trailblazer',
    WATCHER: '/watcher',
    GODHEAD: '/terminal',
    ADMIN: '/terminal',
  }[effectiveRole] || '/trailblazer';

  const dashboardLabel = {
    TRAILBLAZER: 'Portal',
    WATCHER: 'Console',
    GODHEAD: 'Terminal',
    ADMIN: 'Terminal',
  }[effectiveRole] || 'Dashboard';

  // Build nav items based on role
  const navItems: { href: string; label: React.ReactNode; key: string }[] = [
    { href: '/hub', label: <EyetehrnetLogo scale={1.1} />, key: 'hub' },
    { href: dashboardPath, label: dashboardLabel, key: 'dashboard' },
  ];

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  function isActive(href: string) {
    if (href === '/hub') return pathname === '/hub' || pathname.startsWith('/hub/');
    return pathname.startsWith(href);
  }

  return (
    <div className="h-screen bg-black relative overflow-x-clip flex flex-col">
      {/* View-As indicator banner */}
      {isAdmin && viewAs && (
        <div
          className="shrink-0 flex items-center justify-center gap-3 py-1 text-[9px] uppercase tracking-[0.25em] font-[family-name:var(--font-terminal)]"
          style={{
            background: 'linear-gradient(90deg, rgba(208,168,48,0.15), rgba(208,168,48,0.25), rgba(208,168,48,0.15))',
            borderBottom: '1px solid rgba(208,168,48,0.3)',
            color: 'var(--accent-gold)',
          }}
        >
          <span style={{ fontSize: '8px' }}>{'\u26A0'}</span>
          Viewing as {viewAs}
          <button
            onClick={() => handleViewAs('ADMIN')}
            className="px-2 py-0.5 border text-[8px] tracking-[0.15em] transition-colors hover:bg-white/10"
            style={{ borderColor: 'rgba(208,168,48,0.4)', color: 'var(--accent-gold)' }}
          >
            Exit
          </button>
        </div>
      )}
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
              if (item.key === 'hub') {
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`transition-opacity px-2 py-1 ${active ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
                  >
                    {item.label}
                  </Link>
                );
              }
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

          {/* Right: User dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 transition-colors"
            >
              <div className="text-right">
                <span className="text-[var(--accent-teal)]/70 hover:text-[var(--accent-teal)] text-[10px] font-[family-name:var(--font-terminal)] tracking-wider block transition-colors">
                  {username}
                </span>
                <span className="text-white/20 text-[8px] font-[family-name:var(--font-terminal)]">
                  CONSCIOUSNESS: INTERFACED
                </span>
              </div>
              <span className="text-[var(--accent-teal)]/40 text-[7px]">{userMenuOpen ? '\u25B4' : '\u25BE'}</span>
            </button>
            {userMenuOpen && (
              <div
                className="absolute top-full right-0 mt-1 z-[100] border bg-[#0a0a0a] min-w-[140px]"
                style={{ borderColor: 'rgba(45,184,160,0.3)' }}
              >
                <Link
                  href="/profile/edit"
                  onClick={() => setUserMenuOpen(false)}
                  className="w-full text-left px-3 py-1.5 text-[9px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] transition-colors flex items-center gap-2 text-white/40 hover:text-[var(--accent-teal)]"
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="text-[var(--accent-teal)] text-[6px]">&#x25A1;</span>
                  Profile
                </Link>
                <Link
                  href={`/profile/${username}`}
                  onClick={() => setUserMenuOpen(false)}
                  className="w-full text-left px-3 py-1.5 text-[9px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] transition-colors flex items-center gap-2 text-white/40 hover:text-[var(--accent-teal)]"
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="text-[var(--accent-teal)] text-[6px]">&#x25A1;</span>
                  Public Profile
                </Link>
                <div className="border-t mx-2 my-0.5" style={{ borderColor: 'rgba(45,184,160,0.15)' }} />
                <button
                  onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                  className="w-full text-left px-3 py-1.5 text-[9px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] transition-colors flex items-center gap-2 text-[var(--pillar-body)]/40 hover:text-[var(--pillar-body)]"
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="text-[var(--pillar-body)] text-[6px]">&#x25A1;</span>
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom accent line */}
        <div className="h-[1px] bg-[var(--accent-teal)]/30" />
      </header>

      {/* Content area — fills remaining height, children handle their own scrolling */}
      <main className="flex-1 min-h-0 overflow-auto px-8">
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

      {/* Admin View-As — fixed bottom-right overlay */}
      {isAdmin && (
        <div className="fixed bottom-4 right-4 z-[200]">
          <button
            onClick={() => setSwitcherOpen(!switcherOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] transition-all"
            style={{
              borderColor: viewAs ? 'rgba(208,168,48,0.6)' : 'rgba(45,184,160,0.3)',
              color: viewAs ? 'var(--accent-gold)' : 'rgba(45,184,160,0.5)',
              background: viewAs ? 'rgba(208,168,48,0.12)' : 'rgba(0,0,0,0.85)',
              border: `1px solid ${viewAs ? 'rgba(208,168,48,0.6)' : 'rgba(45,184,160,0.3)'}`,
            }}
          >
            <span style={{ fontSize: '10px' }}>{viewAs ? '\u25C9' : '\u25CE'}</span>
            {viewAs ? viewAs : 'View As'}
          </button>
          {switcherOpen && (
            <>
              <div className="fixed inset-0 z-[199]" onClick={() => setSwitcherOpen(false)} />
              <div
                className="absolute bottom-full right-0 mb-1 z-[200] border bg-[#0a0a0a] min-w-[140px]"
                style={{ borderColor: 'rgba(45,184,160,0.3)' }}
              >
                {VIEW_ROLES.map(vr => {
                  const active = (viewAs === vr.key) || (!viewAs && vr.key === 'ADMIN');
                  return (
                    <button
                      key={vr.key}
                      onClick={() => handleViewAs(vr.key)}
                      className="w-full text-left px-3 py-1.5 text-[9px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] transition-colors flex items-center gap-2"
                      style={{
                        color: active ? vr.color : 'rgba(255,255,255,0.4)',
                        background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(255,255,255,0.05)' : 'transparent'; }}
                    >
                      <span style={{ color: vr.color, fontSize: '6px' }}>{active ? '\u25A0' : '\u25A1'}</span>
                      {vr.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
