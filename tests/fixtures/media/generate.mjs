import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const OUTPUT_DIR = import.meta.dirname;
const SOURCE = "testsrc2=size=320x568:rate=15:duration=1";

const ffmpeg = (...args) =>
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], {
    stdio: "inherit",
  });

const output = (name) => resolve(OUTPUT_DIR, name);

ffmpeg(
  "-f",
  "lavfi",
  "-i",
  SOURCE,
  "-frames:v",
  "1",
  "-q:v",
  "12",
  output("sample.jpg"),
);
ffmpeg(
  "-f",
  "lavfi",
  "-i",
  SOURCE,
  "-frames:v",
  "1",
  "-pix_fmt",
  "pal8",
  output("sample.png"),
);
ffmpeg(
  "-f",
  "lavfi",
  "-i",
  SOURCE,
  "-c:v",
  "libx264",
  "-preset",
  "veryslow",
  "-crf",
  "40",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "-an",
  output("sample.mp4"),
);
