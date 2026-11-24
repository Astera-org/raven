/**
 * Decide whether a stored video is web-deliverable as-is, needs a remux
 * (container change, no quality loss), or needs a transcode.
 *
 * Target: MP4 + H.264 (8-bit 4:2:0, SDR) + AAC, with faststart.
 * That combination plays in every current browser.
 */

import { type MediaAsset } from "#src/db/schema.js";

interface CompatPolicy {
  /** Transcode (downscale) anything taller than this. null = no limit. */
  maxHeight: number | null;
  maxFrameRate: number;
  /** Transcode if the video bitrate exceeds this (bits/s). null = no limit. */
  maxVideoBitRate: number | null;
  maxAudioChannels: number;
}

const defaultPolicy: CompatPolicy = {
  maxHeight: null, // originals keep full size; sized variants are separate derivatives
  maxFrameRate: 60,
  maxVideoBitRate: null,
  maxAudioChannels: 2,
};

type StreamAction = "copy" | "transcode";

interface CompatResult {
  action: "none" | "remux" | "transcode";
  /** Convenience flag: true if anything needs doing */
  needsWork: boolean;
  video: StreamAction | null; // null if there is no video stream
  audio: StreamAction | null; // null if there is no audio stream
  hdr: boolean;
  downscaleTo: number | null; // target height, if downscaling
  reasons: string[];
}

const WEB_CONTAINER = "video/mp4";
const OK_PIX_FMTS = new Set(["yuv420p", "yuvj420p"]); // yuvj420p is full-range 8-bit 4:2:0, which browsers handle
const HDR_TRANSFERS = new Set(["smpte2084", "arib-std-b67"]);
// const OK_SAMPLE_RATES = new Set([44100, 48000]);

// H.264 profile_idc values that browsers decode: Baseline, Main, High (and Constrained Baseline shares 66)
const OK_H264_PROFILES = new Set([66, 77, 100]);

function h264ProfileIdc(codecString: string | null): number | null {
  // "avc1.PPCCLL" where PP is profile_idc in hex
  const m = codecString?.match(/^avc[13]\.([0-9a-f]{2})[0-9a-f]{4}$/i);
  return m ? parseInt(m[1]!, 16) : null;
}

