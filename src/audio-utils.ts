export type Segment = {
  type: 'text' | 'pause';
  content?: string;
  duration?: number;
  audioUrl?: string;
  isGenerating?: boolean;
};

export async function mergeSegmentsToBuffer(segments: Segment[]): Promise<AudioBuffer> {
  const audioCtx = new AudioContext();
  const decodedBuffers: AudioBuffer[] = [];

  for (const seg of segments) {
    if (seg.type === 'text' && seg.audioUrl) {
      const response = await fetch(seg.audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      decodedBuffers.push(audioBuffer);
    } else if (seg.type === 'pause' && seg.duration) {
      const sampleRate = decodedBuffers[0]?.sampleRate || audioCtx.sampleRate;
      const silentBuffer = audioCtx.createBuffer(1, Math.floor(sampleRate * seg.duration), sampleRate);
      decodedBuffers.push(silentBuffer);
    }
  }

  if (decodedBuffers.length === 0) {
    throw new Error('No audio segments to merge');
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
