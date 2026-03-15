'use client';

import { useState, useEffect } from 'react';

const EXPERIENCE_LEVELS = ['New to TTRPGs', 'A few sessions', '1-2 years', '3-5 years', '5-10 years', '10+ years'];
const PLAYSTYLE_OPTIONS = ['Roleplay', 'Tactical Combat', 'Exploration', 'Problem-Solving', 'Story-Driven', 'Sandbox', 'Political Intrigue', 'Horror/Survival'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FREQUENCY_OPTIONS = ['Weekly', 'Biweekly', 'Monthly', 'Flexible'];
const SESSION_LENGTH_OPTIONS = ['1-2 hours', '2-3 hours', '3-4 hours', '4+ hours', 'Flexible'];

interface TrailblazerProfile {
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

interface ProfileEditFormProps {
  initial: TrailblazerProfile | null;
  onSave: (profile: TrailblazerProfile) => Promise<void>;
}

export default function ProfileEditForm({ initial, onSave }: ProfileEditFormProps) {
  const [profile, setProfile] = useState<TrailblazerProfile>(initial || {});
  const [systemInput, setSystemInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [saved]);

  function update<K extends keyof TrailblazerProfile>(key: K, value: TrailblazerProfile[K]) {
    setProfile(prev => ({ ...prev, [key]: value }));
  }

  function toggleArrayItem(key: 'playstylePreferences' | 'availableDays', item: string) {
    const arr = profile[key] || [];
    update(key, arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);
  }

  function addSystem() {
    const s = systemInput.trim();
    if (!s) return;
    const systems = profile.systemsPlayed || [];
    if (!systems.includes(s)) {
      update('systemsPlayed', [...systems, s]);
    }
    setSystemInput('');
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

  const inputClass = 'w-full bg-[var(--surface-dark)]/5 border border-[var(--surface-dark)]/20 p-2 text-sm font-[family-name:var(--font-terminal)] focus:border-[var(--accent-teal)] focus:outline-none';
  const labelClass = 'text-[10px] uppercase tracking-[0.2em] text-[var(--surface-dark)]/50 font-[family-name:var(--font-terminal)] mb-1 block';
  const sectionClass = 'space-y-3';
  const sectionTitle = 'text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-header)] text-[var(--surface-dark)]/70 border-b border-[var(--surface-dark)]/10 pb-1 mb-3';

  return (
    <div className="space-y-6">
      {/* Identity */}
      <div className={sectionClass}>
        <h3 className={sectionTitle}>Identity</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>First Name</label>
            <input className={inputClass} value={profile.firstName || ''} onChange={e => update('firstName', e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className={labelClass}>Pronouns</label>
            <input className={inputClass} value={profile.pronouns || ''} onChange={e => update('pronouns', e.target.value)} placeholder="e.g. they/them" />
          </div>
        </div>
        <div>
          <label className={labelClass}>Bio</label>
          <textarea className={inputClass + ' min-h-[80px] resize-y'} value={profile.bio || ''} onChange={e => update('bio', e.target.value)} placeholder="Tell others about yourself..." maxLength={2000} />
        </div>
      </div>

      {/* Experience */}
      <div className={sectionClass}>
        <h3 className={sectionTitle}>Experience</h3>
        <div>
          <label className={labelClass}>Experience Level</label>
          <select className={inputClass} value={profile.experienceLevel || ''} onChange={e => update('experienceLevel', e.target.value)}>
            <option value="">Select...</option>
            {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Systems Played</label>
          <div className="flex gap-2 mb-2">
            <input className={inputClass + ' flex-1'} value={systemInput} onChange={e => setSystemInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSystem())} placeholder="Type a system name and press Enter" />
            <button onClick={addSystem} className="px-3 py-1 bg-[var(--accent-teal)]/20 border border-[var(--accent-teal)]/40 text-[var(--accent-teal)] text-xs hover:bg-[var(--accent-teal)]/30">Add</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(profile.systemsPlayed || []).map(s => (
              <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--pillar-soul)]/10 border border-[var(--pillar-soul)]/20 text-xs">
                {s}
                <button onClick={() => update('systemsPlayed', (profile.systemsPlayed || []).filter(x => x !== s))} className="text-[var(--pillar-body)] hover:text-[var(--pillar-body)]/80 ml-1">&times;</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Playstyle */}
      <div className={sectionClass}>
        <h3 className={sectionTitle}>Playstyle</h3>
        <div>
          <label className={labelClass}>Preferences</label>
          <div className="flex flex-wrap gap-2">
            {PLAYSTYLE_OPTIONS.map(p => (
              <button
                key={p}
                onClick={() => toggleArrayItem('playstylePreferences', p)}
                className={`px-2 py-1 text-xs border transition-colors ${
                  (profile.playstylePreferences || []).includes(p)
                    ? 'bg-[var(--accent-teal)]/20 border-[var(--accent-teal)] text-[var(--accent-teal)]'
                    : 'border-[var(--surface-dark)]/20 text-[var(--surface-dark)]/50 hover:border-[var(--surface-dark)]/40'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelClass}>Playstyle Notes</label>
          <textarea className={inputClass + ' min-h-[60px] resize-y'} value={profile.playstyleNotes || ''} onChange={e => update('playstyleNotes', e.target.value)} placeholder="Anything else about how you like to play..." maxLength={1000} />
        </div>
        <div>
          <label className={labelClass}>Conflict Style</label>
          <textarea className={inputClass + ' min-h-[40px] resize-y'} value={profile.conflictStyle || ''} onChange={e => update('conflictStyle', e.target.value)} placeholder="How do you handle in-character conflict or PvP?" maxLength={500} />
        </div>
        <div>
          <label className={labelClass}>Topics to Avoid <span className="text-[var(--pillar-body)]/60">(confidential — never shown publicly)</span></label>
          <textarea className={inputClass + ' min-h-[40px] resize-y border-[var(--pillar-body)]/20'} value={profile.topicsToAvoid || ''} onChange={e => update('topicsToAvoid', e.target.value)} placeholder="Any themes or content you prefer to avoid..." maxLength={1000} />
        </div>
      </div>

      {/* Availability */}
      <div className={sectionClass}>
        <h3 className={sectionTitle}>Availability</h3>
        <div>
          <label className={labelClass}>Available Days</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(d => (
              <button
                key={d}
                onClick={() => toggleArrayItem('availableDays', d)}
                className={`px-2 py-1 text-xs border transition-colors ${
                  (profile.availableDays || []).includes(d)
                    ? 'bg-[var(--accent-teal)]/20 border-[var(--accent-teal)] text-[var(--accent-teal)]'
                    : 'border-[var(--surface-dark)]/20 text-[var(--surface-dark)]/50 hover:border-[var(--surface-dark)]/40'
                }`}
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Preferred Time</label>
            <input className={inputClass} value={profile.preferredTime || ''} onChange={e => update('preferredTime', e.target.value)} placeholder="e.g. Evenings, after 7pm" />
          </div>
          <div>
            <label className={labelClass}>Timezone</label>
            <input className={inputClass} value={profile.timezone || ''} onChange={e => update('timezone', e.target.value)} placeholder="e.g. EST, UTC-5" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Session Length</label>
            <select className={inputClass} value={profile.sessionLength || ''} onChange={e => update('sessionLength', e.target.value)}>
              <option value="">Select...</option>
              {SESSION_LENGTH_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Frequency</label>
            <select className={inputClass} value={profile.frequency || ''} onChange={e => update('frequency', e.target.value)}>
              <option value="">Select...</option>
              {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-[var(--accent-teal)] text-white text-sm font-[family-name:var(--font-terminal)] tracking-wider uppercase hover:bg-[var(--accent-teal)]/80 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
        {saved && <span className="text-xs text-[var(--accent-teal)]">Saved</span>}
      </div>
    </div>
  );
}
