'use client';

/**
 * DeathSaveDialog — full-screen death consequence surface (black void, GM-only).
 * Subscribes to 'death_save' SSE; renders nothing until TRIGGERED fires.
 * Canon: r-2026-07-11-01/-02 — ties go to Lady Death; mercy only after failed roll.
 */

import { useState, useEffect } from 'react';
import { useCampaignStream } from '@/hooks/useCampaignStream';
import type { DeathSaveEvent } from '@/types/campaign-events';
import SplitConfirmDialog from './SplitConfirmDialog';

interface Props { campaignId: string; isGM: boolean; }

interface TriggerState {
  characterId: string; characterName: string;
  door: 'COMBAT' | 'FATED_AGE'; trigger?: string; fateDie?: string;
}
interface ResolutionState {
  taraChoice: string; fateRoll: number; modifierTotal: number;
  modifierSources: string[]; characterTotal: number; taraResult: number; survived: boolean;
}

type TaraChoice = '1'|'2'|'3'|'d4'|'d6'|'d8'|'d12'|'d20'|'NO_REAP';
const DIE_CHOICES: TaraChoice[] = ['1','2','3','d4','d6','d8','d12','d20'];

function humanizeTrigger(t?: string): string {
  if (!t) return 'Unknown cause';
  if (t === 'frequency_zero') return 'Frequency reached zero';
  if (t.startsWith('vital_destroyed:')) return `${t.slice('vital_destroyed:'.length)} destroyed`;
  return t.replace(/_/g, ' ');
}

const VOID: React.CSSProperties = {
  position:'fixed', inset:0, zIndex:9000, background:'#000',
  display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Consolas,monospace',
};
const BAR: React.CSSProperties = { position:'absolute', left:0, right:0, height:'3px', background:'#f7525f' };
const RULE: React.CSSProperties = { width:'100%', height:'2px', background:'#f7525f', margin:'8px 0 48px' };
const BADGE: React.CSSProperties = {
  display:'inline-block', background:'#f7525f', color:'#000',
  fontFamily:'Bebas Neue,monospace', fontSize:'1.25rem', letterSpacing:'0.08em',
  padding:'2px 12px', marginBottom:'16px',
};
function btn(active: boolean, variant: 'coral'|'ghost'|'white' = 'coral'): React.CSSProperties {
  if (variant === 'coral') return {
    background: active ? '#f7525f' : '#1a1a1a', color: active ? '#000' : '#444',
    border:'none', fontFamily:'Bebas Neue,monospace', fontSize:'1.25rem',
    letterSpacing:'0.1em', padding:'14px 36px', cursor: active ? 'pointer' : 'not-allowed',
  };
  if (variant === 'white') return {
    background:'#fff', color:'#000', border:'none',
    fontFamily:'Bebas Neue,monospace', fontSize:'1rem', letterSpacing:'0.06em',
    padding:'14px 28px', cursor:'pointer',
  };
  return {
    background:'transparent', color:'#aaa', border:'1px solid #444',
    fontFamily:'Consolas,monospace', fontSize:'0.9rem', padding:'12px 24px', cursor:'pointer',
  };
}

