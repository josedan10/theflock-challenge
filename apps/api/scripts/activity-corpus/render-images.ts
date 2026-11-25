import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const directory = join(dirname(fileURLToPath(import.meta.url)), "images");

const palettes = [
  ["#7DD3FC", "#86EFAC", "#FDE68A"],
  ["#1E293B", "#F97316", "#F8FAFC"],
  ["#FBCFE8", "#BE185D", "#FFF7ED"],
  ["#D9F99D", "#365314", "#FEF3C7"],
  ["#C4B5FD", "#312E81", "#FDE68A"],
  ["#FED7AA", "#9A3412", "#FFEDD5"],
  ["#A5F3FC", "#155E75", "#ECFEFF"],
  ["#FECACA", "#7F1D1D", "#FFF1F2"],
  ["#BBF7D0", "#14532D", "#FEF9C3"],
  ["#E2E8F0", "#0F172A", "#FDBA74"],
];

function scene(index: number): string {
  const palette = palettes[index % palettes.length] ?? palettes[0];
  if (palette === undefined) {
    throw new Error("Missing scene palette.");
  }
  const [sky, ground, accent] = palette;
  const motif = index % 6;
  const extra =
    motif === 0
      ? `<circle cx="520" cy="78" r="36" fill="${accent}"/>`
      : motif === 1
        ? `<rect x="80" y="150" width="140" height="90" rx="8" fill="${accent}"/>`
        : motif === 2
          ? `<path d="M40 250 C180 180 280 300 460 210 C540 170 600 230 640 200 L640 360 L0 360 Z" fill="${accent}"/>`
          : motif === 3
            ? `<rect x="250" y="120" width="28" height="140" fill="${accent}"/><circle cx="264" cy="108" r="34" fill="${accent}"/>`
            : motif === 4
              ? `<rect x="160" y="168" width="320" height="16" rx="8" fill="${accent}"/>`
              : `<circle cx="200" cy="200" r="28" fill="${accent}"/><circle cx="320" cy="170" r="18" fill="${accent}"/><circle cx="430" cy="210" r="22" fill="${accent}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
    <rect width="640" height="360" fill="${sky}"/>
    <rect y="230" width="640" height="130" fill="${ground}"/>
    ${extra}
  </svg>`;
}

await mkdir(directory, { recursive: true });
for (let index = 0; index < 30; index += 1) {
  const name = `scene-${String(index + 1).padStart(2, "0")}.png`;
  const png = await sharp(Buffer.from(scene(index)))
    .png()
    .toBuffer();
  await writeFile(join(directory, name), png);
}
