# Wake-Up Script to ZenGM JSON

Convert a plain **wake-up / morning-energizing** guided script (any format) into the JSON that ZenGM's ElevenLabs API mode consumes: one `voice` block plus a `timeline` alternating spoken chunks and exact gaps. The app makes one ElevenLabs TTS call per chunk and inserts each gap as true silence locally, so gaps are exact, unlimited, and cost no credits — only spoken characters cost.

**How to use this skill:** give this file to an AI assistant (Claude, ChatGPT, or any assistant that accepts instructions) together with your wake-up script, and ask it to convert the script. It will hand you back a `.json` file ready to paste into ZenGM's JSON generator page.

**This is the WAKE-UP skill** — for morning awakening pieces that must leave the listener awake, clear, and ready to rise. **If the script is a deep-meditation / deep-rest / stillness piece, STOP and use the sibling skill `script_to_meditation_json` instead** — a deep, sleepy meditation voice is wrong for waking people up, and no tuning fixes a voice's native character; that is exactly why there are two skills.

## Output shape (exact)

```json
{
  "title": "The First Morning",
  "voice": {
    "persona": "in_m_whisper",
    "model_id": "eleven_multilingual_v2",
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

- Stress is written **into the chunk text itself** (capitalised word — see "Placing the stress"), so the JSON the user pastes into ZenGM is already the performance score; the app sends chunk text to ElevenLabs unchanged.
- `"delivery"` is an optional per-chunk tone note (e.g. `"clearly"`, `"warmly"`, `"softly"`). ZenGM turns it into a leading `[delivery]` audio tag when `model_id` is `eleven_v3`, and ignores it on other models. Omit it on most chunks.
- `gap` values are always whole seconds as a string: `"3s"`, `"45s"`, `"120s"` (never `"2m"` — one canonical form).
- No music fields. Music is added later, outside this JSON, by design.
- No API key ever appears in the file. The key lives in ZenGM Settings.
- This schema matches ZenGM's ElevenLabs (API) mode. If the app's schema changes, update this skill in the same change.

## Before spending credits (paid generation discipline)

- Prefer a **raw voice_id** as `persona`, never just a name to look up — a name lookup that misses can fall back silently to a different voice, and the generated audio then isn't the voice you chose.
- Before the first full generation with a new voice, generate a **short sample** (a few lines covering a declaration, the hardest Sanskrit in the piece, and a breath cue), show the user the resolved voice name + ID and the credit estimate, and let them judge pace and energy. A wake-up piece lives or dies on energy — if the sample sounds sleepy, do not tune around it for a full piece; say so.
- Estimate the full-piece cost from the **measured** sample pace, not from the planning estimate.

## Workflow

1. Read the whole script first. Identify its wake-up arc (half-awake arrival → breath that wakes → body wakes → declarations / intention → picturing the day → rise) and its single peak-intention point (the thesis declaration the whole piece builds to).
2. Segment the script into chunks (rules below).
3. Calculate a gap after every chunk, place every stress, and set every chunk's stability and speed (rules below) — this is the core craft of this skill; you decide all of them — the user does not mark or supply any of them.
4. Assemble the JSON, run the validation checklist, save the file, deliver with the summary.

## Preserve the user's words exactly

- Chunk text is the user's text, verbatim. Never paraphrase, polish, or silently fix wording. If a line looks like a typo or an unfinished thought, keep it and flag it in the delivery note instead.
- Legacy markers are instructions, not text: trailing dots (`Open your eyes...` = 3) and `(n)` markers state the gap after that line in seconds. Convert them to gap entries and restore single terminal punctuation in the chunk (`Open your eyes.`). An explicit marker **always wins** over your calculated gap — never override the user's stated number.
- Sanskrit words stay exactly as he wrote them (no transliteration, no respelling).

## Chunking rules

- One chunk = one unbroken flow of speech = one API call. A paragraph, or a tight group of sentences that belong to one breath of guidance.
- Start a new chunk when: an exact gap is needed; the topic or section shifts; an important declaration should stand alone so its gap lands cleanly after it.
- Very short fragments forming one image stay in ONE chunk (`Simple. Clear. Stable.` — the voice's own punctuation gives the micro-rhythm; do not shatter them into one-word chunks).
- Counted steps with their own pauses are separate chunks (`1.` … gap … `2.` … gap) when the script treats each step as an action to perform.
- Never split mid-sentence. Never strand a breath: if a chunk ends right after an inhale cue, its gap must cover the exhale too.
- Keep each chunk under roughly 500 characters; split longer paragraphs at a sentence boundary. (Short chunks also mean cheap regeneration of one passage later.)

## Calculating the gaps — your job

**Principle: a gap is the time the listener needs to DO or FEEL what was just said — and in a wake-up piece, momentum is part of the medicine.** Gaps serve the action, then the piece moves on. A wake-up piece drowned in silence puts the listener back to sleep; that failure is the mirror image of a deep piece cut short. Base table:

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

**Modifiers, applied after the base table:**

- **Explicit markers win.** Dots and `(n)` in the user's script are fixed; calculate only the gaps they left unmarked.
- **Repeated cycles stay equal.** Breath rounds, rotations, repeated scans: the same gap every round. Rhythm is the point; never taper later rounds.
- **Energy may build.** Across one waking sequence, gaps may gently shrink (8 → 6 → 4) as the listener wakes. Do not oscillate up-down-up between neighbouring gaps, and never shrink a breath gap below the breath itself.
- **Density guard.** Estimate spoken time as words ÷ 1.6 per second at speed ~0.95. Total silence should land around **25–40%** of the estimated runtime (a deep piece targets 35–55% — do not import that here). If a draft exceeds ~45%, trim the smallest *discretionary* gaps first (transitions, noticing) — never breath gaps, never the peak intention.
- **Floor.** Below 2s, do not create a gap at all — merge the sentences into one chunk and let punctuation breathe.
- When genuinely torn between two values, take the **shorter** one in a wake-up piece — momentum keeps a listener awake; the exception is the gap after the thesis declaration, where the longer value lets the intention land.

## Placing the stress — your job

Stress in guidance almost never means *louder*. It means **weight**: the word the listener's mind should land on, delivered a touch slower and heavier. Choosing every stress point and its level is your job; the user does not mark them. ElevenLabs reads stress from the text itself, so it is rendered inline:

| Level | Meaning | How it is written in the chunk |
|---|---|---|
| 1 — gentle | A word leans forward slightly | Punctuation shaping only: set the phrase off with commas or an em dash, or let a fragment stand alone (`Just... begin.`) |
| 2 — clear | The pivot word of the sentence | CAPITALISE that one word: `This day is a GIFT.` / `I choose to RISE.` |
| 3 — peak | The thesis declaration of a section; the moment the whole piece turns on | Capitalise the pivot word **and** give the line its own chunk, usually with a `"delivery"` note (`"clearly"` or `"warmly"`) and the peak-intention gap after it |

**Where stress belongs:**

- The semantic pivot — the word the meaning turns on. Wake-up pieces turn on verbs of beginning and words of light: *rise, begin, now, awake, alive, light, ready, choose, fresh, whole*.
- Declarations and affirmations: stress the predicate, one word (`I am READY.`).
- Felt questions: stress the feeling-word, gently (`Is this heaviness, or is this just HABIT?`).
- Sanskrit words and mantras are peaks by nature — **never capitalise them** (caps can distort their pronunciation, the exact failure he already hit with ElevenLabs). Give a mantra its own chunk and a real gap after it instead; stress the plain English anchor words around it.

**Density discipline (this is what keeps it guidance, not advertising):**

- At most **one** stressed word per sentence, at most **two** per chunk.
- Level 3 at most **once per section**, reserved for its thesis declaration. Most chunks have **no** marked stress at all — baseline clarity is the register; stress is precious because it is rare.
- Never capitalise function words (the, and, of), never a whole sentence, never inside counted steps (`1. 2. 3.`).
- The user's own emphasis in the source script (their capitals, their underlines, their repetitions) always wins and is preserved exactly — add around it, never replace it.
- Interplay with voice settings: capitalisation lands harder at lower stability. The declaration row (stability 0.4) is this skill's natural home for stress lines — note any voice-block change in the delivery summary.

## Per-chunk stability and speed — your job

Every chunk is its own ElevenLabs call, so **every chunk carries its own `"stability"` and `"speed"` fields, written out explicitly** — the JSON is self-describing and hand-editable, chunk by chunk (no hidden defaults). The values override the voice block for that chunk; the voice block remains the piece's baseline and reference. Persona and model never vary per chunk — the voice must stay one person.

**Recognizing the stability and speed level for each chunk is your job.** The user never supplies these values — you recognize what each chunk is doing and set its level accordingly, exactly like the gaps and the stress. Recognition cues:

- **Instruction / guidance** — imperatives to the body or attention ("open", "sit", "listen", "picture", "move") → baseline.
- **Breath cue** — the chunk drives one breath phase, or counts steps/holds → baseline.
- **Declaration / affirmation** — first-person, present-tense identity statements ("I am…", "I rise…", "I welcome…"), or the line the listener repeats after the voice → lean forward. These are the heart of a wake-up piece.
- **Felt question** — a question addressed to the listener's feeling, not their logic ("What would make today worth it?") → soften slightly.
- **Soft moment** — a brief gratitude or quiet-feeling line inside the waking ("feel this quiet, just for a moment") → slow slightly, never to deep-rest levels.
- **Rise / energizing close** — closing imperatives that enter the day ("open your eyes", "sit up", "stand", a greeting) → energize; this is the piece's destination, not an afterthought.

Set each chunk's values from its recognized type:

| Chunk type | stability | speed |
|---|---|---|
| Plain instruction / guidance (the baseline) | voice-block value (usually 0.5) | voice-block value (usually 0.95) |
| Breath cues, counted steps | baseline | baseline |
| Declaration / affirmation — the piece leans forward | 0.4 | 0.98–1.0 |
| Felt question | 0.45 | baseline |
| Soft moment (brief stillness, gratitude) | 0.55 | 0.9 |
| Rise / energizing close (open eyes, sit up, final greeting) | 0.45 | 1.0 |

Rules:

- **Every chunk gets both fields.** Baseline chunks simply repeat the voice-block values — written out, so anyone reading the file sees exactly what that chunk will be generated with, and can hand-edit one chunk without touching anything else.
- **Narrow band only:** stability stays within 0.4–0.6, speed within **0.9–1.0**. ElevenLabs voices shift character as stability moves; outside this band neighbouring chunks develop audible seams. Never let a wake-up chunk drift to the deep skill's 0.85 speeds — that is how a morning piece turns sleepy.
- **Move gradually.** Neighbouring chunks should not jump more than 0.1 in stability or 0.05 in speed — except across a section boundary, where a turn is natural.
- **Pair with stress:** a level-2 or level-3 stress line usually wants the declaration row (stability 0.4) — capitalisation lands harder at lower stability.

## Voice block

- `persona` identifies the ElevenLabs voice. **A raw ElevenLabs voice_id is the reliable choice**: the app then uses exactly that voice for every chunk. To use one, find a voice you like in the ElevenLabs Voice Library, add it to your own voices (your API key can only use voices in your library), and put its voice_id here.
- ZenGM also accepts its built-in persona names (e.g. `in_m_whisper`). A persona is resolved by looking up a voice *name* in your ElevenLabs account; if that voice is not in your account, the app quietly falls back to a default voice — which is why a raw voice_id is recommended.
- If the user names a voice in the request, that wins. Otherwise prefer a **soothing but bright, awake-sounding meditation voice** over both an energetic narrator voice and a deep, sleepy meditation voice — a voice's native character matters more than any setting, and a sleepy voice will put a morning listener back to sleep no matter how it is tuned.
- `model_id`: `eleven_multilingual_v2` by default — it handles Sanskrit words best. `eleven_v3` only when the user asks for more expressiveness.
- `stability` 0.5, `similarity_boost` 0.75 — sensible defaults; change only if the user asks.
- `speed`: **0.95 default for wake-up pieces** (0.98–1.0 for a strongly energizing piece). Never import the deep skill's 0.85.

## Validation checklist (run all before delivering)

- The JSON parses (mentally re-scan or run it through a parser when tooling is at hand).
- No two gaps in a row (merge them into one). No leading gap. No trailing gap after the final chunk.
- Every chunk is non-empty, ≤ ~500 characters, and contains no leftover `(n)` markers or dot-runs.
- Stress audit: ≤ 1 capitalised stress word per sentence, ≤ 2 per chunk, ≤ 1 level-3 line per section, no capitalised Sanskrit/mantra words, no capitalised function words. Every `"delivery"` note is a single calm tone word or two.
- Tuning audit: EVERY chunk carries explicit `"stability"` and `"speed"`; every stability is within 0.4–0.6 and every speed within **0.9–1.0**; neighbouring chunks jump ≤ 0.1 stability / ≤ 0.05 speed except across section boundaries; persona and model_id appear only in the voice block, never on a chunk.
- Every gap is a whole-second `"Ns"` string, ≥ 2s. The longest gap sits after the peak-intention declaration and is ≤ 20s.
- Energy audit: the final chunk is a rise/close chunk at speed 1.0 or the piece's joint-fastest; no chunk after the midpoint uses the soft-moment row twice in a row.
- Compute and report: chunk count, total spoken characters, estimated spoken time, total gap time, estimated total runtime, longest gap and where it sits.
- Credit estimate: spoken characters ≈ ElevenLabs credits used (standard TTS ≈ 1 credit per character). Label it an estimate.

## Deliver

- Save the result as `<title-slug>.json` (kebab-case from the title) and give the file to the user.
- With it, give a short summary only: estimated runtime (spoken + silence), number of chunks and gaps, the longest gap and why it's there, where the level-3 stress line sits, the stability/speed range used across the piece, the credit estimate, and any lines you flagged rather than fixed. Do not paste the whole JSON into the chat unless the user asks — the file is the deliverable, ready to paste into ZenGM.
