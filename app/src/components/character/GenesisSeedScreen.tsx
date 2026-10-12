'use client';
/**
 * Pre-submit seed screen (2026-10-12): before the GM's Submit to JEWL opens a
 * genesis session (and spends anything), the real plan runs through the same
 * screens the wall will. Anything that would be blocked or withheld is shown
 * here — the passage (to the sentence, ellipsised) and its category — with
 * Edit / Submit anyway. RAW FEED pole, phone-first, like the genesis overlay.
 */
import { createPortal } from 'react-dom';

export interface SeedScreenFindingView {
  screen: 'tone' | 'lawfulness';
  category: string;
  outcome: 'blocked' | 'withheld' | 'toned';
  passage: string;
}

const CATEGORY_WORDS: Record<string, string> = {
  'minor-sexual': 'reads as sexual content near a minor',
  MINOR_SEXUAL: 'reads as sexual content near a minor',
  REAL_PERSON_THREAT: 'reads as a threat to a real person',
  sexual: 'sexual content',
  'sexual-violence': 'sexual violence',
  gore: 'graphic gore',
  torture: 'torture',
};

const OUTCOME_WORDS: Record<SeedScreenFindingView['outcome'], string> = {
  blocked: 'JEWL would never see this passage',
  withheld: 'JEWL would get a placeholder instead',
  toned: 'JEWL gets a clinical rewrite (facts kept)',
};

export function GenesisSeedScreenDialog({ findings, onEdit, onSubmitAnyway, busy }: {
  findings: SeedScreenFindingView[];
  onEdit: () => void;
  onSubmitAnyway: () => void;
  busy?: boolean;
}) {
  if (typeof document === 'undefined') return null;
  const serious = findings.filter(f => f.outcome !== 'toned');
  const toned = findings.filter(f => f.outcome === 'toned');
  return createPortal(
    <div className="gss-root" role="alertdialog" aria-modal="true" aria-label="Part of the seed would be withheld from JEWL" data-no-hold>
      <style>{GSS_CSS}</style>
      <div className="gss-col">
        <div className="gss-k">{'// BEFORE JEWL READS IT'}</div>
        <div className="gss-t">PART OF THE SEED WOULD BE WITHHELD</div>
        <p className="gss-sub">
          The safety screen would keep {serious.length === 1 ? 'this passage' : `these ${serious.length} passages`} from JEWL.
          Nothing has been spent yet. Edit the wording, or submit anyway and JEWL builds without {serious.length === 1 ? 'it' : 'them'}.
        </p>
        <ul className="gss-list">
          {serious.map((f, i) => (
            <li key={i} className="gss-item">
              <div className="gss-cat">{CATEGORY_WORDS[f.category] ?? f.category} · {OUTCOME_WORDS[f.outcome]}</div>
              <blockquote className="gss-q">{f.passage}</blockquote>
            </li>
          ))}
        </ul>
        {toned.length > 0 && (
          <details className="gss-more">
            <summary>{toned.length} passage{toned.length === 1 ? '' : 's'} will be toned down (still reaches JEWL)</summary>
            <ul className="gss-list">
              {toned.map((f, i) => (
                <li key={i} className="gss-item gss-item-soft">
                  <div className="gss-cat">{CATEGORY_WORDS[f.category] ?? f.category}</div>
                  <blockquote className="gss-q">{f.passage}</blockquote>
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="gss-actions">
          <button type="button" className="gss-btn gss-btn-edit" onClick={onEdit} disabled={busy}>EDIT</button>
          <button type="button" className="gss-btn" onClick={onSubmitAnyway} disabled={busy}>
            {busy ? 'SUBMITTING…' : 'SUBMIT ANYWAY'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const GSS_CSS = `
.gss-root{position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.92);color:#e8e8e8;font-family:var(--font-terminal,Consolas,monospace);overflow-y:auto;-webkit-overflow-scrolling:touch}
.gss-col{max-width:412px;margin:0 auto;padding:22px 16px 28px;display:flex;flex-direction:column;gap:12px}
.gss-k{color:#D07818;font-size:12px;letter-spacing:.14em}
.gss-t{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:24px;letter-spacing:.08em;color:#f7525f;line-height:1.1}
.gss-sub{font-size:13px;line-height:1.5;color:#ccc;margin:0}
.gss-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.gss-item{border-left:4px solid #f7525f;background:#1a0606;padding:8px 10px}
.gss-item-soft{border-left-color:#D07818;background:#140d04}
.gss-cat{font-size:11px;letter-spacing:.06em;color:#f0d6d8;text-transform:uppercase;margin-bottom:4px}
.gss-q{margin:0;font-size:13px;line-height:1.5;color:#fff;white-space:pre-wrap;word-break:break-word}
.gss-more summary{cursor:pointer;font-size:12px;color:#D07818;margin-bottom:8px}
.gss-actions{display:flex;gap:10px;margin-top:6px}
.gss-btn{flex:1;font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);letter-spacing:.1em;font-size:18px;padding:10px 16px;min-height:44px;background:#141414;color:#fff;border:1px solid #333;cursor:pointer}
.gss-btn-edit{background:#002f6c;color:#FFCC78;border-color:#FFCC78}
.gss-btn:disabled{opacity:.5;cursor:default}
`;
