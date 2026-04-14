'use client';

import { useState } from 'react';
import type { GrowthMagic, MagicSchool, GrowthSpell, WovenSpell } from '@/types/growth';
import { MAGIC_SCHOOLS, getSkillDie } from '@/types/growth';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';

const PILLAR_STYLES = {
  mercy: {
    label: 'Mercy',
    subtitle: 'Flow-Based',
    color: '#3EB89A',
    bg: 'rgba(62, 184, 154, 0.08)',
    borderColor: '#3EB89A',
    desc: 'Receiving, acceptance, healing',
    icon: '\u2661',
  },
  severity: {
    label: 'Severity',
    subtitle: 'Focus-Based',
    color: '#E8585A',
    bg: 'rgba(232, 88, 90, 0.08)',
    borderColor: '#E8585A',
    desc: 'Giving, manifestation, destruction',
    icon: '\u2694',
  },
  balance: {
    label: 'Balance',
    subtitle: 'Flow + Focus',
    color: '#7050A8',
    bg: 'rgba(112, 80, 168, 0.08)',
    borderColor: '#7050A8',
    desc: 'Harmony of opposing forces',
    icon: '\u2696',
  },
} as const;

const SCHOOL_ICONS: Partial<Record<MagicSchool, string>> = {
  Fortune: '\u2618',
  Restoration: '\u2720',
  Enchantment: '\u2764',
  Force: '\u26A1',
  Alteration: '\u2699',
  Conjuration: '\u2726',
  Divination: '\u2609',
  Dissolution: '\u2620',
  Abjuration: '\u2721',
  Illusion: '\u25C8',
};

function SpellCard({ spell, pillarColor }: { spell: GrowthSpell; pillarColor: string }) {
  const schoolMeta = MAGIC_SCHOOLS[spell.school];

  return (
    <ComplexTooltip
      title={`${SCHOOL_ICONS[spell.school] || '\u2728'} ${spell.name}`}
      baseValue={spell.cost}
      modifiers={[
        { name: `School: ${spell.school}`, value: 0, source: {
          name: spell.school,
          type: `${schoolMeta.pillar} school`,
          description: schoolMeta.description,
          stats: {
            'Governing': schoolMeta.governingAttribute,
            'Prima Materia': schoolMeta.primaMateria,
            ...(schoolMeta.resistedBy ? { 'Resisted By': schoolMeta.resistedBy } : {}),
          },
        }},
        ...(spell.strength ? [{ name: `Strength: ${spell.strength}/10`, value: spell.strength }] : []),
        ...(spell.castingMethod ? [{ name: `Method: ${spell.castingMethod === 'weaving' ? 'Spell Weaving (Skilled)' : 'Wild Casting (Raw)'}`, value: 0 }] : []),
      ]}
      totalValue={spell.cost || 0}
    >
      <div className="py-1.5 px-2 text-sm cursor-help transition-colors hover:bg-[var(--surface-dark)]/5"
        style={{ borderLeft: `3px solid ${pillarColor}` }}>
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-1.5">
            <span style={{ color: pillarColor }}>{SCHOOL_ICONS[spell.school] || '\u2728'}</span>
            <span className="font-bold">{spell.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {spell.strength && (
              <span className="text-[10px]" style={{ color: 'var(--surface-dark)', opacity: 0.4 }}>
                Str {spell.strength}
              </span>
            )}
            {spell.cost !== undefined && (
              <span className="px-1 text-[10px]" style={{
                backgroundColor: 'var(--surface-dark)',
                color: 'var(--accent-teal)',
                fontFamily: 'var(--font-terminal)',
              }}>
                {spell.cost} mana
              </span>
            )}
          </div>
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--surface-dark)', opacity: 0.6 }}>
          {spell.description}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: pillarColor, opacity: 0.6 }}>
          {spell.school}
          {spell.castingMethod && ` \u2022 ${spell.castingMethod === 'weaving' ? 'Woven' : 'Wild'}`}
        </div>
      </div>
    </ComplexTooltip>
  );
}

