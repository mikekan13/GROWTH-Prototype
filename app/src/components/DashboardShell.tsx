'use client';

import { useRouter } from 'next/navigation';

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
    <div className="min-h-screen">
      {/* Header bar */}
      <header className="bg-[var(--surface-dark)] text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-[family-name:var(--font-header)] text-xl tracking-wider text-[var(--accent-gold)]">
            GRO.WTH
          </span>
          <span className="text-xs uppercase tracking-widest" style={{ color: roleColor }}>
            {roleLabel}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white/60">{username}</span>
          <button
            onClick={handleLogout}
            className="text-white/40 hover:text-white/80 transition-colors uppercase text-xs tracking-wider"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="p-6">
        {children}
      </main>
    </div>
  );
}
