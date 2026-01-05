import { sessionBus, Variant } from "dbus-next";
import { clearState, writeState } from "./state";
import { formatName } from "./naming";
import { homedir } from "node:os";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import type { AppConfig } from "../config/defaults";
import { uploadToProtonDrive } from "../proton/upload";

const SCREENCAST_SERVICE = "org.gnome.Shell.Screencast";
const SCREENCAST_PATH = "/org/gnome/Shell/Screencast";
const LOG_PATH = join(homedir(), ".config", "recording-cli", "gnome-daemon.log");

const buildTemplate = (config: AppConfig, title?: string): string => {
  const base = formatName(config.features.namingTemplate, title);
  return join(config.recordingsDir, base);
};

const writeLog = async (message: string): Promise<void> => {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.mkdir(join(homedir(), ".config", "recording-cli"), { recursive: true });
  await fs.appendFile(LOG_PATH, line);
};

const buildFullPipeline = (config: AppConfig): string => {
  if (config.gnome.pipeline) {
    return config.gnome.pipeline;
  }

  // For now, return empty to use default GNOME pipeline
  // Audio will be handled by system settings
  return "";
};

const buildOptions = (config: AppConfig): Record<string, Variant> => {
  const options: Record<string, Variant> = {};
  
  const pipeline = buildFullPipeline(config);
  if (pipeline) {
    options["pipeline"] = new Variant("s", pipeline);
  }
  
  if (config.gnome.framerate) {
    options["framerate"] = new Variant("i", config.gnome.framerate);
  }
  if (typeof config.gnome.drawCursor === "boolean") {
    options["draw-cursor"] = new Variant("b", config.gnome.drawCursor);
  }
  return options;
};

export const runGnomeDaemon = async (config: AppConfig, title?: string, geometry?: string): Promise<void> => {
  const bus = sessionBus();
  const obj = await bus.getProxyObject(SCREENCAST_SERVICE, SCREENCAST_PATH);
  const iface = obj.getInterface(SCREENCAST_SERVICE) as any;

  const template = buildTemplate(config, title);
  const options = buildOptions(config);

  const record = async (): Promise<string> => {
    if (geometry) {
      const match = geometry.match(/^(\d+)x(\d+)\+(\d+)\+(\d+)$/);
      if (!match) {
        throw new Error("Invalid --geometry format. Use WxH+X+Y (e.g., 1280x720+0+0).");
      }
      const width = Number(match[1]);
      const height = Number(match[2]);
      const x = Number(match[3]);
      const y = Number(match[4]);
      const [success, filename] = await iface.ScreencastArea(x, y, width, height, template, options);
      if (!success) {
        throw new Error("GNOME screencast failed to start.");
      }
      return filename;
    }

    const [success, filename] = await iface.Screencast(template, options);
    if (!success) {
      throw new Error("GNOME screencast failed to start.");
    }
    return filename;
  };

  let outputPath: string;
  try {
    outputPath = await record();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeLog(message);
    await clearState();
    bus.disconnect();
    process.exit(1);
    return;
  }

  await writeState({
    backend: "gnome",
    pid: process.pid,
    outputPath,
    startedAt: new Date().toISOString()
  });

  const stop = async (): Promise<void> => {
    try {
      await iface.StopScreencast();
      await writeLog("Recording stopped successfully");
      
      // Upload to cloud storage if enabled
      if (config.s3.enabled) {
        await writeLog(`Starting upload to S3: ${outputPath}`);
        console.log("Starting upload to S3...");
        
        const uploadResult = await import("../s3/upload").then(m => m.uploadToS3(config, outputPath));
        if (uploadResult.success) {
          await writeLog("S3 upload completed and local file deleted");
          console.log("S3 upload completed and local file deleted");
        } else {
          await writeLog(`S3 upload failed: ${uploadResult.message}`);
          console.error(`S3 upload failed: ${uploadResult.message}`);
        }
      } else if (config.proton.enabled) {
        await writeLog(`Starting upload to Proton Drive: ${outputPath}`);
        console.log("Starting upload to Proton Drive...");
        
        const uploadResult = await uploadToProtonDrive(config, outputPath);
        if (uploadResult.success) {
          await writeLog("Upload completed and local file deleted");
          console.log("Upload completed and local file deleted");
        } else {
          await writeLog(`Upload failed: ${uploadResult.message}`);
          console.error(`Upload failed: ${uploadResult.message}`);
        }
      } else {
        await writeLog("No upload service enabled");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await writeLog(`Error during stop: ${message}`);
      console.error(`Error during stop: ${message}`);
    } finally {
      await clearState();
      bus.disconnect();
      process.exit(0);
    }
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  iface.on("Error", async (_name: string, message: string) => {
    await writeLog(`GNOME screencast error: ${message}`);
    await clearState();
    bus.disconnect();
    process.exit(1);
  });

  // Keep process alive
  setInterval(() => {}, 60_000);
};
