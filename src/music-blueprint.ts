/**
 * Music blueprint: the JSON composition plan that drives the Music Bed.
 *
 * Two engines consume the same blueprint:
 * - ElevenLabs Music (paid): generation chunks are sent as a composition plan
 *   to POST /v1/music. Silence chunks are never sent — the app stitches real
 *   silence into the bed between generated runs.
 * - ZenGM Synth (free, local): every chunk (including silence) is planned and
 *   rendered in-app with WebAudio. `root` / `scale` are synth-only extras.
 */

export type ContextAdherence = 'low' | 'medium' | 'high';

export interface BlueprintChunk {
  type: 'generation' | 'silence';
  /** Section label + cues, e.g. "[Opening] Singing bowl, drone fading in." */
  text: string;
  duration_ms: number;
  positive_styles: string[];
  negative_styles: string[];
  context_adherence: ContextAdherence;
  /** Synth only: root note like "D3" or "C#4". */
  root?: string;
  /** Synth only: scale name, e.g. "raga yaman", "major", "pentatonic". */
  scale?: string;
}

export interface MusicBlueprint {
  chunks: BlueprintChunk[];
}

export interface BlueprintParseResult {
  plan: MusicBlueprint | null;
  errors: string[];
  warnings: string[];
}

export const MAX_CHUNKS = 30;
/** ElevenLabs composition-plan limits (per chunk / total). Synth ignores them. */
export const EL_MIN_CHUNK_MS = 3000;
export const EL_MAX_CHUNK_MS = 120000;
export const EL_MAX_TOTAL_MS = 600000;

const ADHERENCE_VALUES: ReadonlyArray<ContextAdherence> = ['low', 'medium', 'high'];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toStyleList(v: unknown): string[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') return null;
    const t = item.trim();
    if (t) out.push(t);
  }
  return out;
}

export function parseBlueprint(jsonText: string): BlueprintParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (e) {
    return { plan: null, errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`], warnings };
  }

  if (!isPlainObject(raw) || !Array.isArray(raw.chunks)) {
    return { plan: null, errors: ['Blueprint must be a JSON object with a "chunks" array.'], warnings };
  }
  if (raw.chunks.length === 0) {
    return { plan: null, errors: ['The blueprint has no chunks. Add at least one chunk.'], warnings };
  }
  if (raw.chunks.length > MAX_CHUNKS) {
    errors.push(`Too many chunks: ${raw.chunks.length}. Maximum is ${MAX_CHUNKS}.`);
  }

  const chunks: BlueprintChunk[] = [];
  raw.chunks.forEach((rawChunk: unknown, i: number) => {
    const where = `Chunk ${i + 1}`;
    if (!isPlainObject(rawChunk)) {
      errors.push(`${where}: must be an object.`);
      return;
    }
    const duration = rawChunk.duration_ms;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
      errors.push(`${where}: "duration_ms" must be a positive number.`);
      return;
    }

    if (rawChunk.type === 'silence') {
      chunks.push({
        type: 'silence',
        text: '',
        duration_ms: Math.round(duration),
        positive_styles: [],
        negative_styles: [],
        context_adherence: 'high',
      });
      return;
    }

    const text = rawChunk.text;
    if (typeof text !== 'string' || !text.trim()) {
      errors.push(`${where}: "text" must be a non-empty string (or use { "type": "silence" } for a silent chunk).`);
      return;
    }
    const positive = toStyleList(rawChunk.positive_styles);
    if (positive === null) {
      errors.push(`${where}: "positive_styles" must be an array of strings.`);
      return;
    }
    const negative = toStyleList(rawChunk.negative_styles);
    if (negative === null) {
      errors.push(`${where}: "negative_styles" must be an array of strings.`);
      return;
    }
    let adherence: ContextAdherence = 'high';
    if (rawChunk.context_adherence !== undefined) {
      if (ADHERENCE_VALUES.includes(rawChunk.context_adherence as ContextAdherence)) {
        adherence = rawChunk.context_adherence as ContextAdherence;
      } else {
        errors.push(`${where}: "context_adherence" must be "low", "medium" or "high".`);
        return;
      }
    }

    const chunk: BlueprintChunk = {
      type: 'generation',
      text: text.trim(),
      duration_ms: Math.round(duration),
      positive_styles: positive,
      negative_styles: negative,
      context_adherence: adherence,
    };
    if (typeof rawChunk.root === 'string' && rawChunk.root.trim()) chunk.root = rawChunk.root.trim();
    if (typeof rawChunk.scale === 'string' && rawChunk.scale.trim()) chunk.scale = rawChunk.scale.trim();

    if (duration < EL_MIN_CHUNK_MS || duration > EL_MAX_CHUNK_MS) {
      warnings.push(
        `${where}: ${Math.round(duration)} ms is outside ElevenLabs' per-chunk range (${EL_MIN_CHUNK_MS}–${EL_MAX_CHUNK_MS} ms). The free Synth accepts it; ElevenLabs may reject it.`,
      );
    }
    chunks.push(chunk);
  });

  if (errors.length > 0 || chunks.length === 0) {
    return { plan: null, errors: errors.length ? errors : ['No valid chunks found.'], warnings };
  }

  const total = blueprintTotalMs({ chunks });
  if (total > EL_MAX_TOTAL_MS) {
    warnings.push(
      `Total length ${(total / 1000).toFixed(0)}s exceeds ElevenLabs' 10-minute maximum. The free Synth accepts it; ElevenLabs may reject it.`,
    );
  }
  return { plan: { chunks }, errors: [], warnings };
}

export function blueprintTotalMs(plan: MusicBlueprint): number {
  return plan.chunks.reduce((acc, c) => acc + c.duration_ms, 0);
}

