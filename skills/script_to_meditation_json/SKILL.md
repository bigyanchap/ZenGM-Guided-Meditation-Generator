# Meditation Script to ZenGM JSON

Convert a plain guided script (any format) into the JSON that ZenGM's ElevenLabs API mode consumes: one `voice` block plus a `timeline` alternating spoken chunks and exact gaps. The app makes one ElevenLabs TTS call per chunk and inserts each gap as true silence locally, so gaps are exact, unlimited, and cost no credits — only spoken characters cost.

**How to use this skill:** give this file to an AI assistant (Claude, ChatGPT, or any assistant that accepts instructions) together with your meditation script, and ask it to convert the script. It will hand you back a `.json` file ready to paste into ZenGM's JSON generator page.

**One voice, one model, two modes.** Every piece, wake-up or deep, uses the same voice and model — **Monika Sogam** on **eleven_v4** (see "Voice block"). What changes between pieces is only the MODE — the gap lengths and tuning rows — never the voice or the model:

- **Wake-Up mode** — morning/energizing pieces that must leave the listener awake, clear, and ready to rise. Brisker gaps, faster band, ends on a rise.
- **Deep mode** — deep-meditation / deep-rest / stillness pieces. Longer gaps, slower band, ends in rest.

Judge the mode from the script's arc before scoring: if the piece builds toward rising and beginning the day, it is Wake-Up; if it builds toward stillness and letting go, it is Deep.

## Output shape (exact)

```json
{
  "title": "The First Morning",
  "voice": {
    "persona": "1mrmwdWVC5cggRCdxBXt",
    "model_id": "eleven_v4",
    "stability": 0.5,
    "similarity_boost": 0.75,
    "speed": 0.95
  },
  "timeline": [
    { "chunk": "You are already awake.", "stability": 0.5, "speed": 0.95 },
    { "gap": "4s" },
    { "chunk": "Take one full breath, and let the body wake with it.", "stability": 0.5, "speed": 0.95 },
    { "gap": "8s" },
    { "chunk": "I RISE to meet this day.", "delivery": "clearly", "stability": 0.4, "speed": 0.98 },
    { "gap": "6s" },
    { "chunk": "Open your eyes. Sit up. Begin.", "stability": 0.45, "speed": 1.0 }
  ]
}
```

