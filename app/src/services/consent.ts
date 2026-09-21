/**
 * AI-training consent (2026-09-20, provenance ledger queue item 1).
 *
 * Mike's ruling (2026-09-20): **consent is required to play in the META** —
 * the connected network, whose play is what trains GROWTH. A campaign may
 * instead be DISCONNECTED: every feature works, nothing from that table is
 * ever used to train. So the gate is the campaign's network mode; member
 * consent is the invariant a META campaign maintains at every entry point
 * (create, join, apply, express interest).
 *
 * The JEWL tool-loop traces are the planned fine-tune corpus and carry
 * player-authored content. Nothing enters that corpus without consent
 * recorded at write-time.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { ForbiddenError } from '@/lib/errors';

export type NetworkMode = 'META' | 'DISCONNECTED';

export interface TrainingConsent {
  training: boolean;
  /** 'all-consented' | 'disconnected' | 'gm-declined' | 'member-declined:<n>' | 'no-campaign' | 'campaign-missing' */
  basis: string;
}

export async function resolveTrainingConsent(campaignId: string | undefined | null): Promise<TrainingConsent> {
  if (!campaignId) return { training: false, basis: 'no-campaign' };
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      networkMode: true,
      gmUser: { select: { aiTrainingConsent: true } },
      members: { where: { status: 'ACTIVE' }, select: { user: { select: { aiTrainingConsent: true } } } },
    },
  });
  if (!campaign) return { training: false, basis: 'campaign-missing' };
  if (campaign.networkMode !== 'META') return { training: false, basis: 'disconnected' };
  // Invariant check — a META campaign should never reach here unconsented, but the
  // corpus must not depend on that being true.
  if (!campaign.gmUser.aiTrainingConsent) return { training: false, basis: 'gm-declined' };
  const declined = campaign.members.filter(m => !m.user.aiTrainingConsent).length;
  if (declined > 0) return { training: false, basis: `member-declined:${declined}` };
  return { training: true, basis: 'all-consented' };
}

export async function getUserTrainingConsent(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { aiTrainingConsent: true } });
  return !!u?.aiTrainingConsent;
}

/**
 * Entry gate for the META: a user may create, join, apply to, or express
 * interest in a META campaign only with consent on record. DISCONNECTED
 * campaigns have no such gate.
 */
export async function assertMetaConsent(userId: string, campaign: { networkMode: string }, action = 'join'): Promise<void> {
  if (campaign.networkMode !== 'META') return;
  if (await getUserTrainingConsent(userId)) return;
  throw new ForbiddenError(
    `Consent to AI training is required to ${action} a META campaign. Set it in your profile, or use a DISCONNECTED campaign — same features, none of your data trains GROWTH.`,
  );
}

export async function setAiTrainingConsent(userId: string, consent: boolean) {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { aiTrainingConsent: consent, aiTrainingConsentAt: new Date() },
    select: { aiTrainingConsent: true, aiTrainingConsentAt: true },
  });
  return u;
}