export default function DeathSaveDialog({ campaignId, isGM }: Props) {
  const { on } = useCampaignStream({ campaignId });
  const [trig, setTrig]     = useState<TriggerState|null>(null);
  const [res, setRes]       = useState<ResolutionState|null>(null);
  const [choice, setChoice] = useState<TaraChoice|null>(null);
  const [loading, setLoad]  = useState(false);
  const [mercy, setMercy]   = useState<string|null>(null);
  const [mercyBusy, setMB]  = useState(false);
  const [split, setSplit]   = useState(false);

  useEffect(() => on('death_save', (data: DeathSaveEvent) => {
    if (data.phase === 'TRIGGERED' && isGM) {
      setTrig({ characterId:data.characterId, characterName:data.characterName, door:data.door, trigger:data.trigger });
      setRes(null); setChoice(null); setMercy(null); setSplit(false);
      fetch(`/api/characters/${data.characterId}/death-save`)
        .then(r => r.ok ? r.json() : null)
        .then(p => { if (p?.state?.fateDie) setTrig(prev => prev ? {...prev, fateDie:p.state.fateDie} : prev); })
        .catch(() => {});
    }
    if (data.phase === 'SPLIT_EXECUTED') close();
  }), [on, isGM]);

  function close() { setTrig(null); setRes(null); setChoice(null); setMercy(null); setSplit(false); }

  async function roll() {
    if (!trig || !choice) return;
    setLoad(true);
    try {
      const r = await fetch(`/api/characters/${trig.characterId}/death-save`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ door:trig.door, taraChoice:choice, trigger:trig.trigger }),
      });
      if (!r.ok) throw new Error('Roll failed');
      const o = await r.json();
      setRes({ taraChoice:choice, fateRoll:o.fateRoll??0, modifierTotal:o.modifierTotal??0,
        modifierSources:o.modifierSources??[], characterTotal:o.characterTotal??0,
        taraResult:o.taraResult??0, survived:o.survived??false });
    } finally { setLoad(false); }
  }

  async function spare() {
    if (!trig) return; setMB(true);
    try {
      const r = await fetch(`/api/characters/${trig.characterId}/death-save`, { method:'DELETE' });
      if (!r.ok) throw new Error();
      setMercy('Death changes her mind.');
    } finally { setMB(false); }
  }

  if (!trig) return null;

  const isDone = !!mercy || res?.survived;
  const failActions = res && !res.survived && res.taraChoice !== 'NO_REAP' && !mercy;

  return (
    <>
      <div style={VOID}>
        <div style={{...BAR, top:0}} />
        <div style={{ width:'100%', maxWidth:'680px', padding:'64px 48px', color:'#fff', position:'relative' }}>

          {isDone && (
            <button onClick={close} aria-label="Close" style={{
              position:'absolute', top:'16px', right:'16px', background:'none', border:'none',
              color:'#fff', fontSize:'1.25rem', cursor:'pointer', opacity:0.5,
            }}>⊗</button>
          )}

          <h1 style={{ fontFamily:'Bebas Neue,monospace', fontSize:'4rem', letterSpacing:'0.1em', margin:'0' }}>
            FACING DEATH
          </h1>
          <div style={RULE} />

          {/* Identity */}
          <div style={{ marginBottom:'40px' }}>
            <div style={BADGE}>{trig.characterName.toUpperCase()}</div>
            <div style={{ color:'#aaa', fontSize:'0.95rem', marginBottom:'8px' }}>
              {humanizeTrigger(trig.trigger)}
            </div>
            {trig.fateDie && (
              <div style={{ color:'#fff', fontSize:'1rem' }}>
                {'Fate Die: '}
                <span style={{ color:'#f7525f', fontFamily:'Bebas Neue,monospace', fontSize:'1.25rem' }}>
                  {trig.fateDie}
                </span>
              </div>
            )}
          </div>

          {/* Tara's choice picker */}
          {!res && !mercy && (
            <>
              <div style={{ color:'#aaa', fontSize:'0.8rem', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:'16px' }}>
                Lady Death chooses. The GM enacts her.
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'10px', marginBottom:'16px' }}>
                {DIE_CHOICES.map(c => (
                  <button key={c} onClick={() => setChoice(c)} style={{
                    background: choice===c ? '#f7525f' : 'transparent',
                    color: choice===c ? '#000' : '#fff',
                    border:`1px solid ${choice===c ? '#f7525f' : '#444'}`,
                    fontFamily:'Consolas,monospace', fontSize:'1rem',
                    padding:'8px 18px', cursor:'pointer', minWidth:'52px',
                  }}>{c}</button>
                ))}
              </div>
              <div style={{ borderTop:'1px solid #222', margin:'16px 0' }} />
              <button onClick={() => setChoice('NO_REAP')} style={{
                background: choice==='NO_REAP' ? '#fff' : 'transparent',
                color: choice==='NO_REAP' ? '#000' : '#666',
                border:`1px solid ${choice==='NO_REAP' ? '#fff' : '#333'}`,
                fontFamily:'Consolas,monospace', fontSize:'0.9rem',
                padding:'8px 18px', cursor:'pointer', letterSpacing:'0.08em', marginBottom:'32px',
              }}>DO NOT REAP</button>
              <br />
              <button onClick={roll} disabled={!choice||loading} style={btn(!!(choice&&!loading))}>
                {loading ? 'ROLLING...' : 'ROLL'}
              </button>
            </>
          )}

          {/* NO_REAP */}
          {res?.taraChoice === 'NO_REAP' && (
            <div>
              <div style={{ fontFamily:'Bebas Neue,monospace', fontSize:'2rem', letterSpacing:'0.08em', marginBottom:'16px' }}>
                Death turns away.
              </div>
              <p style={{ color:'#aaa', fontSize:'0.9rem' }}>
                Lady Death chose not to reap. {trig.characterName} walks away from the door.
              </p>
            </div>
          )}

          {/* Roll breakdown + verdict */}
          {res && res.taraChoice !== 'NO_REAP' && (
            <>
              <div style={{ background:'#0a0a0a', border:'1px solid #222', padding:'24px', marginBottom:'28px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ color:'#aaa', fontSize:'0.72rem', letterSpacing:'0.1em', marginBottom:'4px' }}>
                      {trig.characterName.toUpperCase()} (FATE)
                    </div>
                    <div style={{ fontSize:'2.5rem', fontFamily:'Bebas Neue,monospace' }}>{res.characterTotal}</div>
                    <div style={{ color:'#555', fontSize:'0.78rem' }}>
                      rolled {res.fateRoll}
                      {res.modifierSources.length > 0 && <> + {res.modifierSources.join(', ')}</>}
                    </div>
                  </div>
                  <div style={{ color:'#333', fontSize:'1.5rem' }}>vs</div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ color:'#aaa', fontSize:'0.72rem', letterSpacing:'0.1em', marginBottom:'4px' }}>
                      LADY DEATH ({res.taraChoice.toUpperCase()})
                    </div>
                    <div style={{ fontSize:'2.5rem', fontFamily:'Bebas Neue,monospace', color:'#f7525f' }}>
                      {res.taraResult}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                fontFamily:'Bebas Neue,monospace', fontSize:'2.5rem', letterSpacing:'0.1em',
                color: res.survived ? '#22ab94' : '#f7525f', marginBottom: res.survived ? 0 : '28px',
              }}>
                {res.survived ? 'SURVIVES' : 'THE ROLL FAILS'}
              </div>
            </>
          )}

          {/* Failure CTA */}
          {failActions && (
            <div style={{ display:'flex', gap:'16px', flexWrap:'wrap', marginTop:'8px' }}>
              <button onClick={() => setSplit(true)} style={{
                background:'#f7525f', color:'#000', border:'none',
                fontFamily:'Bebas Neue,monospace', fontSize:'1.1rem', letterSpacing:'0.08em',
                padding:'12px 28px', cursor:'pointer',
              }}>OPEN THE SPLIT</button>
              <button onClick={spare} disabled={mercyBusy} style={btn(!mercyBusy,'ghost')}>
                {mercyBusy ? 'SPARING...' : 'SPARE THEM'}
              </button>
            </div>
          )}

          {mercy && (
            <div style={{ fontFamily:'Bebas Neue,monospace', fontSize:'1.5rem', letterSpacing:'0.08em', marginTop:'8px' }}>
              {mercy}
            </div>
          )}
        </div>
        <div style={{...BAR, bottom:0}} />
      </div>

      {split && trig && (
        <SplitConfirmDialog
          characterId={trig.characterId}
          characterName={trig.characterName}
          onClose={() => setSplit(false)}
          onExecuted={close}
        />
      )}
    </>
  );
}
