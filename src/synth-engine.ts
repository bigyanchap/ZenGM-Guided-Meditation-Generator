/**
 * ZenGM Synth — the free, local music engine.
 *
 * Turns a music blueprint into a meditation bed with WebAudio alone:
 * no model, no API, no cost. Style words in each chunk select instruments;
 * banned style words remove them. The planner (`planSynthEvents`) is pure
 * and unit-tested; the renderer draws the plan into an OfflineAudioContext
 * so `duration_ms` is honoured to the sample.
 */
import type { BlueprintChunk, MusicBlueprint } from './music-blueprint';

export type SynthInstrument = 'drone' | 'bowl' | 'pad' | 'flute' | 'noise';

export interface SynthEvent {
  kind: 'drone' | 'bowl' | 'padChord' | 'fluteNote' | 'noise';
  /** Seconds from the start of the bed. */
  startSec: number;
  durSec: number;
  /** Frequencies in Hz (chords carry several). */
  freqs: number[];
  gain: number;
}

/** Semitone offsets from the root. */
export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  'raga yaman': [0, 2, 4, 6, 7, 9, 11],
  'raga bhairavi': [0, 1, 3, 5, 7, 8, 10],
  drone: [0, 7],
};

export function resolveScale(name: string | undefined): number[] {
  if (!name) return SCALES['raga yaman'];
  return SCALES[name.trim().toLowerCase()] ?? SCALES['raga yaman'];
}

const NOTE_SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3, E: 4, F: 5,
  'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8, A: 9, 'A#': 10, BB: 10, B: 11,
};

