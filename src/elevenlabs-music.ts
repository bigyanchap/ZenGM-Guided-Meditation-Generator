import { appFetch } from './app-fetch';

/**
 * ElevenLabs Music — the only paid API left in ZenGM.
 * POST /v1/music with a composition plan (never a prompt AND a plan).
 * Silence chunks never reach the API; the app stitches real silence
 * between generated runs (see MusicBed + splitForElevenLabs).
 */
export async function composeElevenLabsMusic(opts: {
  apiKey: string;
  modelId: string;
  compositionPlan: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<Blob> {
  const res = await appFetch('https://api.elevenlabs.io/v1/music', {
    signal: opts.signal,
    method: 'POST',
    headers: { 'xi-api-key': opts.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      composition_plan: opts.compositionPlan,
      model_id: opts.modelId,
      force_instrumental: true,
      respect_sections_durations: true,
    }),
  });
  if (!res.ok) {
    let message = `ElevenLabs Music error: ${res.status} ${res.statusText}`;
    try {
      const err = (await res.json()) as { detail?: { message?: string; status?: string } | string };
      if (typeof err.detail === 'string') message = err.detail;
      else if (err.detail?.message) message = err.detail.message;
    } catch {
      /* keep the status-based message */
    }
    throw new Error(message);
  }
  return res.blob();
}

export const ELEVENLABS_MUSIC_MODELS = [
  { value: 'music_v2_5', label: 'Music v2.5 (best quality)' },
  { value: 'music_v2', label: 'Music v2' },
  { value: 'music_v1', label: 'Music v1 (legacy sections shape — not used by blueprints)' },
] as const;

export const ELEVENLABS_TTS_MODELS = [
  { value: 'eleven_multilingual_v2', label: 'Multilingual v2 (stable, best for Sanskrit words)' },
  { value: 'eleven_v3', label: 'v3 (most expressive)' },
  { value: 'eleven_flash_v2_5', label: 'Flash v2.5 (fast, cheapest)' },
] as const;
