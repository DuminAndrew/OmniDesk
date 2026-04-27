/**
 * Convert OmniDeskIcon.svg → build/icon.ico (multi-resolution) and build/icon.png (512×512).
 * Run with: npm run build:icon
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const ROOT = path.resolve(__dirname, '..');
const SVG = path.join(ROOT, 'OmniDeskIcon.svg');
const BUILD = path.join(ROOT, 'build');

if (!fs.existsSync(SVG)) {
  console.error('Missing source SVG:', SVG);
  process.exit(1);
}
fs.mkdirSync(BUILD, { recursive: true });

const ICO_SIZES = [16, 32, 48, 64, 128, 256];

(async () => {
  const svg = fs.readFileSync(SVG);

  // Multi-size PNG buffers for ICO
  const buffers = await Promise.all(
    ICO_SIZES.map((size) => sharp(svg).resize(size, size).png().toBuffer())
  );
  const ico = await pngToIco(buffers);
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), ico);
  console.log('✓ build/icon.ico');

  // 512×512 PNG fallback (Linux/macOS, dev)
  await sharp(svg).resize(512, 512).png().toFile(path.join(BUILD, 'icon.png'));
  console.log('✓ build/icon.png');

  // 32×32 tray
  await sharp(svg).resize(32, 32).png().toFile(path.join(BUILD, 'tray.png'));
  console.log('✓ build/tray.png');
})().catch((err) => {
  console.error('Icon build failed:', err);
  process.exit(1);
});
