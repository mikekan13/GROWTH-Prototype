'use client';

import { useState, useEffect, useCallback } from 'react';

interface ApplicationData {
  // Identity
  displayName: string;
  pronouns: string;
  // Experience
  experienceLevel: string;
  systemsPlayed: string[];
  // Playstyle
  playstylePreferences: string[];
  playstyleNotes: string;
  // Expectations
  campaignHopes: string;
  conflictStyle: string;
  // Safety
  topicsToAvoid: string;
  // Availability
  availableDays: string[];
  preferredTime: string;
  timezone: string;
  sessionLength: string;
  frequency: string;
  // Other
  howHeard: string;
  anythingElse: string;
}

const EMPTY_APP: ApplicationData = {
  displayName: '',
  pronouns: '',
  experienceLevel: '',
  systemsPlayed: [],
  playstylePreferences: [],
  playstyleNotes: '',
  campaignHopes: '',
  conflictStyle: '',
  topicsToAvoid: '',
  availableDays: [],
  preferredTime: '',
  timezone: '',
  sessionLength: '',
  frequency: '',
  howHeard: '',
  anythingElse: '',
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EXPERIENCE_LEVELS = ['Brand new — never played a TTRPG', 'Beginner — a few sessions under my belt', 'Intermediate — a year or two of play', 'Experienced — been at this for years', 'Veteran — TTRPGs are a way of life', 'Forever GM — rarely get to be a player'];
const SYSTEMS = [
  // D&D family
  'D&D 5e (2014)', 'D&D 5e (2024 / 5.5)', 'D&D 3.5e', 'D&D 4e', 'AD&D 1e/2e', 'OD&D / Basic D&D',
  // Pathfinder
  'Pathfinder 1e', 'Pathfinder 2e', 'Starfinder',
  // OSR
  'Old-School Essentials', 'Dungeon Crawl Classics', 'Mörk Borg', 'Knave', 'Cairn', 'Into the Odd', 'The Black Hack', 'Labyrinth Lord', 'OSRIC', 'Lamentations of the Flame Princess',
  // Powered by the Apocalypse
  'Apocalypse World', 'Dungeon World', 'Monster of the Week', 'Masks', 'Monsterhearts', 'The Sprawl', 'Urban Shadows', 'Fellowship', 'Thirsty Sword Lesbians',
  // Forged in the Dark
  'Blades in the Dark', 'Scum and Villainy', 'Band of Blades', 'Court of Blades',
  // Year Zero Engine
  'Mutant Year Zero', 'Forbidden Lands', 'Alien RPG', 'Vaesen', 'Twilight: 2000', 'Blade Runner RPG',
  // World of Darkness / Chronicles
  'Vampire: The Masquerade (V5)', 'Vampire: The Masquerade (V20)', 'Werewolf: The Apocalypse', 'Mage: The Ascension', 'Changeling: The Dreaming', 'Hunter: The Reckoning', 'Wraith: The Oblivion', 'Chronicles of Darkness',
  // Horror
  'Call of Cthulhu', 'Delta Green', 'Trail of Cthulhu', 'Mothership', 'Dread', 'Ten Candles', 'Trophy', 'Kult: Divinity Lost',
  // Sci-Fi
  'Stars Without Number', 'Traveller', 'Eclipse Phase', 'Lancer', 'Numenera', 'The Expanse RPG', 'Cyberpunk RED', 'Shadowrun', 'Star Wars (FFG/Edge)', 'Star Wars (WEG d6)', 'Star Trek Adventures',
  // Fantasy (non-D&D)
  'Dungeon World', 'Shadow of the Demon Lord', 'Symbaroum', 'Warhammer Fantasy Roleplay', 'RuneQuest', 'Earthdawn', 'The One Ring', 'Dragonbane', '13th Age', 'Burning Wheel', 'Torchbearer', 'Mouse Guard',
  // Narrative / Indie
  'FATE Core / Accelerated', 'Savage Worlds', 'Cortex Prime', 'Genesys', 'Cypher System', 'Powered by the Apocalypse (other)', 'Forged in the Dark (other)', 'GURPS', 'BESM', 'Risus', 'Fiasco', 'Microscope', 'The Quiet Year', 'For the Queen', 'Wanderhome', 'Ironsworn / Starforged',
  // Solo / Journaling
  'Ironsworn', 'Starforged', 'Thousand Year Old Vampire', 'Quill',
  // Superhero
  'Mutants & Masterminds', 'Marvel Multiverse RPG', 'Sentinel Comics RPG', 'ICONS',
  // Other major
  'Deadlands', 'Legend of the Five Rings', 'Pendragon', 'Ars Magica', 'Paranoia', 'Rifts / Palladium', 'HERO System / Champions', 'Basic Roleplaying (BRP)', 'Zweihänder',
];
const PLAYSTYLES = ['Heavy roleplay', 'Tactical combat', 'Exploration & discovery', 'Problem-solving & puzzles', 'Social & political intrigue', 'Narrative drama', 'Sandbox / player-driven'];
const TIME_SLOTS = ['Morning (6am-12pm)', 'Afternoon (12pm-5pm)', 'Evening (5pm-9pm)', 'Late night (9pm+)'];
const SESSION_LENGTHS = ['1-2 hours', '2-3 hours', '3-4 hours', '4-5 hours', '5+ hours'];
const FREQUENCIES = ['Weekly', 'Biweekly', 'Monthly', 'Flexible'];
const TIMEZONES = ['EST (UTC-5)', 'CST (UTC-6)', 'MST (UTC-7)', 'PST (UTC-8)', 'GMT (UTC+0)', 'CET (UTC+1)', 'AEST (UTC+10)', 'Other'];

// Shared styles
const sectionTitle = "text-[var(--accent-teal)] text-[10px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase mb-3 border-b border-[var(--accent-teal)]/20 pb-1";
const labelStyle = "text-white/50 text-[10px] font-[family-name:var(--font-terminal)] tracking-[0.1em] uppercase mb-1";
const inputStyle = "w-full text-sm text-white/80 border border-[var(--accent-teal)]/20 p-2 bg-[#0a1a2a] placeholder:text-white/15 font-[family-name:var(--font-terminal)]";
const selectStyle = "text-sm text-white/80 border border-[var(--accent-teal)]/20 p-2 bg-[#0a1a2a] font-[family-name:var(--font-terminal)] [&>option]:bg-[#0a1a2a] [&>option]:text-white/80";
const checkboxLabel = "flex items-center gap-2 text-[11px] text-white/60 font-[family-name:var(--font-terminal)] cursor-pointer hover:text-white/80 transition-colors";

function SystemsSearch({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filtered = query.trim()
    ? SYSTEMS.filter(s => s.toLowerCase().includes(query.toLowerCase()) && !selected.includes(s))
    : SYSTEMS.filter(s => !selected.includes(s));

  const addSystem = (sys: string) => {
    onChange([...selected, sys]);
    setQuery('');
  };

  const addCustom = () => {
    const trimmed = query.trim();
    if (trimmed && !selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
      setQuery('');
    }
  };

  const removeSystem = (sys: string) => {
    onChange(selected.filter(s => s !== sys));
  };

  return (
    <div className="space-y-2">
      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(sys => (
            <span
              key={sys}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-[family-name:var(--font-terminal)] bg-[var(--accent-teal)]/15 text-[var(--accent-teal)] border border-[var(--accent-teal)]/30"
            >
              {sys}
              <button
                onClick={() => removeSystem(sys)}
                className="text-[var(--accent-teal)]/50 hover:text-[var(--accent-teal)] text-xs leading-none"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
          }}
          placeholder="Search or type a system..."
          className={inputStyle}
        />
        {/* Dropdown */}
        {showSuggestions && filtered.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 max-h-40 overflow-y-auto border border-[var(--accent-teal)]/20 bg-[#0a1a2a]">
            {filtered.map(sys => (
              <button
                key={sys}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => addSystem(sys)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-white/60 font-[family-name:var(--font-terminal)] hover:bg-[var(--accent-teal)]/10 hover:text-[var(--accent-teal)] transition-colors"
              >
                {sys}
              </button>
            ))}
          </div>
        )}
        {/* Custom add hint */}
        {query.trim() && !SYSTEMS.some(s => s.toLowerCase() === query.trim().toLowerCase()) && (
          <div className="text-[9px] text-white/20 font-[family-name:var(--font-terminal)] mt-1">
            Press Enter to add &quot;{query.trim()}&quot;
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  campaignId: string;
  mode?: 'edit' | 'fill';
  onSubmit?: (data: ApplicationData) => void;
}

export default function ApplicationTemplateEditor({ campaignId, mode = 'edit' }: Props) {
  const [data, setData] = useState<ApplicationData>(EMPTY_APP);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const isPreview = mode === 'edit';

  const fetchTemplate = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/application/template`);
      if (res.ok) {
        const result = await res.json();
        if (result.prompts?.[0]?.structuredData) {
          setData(result.prompts[0].structuredData);
        }
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [campaignId]);

  useEffect(() => { fetchTemplate(); }, [fetchTemplate]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/application/template`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts: [{ id: 'structured-app', prompt: 'Player Application', required: true, category: 'structured', structuredData: data }],
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const update = <K extends keyof ApplicationData>(key: K, value: ApplicationData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
  };

  const toggleArray = (key: 'systemsPlayed' | 'playstylePreferences' | 'availableDays', value: string) => {
    setData(prev => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter(v => v !== value) : [...prev[key], value],
    }));
  };

  if (loading) {
    return <div className="text-sm text-white/30 font-[family-name:var(--font-terminal)]">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-[family-name:var(--font-header)] text-sm tracking-[0.2em] uppercase text-[var(--accent-teal)]">
            Player Application
          </h3>
          <p className="text-[9px] text-white/30 font-[family-name:var(--font-terminal)]">
            {isPreview ? 'Preview — this is what players will fill out when applying as a Trailblazer.' : 'Tell the Watcher about yourself.'}
          </p>
        </div>
        {isPreview && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] border border-[var(--accent-teal)]/40 text-[var(--accent-teal)] hover:bg-[var(--accent-teal)] hover:text-black transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Template'}
          </button>
        )}
      </div>

      {/* Section 1: Who Are You */}
      <div>
        <div className={sectionTitle}>Who Are You</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className={labelStyle}>First Name / Real Name <span className="text-[var(--pillar-body)]">*</span></div>
            <input
              type="text"
              value={data.displayName}
              onChange={e => update('displayName', e.target.value)}
              placeholder="What do we call you in real life?"
              className={inputStyle}
            />
          </div>
          <div>
            <div className={labelStyle}>Pronouns</div>
            <input
              type="text"
              value={data.pronouns}
              onChange={e => update('pronouns', e.target.value)}
              placeholder="e.g. he/him, she/her, they/them"
              className={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Section 2: Experience */}
      <div>
        <div className={sectionTitle}>Experience</div>
        <div className="mb-3">
          <div className={labelStyle}>Experience Level <span className="text-[var(--pillar-body)]">*</span></div>
          <select
            value={data.experienceLevel}
            onChange={e => update('experienceLevel', e.target.value)}
            className={`w-full ${selectStyle}`}
          >
            <option value="">Select...</option>
            {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <div className={labelStyle}>Systems Played</div>
          <SystemsSearch
            selected={data.systemsPlayed}
            onChange={(systems) => update('systemsPlayed', systems)}
          />
        </div>
      </div>

      {/* Section 3: Playstyle */}
      <div>
        <div className={sectionTitle}>Playstyle</div>
        <div className={labelStyle}>What do you enjoy most? <span className="text-[var(--pillar-body)]">*</span> <span className="text-white/20">(select all that apply)</span></div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {PLAYSTYLES.map(ps => (
            <label key={ps} className={checkboxLabel}>
              <input
                type="checkbox"
                checked={data.playstylePreferences.includes(ps)}
                onChange={() => toggleArray('playstylePreferences', ps)}
                className="accent-[var(--accent-teal)]"
              />
              {ps}
            </label>
          ))}
        </div>
        <div>
          <div className={labelStyle}>Anything else about your playstyle?</div>
          <textarea
            value={data.playstyleNotes}
            onChange={e => update('playstyleNotes', e.target.value)}
            placeholder="Optional — elaborate on what makes a session great for you..."
            className={`${inputStyle} resize-none`}
            rows={2}
          />
        </div>
      </div>

      {/* Section 4: Expectations & Dynamics */}
      <div>
        <div className={sectionTitle}>Expectations & Table Dynamics</div>
        <div className="space-y-3">
          <div>
            <div className={labelStyle}>What are you hoping to get out of this campaign? <span className="text-[var(--pillar-body)]">*</span></div>
            <textarea
              value={data.campaignHopes}
              onChange={e => update('campaignHopes', e.target.value)}
              placeholder="What draws you in? What would make this campaign memorable?"
              className={`${inputStyle} resize-none`}
              rows={3}
            />
          </div>
          <div>
            <div className={labelStyle}>How do you handle in-character conflict and PvP?</div>
            <select
              value={data.conflictStyle}
              onChange={e => update('conflictStyle', e.target.value)}
              className={`w-full ${selectStyle}`}
            >
              <option value="">Select...</option>
              <option value="Love it — bring the drama">Love it — bring the drama</option>
              <option value="Fine if everyone agrees beforehand">Fine if everyone agrees beforehand</option>
              <option value="Prefer to keep things cooperative">Prefer to keep things cooperative</option>
              <option value="Strongly prefer no PvP">Strongly prefer no PvP</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section 5: Safety */}
      <div>
        <div className={sectionTitle}>Safety & Boundaries</div>
        <div className={labelStyle}>Are there any themes or topics you would like to avoid? <span className="text-white/20">(confidential)</span></div>
        <textarea
          value={data.topicsToAvoid}
          onChange={e => update('topicsToAvoid', e.target.value)}
          placeholder="This stays between you and the Watcher. Leave blank if nothing comes to mind."
          className={`${inputStyle} resize-none`}
          rows={2}
        />
      </div>

      {/* Section 6: Availability */}
      <div>
        <div className={sectionTitle}>Availability</div>
        <div className="space-y-3">
          <div>
            <div className={labelStyle}>Available Days <span className="text-[var(--pillar-body)]">*</span></div>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleArray('availableDays', day)}
                  className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] border transition-colors ${
                    data.availableDays.includes(day)
                      ? 'border-[var(--accent-teal)] bg-[var(--accent-teal)]/20 text-[var(--accent-teal)]'
                      : 'border-white/10 text-white/30 hover:text-white/50 hover:border-white/20'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className={labelStyle}>Preferred Time <span className="text-[var(--pillar-body)]">*</span></div>
              <select
                value={data.preferredTime}
                onChange={e => update('preferredTime', e.target.value)}
                className={`w-full ${selectStyle}`}
              >
                <option value="">Select...</option>
                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div className={labelStyle}>Timezone <span className="text-[var(--pillar-body)]">*</span></div>
              <select
                value={data.timezone}
                onChange={e => update('timezone', e.target.value)}
                className={`w-full ${selectStyle}`}
              >
                <option value="">Select...</option>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className={labelStyle}>Session Length</div>
              <select
                value={data.sessionLength}
                onChange={e => update('sessionLength', e.target.value)}
                className={`w-full ${selectStyle}`}
              >
                <option value="">Select...</option>
                {SESSION_LENGTHS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div className={labelStyle}>Frequency <span className="text-[var(--pillar-body)]">*</span></div>
              <select
                value={data.frequency}
                onChange={e => update('frequency', e.target.value)}
                className={`w-full ${selectStyle}`}
              >
                <option value="">Select...</option>
                {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Section 7: Other */}
      <div>
        <div className={sectionTitle}>Anything Else</div>
        <div className="space-y-3">
          <div>
            <div className={labelStyle}>How did you hear about this campaign?</div>
            <input
              type="text"
              value={data.howHeard}
              onChange={e => update('howHeard', e.target.value)}
              placeholder="Friend, Discord, Reddit, etc."
              className={inputStyle}
            />
          </div>
          <div>
            <div className={labelStyle}>Anything else you want the Watcher to know?</div>
            <textarea
              value={data.anythingElse}
              onChange={e => update('anythingElse', e.target.value)}
              placeholder="Optional — anything that didn't fit above..."
              className={`${inputStyle} resize-none`}
              rows={3}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
