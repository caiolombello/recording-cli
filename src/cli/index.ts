import { loadConfig, writeDefaultConfig } from "../config/load";
import { startRecording as startWfRecording, stopRecording as stopWfRecording } from "../recording/wf";
import { startRecording as startGnomeRecording, stopRecording as stopGnomeRecording } from "../recording/gnome";
import { monitorGnomeErrors } from "../recording/gnomeMonitor";
import { runGnomeDaemon } from "../recording/gnomeDaemon";
import { clearState, readState } from "../recording/state";

const printHelp = (): void => {
  console.log(`\nRecording CLI (Linux)\n\nUsage:\n  recording-cli <command> [options]\n\nCommands:\n  init           Create a default config file\n  config         Show current config path\n  record start   Start a recording\n  record stop    Stop the current recording\n  record status  Show recording status\n  record reset   Clear local recording state\n  record debug   Monitor GNOME screencast errors\n  help           Show this help\n\nOptions:\n  --title <name>           Optional recording title\n  --duration-mins <mins>  Auto-stop after N minutes (foreground only)\n  --geometry <WxH+X+Y>    Record a specific region\n  --foreground            Run in foreground (blocks until stop)\n  --force                 Ignore existing state (start only)\n`);
};

const parseFlag = (args: string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
};

const hasFlag = (args: string[], flag: string): boolean => args.includes(flag);

const isProcessAlive = (pid?: number): boolean => {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const [command, subcommand] = args;

  switch (command) {
    case "init": {
      const { path } = await writeDefaultConfig();
      console.log(`Config created at ${path}`);
      break;
    }
    case "config": {
      const { path } = await loadConfig();
      console.log(path);
      break;
    }
    case "help":
    case "-h":
    case "--help":
    case undefined: {
      printHelp();
      break;
    }
    case "record": {
      if (subcommand === "start") {
        try {
          const existing = await readState();
          if (existing && !hasFlag(args, "--force")) {
            if (existing.pid && !isProcessAlive(existing.pid)) {
              await clearState();
            } else {
              console.error("A recording is already running.");
              console.error("Use `record reset` to clear state, or pass --force to ignore.");
              process.exit(1);
              return;
            }
          }

          const title = parseFlag(args, "--title");
          const durationRaw = parseFlag(args, "--duration-mins");
          const geometry = parseFlag(args, "--geometry");
          const foreground = hasFlag(args, "--foreground") || Boolean(durationRaw);
          const durationMinutes = durationRaw ? Number(durationRaw) : undefined;

          if (durationRaw && Number.isNaN(durationMinutes)) {
            console.error("Invalid value for --duration-mins");
            process.exit(1);
          }

          let outputPath: string;
          let finished = false;

          const { config } = await loadConfig();
          if (config.backend === "wf-recorder") {
            const result = await startWfRecording(config, {
              title,
              durationMinutes,
              geometry,
              foreground
            });
            outputPath = result.outputPath;
            finished = Boolean(result.finished);
          } else if (config.backend === "gnome") {
            if (foreground || durationMinutes) {
              console.warn("GNOME backend ignores --foreground and --duration-mins.");
            }
            const result = await startGnomeRecording(config, { title, geometry });
            outputPath = result.outputPath;
          } else {
            console.error("Current backend is not supported yet. Update config to continue.");
            process.exit(1);
            return;
          }
          if (finished) {
            console.log(`Recording finished: ${outputPath}`);
          } else {
            console.log(`Recording started: ${outputPath}`);
          }
          break;
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }

      if (subcommand === "stop") {
        try {
          const state = await readState();
          if (!state) {
            console.error("No active recording found.");
            process.exit(1);
            return;
          }

          const backend = state.backend ?? (await loadConfig()).config.backend;

          if (backend === "wf-recorder") {
            await stopWfRecording();
            console.log("Recording stopped.");
          } else if (backend === "gnome") {
            const result = await stopGnomeRecording();
            if (result.stopped) {
              console.log("Recording stopped.");
            } else {
              console.warn("Stop requested, but GNOME reported failure. State cleared.");
              if (result.message) {
                console.warn(result.message);
              }
            }
          } else {
            console.error("Current backend is not supported yet.");
            process.exit(1);
            return;
          }
          break;
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }

      if (subcommand === "status") {
        const state = await readState();
        if (!state) {
          console.log("idle");
        } else {
          console.log(`recording (${state.outputPath})`);
        }
        break;
      }

      if (subcommand === "reset") {
        await clearState();
        console.log("State cleared.");
        break;
      }

      if (subcommand === "debug") {
        monitorGnomeErrors();
        break;
      }

      if (subcommand === "gnome-daemon") {
        const { config } = await loadConfig();
        const title = parseFlag(args, "--title");
        const geometry = parseFlag(args, "--geometry");
        await runGnomeDaemon(config, title || undefined, geometry || undefined);
        break;
      }

      console.error("Unknown record command.");
      printHelp();
      process.exit(1);
    }
    default: {
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
    }
  }
};

void main();
