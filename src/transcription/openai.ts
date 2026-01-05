import fs from "node:fs";
import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import OpenAI from "openai";
import type { AppConfig } from "../config/defaults";

const MAX_DURATION = 1300; // seconds, with margin below 1400s limit

const getAudioDuration = (path: string): number => {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`,
    { encoding: "utf-8" }
  );
  return parseFloat(out.trim());
};

const extractAndSpeedUpAudio = async (videoPath: string, speed: number = 1.5): Promise<string> => {
  const folder = videoPath.replace(/\/[^/]+$/, "");
  const audioPath = join(folder, "audio_fast.mp3");
  
  console.log(`🎵 Extracting and speeding up audio (${speed}x)...`);
  execSync(
    `ffmpeg -y -i "${videoPath}" -vn -filter:a "atempo=${speed}" -b:a 64k "${audioPath}"`,
    { stdio: "pipe" }
  );
  
  return audioPath;
};

const extractChunk = (audioPath: string, start: number, duration: number, index: number): string => {
  const folder = audioPath.replace(/\/[^/]+$/, "");
  const chunkPath = join(folder, `chunk_${index}.mp3`);
  execSync(
    `ffmpeg -y -ss ${start} -i "${audioPath}" -t ${duration} -c copy "${chunkPath}"`,
    { stdio: "pipe" }
  );
  return chunkPath;
};

type Segment = {
  speaker: string;
  text: string;
  start: number;
  end: number;
};

const formatTimestamp = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

const formatTranscript = (segments: Segment[], speed: number): string => {
  let result = "";
  let currentSpeaker = "";
  
  for (const seg of segments) {
    // Adjust timestamps back to original speed
    const realStart = seg.start * speed;
    const realEnd = seg.end * speed;
    
    if (seg.speaker !== currentSpeaker) {
      currentSpeaker = seg.speaker;
      result += `\n[${formatTimestamp(realStart)}] ${seg.speaker}:\n`;
    }
    result += `${seg.text} `;
  }
  
  return result.trim();
};

const generateSummary = async (openai: OpenAI, transcript: string): Promise<string> => {
  console.log("🤖 Generating summary...");
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Gere um resumo conciso em português da transcrição. Inclua: pontos principais discutidos, decisões tomadas, e action items se houver. Máximo 500 palavras."
      },
      { role: "user", content: transcript }
    ],
  });
  
  return response.choices[0].message.content || "";
};

const transcribeChunk = async (
  openai: OpenAI,
  audioPath: string,
  offsetSeconds: number
): Promise<Segment[]> => {
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "gpt-4o-transcribe-diarize",
    // @ts-ignore - not in types yet
    response_format: "diarized_json",
    // @ts-ignore
    chunking_strategy: "auto",
  }) as any;

  return (response.segments || []).map((seg: Segment) => ({
    ...seg,
    start: seg.start + offsetSeconds,
    end: seg.end + offsetSeconds,
  }));
};

export const transcribe = async (
  config: AppConfig,
  videoPath: string
): Promise<string> => {
  const apiKey = config.openai.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not configured. Set openai.apiKey in config or OPENAI_API_KEY env var.");
  }

  const openai = new OpenAI({ apiKey });
  const folder = videoPath.replace(/\/[^/]+$/, "");
  const speed = 1.0;

  const audioPath = await extractAndSpeedUpAudio(videoPath, speed);
  const duration = getAudioDuration(audioPath);
  
  console.log("📝 Transcribing with speaker diarization...");
  
  let allSegments: Segment[] = [];
  const chunkPaths: string[] = [];

  if (duration <= MAX_DURATION) {
    allSegments = await transcribeChunk(openai, audioPath, 0);
  } else {
    const numChunks = Math.ceil(duration / MAX_DURATION);
    console.log(`   Audio is ${Math.round(duration)}s, splitting into ${numChunks} chunks...`);
    
    for (let i = 0; i < numChunks; i++) {
      const start = i * MAX_DURATION;
      const chunkDuration = Math.min(MAX_DURATION, duration - start);
      const chunkPath = extractChunk(audioPath, start, chunkDuration, i);
      chunkPaths.push(chunkPath);
      
      console.log(`   Transcribing chunk ${i + 1}/${numChunks}...`);
      const segments = await transcribeChunk(openai, chunkPath, start);
      allSegments.push(...segments);
    }
  }

  const transcript = formatTranscript(allSegments, speed);
  const summary = await generateSummary(openai, transcript);
  
  const output = `# Transcrição

${transcript}

---

# Resumo

${summary}
`;

  const txtPath = join(folder, "transcript.txt");
  await fsp.writeFile(txtPath, output);
  
  // Cleanup
  await fsp.unlink(audioPath).catch(() => {});
  for (const p of chunkPaths) await fsp.unlink(p).catch(() => {});
  
  console.log(`✅ Transcript saved: ${txtPath}`);
  return output;
};
