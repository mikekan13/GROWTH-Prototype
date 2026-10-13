# Qwen-Image-2.1 legible text and signage — research 2026-10-13

Lane today: Qwen-Image-2.1 base, TextEncodeQwenImage21, 25 steps, cfg 1, euler/simple, `resolution` 1024 budget (~1 MP), prose prompt, no negative. Root cause of the "slop": our prompts name signs/screens/stickers/consoles ("neon signs", "teal shop signs", "tram stop sign", "cracked screen showing a map", "laptop covered in stickers") but never say what they read, so the model invents glyphs, and it does it at a quarter of its native 2K.

## (a) Prompt recipe (from the official PE-T2I rewriter system prompt [1] and the Edit rewriter [4])

1. One short string per readable surface, in straight ASCII double quotes, own script, capitalization as you want it painted: `a bold black headline across the top reads "..."`. Give where it sits, weight, colour, case and relative size. A line break is "a second line", never a newline inside the quotes.
2. Anything you will not spell out must be declared unreadable: "distant signage, a label behind glass, dense body copy — call it blurred, indistinct, or too small to read rather than inventing letters" [1]. Edit side: "Text you cannot commit to should not be added at all" [2].
3. Keep strings short (official benchmarks average ~8 words [6]); one or two strings per image; no mixed-language strings [2]; no quality boosters [1]. Older 2512 recipe used `"..."` plus position/style, "unaltered and not translated", under 200 words [3].

Concrete change to `corpus-prompts.ts`: every item/scene entry that contains a sign, screen, sticker, panel, book or label gets either an exact string (`a teal neon sign above the door reads "TRAM 7"`, `the phone screen shows a map with the single label "HARBOUR"`) or the illegibility clause (`the stickers and console readouts are indistinct, too small to read`). Nothing stays unspecified. In `qwen21-workflow.ts` the lock/describe builders never mention text, so leave them.

## (b) Knobs, one A/B each (fixed seed)

- `resolution` 1024 → 2048 budget (and corpus canvases to ~4 MP). 2.1 is native 2K; the Comfy template says "set the target to about 4.0 MP" [5]. Expected: biggest single win; small glyphs get 4x the pixels.
- cfg 1 → 2 with a short negative ("misspelled letters, garbled text"). Comfy docs: "cfg 2 follows dense prompts more closely, including small text and numbers, at the cost of over-sharpened edges"; cfg 5 "degrades quality badly" [5]. Expected: better spelling, slightly crunchy edges (our finish layer can soften).
- Steps 25 → 40. "going from 25 to 40 steps reduces fizzle in detailed areas" [5]; diffusers default is 40 [7]. Expected: modest cleanup of small text; +60% time.
- Do not move to 2.1-Turbo/Lightning for text: distilled variants are documented as worse on "dense or small text" [8].

## (c) Restyle path (photo in `<image1>`, reframe lead)

Nothing in the base model preserves text implicitly; the edit rewriter rule is "commit to the exact characters — every element, quoted" and "Match the typography and language the input establishes" [2]. Add to `RESTYLE_RECIPE_LEAD` one clause: `Any lettering on signs, screens or labels reads exactly as in <image1>, character for character, in the same typeface and placement` — or, when the content photo's text is noise, `all lettering is blurred and indistinct`. Keep `resolution` at 0 (reference at own size) or 2048 so the encoder actually sees the glyphs. A second pass for a single sign is the documented form: `Replace "OLD" to "NEW"` / `Change the sign text from "OLD" to "NEW". Keep the same lettering, font, placement and lighting. Do not alter any other element.` [4][9], with a mask if we have one (2.1 accepts masks for local edits [7]).

## (d) Post-hoc typography

Prompt for a blank panel (`a blank matte sign board with no lettering`), then render the string as SVG in Bebas Neue/Consolas and composite with sharp; sharp has `affine` (skew/scale), not 4-point perspective, so either keep signs near-frontal or warp the text PNG first. This is the only route that guarantees GROWTH fonts and is cheap given sharp is already installed.

## (e) Tokenizer notes

No source documents curly-vs-straight quote handling; every official example and the PE prompt say straight double quotes [1][3][4], so normalise `“ ”` to `"` before encoding. Capitalization is reproduced ("keep the capitalization" [4]).

## Sources

1. Qwen-Image-2.1-PE-T2I system_prompt.txt — https://huggingface.co/Qwen/Qwen-Image-2.1-PE-T2I/raw/main/system_prompt.txt
2. Qwen-Image-2.1-PE-I2I system_prompt.txt — https://huggingface.co/Qwen/Qwen-Image-2.1-PE-I2I/raw/main/system_prompt.txt
3. Qwen-Image README (positive_magic, true_cfg 4 / 50 steps, EN rewriter rules) — https://github.com/QwenLM/Qwen-Image
4. Qwen-Image-Edit-2509 demo rewriter ("Text Editing Tasks") — https://huggingface.co/spaces/Qwen/Qwen-Image-Edit-2509/blob/main/app.py
5. ComfyUI Qwen-Image-2.1 tutorial (cfg/steps/resolution findings) — https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1
6. Qwen-Image technical report (CVTG-2K, LongText-Bench) — https://arxiv.org/abs/2508.02324
7. Qwen-Image-2.1 GitHub README (defaults, 2K sizes, masks, PE models) — https://github.com/QwenLM/Qwen-Image-2.1
8. Qwen-Image-Lightning ("dense or small text: base model better") — https://github.com/ModelTC/Qwen-Image-Lightning
9. deapi Qwen-Image-Edit prompting guide (sign-text example) — https://deapi.ai/blog/qwen-image-edit-plus-prompting-guide-how-to-write-edit-instructions-that-actually-work
10. Alibaba Cloud 2.1 release ("type styles, layout") — https://www.alibabacloud.com/blog/603586
11. TextEncodeQwenImage21 node (`resolution` semantics) — https://docs.comfy.org/built-in-nodes/TextEncodeQwenImage21
