/**
 * Voice blueprint — the JSON ZenGM's ElevenLabs (API) mode consumes.
 *
 * Produced by hand or by the `script_to_meditation_json` skill: a voice
 * block plus a timeline alternating spoken chunks and exact gaps. The app
 * makes one ElevenLabs TTS call per chunk and inserts each gap as true
 * silence locally — gaps are exact, unlimited, and cost no credits.
 * There is deliberately NO music in this format; music is added later.
 */

export interface VoiceSpec {
  /** One of the 8 persona ids, or a raw ElevenLabs voice_id. */
  persona: string;
  model_id: string;
  stability: number;
  similarity_boost: number;
  speed: number;
}

export type TimelineItem =
  | { type: 'chunk'; text: string; delivery?: string }
  | { type: 'gap'; seconds: number };

export interface VoiceBlueprint {
  title: string;
  voice: VoiceSpec;
  timeline: TimelineItem[];
}

export interface VoiceBlueprintParse {
  blueprint: VoiceBlueprint | null;
  errors: string[];
  warnings: string[];
}

export const KNOWN_PERSONAS = [
  'in_m_whisper', 'in_m_commanding', 'in_f_whisper', 'in_f_commanding',
  'us_m_whisper', 'us_m_commanding', 'us_f_whisper', 'us_f_commanding',
] as const;

export const DEFAULT_VOICE: VoiceSpec = {
  persona: 'in_m_whisper',
  model_id: 'eleven_multilingual_v2',
  stability: 0.5,
  similarity_boost: 0.75,
  speed: 0.9,
};

