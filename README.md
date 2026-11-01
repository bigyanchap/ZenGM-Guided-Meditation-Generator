# ZenGM - Guided Meditation Generator

**ZenGM - Guided Meditation Generator** — an AI Agentic desktop and web app that turns a written meditation script into spoken audio, using **local text-to-speech** in the browser (no server required for the default mode). Optionally use **ElevenLabs** — the only cloud API in the app — for voices and for AI-composed music. A **Music Bed** can also be composed for free, locally, by the built-in ZenGM Synth. You can also mux narration with background music and a still image to export a **WebM** video.

## Features

- **Guided meditation editor** — write your script; use `(5)`-style hints for pause length in seconds; pick a voice; generate, play back, and download **WAV**.
- **Local TTS** — [Kokoro](https://github.com/hexgrad/kokoro) via `kokoro-js` and ONNX Runtime Web; models load in a Web Worker.
- **Paid TTS (optional)** — paste your ElevenLabs API key in Settings; the key is stored in **localStorage** on your machine only. ElevenLabs is the only API provider in the app.
- **Music Bed** — a JSON composition blueprint (chunks with `text`, `duration_ms`, `positive_styles`, `negative_styles`, `context_adherence`) drives two engines: **ElevenLabs Music** (paid, uses your credit) or the **ZenGM Synth** (free, local WebAudio — style words map to a tanpura drone, singing bowls, pads, a breathy flute line and nature noise; `duration_ms` is exact). A `{ "type": "silence", "duration_ms": … }` chunk stitches true silence into the bed. Export a **mixed WAV**: the bed sits low under the voice and rises inside your script's pauses.
Voices types:
  Indian accent, female, deep, whispery,
  Indian accent, female, deep, persuasive,
  Indian accent, male, deep, whispery,
  Indian accent, male, deep, persuasive,
  American English, female, deep, whispery,
  American English, female, deep, persuasive,
  American English, male, deep, whispery,
  American English, male, deep, persuasive
- **Video** — combine generated segments with uploaded background music and a cover image; export WebM in-app.
- **Themes** — light and dark UI.

## Prerequisites

- [Node.js](https://nodejs.org/) **20+** (LTS recommended)
- **npm** (comes with Node)

## Quick start

```bash
npm install
npm run dev
```

`dev` compiles the Electron main process, starts Vite on port **3000**, then opens the **Electron** shell pointed at that URL.

### Web only (no Electron)

Useful for development in the browser or when you do not need a desktop window:

```bash
npm run dev:web
```

The dev server listens on `0.0.0.0:3000` so other devices on your LAN can open it if your firewall allows.

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Electron + Vite (default desktop workflow) |
| `npm run dev:web` | Vite only |
| `npm run build` | Production Vite build + compile Electron TypeScript |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run pack` | Build + package Electron **unpacked** (`release/` via electron-builder) |
| `npm run dist` | Build + Windows **NSIS** installer |

## Environment (optional)

For Electron dev, the main process reads **`VITE_PORT`** if you need a port other than `3000`:

```bash
set VITE_PORT=5173
npm run dev
```

(On Unix: `VITE_PORT=5173 npm run dev`.)

## Tech stack

- **React** 19, **TypeScript**, **Vite** 6  
- **Tailwind CSS** 4  
- **Electron** 35 (desktop)  
- **kokoro-js**, **onnxruntime-web** (local inference)  
- **webm-muxer** (video encoding in the browser)

## Privacy note

Local TTS runs entirely on your device. If you enable paid TTS, only **your** API provider receives the text you send for synthesis, under that provider’s terms.

## Standalone Release 
Release has files which you need to download and run the installer named GenGM - Guided Meditation Generator Setup 1.0.0.exe
