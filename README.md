# Recording CLI (Linux)

## Stack
- Runtime: Bun (TypeScript)
- Recording: Multiple backends (simple, hybrid, ffmpeg-only, gnome, wf-recorder)
- Upload: S3 or Proton Drive
- Transcription: OpenAI Whisper API
- Config: `~/.config/recording-cli/config.json`
- Local recordings: `~/Videos/Recordings`

## Project structure
- `src/cli/` CLI entrypoint and command routing
- `src/config/` config loading, defaults, and validation
- `src/recording/` recording helpers and backend adapters
- `src/s3/` S3 upload and video playback
- `src/proton/` Proton Drive upload client
- `src/transcription/` OpenAI transcription
- `src/obs/` OBS WebSocket integration (optional)

## Quick commands
```bash
# Recording
bun run src/cli/index.ts record start --title meeting
bun run src/cli/index.ts record start --audio both --monitor 0
bun run src/cli/index.ts record stop
bun run src/cli/index.ts record status
bun run src/cli/index.ts record reset

# Upload
bun run src/cli/index.ts upload ~/Videos/Recordings/video.mp4
bun run src/cli/index.ts upload-all

# S3 playback (opens VLC with presigned URL)
bun run src/cli/index.ts s3 play

# Transcription
bun run src/cli/index.ts transcribe ~/Videos/Recordings/video.mp4

# Utils
bun run src/cli/index.ts monitors
bun run src/cli/index.ts init
bun run src/cli/index.ts config
```

## Options
- `--title <name>` Recording title
- `--audio <source>` Audio: none, microphone, desktop, both (default: both)
- `--monitor <id>` Monitor: 0, 1, 2... or "all" (default: all)
- `--duration-mins <n>` Auto-stop after N minutes
- `--geometry <WxH+X+Y>` Record specific region
- `--foreground` Run in foreground
- `--force` Ignore existing state

## Backend selection
Set `backend` in config to: `simple`, `hybrid`, `ffmpeg-only`, `gnome`, or `wf-recorder`.

- `simple` - Recommended, uses ffmpeg with PipeWire
- `hybrid` - Combines multiple capture methods
- `ffmpeg-only` - Pure ffmpeg capture
- `gnome` - GNOME Screencast via D-Bus
- `wf-recorder` - For wlroots compositors

## Config example
```json
{
  "recordingsDir": "~/Videos/Recordings",
  "backend": "simple",
  "gnome": {
    "framerate": 30,
    "drawCursor": true,
    "audioSource": "both"
  },
  "s3": {
    "enabled": true,
    "bucket": "my-bucket",
    "region": "us-east-1",
    "prefix": "recordings/",
    "profile": "default"
  },
  "openai": {
    "apiKey": "sk-...",
    "model": "gpt-4o-mini-transcribe",
    "autoTranscribe": false
  },
  "proton": {
    "enabled": false,
    "targetFolder": "/Recordings"
  }
}
```

## Notes
- GNOME backend requires `gdbus` (`libglib2.0-bin`)
- S3 playback requires VLC and AWS CLI configured
- Transcription requires OpenAI API key
