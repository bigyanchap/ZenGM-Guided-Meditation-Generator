import React, { useState, useRef, useCallback } from 'react';
import { Upload, Download, Film, Music, Image, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { Segment } from './audio-utils';
import { mergeSegmentsToBuffer, formatTime } from './audio-utils';

interface Props {
  segments: Segment[];
  title: string;
}

type VideoStatus = 'idle' | 'merging' | 'encoding' | 'done' | 'error';

export default function VideoGenerator({ segments, title }: Props) {
  const [bgMusicFile, setBgMusicFile] = useState<File | null>(null);
  const [bgMusicDuration, setBgMusicDuration] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [bgMusicVolume, setBgMusicVolume] = useState(0.2);
  const [meditationDuration, setMeditationDuration] = useState(0);
  const [videoStatus, setVideoStatus] = useState<VideoStatus>('idle');
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const bgMusicInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const hasAudio = segments.some(s => s.audioUrl);
  const fadeDuration = 5;
  const totalDuration = meditationDuration + fadeDuration;
  const bgMusicValid = bgMusicDuration >= meditationDuration + fadeDuration;
  const canCreate = hasAudio && bgMusicFile && imageFile && bgMusicValid && meditationDuration > 0;

  const calcMeditationDuration = useCallback(async () => {
    if (!hasAudio) { setMeditationDuration(0); return; }
    try {
      const buffer = await mergeSegmentsToBuffer(segments);
      setMeditationDuration(buffer.duration);
    } catch { setMeditationDuration(0); }
  }, [segments, hasAudio]);

  useState(() => { calcMeditationDuration(); });

  const handleBgMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgMusicFile(file);
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.onloadedmetadata = () => { setBgMusicDuration(audio.duration); URL.revokeObjectURL(url); };
    audio.src = url;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
  };

  const createVideo = async () => {
    if (!canCreate || !bgMusicFile || !imageFile) return;

    setVideoStatus('merging');
    setVideoProgress(0);
    setErrorMsg('');
    setVideoBlob(null);

    try {
      setVideoProgress(5);
      const meditationBuffer = await mergeSegmentsToBuffer(segments);
      const medDuration = meditationBuffer.duration;
      const vidDuration = medDuration + fadeDuration;

      setVideoProgress(10);
      const audioCtx = new AudioContext();
      const bgArrayBuf = await bgMusicFile.arrayBuffer();
      const bgMusicBuffer = await audioCtx.decodeAudioData(bgArrayBuf);

      setVideoStatus('encoding');
      setVideoProgress(15);
      const sampleRate = 48000;
      const totalSamples = Math.ceil(vidDuration * sampleRate);
      const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

      const medSource = offlineCtx.createBufferSource();
      medSource.buffer = meditationBuffer;
      medSource.connect(offlineCtx.destination);
      medSource.start(0);

      const bgSource = offlineCtx.createBufferSource();
      bgSource.buffer = bgMusicBuffer;
      const bgGain = offlineCtx.createGain();
      bgGain.gain.setValueAtTime(bgMusicVolume, 0);
      bgGain.gain.setValueAtTime(bgMusicVolume, medDuration);
      bgGain.gain.linearRampToValueAtTime(0, vidDuration);
      bgSource.connect(bgGain);
      bgGain.connect(offlineCtx.destination);
      bgSource.start(0);

      const mixedBuffer = await offlineCtx.startRendering();
      await audioCtx.close();
      setVideoProgress(30);

      const img = await loadImage(imageFile);
      const maxW = 1920, maxH = 1080;
      let cw = img.naturalWidth, ch = img.naturalHeight;
      if (cw > maxW || ch > maxH) {
        const scale = Math.min(maxW / cw, maxH / ch);
        cw = Math.round(cw * scale);
        ch = Math.round(ch * scale);
      }
      cw = cw % 2 === 0 ? cw : cw - 1;
      ch = ch % 2 === 0 ? ch : ch - 1;

      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx2d = canvas.getContext('2d')!;
      ctx2d.drawImage(img, 0, 0, cw, ch);

      const { Muxer, ArrayBufferTarget } = await import('webm-muxer');

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: { codec: 'V_VP8', width: cw, height: ch },
        audio: { codec: 'A_OPUS', sampleRate, numberOfChannels: 2 },
      });

      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error('VideoEncoder error:', e),
      });
      videoEncoder.configure({ codec: 'vp8', width: cw, height: ch, bitrate: 500_000, framerate: 1 });

      const totalFrames = Math.ceil(vidDuration);
      for (let i = 0; i < totalFrames; i++) {
        const frame = new VideoFrame(canvas, { timestamp: i * 1_000_000, duration: 1_000_000 });
        videoEncoder.encode(frame, { keyFrame: true });
        frame.close();
        if (i % 10 === 0) setVideoProgress(30 + (i / totalFrames) * 25);
      }
      await videoEncoder.flush();
      videoEncoder.close();
      setVideoProgress(55);

      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error('AudioEncoder error:', e),
      });
      audioEncoder.configure({ codec: 'opus', sampleRate, numberOfChannels: 2, bitrate: 128_000 });

      const frameSize = Math.floor(sampleRate * 0.02);
      const totalAudioFrames = Math.ceil(mixedBuffer.length / frameSize);
      const ch0 = mixedBuffer.getChannelData(0);
      const ch1 = mixedBuffer.numberOfChannels > 1 ? mixedBuffer.getChannelData(1) : ch0;

      for (let i = 0; i < totalAudioFrames; i++) {
        const offset = i * frameSize;
        const length = Math.min(frameSize, mixedBuffer.length - offset);
        const data = new Float32Array(length * 2);
        for (let j = 0; j < length; j++) { data[j] = ch0[offset + j]; data[length + j] = ch1[offset + j]; }
        const audioData = new AudioData({
          format: 'f32-planar' as AudioSampleFormat,
          sampleRate, numberOfFrames: length, numberOfChannels: 2,
          timestamp: Math.round((offset / sampleRate) * 1_000_000), data,
        });
        audioEncoder.encode(audioData);
        audioData.close();
        if (i % 200 === 0) setVideoProgress(55 + (i / totalAudioFrames) * 35);
      }
      await audioEncoder.flush();
      audioEncoder.close();
      setVideoProgress(95);

      muxer.finalize();
      const webmBlob = new Blob([target.buffer], { type: 'video/webm' });
      setVideoBlob(webmBlob);
      setVideoStatus('done');
      setVideoProgress(100);
    } catch (err: any) {
      console.error('Video creation failed:', err);
      setErrorMsg(err.message || String(err));
      setVideoStatus('error');
    }
  };

  const downloadVideo = () => {
    if (!videoBlob) return;
    const url = URL.createObjectURL(videoBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/\s+/g, '_') || 'meditation'}.webm`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const pctAudio = totalDuration > 0 ? (meditationDuration / totalDuration) * 100 : 0;
  const pctFade = totalDuration > 0 ? (fadeDuration / totalDuration) * 100 : 0;

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <h2 className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Video Generator</h2>

      <div className="max-w-2xl">
        {/* Sources */}
        <div className="space-y-2 mb-5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Sources</div>

          <div className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded">
            <Music size={13} className="text-[var(--text-muted)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs">Meditation Audio</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {hasAudio
                  ? `${segments.filter(s => s.type === 'text').length} segments \u00b7 ${meditationDuration > 0 ? formatTime(meditationDuration) : 'calculating...'}`
                  : 'Generate audio in Meditation step first'}
              </div>
            </div>
            {hasAudio
              ? <CheckCircle2 size={13} className="text-green-600/70 shrink-0" />
              : <AlertCircle size={13} className="text-[var(--text-muted)] shrink-0" />}
          </div>

          <div
            className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded cursor-pointer hover:bg-[var(--bg-hover)] transition"
            onClick={() => bgMusicInputRef.current?.click()}
          >
            <Upload size={13} className="text-[var(--text-muted)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs">Background Music</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {bgMusicFile ? `${bgMusicFile.name} \u00b7 ${formatTime(bgMusicDuration)}` : '.mp3, .wav, .ogg'}
              </div>
            </div>
            {bgMusicFile && (bgMusicValid
              ? <CheckCircle2 size={13} className="text-green-600/70 shrink-0" />
              : <AlertCircle size={13} className="text-red-500/70 shrink-0" />)}
            <input ref={bgMusicInputRef} type="file" accept="audio/*" className="hidden" onChange={handleBgMusicUpload} />
          </div>

          {bgMusicFile && !bgMusicValid && meditationDuration > 0 && (
            <p className="text-[10px] text-red-500/70 pl-3">
              Music must be at least {formatTime(meditationDuration + fadeDuration)} (audio + {fadeDuration}s fade)
            </p>
          )}

          <div
            className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded cursor-pointer hover:bg-[var(--bg-hover)] transition"
            onClick={() => imageInputRef.current?.click()}
          >
            {imagePreview
              ? <img src={imagePreview} className="w-8 h-5 object-cover rounded shrink-0" />
              : <Image size={13} className="text-[var(--text-muted)] shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-xs">Background Image</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {imageFile ? imageFile.name : '.jpg, .png, .webp'}
              </div>
            </div>
            {imageFile && <CheckCircle2 size={13} className="text-green-600/70 shrink-0" />}
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>
        </div>

        {/* Settings */}
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Settings</div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--text-secondary)] shrink-0">Music Volume</label>
            <input
              type="range" min="0.05" max="0.5" step="0.05"
              value={bgMusicVolume}
              onChange={e => setBgMusicVolume(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--accent)]"
            />
            <span className="text-[10px] text-[var(--text-muted)] w-8 text-right">{Math.round(bgMusicVolume * 100)}%</span>
          </div>
        </div>

        {/* Timeline */}
        {meditationDuration > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Timeline</div>
              <div className="text-[10px] text-[var(--text-muted)]">Total: {formatTime(totalDuration)}</div>
            </div>
            <div className="space-y-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded p-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-muted)] w-10 shrink-0">Audio</span>
                <div className="flex-1 h-4 bg-[var(--bg-input)] rounded overflow-hidden">
                  <div className="h-full bg-[var(--accent-bg)] rounded" style={{ width: `${pctAudio}%` }} />
                </div>
                <span className="text-[10px] text-[var(--text-muted)] w-10 text-right">{formatTime(meditationDuration)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-muted)] w-10 shrink-0">Music</span>
                <div className="flex-1 h-4 bg-[var(--bg-input)] rounded overflow-hidden flex">
                  <div className="h-full bg-[var(--bg-active)]" style={{ width: `${pctAudio}%` }} />
                  <div className="h-full bg-gradient-to-r from-[var(--bg-active)] to-transparent" style={{ width: `${pctFade}%` }} />
                </div>
                <span className="text-[10px] text-[var(--text-muted)] w-10 text-right">fade</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-muted)] w-10 shrink-0">Image</span>
                <div className="flex-1 h-4 bg-[var(--bg-input)] rounded overflow-hidden">
                  <div className="h-full bg-[var(--bg-hover)] rounded w-full" />
                </div>
                <span className="text-[10px] text-[var(--text-muted)] w-10 text-right">full</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-10 shrink-0" />
                <div className="flex-1 flex justify-between text-[9px] text-[var(--text-muted)]">
                  <span>0:00</span>
                  <span style={{ marginLeft: `${pctAudio - 10}%` }}>{formatTime(meditationDuration)}</span>
                  <span>{formatTime(totalDuration)}</span>
                </div>
                <span className="w-10 shrink-0" />
              </div>
            </div>
          </div>
        )}

        {/* Progress */}
        {(videoStatus === 'merging' || videoStatus === 'encoding') && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Loader2 size={12} className="animate-spin text-[var(--accent)]" />
              <span className="text-xs text-[var(--text-secondary)]">
                {videoStatus === 'merging' ? 'Merging audio...' : 'Encoding video...'}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] ml-auto">{Math.round(videoProgress)}%</span>
            </div>
            <div className="w-full h-1 bg-[var(--bg-input)] rounded-full overflow-hidden">
              <motion.div className="h-full bg-[var(--accent)]" animate={{ width: `${videoProgress}%` }} transition={{ ease: 'easeOut' }} />
            </div>
          </div>
        )}

        {videoStatus === 'error' && (
          <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded p-3">
            <p className="text-xs text-red-500">{errorMsg}</p>
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-[var(--border)] pt-4 flex items-center gap-2">
          <button
            onClick={createVideo}
            disabled={!canCreate || videoStatus === 'merging' || videoStatus === 'encoding'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Film size={12} /> Create Video
          </button>
          {videoBlob && (
            <button
              onClick={downloadVideo}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition"
            >
              <Download size={12} /> Download .webm
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}
