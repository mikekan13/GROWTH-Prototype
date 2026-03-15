import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { isWatcherOrAbove } from '@/lib/permissions';

// --- Schemas ---

export const trailblazerProfileSchema = z.object({
  firstName: z.string().max(100).optional(),
  pronouns: z.string().max(50).optional(),
  bio: z.string().max(2000).optional(),
  experienceLevel: z.string().max(50).optional(),
  systemsPlayed: z.array(z.string().max(100)).max(50).optional(),
  playstylePreferences: z.array(z.string().max(100)).max(20).optional(),
  playstyleNotes: z.string().max(1000).optional(),
  conflictStyle: z.string().max(500).optional(),
  topicsToAvoid: z.string().max(1000).optional(),
  availableDays: z.array(z.string().max(20)).max(7).optional(),
  preferredTime: z.string().max(100).optional(),
  timezone: z.string().max(100).optional(),
  sessionLength: z.string().max(100).optional(),
  frequency: z.string().max(100).optional(),
});

export const watcherProfileSchema = z.object({
  gmExperience: z.string().max(2000).optional(),
  gmStyle: z.string().max(1000).optional(),
  campaignPhilosophy: z.string().max(2000).optional(),
  sessionZeroApproach: z.string().max(1000).optional(),
  preferredGroupSize: z.string().max(100).optional(),
  contentWarningPolicy: z.string().max(1000).optional(),
});

export type TrailblazerProfile = z.infer<typeof trailblazerProfileSchema>;
export type WatcherProfile = z.infer<typeof watcherProfileSchema>;

// --- Service Functions ---

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      profile: true,
      watcherProfile: true,
      createdAt: true,
    },
  });

  if (!user) throw new NotFoundError('User not found');

  return {
    ...user,
    profile: user.profile ? JSON.parse(user.profile) as TrailblazerProfile : null,
    watcherProfile: user.watcherProfile ? JSON.parse(user.watcherProfile) as WatcherProfile : null,
  };
}

export async function updateProfile(userId: string, input: TrailblazerProfile) {
  const validated = trailblazerProfileSchema.parse(input);

  await prisma.user.update({
    where: { id: userId },
    data: { profile: JSON.stringify(validated) },
  });

  return validated;
}

export async function updateWatcherProfile(userId: string, userRole: string, input: WatcherProfile) {
  if (!isWatcherOrAbove(userRole)) {
    throw new ForbiddenError('Only Watchers can set a GM profile');
  }

  const validated = watcherProfileSchema.parse(input);

  await prisma.user.update({
    where: { id: userId },
    data: { watcherProfile: JSON.stringify(validated) },
  });

  return validated;
}

export async function getPublicProfile(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      role: true,
      profile: true,
      watcherProfile: true,
      createdAt: true,
      _count: {
        select: {
          campaigns: {
            where: { listingStatus: 'LISTED', status: 'ACTIVE' },
          },
        },
      },
    },
  });

  if (!user) throw new NotFoundError('User not found');

  const profile = user.profile ? JSON.parse(user.profile) as TrailblazerProfile : null;
  const watcherProfile = isWatcherOrAbove(user.role) && user.watcherProfile
    ? JSON.parse(user.watcherProfile) as WatcherProfile
    : null;

  // Strip topicsToAvoid from public view
  const publicProfile = profile ? { ...profile, topicsToAvoid: undefined } : null;

  return {
    username: user.username,
    role: user.role,
    profile: publicProfile,
    watcherProfile,
    listedCampaignsCount: user._count.campaigns,
    createdAt: user.createdAt,
  };
}