(The example is Wake-Up mode. A Deep piece's voice block is identical except `speed` 0.9, and its chunks follow the Deep tables below.)

- Stress is written **into the chunk text itself** (capitalised word — see "Placing the stress"), so the JSON pasted into ZenGM is already the performance score; the app sends chunk text to ElevenLabs unchanged.
- `"delivery"` is an optional per-chunk tone note (e.g. `"softly"`, `"warmly"`, `"clearly"`). **Know its current limit:** ZenGM prepends it as an audio tag only when `model_id` is `eleven_v3`; on `eleven_v4` the app sends the chunk text without the tag. Keep delivery notes sparse and meaningful (they record intent and will take effect if the app's tag rule is extended to v4), but never rely on a tag to carry a line — the text and tuning must do the work.
- `gap` values are always whole seconds as a string: `"3s"`, `"45s"`, `"120s"` (never `"2m"` — one canonical form).
- No music fields. Music is added later, outside this JSON, by design.
- No API key ever appears in the file. The key lives in ZenGM Settings.
- This schema matches ZenGM's ElevenLabs (API) mode. If the app's schema changes, update this skill in the same change.

## Before spending credits (paid generation discipline)

- The `persona` must be the **raw voice ID** below, never a name to look up — a name lookup that misses falls back silently to a different voice.
- Before the first full generation in a mode, generate a **short sample** (a few lines covering a declaration, the hardest Sanskrit in the piece, and a breath cue), show the user the resolved voice name + ID and the credit estimate, and let them judge pace and energy. Estimate the full-piece cost from the **measured** sample pace, not from the planning estimate.
- Credit estimate: spoken characters ≈ ElevenLabs credits used. eleven_v4 bills at the same rate as the older models — **1 credit per character** — so the estimates in this skill hold unchanged on v4.

## Workflow

1. Read the whole script first. Decide the mode (Wake-Up or Deep). Identify the arc (Wake-Up: half-awake arrival → breath that wakes → body wakes → declarations / intention → picturing the day → rise; Deep: settling → body/breath → deepening → deepest rest → return) and its single peak point (Wake-Up: the thesis declaration the piece builds to; Deep: the deepest rest point).
2. Segment the script into chunks (rules below).
3. Calculate a gap after every chunk, place every stress, and set every chunk's stability and speed (rules below) — this is the core craft of this skill; you decide all of them — the user does not mark or supply any of them.
4. Assemble the JSON, run the validation checklist, save the file, deliver with the summary.

## Preserve the user's words exactly

- Chunk text is the user's text, verbatim. Never paraphrase, polish, or silently fix wording. If a line looks like a typo or an unfinished thought, keep it and flag it in the delivery note instead.
- Legacy markers are instructions, not text: trailing dots (`Close your eyes...` = 3) and `(n)` markers state the gap after that line in seconds. Convert them to gap entries and restore single terminal punctuation in the chunk (`Close your eyes.`). An explicit marker **always wins** over your calculated gap — never override the user's stated number.
- Sanskrit words stay exactly as written (no transliteration, no respelling).

## Chunking rules

- One chunk = one unbroken flow of speech = one API call. A paragraph, or a tight group of sentences that belong to one breath of guidance.
- Start a new chunk when: an exact gap is needed; the topic or section shifts; an important line (a declaration, a thesis line, the deepest rest) should stand alone so its gap lands cleanly after it.
- Very short fragments forming one image stay in ONE chunk (`Simple. Clear. Stable.` — the voice's own punctuation gives the micro-rhythm; do not shatter them into one-word chunks).
- Counted steps with their own pauses are separate chunks (`1.` … gap … `2.` … gap) when the script treats each step as an action to perform.
- Never split mid-sentence. Never strand a breath: if a chunk ends right after an inhale cue, its gap must cover the exhale too.
- Keep each chunk under roughly 500 characters; split longer paragraphs at a sentence boundary. (Short chunks also mean cheap regeneration of one passage later.)

## Calculating the gaps — your job

**Principle: a gap is the time the listener needs to DO or FEEL what was just said.** Size it by what the instruction demands, not by line length. Use the table for the piece's mode.

### Wake-Up mode gaps

Momentum is part of the medicine. Gaps serve the action, then the piece moves on; a wake-up piece drowned in silence puts the listener back to sleep.

| What the chunk just asked | Gap |
|---|---|
| Simple physical compliance (open eyes a moment, silence phone, hands rest) | 2–4s |
| Posture / movement / stretch (sit up straighter, roll shoulders, stretch once) | 4–6s |
| One inhale cue | 4–5s (the breath itself) |
| One exhale cue | 4–5s |
| Chunk ends mid-breath-cycle (inhale given, exhale not yet spoken) | ~8s (cover the full cycle) |
| Each counted step / rotation in a sequence | 3–5s |
| Body-waking noticing, per body part (hands, face, spine) | 4–6s |
| A declaration / affirmation to repeat silently or feel | 4–8s |
| A question to feel (not answer with logic) | 6–10s |
| An identity-level declaration or question (*Who am I today?*) | 8–15s |
| Picturing the day ahead (a scene to form) | 8–12s |
| Section transition (topic changes) | 4–8s |
| Brief stillness — *collect yourself, feel the quiet before the day* | 8–15s (never the 20–60s of a deep piece) |
| The script's peak-intention point (its thesis declaration) | The longest gap of the piece: 10–20s, so the intention can settle before the rise |
| Rise cue (sit up, open your eyes, stand) before final words | 5–10s |
| After the final line | No gap (the file simply ends) |

### Deep mode gaps

Stillness is the medicine. A deep piece cut short is a mistake the listener notices; when torn between two values, take the longer one.

| What the chunk just asked | Gap |
|---|---|
| Simple physical compliance (close eyes, silence phone, hands rest) | 3–5s |
| Posture / movement (settle spine, rotate shoulders once) | 5–8s |
| One inhale cue | 4–5s (the breath itself) |
| One exhale cue | 5–6s |
| Chunk ends mid-breath-cycle (inhale given, exhale not yet spoken) | ~10s (cover the full cycle) |
| Each counted step / rotation in a sequence | 4–6s |
| Body-scan noticing, per body part (jaw, shoulders, forehead) | 5–8s |
| An affirmation to repeat silently or feel | 5–10s |
| A question to feel (not answer with logic) | 8–12s |
| An identity-level question (*Am I still whole?*) | 12–20s |
| A visualization scene to form | 8–15s (more if the scene is elaborate) |
| Section transition (topic changes) | 6–10s |
| Pure rest — *just be, drop everything, nothing to do* | 20–60s |
| The script's deepest rest point | The longest gap of the piece: 30–120s |
| Return cue (slowly open your eyes) before final words | 8–15s |
| After the final line | No gap (the file simply ends) |

**Modifiers, applied after the base table (both modes):**

- **Explicit markers win.** Dots and `(n)` in the script are fixed; calculate only the gaps left unmarked.
- **Repeated cycles stay equal.** Breath rounds, rotations, repeated scans: the same gap every round. Rhythm is the point; never taper later rounds.
- **Shape within a sequence.** Wake-Up: gaps may gently shrink (8 → 6 → 4) as energy builds. Deep: gaps may escalate (5 → 8 → 12 → 30) as the listener settles. Never oscillate up-down-up between neighbouring gaps, and never shrink a breath gap below the breath itself.
- **Density guard.** Estimate spoken time as words ÷ 1.6 per second. Total silence target: **Wake-Up 25–40%** of the estimated runtime; **Deep 35–55%**. If a draft exceeds the mode's ceiling (~45% / ~60%), trim the smallest *discretionary* gaps first (transitions, noticing) — never breath gaps, never the peak. Performed-action gaps (a stretch, a humming exhale, a half-asleep listener's slow compliance) are real time: if a script is inherently performed lying down, its silence share may sit above target — flag that in the delivery note rather than trimming a gap below the action it serves.
- **Floor.** Below 2s, do not create a gap at all — merge the sentences into one chunk and let punctuation breathe.

## Placing the stress — your job

Stress in guidance almost never means *louder*. It means **weight**: the word the listener's mind should land on, delivered a touch slower and heavier. Choosing every stress point and its level is your job; the user does not mark them. ElevenLabs reads stress from the text itself, so it is rendered inline:

| Level | Meaning | How it is written in the chunk |
|---|---|---|
| 1 — gentle | A word leans forward slightly | Punctuation shaping only: set the phrase off with commas or an em dash, or let a fragment stand alone (`Just... rest.`) |
| 2 — clear | The pivot word of the sentence | CAPITALISE that one word: `You are already COMPLETE.` / `This day is a GIFT.` |
| 3 — peak | The thesis line of a section; the moment the whole piece turns on | Capitalise the pivot word **and** give the line its own chunk, usually with a `"delivery"` note (`"softly"`/`"slowly"` in Deep mode, `"clearly"`/`"warmly"` in Wake-Up mode) and a longer gap after it (Wake-Up: the peak-intention gap; Deep: +2–4s over the table value, so the stress can land) |

**Where stress belongs:**

- The semantic pivot — the word the meaning turns on. Deep pieces turn on negations and release words: *not, never, drop, let go, rest, still, whole, enough, complete, already*. Wake-Up pieces turn on verbs of beginning and words of light: *rise, begin, now, awake, alive, light, ready, choose, fresh, whole*.
- Declarations and affirmations: stress the predicate, one word (`I am ENOUGH.` / `I am READY.`).
- Felt questions: stress the feeling-word, gently (`Is this clarity, or is this PRESSURE?`).
- Sanskrit words and mantras are peaks by nature — **never capitalise them** (caps can distort their pronunciation). Give a mantra its own chunk and a real gap after it instead; stress the plain English anchor words around it.

**Density discipline (this is what keeps it guidance, not advertising):**

- At most **one** stressed word per sentence, at most **two** per chunk.
- Level 3 at most **once per section**, reserved for its thesis line. Most chunks have **no** marked stress at all — baseline is the register; stress is precious because it is rare.
- Never capitalise function words (the, and, of), never a whole sentence, never inside counted steps (`1. 2. 3.`).
- The user's own emphasis in the source script (their capitals, their underlines, their repetitions) always wins and is preserved exactly — add around it, never replace it.
- Interplay with voice settings: capitalisation lands harder at lower stability. A level-2 or level-3 stress line usually pairs with the declaration row of the piece's mode (stability 0.4). A level-3 deep-rest line is the exception: keep it slow and high (0.6 / 0.85) — weight through stillness, not force.

## Per-chunk stability and speed — your job

Every chunk is its own ElevenLabs call, so **every chunk carries its own `"stability"` and `"speed"` fields, written out explicitly** — the JSON is self-describing and hand-editable, chunk by chunk (no hidden defaults). The values override the voice block for that chunk; the voice block remains the piece's baseline and reference. Persona and model never vary per chunk — the voice must stay one person.

**Recognizing the stability and speed level for each chunk is your job.** The user never supplies these values — you recognize what each chunk is doing and set its level from the piece's mode table, exactly like the gaps and the stress.

### Wake-Up mode tuning (voice block: stability 0.5, speed 0.95)

Recognition cues: instruction/guidance → baseline; breath cue / counted steps → baseline; declaration/affirmation (first-person present-tense identity, or the line the listener repeats) → lean forward; felt question → soften slightly; soft moment (brief gratitude or quiet feeling inside the waking) → slow slightly, never to Deep levels; rise/energizing close → energize — the piece's destination, not an afterthought.

| Chunk type | stability | speed |
|---|---|---|
| Plain instruction / guidance (the baseline) | 0.5 | 0.95 |
| Breath cues, counted steps | baseline | baseline |
| Declaration / affirmation — the piece leans forward | 0.4 | 0.98–1.0 |
| Felt question | 0.45 | baseline |
| Soft moment (brief stillness, gratitude) | 0.55 | 0.9 |
| Rise / energizing close (open eyes, sit up, final greeting) | 0.45 | 1.0 |

### Deep mode tuning (voice block: stability 0.5, speed 0.9)

Recognition cues: instruction/guidance → baseline; breath cue / counted steps → baseline; declaration/affirmation → lean forward; felt question → soften slightly; deep-rest line ("let go", "just be", "keep only the feeling", or the piece's deepest point) → slow and steady; return/energizing close → baseline stability, speed 0.92–0.95.

| Chunk type | stability | speed |
|---|---|---|
| Plain instruction / guidance (the baseline) | 0.5 | 0.9 |
| Breath cues, counted steps | baseline | baseline |
| Declaration / affirmation — the piece leans forward | 0.4 | 0.95 |
| Felt question | 0.45 | baseline |
| Deep-rest line, pure being, the deepest point | 0.6 | 0.85 |
| Return / energizing close (open eyes, sit up, final greeting) | baseline | 0.92–0.95 |

Rules (both modes):

- **Every chunk gets both fields.** Baseline chunks simply repeat the voice-block values — written out, so anyone reading the file sees exactly what that chunk will be generated with, and can hand-edit one chunk without touching anything else.
- **Narrow band only:** stability stays within 0.4–0.6 in both modes; speed stays within **0.9–1.0 (Wake-Up)** or **0.85–0.95 (Deep)**. Never let a Wake-Up chunk drift to Deep speeds — that is how a morning piece turns sleepy; never let a Deep chunk run at Wake-Up speeds — that is how a rest piece turns brisk.
- **Move gradually.** Neighbouring chunks should not jump more than 0.1 in stability or 0.05 in speed — except across a section boundary, where a turn is natural.
- `"delivery"` stays independent of these fields, subject to the v4 tag limit noted above.

## Voice block

- **This skill's voice: Monika Sogam — Soothing Meditation, voice_id `1mrmwdWVC5cggRCdxBXt`, on model `eleven_v4`.** Use this raw voice_id as the `persona` value and `eleven_v4` as the `model_id` for every piece, both modes. The voice must be added to your own ElevenLabs voices first (your API key can only use voices in your library). If the user names a different voice or model in the request, that wins for that piece.
- Why this pair: Monika's calm, clear delivery works for both waking and resting pieces, and v4 ranked first for pronunciation robustness in independent testing — which matters for Sanskrit lines. The tuning bands in this skill were calibrated for a calm voice like hers; a much more energetic voice will not suit them.
- ZenGM also accepts its built-in persona names (e.g. `in_m_whisper`), but a persona is resolved by looking up a voice *name* in your ElevenLabs account; if that voice is not in your account, the app quietly falls back to a default voice — which is why a raw voice_id is the reliable choice.
- `stability` 0.5, `similarity_boost` 0.75 — sensible defaults; change only if the user asks.
- `speed`: **0.95 in Wake-Up mode, 0.9 in Deep mode.**

## Validation checklist (run all before delivering)

- The JSON parses (mentally re-scan or run it through a parser when tooling is at hand).
- The mode is decided and stated; every value below is checked against that mode's tables.
- No two gaps in a row (merge them into one). No leading gap. No trailing gap after the final chunk.
- Every chunk is non-empty, ≤ ~500 characters, and contains no leftover `(n)` markers or dot-runs.
- Stress audit: ≤ 1 capitalised stress word per sentence, ≤ 2 per chunk, ≤ 1 level-3 line per section, no capitalised Sanskrit/mantra words, no capitalised function words. Every `"delivery"` note is a single calm tone word or two.
- Tuning audit: EVERY chunk carries explicit `"stability"` and `"speed"`; stability within 0.4–0.6; speed within the mode's band (Wake-Up 0.9–1.0, Deep 0.85–0.95); neighbouring chunks jump ≤ 0.1 stability / ≤ 0.05 speed except across section boundaries; persona and model_id appear only in the voice block, never on a chunk. Voice block is Monika's ID + `eleven_v4`.
- Every gap is a whole-second `"Ns"` string, ≥ 2s. The longest gap sits at the mode's peak (Wake-Up: after the peak-intention declaration, ≤ 20s unless the user's explicit marker says otherwise; Deep: at the deepest rest point).
- Mode audits: Wake-Up — the final chunk is a rise/close chunk at speed 1.0 or the piece's joint-fastest; no chunk after the midpoint uses the soft-moment row twice in a row. Deep — silence share lands in the 35–55% band or the deviation is explained by performed actions.
- Compute and report: chunk count, total spoken characters, estimated spoken time, total gap time, estimated total runtime, longest gap and where it sits.
- Credit estimate: spoken characters ≈ ElevenLabs credits used (1 credit per character, v4 included). Label it an estimate.

## Deliver

- Save the result as `<title-slug>.json` (kebab-case from the title) and give the file to the user.
- With it, give a short summary only: the mode, estimated runtime (spoken + silence), number of chunks and gaps, the longest gap and why it's there, where the level-3 stress line sits, the stability/speed range used across the piece, the credit estimate, and any lines you flagged rather than fixed. Do not paste the whole JSON into the chat unless the user asks — the file is the deliverable, ready to paste into ZenGM.