/**
 * Proportionally scale every chunk so the blueprint totals `targetMs`,
 * keeping each chunk at least 500 ms. Rounding drift is absorbed by the
 * longest chunk. The input plan is not mutated.
 */
export function scaleBlueprintToTotal(plan: MusicBlueprint, targetMs: number): MusicBlueprint {
  const total = blueprintTotalMs(plan);
  if (total <= 0 || targetMs <= 0) return { chunks: plan.chunks.map(c => ({ ...c })) };
  const factor = targetMs / total;
  const scaled = plan.chunks.map(c => ({
    ...c,
    duration_ms: Math.max(500, Math.round(c.duration_ms * factor)),
  }));
  const drift = targetMs - scaled.reduce((a, c) => a + c.duration_ms, 0);
  if (drift !== 0 && scaled.length > 0) {
    let longest = 0;
    for (let i = 1; i < scaled.length; i++) {
      if (scaled[i].duration_ms > scaled[longest].duration_ms) longest = i;
    }
    scaled[longest] = { ...scaled[longest], duration_ms: Math.max(500, scaled[longest].duration_ms + drift) };
  }
  return { chunks: scaled };
}

/** Split a plan into runs for ElevenLabs: consecutive generation chunks are
 *  composed together; silence chunks become stitch points. */
export type BedPart =
  | { kind: 'compose'; chunks: BlueprintChunk[] }
  | { kind: 'silence'; duration_ms: number };

export function splitForElevenLabs(plan: MusicBlueprint): BedPart[] {
  const parts: BedPart[] = [];
  let run: BlueprintChunk[] = [];
  const flush = () => {
    if (run.length) parts.push({ kind: 'compose', chunks: run });
    run = [];
  };
  for (const chunk of plan.chunks) {
    if (chunk.type === 'silence') {
      flush();
      parts.push({ kind: 'silence', duration_ms: chunk.duration_ms });
    } else {
      run.push(chunk);
    }
  }
  flush();
  return parts;
}

/** The composition_plan object ElevenLabs expects for one compose call. */
export function toElevenLabsPlan(chunks: BlueprintChunk[]): Record<string, unknown> {
  return {
    chunks: chunks
      .filter(c => c.type === 'generation')
      .map(c => ({
        text: c.text,
        duration_ms: c.duration_ms,
        positive_styles: c.positive_styles,
        negative_styles: c.negative_styles,
        context_adherence: c.context_adherence,
      })),
  };
}

/** Human title for a chunk card: the [Bracketed] label if present, else the first words. */
export function chunkTitle(chunk: BlueprintChunk): string {
  if (chunk.type === 'silence') return 'Silence';
  const bracket = chunk.text.match(/^\s*\[([^\]]+)\]/);
  if (bracket) return bracket[1].trim();
  const words = chunk.text.replace(/\s+/g, ' ').trim().split(' ');
  return words.slice(0, 4).join(' ') + (words.length > 4 ? '…' : '');
}

export function formatMs(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const MEDITATION_TEMPLATE = `{
  "chunks": [
    {
      "text": "[Opening] Instrumental only. A single singing bowl strike, then a warm tanpura drone fades in very slowly. Spacious, almost still.",
      "duration_ms": 60000,
      "positive_styles": ["tanpura drone", "singing bowl", "slow", "spacious", "warm", "minimal"],
      "negative_styles": ["drums", "percussion", "vocals", "melody", "sudden changes", "tension"],
      "context_adherence": "high",
      "root": "D3",
      "scale": "raga yaman"
    },
    {
      "text": "[Deepening] Instrumental only. The drone continues unchanged. A distant bansuri flute plays a few long, slow notes with long silences between them.",
      "duration_ms": 180000,
      "positive_styles": ["bansuri flute", "very slow", "meditative", "soft", "minimal"],
      "negative_styles": ["rhythm", "drums", "bright", "busy", "vocals"],
      "context_adherence": "high",
      "root": "D3",
      "scale": "raga yaman"
    },
    {
      "text": "[Return] Instrumental only. Flute stops. Only the drone remains, fading gently. One final singing bowl strike, then near-silence to the end.",
      "duration_ms": 60000,
      "positive_styles": ["tanpura drone", "singing bowl", "fading", "silence-friendly"],
      "negative_styles": ["new instruments", "ending flourish", "drums", "vocals", "melody"],
      "context_adherence": "high",
      "root": "D3",
      "scale": "raga yaman"
    }
  ]
}`;

export const WAKEUP_TEMPLATE = `{
  "chunks": [
    {
      "text": "[Dawn] Instrumental only. Soft piano notes like first light, very quiet, slow.",
      "duration_ms": 30000,
      "positive_styles": ["soft piano", "ambient", "peaceful", "slow awakening"],
      "negative_styles": ["drums", "loud", "sudden", "vocals"],
      "context_adherence": "high",
      "root": "C4",
      "scale": "major"
    },
    {
      "text": "[Rising] Instrumental only. Warm strings join the piano, gently brighter, hopeful, still calm.",
      "duration_ms": 60000,
      "positive_styles": ["warm strings", "piano", "uplifting", "gentle energy"],
      "negative_styles": ["percussion", "electronic", "dramatic", "vocals"],
      "context_adherence": "high",
      "root": "C4",
      "scale": "major"
    }
  ]
}`;

export const EMPTY_TEMPLATE = `{
  "chunks": [
    {
      "text": "[Section] Describe the music here.",
      "duration_ms": 60000,
      "positive_styles": [],
      "negative_styles": [],
      "context_adherence": "high"
    }
  ]
}`;
