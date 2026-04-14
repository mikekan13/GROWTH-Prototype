import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Standalone landing — character picker.
 *
 * Auth: shares the session_token cookie with the main app (same localhost domain).
 * If the user is logged into the main app at http://localhost:3000, they are
 * automatically logged into standalone at http://localhost:3001.
 *
 * If no session: shows a link back to the main app login. When SSO/shared auth
 * is properly set up, replace with redirect.
 */
export default async function StandaloneHome() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white p-8">
        <div className="max-w-md text-center space-y-6 border border-[#7050A8]/40 bg-[#0a0a1a] p-8">
          <div className="text-xs uppercase tracking-[0.3em] text-[#D0A030]" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            GRO.WTH Character Creator
          </div>
          <div className="text-2xl" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.15em' }}>
            Not Logged In
          </div>
          <p className="text-xs text-white/60" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            This standalone shares session with the main GRO.WTH app. Log in there first.
          </p>
          <a
            href="http://localhost:3000/"
            className="inline-block px-6 py-3 text-xs uppercase tracking-wider border border-[#D0A030] text-[#D0A030] hover:bg-[#D0A030] hover:text-black transition-colors"
            style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}
          >
            Go to GRO.WTH Login →
          </a>
          <div className="text-[9px] text-white/30" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Once logged in, return to this page.
          </div>
        </div>
      </main>
    );
  }

  // Fetch characters the user can edit: owned by them OR in campaigns they GM.
  const ownCharacters = await prisma.character.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true, entityType: true, status: true, campaign: { select: { id: true, name: true } }, portrait: true },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  const gmCampaigns = await prisma.campaign.findMany({
    where: { gmUserId: session.user.id },
    select: { id: true, name: true },
  });
  const gmCampaignIds = gmCampaigns.map(c => c.id);
  const gmCharacters = gmCampaignIds.length > 0
    ? await prisma.character.findMany({
        where: { campaignId: { in: gmCampaignIds }, userId: { not: session.user.id } },
        select: { id: true, name: true, entityType: true, status: true, campaign: { select: { id: true, name: true } }, portrait: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      })
    : [];

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#7050A8]/40 pb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#D0A030]/60" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              GRO.WTH · Standalone
            </div>
            <div className="text-3xl" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.15em', color: '#D0A030' }}>
              Character Creator
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-white/40" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Logged in as
            </div>
            <div className="text-sm text-white/80" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              {session.user.username || session.user.id}
            </div>
            <div className="text-[9px] text-white/30 uppercase tracking-wider mt-1">{session.user.role}</div>
          </div>
        </div>

        {/* Your characters */}
        <section>
          <h2 className="text-sm uppercase tracking-[0.2em] text-[#D0A030]/80 mb-3" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Your Characters ({ownCharacters.length})
          </h2>
          {ownCharacters.length === 0 ? (
            <div className="text-xs text-white/30 italic py-4" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              No characters yet. Create one in a campaign via the main app.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ownCharacters.map(c => (
                <Link key={c.id} href={`/character/${c.id}`}
                  className="border border-white/10 bg-[#0a0a1a] hover:border-[#D0A030]/50 p-3 transition-colors flex items-center gap-3">
                  <div className="w-10 h-10 border border-white/10 bg-[#111]"
                    style={{ backgroundImage: c.portrait ? `url(${c.portrait})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.1em' }}>
                      {c.name || '(unnamed)'}
                    </div>
                    <div className="text-[9px] text-white/40 uppercase tracking-wider" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      {c.entityType} · {c.status} · {c.campaign?.name || 'no campaign'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* GM-owned entities (NPCs etc.) */}
        {gmCharacters.length > 0 && (
          <section>
            <h2 className="text-sm uppercase tracking-[0.2em] text-[#3EB89A]/80 mb-3" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              GM Entities ({gmCharacters.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {gmCharacters.map(c => (
                <Link key={c.id} href={`/character/${c.id}`}
                  className="border border-white/10 bg-[#0a0a1a] hover:border-[#3EB89A]/50 p-3 transition-colors flex items-center gap-3">
                  <div className="w-10 h-10 border border-white/10 bg-[#111]"
                    style={{ backgroundImage: c.portrait ? `url(${c.portrait})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.1em' }}>
                      {c.name || '(unnamed)'}
                    </div>
                    <div className="text-[9px] text-white/40 uppercase tracking-wider" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      {c.entityType} · {c.status} · {c.campaign?.name}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="text-[9px] text-white/20 pt-8 border-t border-white/5" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
          Standalone at localhost:3001 · Shares DB + session with main app · Changes sync both ways
        </div>
      </div>
    </main>
  );
}
