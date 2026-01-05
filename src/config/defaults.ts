import { homedir } from "node:os";
import { join } from "node:path";

export type AppConfig = {
  recordingsDir: string;
  backend: "wf-recorder" | "gnome" | "obs" | "ffmpeg" | "hybrid" | "ffmpeg-only" | "simple";
  gnome: {
    pipeline?: string;
    framerate?: number;
    drawCursor?: boolean;
    audioSource?: "none" | "microphone" | "desktop" | "both";
  };
  obs: {
    enabled: boolean;
    host: string;
    port: number;
    password?: string;
  };
  features: {
    countdownSeconds: number;
    autoStopMinutes?: number;
    enableHotkeys: boolean;
    enableWindowPicker: boolean;
    enableCompression: boolean;
    namingTemplate: string;
  };
  proton: {
    enabled: boolean;
    accountEmail?: string;
    targetFolder: string;
  };
  s3: {
    enabled: boolean;
    bucket: string;
    region: string;
    prefix: string;
    profile?: string;
  };
  openai: {
    apiKey?: string;
    model: "whisper-1" | "gpt-4o-transcribe" | "gpt-4o-mini-transcribe";
    autoTranscribe: boolean;
  };
};

export const DEFAULT_CONFIG: AppConfig = {
  recordingsDir: join(homedir(), "Videos", "Recordings"),
  backend: "simple",
  gnome: {
    pipeline: undefined,
    framerate: 30,
    drawCursor: true,
    audioSource: "both"
  },
  obs: {
    enabled: false,
    host: "127.0.0.1",
    port: 4455,
    password: undefined
  },
  features: {
    countdownSeconds: 3,
    autoStopMinutes: undefined,
    enableHotkeys: false,
    enableWindowPicker: false,
    enableCompression: false,
    namingTemplate: "YYYY-MM-DD_HH-mm_[title]"
  },
  proton: {
    enabled: false,
    accountEmail: undefined,
    targetFolder: "/Recordings"
  },
  s3: {
    enabled: false,
    bucket: "",
    region: "us-east-1",
    prefix: "recordings/",
    profile: undefined
  },
  openai: {
    apiKey: undefined,
    model: "gpt-4o-mini-transcribe",
    autoTranscribe: false
  }
};