function WovenSpellCard({ spell }: { spell: WovenSpell }) {
  return (
    <ComplexTooltip
      title={`\u2728 ${spell.name} (Woven)`}
      baseValue={spell.cost}
      modifiers={spell.schools.map(school => ({
        name: school,
        value: 0,
        source: {
          name: school,
          type: `${MAGIC_SCHOOLS[school].pillar} school`,
          description: MAGIC_SCHOOLS[school].description,
          stats: {
            'Governing': MAGIC_SCHOOLS[school].governingAttribute,
            'Prima Materia': MAGIC_SCHOOLS[school].primaMateria,
          },
        },
      }))}
      totalValue={spell.cost || 0}
    >
      <div className="py-1.5 px-2 text-sm cursor-help transition-colors hover:bg-[var(--surface-dark)]/5"
        style={{
          borderLeft: '3px solid var(--krma-gold)',
          background: 'linear-gradient(90deg, rgba(255, 204, 120, 0.06) 0%, transparent 100%)',
        }}>
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-1.5">
            <span style={{ color: 'var(--krma-gold)' }}>{'\u2728'}</span>
            <span className="font-bold">{spell.name}</span>
          </div>
          {spell.cost !== undefined && (
            <span className="px-1 text-[10px]" style={{
              backgroundColor: 'var(--surface-dark)',
              color: 'var(--krma-gold)',
              fontFamily: 'var(--font-terminal)',
            }}>
              {spell.cost} mana
            </span>
          )}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--surface-dark)', opacity: 0.6 }}>
          {spell.description}
        </div>
        <div className="flex items-center gap-1 mt-1">
          {spell.schools.map((school, i) => (
            <span key={i} className="px-1 text-[9px]" style={{
              backgroundColor: PILLAR_STYLES[MAGIC_SCHOOLS[school].pillar].color,
              color: 'white',
              fontFamily: 'var(--font-header)',
              letterSpacing: '0.03em',
            }}>
              {school}
            </span>
          ))}
        </div>
        {spell.components && (
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--accent-amber)', fontStyle: 'italic' }}>
            Requires: {spell.components}
          </div>
        )}
      </div>
    </ComplexTooltip>
  );
}

function SchoolBadge({ school, skillLevel }: { school: MagicSchool; skillLevel?: number }) {
  const meta = MAGIC_SCHOOLS[school];
  const pillar = PILLAR_STYLES[meta.pillar];

  return (
    <ComplexTooltip
      title={`${SCHOOL_ICONS[school] || '\u2728'} ${school}`}
      modifiers={[
        { name: meta.description, value: 0 },
        { name: `Governing: ${meta.governingAttribute}`, value: 0 },
        { name: `Prima Materia: ${meta.primaMateria}`, value: 0 },
        ...(meta.resistedBy ? [{ name: `Resisted by: ${meta.resistedBy}`, value: 0 }] : []),
        ...(skillLevel ? [{ name: `Skill Level: ${skillLevel} (${getSkillDie(skillLevel)})`, value: skillLevel }] : []),
      ]}
      totalValue={skillLevel || 0}
    >
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] cursor-help transition-colors"
        style={{
          backgroundColor: `${pillar.color}15`,
          border: `1px solid ${pillar.color}40`,
          color: pillar.color,
          fontFamily: 'var(--font-terminal)',
        }}>
        <span>{SCHOOL_ICONS[school] || '\u2728'}</span>
        <span>{school}</span>
        {skillLevel !== undefined && skillLevel > 0 && (
          <span style={{ color: 'var(--accent-gold)' }}>Lv{skillLevel}</span>
        )}
      </div>
    </ComplexTooltip>
  );
}

