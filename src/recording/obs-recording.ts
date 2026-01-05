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
  await fs.mkdir(config.recordingsDir, { recursive: true });
  const base = formatName(config.features.namingTemplate, title);
  return join(config.recordingsDir, `${base}.mkv`);
};

export const startRecording = async (
  config: AppConfig,
  options: StartOptions
): Promise<{ outputPath: string }> => {
  const existing = await readState();
  if (existing) {
    throw new Error("A recording is already running.");
  }

  const outputPath = await buildOutputPath(config, options.title);
  
  const obs = new OBSWebSocket();
  
  try {
    await obs.connect(`ws://${config.obs.host}:${config.obs.port}`, config.obs.password);
  } catch (err) {
    throw new Error(`Cannot connect to OBS. Make sure OBS is running with WebSocket enabled.\n\nTo enable:\n1. Open OBS\n2. Tools > WebSocket Server Settings\n3. Enable WebSocket Server\n4. Set port to ${config.obs.port}`);
  }
  
  // Set output path
  await obs.call("SetRecordDirectory", { recordDirectory: config.recordingsDir });
  
  // Start recording
  await obs.call("StartRecord");
  
  await obs.disconnect();
  
  await writeState({
    backend: "obs",
    outputPath,
    startedAt: new Date().toISOString()
  });
  
  console.log(`🎬 Recording started via OBS!`);
  return { outputPath };
};

export const stopRecording = async (config: AppConfig): Promise<void> => {
  const state = await readState();
  if (!state) {
    throw new Error("No active recording found.");
  }

  const obs = new OBSWebSocket();
  
  try {
    await obs.connect(`ws://${config.obs.host}:${config.obs.port}`, config.obs.password);
    await obs.call("StopRecord");
    await obs.disconnect();
    console.log(`✅ Recording saved!`);
  } catch (err) {
    throw new Error("Cannot connect to OBS to stop recording.");
  }
  
  await clearState();
};
