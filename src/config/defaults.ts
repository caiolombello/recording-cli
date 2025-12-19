import { homedir } from "node:os";
import { join } from "node:path";

export type AppConfig = {
  recordingsDir: string;
  backend: "wf-recorder" | "gnome" | "obs";
  gnome: {
    pipeline?: string;
    framerate?: number;
    drawCursor?: boolean;
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
};

export const DEFAULT_CONFIG: AppConfig = {
  recordingsDir: join(homedir(), "Videos", "Recordings"),
  backend: "gnome",
  gnome: {
    pipeline: undefined,
    framerate: 30,
    drawCursor: true
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
  }
};
