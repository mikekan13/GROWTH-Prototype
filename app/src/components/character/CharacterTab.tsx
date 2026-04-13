"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { PhysicalDescription, BodyPartDescription } from '@/types/growth';

const GENDER_OPTIONS = ['', 'Male', 'Female', 'Non-binary', 'Other'] as const;
const BUILD_OPTIONS = ['', 'Slight', 'Slim', 'Lean', 'Average', 'Athletic', 'Stocky', 'Muscular', 'Heavy', 'Large'] as const;
const HAIR_LENGTH_OPTIONS = ['', 'Bald', 'Buzzed', 'Short', 'Ear-length', 'Chin-length', 'Shoulder-length', 'Mid-back', 'Waist-length', 'Hip-length', 'Knee-length', 'Floor-length'] as const;
const HAIR_TEXTURE_OPTIONS = ['', 'Straight', 'Wavy', 'Curly', 'Coily', 'Kinky', 'Wiry', 'Fine', 'Thick'] as const;
const HYGIENE_OPTIONS = ['', 'Pristine', 'Well-kept', 'Average', 'Rugged', 'Rough', 'Unkempt', 'Feral'] as const;
const FACE_SHAPE_OPTIONS = ['', 'Oval', 'Round', 'Square', 'Heart', 'Long', 'Diamond', 'Angular'] as const;
const EYE_SHAPE_OPTIONS = ['', 'Almond', 'Round', 'Hooded', 'Downturned', 'Upturned', 'Wide-set', 'Deep-set', 'Narrow'] as const;

function inchesToDisplay(inches: number): string {
  const ft = Math.floor(inches / 12);
  const rem = inches % 12;
  return `${ft}'${rem}"`;
}

interface CharacterDescData {
  physicalDescription: PhysicalDescription;
  backstory: string;
  characterName: string;
  desiredAge?: number;
  selectedSeed?: string;
  referencePhotos?: string[];
  generatedBust?: string;
  generatedFullBody?: string;
}

