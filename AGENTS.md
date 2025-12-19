# Repository Guidelines

## Project Structure & Module Organization
- `src/cli/` contains the CLI entrypoint and command routing.
- `src/config/` owns config defaults, loading, and persistence logic.
- `src/obs/` is reserved for OBS WebSocket integration (optional backend).
- `src/proton/` is reserved for Proton Drive upload logic.
- `src/recording/` contains recording helpers and backend adapters.
- `dist/` is the compiled output from `bun build`.

## Build, Test, and Development Commands
- `bun run src/cli/index.ts --help` prints available commands.
- `bun run src/cli/index.ts init` writes the default config file.
- `bun build src/cli/index.ts --target=bun --outdir dist` produces a standalone build.

## Coding Style & Naming Conventions
- TypeScript with ES modules (`type: module`).
- Indentation: 2 spaces; prefer single quotes only when required by JSON or config.
- Naming: `camelCase` for variables/functions, `PascalCase` for types.
- Keep modules small and focused; CLI should delegate to `src/obs/` and `src/proton/`.

## Testing Guidelines
- No test framework is configured yet.
- When tests are added, place them under `src/**/__tests__/` and name files `*.test.ts`.

## Commit & Pull Request Guidelines
- No commit convention found in this repository. Use short, imperative subjects (e.g., "Add OBS connect stub").
- PRs should include a brief summary, manual test steps, and note any config changes.

## Security & Configuration Tips
- Config lives at `~/.config/recording-cli/config.json`; do not commit secrets.
- GNOME backend relies on `gdbus` and `org.gnome.Shell.Screencast`.
- GNOME pipeline can be overridden via `gnome.pipeline` config.
- OBS WebSocket passwords and Proton tokens should stay local.
- Recordings are stored in `~/Videos/Recordings` before optional upload.
