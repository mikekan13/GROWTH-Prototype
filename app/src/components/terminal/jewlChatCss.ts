/**
 * jEWL conversation look (2026-10-08) — shared by the drawer's jEWL tab
 * (terminal/CopilotChat) and the floating overlay (copilot/JewlChip).
 *
 * Powder-blue page; JEWL speaks in the book's margin voice — `[jEWL]:` +
 * Consolas on the #383837 aside bar (feed-grammar sheet §7, p 70); his asks
 * are the p 64 held question on that same bar with navy/gold Bebas answers;
 * the person's turn is ordinary reading text (Comfortaa) under a navy rule;
 * states are bracketed bars ([DONE] teal, [CANCELLED]/thinking black).
 *
 * Every type size goes through `--jewl-fs` (the overlay's readability knob);
 * unset = 1, so the drawer renders at these exact px.
 */
export const fs = (px: number) => `calc(${px}px * var(--jewl-fs, 1))`;
export const MONO = 'var(--font-terminal),Consolas,monospace';
export const BEBAS = "var(--font-bebas-neue),'Bebas Neue',sans-serif";
export const READ = 'var(--font-comfortaa),Comfortaa,sans-serif';

export const JEWL_CHAT_CSS = `
.jc{flex:1;min-height:0;display:flex;flex-direction:column;background:#cfe2f2;color:#000;font-family:${READ}}
.jc *{box-sizing:border-box}
.jc-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 12px 14px 14px}
.jc-turn{margin:12px 0 0}
.jc-msg{margin:0;font:700 ${fs(14)}/1.62 ${MONO};white-space:pre-wrap;overflow-wrap:anywhere}
.jc-aside{background:#383837;color:#f5f4ef;padding:1px 5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.jc-aside b{font-weight:700;color:#ffcc78}
.jc-user{border-left:4px solid #002f6c;padding:0 0 0 10px}
.jc-who{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.jc-tag{font:700 ${fs(13)}/1.5 ${MONO};color:#002f6c}
.jc-time{font:400 ${fs(12)}/1.5 ${MONO};color:#393937;flex:none}
.jc-said{margin:2px 0 0;font:400 ${fs(15)}/1.6 ${READ};white-space:pre-wrap;overflow-wrap:anywhere}
.jc-ask{margin:8px 0 0}
.jc-kind{display:inline-block;font:400 ${fs(15)}/1.2 ${BEBAS};letter-spacing:.04em;color:#ffcc78;background:#002f6c;padding:2px 6px 0;margin-right:6px}
.jc-answers{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 0}
.jc-answers button{font:400 ${fs(18)}/1 ${BEBAS};letter-spacing:.05em;min-height:36px;padding:3px 12px 0;border:0;cursor:pointer;white-space:nowrap}
.jc-yes{background:#002f6c;color:#ffcc78}
.jc-no{background:none;color:#002f6c;box-shadow:inset 0 0 0 2px #002f6c}
.jc-answers button:focus-visible{outline:3px solid #ffcc78;outline-offset:2px}
.jc-answers button:disabled{opacity:.55;cursor:default}
.jc-state{margin:4px 0 0;font:700 ${fs(13)}/1.62 ${MONO}}
.jc-done{background:#22ab94;color:#222;padding:1px 5px}
.jc-cancelled .jc-aside{text-decoration:line-through;text-decoration-thickness:2px;opacity:.7}
.jc-note{margin:12px 0 0;font:700 ${fs(13)}/1.62 ${MONO}}
.jc-bar{background:#000;color:#f5f4ef;padding:1px 5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.jc-caret{animation:jc-caret 1s steps(1) infinite}
@keyframes jc-caret{0%,49%{opacity:1}50%,100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.jc-caret{animation:none}}
.jc-input{flex:none;display:flex;gap:8px;align-items:stretch;background:#fafaf8;border-top:3px solid #000;padding:8px 10px 10px}
.jc-input input{flex:1;min-width:0;height:44px;outline:0;padding:0 8px;font-family:${READ};color:#000;background:#fff;border:0;border-left:4px solid #002f6c}
.jc-input input:disabled{opacity:.6}
.jc-input button{width:68px;min-height:36px;border:0;cursor:pointer;font:400 ${fs(22)}/1 ${BEBAS};letter-spacing:.06em;background:#002f6c;color:#ffcc78}
.jc-input button:disabled{opacity:.55;cursor:default}
`;
