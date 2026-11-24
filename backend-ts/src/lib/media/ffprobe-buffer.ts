import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type FfprobeResposne = {
  format: { duration: string };
  streams: {
    codec_name: string;
    codec_type: "audio" | "video";
    color_transfer: string;
    disposition?: { attached_pic?: number };
    height: number;
    mime_codec_string: string;
    pix_fmt: string;
    side_data_list?: [
      {
        side_data_type?: string;
        displaymatrix?: string;
        rotation?: number;
      },
    ];
    tags?: { rotate?: number };
    width: number;
  }[];
};

/**
 * Probes via a temp file rather than stdin: over a pipe ffprobe can't seek or
 * learn the file size, so e.g. MP3 durations come back as N/A and MP4s with a
 * trailing moov atom can fail to parse.
 */
export async function ffprobeBuffer(buf: Buffer): Promise<FfprobeResposne> {
  const dir = await mkdtemp(join(tmpdir(), "raven-ffprobe-"));
  try {
    const path = join(dir, "media");
    await writeFile(path, buf);
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      path,
    ]);
    return JSON.parse(stdout) as FfprobeResposne;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function getVideoRotation(
  v: FfprobeResposne["streams"][number]
): number {
  const fromSideData = v?.side_data_list?.find(
    (sd) => typeof sd.rotation === "number"
  )?.rotation;
  const raw = fromSideData ?? Number(v?.tags?.rotate ?? 0);
  return ((Math.round(raw) % 360) + 360) % 360; // -90 becomes 270
}