export function checkVideoCompatibility(
  meta: MediaAsset,
  policy: CompatPolicy = defaultPolicy
): CompatResult {
  const reasons: string[] = [];
  let video: StreamAction | null = meta.videoCodec ? "copy" : null;
  let audio: StreamAction | null = meta.audioCodec ? "copy" : null;
  let downscaleTo: number | null = null;
  const hdr = !!meta.colorTransfer && HDR_TRANSFERS.has(meta.colorTransfer);

  // Video stream
  if (meta.videoCodec) {
    if (meta.videoCodec !== "h264") {
      video = "transcode";
      reasons.push(
        `video codec ${meta.videoCodec} is not universally supported`
      );
    } else {
      const profile = h264ProfileIdc(meta.videoCodecString);
      if (profile !== null && !OK_H264_PROFILES.has(profile)) {
        video = "transcode";
        reasons.push(
          `H.264 profile ${profile} (e.g. High 10 / 4:2:2 / 4:4:4) is not browser-decodable`
        );
      }
    }

    if (meta.pixelFormat && !OK_PIX_FMTS.has(meta.pixelFormat)) {
      video = "transcode";
      reasons.push(`pixel format ${meta.pixelFormat} is not 8-bit 4:2:0`);
    }

    if (hdr) {
      video = "transcode";
      reasons.push(
        `HDR transfer ${meta.colorTransfer} needs tone mapping to SDR`
      );
    }

    // const fps = meta.frameRate == null ? null : Number(meta.frameRate);
    // if (fps !== null && fps > policy.maxFrameRate + 0.01) {
    //   video = "transcode";
    //   reasons.push(`frame rate ${fps} exceeds ${policy.maxFrameRate}`);
    // }

    if (
      policy.maxHeight !== null &&
      meta.height !== null &&
      meta.height > policy.maxHeight
    ) {
      video = "transcode";
      downscaleTo = policy.maxHeight;
      reasons.push(`height ${meta.height} exceeds ${policy.maxHeight}`);
    }

    // if (
    //   policy.maxVideoBitRate !== null &&
    //   meta.videoBitRate !== null &&
    //   meta.videoBitRate > policy.maxVideoBitRate
    // ) {
    //   video = "transcode";
    //   reasons.push(
    //     `video bitrate ${meta.videoBitRate} exceeds ${policy.maxVideoBitRate}`
    //   );
    // }
  }

  // Audio stream
  if (meta.audioCodec) {
    if (meta.audioCodec !== "aac") {
      audio = "transcode";
      reasons.push(`audio codec ${meta.audioCodec} is not AAC`);
    }
    // if (
    //   meta.audioChannels !== null &&
    //   meta.audioChannels > policy.maxAudioChannels
    // ) {
    //   audio = "transcode";
    //   reasons.push(
    //     `${meta.audioChannels} audio channels exceeds ${policy.maxAudioChannels}`
    //   );
    // }
    // if (meta.sampleRate !== null && !OK_SAMPLE_RATES.has(meta.sampleRate)) {
    //   audio = "transcode";
    //   reasons.push(`sample rate ${meta.sampleRate} is not 44.1 or 48 kHz`);
    // }
  }

  // Container and faststart (only matter if we're not already transcoding)
  const wrongContainer = meta.mimeType !== WEB_CONTAINER;
  if (wrongContainer) {
    reasons.push(`container ${meta.mimeType ?? "unknown"} is not MP4`);
  }
  // if (meta.faststart === false) {
  //   reasons.push("moov atom is not at the start of the file (no faststart)");
  // }

  const action: CompatResult["action"] =
    video === "transcode" || audio === "transcode"
      ? "transcode"
      : wrongContainer //|| meta.faststart === false
        ? "remux"
        : "none";

  return {
    action,
    needsWork: action !== "none",
    video,
    audio,
    hdr,
    downscaleTo,
    reasons,
  };
}

/** Simple boolean form, if that's all a caller needs. */
export const needsProcessing = (meta: MediaAsset, policy?: CompatPolicy) =>
  checkVideoCompatibility(meta, policy).needsWork;

/**
 * Build ffmpeg arguments for a result. Streams marked "copy" are passed through
 * untouched; transcoded streams target H.264/AAC. Always writes a faststart MP4.
 *
 * On transcode, ffmpeg applies rotation metadata by default (autorotate), so the
 * output frames are upright. On copy, the rotation matrix is carried over as-is,
 * which browsers honor.
 *
 * Not currently in use, but ready to be used as we decide to transcode or
 * remux streams.
 *
 * Note: various logic statements on additional metadata are listed above, and
 * they will need to be commented out and used in order for this to be fully
 * effective.
 */
export function buildFfmpegArgs(
  result: CompatResult,
  input: string,
  output: string
): string[] {
  const args = [
    "-hide_banner",
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
  ];

  if (result.video === "transcode") {
    const filters: string[] = [];
    if (result.hdr) {
      // Standard HDR→SDR tone map chain; needs an ffmpeg build with libzimg (Debian/Ubuntu packages have it)
      filters.push(
        "zscale=t=linear:npl=100",
        "format=gbrpf32le",
        "zscale=p=bt709",
        "tonemap=tonemap=hable:desat=0",
        "zscale=t=bt709:m=bt709:r=tv"
      );
    }
    if (result.downscaleTo) {
      filters.push(`scale=-2:'min(ih,${result.downscaleTo})'`);
    }
    filters.push("format=yuv420p");
    args.push(
      "-vf",
      filters.join(","),
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-preset",
      "medium",
      "-crf",
      "23"
    );
  } else if (result.video === "copy") {
    args.push("-c:v", "copy");
  }

  if (result.audio === "transcode") {
    args.push("-c:a", "aac", "-b:a", "160k", "-ac", "2", "-ar", "48000");
  } else if (result.audio === "copy") {
    args.push("-c:a", "copy");
  }

  args.push("-movflags", "+faststart", output);
  return args;
}
