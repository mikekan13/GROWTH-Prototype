"use client";

import React, { useState, useEffect, useCallback } from 'react';
import type { PhysicalDescription } from '@/types/growth';

const HEIGHT_OPTIONS = ['', 'Short', 'Below Average', 'Average', 'Above Average', 'Tall', 'Very Tall'] as const;
const BUILD_OPTIONS = ['', 'Slight', 'Slim', 'Lean', 'Average', 'Athletic', 'Stocky', 'Muscular', 'Heavy', 'Large'] as const;
const FACE_SHAPE_OPTIONS = ['', 'Oval', 'Round', 'Square', 'Heart', 'Long', 'Diamond', 'Angular'] as const;
const EYE_SHAPE_OPTIONS = ['', 'Almond', 'Round', 'Hooded', 'Downturned', 'Upturned', 'Wide-set', 'Deep-set', 'Narrow'] as const;

interface CharacterDescData {
  physicalDescription: PhysicalDescription;
  backstory: string;
  characterName: string;
  desiredAge?: number;
}

interface CharacterTabProps {
  campaignId: string;
  userId?: string;
  userRole?: string;
  isGM: boolean;
  userCharacter?: { id: string; name: string; data: string } | null;
}

export default function CharacterTab({ campaignId, userId, userRole, isGM, userCharacter }: CharacterTabProps) {
  const [physicalDescription, setPhysicalDescription] = useState<PhysicalDescription>({});
  const [backstoryText, setBackstoryText] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [desiredAge, setDesiredAge] = useState<number>(25);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userCharacter?.data) {
      try {
        const parsed = JSON.parse(userCharacter.data);
        if (parsed.identity?.physicalDescription) setPhysicalDescription(parsed.identity.physicalDescription);
        if (parsed.backstory?.backstory) setBackstoryText(parsed.backstory.backstory);
        setCharacterName(parsed.identity?.name || userCharacter.name);
      } catch { /* ignore */ }
      setLoading(false);
    } else {
      fetch(`/api/campaigns/${campaignId}/members/me`)
        .then(r => r.json())
        .then(data => {
          if (data.member?.characterDesc) {
            try {
              const desc: CharacterDescData = JSON.parse(data.member.characterDesc);
              setPhysicalDescription(desc.physicalDescription || {});
              setBackstoryText(desc.backstory || '');
              setCharacterName(desc.characterName || '');
              if (desc.desiredAge) setDesiredAge(desc.desiredAge);
            } catch { /* ignore */ }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [userCharacter, campaignId]);

  const updateField = useCallback((field: keyof PhysicalDescription, value: string) => {
    setPhysicalDescription(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      if (userCharacter?.id) {
        const res = await fetch(`/api/characters/${userCharacter.id}`);
        if (!res.ok) throw new Error('Failed to load');
        const { character } = await res.json();
        const data = JSON.parse(character.data);
        data.identity = { ...data.identity, physicalDescription };
        data.backstory = { ...data.backstory, backstory: backstoryText };
        const updateRes = await fetch(`/api/characters/${userCharacter.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        });
        if (!updateRes.ok) throw new Error('Failed to save');
      } else {
        const res = await fetch(`/api/campaigns/${campaignId}/members/me`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterDesc: { physicalDescription, backstory: backstoryText, characterName, desiredAge },
          }),
        });
        if (!res.ok) throw new Error('Failed to save');
      }
      setDirty(false);
      setLastSaved(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [userCharacter?.id, campaignId, physicalDescription, backstoryText, characterName, desiredAge]);

  const pd = physicalDescription;
  const isEditable = !isGM;

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: '#0a0a1a' }}>
        <div className="text-[10px]" style={{ color: '#888', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ backgroundColor: '#0a0a1a' }}>
      <div className="max-w-4xl mx-auto p-6 space-y-5">

        {/* TOP ROW — Name centered */}
        <div className="text-center">
          {isEditable ? (
            <input
              type="text"
              value={characterName}
              onChange={e => { setCharacterName(e.target.value); setDirty(true); }}
              placeholder="Character Name"
              className="text-2xl p-1 text-center w-full max-w-md mx-auto block"
              style={{
                backgroundColor: 'transparent', color: '#ffcc78', border: 'none',
                borderBottom: '1px solid #582a72',
                fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                letterSpacing: '0.15em', outline: 'none',
              }}
            />
          ) : (
            <h2 className="text-2xl" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', color: '#ffcc78', letterSpacing: '0.15em' }}>
              {characterName || 'Unnamed'}
            </h2>
          )}
        </div>

        {/* PORTRAIT ROW — Bust + Full Body large, centered */}
        <div className="flex justify-center gap-4">
          <PortraitFrame label="Bust" initial={characterName ? characterName.charAt(0).toUpperCase() : '?'} portrait={null} />
          <PortraitFrame label="Full Body" initial={characterName ? characterName.charAt(0).toUpperCase() : '?'} portrait={null} />
        </div>

        {/* Age + Generate row */}
        <div className="flex justify-center gap-4 items-end">
          <div className="border p-3 flex-1 max-w-xs" style={{ borderColor: '#582a72', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] uppercase tracking-wider" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Desired Age at Campaign Start
              </span>
              <span className="text-sm" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
                {desiredAge}
              </span>
            </div>
            {isEditable && (
              <input type="range" min={10} max={200} value={desiredAge}
                onChange={e => { setDesiredAge(Number(e.target.value)); setDirty(true); }}
                className="w-full" style={{ accentColor: '#582a72' }} />
            )}
            <div className="text-[7px] mt-1" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Final age determined by root &amp; branches
            </div>
          </div>
          <button
            disabled
            className="px-6 py-3 text-[10px] uppercase tracking-[0.15em] h-fit"
            style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              backgroundColor: '#333', color: '#555',
              border: '1px solid #582a72', borderRadius: '2px', cursor: 'not-allowed',
            }}
            title="Portrait generation requires ComfyUI setup"
          >
            Generate Portrait
          </button>
        </div>

        {/* BOTTOM — Two columns: Physical Description | Backstory */}
        <div className="flex gap-5">

          {/* Physical Description */}
          <div className="w-1/2 border p-4" style={{ borderColor: '#582a72', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
            <div className="text-xs uppercase mb-3" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
              Physical Identity
            </div>
            <div className="text-[7px] mb-3" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Permanent physical traits. Equipment, wounds, and age changes are reflected dynamically.
            </div>
            <div className="space-y-3">
              {/* Body Frame */}
              <SectionLabel text="Body" />
              <div className="grid grid-cols-2 gap-2">
                <FieldSelect label="Height" value={pd.height} options={HEIGHT_OPTIONS} editable={isEditable} onChange={v => updateField('height', v)} />
                <FieldSelect label="Build" value={pd.build} options={BUILD_OPTIONS} editable={isEditable} onChange={v => updateField('build', v)} />
                <FieldInput label="Skin Tone" value={pd.skinTone} placeholder="olive, pale, deep brown" editable={isEditable} fullWidth onChange={v => updateField('skinTone', v)} />
              </div>

              {/* Face */}
              <SectionLabel text="Face" />
              <div className="grid grid-cols-2 gap-2">
                <FieldSelect label="Face Shape" value={pd.faceShape} options={FACE_SHAPE_OPTIONS} editable={isEditable} onChange={v => updateField('faceShape', v)} />
                <FieldSelect label="Eye Shape" value={pd.eyeShape} options={EYE_SHAPE_OPTIONS} editable={isEditable} onChange={v => updateField('eyeShape', v)} />
                <FieldInput label="Eye Color" value={pd.eyeColor} placeholder="green, hazel, amber" editable={isEditable} onChange={v => updateField('eyeColor', v)} />
                <FieldInput label="Facial Hair" value={pd.facialHair} placeholder="clean-shaven, full beard" editable={isEditable} onChange={v => updateField('facialHair', v)} />
              </div>

              {/* Hair */}
              <SectionLabel text="Hair" />
              <div className="grid grid-cols-2 gap-2">
                <FieldInput label="Hair Color" value={pd.hairColor} placeholder="black, auburn, silver" editable={isEditable} onChange={v => updateField('hairColor', v)} />
                <FieldInput label="Hair Style" value={pd.hairStyle} placeholder="long braided, cropped" editable={isEditable} onChange={v => updateField('hairStyle', v)} />
              </div>

              {/* Distinguishing Features */}
              <SectionLabel text="Distinguishing Features" />
              <FieldTextarea label="Permanent Marks" value={pd.distinguishingMarks} placeholder="Old scars, tattoos, birthmarks..." editable={isEditable} onChange={v => updateField('distinguishingMarks', v)} />
              <FieldTextarea label="Unique Physical Traits" value={pd.notableFeatures} placeholder="Horns, wings, tail, extra limbs, unusual eyes..." editable={isEditable} onChange={v => updateField('notableFeatures', v)} />
            </div>
          </div>

          {/* Backstory */}
          <div className="w-1/2 border p-4 flex flex-col" style={{ borderColor: '#582a72', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
            <div className="text-xs uppercase mb-2" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
              Backstory
            </div>
            <div className="text-[7px] mb-3" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              {isGM
                ? 'Player-submitted backstory. Use to inform seed, root, and branch creation.'
                : 'Your history, personality, motivations, fears. Your GM builds your mechanical character from this.'}
            </div>
            {isEditable ? (
              <textarea
                value={backstoryText}
                onChange={e => { setBackstoryText(e.target.value); setDirty(true); }}
                placeholder="Write your character's story here..."
                className="flex-1 w-full text-[11px] p-3 resize-none"
                style={{
                  backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px',
                  fontFamily: 'var(--font-terminal), Consolas, monospace', minHeight: '400px',
                }}
              />
            ) : (
              <div className="flex-1 text-[11px] p-3 whitespace-pre-wrap" style={{
                color: '#ccc', fontFamily: 'var(--font-terminal), Consolas, monospace',
                backgroundColor: '#2a2a3e', borderRadius: '2px', minHeight: '400px',
              }}>
                {backstoryText || <span style={{ color: '#555' }}>No backstory written yet.</span>}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {isEditable && (
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="px-6 py-2 text-xs uppercase tracking-wider transition-colors"
              style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                backgroundColor: dirty ? '#22ab94' : '#333',
                color: dirty ? '#000' : '#666',
                border: '1px solid rgba(34, 171, 148, 0.4)',
                borderRadius: '2px', cursor: dirty ? 'pointer' : 'default',
              }}
            >
              {saving ? 'Saving...' : dirty ? 'Save Draft' : 'Saved'}
            </button>
            <button
              onClick={() => { /* TODO: submit to GM */ }}
              disabled={!characterName || !backstoryText}
              className="px-6 py-2 text-xs uppercase tracking-wider transition-colors"
              style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                backgroundColor: characterName && backstoryText ? '#7050A8' : '#333',
                color: characterName && backstoryText ? '#fff' : '#555',
                border: '1px solid rgba(112, 80, 168, 0.4)',
                borderRadius: '2px', cursor: characterName && backstoryText ? 'pointer' : 'default',
              }}
            >
              Submit to GM
            </button>
            {lastSaved && !dirty && (
              <span className="text-[9px]" style={{ color: '#22ab94', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Last saved {lastSaved}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function PortraitFrame({ label, initial, portrait }: { label: string; initial: string; portrait: string | null }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-[8px] uppercase tracking-wider mb-1" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
        {label}
      </div>
      <div className="relative border overflow-hidden" style={{ borderColor: '#582a72', backgroundColor: '#111', width: '200px', height: '275px' }}>
        {portrait ? (
          <img src={portrait} alt={label} className="w-full h-full object-contain" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-5xl" style={{ color: '#582a72', opacity: 0.2 }}>{initial}</div>
            <div className="text-[8px] uppercase tracking-widest mt-2" style={{ color: '#582a72', opacity: 0.25, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Pending
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="text-[8px] uppercase tracking-[0.15em]" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{text}</div>
      <div className="flex-1 h-px" style={{ backgroundColor: '#D0A030', opacity: 0.15 }} />
    </div>
  );
}

function FieldSelect({ label, value, options, editable, onChange }: {
  label: string; value?: string; options: readonly string[]; editable: boolean; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[8px] uppercase block mb-0.5" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{label}</label>
      {editable ? (
        <select value={value || ''} onChange={e => onChange(e.target.value)} className="w-full text-[11px] p-1"
          style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}>
          {options.map(o => <option key={o} value={o}>{o || '\u2014'}</option>)}
        </select>
      ) : (
        <div className="text-[11px] p-1" style={{ color: '#ccc' }}>{value || '\u2014'}</div>
      )}
    </div>
  );
}

function FieldInput({ label, value, placeholder, editable, fullWidth, onChange }: {
  label: string; value?: string; placeholder: string; editable: boolean; fullWidth?: boolean; onChange: (v: string) => void;
}) {
  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <label className="text-[8px] uppercase block mb-0.5" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{label}</label>
      {editable ? (
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full text-[11px] p-1" style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }} />
      ) : (
        <div className="text-[11px] p-1" style={{ color: '#ccc' }}>{value || '\u2014'}</div>
      )}
    </div>
  );
}

function FieldTextarea({ label, value, placeholder, editable, onChange }: {
  label: string; value?: string; placeholder: string; editable: boolean; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[8px] uppercase block mb-0.5" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{label}</label>
      {editable ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2}
          className="w-full text-[11px] p-1 resize-none" style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }} />
      ) : (
        <div className="text-[11px] p-1 whitespace-pre-wrap" style={{ color: '#ccc' }}>{value || '\u2014'}</div>
      )}
    </div>
  );
}
