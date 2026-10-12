import Link from 'next/link';

/**
 * Shown in place of an adult-only campaign to a viewer who is not an adult
 * (Mike 2026-10-12). Server-safe; no hooks.
 */
export default function AdultOnlyNotice({ backHref = '/hub' }: { backHref?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="inline-block bg-black px-3 py-1">
          <span className="font-[family-name:var(--font-header)] text-3xl tracking-wider text-[var(--accent-gold)]">
            This table is 18+
          </span>
        </div>
        <p className="text-sm font-[family-name:var(--font-body)] text-[var(--surface-dark)]/70">
          This campaign carries adult content and is closed to players under 18.
        </p>
        <Link
          href={backHref}
          className="inline-block text-xs uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] text-[var(--accent-teal)] hover:underline"
        >
          &larr; Back
        </Link>
      </div>
    </div>
  );
}
