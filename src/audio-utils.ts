export type Segment = {
  type: 'text' | 'pause';
  content?: string;
  duration?: number;
  audioUrl?: string;
  isGenerating?: boolean;
};

const RIFF_LE = 0x46464952; // 'RIFF' little-endian
const WAVE_LE = 0x45564157; // 'WAVE'

function isWavRiff(ab: ArrayBuffer): boolean {
  if (ab.byteLength < 12) return false;
  const v = new DataView(ab);
  return v.getUint32(0, true) === RIFF_LE && v.getUint32(8, true) === WAVE_LE;
}

function parsePcmRateFromMime(mime: string): number | null {
  const m = (mime || '').toLowerCase();
  const m1 = m.match(/rate\s*=\s*(\d+)/);
  if (m1) return parseInt(m1[1], 10);
  if (m.includes('24000')) return 24000;
  if (m.includes('48000')) return 48000;
  if (m.includes('44100')) return 44100;
  if (m.includes('16000')) return 16000;
  if (m.includes('22050')) return 22050;
  return null;
}

/** Wrap raw little-endian 16-bit PCM in a WAV container for decodeAudioData. */
function pcm16LeToWav(pcm: ArrayBuffer, sampleRate: number, numChannels: number): ArrayBuffer {
  const bitsPerSample = 16;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const subchunk2Size = pcm.byteLength;
  const riffChunkSize = 36 + subchunk2Size;

  const buffer = new ArrayBuffer(8 + riffChunkSize);
  const view = new DataView(buffer);
  let pos = 0;

  const w32 = (le: number) => {
    view.setUint32(pos, le, true);
    pos += 4;
  };
  const w16 = (le: number) => {
    view.setUint16(pos, le, true);
    pos += 2;
  };

  w32(RIFF_LE);
  w32(riffChunkSize);
  w32(WAVE_LE);
  w32(0x20746d66);
  w32(16);
  w16(1);
  w16(numChannels);
  w32(sampleRate);
  w32(byteRate);
  w16(blockAlign);
  w16(bitsPerSample);
  w32(0x61746164);
  w32(subchunk2Size);

  new Uint8Array(buffer).set(new Uint8Array(pcm), pos);
  return buffer;
}

async function decodeAudioDataCopy(ctx: AudioContext, ab: ArrayBuffer): Promise<AudioBuffer> {
  const copy = ab.byteLength === 0 ? ab : ab.slice(0);
  return ctx.decodeAudioData(copy);
}

/**
 * Decode arbitrary TTS blobs (WAV/MP3/OGG or raw PCM) into an AudioBuffer.
 */
export async function decodeBlobToAudioBuffer(
  ctx: AudioContext,
  arrayBuffer: ArrayBuffer,
  mimeType: string,
): Promise<AudioBuffer> {
  const mime = (mimeType || '').toLowerCase();

  try {
    return await decodeAudioDataCopy(ctx, arrayBuffer);
  } catch {
    /* fall through */
  }

  if (isWavRiff(arrayBuffer)) {
    throw new Error('WAV data present but the browser could not decode it (corrupt or unsupported WAV sub-format).');
  }

  const mimeLooksPcm =
    mime.includes('l16') ||
    mime.includes('pcm') ||
    mime.includes('s16le') ||
    mime.includes('linear16') ||
    mime.includes('audio/raw');

  const hinted = parsePcmRateFromMime(mime);
  const tryRates = Array.from(
    new Set([hinted, 24000, 48000, 44100, 16000, 22050].filter((r): r is number => typeof r === 'number' && r > 0)),
  );

  if (mimeLooksPcm || mime === '' || mime === 'application/octet-stream') {
    for (const rate of tryRates) {
      for (const ch of [1, 2] as const) {
        if (arrayBuffer.byteLength < ch * 2) continue;
        if (arrayBuffer.byteLength % (2 * ch) !== 0) continue;
        try {
          const wav = pcm16LeToWav(arrayBuffer, rate, ch);
          return await decodeAudioDataCopy(ctx, wav);
        } catch {
          /* try next */
        }
      }
    }
  }

  throw new Error('Unable to decode audio data (unsupported or unknown format).');
}

