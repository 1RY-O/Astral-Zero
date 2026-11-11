/**
 * ASTRAL ZERO — ASCII Matrix & Glitch Typography Engine.
 * Converts hero strings into multi-line animated block glyphs with per-character wave shimmer,
 * 3-band cursor parallax, and scroll dissolution.
 * Built for the NASA International Space Apps Challenge 2026.
 */

// Massive 6-line Block ASCII Matrix for Hero Title: ASTRAL ZERO
export const ASCII_HERO = [
  ' █████╗ ███████╗████████╗██████╗  █████╗ ██╗         ███████╗███████╗██████╗  ██████╗ ',
  '██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██║         ╚══███╔╝██╔════╝██╔══██╗██╔═══██╗',
  '███████║███████╗   ██║   ██████╔╝███████║██║           ███╔╝ █████╗  ██████╔╝██║   ██║',
  '██╔══██║╚════██║   ██║   ██╔══██╗██╔══██║██║          ███╔╝  ██╔══╝  ██╔══██╗██║   ██║',
  '██║  ██║███████║   ██║   ██║  ██║██║  ██║███████╗    ███████╗███████╗██║  ██║╚██████╔╝',
  '╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝    ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ',
];

export const ASCII_SUBTITLE = [
  'CATHODE SALVAGE · DEEP-SPACE PIRATE FEED · CHANNEL 73',
  'ACTIVE ORBITAL DEBRIS RECOVERY · NASA SPACE APPS 2026',
];

const SCATTER_CHARS = ['█', '▓', '▒', '░', '▄', '▀', '■', '✦', '▲', '▼', '#', '0', '1', ':', 'Ø'];

/**
 * Renders shimmering animated ASCII hero with parallax displacement and scroll dissolve.
 */
export function renderAsciiHero(lines, timeSeconds, scrollRatio = 0, mouseOffset = { x: 0, y: 0 }) {
  const resultLines = [];
  const scatterThreshold = Math.min(1.0, scrollRatio * 1.8);

  for (let r = 0; r < lines.length; r++) {
    const rawLine = lines[r];
    let processedLine = '';

    for (let c = 0; c < rawLine.length; c++) {
      const char = rawLine[c];

      // Empty spaces remain empty unless scattered on scroll
      if (char === ' ') {
        if (scatterThreshold > 0.4 && Math.random() < scatterThreshold * 0.15) {
          processedLine += SCATTER_CHARS[Math.floor(Math.random() * SCATTER_CHARS.length)];
        } else {
          processedLine += ' ';
        }
        continue;
      }

      // Shimmer wave calculation
      const wave = Math.sin(timeSeconds * 3.5 + c * 0.18 + r * 0.45);

      // On scroll: dissolve characters into scattered glyphs
      const charHash = (c * 17 + r * 31) % 100;
      if (scatterThreshold > 0 && charHash < scatterThreshold * 100) {
        if (Math.random() < 0.35) {
          processedLine += ' ';
        } else {
          processedLine += SCATTER_CHARS[Math.floor(Math.random() * SCATTER_CHARS.length)];
        }
      } else if (wave > 0.65) {
        // High peak shimmer glint
        processedLine += '▓';
      } else if (wave < -0.65) {
        processedLine += '▒';
      } else {
        processedLine += char;
      }
    }

    resultLines.push(processedLine);
  }

  return resultLines;
}
