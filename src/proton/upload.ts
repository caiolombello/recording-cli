import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { basename, join, dirname } from "node:path";
import type { AppConfig } from "../config/defaults";

export type UploadResult = {
  success: boolean;
  message?: string;
};

const runCommand = async (command: string, args: string[]): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    
    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr || stdout });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });
  });
};

export const uploadToProtonDrive = async (
  config: AppConfig,
  localPath: string
): Promise<UploadResult> => {
  if (!config.proton.enabled) {
    return { success: false, message: "Proton Drive upload is disabled" };
  }

  try {
    const fileName = basename(localPath);
    console.log(`Attempting to upload ${fileName} to Proton Drive...`);
    console.log("⚠️  Note: rclone with Proton Drive has known compatibility issues");

    // Try the most basic rclone command possible
    const result = await runCommand("rclone", [
      "copy", 
      localPath, 
      `protondrive:${config.proton.targetFolder}`,
      "--ignore-existing",
      "--no-check-certificate"
    ]);

    if (result.success) {
      console.log(`✅ Upload successful: ${fileName}`);
      console.log(`📁 Local file preserved at: ${localPath}`);
      console.log(`🗑️  To delete local file: rm "${localPath}"`);
      return { success: true };
    } else {
      console.log(`❌ Upload failed: ${fileName}`);
      console.log(`📁 Local file preserved at: ${localPath}`);
      console.log(`\n🔧 Manual upload options:`);
      console.log(`   1. Use Proton Drive web interface`);
      console.log(`   2. Try: rclone copy "${localPath}" protondrive:${config.proton.targetFolder}`);
      console.log(`   3. Check rclone config: rclone config show protondrive`);
      
      return { 
        success: false, 
        message: `Upload failed but local file preserved. Try manual upload via web interface.` 
      };
    }
  } catch (err) {
    return { 
      success: false, 
      message: err instanceof Error ? err.message : String(err) 
    };
  }
};
