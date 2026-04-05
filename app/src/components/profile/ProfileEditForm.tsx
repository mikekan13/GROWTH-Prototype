'use client';

import { useState, useEffect } from 'react';

const EXPERIENCE_LEVELS = ['New to TTRPGs', 'A few sessions', '1-2 years', '3-5 years', '5-10 years', '10+ years'];
const PLAYSTYLE_OPTIONS = ['Roleplay', 'Tactical Combat', 'Exploration', 'Problem-Solving', 'Story-Driven', 'Sandbox', 'Political Intrigue', 'Horror/Survival'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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

  const cardClass = 'rounded-xl p-5 space-y-4' as const;
  const cardStyle = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' };
  const inputClass = 'w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/25 font-[family-name:var(--font-terminal)] focus:border-[var(--accent-teal)] focus:ring-1 focus:ring-[var(--accent-teal)]/30 focus:outline-none transition-colors';
  const labelClass = 'text-xs text-white/50 font-[family-name:var(--font-terminal)] mb-1.5 block';
  const sectionTitle = 'text-sm font-[family-name:var(--font-header)] text-white/80 tracking-wider uppercase mb-1';

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className={cardClass} style={cardStyle}>
        <h3 className={sectionTitle}>Identity</h3>
        <div className="grid grid-cols-2 gap-3">
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
          <textarea className={inputClass + ' min-h-[100px] resize-y'} value={profile.bio || ''} onChange={e => update('bio', e.target.value)} placeholder="Tell others about yourself..." maxLength={2000} />
        </div>
      </div>

      {/* Experience */}
      <div className={cardClass} style={cardStyle}>
        <h3 className={sectionTitle}>Experience</h3>
        <div>
          <label className={labelClass}>Experience Level</label>
          <select className={inputClass} value={profile.experienceLevel || ''} onChange={e => update('experienceLevel', e.target.value)}>
            <option value="">Select your experience...</option>
            {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Systems Played</label>
          <div className="flex gap-2 mb-2">
            <input
              className={inputClass + ' flex-1'}
              value={systemInput}
              onChange={e => setSystemInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSystem())}
              placeholder="Type a system name and press Enter"
            />
            <button onClick={addSystem} className="px-4 py-2 rounded-lg bg-[var(--accent-teal)]/20 text-[var(--accent-teal)] text-sm font-[family-name:var(--font-terminal)] hover:bg-[var(--accent-teal)]/30 transition-colors">
              Add
            </button>
          </div>
          {(profile.systemsPlayed || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(profile.systemsPlayed || []).map(s => (
                <span key={s} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--pillar-soul)]/15 text-[var(--pillar-soul)] text-xs font-[family-name:var(--font-terminal)]">
                  {s}
                  <button onClick={() => update('systemsPlayed', (profile.systemsPlayed || []).filter(x => x !== s))} className="text-white/40 hover:text-[var(--pillar-body)] transition-colors">&times;</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Playstyle */}
      <div className={cardClass} style={cardStyle}>
        <h3 className={sectionTitle}>Playstyle</h3>
        <div>
          <label className={labelClass}>What do you enjoy?</label>
          <div className="flex flex-wrap gap-2">
            {PLAYSTYLE_OPTIONS.map(p => {
              const selected = (profile.playstylePreferences || []).includes(p);
              return (
                <button
                  key={p}
                  onClick={() => toggleArrayItem('playstylePreferences', p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-[family-name:var(--font-terminal)] transition-all ${
                    selected
                      ? 'bg-[var(--accent-teal)] text-white'
                      : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                  }`}
                >
                  {selected && <span className="mr-1">&#x2713;</span>}
                  {p}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className={labelClass}>Playstyle Notes</label>
          <textarea className={inputClass + ' min-h-[70px] resize-y'} value={profile.playstyleNotes || ''} onChange={e => update('playstyleNotes', e.target.value)} placeholder="Anything else about how you like to play..." maxLength={1000} />
        </div>
        <div>
          <label className={labelClass}>Conflict Style</label>
          <input className={inputClass} value={profile.conflictStyle || ''} onChange={e => update('conflictStyle', e.target.value)} placeholder="How do you handle in-character conflict or PvP?" maxLength={500} />
        </div>
      </div>

      {/* Safety */}
      <div className={cardClass} style={{ background: 'rgba(232,88,90,0.04)', border: '1px solid rgba(232,88,90,0.12)' }}>
        <div className="flex items-center gap-2">
          <h3 className={sectionTitle} style={{ color: 'var(--pillar-body)', marginBottom: 0 }}>Safety</h3>
          <span className="text-[10px] text-[var(--pillar-body)]/50 font-[family-name:var(--font-terminal)] px-2 py-0.5 rounded-full bg-[var(--pillar-body)]/10">
            Confidential
          </span>
        </div>
        <p className="text-xs text-white/30 -mt-2">Only visible to GMs reviewing your application. Never shown publicly.</p>
        <div>
          <label className={labelClass}>Topics to Avoid</label>
          <textarea className={inputClass + ' min-h-[70px] resize-y'} style={{ borderColor: 'rgba(232,88,90,0.2)' }} value={profile.topicsToAvoid || ''} onChange={e => update('topicsToAvoid', e.target.value)} placeholder="Any themes or content you prefer to avoid..." maxLength={1000} />
        </div>
      </div>

      {/* Availability */}
      <div className={cardClass} style={cardStyle}>
        <h3 className={sectionTitle}>Availability</h3>
        <div>
          <label className={labelClass}>Available Days</label>
          <div className="flex gap-1.5">
            {DAYS.map((d, i) => {
              const selected = (profile.availableDays || []).includes(DAY_FULL[i]);
              return (
                <button
                  key={d}
                  onClick={() => toggleArrayItem('availableDays', DAY_FULL[i])}
                  className={`flex-1 py-2 rounded-lg text-xs font-[family-name:var(--font-terminal)] transition-all ${
                    selected
                      ? 'bg-[var(--accent-teal)] text-white'
                      : 'bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Preferred Time</label>
            <input className={inputClass} value={profile.preferredTime || ''} onChange={e => update('preferredTime', e.target.value)} placeholder="e.g. Evenings, after 7pm" />
          </div>
          <div>
            <label className={labelClass}>Timezone</label>
            <input className={inputClass} value={profile.timezone || ''} onChange={e => update('timezone', e.target.value)} placeholder="e.g. EST, UTC-5" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 rounded-lg bg-[var(--accent-teal)] text-white text-sm font-[family-name:var(--font-terminal)] tracking-wider uppercase hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
        </button>
        {saved && <span className="text-sm text-[var(--accent-teal)] animate-pulse">Changes saved</span>}
      </div>
    </div>
  );
}
