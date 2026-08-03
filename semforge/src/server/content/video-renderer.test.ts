import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assembleProductionVideo, probeVideo } from "@/server/content/video-renderer";

function ffmpeg(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

function silentClip(directory: string, name: string, color: string): Buffer {
  const output = path.join(directory, name);
  execFileSync(ffmpeg(), [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=${color}:s=640x360:d=1`,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-an",
    output,
  ], { stdio: "ignore" });
  return fs.readFileSync(output);
}

test("오디오가 없는 xAI 장면에도 무음 트랙을 보완해 최종 MP4를 조립한다", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "semforge-xai-video-"));
  try {
    const first = silentClip(directory, "first.mp4", "red");
    const second = silentClip(directory, "second.mp4", "blue");
    assert.equal((await probeVideo(first)).hasAudio, false);

    const result = await assembleProductionVideo({
      scenes: [{ bytes: first, duration: 1 }, { bytes: second, duration: 1 }],
      aspectRatio: "16:9",
    });

    assert.equal(result.width, 1280);
    assert.equal(result.height, 720);
    assert.equal(result.hasAudio, true);
    assert.ok(result.video.length > 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
