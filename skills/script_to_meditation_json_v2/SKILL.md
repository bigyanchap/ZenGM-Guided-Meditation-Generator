# Meditation Script to ZenGM JSON — Version 2

Convert a plain guided script (any format) into the JSON that ZenGM's ElevenLabs API mode consumes: one `voice` block plus a `timeline` alternating spoken chunks and exact gaps. The app makes one ElevenLabs TTS call per chunk and inserts each gap as true silence locally, so gaps are exact, unlimited, and cost no credits — only spoken characters cost.

**How to use this skill:** give this file to an AI assistant (Claude, ChatGPT, or any assistant that accepts instructions) together with your meditation script, and ask it to convert the script. It will hand you back a `.json` file ready to paste into ZenGM's JSON generator page.

**This is Version 2 of the skill**, revised after a research audit of ElevenLabs v4 practice (practitioner write-ups and ElevenLabs' own docs). **Version 1 (`script_to_meditation_json`, also in this repo's skills/ folder) is preserved unchanged** — its output was loved; v2 is the research-informed challenger, and it earns its place only by the listener's ear. Use v2 for new conversions unless you prefer v1.

**What changed from v1, and why:**

1. **Speed is gone.** ElevenLabs' own documentation: on `eleven_v4`, `speed`, `style` and `use_speaker_boost` are not supported — v4 honours only `stability` and `similarity_boost`. v1's speed fields were silent no-ops. Pacing on v4 comes from tags, punctuation, sentence length, stability — and the gaps, which were always local and real.
2. **Delivery is now written as tags in the chunk text.** v1's `"delivery"` field is only honoured by the app on `eleven_v3`; on v4 the text is sent as written, and v4 *performs* bracket tags (`[softly]`, `[slowly]`, `[exhales]`…) without speaking them. So v2 puts the tag in the text and drops the field.
3. **Stability moved up.** Meditation batch pipelines cluster near 0.80 for chunk-to-chunk volume consistency (0.50–0.65 caused volume inconsistency across many prompts); ElevenLabs' narration preset is 0.7. v2 baselines: Wake-Up 0.65, Deep 0.75, band 0.5–0.85 — high enough for consistency, dipping lower only where a tag needs room to act.
4. **IPA pronunciation annotation** for Sanskrit terms — every Sanskrit word or mantra gets an IPA approximation at its first occurrence (v4-native mechanism), plus numbers spelled out in chunk text.
5. **Deliberately NOT adopted:** context stitching (`previous_text` / request IDs) — meditation practitioners report cumulative volume drift and pace inflation from chaining, so chunks stay independently generated; `seed` (best-effort only, not reproducible in practice); SSML/`<break>` (dead on v4); blanket de-breathing (breaths are cues in this genre).

**One voice, one model, two modes.** Every piece uses **Monika Sogam** on **eleven_v4**. Only the MODE changes — gap lengths and tuning rows — never the voice or model:

- **Wake-Up mode** — morning/energizing pieces that must leave the listener awake, clear, and ready to rise.
- **Deep mode** — deep-meditation / deep-rest / stillness pieces.

Judge the mode from the script's arc: builds toward rising and beginning the day → Wake-Up; builds toward stillness and letting go → Deep.

## Output shape (exact)

```json
{
  "title": "The First Morning",
  "voice": {
    "persona": "1mrmwdWVC5cggRCdxBXt",
    "model_id": "eleven_v4",
    "stability": 0.65,
    "similarity_boost": 0.75
  },
  "timeline": [
    { "chunk": "You are already awake.", "stability": 0.65 },
    { "gap": "4s" },
    { "chunk": "Take one full breath, and let the body wake with it.", "stability": 0.65 },
    { "gap": "8s" },
    { "chunk": "[warmly] I RISE to meet this day.", "stability": 0.55 },
    { "gap": "6s" },
    { "chunk": "Open your eyes. Sit up. Begin.", "stability": 0.6 }
  ]
}
```

