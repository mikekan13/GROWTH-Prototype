/**
 * erase-user.ts — right-to-erasure vs the append-only ledger (T39).
 *
 * The KRMA ledger (KrmaTransaction / BurnLedger) and history rows reference
 * only opaque IDs (actorId cuid, wallet ids) — verified 2026-07-17: no
 * username/email columns and no name interpolation in descriptions. PII
 * lives in the User row plus cached display names on CampaignEvent. So
 * erasure = blank the PII table row + scrub the caches; the hash chain and
 * attribution stay byte-identical (INV-14).
 *
 * What it does, in one transaction:
 *   1. User row: username → departed-steward-<shortid> (unique), email →
 *      <id>@erased.invalid, passwordHash → random, profile/watcherProfile
 *      cleared, emailVerifiedAt nulled.
 *   2. Deletes all Sessions, EmailVerificationTokens, PasswordResetTokens.
 *   3. CampaignEvent.actorName → 'Departed Steward' where actorUserId = user.
 *
 * NOT touched: ledger rows, BurnLedger, HistoryEntry (opaque actorId),
 * wallets (economic state is game-state, not PII), characters (creative
 * work — ownership questions are Mike's call, out of T39 scope).
 *
 * Usage:  npx tsx scripts/erase-user.ts <username-or-userId> --yes
 * Then:   npx tsx scripts/verify-ledger.ts   (chain must still be green)
 */

import './_server-only-shim';
import crypto from 'crypto';
import { prisma } from '../src/lib/db';

async function main() {
  const [target, confirm] = process.argv.slice(2);
  if (!target) {
    console.error('Usage: npx tsx scripts/erase-user.ts <username-or-userId> --yes');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ id: target }, { username: target }] },
    select: { id: true, username: true, email: true, role: true },
  });
  if (!user) {
    console.error(`No user matching "${target}"`);
    process.exit(1);
  }

  console.log(`Target: ${user.username} <${user.email}> (${user.role}, id ${user.id})`);
  if (confirm !== '--yes') {
    console.log('Dry run — pass --yes to erase. Nothing changed.');
    process.exit(0);
  }
  if (user.role === 'ADMIN') {
    console.error('Refusing to erase an ADMIN account.');
    process.exit(1);
  }

  const shortId = user.id.slice(-8);
  const result = await prisma.$transaction(async (tx) => {
    const sessions = await tx.session.deleteMany({ where: { userId: user.id } });
    const verifs = await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    const resets = await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });

    await tx.user.update({
      where: { id: user.id },
      data: {
        username: `departed-steward-${shortId}`,
        email: `${user.id}@erased.invalid`,
        passwordHash: crypto.randomBytes(32).toString('hex'),
        profile: null,
        watcherProfile: null,
        emailVerifiedAt: null,
      },
    });

    const events = await tx.campaignEvent.updateMany({
      where: { actorUserId: user.id },
      data: { actorName: 'Departed Steward' },
    });

    return { sessions: sessions.count, verifs: verifs.count, resets: resets.count, events: events.count };
  });

  console.log(`Erased. Sessions deleted: ${result.sessions}; tokens deleted: ${result.verifs + result.resets}; campaign-event names scrubbed: ${result.events}.`);
  console.log(`User row survives as departed-steward-${shortId} (FK/chain integrity).`);
  console.log('Run `npx tsx scripts/verify-ledger.ts` to confirm the chain is untouched.');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
