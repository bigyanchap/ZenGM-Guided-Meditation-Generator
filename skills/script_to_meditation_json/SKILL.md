# Meditation Script to ZenGM JSON

Convert a plain guided-meditation script (any format) into the JSON that ZenGM's ElevenLabs API mode consumes: one `voice` block plus a `timeline` alternating spoken chunks and exact gaps. The app makes one ElevenLabs TTS call per chunk and inserts each gap as true silence locally, so gaps are exact, unlimited, and cost no credits — only spoken characters cost.

**How to use this skill:** give this file to an AI assistant (Claude, ChatGPT, or any assistant that accepts instructions) together with your meditation script, and ask it to convert the script. It will hand you back a `.json` file ready to paste into ZenGM's JSON generator page.

**This is the DEEP meditation skill** — for stillness, deep-rest, and sleep-adjacent pieces. **If the script is a wake-up / morning-energizing piece, use the sibling skill `script_to_wakeup_json` instead** (also in this repo's skills/ folder) — it carries the wake-up arc, brisker gaps, faster tuning, and awake-voice guidance; a deep-meditation treatment would put a morning listener back to sleep.

## Output shape (exact)

```json
{
  "title": "Morning Stillness",
  "voice": {
    "persona": "in_m_whisper",
    "model_id": "eleven_multilingual_v2",
    "stability": 0.5,
    "similarity_boost": 0.75,
    "speed": 0.9
  },
  "timeline": [
    { "chunk": "Close your eyes." },
    { "gap": "3s" },
    { "chunk": "Take a slow breath in through your nose." },
    { "gap": "5s" },
    { "chunk": "You are already COMPLETE.", "delivery": "softly", "stability": 0.4, "speed": 0.95 },
    { "gap": "12s" },
    { "chunk": "Rest in this stillness.", "stability": 0.6, "speed": 0.85 }
  ]
}
```

- Stress is written **into the chunk text itself** (capitalised word — see "Placing the stress"), so the JSON pasted into ZenGM is already the performance score; the app sends chunk text to ElevenLabs unchanged.
- `"delivery"` is an optional per-chunk tone note (e.g. `"softly"`, `"slowly"`, `"whispering"`). ZenGM turns it into a leading `[delivery]` audio tag when `model_id` is `eleven_v3`, and ignores it on other models. Omit it on most chunks.
- `gap` values are always whole seconds as a string: `"3s"`, `"45s"`, `"120s"` (never `"2m"` — one canonical form).
- No music fields. Music is added later, outside this JSON, by design.
- No API key ever appears in the file. The key lives in ZenGM Settings.
- This schema matches ZenGM's ElevenLabs (API) mode. If the app's schema changes, update this skill in the same change.

## Workflow

1. Read the whole script first. Identify its arc (settling → body/breath → deepening → deepest rest → return) and its single deepest rest point.
2. Segment the script into chunks (rules below).
3. Calculate a gap after every chunk, place every stress, and set every chunk's stability and speed (rules below) — this is the core craft of this skill; you decide all of them — the user does not mark or supply any of them.
4. Assemble the JSON, run the validation checklist, save the file, deliver with the summary.

## Preserve the user's words exactly

- Chunk text is the user's text, verbatim. Never paraphrase, polish, or silently fix wording. If a line looks like a typo or an unfinished thought, keep it and flag it in the delivery note instead.
- Legacy markers are instructions, not text: trailing dots (`Close your eyes...` = 3) and `(n)` markers state the gap after that line in seconds. Convert them to gap entries and restore single terminal punctuation in the chunk (`Close your eyes.`). An explicit marker **always wins** over your calculated gap — never override the user's stated number.
- Sanskrit words stay exactly as written (no transliteration, no respelling).

## Chunking rules

- One chunk = one unbroken flow of speech = one API call. A paragraph, or a tight group of sentences that belong to one breath of guidance.
- Start a new chunk when: an exact gap is needed; the topic or section shifts; an important question should stand alone so its gap lands cleanly after it.
- Very short fragments forming one image stay in ONE chunk (`Simple. Clear. Stable.` — the voice's own punctuation gives the micro-rhythm; do not shatter them into one-word chunks).
- Counted steps with their own pauses are separate chunks (`1.` … gap … `2.` … gap) when the script treats each step as an action to perform.
- Never split mid-sentence. Never strand a breath: if a chunk ends right after an inhale cue, its gap must cover the exhale too.
- Keep each chunk under roughly 500 characters; split longer paragraphs at a sentence boundary. (Short chunks also mean cheap regeneration of one passage later.)

## Calculating the gaps — your job

**Principle: a gap is the time the listener needs to DO or FEEL what was just said.** Size it by what the instruction demands, not by line length. Base table:

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

**Modifiers, applied after the base table:**

- **Explicit markers win.** Dots and `(n)` in the script are fixed; calculate only the gaps left unmarked.
- **Repeated cycles stay equal.** Breath rounds, rotations, repeated scans: the same gap every round. Rhythm is the point; never taper later rounds.
- **Deepening may escalate.** Inside one settling sequence, gaps may grow (5 → 8 → 12 → 30) as the listener settles. Do not oscillate up-down-up between neighbouring gaps.
- **Density guard.** Estimate spoken time as words ÷ 1.6 per second (meditation pace at speed ~0.9). Total silence should land around 35–55% of the estimated runtime. If a draft exceeds ~60%, trim the smallest *discretionary* gaps first (transitions, noticing) — never breath gaps, never the deepest rest.
- **Floor.** Below 2s, do not create a gap at all — merge the sentences into one chunk and let punctuation breathe.
- When genuinely torn between two values, take the longer one. In meditation, a gap that feels slightly long is calm; a gap that feels short is a mistake the listener notices.

## Placing the stress — your job

Stress in a guided meditation almost never means *louder*. It means **weight**: the word the listener's mind should land on, delivered a touch slower and heavier. Choosing every stress point and its level is your job; the user does not mark them. ElevenLabs reads stress from the text itself, so it is rendered inline:

| Level | Meaning | How it is written in the chunk |
|---|---|---|
| 1 — gentle | A word leans forward slightly | Punctuation shaping only: set the phrase off with commas or an em dash, or let a fragment stand alone (`Just... rest.`) |
| 2 — clear | The pivot word of the sentence | CAPITALISE that one word: `You are already COMPLETE.` / `My worth is NOT measured in output.` |
| 3 — peak | The thesis line of a section; the moment the whole piece turns on | Capitalise the pivot word **and** give the line its own chunk, usually with a `"delivery"` note (`"softly"` or `"slowly"`) and a longer gap after it (+2–4s over the table value, so the stress can land) |

**Where stress belongs:**

- The semantic pivot — the word the meaning turns on. Negations and release words carry meditations: *not, never, drop, let go, rest, still, whole, enough, complete, already*.
- Declarations and affirmations: stress the predicate, one word (`I am ENOUGH.`).
- Felt questions: stress the feeling-word, gently (`Is this clarity, or is this PRESSURE?`).
- Sanskrit words and mantras are peaks by nature — **never capitalise them** (caps can distort their pronunciation). Give a mantra its own chunk and a real gap after it instead; stress the plain English anchor words around it.

**Density discipline (this is what keeps it meditation, not advertising):**

- At most **one** stressed word per sentence, at most **two** per chunk.
- Level 3 at most **once per section**, reserved for its thesis line. Most chunks have **no** marked stress at all — baseline calm is the register; stress is precious because it is rare.
- Never capitalise function words (the, and, of), never a whole sentence, never inside counted steps (`1. 2. 3.`).
- The user's own emphasis in the source script (their capitals, their underlines, their repetitions) always wins and is preserved exactly — add around it, never replace it.
- Interplay with voice settings: capitalisation lands harder at lower stability. Keep `stability` 0.5 as the baseline; only for a declaration-heavy awakening piece may the voice block drop to 0.4 to let the stresses move — note it in the delivery summary when you do.

## Per-chunk stability and speed — your job

Every chunk is its own ElevenLabs call, so **every chunk carries its own `"stability"` and `"speed"` fields, written out explicitly** — the JSON is self-describing and hand-editable, chunk by chunk (no hidden defaults). The values override the voice block for that chunk; the voice block remains the piece's baseline and reference. Persona and model never vary per chunk — the voice must stay one person.

**Recognizing the stability and speed level for each chunk is your job.** The user never supplies these values — you recognize what each chunk is doing and set its level accordingly, exactly like the gaps and the stress. Recognition cues:

- **Instruction / guidance** — imperatives to the body or attention ("close", "rest", "listen", "picture", "move") → baseline.
- **Breath cue** — the chunk drives one breath phase, or counts steps/holds → baseline.
- **Declaration / affirmation** — first-person, present-tense identity statements ("I am…", "I carry…", "I welcome…"), or the line the listener repeats after the voice → lean forward.
- **Felt question** — a question addressed to the listener's feeling, not their logic ("What is it that excites you?") → soften slightly.
- **Deep-rest line** — the chunk releases effort or imagery ("let go", "just be", "keep only the feeling"), or is the piece's deepest point → slow and steady.
- **Return** — closing imperatives that re-enter the world ("open your eyes", "sit up", a greeting) → energize.

Set each chunk's values from its recognized type:

| Chunk type | stability | speed |
|---|---|---|
| Plain instruction / guidance (the baseline) | voice-block value (usually 0.5) | voice-block value (usually 0.9) |
| Breath cues, counted steps | baseline | baseline |
| Declaration / affirmation — the piece leans forward | 0.4 | 0.95 |
| Felt question | 0.45 | baseline |
| Deep-rest line, pure being, the deepest point | 0.6 | 0.85 |
| Return / energizing close (open eyes, sit up, final greeting) | baseline | 0.92–0.95 |

Rules:

- **Every chunk gets both fields.** Baseline chunks simply repeat the voice-block values — written out, so anyone reading the file sees exactly what that chunk will be generated with, and can hand-edit one chunk without touching anything else.
- **Narrow band only:** stability stays within 0.4–0.6, speed within 0.85–0.95. ElevenLabs voices shift character as stability moves; outside this band neighbouring chunks develop audible seams.
- **Move gradually.** Neighbouring chunks should not jump more than 0.1 in stability or 0.05 in speed — except across a section boundary, where a turn is natural.
- **Pair with stress:** a level-2 or level-3 stress line usually wants the declaration row (stability 0.4) — capitalisation lands harder at lower stability. A level-3 deep-rest line is the exception: keep it slow and high (0.6 / 0.85) — weight through stillness, not force.
- `"delivery"` stays independent of these fields and v3-only, as before.

## Voice block

- `persona` identifies the ElevenLabs voice. **A raw ElevenLabs voice_id is the reliable choice**: the app then uses exactly that voice for every chunk. To use one, find a voice you like in the ElevenLabs Voice Library, add it to your own voices (your API key can only use voices in your library), and put its voice_id here.
- ZenGM also accepts its built-in persona names (e.g. `in_m_whisper`). A persona is resolved by looking up a voice *name* in your ElevenLabs account; if that voice is not in your account, the app quietly falls back to a default voice — which is why a raw voice_id is recommended.
- If the user names a voice in the request, that wins. Otherwise prefer a calm, soft voice suited to meditation over an energetic narrator voice — a voice's native character matters more than any setting.
- `model_id`: `eleven_multilingual_v2` by default — it handles Sanskrit words best. `eleven_v3` only when the user asks for more expressiveness.
- `stability` 0.5, `similarity_boost` 0.75 — sensible defaults; change only if the user asks.
- `speed`: 0.9 default; 0.85 for deep-rest pieces; 0.95–1.0 for morning energizing pieces.

## Validation checklist (run all before delivering)

- The JSON parses (mentally re-scan or run it through a parser when tooling is at hand).
- No two gaps in a row (merge them into one). No leading gap. No trailing gap after the final chunk.
- Every chunk is non-empty, ≤ ~500 characters, and contains no leftover `(n)` markers or dot-runs.
- Stress audit: ≤ 1 capitalised stress word per sentence, ≤ 2 per chunk, ≤ 1 level-3 line per section, no capitalised Sanskrit/mantra words, no capitalised function words. Every `"delivery"` note is a single calm tone word or two.
- Tuning audit: EVERY chunk carries explicit `"stability"` and `"speed"`; every stability is within 0.4–0.6 and every speed within 0.85–0.95; neighbouring chunks jump ≤ 0.1 stability / ≤ 0.05 speed except across section boundaries; persona and model_id appear only in the voice block, never on a chunk.
- Every gap is a whole-second `"Ns"` string, ≥ 2s.
- Compute and report: chunk count, total spoken characters, estimated spoken time, total gap time, estimated total runtime, longest gap and where it sits.
- Credit estimate: spoken characters ≈ ElevenLabs credits used (standard TTS ≈ 1 credit per character). Label it an estimate.

## Deliver

- Save the result as `<title-slug>.json` (kebab-case from the title) and give the file to the user.
- With it, give a short summary only: estimated runtime (spoken + silence), number of chunks and gaps, the longest gap and why it's there, where the level-3 stress line sits, the stability/speed range used across the piece, the credit estimate, and any lines you flagged rather than fixed. Do not paste the whole JSON into the chat unless the user asks — the file is the deliverable, ready to paste into ZenGM.