(The example is Wake-Up mode: voice stability 0.65. A Deep piece's voice block is identical except `stability` 0.75.)

- **No `speed` anywhere** — not in the voice block, not on chunks. (ZenGM's parser accepts its absence; its internal default is ignored by v4 anyway.)
- **No `"delivery"` field.** Delivery lives in the text as a bracket tag — see "Delivery tags".
- Stress is written **into the chunk text itself** (capitalised word — see "Placing the stress"); the app sends chunk text to ElevenLabs unchanged, tags included.
- `gap` values are always whole seconds as a string: `"3s"`, `"45s"`, `"120s"` (never `"2m"` — one canonical form).
- No music fields. Music is added later, outside this JSON, by design.
- No API key ever appears in the file. The key lives in ZenGM Settings.

## Before spending credits (paid generation discipline)

- The `persona` must be the **raw voice ID**, never a name to look up — a name lookup that misses falls back silently to a different voice. The voice must be in your own ElevenLabs voices first (your API key can only use voices in your library).
- **Judge v2 by A/B:** before the first full v2 generation, regenerate the same short sample you used for v1 in v2 form and compare the two by ear. Same discipline per mode after that: a short sample (declaration + hardest Sanskrit + breath cue), resolved voice name + ID and credit estimate shown, the listener's ear decides.
- Credit estimate: spoken characters ≈ credits (1 credit/character on v4). **Budget tags as costing characters** (sources conflict on whether tags are billed; assume they are).

## Workflow

1. Read the whole script first. Decide the mode. Identify the arc (Wake-Up: half-awake arrival → breath that wakes → body wakes → declarations / intention → picturing the day → rise; Deep: settling → body/breath → deepening → deepest rest → return) and its single peak point.
2. Segment into chunks. Spell out any digits in chunk text as words.
3. Calculate a gap after every chunk, place every stress, set every chunk's stability, place delivery tags and any IPA annotations — all of this is **your job**; the user never supplies gaps, stress, tuning, tags, or pronunciations.
4. Assemble the JSON, run the validation checklist, save the file, deliver with the summary.

## Preserve the user's words exactly

- Chunk text is the user's text, verbatim. Never paraphrase, polish, or silently fix wording — flag odd lines in the delivery note instead. (Two v2 exceptions that CHANGE the text by design, both flagged in the delivery note when used: digits spelled out as words, and IPA annotations added beside a Sanskrit term.)
- Legacy markers are instructions, not text: trailing dots (`Close your eyes...` = 3), `(n)` markers, and bracketed markers (`[60 seconds gap]`, `[30 seconds gap]`) state the gap after that line in seconds. Convert them to gap entries and restore single terminal punctuation. An explicit marker **always wins** over your calculated gap: a marked gap is reproduced at **exactly** its stated seconds — never re-sized to fit the tables, never rounded, and never trimmed by the density guard. The tables size only the gaps the author left unmarked; if marked gaps push the silence share outside the mode's band, report that instead of cutting a marked gap.
- Sanskrit words stay exactly as written (no transliteration, no respelling). Pronunciation help is added via IPA annotation only — see "Pronunciation".

## Chunking rules

- One chunk = one unbroken flow of speech = one API call. Prefer a **connected passage** (the phrases of one movement that flow together) over an arbitrary slice.
- Start a new chunk when: an exact gap is needed; the topic or section shifts; an important line should stand alone so its gap lands cleanly after it.
- Very short fragments forming one image stay in ONE chunk (`Simple. Clear. Stable.`). Counted steps with their own pauses are separate chunks (`One.` … gap … `Two.` … gap — numbers spelled out) when each step is an action to perform.
- Avoid lone ultra-short chunks where possible — a cold-started one-line call is the most variable unit — **except** deliberate standalones: a peak line or a mantra chunk is short on purpose.
- Never split mid-sentence. Never strand a breath: if a chunk ends right after an inhale cue, its gap must cover the exhale too.
- Keep each chunk under roughly 500 characters; split longer paragraphs at a sentence boundary.

## Calculating the gaps — your job

**Principle: a gap is the time the listener needs to DO or FEEL what was just said.** (Unchanged from v1 — the research endorsed authored gaps as data: only a gap entry gives an exact rest. Tags and ellipses are for *inside* a chunk, never a substitute for a gap entry.)

### Wake-Up mode gaps

Momentum is part of the medicine. Gaps serve the action, then the piece moves on.

| What the chunk just asked | Gap |
|---|---|
| Simple physical compliance (open eyes a moment, silence phone, hands rest) | 2–4s |
| Posture / movement / stretch | 4–6s |
| One inhale cue | 4–5s |
| One exhale cue | 4–5s |
| Chunk ends mid-breath-cycle | ~8s (cover the full cycle) |
| Each counted step / rotation in a sequence | 3–5s |
| Body-waking noticing, per body part | 4–6s |
| A declaration / affirmation | 4–8s |
| A question to feel | 6–10s |
| An identity-level declaration or question | 8–15s |
| Picturing the day ahead | 8–12s |
| Section transition | 4–8s |
| Brief stillness | 8–15s |
| The peak-intention point (thesis declaration) | The longest gap of the piece: 10–20s |
| Rise cue before final words | 5–10s |
| After the final line | No gap |

### Deep mode gaps

Stillness is the medicine. When torn between two values, take the longer one.

| What the chunk just asked | Gap |
|---|---|
| Simple physical compliance | 3–5s |
| Posture / movement | 5–8s |
| One inhale cue | 4–5s |
| One exhale cue | 5–6s |
| Chunk ends mid-breath-cycle | ~10s |
| Each counted step / rotation in a sequence | 4–6s |
| Body-scan noticing, per body part | 5–8s |
| An affirmation | 5–10s |
| A question to feel | 8–12s |
| An identity-level question | 12–20s |
| A visualization scene | 8–15s |
| Section transition | 6–10s |
| Pure rest — *just be, drop everything* | 20–60s |
| The deepest rest point | The longest gap of the piece: 30–120s |
| Return cue before final words | 8–15s |
| After the final line | No gap |

**Modifiers (both modes):** explicit markers always win and are reproduced at exactly their stated seconds — never trimmed; repeated cycles keep equal gaps; Wake-Up gaps may gently shrink as energy builds, Deep gaps may escalate as the listener settles, never oscillate; density guard — spoken estimate = words ÷ 1.6/sec, silence target **Wake-Up 25–40%**, **Deep 35–55%** of estimated runtime, trimming discretionary gaps first (never breath gaps, never the peak); performed-action gaps are real time — if a performed script's silence share exceeds target, flag it rather than trimming below the action; below 2s, no gap at all — merge into one chunk.

## Delivery tags — your job (new in v2)

On v4, delivery is directed **in the text**: a square-bracket tag placed immediately before the words it colours is performed, not spoken. This replaces both v1's `delivery` field and its speed dial.

**Vocabulary (use only these families — the ones launch-week tests found reliable):**

| Family | Tags | Use |
|---|---|---|
| Tone | `[softly]`, `[quietly]`, `[warmly]`, `[whispers]` | A line whose whole colour changes: a soft moment, a gratitude line, the peak line |
| Pace | `[slowly]`, `[drawn out]` | The v4 replacement for a lower speed: a line that must land slowly |
| Breath | `[sighs]`, `[exhales]` | A breath cue where the voice itself should breathe/sigh — only where the script's moment calls for it |
| In-chunk pause | `[pause]`, `[long pause]` | A distinct beat *inside* a chunk (see Pacing) |

**Discipline:**

- **At most one tag per chunk**, at its head (or directly before the phrase it colours). Most chunks carry **no tag at all** — neutral lines stay plain; tags can tip a calm sentence into over-acting, and a tag only works where the voice already has that delivery in it.
- Tags pair with **lower stability** on that chunk (0.5–0.6): lower stability is what gives the voice room to act on a tag. A tagged chunk at 0.8 will mostly ignore its tag.
- Never tag counted steps, plain instructions, or Sanskrit/mantras themselves (a tone tag *before* a mantra chunk is fine — it colours the delivery, not the words).
- Sound-effect and accent tags are experimental and unpredictable — never use them in a meditation piece.
- Budget every tag as costing its characters in credits.

## Pacing without speed — your job (new in v2)

v4 has no speed control. Pace a chunk with these levers, in this order:

1. **Sentence length and punctuation** — shorter sentences and commas slow a read; ellipses (`...`) give a short in-chunk pause and a trailing-off feel. The script's own prose ellipses are rhythm, preserved as written.
2. **`[pause]` / `[long pause]`** — for a distinct beat inside a chunk where an ellipsis is too weak. (Which of ellipses vs `[pause]` Monika honours better is untested — the A/B sample is the place to learn it; do not mix both in one chunk.)
3. **`[slowly]` / `[drawn out]` tags** — for a whole line that must land slowly.
4. **Stability** — a steadier chunk reads more evenly; a lower-stability chunk varies more.
5. **The gaps** — real rest is always a gap entry, never a tag.

## Placing the stress — your job

Stress means **weight**, not loudness: the word the listener's mind should land on. (Unchanged from v1, with the level-3 mechanism updated to tags.)

| Level | Meaning | How it is written |
|---|---|---|
| 1 — gentle | A word leans forward slightly | Punctuation shaping only: commas, an em dash, or a fragment standing alone |
| 2 — clear | The pivot word of the sentence | CAPITALISE that one word: `You are already COMPLETE.` / `This day is a GIFT.` |
| 3 — peak | The thesis line of a section | Capitalise the pivot word **and** give the line its own chunk **and** a delivery tag (`[warmly]`/`[clearly]` in Wake-Up, `[softly]`/`[slowly]` in Deep) at stability 0.5–0.6, with a longer gap after it (Wake-Up: the peak-intention gap; Deep: +2–4s over the table value) |

- Pivots: Deep — *not, never, drop, let go, rest, still, whole, enough, complete, already*; Wake-Up — *rise, begin, now, awake, alive, light, ready, choose, fresh, whole*.
- Density: ≤ 1 stressed word per sentence, ≤ 2 per chunk, level 3 ≤ once per section; most chunks have none.
- **Never capitalise Sanskrit words, mantras, or divine names** (caps can distort pronunciation, and all-caps tokens risk being read as acronyms). A mantra gets its own chunk and a real gap.
- The user's own emphasis in the source always wins and is preserved exactly.

## Per-chunk stability — your job (the only per-chunk dial in v2)

Every chunk carries its own explicit `"stability"` — written out, no hidden defaults — because stability is the one per-chunk control v4 actually honours. **Recognizing each chunk's level is your job**, from its mode's table. There is no per-chunk speed in v2.

### Wake-Up mode (voice block stability 0.65)

| Chunk type | stability |
|---|---|
| Plain instruction / guidance (baseline) | 0.65 |
| Breath cues, counted steps | baseline |
| Declaration / affirmation — the piece leans forward | 0.5–0.55 (also where `[warmly]`/`[clearly]` tags live) |
| Felt question | 0.6 |
| Soft moment (brief stillness, gratitude) | 0.7 (pair with `[softly]` when the colour turns) |
| Rise / energizing close | 0.6 |

### Deep mode (voice block stability 0.75)

| Chunk type | stability |
|---|---|
| Plain instruction / guidance (baseline) | 0.75 |
| Breath cues, counted steps | baseline |
| Declaration / affirmation | 0.55–0.6 |
| Felt question | 0.7 |
| Deep-rest line, pure being, the deepest point | 0.8–0.85 |
| Return / closing | 0.7 |

Rules (both modes): stability stays within **0.5–0.85**; neighbouring chunks jump ≤ 0.1 except across a section boundary; a chunk carrying a delivery tag sits at **0.5–0.6** regardless of its row (the tag needs the room); persona and model never vary per chunk.

## Pronunciation (new in v2)

- v4's native mechanism is **inline IPA**: the transcription wrapped in slashes inside double quotes, placed with the term — `Gam Ganapataye "/ɡəm ɡəˈnɑːpətəjeɪ/"` — stress marks included. **Rule: every Sanskrit word and mantra receives an IPA approximation** — at its first occurrence in the piece, and always on standalone mantra chunks. Build the approximation from how the word is actually pronounced (long vowels, retroflex consonants, ś/ṣ as "sh"), not from its spelling. It rides inside the chunk text, so it is visible in ZenGM's chunk cards — a known cosmetic cost.
- Build a small **glossary per piece** (term → IPA) and list it in the delivery note, so the user can correct it once and reuse it across pieces. Once the user has approved a term's IPA, reuse that exact transcription in later pieces — their corrections accumulate into a standing vocabulary. Recurring vocabulary across many pieces is what ElevenLabs pronunciation dictionaries are for — ZenGM does not support dictionaries yet (app roadmap), so inline IPA is the v2 mechanism.
- **Honesty rule:** no one has published Sanskrit-specific results on ElevenLabs for any model, and v4's IPA "results vary by voice". Every piece's sample must include its hardest mantra line; if Monika still misses, iterate the IPA on that line alone (cheap) rather than respelling the sacred text.
- Never respell Sanskrit into the chunk text as the default fix, and never capitalise it for stress.

## Voice block

- **Monika Sogam — Soothing Meditation, voice_id `1mrmwdWVC5cggRCdxBXt`, model `eleven_v4`** — every piece, both modes. Raw ID as `persona` (the app resolves names by lookup and falls back silently; the raw ID always lands). If the user names a different voice/model in the request, that wins for that piece.
- `stability`: **0.65 Wake-Up / 0.75 Deep** (v2 baselines above). `similarity_boost` 0.75 (the default; ElevenLabs' narration preset uses 0.5 for more natural variation — change only if the user asks).
- No `speed`, no `style`, no `use_speaker_boost` — v4 does not honour them.

## Not in the JSON (app-side roadmap, recorded so it is not lost)

These research findings belong to ZenGM the app, not to this JSON, and v2 does **not** encode them: loudness normalisation of the stitched file (≈ −18 LUFS, −1.5 dBTP), millisecond fades at splice points, a `gap_fill` choice (room tone vs pure silence), requesting `wav_44100`/`pcm_44100` (or MP3 192) instead of the default MP3 128, trimming each generated clip's own trailing pause before adding the authored gap, pronunciation-dictionary support, and per-chunk takes/freeze. If the app is extended later, this list is the starting brief.

## Validation checklist (run all before delivering)

- The JSON parses (run it through ZenGM or a parser when tooling is at hand; do not eyeball).
- Mode decided and stated; all values checked against that mode's tables.
- **No `speed` field anywhere; no `delivery` field anywhere.** Every chunk carries explicit `"stability"` within 0.5–0.85; neighbours jump ≤ 0.1 except across sections; tagged chunks sit at 0.5–0.6.
- Tag audit: ≤ 1 tag per chunk, only from the vocabulary above, none on counted steps or neutral instruction lines, none on Sanskrit text itself; level-3 lines = caps pivot + own chunk + tag + longer gap.
- Stress audit: ≤ 1 capitalised word per sentence, ≤ 2 per chunk, ≤ 1 level-3 per section, no capitalised Sanskrit/mantra/function words.
- Pronunciation audit: every Sanskrit term carries its IPA approximation at first occurrence; annotations match the piece glossary; the sample covered the hardest mantra.
- No digits anywhere in chunk text (numbers spelled out). Every author-marked gap (dots, `(n)`, `[N seconds gap]`) reproduced at exactly its stated seconds. No leftover `(n)` markers or dot-run markers (the script's prose ellipses are rhythm and stay).
- No two gaps in a row; no leading gap; no trailing gap. Every gap a whole-second `"Ns"` string ≥ 2s; the longest gap sits at the mode's peak.
- Mode audits: Wake-Up — the final chunk is a rise/close; no soft-moment row twice in a row after the midpoint. Deep — silence share in the 35–55% band or the deviation is explained by performed actions.
- Report: chunk count, spoken characters (tags included), estimated spoken time, total gap time, estimated runtime, longest gap + why, level-3 line location, stability range used, credit estimate (tags budgeted as billed), flagged lines, and the piece glossary if any IPA was used.

## Deliver

- Save the result as `<title-slug>.json` (v2 conversions of an existing piece get a `-v2` suffix so v1 files are never overwritten) and give the file to the user.
- Short summary only: mode, estimated runtime (spoken + silence), chunks/gaps, longest gap and why, level-3 line, stability range, tags used, credit estimate, flagged lines. Do not paste the whole JSON unless asked.
