'use client';

import { useState, useEffect } from 'react';

interface WatcherProfile {
  gmExperience?: string;
  gmStyle?: string;
  campaignPhilosophy?: string;
  sessionZeroApproach?: string;
  preferredGroupSize?: string;
  contentWarningPolicy?: string;
}

interface WatcherProfileFormProps {
  initial: WatcherProfile | null;
  onSave: (profile: WatcherProfile) => Promise<void>;
}

export default function WatcherProfileForm({ initial, onSave }: WatcherProfileFormProps) {
  const [profile, setProfile] = useState<WatcherProfile>(initial || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [saved]);

  function update<K extends keyof WatcherProfile>(key: K, value: string) {
    setProfile(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(profile);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const cardClass = 'rounded-xl p-5 space-y-4';
  const cardStyle = { background: 'rgba(208,160,48,0.04)', border: '1px solid rgba(208,160,48,0.12)' };
  const inputClass = 'w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/25 font-[family-name:var(--font-terminal)] focus:border-[var(--accent-gold)] focus:ring-1 focus:ring-[var(--accent-gold)]/30 focus:outline-none transition-colors';
  const labelClass = 'text-xs text-white/50 font-[family-name:var(--font-terminal)] mb-1.5 block';

  return (
    <div className="space-y-4">
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-[family-name:var(--font-header)] text-[var(--accent-gold)] tracking-wider uppercase mb-1">
          About You as a GM
        </h3>
        <div>
          <label className={labelClass}>GM Experience</label>
          <textarea className={inputClass + ' min-h-[80px] resize-y'} value={profile.gmExperience || ''} onChange={e => update('gmExperience', e.target.value)} placeholder="How long have you been running games? What systems?" maxLength={2000} />
        </div>
        <div>
          <label className={labelClass}>GM Style</label>
          <textarea className={inputClass + ' min-h-[60px] resize-y'} value={profile.gmStyle || ''} onChange={e => update('gmStyle', e.target.value)} placeholder="How would you describe your style as a GM?" maxLength={1000} />
        </div>
        <div>
          <label className={labelClass}>Preferred Group Size</label>
          <input className={inputClass} value={profile.preferredGroupSize || ''} onChange={e => update('preferredGroupSize', e.target.value)} placeholder="e.g. 3-5 players" maxLength={100} />
        </div>
      </div>

      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-[family-name:var(--font-header)] text-[var(--accent-gold)] tracking-wider uppercase mb-1">
          Campaign Philosophy
        </h3>
        <div>
          <label className={labelClass}>What makes a great campaign?</label>
          <textarea className={inputClass + ' min-h-[80px] resize-y'} value={profile.campaignPhilosophy || ''} onChange={e => update('campaignPhilosophy', e.target.value)} placeholder="What do you value most in a campaign?" maxLength={2000} />
        </div>
        <div>
          <label className={labelClass}>Session Zero Approach</label>
          <textarea className={inputClass + ' min-h-[60px] resize-y'} value={profile.sessionZeroApproach || ''} onChange={e => update('sessionZeroApproach', e.target.value)} placeholder="How do you run session zero?" maxLength={1000} />
        </div>
        <div>
          <label className={labelClass}>Content Warning Policy</label>
          <textarea className={inputClass + ' min-h-[60px] resize-y'} value={profile.contentWarningPolicy || ''} onChange={e => update('contentWarningPolicy', e.target.value)} placeholder="How do you handle content warnings and safety tools?" maxLength={1000} />
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 rounded-lg bg-[var(--accent-gold)] text-black text-sm font-[family-name:var(--font-terminal)] tracking-wider uppercase hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Watcher Profile'}
        </button>
        {saved && <span className="text-sm text-[var(--accent-gold)] animate-pulse">Changes saved</span>}
      </div>
    </div>
  );
}
