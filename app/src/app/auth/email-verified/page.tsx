import Link from 'next/link';

export default function EmailVerifiedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#CBD9E8' }}>
      <div className="w-full max-w-sm p-6 space-y-4 text-center" style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(30,45,64,0.15)' }}>
        <div className="section-badge inline-block">Email Verified</div>
        <p className="text-sm" style={{ color: 'var(--surface-dark)' }}>
          Your email address is confirmed. Welcome to GRO.WTH.
        </p>
        <Link
          href="/hub"
          className="inline-block px-4 py-2 text-xs uppercase tracking-wider"
          style={{ background: 'var(--surface-dark)', color: 'var(--accent-gold)' }}
        >
          Continue
        </Link>
      </div>
    </div>
  );
}
