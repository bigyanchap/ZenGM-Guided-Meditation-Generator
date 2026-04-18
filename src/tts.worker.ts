import { KokoroTTS, env } from 'kokoro-js';

if (env) {
  (env as any).allowLocalModels = false;
  (env as any).useBrowserCache = true;
}

let tts: any = null;
const cancelledGenerationIds = new Set<number>();

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'cancel-generate') {
    cancelledGenerationIds.add(msg.id as number);
    return;
  }

  if (msg.type === 'init') {
    try {
      tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "q8",
        device: "wasm",
        progress_callback: (p: any) => {
          if (p.status === 'progress') {
            self.postMessage({
              type: 'init-progress',
              progress: p.progress,
              loaded: p.loaded ?? 0,
              total: p.total ?? 0,
            });
          }
        }
      });
      self.postMessage({ type: 'init-ready' });
    } catch (err: any) {
      self.postMessage({ type: 'init-error', error: err.message || String(err) });
    }
  }

  if (msg.type === 'generate') {
    try {
      if (!tts) throw new Error('Model not loaded');
      const result = await tts.generate(msg.text, { voice: msg.voice });

      if (cancelledGenerationIds.has(msg.id)) {
        cancelledGenerationIds.delete(msg.id);
        return;
      }

      if (!result.audio || result.audio.length === 0) {
        throw new Error(`TTS returned empty audio for: "${msg.text.slice(0, 40)}..."`);
      }

      // RawAudio.toBlob() produces a valid WAV blob using the library's own encoder
      const blob: Blob = result.toBlob();
      self.postMessage({ type: 'generated', id: msg.id, blob });
    } catch (err: any) {
      if (cancelledGenerationIds.has(msg.id)) {
        cancelledGenerationIds.delete(msg.id);
        return;
      }
      self.postMessage({ type: 'generate-error', id: msg.id, error: err.message || String(err) });
    }
  }
};
