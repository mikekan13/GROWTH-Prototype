/**
 * The TABLE feed's stylesheet — lifted from the approved mockup
 * (tmp/screens/2026-10-07-drawer-v7-412.html, 16 tweaks with Mike) and scoped
 * under .tf. Tooltip bodies are portaled to <body>, so their classes (.tft-*)
 * are top-level.
 *
 * Bar geometry: a segment has line-height 0, so every line box is the 22 px
 * Consolas strut of .line; each pillar bar is a 22 px band painted from that
 * strut's top, offset by the face's measured ascent (Consolas 13, Inknut@15 26,
 * Bebas@18 17). Result: contiguous bars, no gaps, no overlap, any face.
 */
export const TABLE_FEED_CSS = `
.tf{--tf-page:#cfe2f2;--tf-navy:#002f6c;--tf-gold:#ffcc78;--tf-bar:#383837;--tf-teal:#22ab94;--tf-coral:#f6525e;--tf-paper:#f5f4ef;--tf-g3:#393937;
  background:var(--tf-page);color:#000;font-family:var(--font-comfortaa),Comfortaa,sans-serif;padding:8px 0 10px 14px}
.tf.tf-tail{padding-top:0}
.tf *{box-sizing:border-box}
.tf .row{display:grid;align-items:start;margin:10px 12px 0 0}
.tf .row.cl{grid-template-columns:80px minmax(0,1fr) 44px}
.tf .row.nx,.tf .row.bx{grid-template-columns:minmax(0,1fr) 44px}
.tf .body{min-width:0}
.tf .line{font:700 14px/22px var(--font-terminal);color:#000;overflow-wrap:anywhere;margin:0}

/* narration: the manual's ordered reading text (pp 21-22), no label, no chip */
.tf .nx .line{font:400 15px/1.6 var(--font-comfortaa),Comfortaa,sans-serif;padding-right:6px}

/* portrait chip + p10 <Name>: tag flush under it, right-aligned */
.tf .chip{width:80px;cursor:pointer;display:block;outline:none}
.tf .chip .pt{display:block;width:80px;height:80px;object-fit:cover;background:#212121 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23212121'/%3E%3Ccircle cx='40' cy='31' r='14' fill='%235b6170'/%3E%3Cpath d='M12 80c2-18 14-27 28-27s26 9 28 27z' fill='%235b6170'/%3E%3C/svg%3E") center/cover}
.tf .chip .who{display:flex;justify-content:flex-end;white-space:nowrap;font:700 13px/20px var(--font-terminal);color:var(--tf-paper);margin:0 0 0 -12px;width:92px;overflow:hidden}
.tf .chip .who span{padding:3px 0;flex:none}
.tf .chip .who .lt{background:#000;padding-left:3px}
.tf .chip .who .nm{background:#212121;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
.tf .chip .who .co{background:#383837;padding-right:3px}
.tf .chip.open .pt,.tf .chip:focus-visible .pt{outline:3px solid var(--tf-gold);outline-offset:-3px}
.tf .chip.open .who span{color:var(--tf-gold)}

/* pillar segments: colour = WHAT, never WHO */
.tf .seg{line-height:0;padding:3px 5px;background-repeat:no-repeat;background-size:100% 22px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.tf .seg.act{font:italic 400 15px var(--font-inknut-antiqua),'Inknut Antiqua',Georgia,serif;line-height:0;color:#000;background-image:linear-gradient(#f7525f,#f7525f);background-position:0 13.5px}
.tf .seg.say{font:italic 400 14px var(--font-terminal);line-height:0;color:var(--tf-paper);background-image:linear-gradient(#582a72,#582a72);background-position:0 .5px}
.tf .seg.think{font:400 18px var(--font-bebas-neue),'Bebas Neue',sans-serif;line-height:0;letter-spacing:.02em;color:var(--tf-paper);background-image:linear-gradient(#002f6c,#002f6c);background-position:0 4.5px}
.tf .seg .mk{opacity:.6}
.tf .caret{display:inline;margin-left:1px;animation:tf-caret 1s steps(1) infinite}
@keyframes tf-caret{0%,49%{opacity:1}50%,100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.tf .caret{animation:none}}

/* entities: black Terminal spans = "a thing in the world you can open" */
.tf .ent{position:relative;border:0;font:700 14px var(--font-terminal);color:var(--tf-paper);cursor:pointer;-webkit-box-decoration-break:clone;box-decoration-break:clone;outline:none}
.tf .nx .line .ent,.tf .bar .ent{background:#000;padding:2px 5px;line-height:1}
.tf .seg .ent{line-height:0;padding:3px 5px;background:linear-gradient(#000,#000) 0 .5px/100% 22px no-repeat;font-style:normal}
.tf .ent.open,.tf .ent:focus-visible{box-shadow:inset 0 -3px 0 var(--tf-gold);color:var(--tf-gold)}
.tf .seg .ent.open,.tf .seg .ent:focus-visible{background:linear-gradient(#ffcc78,#ffcc78) 0 19.5px/100% 3px no-repeat,linear-gradient(#000,#000) 0 .5px/100% 22px no-repeat;box-shadow:none}
.tf .ent::after{content:"";position:absolute;left:-2px;right:-2px;top:50%;height:40px;transform:translateY(-50%)}

/* right column: the typed/spoken badge IS the raw toggle (36px hit, 18px badge) */
.tf .side{display:flex;flex-direction:column;align-items:flex-end}
.tf .md{height:36px;width:44px;margin:0;padding:0;border:0;background:none;display:flex;align-items:center;justify-content:flex-end;cursor:pointer}
.tf .tg{font:700 12px/18px 'Segoe UI Emoji','Segoe UI Symbol','Apple Color Emoji','Noto Color Emoji',var(--font-terminal);color:#000;background:var(--tf-paper);box-shadow:inset 0 0 0 1.5px #000;padding:0 4px;min-width:26px;text-align:center;white-space:nowrap}
.tf .md .tg::after{content:" \\25B8";font:700 12px var(--font-terminal);color:var(--tf-g3)}
.tf .md.open .tg{background:var(--tf-gold);box-shadow:inset 0 0 0 2px var(--tf-navy)}
.tf .md.open .tg::after{content:" \\25BE";color:var(--tf-navy)}
.tf .md:focus-visible .tg{box-shadow:inset 0 0 0 2px var(--tf-navy)}
.tf .md .tg.rv::after{content:""}
.tf .md .tg.rv{color:#b0303b;box-shadow:inset 0 0 0 1.5px #b0303b}
.tf .md .tg.lg::after{content:""}
.tf .md .tg.lg{color:var(--tf-navy);box-shadow:inset 0 0 0 1.5px var(--tf-navy);font-family:var(--font-terminal)}
.tf .row.nx.told .line{font-style:italic}
.tf .row[data-hl]{box-shadow:inset 4px 0 0 var(--tf-gold);background:rgba(255,204,120,0.28);padding-left:6px}

/* raw reveal: the p 2 stream, Consolas on #383837 bars, contiguous */
.tf .rawbox{grid-column:1/-1;margin:6px 0 2px}
.tf .rawbox .hd{font:700 12px/1.5 var(--font-terminal);color:var(--tf-g3);letter-spacing:.04em}
.tf .rawbox .hd .real{opacity:.6;font-weight:400}
.tf .rawbox .line{font:400 13px/22px var(--font-terminal);white-space:pre-wrap}
.tf .rawbox .bar{line-height:0;padding:3px 5px;background:linear-gradient(#383837,#383837) 0 0/100% 22px no-repeat;color:var(--tf-paper);font-weight:400;font-size:13px;-webkit-box-decoration-break:clone;box-decoration-break:clone}

/* bar voices: one bar per line */
.tf .bars .line{font:700 14px/1.62 var(--font-terminal)}
.tf .bar{padding:1px 5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.tf .check .bar{background:var(--tf-bar);color:var(--tf-paper);font-style:italic;font-size:13px}
.tf .event .bar{background:#000;color:var(--tf-paper)}
.tf .jewl .bar{background:var(--tf-bar);color:var(--tf-paper);font-size:13px}
.tf .sys .bar{background:var(--tf-teal);color:#222;font-size:13px}

/* withdrawn: strike + coral Bebas correction (p 63) */
.tf .gone .line,.tf .gone .seg,.tf .gone .bar{text-decoration:line-through;text-decoration-thickness:2px}
.tf .gone .line{color:#4a5560}
.tf .fix{display:inline-block;font:19px/1.15 var(--font-bebas-neue),'Bebas Neue',sans-serif;background:var(--tf-coral);color:var(--tf-navy);padding:1px 6px 0;margin-top:3px;letter-spacing:.02em}
.tf .fading{animation:tf-fade 2s ease-out forwards}
@keyframes tf-fade{0%{opacity:1}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.tf .fading{animation:none}}

/* folded beat: [...REDACTED...] (pp 131/136) — a button */
.tf .foldbtn{display:block;min-height:36px;margin:0;padding:0;border:0;background:none;text-align:left;cursor:pointer;font:700 13px/1.62 var(--font-terminal)}
.tf .foldbtn span{background:#000;color:var(--tf-paper);padding:1px 5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.tf .foldbtn:focus-visible span{box-shadow:inset 0 -3px 0 var(--tf-gold)}

/* the fold tree in the Core Rulebook's own heading voices (v0.4.5), no indentation:
   chapter = p 20 chapter opener; session = p 20 section "2.1"; rest = p 20 sub-section "2.1.1";
   encounter = p 131 combat heading. Every heading is a full-width tap target (>= 36 px). */
.tf .fold{margin:8px 12px 0 0}
.tf .fold .fold{margin-right:0}
.tf .fh{display:flex;flex-wrap:wrap;align-items:center;column-gap:8px;row-gap:2px;width:100%;min-height:36px;padding:2px 0;border:0;background:none;cursor:pointer;text-align:left;box-sizing:border-box}
.tf .fh.static{cursor:default}
.tf .fh .arw{font-family:var(--font-terminal);font-size:.62em;margin-right:6px;vertical-align:.18em}
.tf .fh .meta{font:400 12px/1.4 var(--font-terminal);color:var(--tf-g3)}
.tf .fh .livetag{font:400 14px/1 var(--font-bebas-neue),'Bebas Neue',sans-serif;background:var(--tf-gold);color:var(--tf-navy);padding:3px 6px 1px;letter-spacing:.04em}
.tf .fh:focus-visible{outline:3px solid var(--tf-gold);outline-offset:2px}
/* chapter: Inknut Antiqua on the coral bar, centred; a short rule; the Bebas italic navy line */
.tf .h-chapter{flex-direction:column;justify-content:center;padding:6px 0 4px}
.tf .ch-bar{font:600 22px/1.25 var(--font-inknut-antiqua),'Inknut Antiqua',Georgia,serif;color:#fff;background:#f6525e;padding:0 10px;text-align:center;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.tf .ch-rule{font:12px/1 var(--font-terminal);color:var(--tf-navy);letter-spacing:-.05em}
.tf .ch-sub{font:italic 400 16px/1.2 var(--font-bebas-neue),'Bebas Neue',sans-serif;color:var(--tf-navy);letter-spacing:.03em;text-align:center}
/* session: section heading — Bebas gold on a navy strip that hugs the text */
.tf .h-session .badge,.tf .h-between .badge,.tf .h-rest .badge{font:400 24px/1.12 var(--font-bebas-neue),'Bebas Neue',sans-serif;color:var(--tf-gold);background:var(--tf-navy);padding:2px 6px 0;letter-spacing:.01em;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.tf .h-between .badge{background:var(--tf-g3);color:var(--tf-paper)}
/* rest: sub-section — the same strip, smaller */
.tf .h-rest .badge{font-size:18px;padding:1px 5px 0}
/* encounter: the combat heading — Consolas bold white on black */
.tf .cb-bar{font:700 13px/1.62 var(--font-terminal);color:#f5f4ef;background:#000;padding:1px 6px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.tf .h-encounter .arw{color:#f7525f}
.tf .fb > .row:first-child{margin-top:6px}
.tf .fold .row{margin-right:0}
.tf .encslot{margin:8px 0 0;background:#0a0a1a;max-height:55vh;overflow-y:auto;display:flex;flex-direction:column}
/* search: every line shown is a hit */
.tf.searching .row{box-shadow:inset 3px 0 0 var(--tf-gold);padding-left:4px}
.tf .empty{font:700 13px/1.6 var(--font-terminal);color:var(--tf-g3);padding:24px 12px 0 0;text-align:center}

/* tooltip bodies (portaled to <body>) */
.tft-f{display:grid;grid-template-columns:96px minmax(0,1fr);margin:10px 0 0}
.tft-f dt{font:700 13px/30px var(--font-terminal);color:#8d97a5;text-transform:uppercase;letter-spacing:.06em;border-top:1px solid #222;margin:0}
.tft-f dd{font:700 15px/30px var(--font-terminal);color:#f5f4ef;border-top:1px solid #222;margin:0;overflow-wrap:anywhere}
.tft-f dd.real{color:#8d97a5;font-weight:400}
.tft-f dd.long{font-weight:400;font-size:13px;line-height:1.5;padding:5px 0}
.tft-src{margin:6px 0 0;font:12px var(--font-terminal);color:#8d97a5}
`;
