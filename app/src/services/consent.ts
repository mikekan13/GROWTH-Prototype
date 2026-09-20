/**
 * AI-training consent (2026-09-20, provenance ledger queue item 1).
 *
 * The JEWL tool-loop traces are the planned fine-tune corpus and carry
 * player-authored content. Nothing enters that corpus without consent
 * recorded at write-time. A campaign's traces are consented only when the
 * GM AND every ACTIVE member have consented; no campaign = not consented.
 */
import 'server-only';
import { prisma } from '@/lib/db';

export interface TrainingConsent {
  training: boolean;
  /** Why: 'all-consented' | 'gm-declined' | 'member-declined:<n>' | 'no-campaign' | 'campaign-missing' */
  basis: string;
}

export async function resolveTrainingConsent(campaignId: string | undefined | null): Promise<TrainingConsent> {
  if (!campaignId) return { training: false, basis: 'no-campaign' };
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gmUser: { select: { aiTrainingConsent: true } }, members: { where: { status: 'ACTIVE' }, select: { user: { select: { aiTrainingConsent: true } } } } },
  });
  if (!campaign) return { training: false, basis: 'campaign-missing' };
  if (!campaign.gmUser.aiTrainingConsent) return { training: false, basis: 'gm-declined' };
  const declined = campaign.members.filter(m => !m.user.aiTrainingConsent).length;
  if (declined > 0) return { training: false, basis: `member-declined:${declined}` };
  return { training: true, basis: 'all-consented' };
}

export async function getUserTrainingConsent(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { aiTrainingConsent: true } });
  return !!u?.aiTrainingConsent;
}

export async function setAiTrainingConsent(userId: string, consent: boolean) {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { aiTrainingConsent: consent, aiTrainingConsentAt: new Date() },
    select: { aiTrainingConsent: true, aiTrainingConsentAt: true },
  });
  return u;
}
