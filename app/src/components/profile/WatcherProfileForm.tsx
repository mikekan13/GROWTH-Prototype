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

  const inputClass = 'w-full bg-[var(--surface-dark)]/5 border border-[var(--surface-dark)]/20 p-2 text-sm font-[family-name:var(--font-terminal)] focus:border-[var(--accent-gold)] focus:outline-none';
  const labelClass = 'text-[10px] uppercase tracking-[0.2em] text-[var(--surface-dark)]/50 font-[family-name:var(--font-terminal)] mb-1 block';

  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-header)] text-[var(--accent-gold)]/80 border-b border-[var(--accent-gold)]/20 pb-1 mb-3">
        Watcher Profile
      </h3>

      <div>
        <label className={labelClass}>GM Experience</label>
        <textarea className={inputClass + ' min-h-[60px] resize-y'} value={profile.gmExperience || ''} onChange={e => update('gmExperience', e.target.value)} placeholder="How long have you been running games? What systems?" maxLength={2000} />
      </div>

      <div>
        <label className={labelClass}>GM Style</label>
        <textarea className={inputClass + ' min-h-[40px] resize-y'} value={profile.gmStyle || ''} onChange={e => update('gmStyle', e.target.value)} placeholder="How would you describe your style as a GM?" maxLength={1000} />
      </div>

      <div>
        <label className={labelClass}>Campaign Philosophy</label>
        <textarea className={inputClass + ' min-h-[60px] resize-y'} value={profile.campaignPhilosophy || ''} onChange={e => update('campaignPhilosophy', e.target.value)} placeholder="What makes a great campaign in your view?" maxLength={2000} />
      </div>

      <div>
        <label className={labelClass}>Session Zero Approach</label>
        <textarea className={inputClass + ' min-h-[40px] resize-y'} value={profile.sessionZeroApproach || ''} onChange={e => update('sessionZeroApproach', e.target.value)} placeholder="How do you run session zero?" maxLength={1000} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Preferred Group Size</label>
          <input className={inputClass} value={profile.preferredGroupSize || ''} onChange={e => update('preferredGroupSize', e.target.value)} placeholder="e.g. 3-5 players" maxLength={100} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Content Warning Policy</label>
        <textarea className={inputClass + ' min-h-[40px] resize-y'} value={profile.contentWarningPolicy || ''} onChange={e => update('contentWarningPolicy', e.target.value)} placeholder="How do you handle content warnings and safety tools?" maxLength={1000} />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-[var(--accent-gold)] text-[var(--surface-dark)] text-sm font-[family-name:var(--font-terminal)] tracking-wider uppercase hover:bg-[var(--accent-gold)]/80 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Watcher Profile'}
        </button>
        {saved && <span className="text-xs text-[var(--accent-gold)]">Saved</span>}
      </div>
    </div>
  );
}