/** Parse a gap value: 20, "20", "20s", "2m", "1m30s" → seconds (or null). */
export function parseGapValue(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const m = t.match(/^(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  return (m[1] ? parseFloat(m[1]) * 60 : 0) + (m[2] ? parseFloat(m[2]) : 0);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numInRange(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

export function parseVoiceBlueprint(jsonText: string): VoiceBlueprintParse {
  const errors: string[] = [];
  const warnings: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (e) {
    return { blueprint: null, errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`], warnings };
  }
  if (!isPlainObject(raw)) {
    return { blueprint: null, errors: ['Blueprint must be a JSON object.'], warnings };
  }

  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Guided Meditation';

  // --- voice block (every field optional, defaults fill in) ---
  const voice: VoiceSpec = { ...DEFAULT_VOICE };
  if (raw.voice !== undefined) {
    if (!isPlainObject(raw.voice)) {
      errors.push('"voice" must be an object.');
    } else {
      const v = raw.voice;
      if (typeof v.persona === 'string' && v.persona.trim()) {
        voice.persona = v.persona.trim();
        if (!(KNOWN_PERSONAS as readonly string[]).includes(voice.persona) && voice.persona.length < 15) {
          warnings.push(`Unknown persona "${voice.persona}" — it will be treated as a raw voice_id, which it does not look like. Known personas: ${KNOWN_PERSONAS.join(', ')}.`);
        }
      }
      if (typeof v.model_id === 'string' && v.model_id.trim()) voice.model_id = v.model_id.trim();
      if (v.stability !== undefined) {
        const n = numInRange(v.stability, 0, 1);
        if (n === null) errors.push('"voice.stability" must be a number between 0 and 1.');
        else voice.stability = n;
      }
      if (v.similarity_boost !== undefined) {
        const n = numInRange(v.similarity_boost, 0, 1);
        if (n === null) errors.push('"voice.similarity_boost" must be a number between 0 and 1.');
        else voice.similarity_boost = n;
      }
      if (v.speed !== undefined) {
        const n = numInRange(v.speed, 0.7, 1.2);
        if (n === null) errors.push('"voice.speed" must be a number between 0.7 and 1.2 (ElevenLabs limit).');
        else voice.speed = n;
      }
    }
  }

  // --- timeline ---
  if (!Array.isArray(raw.timeline) || raw.timeline.length === 0) {
    errors.push('"timeline" must be a non-empty array of { "chunk": "…" } and { "gap": "20s" } items.');
    return { blueprint: null, errors, warnings };
  }
  const timeline: TimelineItem[] = [];
  raw.timeline.forEach((item: unknown, i: number) => {
    const where = `Timeline item ${i + 1}`;
    if (!isPlainObject(item)) {
      errors.push(`${where}: must be an object like { "chunk": "…" } or { "gap": "20s" }.`);
      return;
    }
    const hasChunk = typeof item.chunk === 'string';
    const hasGap = item.gap !== undefined;
    if (hasChunk === hasGap) {
      errors.push(`${where}: give exactly one of "chunk" or "gap".`);
      return;
    }
    if (hasChunk) {
      const text = (item.chunk as string).trim();
      if (!text) {
        errors.push(`${where}: chunk text is empty.`);
        return;
      }
      if (text.length > 10000) {
        errors.push(`${where}: chunk is ${text.length} characters — ElevenLabs accepts at most ~10,000 per call. Split it.`);
        return;
      }
      if (text.length > 600) {
        warnings.push(`${where}: chunk is ${text.length} characters. Shorter chunks (≤ ~500) regenerate more cheaply and pace better.`);
      }
      const entry: TimelineItem = { type: 'chunk', text };
      if (typeof item.delivery === 'string' && item.delivery.trim()) {
        (entry as { delivery?: string }).delivery = item.delivery.trim();
      }
      timeline.push(entry);
    } else {
      const seconds = parseGapValue(item.gap);
      if (seconds === null || seconds <= 0) {
        errors.push(`${where}: gap must look like "20s", "2m" or a number of seconds.`);
        return;
      }
      timeline.push({ type: 'gap', seconds: Math.round(seconds * 10) / 10 });
    }
  });

  if (timeline.length > 0) {
    if (timeline[0].type === 'gap') errors.push('The timeline starts with a gap — remove it; a meditation starts with speech.');
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i].type === 'gap' && timeline[i - 1].type === 'gap') {
        errors.push(`Timeline items ${i} and ${i + 1} are both gaps — merge them into one.`);
      }
    }
    if (timeline[timeline.length - 1].type === 'gap') {
      warnings.push('The timeline ends with a gap; it will be kept, but a trailing silence is usually unwanted.');
    }
  }

  if (errors.length > 0) return { blueprint: null, errors, warnings };
  return { blueprint: { title, voice, timeline }, errors: [], warnings };
}

export interface BlueprintTotals {
  chunks: number;
  gaps: number;
  spokenChars: number;
  spokenWords: number;
  estSpokenSec: number;
  totalGapSec: number;
  estTotalSec: number;
}

export function blueprintTotals(bp: VoiceBlueprint): BlueprintTotals {
  let chunks = 0, gaps = 0, spokenChars = 0, spokenWords = 0, totalGapSec = 0;
  for (const item of bp.timeline) {
    if (item.type === 'chunk') {
      chunks++;
      spokenChars += item.text.length;
      spokenWords += item.text.split(/\s+/).filter(Boolean).length;
    } else {
      gaps++;
      totalGapSec += item.seconds;
    }
  }
  // Meditation pace ≈ 1.6 words per second at speed ~0.9 (see skill).
  const estSpokenSec = spokenWords / 1.6;
  return { chunks, gaps, spokenChars, spokenWords, estSpokenSec, totalGapSec, estTotalSec: estSpokenSec + totalGapSec };
}

/** The text actually sent to ElevenLabs for a chunk: v3 reads a leading
 *  [delivery] audio tag; other models get the plain text. */
export function chunkTextForApi(item: Extract<TimelineItem, { type: 'chunk' }>, modelId: string): string {
  if (item.delivery && modelId === 'eleven_v3') return `[${item.delivery}] ${item.text}`;
  return item.text;
}

export function formatSeconds(totalSec: number): string {
  const s = Math.round(totalSec);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export const DEFAULT_VOICE_BLUEPRINT = `{
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
    { "chunk": "And let it go." },
    { "gap": "5s" },
    { "chunk": "You are already COMPLETE.", "delivery": "softly" },
    { "gap": "12s" },
    { "chunk": "Rest in this stillness." },
    { "gap": "30s" }
  ]
}`;