interface CampaignSeedItem {
  id: string;
  name: string;
  data: {
    description?: string;
    baseFateDie?: string;
    frequency?: number;
    fatedAge?: number;
    baseResist?: number;
    seedKV?: number;
    nectars?: string[];
    thorns?: string[];
    bodyStructure?: { parts: string[]; vitals: string[] };
    heightRange?: { min: number; max: number };  // inches
    skinToneOptions?: string[];
  };
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
  const [selectedSeedName, setSelectedSeedName] = useState<string>('');
  const [campaignSeeds, setCampaignSeeds] = useState<CampaignSeedItem[]>([]);
  const [referencePhotos, setReferencePhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [describeError, setDescribeError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedBust, setGeneratedBust] = useState<string | null>(null);
  const [generatedFullBody, setGeneratedFullBody] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedSeed = useMemo(
    () => campaignSeeds.find(s => s.name === selectedSeedName),
    [selectedSeedName, campaignSeeds],
  );

  // Fetch seeds available in this campaign
  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/forge?type=seed&status=published`)
      .then(r => r.json())
      .then(res => {
        const seeds: CampaignSeedItem[] = (res.items || []).map((item: Record<string, unknown>) => ({
          id: item.id as string,
          name: item.name as string,
          data: (item.data || {}) as CampaignSeedItem['data'],
        }));
        setCampaignSeeds(seeds);
      })
      .catch(() => {});
  }, [campaignId]);

  useEffect(() => {
    if (userCharacter?.data) {
      try {
        const parsed = JSON.parse(userCharacter.data);
        if (parsed.identity?.physicalDescription) setPhysicalDescription(parsed.identity.physicalDescription);
        if (parsed.identity?.referencePhotos) setReferencePhotos(parsed.identity.referencePhotos);
        if (parsed.identity?.generatedBust) setGeneratedBust(parsed.identity.generatedBust);
        if (parsed.identity?.generatedFullBody) setGeneratedFullBody(parsed.identity.generatedFullBody);
        if (parsed.backstory?.backstory) setBackstoryText(parsed.backstory.backstory);
        if (parsed.creation?.seed?.name) setSelectedSeedName(parsed.creation.seed.name);
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
              if (desc.selectedSeed) setSelectedSeedName(desc.selectedSeed);
              if (desc.referencePhotos) setReferencePhotos(desc.referencePhotos);
              if (desc.generatedBust) setGeneratedBust(desc.generatedBust);
              if (desc.generatedFullBody) setGeneratedFullBody(desc.generatedFullBody);
            } catch { /* ignore */ }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [userCharacter, campaignId]);

  const updateField = useCallback((field: 'build' | 'skinTone' | 'gender', value: string) => {
    setPhysicalDescription(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  }, []);

  const updateHeight = useCallback((value: number) => {
    setPhysicalDescription(prev => ({ ...prev, height: value }));
    setDirty(true);
  }, []);

  const updateBodyPart = useCallback((part: string, field: keyof BodyPartDescription, value: string) => {
    setPhysicalDescription(prev => ({
      ...prev,
      bodyParts: {
        ...prev.bodyParts,
        [part]: { ...prev.bodyParts?.[part], [field]: value },
      },
    }));
    setDirty(true);
  }, []);

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/references', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Upload failed');
        return;
      }
      const { path: photoPath } = await res.json();
      setReferencePhotos(prev => [...prev, photoPath]);
      setDirty(true);
    } catch { alert('Upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  }, []);

  const handleRemovePhoto = useCallback(async (photoPath: string) => {
    await fetch(`/api/references?path=${encodeURIComponent(photoPath)}`, { method: 'DELETE' }).catch(() => {});
    setReferencePhotos(prev => prev.filter(p => p !== photoPath));
    setDirty(true);
  }, []);

  const handleDescribeFromPhotos = useCallback(async () => {
    if (referencePhotos.length === 0 || !selectedSeed) return;
    setDescribing(true);
    setDescribeError(null);
    try {
      const res = await fetch('/api/references/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePaths: referencePhotos, // Send all reference photos
          bodyParts: selectedSeed.data.bodyStructure?.parts || [],
          seedName: selectedSeed.name,
          campaignId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setDescribeError(err.error || 'Description generation failed');
        return;
      }
      const { descriptions } = await res.json();

      // Apply AI descriptions to physical description
      setPhysicalDescription(prev => {
        const updated = { ...prev };
        // Overall fields
        if (descriptions.overall) {
          if (descriptions.overall.gender) updated.gender = descriptions.overall.gender;
          if (descriptions.overall.build) updated.build = descriptions.overall.build;
          if (descriptions.overall.skinTone) updated.skinTone = descriptions.overall.skinTone;
        }
        // Body part fields
        const newBodyParts = { ...prev.bodyParts };
        for (const [part, data] of Object.entries(descriptions)) {
          if (part === 'overall') continue;
          const partData = data as Record<string, string>;
          newBodyParts[part] = { ...newBodyParts[part], ...partData };
        }
        updated.bodyParts = newBodyParts;
        return updated;
      });
      setDirty(true);
    } catch (e) { setDescribeError(e instanceof Error ? e.message : 'Description generation failed'); }
    finally { setDescribing(false); }
  }, [referencePhotos, selectedSeed]);

  const handleGenerate = useCallback(async () => {
    if (!selectedSeed) return;
    setGenerating(true);
    setGenerationError(null);

    const head = physicalDescription.bodyParts?.HEAD;
    const characterData = {
      characterId: userCharacter?.id || 'creation-preview',
      campaignId,
      identity: {
        name: characterName || 'Unnamed',
        age: desiredAge,
        sex: physicalDescription.gender,
        skinTone: physicalDescription.skinTone,
        hairColor: head?.hairColor,
        hairStyle: head?.hairStyle,
        eyeColor: head?.eyeColor,
        bodyType: physicalDescription.build
          ? `${physicalDescription.build}${physicalDescription.height ? `, ${Math.floor(physicalDescription.height / 12)}'${physicalDescription.height % 12}"` : ''}`
          : undefined,
        distinguishingFeatures: Object.entries(physicalDescription.bodyParts || {})
          .filter(([k, v]) => v.description && k !== 'HEAD')
          .map(([, v]) => v.description!),
      },
      seed: selectedSeed ? { name: selectedSeed.name, description: selectedSeed.data.description } : undefined,
      visibleEquipment: [],
      wounds: [],
      conditions: [],
      attributeDepletion: { overallDepletion: 'fresh' as const, bodyDepletion: 0, spiritDepletion: 0, soulDepletion: 0 },
      visualTraits: [],
    };

    try {
      // Generate bust first
      const bustRes = await fetch('/api/portraits/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterData,
          creationMode: true,
          referenceImagePath: referencePhotos[0] || undefined,
          overrides: { composition: 'bust' },
        }),
      });
      if (!bustRes.ok) {
        const err = await bustRes.json();
        throw new Error(err.error || 'Bust generation failed');
      }
      const bustData = await bustRes.json();
      setGeneratedBust(bustData.imagePath);
      const bustSeed = bustData.metadata.seed;

      // Generate full body with SAME seed for consistency
      const bodyRes = await fetch('/api/portraits/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterData,
          creationMode: true,
          referenceImagePath: referencePhotos[0] || undefined,
          overrides: { composition: 'full_body', seed: bustSeed },
        }),
      });
      if (!bodyRes.ok) {
        const err = await bodyRes.json();
        throw new Error(err.error || 'Full body generation failed');
      }
      const bodyData = await bodyRes.json();
      setGeneratedFullBody(bodyData.imagePath);

      // Persist portrait paths immediately
      const portraitData = { generatedBust: bustData.imagePath, generatedFullBody: bodyData.imagePath };
      if (userCharacter?.id) {
        const charRes = await fetch(`/api/characters/${userCharacter.id}`);
        if (charRes.ok) {
          const { character } = await charRes.json();
          const data = JSON.parse(character.data);
          data.identity = { ...data.identity, ...portraitData };
          await fetch(`/api/characters/${userCharacter.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
          });
        }
      } else {
        const memberRes = await fetch(`/api/campaigns/${campaignId}/members/me`);
        if (memberRes.ok) {
          const { member } = await memberRes.json();
          const desc = member?.characterDesc ? JSON.parse(member.characterDesc) : {};
          await fetch(`/api/campaigns/${campaignId}/members/me`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterDesc: { ...desc, ...portraitData } }),
          });
        }
      }
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [selectedSeed, physicalDescription, characterName, desiredAge, referencePhotos, campaignId, userCharacter?.id]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      if (userCharacter?.id) {
        const res = await fetch(`/api/characters/${userCharacter.id}`);
        if (!res.ok) throw new Error('Failed to load');
        const { character } = await res.json();
        const data = JSON.parse(character.data);
        data.identity = { ...data.identity, physicalDescription, referencePhotos, generatedBust, generatedFullBody };
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
            characterDesc: { physicalDescription, backstory: backstoryText, characterName, desiredAge, selectedSeed: selectedSeedName, referencePhotos, generatedBust, generatedFullBody },
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
  }, [userCharacter?.id, campaignId, physicalDescription, backstoryText, characterName, desiredAge, selectedSeedName, referencePhotos]);

  const pd = physicalDescription;
  const isEditable = !isGM;

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: '#0a0a1a' }}>
        <div className="text-sm" style={{ color: '#888', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Loading...</div>
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

        {/* SEED SELECTOR */}
        <div className="max-w-lg mx-auto">
          <label className="text-xs uppercase block mb-1 tracking-wider" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Seed
          </label>
          {isEditable ? (
            <div className="space-y-2">
              <select
                value={selectedSeedName}
                onChange={e => {
                  const newSeedName = e.target.value;
                  setSelectedSeedName(newSeedName);
                  const newSeed = campaignSeeds.find(s => s.name === newSeedName);
                  if (newSeed?.data.fatedAge && desiredAge > newSeed.data.fatedAge) {
                    setDesiredAge(newSeed.data.fatedAge);
                  }
                  setDirty(true);
                }}
                className="w-full text-sm p-2"
                style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}
              >
                <option value="">— Select a Seed —</option>
                {campaignSeeds.map(s => (
                  <option key={s.id} value={s.name}>
                    {s.name}{s.data.baseFateDie ? ` — ${s.data.baseFateDie}` : ''}{s.data.seedKV ? ` · KV ${s.data.seedKV}` : ''}
                  </option>
                ))}
              </select>
              {campaignSeeds.length === 0 && (
                <div className="text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  No seeds published in this campaign yet. Ask your GM to add seeds via the Forge.
                </div>
              )}
              {selectedSeed && (
                <div className="p-3 space-y-2" style={{ backgroundColor: '#1a1a2e', border: '1px solid #582a7240', borderRadius: '3px' }}>
                  {selectedSeed.data.description && (
                    <div className="text-sm" style={{ color: '#aaa', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      {selectedSeed.data.description}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                    {selectedSeed.data.baseResist != null && (
                      <span style={{ color: '#E8585A' }}>Resist {selectedSeed.data.baseResist}</span>
                    )}
                    {selectedSeed.data.frequency != null && (
                      <span style={{ color: '#8e7cc3' }}>Freq {selectedSeed.data.frequency}</span>
                    )}
                    {selectedSeed.data.fatedAge != null && (
                      <span style={{ color: '#D0A030' }}>Fated Age {selectedSeed.data.fatedAge}</span>
                    )}
                    {selectedSeed.data.nectars && selectedSeed.data.nectars.length > 0 && (
                      <span style={{ color: '#22ab94' }}>Nectars: {selectedSeed.data.nectars.join(', ')}</span>
                    )}
                    {selectedSeed.data.thorns && selectedSeed.data.thorns.length > 0 && (
                      <span style={{ color: '#E8585A' }}>Thorns: {selectedSeed.data.thorns.join(', ')}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm p-2" style={{ color: '#ccc', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              {selectedSeedName || '—'}
            </div>
          )}
        </div>

        {/* REFERENCE PHOTOS + PORTRAITS */}
        <div className="border p-4" style={{ borderColor: '#582a72', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-base uppercase" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
                Reference Photos
              </div>
              <div className="text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Upload photos to define your character's look. Used for auto-description and portrait identity.
              </div>
            </div>
            {isEditable && (
              <div className="flex gap-2">
                {referencePhotos.length > 0 && (
                  <button
                    onClick={handleDescribeFromPhotos}
                    disabled={describing || !selectedSeed}
                    className="px-4 py-2 text-xs uppercase tracking-wider transition-colors"
                    style={{
                      fontFamily: 'var(--font-terminal), Consolas, monospace',
                      backgroundColor: describing || !selectedSeed ? '#333' : '#7050A8',
                      color: describing || !selectedSeed ? '#666' : '#fff',
                      border: '1px solid rgba(112, 80, 168, 0.4)',
                      borderRadius: '2px', cursor: describing || !selectedSeed ? 'default' : 'pointer',
                    }}
                  >
                    {describing ? 'Analyzing...' : 'Auto Describe'}
                  </button>
                )}
                <label
                  className="px-4 py-2 text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  style={{
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                    backgroundColor: uploading ? '#333' : '#22ab94',
                    color: uploading ? '#666' : '#000',
                    border: '1px solid rgba(34, 171, 148, 0.4)',
                    borderRadius: '2px',
                  }}
                >
                  {uploading ? 'Uploading...' : '+ Upload'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
                </label>
              </div>
            )}
          </div>

          {describeError && (
            <div className="text-xs p-2 mt-2" style={{ color: '#E8585A', fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#1a0a0a', border: '1px solid #E8585A40', borderRadius: '3px', wordBreak: 'break-all' }}>
              {describeError}
            </div>
          )}

          {/* Reference photos row */}
          <div className="flex gap-3 flex-wrap">
            {referencePhotos.map((photo, i) => (
              <div key={photo} className="relative group">
                <div className="border overflow-hidden" style={{ borderColor: i === 0 ? '#D0A030' : '#582a72', borderWidth: i === 0 ? '2px' : '1px', borderRadius: '3px', width: '120px', height: '150px' }}>
                  <img src={photo} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" />
                </div>
                {i === 0 && (
                  <div className="absolute top-1 left-1 px-1.5 py-0.5" style={{
                    backgroundColor: '#D0A030', color: '#000', borderRadius: '2px',
                    fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px',
                  }}>PRIMARY</div>
                )}
                {isEditable && (
                  <button
                    onClick={() => handleRemovePhoto(photo)}
                    className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: '#E8585A', color: '#fff', borderRadius: '50%', fontSize: '11px', lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {isEditable && (
              <label className="border border-dashed flex flex-col items-center justify-center cursor-pointer hover:border-solid transition-colors" style={{ borderColor: '#582a72', borderRadius: '3px', width: '120px', height: '150px', backgroundColor: '#111' }}>
                <div className="text-2xl" style={{ color: '#582a72', opacity: 0.4 }}>+</div>
                <div className="text-xs mt-1" style={{ color: '#582a72', opacity: 0.4, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  Add Photo
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
              </label>
            )}
          </div>

          {/* Generated portraits row — separate from reference photos */}
          <div className="flex gap-4 justify-center mt-3 pt-3" style={{ borderTop: '1px solid #582a7230' }}>
            <PortraitFrame label="Bust" initial={characterName ? characterName.charAt(0).toUpperCase() : '?'} portrait={generatedBust} loading={generating} />
            <PortraitFrame label="Full Body" initial={characterName ? characterName.charAt(0).toUpperCase() : '?'} portrait={generatedFullBody} loading={generating && !!generatedBust} />
          </div>
        </div>

        {/* Age + Generate row */}
        <div className="flex justify-center gap-4 items-end">
          <div className="border p-3 flex-1 max-w-xs" style={{ borderColor: '#582a72', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs uppercase tracking-wider" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Desired Age at Campaign Start
              </span>
              <span className="text-lg" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
                {desiredAge}
              </span>
            </div>
            {isEditable && (
              <input type="range" min={10} max={selectedSeed?.data.fatedAge || 200} value={desiredAge}
                onChange={e => { setDesiredAge(Number(e.target.value)); setDirty(true); }}
                className="w-full" style={{ accentColor: '#582a72' }} />
            )}
            <div className="flex justify-between text-xs mt-1" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              <span>10</span>
              <span>Fated Age: {selectedSeed?.data.fatedAge || '—'}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <button
              onClick={handleGenerate}
              disabled={generating || !selectedSeed}
              className="px-6 py-3 text-xs uppercase tracking-[0.15em] h-fit transition-colors"
              style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                backgroundColor: generating ? '#333' : selectedSeed ? '#7050A8' : '#333',
                color: generating ? '#666' : selectedSeed ? '#fff' : '#555',
                border: '1px solid #582a72', borderRadius: '2px',
                cursor: generating || !selectedSeed ? 'default' : 'pointer',
              }}
            >
              {generating ? 'Generating...' : 'Generate Portrait'}
            </button>
            {generationError && (
              <div className="text-xs" style={{ color: '#E8585A', fontFamily: 'var(--font-terminal), Consolas, monospace', maxWidth: '200px' }}>
                {generationError}
              </div>
            )}
          </div>
        </div>

        {/* PHYSICAL IDENTITY — body-part-driven */}
        {selectedSeed ? (
          <div className="border p-4" style={{ borderColor: '#582a72', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
            <div className="text-base uppercase mb-3" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
              Physical Identity
            </div>
            <div className="text-xs mb-4" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Describe each part of your body. Equipment, wounds, and age are reflected dynamically.
            </div>

            {/* Overall body traits */}
            <SectionLabel text="Overall" />
            <div className="grid grid-cols-4 gap-2 mb-4">
              {/* Gender */}
              <FieldSelect label="Gender" value={pd.gender} options={GENDER_OPTIONS} editable={isEditable} onChange={v => updateField('gender', v)} />
              {/* Height — seed-constrained slider */}
              <div>
                <label className="text-xs uppercase block mb-0.5" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  Height
                </label>
                {isEditable && selectedSeed.data.heightRange ? (
                  <div>
                    <div className="text-sm mb-1" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
                      {pd.height != null && !isNaN(pd.height) ? inchesToDisplay(pd.height) : '—'}
                    </div>
                    <input
                      type="range"
                      min={selectedSeed.data.heightRange.min}
                      max={selectedSeed.data.heightRange.max}
                      value={pd.height || Math.round((selectedSeed.data.heightRange.min + selectedSeed.data.heightRange.max) / 2)}
                      onChange={e => updateHeight(Number(e.target.value))}
                      className="w-full" style={{ accentColor: '#582a72' }}
                    />
                    <div className="flex justify-between text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      <span>{inchesToDisplay(selectedSeed.data.heightRange.min)}</span>
                      <span>{inchesToDisplay(selectedSeed.data.heightRange.max)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm p-1" style={{ color: '#ccc' }}>{pd.height ? inchesToDisplay(pd.height) : '—'}</div>
                )}
              </div>

              {/* Build */}
              <FieldSelect label="Build" value={pd.build} options={BUILD_OPTIONS} editable={isEditable} onChange={v => updateField('build', v)} />

              {/* Skin Tone — seed-driven dropdown */}
              <div>
                <label className="text-xs uppercase block mb-0.5" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  Skin Tone
                </label>
                {isEditable && selectedSeed.data.skinToneOptions ? (
                  <select
                    value={pd.skinTone || ''}
                    onChange={e => updateField('skinTone', e.target.value)}
                    className="w-full text-sm p-1"
                    style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}
                  >
                    <option value="">—</option>
                    {selectedSeed.data.skinToneOptions.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm p-1" style={{ color: '#ccc' }}>{pd.skinTone || '—'}</div>
                )}
              </div>
            </div>

            {/* Body part sections from seed */}
            <div className="space-y-4">
              {(selectedSeed.data.bodyStructure?.parts || []).map(part => {
                const bpData = pd.bodyParts?.[part] || {};
                const isHead = part === 'HEAD';
                const isVital = selectedSeed.data.bodyStructure?.vitals?.includes(part);
                return (
                  <div key={part}>
                    <SectionLabel text={formatPartName(part)} vital={isVital} />
                    {isHead ? (
                      <div className="space-y-2 mt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <FieldSelect label="Face Shape" value={bpData.faceShape} options={FACE_SHAPE_OPTIONS} editable={isEditable} onChange={v => updateBodyPart(part, 'faceShape', v)} />
                          <FieldSelect label="Eye Shape" value={bpData.eyeShape} options={EYE_SHAPE_OPTIONS} editable={isEditable} onChange={v => updateBodyPart(part, 'eyeShape', v)} />
                          <FieldInput label="Eye Color" value={bpData.eyeColor} placeholder="green, hazel, amber" editable={isEditable} onChange={v => updateBodyPart(part, 'eyeColor', v)} />
                          <FieldInput label="Facial Hair" value={bpData.facialHair} placeholder="clean-shaven, full beard" editable={isEditable} onChange={v => updateBodyPart(part, 'facialHair', v)} />
                          <FieldInput label="Hair Color" value={bpData.hairColor} placeholder="black, auburn, silver" editable={isEditable} onChange={v => updateBodyPart(part, 'hairColor', v)} />
                          <FieldSelect label="Hair Length" value={bpData.hairLength} options={HAIR_LENGTH_OPTIONS} editable={isEditable} onChange={v => updateBodyPart(part, 'hairLength', v)} />
                          <FieldSelect label="Hair Texture" value={bpData.hairTexture} options={HAIR_TEXTURE_OPTIONS} editable={isEditable} onChange={v => updateBodyPart(part, 'hairTexture', v)} />
                          <FieldInput label="Usual Style" value={bpData.hairStyle} placeholder="braided, ponytail, loose, pinned up" editable={isEditable} onChange={v => updateBodyPart(part, 'hairStyle', v)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <FieldInput label="Cosmetics" value={bpData.cosmetics} placeholder="kohl eyeliner, war paint, none" editable={isEditable} onChange={v => updateBodyPart(part, 'cosmetics', v)} />
                          <FieldSelect label="Hygiene" value={bpData.hygiene} options={HYGIENE_OPTIONS} editable={isEditable} onChange={v => updateBodyPart(part, 'hygiene', v)} />
                        </div>
                        <FieldTextarea label="Other Details" value={bpData.description} placeholder="Scars on cheek, pointed ears, glowing runes on forehead..." editable={isEditable} onChange={v => updateBodyPart(part, 'description', v)} />
                      </div>
                    ) : (
                      <div className="mt-1">
                        <FieldTextarea
                          label="Description"
                          value={bpData.description}
                          placeholder={getPartPlaceholder(part)}
                          editable={isEditable}
                          onChange={v => updateBodyPart(part, 'description', v)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        ) : (
          <div className="border p-6 text-center" style={{ borderColor: '#582a7240', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
            <div className="text-sm" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Select a seed above to define your physical identity.
            </div>
          </div>
        )}

        {/* BACKSTORY */}
        <div className="border p-4 flex flex-col" style={{ borderColor: '#582a72', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
          <div className="text-base uppercase mb-2" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
            Backstory
          </div>
          <div className="text-xs mb-3" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            {isGM
              ? 'Player-submitted backstory. Use to inform seed, root, and branch creation.'
              : 'Your history, personality, motivations, fears. Your GM builds your mechanical character from this.'}
          </div>
          {isEditable ? (
            <textarea
              value={backstoryText}
              onChange={e => { setBackstoryText(e.target.value); setDirty(true); }}
              placeholder="Write your character's story here..."
              className="w-full text-sm p-3 resize-none"
              style={{
                backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px',
                fontFamily: 'var(--font-terminal), Consolas, monospace', minHeight: '250px',
              }}
            />
          ) : (
            <div className="text-sm p-3 whitespace-pre-wrap" style={{
              color: '#ccc', fontFamily: 'var(--font-terminal), Consolas, monospace',
              backgroundColor: '#2a2a3e', borderRadius: '2px', minHeight: '250px',
            }}>
              {backstoryText || <span style={{ color: '#555' }}>No backstory written yet.</span>}
            </div>
          )}
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
              <span className="text-xs" style={{ color: '#22ab94', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
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

function PortraitFrame({ label, initial, portrait, loading }: { label: string; initial: string; portrait: string | null; loading?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
        {label}
      </div>
      <div className="relative border overflow-hidden" style={{ borderColor: portrait ? '#D0A030' : '#582a72', backgroundColor: '#111', width: '200px', height: '275px' }}>
        {portrait ? (
          <img src={portrait} alt={label} className="w-full h-full object-cover" />
        ) : loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-sm animate-pulse" style={{ color: '#7050A8', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Generating...
            </div>
            <div className="mt-2 w-16 h-1 rounded overflow-hidden" style={{ backgroundColor: '#1a1a2e' }}>
              <div className="h-full animate-pulse" style={{ backgroundColor: '#7050A8', width: '60%' }} />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-5xl" style={{ color: '#582a72', opacity: 0.2 }}>{initial}</div>
            <div className="text-xs uppercase tracking-widest mt-2" style={{ color: '#582a72', opacity: 0.25, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Pending
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ text, vital }: { text: string; vital?: boolean }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="text-xs uppercase tracking-[0.15em]" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
        {text}
        {vital && <span style={{ color: '#E8585A', marginLeft: '6px', fontSize: '10px' }}>VITAL</span>}
      </div>
      <div className="flex-1 h-px" style={{ backgroundColor: '#D0A030', opacity: 0.15 }} />
    </div>
  );
}

const PART_NAMES: Record<string, string> = {
  HEAD: 'Head',
  TORSO: 'Torso',
  LEFT_UPPER_ARM: 'Left Upper Arm',
  LEFT_LOWER_ARM: 'Left Lower Arm',
  RIGHT_UPPER_ARM: 'Right Upper Arm',
  RIGHT_LOWER_ARM: 'Right Lower Arm',
  LEFT_UPPER_LEG: 'Left Upper Leg',
  LEFT_LOWER_LEG: 'Left Lower Leg',
  RIGHT_UPPER_LEG: 'Right Upper Leg',
  RIGHT_LOWER_LEG: 'Right Lower Leg',
};

function formatPartName(part: string): string {
  return PART_NAMES[part] || part.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function getPartPlaceholder(part: string): string {
  const placeholders: Record<string, string> = {
    TORSO: 'Broad chest, visible scars, tattoo across back...',
    LEFT_UPPER_ARM: 'Muscular, sleeve tattoo, burn scar...',
    RIGHT_UPPER_ARM: 'Lean, birthmark, armband tan line...',
    LEFT_LOWER_ARM: 'Thin wrists, bracelet marks, callused hands...',
    RIGHT_LOWER_ARM: 'Scarred knuckles, writing callus, strong grip...',
    LEFT_UPPER_LEG: 'Athletic thighs, old wound...',
    RIGHT_UPPER_LEG: 'Muscular, brand mark...',
    LEFT_LOWER_LEG: 'Shin scar, calf tattoo...',
    RIGHT_LOWER_LEG: 'Limp from old injury, calloused feet...',
  };
  return placeholders[part] || 'Describe this body part...';
}

function FieldSelect({ label, value, options, editable, onChange }: {
  label: string; value?: string; options: readonly string[]; editable: boolean; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs uppercase block mb-0.5" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{label}</label>
      {editable ? (
        <select value={value || ''} onChange={e => onChange(e.target.value)} className="w-full text-sm p-1"
          style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}>
          {options.map(o => <option key={o} value={o}>{o || '\u2014'}</option>)}
        </select>
      ) : (
        <div className="text-sm p-1" style={{ color: '#ccc' }}>{value || '\u2014'}</div>
      )}
    </div>
  );
}

function FieldInput({ label, value, placeholder, editable, fullWidth, onChange }: {
  label: string; value?: string; placeholder: string; editable: boolean; fullWidth?: boolean; onChange: (v: string) => void;
}) {
  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <label className="text-xs uppercase block mb-0.5" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{label}</label>
      {editable ? (
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full text-sm p-1" style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }} />
      ) : (
        <div className="text-sm p-1" style={{ color: '#ccc' }}>{value || '\u2014'}</div>
      )}
    </div>
  );
}

function FieldTextarea({ label, value, placeholder, editable, onChange }: {
  label: string; value?: string; placeholder: string; editable: boolean; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs uppercase block mb-0.5" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{label}</label>
      {editable ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2}
          className="w-full text-sm p-1 resize-none" style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }} />
      ) : (
        <div className="text-sm p-1 whitespace-pre-wrap" style={{ color: '#ccc' }}>{value || '\u2014'}</div>
      )}
    </div>
  );
}
