'use client';

import type { GrowthCharacter } from '@/types/growth';
import { PILLARS } from '@/types/growth';
import AttributeBlock from './AttributeBlock';
import MagicSection from './MagicSection';
import SkillsSection from './SkillsSection';
import VitalsSection from './VitalsSection';
import InventorySection from './InventorySection';

interface CharacterSheetProps {
  character: GrowthCharacter;
}

const FATE_DIE_LABELS: Record<string, string> = {
  d4: 'd4', d6: 'd6', d8: 'd8', d12: 'd12', d20: 'd20',
};

const CONDITION_MAP: Record<string, string> = {
  weak: 'CLO 0', clumsy: 'CEL 0', exhausted: 'CON 0',
  deafened: 'FLO 0', deathsDoor: 'FRQ 0', muted: 'FOC 0',
  overwhelmed: 'WIL 0', confused: 'WIS 0', incoherent: 'WIT 0',
};

export default function CharacterSheet({ character }: CharacterSheetProps) {
  const { identity, attributes, levels, creation, conditions, traits, grovines, fears } = character;
  const activeConditions = Object.entries(conditions).filter(([, v]) => v);
  const nectars = traits.filter(t => t.type === 'nectar');
  const blossoms = traits.filter(t => t.type === 'blossom');
  const thorns = traits.filter(t => t.type === 'thorn');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Identity Header */}
      <div className="bg-[var(--surface-dark)] text-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-[family-name:var(--font-header)] text-3xl tracking-wider text-[var(--accent-gold)]">
            {identity.name}
          </h2>
          <span className="text-[var(--accent-teal)] text-sm">
            {creation.seed?.name || 'Unknown Seed'} | {FATE_DIE_LABELS[creation.seed.baseFateDie]}
          </span>
        </div>

        {/* WTH Levels + TKV */}
        <div className="flex gap-6 mt-3 text-sm">
          <div>
            <span className="text-white/40 uppercase text-xs">Wealth</span>
            <span className="ml-2 text-[var(--krma-gold)]">{levels.wealthLevel}</span>
          </div>
          <div>
            <span className="text-white/40 uppercase text-xs">Tech</span>
            <span className="ml-2 text-[var(--accent-teal)]">{levels.techLevel}</span>
          </div>
          <div>
            <span className="text-white/40 uppercase text-xs">Health</span>
            <span className="ml-2 text-[var(--pillar-body)]">{levels.healthLevel}</span>
          </div>
          {character.tkv !== undefined && (
            <div className="ml-auto">
              <span className="text-white/40 uppercase text-xs">TKV</span>
              <span className="ml-2 text-[var(--krma-gold)] font-bold">{character.tkv}</span>
            </div>
          )}
        </div>

        {/* Age */}
        {identity.age && (
          <div className="flex gap-4 mt-2 text-xs text-white/40">
            <span>Age: {identity.age}</span>
            {identity.fatedAge && <span>Fated Age: {identity.fatedAge}</span>}
          </div>
        )}
      </div>

      {/* Seed/Root/Branches */}
      {(creation.root || creation.branches?.length) && (
        <div className="space-y-2">
          <div className="section-badge inline-block text-sm">Origin</div>
          {creation.root && (
            <div className="text-sm">
              <span className="text-[var(--accent-gold)] font-bold">Root:</span>{' '}
              <span>{creation.root.name}</span>
              {creation.root.description && (
                <span className="text-[var(--surface-dark)]/60 ml-2">— {creation.root.description}</span>
              )}
            </div>
          )}
          {creation.branches?.map((b, i) => (
            <div key={i} className="text-sm">
              <span className="text-[var(--accent-teal)]">Branch {b.order}:</span>{' '}
              <span>{b.name}</span>
              {b.description && (
                <span className="text-[var(--surface-dark)]/60 ml-2">— {b.description}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 3x3 Attribute Panel */}
      <div>
        <div className="section-badge inline-block text-sm mb-3">Attributes</div>
        <div className="grid grid-cols-3 gap-4">
          {/* Body Pillar */}
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-widest text-center" style={{ color: PILLARS.body.color }}>
              Body <span className="text-[var(--surface-dark)]/30">(Salt)</span>
            </div>
            <AttributeBlock name="Clout" abbr="CLO" attribute={attributes.clout} pillarColor={PILLARS.body.color} />
            <AttributeBlock name="Celerity" abbr="CEL" attribute={attributes.celerity} pillarColor={PILLARS.body.color} />
            <AttributeBlock name="Constitution" abbr="CON" attribute={attributes.constitution} pillarColor={PILLARS.body.color} />
          </div>

          {/* Spirit Pillar */}
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-widest text-center" style={{ color: PILLARS.spirit.color }}>
              Spirit <span className="text-[var(--surface-dark)]/30">(Sulfur)</span>
            </div>
            <AttributeBlock name="Flow" abbr="FLO" attribute={attributes.flow} pillarColor={PILLARS.spirit.color} />
            <AttributeBlock name="Frequency" abbr="FRQ" attribute={attributes.frequency} pillarColor={PILLARS.spirit.color} isFrequency />
            <AttributeBlock name="Focus" abbr="FOC" attribute={attributes.focus} pillarColor={PILLARS.spirit.color} />
          </div>

          {/* Soul Pillar */}
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-widest text-center" style={{ color: PILLARS.soul.color }}>
              Soul <span className="text-[var(--surface-dark)]/30">(Mercury)</span>
            </div>
            <AttributeBlock name="Willpower" abbr="WIL" attribute={attributes.willpower} pillarColor={PILLARS.soul.color} />
            <AttributeBlock name="Wisdom" abbr="WIS" attribute={attributes.wisdom} pillarColor={PILLARS.soul.color} />
            <AttributeBlock name="Wit" abbr="WIT" attribute={attributes.wit} pillarColor={PILLARS.soul.color} />
          </div>
        </div>
      </div>

      {/* Conditions */}
      {activeConditions.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {activeConditions.map(([key]) => (
            <span key={key} className="highlight-bar text-xs text-[var(--accent-coral)]">
              {key.toUpperCase()} ({CONDITION_MAP[key]})
            </span>
          ))}
        </div>
      )}

      {/* GRO.vines */}
      {grovines.length > 0 && (
        <div>
          <div className="section-badge inline-block text-sm mb-3">GRO.vines</div>
          <div className="space-y-3">
            {grovines.map((gv) => (
              <div key={gv.id} className="border-l-2 pl-3" style={{
                borderColor: gv.status === 'active' ? 'var(--accent-teal)' : gv.status === 'completed' ? 'var(--accent-gold)' : 'var(--accent-coral)',
              }}>
                <div className="text-sm font-bold">{gv.goal}</div>
                <div className="text-xs text-[var(--surface-dark)]/60">
                  <span className="text-[var(--pillar-body)]">R:</span> {gv.resistance}
                  <span className="ml-3 text-[var(--accent-teal)]">O:</span> {gv.opportunity}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--surface-dark)]/40 mt-1">
                  {gv.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nectars, Blossoms, Thorns */}
      {traits.length > 0 && (
        <div>
          <div className="section-badge inline-block text-sm mb-3">Traits</div>
          <div className="space-y-2">
            {nectars.length > 0 && (
              <div>
                <span className="text-xs uppercase tracking-wider text-[var(--accent-gold)]">Nectars (Permanent)</span>
                {nectars.map((t, i) => (
                  <div key={i} className="text-sm ml-2">
                    <span className="text-[var(--accent-gold)]">{t.name}</span>
                    <span className="text-[var(--surface-dark)]/60 ml-2">— {t.description}</span>
                  </div>
                ))}
              </div>
            )}
            {blossoms.length > 0 && (
              <div>
                <span className="text-xs uppercase tracking-wider text-[var(--accent-teal)]">Blossoms (Temporary)</span>
                {blossoms.map((t, i) => (
                  <div key={i} className="text-sm ml-2">
                    <span className="text-[var(--accent-teal)]">{t.name}</span>
                    <span className="text-[var(--surface-dark)]/60 ml-2">— {t.description}</span>
                  </div>
                ))}
              </div>
            )}
            {thorns.length > 0 && (
              <div>
                <span className="text-xs uppercase tracking-wider text-[var(--accent-coral)]">Thorns (Permanent)</span>
                {thorns.map((t, i) => (
                  <div key={i} className="text-sm ml-2">
                    <span className="text-[var(--accent-coral)]">{t.name}</span>
                    <span className="text-[var(--surface-dark)]/60 ml-2">— {t.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fears */}
      {fears.length > 0 && (
        <div>
          <div className="section-badge inline-block text-sm mb-3">Fears</div>
          <div className="space-y-2">
            {fears.map((f, i) => (
              <div key={i} className="text-sm flex items-center gap-2">
                <span className={`text-xs uppercase ${f.status === 'aligned' ? 'text-[var(--accent-gold)]' : 'text-[var(--accent-coral)]'}`}>
                  [{f.status}]
                </span>
                <span>{f.name}</span>
                <span className="text-[var(--surface-dark)]/40 text-xs">RL {f.resistanceLevel}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Magic */}
      <MagicSection magic={character.magic} />

      {/* Skills */}
      <SkillsSection skills={character.skills} />

      {/* Vitals */}
      <VitalsSection vitals={character.vitals} />

      {/* Inventory */}
      <InventorySection inventory={character.inventory} />

      {/* Notes */}
      {character.notes && (
        <div>
          <div className="section-badge inline-block text-sm mb-3">Notes</div>
          <p className="text-sm text-[var(--surface-dark)]/70 whitespace-pre-wrap">{character.notes}</p>
        </div>
      )}
    </div>
  );
}
