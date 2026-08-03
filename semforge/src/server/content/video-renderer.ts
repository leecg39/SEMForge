import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ApiError } from "@/lib/api";

const TRANSITION_SECONDS = 0.25;

function executable(name: "ffmpeg" | "ffprobe"): string {
  return process.env[name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"]?.trim() || name;
}

async function run(command: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ApiError("INTERNAL", "영상 렌더링 시간이 초과되었습니다."));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout = (stdout + chunk).slice(-100_000); });
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-100_000); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new ApiError("INTERNAL", `FFmpeg 실행에 실패했습니다. (${stderr.slice(-600) || `exit ${code}`})`));
    });
  });
}

export async function getFfmpegCapability(): Promise<{ enabled: boolean; reason: string | null }> {
  try {
    await run(executable("ffmpeg"), ["-version"], 3_000);
    await run(executable("ffprobe"), ["-version"], 3_000);
    return { enabled: true, reason: null };
  } catch {
    return { enabled: false, reason: "FFmpeg와 FFprobe 실행 파일이 필요합니다." };
  }
}

export async function probeVideo(bytes: Buffer): Promise<{
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  hasAudio: boolean;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "semforge-probe-"));
  const input = path.join(directory, "input.mp4");
  try {
    await fs.writeFile(input, bytes, { mode: 0o600 });
    const result = await run(executable("ffprobe"), [
      "-v", "error",
      "-show_streams",
      "-show_format",
      "-of", "json",
      input,
    ], 20_000);
    const payload = JSON.parse(result.stdout) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; duration?: string }>;
      format?: { duration?: string };
    };
    const video = payload.streams?.find((stream) => stream.codec_type === "video");
    if (!video?.width || !video.height) throw new ApiError("VALIDATION_ERROR", "영상 해상도를 확인할 수 없습니다.");
    const [numerator, denominator] = (video.avg_frame_rate ?? "24/1").split("/").map(Number);
    const duration = Number(video.duration ?? payload.format?.duration ?? 0);
    return {
      width: video.width,
      height: video.height,
      durationMs: Math.max(0, Math.round(duration * 1_000)),
      fps: denominator ? Math.round(numerator / denominator) : 24,
      hasAudio: Boolean(payload.streams?.some((stream) => stream.codec_type === "audio")),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("VALIDATION_ERROR", "손상되었거나 지원하지 않는 MP4 영상입니다.");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function outputSize(aspectRatio: "16:9" | "9:16" | "1:1") {
  if (aspectRatio === "9:16") return { width: 720, height: 1280 };
  if (aspectRatio === "1:1") return { width: 720, height: 720 };
  return { width: 1280, height: 720 };
}

export async function assembleProductionVideo(input: {
  scenes: Array<{ bytes: Buffer; duration: number }>;
  aspectRatio: "16:9" | "9:16" | "1:1";
}): Promise<{
  video: Buffer;
  poster: Buffer;
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  hasAudio: boolean;
}> {
  if (input.scenes.length === 0) throw new ApiError("VALIDATION_ERROR", "조립할 영상 장면이 없습니다.");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "semforge-video-"));
  const output = path.join(directory, "final.mp4");
  const poster = path.join(directory, "poster.jpg");
  const size = outputSize(input.aspectRatio);
  try {
    const scenePaths = await Promise.all(input.scenes.map(async (scene, index) => {
      const target = path.join(directory, `scene-${index}.mp4`);
      await fs.writeFile(target, scene.bytes, { mode: 0o600 });
      return target;
    }));
    const probes = await Promise.all(input.scenes.map((scene) => probeVideo(scene.bytes)));
    const args: string[] = [];
    let nextInputIndex = 0;
    const inputStreams = scenePaths.map((scenePath, index) => {
      const video = nextInputIndex;
      args.push("-i", scenePath);
      nextInputIndex += 1;
      if (probes[index].hasAudio) return { video, audio: video };
      const audio = nextInputIndex;
      args.push(
        "-f", "lavfi",
        "-t", String(input.scenes[index].duration),
        "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      );
      nextInputIndex += 1;
      return { video, audio };
    });
    const filters: string[] = [];
    input.scenes.forEach((_scene, index) => {
      filters.push(`[${inputStreams[index].video}:v]scale=${size.width}:${size.height}:force_original_aspect_ratio=increase,crop=${size.width}:${size.height},fps=24,format=yuv420p,setpts=PTS-STARTPTS[v${index}]`);
      filters.push(`[${inputStreams[index].audio}:a]aresample=48000,asetpts=PTS-STARTPTS[a${index}]`);
    });
    let videoLabel = "v0";
    let audioLabel = "a0";
    let accumulated = input.scenes[0].duration;
    for (let index = 1; index < input.scenes.length; index += 1) {
      const nextVideo = `vx${index}`;
      const nextAudio = `ax${index}`;
      const offset = Math.max(0, accumulated - TRANSITION_SECONDS * index).toFixed(2);
      filters.push(`[${videoLabel}][v${index}]xfade=transition=fade:duration=${TRANSITION_SECONDS}:offset=${offset}[${nextVideo}]`);
      filters.push(`[${audioLabel}][a${index}]acrossfade=d=${TRANSITION_SECONDS}:c1=tri:c2=tri[${nextAudio}]`);
      videoLabel = nextVideo;
      audioLabel = nextAudio;
      accumulated += input.scenes[index].duration;
    }
    filters.push(probes.some((probe) => probe.hasAudio)
      ? `[${audioLabel}]loudnorm=I=-14:TP=-1:LRA=11[aout]`
      : `[${audioLabel}]anull[aout]`);
    await run(executable("ffmpeg"), [
      "-y",
      ...args,
      "-filter_complex", filters.join(";"),
      "-map", `[${videoLabel}]`,
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      output,
    ], 10 * 60_000);
    await run(executable("ffmpeg"), [
      "-y", "-ss", "0.5", "-i", output, "-frames:v", "1", "-q:v", "2", poster,
    ], 60_000);
    const video = await fs.readFile(output);
    const metadata = await probeVideo(video);
    return { video, poster: await fs.readFile(poster), ...metadata };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
