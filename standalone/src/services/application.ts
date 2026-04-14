import 'server-only';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { suggestApplicationPrompts, expandApplicationResponse } from '@/ai/application-ai';

// --- Schemas ---

const promptSchema = z.object({
  id: z.string(),
  prompt: z.string().min(1).max(500),
  required: z.boolean(),
  category: z.string().max(50),
});

export const saveTemplateSchema = z.object({
  prompts: z.array(promptSchema).max(20),
});

const responseItemSchema = z.object({
  promptId: z.string(),
  prompt: z.string(),
  response: z.string().max(5000),
  aiExpanded: z.string().max(10000).optional(),
});

export const saveApplicationSchema = z.object({
  responses: z.array(responseItemSchema).max(20),
  submit: z.boolean().optional(), // true = submit, false/absent = save draft
});

export const expandResponseSchema = z.object({
  promptId: z.string(),
  prompt: z.string().min(1),
  response: z.string().min(10, 'Write at least a couple sentences before expanding'),
});

export const reviewApplicationSchema = z.object({
  action: z.enum(['APPROVED', 'REVISION', 'DENIED']),
  gmNotes: z.string().max(2000).optional(),
});

// --- Default prompts (used when campaign has no template) ---

const DEFAULT_PROMPTS = [
  { id: 'player-1', prompt: 'What name do you go by at the table? (Handle, nickname, or real name — whatever you prefer.)', required: true, category: 'identity' },
  { id: 'player-2', prompt: 'What is your experience with tabletop RPGs? Which systems have you played, and for how long?', required: true, category: 'experience' },
  { id: 'player-3', prompt: 'What kind of player are you? Do you gravitate toward roleplay, tactical combat, exploration, problem-solving, or something else?', required: true, category: 'playstyle' },
  { id: 'player-4', prompt: 'What are you hoping to get out of this campaign? What makes a great session for you?', required: true, category: 'expectations' },
  { id: 'player-5', prompt: 'How do you handle in-character conflict, tension between characters, or PvP situations?', required: false, category: 'dynamics' },
  { id: 'player-6', prompt: 'Are there any themes, topics, or content you would like to avoid at the table? (This is confidential between you and the Watcher.)', required: false, category: 'safety' },
  { id: 'player-7', prompt: 'What is your availability? Include your timezone, preferred days, and how long you can commit to sessions.', required: true, category: 'availability' },
  { id: 'player-8', prompt: 'How did you hear about this campaign, and is there anything else you would like the Watcher to know?', required: false, category: 'other' },
];

// --- Helpers ---

async function getCampaignOrThrow(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  return campaign;
}

async function getMemberOrThrow(campaignId: string, userId: string) {
  const member = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
  if (!member) throw new ForbiddenError('You are not a member of this campaign');
  return member;
}

function parseTemplate(campaign: { applicationTemplate?: string | null; customPrompts?: string | null }) {
  // Prefer applicationTemplate, fall back to migrating customPrompts
  if (campaign.applicationTemplate) {
    return JSON.parse(campaign.applicationTemplate);
  }
  if (campaign.customPrompts) {
    const legacy: string[] = JSON.parse(campaign.customPrompts);
    return legacy.map((prompt, i) => ({
      id: `migrated-${i}`,
      prompt,
      required: false,
      category: 'custom',
    }));
  }
  return null;
}

// --- Service Functions ---

export async function getTemplate(campaignId: string) {
  const campaign = await getCampaignOrThrow(campaignId);
  const custom = parseTemplate(campaign);
  return {
    prompts: custom || DEFAULT_PROMPTS,
    isDefault: !custom,
  };
}

export async function saveTemplate(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof saveTemplateSchema>,
) {
  const campaign = await getCampaignOrThrow(campaignId);
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can edit the application template');
  }

  // Ensure all prompts have IDs
  const prompts = input.prompts.map(p => ({
    ...p,
    id: p.id || crypto.randomUUID(),
  }));

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { applicationTemplate: JSON.stringify(prompts) },
  });

  return { prompts };
}

export async function suggestPrompts(
  campaignId: string,
  userId: string,
  userRole: string,
) {
  const campaign = await getCampaignOrThrow(campaignId);
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can request prompt suggestions');
  }

  const suggestions = await suggestApplicationPrompts({
    name: campaign.name,
    genre: campaign.genre,
    description: campaign.description,
    worldContext: campaign.worldContext,
  });

  // Add IDs to suggestions
  return suggestions.map(s => ({
    id: `ai-${crypto.randomUUID().slice(0, 8)}`,
    prompt: s.prompt,
    required: false,
    category: s.category,
  }));
}

export async function getApplication(campaignId: string, userId: string) {
  const member = await getMemberOrThrow(campaignId, userId);

  const application = await prisma.campaignApplication.findUnique({
    where: { memberId: member.id },
  });

  return application;
}

export async function saveApplication(
  campaignId: string,
  userId: string,
  input: z.infer<typeof saveApplicationSchema>,
) {
  const member = await getMemberOrThrow(campaignId, userId);

  // Check if application exists
  const existing = await prisma.campaignApplication.findUnique({
    where: { memberId: member.id },
  });

  // Can't edit if already approved or denied
  if (existing && (existing.status === 'APPROVED' || existing.status === 'DENIED')) {
    throw new ValidationError(`Application already ${existing.status.toLowerCase()} — cannot edit`);
  }

  const status = input.submit ? 'SUBMITTED' : 'DRAFT';
  const responses = JSON.stringify(input.responses);

  if (existing) {
    const updated = await prisma.campaignApplication.update({
      where: { id: existing.id },
      data: { responses, status },
    });
    return updated;
  }

  const created = await prisma.campaignApplication.create({
    data: {
      campaignId,
      memberId: member.id,
      responses,
      status,
    },
  });
  return created;
}

export async function expandResponse(
  campaignId: string,
  userId: string,
  input: z.infer<typeof expandResponseSchema>,
) {
  // Verify membership
  await getMemberOrThrow(campaignId, userId);
  const campaign = await getCampaignOrThrow(campaignId);

  const expanded = await expandApplicationResponse(
    input.prompt,
    input.response,
    {
      name: campaign.name,
      genre: campaign.genre,
      worldContext: campaign.worldContext,
    },
  );

  return { expanded };
}

export async function listApplications(
  campaignId: string,
  userId: string,
  userRole: string,
) {
  const campaign = await getCampaignOrThrow(campaignId);
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can view all applications');
  }

  const applications = await prisma.campaignApplication.findMany({
    where: { campaignId },
    include: {
      member: {
        include: { user: { select: { id: true, username: true } } },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return applications;
}

export async function reviewApplication(
  appId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof reviewApplicationSchema>,
) {
  const application = await prisma.campaignApplication.findUnique({
    where: { id: appId },
    include: { campaign: true },
  });

  if (!application) throw new NotFoundError('Application not found');
  if (!canManageCampaign(userId, userRole, application.campaign)) {
    throw new ForbiddenError('Only the GM can review applications');
  }

  if (application.status !== 'SUBMITTED' && application.status !== 'REVISION') {
    throw new ValidationError(`Cannot review application with status "${application.status}"`);
  }

  const updated = await prisma.campaignApplication.update({
    where: { id: appId },
    data: {
      status: input.action,
      gmNotes: input.gmNotes ?? null,
    },
  });

  return updated;
}
