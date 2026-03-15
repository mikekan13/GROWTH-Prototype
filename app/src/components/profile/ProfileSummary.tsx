'use client';

interface ProfileData {
  firstName?: string;
  pronouns?: string;
  bio?: string;
  experienceLevel?: string;
  systemsPlayed?: string[];
  playstylePreferences?: string[];
  playstyleNotes?: string;
  conflictStyle?: string;
  topicsToAvoid?: string;
  availableDays?: string[];
  preferredTime?: string;
  timezone?: string;
  sessionLength?: string;
  frequency?: string;
}

interface WatcherProfileData {
  gmExperience?: string;
  gmStyle?: string;
  campaignPhilosophy?: string;
  sessionZeroApproach?: string;
  preferredGroupSize?: string;
  contentWarningPolicy?: string;
}

interface ProfileSummaryProps {
  username: string;
  role: string;
  profile: ProfileData | null;
  watcherProfile?: WatcherProfileData | null;
  createdAt?: string;
  listedCampaignsCount?: number;
  requiredFields?: string[];
  showCompleteness?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  pronouns: 'Pronouns',
  bio: 'Bio',
  experienceLevel: 'Experience Level',
  systemsPlayed: 'Systems Played',
  playstylePreferences: 'Playstyle Preferences',
  playstyleNotes: 'Playstyle Notes',
  conflictStyle: 'Conflict Style',
  topicsToAvoid: 'Topics to Avoid',
  availableDays: 'Available Days',
  preferredTime: 'Preferred Time',
  timezone: 'Timezone',
  sessionLength: 'Session Length',
  frequency: 'Frequency',
};

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export default function ProfileSummary({
  username, role, profile, watcherProfile, createdAt, listedCampaignsCount,
  requiredFields, showCompleteness,
}: ProfileSummaryProps) {
  const roleBadgeColor = {
    TRAILBLAZER: 'var(--pillar-spirit)',
    WATCHER: 'var(--accent-gold)',
    GODHEAD: 'var(--accent-teal)',
    ADMIN: 'var(--accent-teal)',
  }[role] || 'var(--accent-teal)';

  const missingFields = requiredFields
    ? requiredFields.filter(f => !hasValue(profile?.[f as keyof ProfileData]))
    : [];

  const labelClass = 'text-[10px] uppercase tracking-[0.2em] text-[var(--surface-dark)]/40 font-[family-name:var(--font-terminal)]';
  const valueClass = 'text-sm text-[var(--surface-dark)]';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[var(--surface-dark)]/10 border border-[var(--surface-dark)]/20 flex items-center justify-center text-lg font-[family-name:var(--font-header)]">
          {username.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-[family-name:var(--font-header)] text-lg tracking-wider">{username}</div>
          <span className="text-[10px] uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] px-1.5 py-0.5 border" style={{ color: roleBadgeColor, borderColor: roleBadgeColor }}>
            {role}
          </span>
          {profile?.pronouns && <span className="text-xs text-[var(--surface-dark)]/40 ml-2">{profile.pronouns}</span>}
        </div>
      </div>

      {/* Completeness indicator */}
      {showCompleteness && requiredFields && requiredFields.length > 0 && (
        <div className={`text-xs p-2 border ${missingFields.length === 0 ? 'border-[var(--accent-teal)]/30 bg-[var(--accent-teal)]/5 text-[var(--accent-teal)]' : 'border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/5 text-[var(--accent-gold)]'}`}>
          {missingFields.length === 0 ? (
            'All required profile fields are complete'
          ) : (
            <>Missing: {missingFields.map(f => FIELD_LABELS[f] || f).join(', ')}</>
          )}
        </div>
      )}

      {/* Profile fields */}
      {profile?.bio && (
        <div>
          <div className={labelClass}>Bio</div>
          <div className={valueClass + ' whitespace-pre-wrap'}>{profile.bio}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {profile?.experienceLevel && (
          <div>
            <div className={labelClass}>Experience</div>
            <div className={valueClass}>{profile.experienceLevel}</div>
          </div>
        )}
        {profile?.systemsPlayed && profile.systemsPlayed.length > 0 && (
          <div>
            <div className={labelClass}>Systems Played</div>
            <div className="flex flex-wrap gap-1">
              {profile.systemsPlayed.map(s => (
                <span key={s} className="px-1.5 py-0.5 bg-[var(--pillar-soul)]/10 border border-[var(--pillar-soul)]/20 text-xs">{s}</span>
              ))}
            </div>
          </div>
        )}
        {profile?.playstylePreferences && profile.playstylePreferences.length > 0 && (
          <div>
            <div className={labelClass}>Playstyle</div>
            <div className="flex flex-wrap gap-1">
              {profile.playstylePreferences.map(p => (
                <span key={p} className="px-1.5 py-0.5 bg-[var(--accent-teal)]/10 border border-[var(--accent-teal)]/20 text-xs">{p}</span>
              ))}
            </div>
          </div>
        )}
        {profile?.conflictStyle && (
          <div>
            <div className={labelClass}>Conflict Style</div>
            <div className={valueClass}>{profile.conflictStyle}</div>
          </div>
        )}
      </div>

      {/* Availability */}
      {(profile?.availableDays?.length || profile?.preferredTime || profile?.timezone) && (
        <div>
          <div className={labelClass + ' mb-1'}>Availability</div>
          <div className="flex flex-wrap gap-2 text-xs">
            {profile?.availableDays?.map(d => (
              <span key={d} className="px-1.5 py-0.5 bg-[var(--surface-dark)]/5 border border-[var(--surface-dark)]/15">{d.slice(0, 3)}</span>
            ))}
            {profile?.preferredTime && <span className="text-[var(--surface-dark)]/60">{profile.preferredTime}</span>}
            {profile?.timezone && <span className="text-[var(--surface-dark)]/40">({profile.timezone})</span>}
            {profile?.sessionLength && <span className="text-[var(--surface-dark)]/60">{profile.sessionLength}</span>}
            {profile?.frequency && <span className="text-[var(--surface-dark)]/60">{profile.frequency}</span>}
          </div>
        </div>
      )}

      {/* Watcher profile */}
      {watcherProfile && (
        <div className="border-t border-[var(--accent-gold)]/20 pt-3 mt-3 space-y-2">
          <div className="text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-header)] text-[var(--accent-gold)]/70">Watcher Profile</div>
          {watcherProfile.gmExperience && (
            <div><div className={labelClass}>GM Experience</div><div className={valueClass}>{watcherProfile.gmExperience}</div></div>
          )}
          {watcherProfile.gmStyle && (
            <div><div className={labelClass}>GM Style</div><div className={valueClass}>{watcherProfile.gmStyle}</div></div>
          )}
          {watcherProfile.campaignPhilosophy && (
            <div><div className={labelClass}>Campaign Philosophy</div><div className={valueClass}>{watcherProfile.campaignPhilosophy}</div></div>
          )}
          {watcherProfile.preferredGroupSize && (
            <div><div className={labelClass}>Group Size</div><div className={valueClass}>{watcherProfile.preferredGroupSize}</div></div>
          )}
        </div>
      )}

      {/* Listed campaigns count */}
      {listedCampaignsCount !== undefined && listedCampaignsCount > 0 && (
        <div className="text-xs text-[var(--surface-dark)]/40">
          {listedCampaignsCount} listed campaign{listedCampaignsCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Member since */}
      {createdAt && (
        <div className="text-[10px] text-[var(--surface-dark)]/30 font-[family-name:var(--font-terminal)]">
          Member since {new Date(createdAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
