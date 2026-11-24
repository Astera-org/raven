#!/usr/bin/env sh
# Regenerates the binary media fixtures served by media-mock/server.js. The
# outputs are committed so CI doesn't need ffmpeg; rerun this only when a
# fixture needs to change. blank.html and the SVGs are hand-written. Requires
# ffmpeg and backend-ts's dependencies to be installed (for sharp).
#
# MP4s use +faststart because the backend probes media via `ffprobe -i pipe:0`,
# which can't seek to a moov atom at the end of the file. Durations are 1s
# rather than 0 so durationMs is observable in assertions.
set -eu

cd "$(dirname "$0")"

ffmpeg() {
  command ffmpeg -hide_banner -loglevel error -y -bitexact "$@"
}

ffmpeg -f lavfi -i color=c=black:s=1x1 -frames:v 1 pixel.png

# Stored as 1x2 with EXIF Orientation 6 (rotate 90° clockwise), so it displays
# as 2x1. ffmpeg can't write EXIF, so this uses backend-ts's sharp.
node - "$(cd ../../../backend-ts && pwd)" <<'EOF'
const { createRequire } = require("node:module");
const sharp = createRequire(`${process.argv[2]}/package.json`)("sharp");
sharp({ create: { width: 1, height: 2, channels: 3, background: "#000" } })
  .withMetadata({ orientation: 6 })
  .jpeg()
  .toFile("pixel-orient6.jpg");
EOF

# Three 2x1 frames, so a height stacked across frames (3) is distinguishable
# from the frame height (1).
node - "$(cd ../../../backend-ts && pwd)" <<'EOF'
const { createRequire } = require("node:module");
const sharp = createRequire(`${process.argv[2]}/package.json`)("sharp");
const frame = (background) =>
  sharp({ create: { width: 2, height: 1, channels: 3, background } })
    .png()
    .toBuffer();
Promise.all(["#000", "#fff", "#000"].map(frame)).then((frames) =>
  sharp(frames, { join: { animated: true } })
    .gif()
    .toFile("pixel-animated.gif")
);
EOF

# H.264 with yuv420p requires even dimensions, so 2x2 is the smallest video.
ffmpeg -f lavfi -i color=c=black:s=2x2:r=1 -frames:v 1 \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart pixel.mp4

# Non-square so the backend's width/height swap for rotated video is visible.
ffmpeg -f lavfi -i color=c=black:s=2x4:r=1 -frames:v 1 \
  -c:v libx264 -pix_fmt yuv420p pixel-rot90.tmp.mp4
ffmpeg -display_rotation 90 -i pixel-rot90.tmp.mp4 \
  -c copy -movflags +faststart pixel-rot90.mp4
rm pixel-rot90.tmp.mp4

ffmpeg -f lavfi -i anullsrc=r=8000:cl=mono -t 1 \
  -c:a libmp3lame -b:a 8k silence.mp3
