"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { PhysicalDescription, BodyPartDescription } from '@/types/growth';
import type { HeldItemData, GrowthWorldItem } from '@/types/item';
import { getConditionLabel, getConditionColor } from '@/types/item';
import { deriveRegions } from '@/lib/body-tree';
import { partTokenFromName } from '@/services/body-spawn';
import { safeJsonParse } from '@/lib/safe-json';
import IdentityLockWizard from './IdentityLockWizard';
import InventorySection from './InventorySection';
import Paperdoll from './Paperdoll';

// Body-part section re-enabled (Mike 2026-08-17 body-spawn ruling): it now
// reads the SPAWNED body-part items (character.bodyAnatomy) — per-part
// condition, material, coverage — falling back to the seed's bodyStructure
// template before mechanics land. Likeness stays in its own section.
// Inventory remains hidden from the creation-flow streamline (2026-08-07).
const SHOW_BODY_PARTS = true;
const SHOW_INVENTORY = false;

const GENDER_OPTIONS = ['', 'Male', 'Female', 'Non-binary', 'Other'] as const;
const BUILD_OPTIONS = [
  '', 'Petite', 'Slight', 'Slim', 'Slender', 'Lean', 'Wiry', 'Lithe',
  'Toned', 'Average', 'Athletic', 'Fit', 'Compact',
  'Curvy', 'Voluptuous', 'Full-figured', 'Shapely',
  'Broad', 'Stocky', 'Muscular', 'Brawny', 'Built',
  'Heavy', 'Large', 'Lanky', 'Willowy',
] as const;
const HAIR_LENGTH_OPTIONS = ['', 'Bald', 'Buzzed', 'Short', 'Ear-length', 'Chin-length', 'Shoulder-length', 'Mid-back', 'Waist-length', 'Hip-length', 'Knee-length', 'Floor-length'] as const;
const HAIR_TEXTURE_OPTIONS = ['', 'Straight', 'Wavy', 'Curly', 'Coily', 'Kinky', 'Wiry', 'Fine', 'Thick'] as const;
const HYGIENE_OPTIONS = ['', 'Pristine', 'Well-kept', 'Average', 'Rugged', 'Rough', 'Unkempt', 'Feral'] as const;
const FACE_SHAPE_OPTIONS = ['', 'Oval', 'Round', 'Square', 'Heart', 'Long', 'Diamond', 'Angular'] as const;
const EYE_SHAPE_OPTIONS = ['', 'Almond', 'Round', 'Hooded', 'Downturned', 'Upturned', 'Wide-set', 'Deep-set', 'Narrow'] as const;

const AESTHETIC_OPTIONS = [
  'Ornate',       // detailed embroidery, filigree, layered, decorative
  'Practical',    // clean lines, functional, well-maintained
  'Rugged',       // worn, patched, weathered, lived-in
  'Elegant',      // flowing, tailored, refined silhouettes
  'Minimal',      // simple, understated, unadorned
  'Wild',         // furs, bones, trophies, natural materials
  'Military',     // structured, uniform, insignias, sharp edges
  'Scholarly',    // robes, pouches, ink-stained, bookish
  'Noble',        // rich fabrics, crests, draped, regal
  'Street',       // layered, mismatched, improvised, urban
  'Ceremonial',   // ritual markings, symbolic, formal
  'Artisan',      // tools, aprons, craft materials, handmade
  'Nomadic',      // travel-worn, layered for weather, practical packs
  'Mystic',       // flowing, symbolic, ethereal, otherworldly
  'Mercenary',    // mixed armor, trophies, utilitarian
  'Courtly',      // refined, political, subtle displays of wealth
  'Tribal',       // cultural markings, natural dyes, clan symbols
  'Anarchic',     // defiant, punk, modified, unconventional
  'Maritime',     // seafaring, weathered leather, rope, naval
  'Monastic',     // austere, simple wraps, humble, disciplined
  'Gothic',       // dark, dramatic, angular, heavy fabrics
  'Theatrical',   // bold, expressive, costume-like, attention-seeking
  'Pastoral',     // earthy, homespun, agricultural, warm
  'Ascetic',      // bare minimum, self-denial, spiritual
  'Industrial',   // metal, rivets, soot-stained, mechanical
  'Diplomatic',   // neutral tones, non-threatening, polished
  'Predatory',    // sleek, dark, form-fitting, intimidating
  'Festive',      // colorful, celebratory, adorned, joyful
  'Ancient',      // archaic, wrapped linens, bronze, classical
  'Biomantic',    // living materials, grown not made, organic
] as const;

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
  styleColors?: { primary: string; secondary: string; tertiary: string };
  styleAesthetics?: string[];
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
  userCharacter?: { id: string; name: string; data: string; entityType?: string } | null;
  // Explicit override for edit permissions. When set to true, forces editable mode
  // regardless of isGM/entityType gating. Used by Tapestry where GM always owns the
  // entity they're editing — bypasses the entityType round-trip from the API.
  canEdit?: boolean;
  // When set, this CharacterTab loads the specified character INSTEAD of userCharacter.
  // Used by in-canvas selection: clicking an entity in Tapestry > Entities switches
  // the active tab to 'character' and passes the entity id here so we never have to
  // navigate away to /character/[id]. Falls back to userCharacter if fetch fails.
  selectedCharacterId?: string | null;
}