export async function toMonoAtSampleRate(ctx: AudioContext, buffer: AudioBuffer, targetRate: number): Promise<AudioBuffer> {
  let b = buffer;
  if (b.numberOfChannels !== 1) {
    const mono = ctx.createBuffer(1, b.length, b.sampleRate);
    mono.getChannelData(0).set(b.getChannelData(0));
    b = mono;
  }
  if (b.sampleRate === targetRate) return b;

  const length = Math.max(1, Math.ceil(b.duration * targetRate));
  const offline = new OfflineAudioContext(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = b;
  src.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

export async function mergeSegmentsToBuffer(segments: Segment[]): Promise<AudioBuffer> {
  const audioCtx = new AudioContext();
  const decodedBuffers: AudioBuffer[] = [];

  for (const seg of segments) {
    if (seg.type === 'text' && seg.audioUrl) {
      const response = await fetch(seg.audioUrl);
      const blob = await response.blob();
      const mime = blob.type || response.headers.get('content-type') || '';
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await decodeBlobToAudioBuffer(audioCtx, arrayBuffer, mime);
      decodedBuffers.push(audioBuffer);
    } else if (seg.type === 'pause' && seg.duration) {
      const sampleRate = decodedBuffers[0]?.sampleRate || audioCtx.sampleRate;
      const silentBuffer = audioCtx.createBuffer(1, Math.floor(sampleRate * seg.duration), sampleRate);
      decodedBuffers.push(silentBuffer);
    }
  }

  if (decodedBuffers.length === 0) {
    await audioCtx.close();
    throw new Error('No audio segments to merge');
  }

  const targetRate = decodedBuffers[0].sampleRate;
  for (let i = 0; i < decodedBuffers.length; i++) {
    decodedBuffers[i] = await toMonoAtSampleRate(audioCtx, decodedBuffers[i], targetRate);
  }

  const sampleRate = decodedBuffers[0].sampleRate;
  const totalLength = decodedBuffers.reduce((acc, buf) => acc + buf.length, 0);
  const mergedBuffer = audioCtx.createBuffer(1, totalLength, sampleRate);

  let offset = 0;
  for (const buf of decodedBuffers) {
    mergedBuffer.getChannelData(0).set(buf.getChannelData(0), offset);
    offset += buf.length;
  }

  await audioCtx.close();
  return mergedBuffer;
}

export interface PauseRange { startSec: number; endSec: number; }
export interface VoiceTimeline {
  buffer: AudioBuffer;
  totalSec: number;
  voiceSec: number;
  pauseSec: number;
  pauseRanges: PauseRange[];
}

/**
 * Merge segments like mergeSegmentsToBuffer, but also report where the
 * pauses fall — the mixer needs them to raise the music bed inside gaps.
 */
export async function mergeSegmentsWithTimeline(segments: Segment[]): Promise<VoiceTimeline> {
  const audioCtx = new AudioContext();
  const parts: Array<{ buffer: AudioBuffer; isPause: boolean }> = [];

  for (const seg of segments) {
    if (seg.type === 'text' && seg.audioUrl) {
      const response = await fetch(seg.audioUrl);
      const blob = await response.blob();
      const mime = blob.type || response.headers.get('content-type') || '';
      const arrayBuffer = await blob.arrayBuffer();
      parts.push({ buffer: await decodeBlobToAudioBuffer(audioCtx, arrayBuffer, mime), isPause: false });
    } else if (seg.type === 'pause' && seg.duration) {
      const sampleRate = parts[0]?.buffer.sampleRate || audioCtx.sampleRate;
      parts.push({ buffer: audioCtx.createBuffer(1, Math.floor(sampleRate * seg.duration), sampleRate), isPause: true });
    }
  }

  if (parts.length === 0) {
    await audioCtx.close();
    throw new Error('No audio segments to merge');
  }

  const targetRate = parts[0].buffer.sampleRate;
  const normalized: Array<{ buffer: AudioBuffer; isPause: boolean }> = [];
  for (const p of parts) {
    normalized.push({ buffer: await toMonoAtSampleRate(audioCtx, p.buffer, targetRate), isPause: p.isPause });
  }

  const totalLength = normalized.reduce((acc, p) => acc + p.buffer.length, 0);
  const merged = audioCtx.createBuffer(1, totalLength, targetRate);
  const pauseRanges: PauseRange[] = [];
  let offset = 0;
  let voiceSec = 0;
  let pauseSec = 0;
  for (const p of normalized) {
    merged.getChannelData(0).set(p.buffer.getChannelData(0), offset);
    const startSec = offset / targetRate;
    const endSec = (offset + p.buffer.length) / targetRate;
    if (p.isPause) {
      pauseRanges.push({ startSec, endSec });
      pauseSec += endSec - startSec;
    } else {
      voiceSec += endSec - startSec;
    }
    offset += p.buffer.length;
  }

  await audioCtx.close();
  return { buffer: merged, totalSec: totalLength / targetRate, voiceSec, pauseSec, pauseRanges };
}

/** Concatenate decoded buffers and raw silence (seconds) into one buffer. */
export async function buildBedFromParts(parts: Array<AudioBuffer | number>): Promise<AudioBuffer> {
  const audioCtx = new AudioContext();
  const buffers: AudioBuffer[] = [];
  for (const part of parts) {
    if (typeof part === 'number') {
      const rate = buffers[0]?.sampleRate || audioCtx.sampleRate;
      buffers.push(audioCtx.createBuffer(1, Math.max(1, Math.floor(rate * part)), rate));
    } else {
      buffers.push(part);
    }
  }
  if (buffers.length === 0) {
    await audioCtx.close();
    throw new Error('No bed parts to stitch');
  }
  const targetRate = buffers[0].sampleRate;
  const normalized: AudioBuffer[] = [];
  for (const b of buffers) normalized.push(await toMonoAtSampleRate(audioCtx, b, targetRate));
  const totalLength = normalized.reduce((acc, b) => acc + b.length, 0);
  const out = audioCtx.createBuffer(1, totalLength, targetRate);
  let offset = 0;
  for (const b of normalized) {
    out.getChannelData(0).set(b.getChannelData(0), offset);
    offset += b.length;
  }
  await audioCtx.close();
  return out;
}

export interface MixOptions {
  /** Music gain while the voice is speaking (0–1). */
  musicUnderVoice: number;
  /** Music gain inside pauses (0–1). */
  musicInPauses: number;
  pauseRanges: PauseRange[];
}

/**
 * Mix the voice timeline with a music bed: the bed loops (or is trimmed) to
 * the voice length, sits low under speech and rises inside pauses, with
 * smooth ~0.4 s transitions. This is what makes long gaps feel alive
 * instead of dead.
 */
export async function mixVoiceAndMusic(voice: AudioBuffer, music: AudioBuffer, opts: MixOptions): Promise<AudioBuffer> {
  const sampleRate = voice.sampleRate;
  const length = voice.length;
  const offline = new OfflineAudioContext(1, length, sampleRate);

  const voiceSrc = offline.createBufferSource();
  voiceSrc.buffer = voice;
  voiceSrc.connect(offline.destination);
  voiceSrc.start(0);

  const musicMono = music.numberOfChannels > 1
    ? (() => { const m = offline.createBuffer(1, music.length, music.sampleRate); m.getChannelData(0).set(music.getChannelData(0)); return m; })()
    : music;
  const musicSrc = offline.createBufferSource();
  musicSrc.buffer = musicMono;
  musicSrc.loop = true;
  const musicGain = offline.createGain();
  const totalSec = length / sampleRate;
  const tau = 0.4;
  musicGain.gain.setValueAtTime(opts.musicInPauses, 0);
  for (const range of opts.pauseRanges) {
    musicGain.gain.setTargetAtTime(opts.musicUnderVoice, Math.max(0, range.startSec - 1), tau);
    musicGain.gain.setTargetAtTime(opts.musicInPauses, range.startSec, tau);
    musicGain.gain.setTargetAtTime(opts.musicUnderVoice, range.endSec, tau);
  }
  musicGain.gain.setTargetAtTime(opts.musicInPauses, Math.max(0, totalSec - 2), tau);
  musicSrc.connect(musicGain).connect(offline.destination);
  musicSrc.start(0);
  musicSrc.stop(totalSec);

  return offline.startRendering();
}

/** Decode any audio blob (WAV/MP3/PCM) into an AudioBuffer. */
export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    const ab = await blob.arrayBuffer();
    return await decodeBlobToAudioBuffer(ctx, ab, blob.type || '');
  } finally {
    await ctx.close();
  }
}

export function bufferToWav(abuffer: AudioBuffer): Blob {
  const numOfChan = abuffer.numberOfChannels;
  const length = abuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels: Float32Array[] = [];
  let sample: number;
  let offset = 0;
  let pos = 0;

  write32(0x46464952);
  write32(length - 8);
  write32(0x45564157);
  write32(0x20746d66);
  write32(16);
  write16(1);
  write16(numOfChan);
  write32(abuffer.sampleRate);
  write32(abuffer.sampleRate * 2 * numOfChan);
  write16(numOfChan * 2);
  write16(16);
  write32(0x61746164);
  write32(length - pos - 4);

  for (let i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: 'audio/wav' });

  function write16(data: number) { view.setUint16(pos, data, true); pos += 2; }
  function write32(data: number) { view.setUint32(pos, data, true); pos += 4; }
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
