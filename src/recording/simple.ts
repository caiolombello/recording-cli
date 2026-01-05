import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { formatName } from "./naming";
import { clearState, readState, writeState } from "./state";
import type { AppConfig } from "../config/defaults";
import OBSWebSocket from "obs-websocket-js";

export type StartOptions = {
  title?: string;
  audioSource?: "none" | "microphone" | "desktop" | "both";
  monitor?: string;
};

const buildOutputPath = async (config: AppConfig, title?: string): Promise<string> => {
  const base = formatName(config.features.namingTemplate, title);
  const folder = join(config.recordingsDir, base);
  await fs.mkdir(folder, { recursive: true });
  return join(folder, `${base}.mkv`);
};

const isOBSRunning = (): boolean => {
  try {
    const result = require("child_process").execSync("pgrep -x obs", { stdio: "pipe" });
    return result.toString().trim().length > 0;
  } catch {
    return false;
  }
};

const startOBSBackground = async (): Promise<void> => {
  console.log("🚀 Starting OBS in background...");
  
  const child = spawn("obs", ["--minimize-to-tray", "--disable-shutdown-check"], {
    stdio: "ignore",
    detached: true
  });
  child.unref();
  
  // Wait for OBS to start and WebSocket to be ready
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const obs = new OBSWebSocket();
    try {
      await obs.connect("ws://127.0.0.1:4455");
      await obs.disconnect();
      console.log("✓ OBS ready!");
      return;
    } catch {
      // Keep waiting
    }
  }
  throw new Error("OBS started but WebSocket not responding. Check OBS WebSocket settings.");
};

const connectOBS = async (): Promise<OBSWebSocket> => {
  const obs = new OBSWebSocket();
  
  // Try to connect
  try {
    await obs.connect("ws://127.0.0.1:4455");
    return obs;
  } catch {
    // OBS not running, start it
    if (!isOBSRunning()) {
      await startOBSBackground();
      await obs.connect("ws://127.0.0.1:4455");
      return obs;
    }
    throw new Error("OBS running but WebSocket not enabled. Enable in Tools → WebSocket Server Settings");
  }
};

export const startRecording = async (
  config: AppConfig,
  options: StartOptions
): Promise<{ outputPath: string }> => {
  const existing = await readState();
  if (existing) {
    throw new Error("A recording is already running. Run: record stop");
  }

  const outputPath = await buildOutputPath(config, options.title);
  
  const obs = await connectOBS();

  try {
    await obs.call("StartRecord");
    await obs.disconnect();
  } catch (err: any) {
    await obs.disconnect();
    throw new Error("Failed to start recording: " + err.message);
  }

  await writeState({
    backend: "obs-ws",
    outputPath,
    startedAt: new Date().toISOString()
  });
  
  console.log(`🎬 Recording started!`);
  console.log(`   Stop: bun run src/cli/index.ts record stop`);
  
  return { outputPath };
};

export const stopRecording = async (config: AppConfig): Promise<{ videoPath?: string }> => {
  const state = await readState();
  if (!state) {
    throw new Error("No active recording found.");
  }

  const obs = new OBSWebSocket();
  let obsOutputPath: string | undefined;
  
  try {
    await obs.connect("ws://127.0.0.1:4455");
    const result = await obs.call("StopRecord");
    obsOutputPath = result.outputPath;
    await obs.disconnect();
  } catch {
    console.log("⚠️ Could not connect to OBS.");
  }
  
  await clearState();

  // Move video to organized folder using state's outputPath (has correct name)
  let dest: string | undefined;
  if (obsOutputPath) {
    const folder = state.outputPath.replace(/\/[^/]+$/, ""); // get folder from state
    await fs.mkdir(folder, { recursive: true });
    dest = join(folder, obsOutputPath.split("/").pop()!);
    await fs.rename(obsOutputPath, dest);
    console.log(`✅ Recording saved: ${dest}`);
  } else {
    console.log(`✅ Recording stopped!`);
  }
  
  return { videoPath: dest };
};
