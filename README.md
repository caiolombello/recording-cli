# Recording CLI (Linux)

## Stack
- Runtime: Bun (TypeScript)
- Recording: GNOME Screencast (D-Bus) as the default backend on Ubuntu/Wayland
- Upload: Proton Drive SDK (TypeScript/JavaScript)
- Config: JSON file under `~/.config/recording-cli/config.json`
- Local recordings directory: `~/Videos/Recordings`

## Project structure
- `src/cli/` CLI entrypoints, argument parsing, prompts
- `src/obs/` OBS WebSocket integration (optional backend)
- `src/proton/` Proton Drive upload client and queue
- `src/recording/` recording helpers and backend adapters
- `src/config/` config loading, defaults, and validation

## Planned features (toggleable)
- Start/stop recording with optional countdown
- Screen or window selection (optional, default: full screen)
- Hotkeys for start/stop (optional)
- Auto-stop timer (optional)
- Naming templates (e.g., `YYYY-MM-DD_HH-mm_[title].mkv`)
- Post-process (optional): compress/transcode before upload
- Upload queue to Proton Drive with retry
- Metadata tagging (optional): meeting title, participants

## Notes
- GNOME backend uses `gdbus` (`libglib2.0-bin`) and `org.gnome.Shell.Screencast`.
- `wf-recorder` is available as an optional backend on wlroots compositors.
- OBS WebSocket is optional and only needed if you switch the backend.
- Recordings are stored locally in `~/Videos/Recordings` before upload.

## Quick commands
- Start recording: `bun run src/cli/index.ts record start --title meeting`
- Stop recording: `bun run src/cli/index.ts record stop`
- Reset stale state: `bun run src/cli/index.ts record reset`
- Monitor GNOME errors: `bun run src/cli/index.ts record debug`

## Backend selection
- Set `backend` in `~/.config/recording-cli/config.json` to `gnome` or `wf-recorder`.
- GNOME backend is recommended for Ubuntu Wayland.
- GNOME pipeline can be overridden under `gnome.pipeline` if needed.