export default function CharacterTab({ campaignId, isGM, userCharacter, canEdit, selectedCharacterId }: CharacterTabProps) {
  const [overrideCharacter, setOverrideCharacter] = useState<{ id: string; name: string; data: string; entityType?: string } | null>(null);
  const [physicalDescription, setPhysicalDescription] = useState<PhysicalDescription>({});
  const [backstoryText, setBackstoryText] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [desiredAge, setDesiredAge] = useState<number>(25);
  const [styleColors, setStyleColors] = useState<{ primary: string; secondary: string; tertiary: string }>({ primary: '#582a72', secondary: '#D0A030', tertiary: '#22ab94' });
  const [styleAesthetics, setStyleAesthetics] = useState<string[]>([]);
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set(['HEAD']));
  const [selectedSeedName, setSelectedSeedName] = useState<string>('');
  const [submittingGenesis, setSubmittingGenesis] = useState(false);
  const [genesisMsg, setGenesisMsg] = useState('');
  const [campaignSeeds, setCampaignSeeds] = useState<CampaignSeedItem[]>([]);
  const [referencePhotos, setReferencePhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [describeError, setDescribeError] = useState<string | null>(null);
  const [generating] = useState(false); // Kept for PortraitFrame loading; wizard handles its own state
  const [generatedBust, setGeneratedBust] = useState<string | null>(null);
  const [generatedFullBody, setGeneratedFullBody] = useState<string | null>(null);
  const [generationError, _setGenerationError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [heldItems, setHeldItems] = useState<HeldItemData[]>([]);
  // Spawned body-part item tree (character.bodyAnatomy) — mechanical paperdoll source.
  const [bodyAnatomy, setBodyAnatomy] = useState<GrowthWorldItem | null>(null);
  // T28 — member-stage backstory submission (player → Watcher approval signal).
  const [backstorySubmitted, setBackstorySubmitted] = useState(false);
  const [submittingBackstory, setSubmittingBackstory] = useState(false);

  const selectedSeed = useMemo(
    () => campaignSeeds.find(s => s.name === selectedSeedName),
    [selectedSeedName, campaignSeeds],
  );

  // Flattened regions of the spawned body-part tree (null before mechanics land).
  const bodyRegions = useMemo(
    () => (bodyAnatomy?.isBodyPart ? deriveRegions(bodyAnatomy) : null),
    [bodyAnatomy],
  );

  // The character we actually render — selectedCharacterId override beats the
  // user's own PC. Lets the GM (or any user) view an arbitrary character in this
  // tab without navigating away.
  const effectiveCharacter = overrideCharacter ?? userCharacter ?? null;

  // Fetch the override character whenever selectedCharacterId changes.
  // On failure, leave overrideCharacter null and fall back to userCharacter.
  useEffect(() => {
    if (!selectedCharacterId) {
      setOverrideCharacter(null);
      return;
    }
    if (overrideCharacter?.id === selectedCharacterId) return;
    let cancelled = false;
    fetch(`/api/characters/${selectedCharacterId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(({ character }) => {
        if (cancelled || !character) return;
        // Normalize: API returns `data` either as object or string. CharacterTab's
        // hydration code expects a string (it JSON.parses).
        const dataStr = typeof character.data === 'string' ? character.data : JSON.stringify(character.data ?? {});
        setOverrideCharacter({
          id: character.id,
          name: character.name,
          data: dataStr,
          entityType: character.entityType,
        });
        // Force re-hydration of local state by clearing the hydrated marker.
        hydratedIdRef.current = null;
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[CharacterTab] failed to load selected character', selectedCharacterId, err);
        setOverrideCharacter(null);
      });
    return () => { cancelled = true; };
  }, [selectedCharacterId, overrideCharacter?.id]);

  // Fetch this character's held items (live from CampaignItem rows).
  useEffect(() => {
    const charId = effectiveCharacter?.id;
    if (!campaignId || !charId) {
      setHeldItems([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/campaigns/${campaignId}/items`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(({ items }) => {
        if (cancelled || !Array.isArray(items)) return;
        const owned: HeldItemData[] = items
          .filter((it: { holderId?: string | null }) => it.holderId === charId)
          .map((it: { id: string; name: string; type: string; status: string; data: string }) => {
            const parsed: unknown = safeJsonParse<unknown>(it.data, {}, 'heldItem.data');
            return {
              id: it.id,
              name: it.name,
              type: it.type as HeldItemData['type'],
              status: it.status,
              data: parsed as HeldItemData['data'],
            };
          });
        setHeldItems(owned);
      })
      .catch(() => {
        if (!cancelled) setHeldItems([]);
      });
    return () => { cancelled = true; };
  }, [campaignId, effectiveCharacter?.id]);

  // Fetch seeds available in this campaign
  useEffect(() => {
    if (!campaignId) {
      setCampaignSeeds([]);
      return;
    }
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

  // Hydrate local state from persisted character data ONCE per character id.
  // Previously this ran on every parent re-render (deps were [userCharacter, campaignId]),
  // so any parent update that gave us a new userCharacter object reference — even with
  // identical content — wiped in-flight local edits like just-uploaded reference photos.
  const hydratedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const charId = effectiveCharacter?.id ?? null;
    if (hydratedIdRef.current === charId) return; // already hydrated for this character
    hydratedIdRef.current = charId;

    setBodyAnatomy(null); // reset — repopulated below when this character has a spawned body

    if (effectiveCharacter?.data) {
      try {
        const parsed = JSON.parse(effectiveCharacter.data);
        if (parsed.identity?.physicalDescription) setPhysicalDescription(parsed.identity.physicalDescription);
        if (parsed.bodyAnatomy?.isBodyPart) setBodyAnatomy(parsed.bodyAnatomy as GrowthWorldItem);
        if (parsed.identity?.referencePhotos) setReferencePhotos(parsed.identity.referencePhotos);
        if (parsed.identity?.generatedBust) setGeneratedBust(parsed.identity.generatedBust);
        if (parsed.identity?.generatedFullBody) setGeneratedFullBody(parsed.identity.generatedFullBody);
        if (parsed.identity?.styleColors) setStyleColors(parsed.identity.styleColors);
        if (parsed.identity?.styleAesthetics) setStyleAesthetics(parsed.identity.styleAesthetics);
        if (parsed.backstory?.backstory) setBackstoryText(parsed.backstory.backstory);
        if (parsed.creation?.seed?.name) setSelectedSeedName(parsed.creation.seed.name);
        setCharacterName(parsed.identity?.name || effectiveCharacter.name);
      } catch { /* ignore */ }
      setLoading(false);
    } else {
      fetch(`/api/campaigns/${campaignId}/members/me`)
        .then(r => r.json())
        .then(data => {
          if (data.member) {
            setBackstorySubmitted(!!data.member.backstorySubmitted);
          }
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
              if (desc.styleColors) setStyleColors(desc.styleColors);
              if (desc.styleAesthetics) setStyleAesthetics(desc.styleAesthetics);
            } catch { /* ignore */ }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [effectiveCharacter, campaignId]);

  const updateField = useCallback((field: 'build' | 'skinTone' | 'gender' | 'underclothing' | 'measurements', value: string) => {
    setPhysicalDescription(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  }, []);

  // Genome-first staging (Mike ruling 2026-08-08): the creator is STORY-
  // FIRST — physical-look sections stay hidden until JEWL's gestation has
  // produced the genome. Stage comes from /api/characters/[id]/genome;
  // polled while a genesis session is working.
  const [genomeInfo, setGenomeInfo] = useState<{
    stage: 'story' | 'gestating' | 'ready';
    session?: { status: string; cycleCount: number; blockedReason?: string | null; lastNote?: string | null } | null;
    genome?: { memoryCount: number; identityNarrative?: string | null; voiceNotes?: string | null; introspection?: number } | null;
  } | null>(null);

  const fetchGenome = useCallback(async () => {
    if (!effectiveCharacter?.id) { setGenomeInfo(null); return; }
    try {
      const res = await fetch(`/api/characters/${effectiveCharacter.id}/genome`);
      if (res.ok) setGenomeInfo(await res.json());
    } catch { /* strip keeps last known state */ }
  }, [effectiveCharacter?.id]);

  useEffect(() => { fetchGenome(); }, [fetchGenome]);
  useEffect(() => {
    if (genomeInfo?.stage !== 'gestating') return;
    const timer = setInterval(fetchGenome, 6000);
    return () => clearInterval(timer);
  }, [genomeInfo?.stage, fetchGenome]);

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
    console.log('[refUpload] picked', { name: file.name, type: file.type, size: file.size });
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/references', { method: 'POST', body: formData });
      const bodyText = await res.text();
      if (!res.ok) {
        console.error('[refUpload] server rejected', res.status, bodyText);
        let parsed: Record<string, unknown> | null = null;
        try { parsed = JSON.parse(bodyText); } catch { /* leave as null */ }
        alert(`Upload failed (HTTP ${res.status})\n${parsed?.error || bodyText.slice(0, 400)}`);
        return;
      }
      const { path: photoPath } = JSON.parse(bodyText) as { path: string };
      console.log('[refUpload] stored at', photoPath);
      setReferencePhotos(prev => [...prev, photoPath]);
      setDirty(true);
    } catch (err) {
      console.error('[refUpload] network/client error', err);
      alert(`Upload failed (client error): ${err instanceof Error ? err.message : String(err)}`);
    }
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
          if (part === 'overall' || part === 'style') continue;
          const partData = data as Record<string, string>;
          newBodyParts[part] = { ...newBodyParts[part], ...partData };
        }
        updated.bodyParts = newBodyParts;
        return updated;
      });
      // Apply style preferences
      if (descriptions.style) {
        const s = descriptions.style as Record<string, unknown>;
        if (s.primaryColor || s.secondaryColor || s.tertiaryColor) {
          setStyleColors(prev => ({
            primary: (s.primaryColor as string) || prev.primary,
            secondary: (s.secondaryColor as string) || prev.secondary,
            tertiary: (s.tertiaryColor as string) || prev.tertiary,
          }));
        }
        if (Array.isArray(s.aesthetics) && s.aesthetics.length > 0) {
          setStyleAesthetics(s.aesthetics.slice(0, 2) as string[]);
        }
      }
      setDirty(true);
    } catch (e) { setDescribeError(e instanceof Error ? e.message : 'Description generation failed'); }
    finally { setDescribing(false); }
  }, [referencePhotos, selectedSeed]);

  const buildCharacterData = useCallback(() => {
    const head = physicalDescription.bodyParts?.HEAD;
    return {
      characterId: effectiveCharacter?.id || 'creation-preview',
      campaignId,
      backstory: backstoryText,
      identity: {
        name: characterName || 'Unnamed',
        age: desiredAge,
        sex: physicalDescription.gender,
        skinTone: physicalDescription.skinTone,
        underclothing: physicalDescription.underclothing,
        measurements: physicalDescription.measurements,
        hairColor: head?.hairColor,
        hairLength: head?.hairLength,
        hairTexture: head?.hairTexture,
        hairStyle: head?.hairStyle,
        eyeColor: head?.eyeColor,
        facialHair: head?.facialHair,
        styleColors,
        styleAesthetics,
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
  }, [physicalDescription, characterName, desiredAge, selectedSeed, campaignId, effectiveCharacter?.id]);

  const handleWizardComplete = useCallback(async (bust: string, fullBody: string) => {
    setGeneratedBust(bust);
    setGeneratedFullBody(fullBody);
    setWizardOpen(false);

    // Persist portrait paths
    const portraitData = { generatedBust: bust, generatedFullBody: fullBody };
    try {
      if (effectiveCharacter?.id) {
        const charRes = await fetch(`/api/characters/${effectiveCharacter.id}`);
        if (charRes.ok) {
          const { character } = await charRes.json();
          const data = JSON.parse(character.data);
          data.identity = { ...data.identity, ...portraitData };
          await fetch(`/api/characters/${effectiveCharacter.id}`, {
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
      console.error('Failed to persist portraits:', err);
    }
  }, [effectiveCharacter?.id, campaignId]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      if (effectiveCharacter?.id) {
        const res = await fetch(`/api/characters/${effectiveCharacter.id}`);
        if (!res.ok) throw new Error('Failed to load');
        const { character } = await res.json();
        const data = typeof character.data === 'string' ? JSON.parse(character.data) : character.data;
        data.identity = { ...data.identity, name: characterName, physicalDescription, referencePhotos, generatedBust, generatedFullBody, styleColors, styleAesthetics };
        data.backstory = { ...data.backstory, backstory: backstoryText };
        data.creation = { ...data.creation, seed: selectedSeed ? { name: selectedSeed.name } : data.creation?.seed };
        // Include top-level `name` so the Character row's name field updates too
        // (shown in entity list, used for display in canvas nodes, etc.).
        const updateRes = await fetch(`/api/characters/${effectiveCharacter.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, name: characterName || data.identity?.name || 'Unnamed' }),
        });
        if (!updateRes.ok) throw new Error('Failed to save');
      } else {
        const res = await fetch(`/api/campaigns/${campaignId}/members/me`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterDesc: { physicalDescription, backstory: backstoryText, characterName, desiredAge, selectedSeed: selectedSeedName, referencePhotos, generatedBust, generatedFullBody, styleColors, styleAesthetics },
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
  }, [effectiveCharacter?.id, campaignId, physicalDescription, backstoryText, characterName, desiredAge, selectedSeedName, selectedSeed, referencePhotos, styleColors, styleAesthetics, generatedBust, generatedFullBody]);

  const pd = physicalDescription;
  // canEdit prop = explicit override (Tapestry GM-editor path passes true).
  // Otherwise: player editing own PC editable; GM viewing player's PC read-only;
  // GM editing non-PC entity editable.
  const isEditable = canEdit === true
    || !isGM
    || (effectiveCharacter?.entityType != null && effectiveCharacter.entityType !== 'PLAYER_CHARACTER');

  // Genesis: hand the genome (backstory + appearance) to JEWL, who opens a
  // gestation work session (expansion → ledger → catalog-first mechanics).
  const submitToJewl = async () => {
    if (!effectiveCharacter?.id || !backstoryText.trim() || submittingGenesis) return;
    setSubmittingGenesis(true);
    setGenesisMsg('');
    try {
      if (dirty) await save();
      const res = await fetch(`/api/characters/${effectiveCharacter.id}/genesis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backstory: backstoryText,
          characterName,
          desiredAge,
          selectedSeed: selectedSeedName || undefined,
          physicalDescription,
          referencePhotos,
          styleColors,
          styleAesthetics,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Genesis submission failed');
      setGenesisMsg(data.alreadyRunning
        ? 'Genesis already in progress — JEWL is on it.'
        : 'Submitted — JEWL has opened a genesis session and is working.');
      fetchGenome();
    } catch (err) {
      setGenesisMsg(err instanceof Error ? err.message : 'Genesis submission failed');
    } finally {
      setSubmittingGenesis(false);
    }
  };

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
                backgroundColor: 'transparent', color: 'var(--krma-gold)', border: 'none',
                borderBottom: '1px solid var(--pillar-spirit)',
                fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                letterSpacing: '0.15em', outline: 'none',
              }}
            />
          ) : (
            <h2 className="text-2xl" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', color: 'var(--krma-gold)', letterSpacing: '0.15em' }}>
              {characterName || 'Unnamed'}
            </h2>
          )}
        </div>

        {/* GENOME PIPELINE STATUS — story → gestation → ready */}
        {effectiveCharacter?.id && (
          <div className="border p-3" style={{ borderColor: 'var(--pillar-spirit)', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              {(['story', 'gestating', 'ready'] as const).map((s, i) => (
                <span key={s} className="flex items-center gap-2">
                  {i > 0 && <span style={{ color: '#555' }}>→</span>}
                  <span style={{ color: (genomeInfo?.stage ?? 'story') === s ? 'var(--krma-gold)' : '#555' }}>
                    {s === 'story' ? 'sTORY' : s === 'gestating' ? 'gESTATION' : 'gENOME rEADY'}
                  </span>
                </span>
              ))}
              {genomeInfo?.stage === 'gestating' && genomeInfo.session && (
                <span className="ml-2" style={{ color: 'var(--terminal-prime)' }}>
                  ⚒ cycle {genomeInfo.session.cycleCount}
                  {genomeInfo.session.status === 'blocked' ? ` — blocked: ${genomeInfo.session.blockedReason ?? 'awaiting GM'}` : ''}
                  {genomeInfo.session.lastNote ? ` — ${genomeInfo.session.lastNote.slice(0, 90)}` : ''}
                </span>
              )}
              {(genomeInfo?.stage ?? 'story') === 'story' && (
                <span className="ml-2 normal-case" style={{ color: '#8e7cc3' }}>write the story below — everything else grows from it</span>
              )}
            </div>
          </div>
        )}

        {/* GENOME — the gestated dossier, viewable once ready */}
        {genomeInfo?.stage === 'ready' && genomeInfo.genome && (
          <div className="border p-4" style={{ borderColor: 'var(--krma-gold)', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
            <div className="text-base uppercase mb-1" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
              Genome
            </div>
            <div className="text-xs mb-3" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              {genomeInfo.genome.memoryCount} seeded memories · introspection {typeof genomeInfo.genome.introspection === 'number' ? genomeInfo.genome.introspection.toFixed(2) : '—'}
            </div>
            {genomeInfo.genome.identityNarrative ? (
              <div className="text-sm whitespace-pre-wrap overflow-y-auto p-3" style={{ maxHeight: 320, color: '#ccc', backgroundColor: '#2a2a3e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                {genomeInfo.genome.identityNarrative}
              </div>
            ) : (
              <div className="text-sm" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Memory ledger seeded — narrative dossier pending.
              </div>
            )}
            {genomeInfo.genome.voiceNotes && (
              <div className="text-xs mt-2 whitespace-pre-wrap" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                VOICE: {genomeInfo.genome.voiceNotes}
              </div>
            )}
          </div>
        )}

        {/* Post-genome only: seed, photos, physical identity, portraits.
            Pre-genome the creator is STORY-FIRST (ruling 2026-08-08) —
            the player writes, submits to the GM, the GM sends to JEWL,
            and the physical-look tooling unlocks when gestation completes. */}
        {genomeInfo?.stage === 'ready' && (<>
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
                style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid var(--pillar-spirit)', borderRadius: '2px', colorScheme: 'dark' }}
              >
                <option value="" style={{ backgroundColor: '#2a2a3e', color: '#ccc' }}>— Select a Seed —</option>
                {campaignSeeds.map(s => (
                  <option key={s.id} value={s.name} style={{ backgroundColor: '#2a2a3e', color: '#ccc' }}>
                    {s.name}{s.data.baseFateDie ? ` — ${s.data.baseFateDie}` : ''}{s.data.seedKV ? ` · KV ${s.data.seedKV}` : ''}
                  </option>
                ))}
              </select>
              {campaignSeeds.length === 0 && (
                <div className="text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  {campaignId
                    ? 'No seeds published in this campaign yet. Ask your Watcher to add seeds via the Forge.'
                    : 'This entity is not scoped to a campaign — seeds are campaign-scoped, so none are available here.'}
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
                      <span style={{ color: 'var(--terminal-prime)' }}>Nectars: {selectedSeed.data.nectars.join(', ')}</span>
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

        {/* ── SECTION: Reference Photos ── */}
        <div className="border p-4" style={{ borderColor: 'var(--pillar-spirit)', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-base uppercase" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
                Reference Photos
              </div>
              <div className="text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Upload photos of your character inspiration. Used for face identity and auto-description.
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
                      backgroundColor: describing || !selectedSeed ? '#333' : 'var(--pillar-spirit)',
                      color: describing || !selectedSeed ? '#666' : '#fff',
                      border: '1px solid rgba(88, 42, 114, 0.4)',
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
                    backgroundColor: uploading ? '#333' : 'var(--terminal-prime)',
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

          <div className="flex gap-3 flex-wrap">
            {referencePhotos.map((photo, i) => (
              <div key={photo} className="relative group">
                <div className="border overflow-hidden" style={{ borderColor: i === 0 ? '#D0A030' : 'var(--pillar-spirit)', borderWidth: i === 0 ? '2px' : '1px', borderRadius: '3px', width: '100px', height: '125px' }}>
                  <img src={photo} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" />
                </div>
                {i === 0 && (
                  <div className="absolute top-1 left-1 px-1 py-0.5" style={{
                    backgroundColor: '#D0A030', color: '#000', borderRadius: '2px',
                    fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '8px',
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
            {isEditable && referencePhotos.length === 0 && (
              <label className="border border-dashed flex flex-col items-center justify-center cursor-pointer hover:border-solid transition-colors" style={{ borderColor: 'var(--pillar-spirit)', borderRadius: '3px', width: '100px', height: '125px', backgroundColor: '#111' }}>
                <div className="text-2xl" style={{ color: '#8e7cc3', opacity: 0.4 }}>+</div>
                <div className="text-xs mt-1" style={{ color: '#8e7cc3', opacity: 0.4, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  Add Photo
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
              </label>
            )}
            {isEditable && referencePhotos.length > 0 && (
              <label className="border border-dashed flex items-center justify-center cursor-pointer hover:border-solid transition-colors" style={{ borderColor: 'var(--pillar-spirit)', borderRadius: '3px', width: '50px', height: '125px', backgroundColor: '#111' }}>
                <div className="text-xl" style={{ color: '#8e7cc3', opacity: 0.4 }}>+</div>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
              </label>
            )}
          </div>
        </div>

        {/* PHYSICAL IDENTITY — body-part-driven */}
        {selectedSeed ? (
          <div className="border p-4" style={{ borderColor: 'var(--pillar-spirit)', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
            <div className="text-base uppercase mb-3" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
              Physical Identity
            </div>
            <div className="text-xs mb-4" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Describe each part of your body. Equipment, wounds, and age are reflected dynamically.
            </div>

            {/* Overall body traits */}
            <SectionLabel text="Overall" />
            <div className="grid grid-cols-5 gap-2 mb-4">
              {/* Gender */}
              <FieldSelect label="Gender" value={pd.gender} options={GENDER_OPTIONS} editable={isEditable} onChange={v => updateField('gender', v)} />
              {/* Age */}
              <div>
                <label className="text-xs uppercase block mb-0.5" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  Age
                </label>
                {isEditable ? (
                  <div>
                    <div className="text-sm mb-1" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
                      {desiredAge}
                    </div>
                    <input type="range" min={10} max={selectedSeed?.data.fatedAge || 200} value={desiredAge}
                      onChange={e => { setDesiredAge(Number(e.target.value)); setDirty(true); }}
                      className="w-full" style={{ accentColor: 'var(--pillar-spirit)' }} />
                    <div className="flex justify-between text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }}>
                      <span>10</span>
                      <span>Fated: {selectedSeed?.data.fatedAge || '—'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm p-1" style={{ color: '#ccc' }}>{desiredAge}</div>
                )}
              </div>
              {/* Height — seed-constrained slider */}
              <div>
                <label className="text-xs uppercase block mb-0.5" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  Height
                </label>
                {isEditable && selectedSeed.data.heightRange ? (
                  <div>
                    <div className="text-sm mb-1" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
                      {pd.height != null && !isNaN(pd.height) ? inchesToDisplay(pd.height) : '—'}
                    </div>
                    <input
                      type="range"
                      min={selectedSeed.data.heightRange.min}
                      max={selectedSeed.data.heightRange.max}
                      value={pd.height || Math.round((selectedSeed.data.heightRange.min + selectedSeed.data.heightRange.max) / 2)}
                      onChange={e => updateHeight(Number(e.target.value))}
                      className="w-full" style={{ accentColor: 'var(--pillar-spirit)' }}
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
                    style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid var(--pillar-spirit)', borderRadius: '2px' }}
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

            {/* Likeness — STAYS as its own section (Mike 2026-08-17: likeness
                fields keep their current home even with the body-part system
                back on). Same data path: writes to bodyParts.HEAD; the HEAD
                row below shows mechanical state only, no duplicate fields. */}
            {(() => {
              const head = pd.bodyParts?.HEAD || {};
              return (
                <div className="mb-4">
                  <SectionLabel text="Likeness" />
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    <FieldSelect label="Face Shape" value={head.faceShape} options={FACE_SHAPE_OPTIONS} editable={isEditable} onChange={v => updateBodyPart('HEAD', 'faceShape', v)} />
                    <FieldInput label="Facial Hair" value={head.facialHair} placeholder="clean-shaven, full beard" editable={isEditable} onChange={v => updateBodyPart('HEAD', 'facialHair', v)} />
                    <FieldSelect label="Eye Shape" value={head.eyeShape} options={EYE_SHAPE_OPTIONS} editable={isEditable} onChange={v => updateBodyPart('HEAD', 'eyeShape', v)} />
                    <FieldInput label="Eye Color" value={head.eyeColor} placeholder="green, hazel, amber" editable={isEditable} onChange={v => updateBodyPart('HEAD', 'eyeColor', v)} />
                    <FieldInput label="Hair Color" value={head.hairColor} placeholder="black, auburn, silver" editable={isEditable} onChange={v => updateBodyPart('HEAD', 'hairColor', v)} />
                    <FieldSelect label="Hair Length" value={head.hairLength} options={HAIR_LENGTH_OPTIONS} editable={isEditable} onChange={v => updateBodyPart('HEAD', 'hairLength', v)} />
                    <FieldInput label="Hair Texture" value={head.hairTexture} placeholder="thick wavy, fine straight, curly" editable={isEditable} onChange={v => updateBodyPart('HEAD', 'hairTexture', v)} />
                    <FieldInput label="Hair Style" value={head.hairStyle} placeholder="braided, ponytail, loose, pinned up" editable={isEditable} onChange={v => updateBodyPart('HEAD', 'hairStyle', v)} />
                    <FieldInput label="Underclothing" value={pd.underclothing} placeholder="plain modern cotton, linen shift, seamless synthweave" editable={isEditable} onChange={v => updateField('underclothing', v)} />
                    <FieldInput label="Measurements" value={pd.measurements} placeholder={'bust 36" / waist 27" / hips 38"'} editable={isEditable} onChange={v => updateField('measurements', v)} />
                  </div>
                  <FieldTextarea label="Distinguishing Features" value={head.description} placeholder="Scars, pointed ears, piercings, birthmarks, glowing runes..." editable={isEditable} onChange={v => updateBodyPart('HEAD', 'description', v)} />
                </div>
              );
            })()}

            {/* Body parts — the SPAWNED body-part items (character.bodyAnatomy):
                per-part condition, material, resist, and what covers it. Falls
                back to the seed's bodyStructure template (description authoring
                only) until mechanics-assembly spawns the real body. */}
            <div className="space-y-1">
              {SHOW_BODY_PARTS && bodyRegions && bodyRegions.map(region => {
                const token = partTokenFromName(region.partName);
                const bpData = pd.bodyParts?.[token] || {};
                const isHead = token === 'HEAD';
                const isExpanded = expandedParts.has(token);
                const coveredBy = heldItems.filter(
                  h => (h.data as GrowthWorldItem & { equippedTo?: string })?.equippedTo === region.key,
                );
                const togglePart = () => setExpandedParts(prev => {
                  const next = new Set(prev);
                  if (next.has(token)) next.delete(token); else next.add(token);
                  return next;
                });
                return (
                  <div key={region.key} style={{ marginLeft: `${region.depth * 12}px` }}>
                    <button onClick={togglePart} className="w-full flex items-center justify-between py-1.5 px-2 transition-colors"
                      style={{ backgroundColor: isExpanded ? '#1a1a2e' : 'transparent', borderRadius: '2px' }}>
                      <div className="flex items-center gap-2">
                        <span style={{ color: '#8e7cc3', fontSize: '10px' }}>{isExpanded ? '▾' : '▸'}</span>
                        <span className="text-xs uppercase tracking-wider" style={{
                          color: region.isVital ? '#E8585A' : '#8e7cc3',
                          fontFamily: 'var(--font-terminal), Consolas, monospace',
                        }}>
                          {region.partName}{region.isVital ? ' ●' : ''}
                        </span>
                        <span className="text-xs uppercase" style={{
                          color: getConditionColor(region.condition),
                          fontFamily: 'var(--font-terminal), Consolas, monospace',
                          fontSize: '9px',
                        }}>
                          {getConditionLabel(region.condition)}
                        </span>
                      </div>
                      <span className="text-xs truncate max-w-[260px]" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }}>
                        {[
                          region.primaryMaterial ? `${region.primaryMaterial}${region.materialClass ? ` (${region.materialClass})` : ''}` : null,
                          `Resist ${region.baseResist}`,
                          coveredBy.length ? `Covered: ${coveredBy.map(c => c.name).join(', ')}` : 'Uncovered',
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="pl-4 pb-2 mt-1 space-y-2">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                          <span><span style={{ color: '#8e7cc3' }}>CONDITION </span><span style={{ color: getConditionColor(region.condition) }}>{getConditionLabel(region.condition)} ({region.condition}/4)</span></span>
                          <span><span style={{ color: '#8e7cc3' }}>MATERIAL </span><span style={{ color: '#ccc' }}>{region.primaryMaterial || '—'}{region.materialClass ? ` / ${region.materialClass}` : ''}</span></span>
                          <span><span style={{ color: '#8e7cc3' }}>RESIST </span><span style={{ color: '#22ab94' }}>{region.baseResist}</span></span>
                          <span><span style={{ color: '#8e7cc3' }}>COVERED BY </span><span style={{ color: coveredBy.length ? '#ccc' : '#555' }}>{coveredBy.length ? coveredBy.map(c => c.name).join(', ') : 'nothing'}</span></span>
                        </div>
                        {isHead ? (
                          <div className="text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                            Likeness fields live in the Likeness section above.
                          </div>
                        ) : (
                          <FieldTextarea
                            label="Description"
                            value={bpData.description}
                            placeholder={getPartPlaceholder(token)}
                            editable={isEditable}
                            onChange={v => updateBodyPart(token, 'description', v)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {(SHOW_BODY_PARTS && !bodyRegions ? (selectedSeed.data.bodyStructure?.parts || []) : []).map(part => {
                const bpData = pd.bodyParts?.[part] || {};
                const isHead = part === 'HEAD';
                const isVital = selectedSeed.data.bodyStructure?.vitals?.includes(part);
                const isExpanded = expandedParts.has(part);
                const hasContent = isHead ? !!(bpData.eyeColor || bpData.hairColor || bpData.description) : !!bpData.description;
                const togglePart = () => setExpandedParts(prev => {
                  const next = new Set(prev);
                  if (next.has(part)) next.delete(part); else next.add(part);
                  return next;
                });

                return (
                  <div key={part}>
                    <button onClick={togglePart} className="w-full flex items-center justify-between py-1.5 px-2 transition-colors"
                      style={{ backgroundColor: isExpanded ? '#1a1a2e' : 'transparent', borderRadius: '2px' }}>
                      <div className="flex items-center gap-2">
                        <span style={{ color: '#8e7cc3', fontSize: '10px' }}>{isExpanded ? '▾' : '▸'}</span>
                        <span className="text-xs uppercase tracking-wider" style={{
                          color: isVital ? '#E8585A' : '#8e7cc3',
                          fontFamily: 'var(--font-terminal), Consolas, monospace',
                        }}>
                          {formatPartName(part)}{isVital ? ' ●' : ''}
                        </span>
                      </div>
                      {!isExpanded && hasContent && (
                        <span className="text-xs truncate max-w-[200px]" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                          {isHead ? [bpData.eyeColor, bpData.hairColor, bpData.faceShape].filter(Boolean).join(', ') : (bpData.description || '').substring(0, 40)}
                        </span>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="pl-4 pb-2">
                        {isHead ? (
                          // Likeness fields keep their own section above (Mike
                          // 2026-08-17) — no duplicate HEAD inputs here.
                          <div className="mt-1 text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                            Likeness fields live in the Likeness section above.
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

        {/* ── SECTION: Style Preferences ── */}
        <div className="border p-4" style={{ borderColor: 'var(--pillar-spirit)', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
          <div className="text-base uppercase mb-1" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
            Style Preferences
          </div>
          <div className="text-xs mb-3" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Your character&apos;s visual style. Colors and aesthetic shape how equipment and clothing appear.
          </div>

          {/* Colors */}
          <div className="flex gap-4 mb-4 items-end">
            {(['primary', 'secondary', 'tertiary'] as const).map(key => (
              <div key={key} className="flex flex-col items-center">
                <label className="text-xs uppercase mb-1" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  {key}
                </label>
                {isEditable ? (
                  <input
                    type="color"
                    value={styleColors[key]}
                    onChange={e => { setStyleColors(prev => ({ ...prev, [key]: e.target.value })); setDirty(true); }}
                    className="w-10 h-10 cursor-pointer border-0 p-0"
                    style={{ backgroundColor: 'transparent' }}
                  />
                ) : (
                  <div className="w-10 h-10 border" style={{ backgroundColor: styleColors[key], borderColor: 'var(--pillar-spirit)', borderRadius: '2px' }} />
                )}
                <div className="text-xs mt-0.5" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }}>
                  {styleColors[key]}
                </div>
              </div>
            ))}
          </div>

          {/* Aesthetics — pick up to 2 */}
          <div>
            <label className="text-xs uppercase block mb-1" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Aesthetic (choose up to 2)
            </label>
            <div className="flex flex-wrap gap-1">
              {AESTHETIC_OPTIONS.map(a => {
                const selected = styleAesthetics.includes(a);
                return (
                  <button
                    key={a}
                    onClick={() => {
                      if (!isEditable) return;
                      if (selected) {
                        setStyleAesthetics(prev => prev.filter(x => x !== a));
                      } else if (styleAesthetics.length < 2) {
                        setStyleAesthetics(prev => [...prev, a]);
                      }
                      setDirty(true);
                    }}
                    className="px-2 py-1 text-xs transition-colors"
                    style={{
                      fontFamily: 'var(--font-terminal), Consolas, monospace',
                      backgroundColor: selected ? 'var(--pillar-spirit)' : '#111',
                      color: selected ? 'var(--krma-gold)' : '#666',
                      border: `1px solid ${selected ? 'var(--pillar-spirit)' : '#2a2a3e'}`,
                      borderRadius: '2px',
                      cursor: isEditable ? 'pointer' : 'default',
                      opacity: !selected && styleAesthetics.length >= 2 ? 0.3 : 1,
                    }}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
            {styleAesthetics.length > 0 && (
              <div className="text-xs mt-2" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Style: <span style={{ color: 'var(--krma-gold)' }}>{styleAesthetics.join(' + ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION: Visual Identity ── */}
        <div className="border p-4" style={{ borderColor: 'var(--pillar-spirit)', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-base uppercase" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
                Visual Identity
              </div>
              <div className="text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Lock your character&apos;s appearance. This defines how they look across all portraits, tokens, and 3D renders.
              </div>
            </div>
            {!wizardOpen && isEditable && (
              <button
                onClick={() => setWizardOpen(true)}
                disabled={!selectedSeed}
                className="px-5 py-2 text-xs uppercase tracking-[0.12em] transition-colors"
                style={{
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  backgroundColor: selectedSeed ? 'var(--pillar-spirit)' : '#333',
                  color: selectedSeed ? '#fff' : '#555',
                  border: '1px solid var(--pillar-spirit)', borderRadius: '2px',
                  cursor: !selectedSeed ? 'default' : 'pointer',
                }}
              >
                {generatedBust ? 'Relock Identity' : 'Lock Identity'}
              </button>
            )}
          </div>

          {wizardOpen ? (
            <IdentityLockWizard
              characterData={buildCharacterData()}
              campaignId={campaignId}
              referencePhotos={referencePhotos}
              characterId={effectiveCharacter?.id}
              onComplete={handleWizardComplete}
              onCancel={() => setWizardOpen(false)}
            />
          ) : (
            <div className="flex gap-4 justify-center">
              {/* Dynamic Portrait — changes with equipment, wounds, mood */}
              <PortraitFrame label="Portrait" portrait={generatedBust} loading={generating} />
              {/* Battle Token — for maps and combat */}
              <PortraitFrame label="Token" portrait={generatedFullBody} loading={generating && !!generatedBust} />
              {/* 3D View — future: rotatable 3D model */}
              <div className="flex flex-col items-center">
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  3D View
                </div>
                <div className="relative border overflow-hidden flex items-center justify-center" style={{ borderColor: '#2a2a3e', backgroundColor: '#111', width: '200px', height: '275px' }}>
                  <div className="text-center">
                    <div className="text-3xl mb-2" style={{ color: '#8e7cc3', opacity: 0.2 }}>&#9649;</div>
                    <div className="text-xs uppercase tracking-widest" style={{ color: '#8e7cc3', opacity: 0.25, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      Coming Soon
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {generationError && (
            <div className="text-xs mt-2" style={{ color: '#E8585A', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              {generationError}
            </div>
          )}
        </div>

        {/* INVENTORY */}
        {SHOW_INVENTORY && (
        <div className="border p-4" style={{ borderColor: 'var(--pillar-spirit)', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-base uppercase" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
                Inventory
              </div>
              <div className="text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                {effectiveCharacter
                  ? 'Items held by this character. Drag items from the canvas onto this character to add; remove on the canvas card.'
                  : 'Inventory will appear once a character record exists.'}
              </div>
            </div>
          </div>
          <div style={{ color: '#ccc' }}>
            {effectiveCharacter?.id
              ? <Paperdoll characterId={effectiveCharacter.id} canEdit={canEdit ?? false} />
              : <InventorySection items={heldItems} />
            }
          </div>
        </div>
        )}

        </>)}

        {/* BACKSTORY */}
        <div className="border p-4 flex flex-col" style={{ borderColor: 'var(--pillar-spirit)', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
          <div className="text-base uppercase mb-2" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
            Backstory
          </div>
          <div className="text-xs mb-3" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            {isGM
              ? 'Trailblazer-submitted backstory. Use to inform seed, root, and branch creation.'
              : 'Your history, personality, motivations, fears. Your Watcher builds your mechanical character from this.'}
          </div>
          {isEditable ? (
            <textarea
              value={backstoryText}
              onChange={e => { setBackstoryText(e.target.value); setDirty(true); }}
              placeholder="Write your character's story here..."
              className="w-full text-sm p-3 resize-none"
              style={{
                backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid var(--pillar-spirit)', borderRadius: '2px',
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
                backgroundColor: dirty ? 'var(--terminal-prime)' : '#333',
                color: dirty ? '#000' : '#666',
                border: '1px solid rgba(34, 171, 148, 0.4)',
                borderRadius: '2px', cursor: dirty ? 'pointer' : 'default',
              }}
            >
              {saving ? 'Saving...' : dirty ? 'Save Draft' : 'Saved'}
            </button>
            {isGM && effectiveCharacter?.id && (
              <button
                onClick={submitToJewl}
                disabled={submittingGenesis || !backstoryText.trim()}
                className="px-6 py-2 text-xs uppercase tracking-wider transition-colors"
                style={{
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  backgroundColor: backstoryText.trim() && !submittingGenesis ? 'var(--krma-gold)' : '#333',
                  color: backstoryText.trim() && !submittingGenesis ? '#000' : '#666',
                  border: '1px solid rgba(255, 204, 120, 0.5)',
                  borderRadius: '2px',
                  cursor: backstoryText.trim() && !submittingGenesis ? 'pointer' : 'default',
                }}
                title="Hand the genome (backstory + appearance) to JEWL — he gestates the full person, then builds the mechanics catalog-first."
              >
                {submittingGenesis ? 'Submitting…' : '◆ Submit to JEWL'}
              </button>
            )}
            {genesisMsg && (
              <span className="text-xs" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                {genesisMsg}
              </span>
            )}
            <button
              onClick={async () => {
                if (!characterName || !backstoryText || submittingBackstory) return;
                // Save current draft first so the Watcher sees the latest.
                await save();
                if (effectiveCharacter?.id) {
                  // Existing character: transition its status to SUBMITTED.
                  try {
                    await fetch(`/api/characters/${effectiveCharacter.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'SUBMITTED' }),
                    });
                    setBackstorySubmitted(true);
                  } catch (err) {
                    console.error('Submit failed:', err);
                  }
                  return;
                }
                // Member-stage (no character yet): signal the Watcher that the
                // backstory is ready for approval (T28). The GM builds the sheet
                // WITH the player after approving — the player never self-advances.
                setSubmittingBackstory(true);
                try {
                  const res = await fetch(`/api/campaigns/${campaignId}/members/me`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ submit: true }),
                  });
                  if (res.ok) {
                    setBackstorySubmitted(true);
                  } else {
                    const d = await res.json().catch(() => ({}));
                    alert(d.error || 'Failed to submit to your Watcher.');
                  }
                } finally {
                  setSubmittingBackstory(false);
                }
              }}
              disabled={!characterName || !backstoryText || submittingBackstory}
              className="px-6 py-2 text-xs uppercase tracking-wider transition-colors"
              style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                backgroundColor: characterName && backstoryText ? 'var(--pillar-spirit)' : '#333',
                color: characterName && backstoryText ? '#fff' : '#555',
                border: '1px solid rgba(88, 42, 114, 0.4)',
                borderRadius: '2px', cursor: characterName && backstoryText && !submittingBackstory ? 'pointer' : 'default',
              }}
            >
              {submittingBackstory ? 'Submitting...' : backstorySubmitted ? 'Re-submit to Watcher' : 'Submit to Watcher'}
            </button>
            {lastSaved && !dirty && (
              <span className="text-xs" style={{ color: 'var(--terminal-prime)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Last saved {lastSaved}
              </span>
            )}
          </div>
        )}
        {isEditable && !effectiveCharacter?.id && backstorySubmitted && (
          <div className="text-xs mt-2" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Submitted to your Watcher for approval. Keep refining your portrait and identity while you wait — your Watcher will build your character with you once approved.
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function PortraitFrame({ label, portrait, loading }: { label: string; portrait: string | null; loading?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
        {label}
      </div>
      <div className="relative border overflow-hidden" style={{ borderColor: portrait ? '#D0A030' : 'var(--pillar-spirit)', backgroundColor: '#111', width: '200px', height: '275px' }}>
        {portrait ? (
          <img src={portrait} alt={label} className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).src = '/EmptyPortrait.png'; (e.target as HTMLImageElement).className = 'w-full h-full object-contain'; }} />
        ) : loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-sm animate-pulse" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Generating...
            </div>
            <div className="mt-2 w-16 h-1 rounded overflow-hidden" style={{ backgroundColor: '#1a1a2e' }}>
              <div className="h-full animate-pulse" style={{ backgroundColor: 'var(--pillar-spirit)', width: '60%' }} />
            </div>
          </div>
        ) : (
          <img src="/EmptyPortrait.png" alt={`${label} — not yet generated`} className="w-full h-full object-contain" />
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
          style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid var(--pillar-spirit)', borderRadius: '2px' }}>
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
          className="w-full text-sm p-1" style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid var(--pillar-spirit)', borderRadius: '2px' }} />
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
          className="w-full text-sm p-1 resize-none" style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid var(--pillar-spirit)', borderRadius: '2px' }} />
      ) : (
        <div className="text-sm p-1 whitespace-pre-wrap" style={{ color: '#ccc' }}>{value || '\u2014'}</div>
      )}
    </div>
  );
}