/** "D3" / "C#4" / "A2" → frequency in Hz (A4 = 440). Defaults to D3. */
export function noteToFreq(note: string | undefined): number {
  if (!note) return noteToFreq('D3');
  const m = note.trim().toUpperCase().match(/^([A-G])([#B]?)(-?\d)$/);
  if (!m) return noteToFreq('D3');
  const semis = NOTE_SEMITONES[m[1] + (m[2] || '')];
  if (semis === undefined) return noteToFreq('D3');
  const octave = parseInt(m[3], 10);
  const midi = (octave + 1) * 12 + semis;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Deterministic PRNG so plans (and tests) are stable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INSTRUMENT_KEYWORDS: Record<SynthInstrument, string[]> = {
  drone: ['tanpura', 'drone', 'om', 'tambura', 'shruti'],
  bowl: ['bowl', 'bell', 'chime', 'singing bowl'],
  pad: ['pad', 'strings', 'ambient wash', 'warm strings', 'synth pad'],
  flute: ['flute', 'bansuri', 'piano', 'melody line'],
  noise: ['rain', 'noise', 'wind', 'ocean', 'river', 'nature'],
};

function stylesContain(styles: string[], keywords: string[]): boolean {
  const joined = styles.join(' ').toLowerCase();
  return keywords.some(k => joined.includes(k));
}

/** Which instruments a chunk uses: positives select, negatives veto. */
export function instrumentsForChunk(chunk: BlueprintChunk): SynthInstrument[] {
  if (chunk.type === 'silence') return [];
  const picked: SynthInstrument[] = [];
  (Object.keys(INSTRUMENT_KEYWORDS) as SynthInstrument[]).forEach(inst => {
    if (stylesContain(chunk.positive_styles, INSTRUMENT_KEYWORDS[inst])) picked.push(inst);
  });
  // A bed with no recognised instrument still needs its foundation.
  if (picked.length === 0) picked.push('drone');
  return picked.filter(inst => !stylesContain(chunk.negative_styles, INSTRUMENT_KEYWORDS[inst]));
}

function scaleTone(rootFreq: number, scale: number[], degree: number, octaveShift = 0): number {
  const len = scale.length;
  const idx = ((degree % len) + len) % len;
  const octaves = Math.floor(degree / len) + octaveShift;
  return rootFreq * Math.pow(2, (scale[idx] + 12 * octaves) / 12);
}

/**
 * Plan the whole bed: one flat, time-ordered event list.
 * Silence chunks produce no events — the timeline simply passes through them.
 */
export function planSynthEvents(plan: MusicBlueprint): SynthEvent[] {
  const events: SynthEvent[] = [];
  let cursorSec = 0;

  plan.chunks.forEach((chunk, chunkIdx) => {
    const durSec = chunk.duration_ms / 1000;
    const start = cursorSec;
    cursorSec += durSec;
    if (chunk.type === 'silence') return;

    const root = noteToFreq(chunk.root);
    const scale = resolveScale(chunk.scale);
    const instruments = instrumentsForChunk(chunk);
    const rand = mulberry32(1234 + chunkIdx * 777);

    if (instruments.includes('drone')) {
      events.push({ kind: 'drone', startSec: start, durSec, freqs: [root, root * 1.5], gain: 0.16 });
    }
    if (instruments.includes('noise')) {
      events.push({ kind: 'noise', startSec: start, durSec, freqs: [], gain: 0.05 });
    }
    if (instruments.includes('bowl')) {
      // A strike near the start, then sparse strikes every ~18–30 s.
      let t = start + 0.4;
      let k = 0;
      while (t < start + durSec - 4) {
        const degree = [0, 2, 4, 1][k % 4];
        events.push({
          kind: 'bowl', startSec: t, durSec: 7,
          freqs: [scaleTone(root, scale, degree, 1)], gain: 0.14,
        });
        t += 18 + rand() * 12;
        k++;
      }
    }
    if (instruments.includes('pad')) {
      // Slow chord wash: a new chord roughly every 20 s.
      const progression = [0, 4, 5, 3];
      let t = start;
      let k = 0;
      while (t < start + durSec) {
        const chordRootDegree = progression[k % progression.length];
        const freqs = [0, 2, 4].map(step => scaleTone(root, scale, chordRootDegree + step, 0));
        events.push({ kind: 'padChord', startSec: t, durSec: Math.min(22, start + durSec - t), freqs, gain: 0.05 });
        t += 20;
        k++;
      }
    }
    if (instruments.includes('flute')) {
      // Sparse, breathy line: a note every ~8–15 s, never dense.
      let t = start + 2 + rand() * 4;
      while (t < start + durSec - 3) {
        const degree = [4, 2, 5, 3, 6, 4][Math.floor(rand() * 6)];
        const noteDur = 2.5 + rand() * 2;
        events.push({
          kind: 'fluteNote', startSec: t, durSec: noteDur,
          freqs: [scaleTone(root, scale, degree, 1)], gain: 0.07,
        });
        t += noteDur + 6 + rand() * 8;
      }
    }
  });

  return events.sort((a, b) => a.startSec - b.startSec);
}

/** Total bed length in seconds, straight from the blueprint. */
export function synthBedDurationSec(plan: MusicBlueprint): number {
  return plan.chunks.reduce((acc, c) => acc + c.duration_ms, 0) / 1000;
}

/* ------------------------------------------------------------------ */
/* Renderer (browser / Electron only — uses OfflineAudioContext).      */
/* ------------------------------------------------------------------ */

function adsrGain(
  ctx: OfflineAudioContext,
  t: number,
  dur: number,
  peak: number,
  attack: number,
  release: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + Math.min(attack, dur / 2));
  g.gain.setValueAtTime(Math.max(peak, 0.0002), Math.max(t + attack, t + dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

function renderDrone(ctx: OfflineAudioContext, ev: SynthEvent, dest: AudioNode) {
  const [root, fifth] = ev.freqs;
  // Continuous root + fifth, gently breathing.
  for (const [freq, level] of [[root, 1], [fifth, 0.5], [root * 2, 0.25]] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = adsrGain(ctx, ev.startSec, ev.durSec, ev.gain * level, 3, 3);
    osc.connect(g).connect(dest);
    osc.start(ev.startSec);
    osc.stop(ev.startSec + ev.durSec + 0.1);
  }
  // Tanpura-style pluck cycle: root – fifth – octave – root, ~every 2.4 s.
  const cycle = [root, fifth, root * 2, root];
  for (let t = ev.startSec + 0.5, i = 0; t < ev.startSec + ev.durSec - 1; t += 2.4, i++) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = cycle[i % cycle.length];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(ev.gain * 0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 2);
  }
}

function renderBowl(ctx: OfflineAudioContext, ev: SynthEvent, dest: AudioNode) {
  const f = ev.freqs[0];
  // Inharmonic partials of a singing bowl, each decaying at its own rate.
  for (const [ratio, level, decay] of [[1, 1, 7], [2.02, 0.5, 5], [2.74, 0.3, 3.5], [4.1, 0.15, 2]] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ev.startSec);
    g.gain.exponentialRampToValueAtTime(ev.gain * level, ev.startSec + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, ev.startSec + Math.min(decay, ev.durSec));
    osc.connect(g).connect(dest);
    osc.start(ev.startSec);
    osc.stop(ev.startSec + ev.durSec + 0.1);
  }
}

function renderPadChord(ctx: OfflineAudioContext, ev: SynthEvent, dest: AudioNode) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 750;
  filter.connect(dest);
  for (const freq of ev.freqs) {
    for (const detune of [-4, 3]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = adsrGain(ctx, ev.startSec, ev.durSec, ev.gain, 4, 4);
      osc.connect(g).connect(filter);
      osc.start(ev.startSec);
      osc.stop(ev.startSec + ev.durSec + 0.1);
    }
  }
}

function renderFluteNote(ctx: OfflineAudioContext, ev: SynthEvent, dest: AudioNode) {
  const f = ev.freqs[0];
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = f;
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 4.5;
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.value = f * 0.004;
  vibrato.connect(vibratoGain).connect(osc.frequency);
  const g = adsrGain(ctx, ev.startSec, ev.durSec, ev.gain, 0.35, 0.6);
  osc.connect(g).connect(dest);
  osc.start(ev.startSec);
  vibrato.start(ev.startSec);
  osc.stop(ev.startSec + ev.durSec + 0.1);
  vibrato.stop(ev.startSec + ev.durSec + 0.1);
}

function renderNoise(ctx: OfflineAudioContext, ev: SynthEvent, dest: AudioNode, noiseBuffer: AudioBuffer) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 480;
  const g = adsrGain(ctx, ev.startSec, ev.durSec, ev.gain, 4, 4);
  src.connect(filter).connect(g).connect(dest);
  src.start(ev.startSec);
  src.stop(ev.startSec + ev.durSec + 0.1);
}

/** Render the bed. Length matches the blueprint total exactly. */
export async function renderSynthBed(plan: MusicBlueprint, sampleRate = 44100): Promise<AudioBuffer> {
  const totalSec = synthBedDurationSec(plan);
  if (totalSec <= 0) throw new Error('Blueprint has no duration.');
  const ctx = new OfflineAudioContext(1, Math.ceil(totalSec * sampleRate), sampleRate);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  // Gentle overall fade in / out so the bed never starts or stops abruptly.
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.exponentialRampToValueAtTime(0.9, Math.min(2.5, totalSec / 4));
  master.gain.setValueAtTime(0.9, Math.max(2.5, totalSec - 3));
  master.gain.exponentialRampToValueAtTime(0.0001, totalSec);
  master.connect(ctx.destination);

  const noiseLen = 2 * sampleRate;
  const noiseBuffer = ctx.createBuffer(1, noiseLen, sampleRate);
  const data = noiseBuffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < noiseLen; i++) {
    // Pinkish noise: white noise through a one-pole low-pass.
    const white = Math.random() * 2 - 1;
    last = last * 0.94 + white * 0.06;
    data[i] = last * 3;
  }

  for (const ev of planSynthEvents(plan)) {
    switch (ev.kind) {
      case 'drone': renderDrone(ctx, ev, master); break;
      case 'bowl': renderBowl(ctx, ev, master); break;
      case 'padChord': renderPadChord(ctx, ev, master); break;
      case 'fluteNote': renderFluteNote(ctx, ev, master); break;
      case 'noise': renderNoise(ctx, ev, master, noiseBuffer); break;
    }
  }
  return ctx.startRendering();
}