export default function MagicSection({ magic }: { magic: GrowthMagic }) {
  const [expandedPillar, setExpandedPillar] = useState<'mercy' | 'severity' | 'balance' | 'all'>('all');

  const hasAnyMagic = magic.mercy.knownSpells.length > 0
    || magic.severity.knownSpells.length > 0
    || magic.balance.knownSpells.length > 0
    || (magic.mercy.schools.length > 0 || magic.severity.schools.length > 0 || magic.balance.schools.length > 0);

  if (!hasAnyMagic && !magic.wovenSpells?.length) return null;

  const totalSpells = magic.mercy.knownSpells.length + magic.severity.knownSpells.length + magic.balance.knownSpells.length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="section-badge inline-block text-sm">Magic</div>
        <span className="text-[10px]" style={{ color: 'var(--surface-dark)', opacity: 0.4 }}>
          {totalSpells} spells{magic.wovenSpells?.length ? ` | ${magic.wovenSpells.length} woven` : ''}
        </span>
        {magic.mana && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase" style={{ color: 'var(--accent-teal)', fontFamily: 'var(--font-header)' }}>Mana</span>
            <span className="text-xs font-bold" style={{ color: 'var(--accent-teal)', fontFamily: 'var(--font-terminal)' }}>
              {magic.mana.current}/{magic.mana.max}
            </span>
          </div>
        )}
      </div>

      {/* Pillar toggles */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setExpandedPillar('all')}
          className="px-2 py-0.5 text-[10px] uppercase transition-colors"
          style={{
            fontFamily: 'var(--font-header)',
            letterSpacing: '0.05em',
            backgroundColor: expandedPillar === 'all' ? 'var(--surface-dark)' : 'rgba(30, 45, 64, 0.08)',
            color: expandedPillar === 'all' ? 'var(--accent-gold)' : 'rgba(30, 45, 64, 0.4)',
            border: `1px solid ${expandedPillar === 'all' ? 'var(--accent-gold)' : 'rgba(30, 45, 64, 0.1)'}`,
          }}
        >
          All
        </button>
        {(Object.keys(PILLAR_STYLES) as Array<keyof typeof PILLAR_STYLES>).map(key => {
          const style = PILLAR_STYLES[key];
          const pillar = magic[key];
          if (pillar.schools.length === 0 && pillar.knownSpells.length === 0) return null;
          return (
            <button
              key={key}
              onClick={() => setExpandedPillar(expandedPillar === key ? 'all' : key)}
              className="px-2 py-0.5 text-[10px] uppercase transition-colors"
              style={{
                fontFamily: 'var(--font-header)',
                letterSpacing: '0.05em',
                backgroundColor: expandedPillar === key ? style.color : 'rgba(30, 45, 64, 0.08)',
                color: expandedPillar === key ? 'white' : style.color,
                border: `1px solid ${expandedPillar === key ? style.color : `${style.color}40`}`,
              }}
            >
              {style.icon} {style.label}
            </button>
          );
        })}
      </div>

      {/* School overview (all known schools with skill levels) */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {(Object.keys(PILLAR_STYLES) as Array<keyof typeof PILLAR_STYLES>).map(pillarKey => {
          const pillar = magic[pillarKey];
          return pillar.schools.map(school => (
            <SchoolBadge
              key={school}
              school={school}
              skillLevel={pillar.skillLevels?.[school]}
            />
          ));
        })}
      </div>

      {/* Pillar sections */}
      <div className="space-y-4">
        {(Object.keys(PILLAR_STYLES) as Array<keyof typeof PILLAR_STYLES>).map(key => {
          if (expandedPillar !== 'all' && expandedPillar !== key) return null;
          const pillar = magic[key];
          const style = PILLAR_STYLES[key];
          if (pillar.schools.length === 0 && pillar.knownSpells.length === 0) return null;

          // Group spells by school
          const spellsBySchool = pillar.knownSpells.reduce<Record<string, GrowthSpell[]>>((acc, spell) => {
            if (!acc[spell.school]) acc[spell.school] = [];
            acc[spell.school].push(spell);
            return acc;
          }, {});

          return (
            <div key={key}>
              {/* Pillar header */}
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: style.color, fontSize: '16px' }}>{style.icon}</span>
                <span className="text-xs uppercase" style={{
                  fontFamily: 'var(--font-header)',
                  letterSpacing: '0.08em',
                  color: style.color,
                }}>
                  {style.label}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--surface-dark)', opacity: 0.3 }}>
                  {style.subtitle} | {style.desc}
                </span>
              </div>

              {/* Spells grouped by school */}
              {Object.entries(spellsBySchool).map(([school, spells]) => (
                <div key={school} className="mb-2">
                  <div className="text-[10px] uppercase mb-1 pl-2" style={{
                    fontFamily: 'var(--font-header)',
                    letterSpacing: '0.05em',
                    color: style.color,
                    opacity: 0.6,
                  }}>
                    {SCHOOL_ICONS[school as MagicSchool] || '\u2728'} {school}
                  </div>
                  <div className="space-y-0.5">
                    {spells.map((spell, i) => (
                      <SpellCard key={i} spell={spell} pillarColor={style.color} />
                    ))}
                  </div>
                </div>
              ))}

              {/* Schools with no spells yet */}
              {pillar.schools
                .filter(s => !spellsBySchool[s])
                .map(school => (
                  <div key={school} className="text-[10px] pl-2 py-1" style={{ color: 'var(--surface-dark)', opacity: 0.3 }}>
                    {SCHOOL_ICONS[school] || '\u2728'} {school} - No spells known
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      {/* Woven Spells */}
      {magic.wovenSpells && magic.wovenSpells.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: 'var(--krma-gold)', fontSize: '16px' }}>{'\u2728'}</span>
            <span className="text-xs uppercase" style={{
              fontFamily: 'var(--font-header)',
              letterSpacing: '0.08em',
              color: 'var(--krma-gold)',
            }}>
              Woven Spells
            </span>
            <span className="text-[10px]" style={{ color: 'var(--surface-dark)', opacity: 0.3 }}>
              Combined schools | Advanced casting
            </span>
          </div>
          <div className="space-y-0.5">
            {magic.wovenSpells.map((spell, i) => (
              <WovenSpellCard key={i} spell={spell} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
