import { loadConfig, writeDefaultConfig } from "../config/load";
import { startRecording as startWfRecording, stopRecording as stopWfRecording } from "../recording/wf";
import { startRecording as startGnomeRecording, stopRecording as stopGnomeRecording } from "../recording/gnome";
import { startRecording as startHybridRecording, stopRecording as stopHybridRecording } from "../recording/hybrid";
import { startRecording as startFfmpegOnlyRecording, stopRecording as stopFfmpegOnlyRecording } from "../recording/ffmpeg-only";
import { startRecording as startSimpleRecording, stopRecording as stopSimpleRecording } from "../recording/simple";
import { monitorGnomeErrors } from "../recording/gnomeMonitor";
import { runGnomeDaemon } from "../recording/gnomeDaemon";
import { clearState, readState } from "../recording/state";
import { uploadToProtonDrive } from "../proton/upload";
import { uploadToS3 } from "../s3/upload";
import { listVideos, getPresignedUrl, playWithVlc } from "../s3/play";
import { transcribe } from "../transcription/openai";
import * as readline from "node:readline";

const printHelp = (): void => {
  console.log(`\nRecording CLI (Linux)\n\nUsage:\n  recording-cli <command> [options]\n\nCommands:\n  init              Create a default config file\n  config            Show current config path\n  record start      Start a recording\n  record stop       Stop the current recording\n  record status     Show recording status\n  record reset      Clear local recording state\n  record debug      Monitor GNOME screencast errors\n  record logs       Show GNOME daemon logs\n  transcribe <file> Transcribe a video/audio file\n  upload <file>     Upload a file to cloud storage\n  upload-all        Upload all recordings to cloud storage\n  s3 play           List S3 videos and play with VLC\n  monitors          List available monitors\n  help              Show this help\n\nOptions:\n  --title <name>           Optional recording title\n  --duration-mins <mins>  Auto-stop after N minutes (foreground only)\n  --geometry <WxH+X+Y>    Record a specific region\n  --audio <source>        Audio source: none, microphone, desktop, both (default: both)\n  --monitor <id>          Monitor to record (0, 1, 2...) or 'all' for all monitors\n  --foreground            Run in foreground (blocks until stop)\n  --force                 Ignore existing state (start only)\n`);
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
          const audioSource = parseFlag(args, "--audio") as "none" | "microphone" | "desktop" | "both" | undefined;
          const monitor = parseFlag(args, "--monitor");
          const foreground = hasFlag(args, "--foreground") || Boolean(durationRaw);
          const durationMinutes = durationRaw ? Number(durationRaw) : undefined;

          if (durationRaw && Number.isNaN(durationMinutes)) {
            console.error("Invalid value for --duration-mins");
            process.exit(1);
          }

          let outputPath: string;
          let finished = false;

          const { config } = await loadConfig();
          
          // Override audio source if specified
          if (audioSource) {
            config.gnome.audioSource = audioSource;
          }
          
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
          } else if (config.backend === "simple") {
            const result = await startSimpleRecording(config, { title, audioSource, monitor });
            outputPath = result.outputPath;
          } else if (config.backend === "hybrid") {
            const result = await startHybridRecording(config, { title, audioSource, monitor });
            outputPath = result.outputPath;
          } else if (config.backend === "ffmpeg-only") {
            const result = await startFfmpegOnlyRecording(config, { title, audioSource, monitor });
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
          } else if (backend === "simple" || backend === "pipewire" || backend === "gstreamer" || backend === "kooha" || backend === "obs-ws" || backend === "obs-cli") {
            const { config } = await loadConfig();
            const { videoPath } = await stopSimpleRecording(config);
            if (config.openai.autoTranscribe && videoPath) {
              try {
                await transcribe(config, videoPath);
              } catch (err) {
                console.error("⚠️ Transcription failed:", err instanceof Error ? err.message : String(err));
              }
            }
          } else if (backend === "hybrid") {
            await stopHybridRecording();
            console.log("Recording stopped.");
          } else if (backend === "ffmpeg-only" || backend === "gnome-ffmpeg" || backend === "gnome-native") {
            await stopFfmpegOnlyRecording();
            console.log("Recording stopped.");
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

      if (subcommand === "logs") {
        try {
          const { homedir } = await import("node:os");
          const { join } = await import("node:path");
          const { promises: fs } = await import("node:fs");
          
          const logPath = join(homedir(), ".config", "recording-cli", "gnome-daemon.log");
          const logs = await fs.readFile(logPath, "utf-8");
          console.log(logs);
        } catch (err) {
          console.error("No logs found or error reading logs:", err instanceof Error ? err.message : String(err));
        }
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
    case "transcribe": {
      const filePath = args[1];
      if (!filePath) {
        console.error("Please provide a video/audio file path.");
        process.exit(1);
        return;
      }
      try {
        const { config } = await loadConfig();
        await transcribe(config, filePath);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      break;
    }
    case "upload": {
      const filePath = args[1];
      if (!filePath) {
        console.error("Please provide a file path to upload.");
        process.exit(1);
        return;
      }

      try {
        const { config } = await loadConfig();
        if (!config.proton.enabled && !config.s3.enabled) {
          console.error("No upload service enabled in config.");
          console.error("Enable S3 or Proton Drive in ~/.config/recording-cli/config.json");
          process.exit(1);
          return;
        }

        let result: any;
        if (config.s3.enabled) {
          result = await uploadToS3(config, filePath);
        } else if (config.proton.enabled) {
          result = await uploadToProtonDrive(config, filePath);
        }

        if (result?.success) {
          console.log("Upload completed successfully!");
        } else {
          console.error(`Upload failed: ${result?.message}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      break;
    }
    case "upload-all": {
      try {
        const { config } = await loadConfig();
        if (!config.proton.enabled && !config.s3.enabled) {
          console.error("No upload service enabled. Configure S3 or Proton Drive in config.");
          console.error("Enable it by setting 's3.enabled: true' or 'proton.enabled: true' in ~/.config/recording-cli/config.json");
          process.exit(1);
          return;
        }

        const { promises: fs } = await import("node:fs");
        const { join } = await import("node:path");
        
        const files = await fs.readdir(config.recordingsDir);
        const videoFiles = files.filter(f => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'));
        
        if (videoFiles.length === 0) {
          console.log("No video files found in recordings directory.");
          break;
        }

        console.log(`Found ${videoFiles.length} video files to upload:`);
        videoFiles.forEach(f => console.log(`  - ${f}`));
        console.log();

        let successCount = 0;
        let failCount = 0;

        for (const file of videoFiles) {
          const filePath = join(config.recordingsDir, file);
          console.log(`\nUploading ${file}...`);
          
          // Try S3 first if enabled, then Proton Drive
          let result: any;
          if (config.s3.enabled) {
            result = await uploadToS3(config, filePath);
          } else if (config.proton.enabled) {
            result = await uploadToProtonDrive(config, filePath);
          } else {
            console.error("No upload service enabled. Configure S3 or Proton Drive in config.");
            failCount++;
            continue;
          }
          
          if (result.success) {
            successCount++;
          } else {
            failCount++;
            console.error(`Failed to upload ${file}: ${result.message}`);
          }
        }

        console.log(`\nUpload summary: ${successCount} successful, ${failCount} failed`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      break;
    }
    case "monitors": {
      try {
        const { spawn } = await import("node:child_process");
        
        console.log("Available monitors:");
        
        // Use xrandr to list monitors
        const xrandr = spawn("xrandr", ["--listmonitors"], {
          stdio: ["ignore", "pipe", "pipe"]
        });
        
        let output = "";
        xrandr.stdout?.on("data", (data) => {
          output += data.toString();
        });
        
        xrandr.on("close", (code) => {
          if (code === 0) {
            const lines = output.split('\n');
            lines.forEach((line, index) => {
              if (line.includes(':')) {
                const match = line.match(/(\d+):\s*\+?\*?\s*(\S+)\s+(\d+)\/\d+x(\d+)/);
                if (match) {
                  const [, id, name, width, height] = match;
                  console.log(`  ${id}: ${name} (${width}x${height})`);
                }
              }
            });
            console.log("\nUsage: --monitor 0  (for first monitor)");
            console.log("       --monitor 1  (for second monitor)");
            console.log("       --monitor all (for all monitors - default)");
          } else {
            console.log("  0: Primary monitor");
            console.log("  1: Secondary monitor (if available)");
            console.log("\nNote: Use xrandr --listmonitors for detailed info");
          }
        });
      } catch (err) {
        console.error("Error listing monitors:", err instanceof Error ? err.message : String(err));
      }
      break;
    }
    case "s3": {
      if (subcommand === "play") {
        try {
          const { config } = await loadConfig();
          if (!config.s3.enabled || !config.s3.bucket) {
            console.error("S3 not configured. Set s3.enabled and s3.bucket in config.");
            process.exit(1);
          }

          console.log("Fetching videos from S3...");
          const videos = await listVideos(config);
          
          if (videos.length === 0) {
            console.log("No videos found in S3.");
            break;
          }

          console.log("\nAvailable videos:");
          videos.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));

          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await new Promise<string>((resolve) => {
            rl.question("\nSelect video number: ", resolve);
          });
          rl.close();

          const idx = parseInt(answer, 10) - 1;
          if (isNaN(idx) || idx < 0 || idx >= videos.length) {
            console.error("Invalid selection.");
            process.exit(1);
          }

          console.log(`Opening ${videos[idx]} in VLC...`);
          const url = await getPresignedUrl(config, videos[idx]);
          playWithVlc(url);
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      } else {
        console.error("Unknown s3 command. Use: s3 play");
        process.exit(1);
      }
      break;
    }
    default: {
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
    }
  }
};

void main();
