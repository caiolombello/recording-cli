import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, type AppConfig } from "./defaults";

const CONFIG_DIR = join(homedir(), ".config", "recording-cli");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export type LoadedConfig = {
  path: string;
  config: AppConfig;
};

export const getConfigPath = (): string => CONFIG_PATH;

export const ensureConfigDir = async (): Promise<void> => {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
};

type PartialConfig = Partial<AppConfig> & {
  gnome?: Partial<AppConfig["gnome"]>;
  obs?: Partial<AppConfig["obs"]>;
  features?: Partial<AppConfig["features"]>;
  proton?: Partial<AppConfig["proton"]>;
  s3?: Partial<AppConfig["s3"]>;
};

export const loadConfig = async (): Promise<LoadedConfig> => {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const data = JSON.parse(raw) as PartialConfig;
    return { path: CONFIG_PATH, config: mergeConfig(DEFAULT_CONFIG, data) };
  } catch {
    return { path: CONFIG_PATH, config: DEFAULT_CONFIG };
  }
};

export const writeDefaultConfig = async (): Promise<LoadedConfig> => {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return { path: CONFIG_PATH, config: DEFAULT_CONFIG };
};

const mergeConfig = (base: AppConfig, override: PartialConfig): AppConfig => ({
  ...base,
  ...override,
  gnome: { ...base.gnome, ...override.gnome },
  obs: { ...base.obs, ...override.obs },
  features: { ...base.features, ...override.features },
  proton: { ...base.proton, ...override.proton },
  s3: { ...base.s3, ...override.s3 }
});
