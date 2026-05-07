// generate-icons.js — run once with: node generate-icons.js
// Outputs: electron/icons/icon.ico (Windows), icon.icns (macOS), icon.png (Linux)

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG   = path.join(__dirname, 'electron/icons/app-icon.svg');
const OUT   = path.join(__dirname, 'electron/icons');

// All sizes needed across platforms
const ALL_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
// Sizes baked into the .ico — PNG-in-ICO, supported by Windows Vista+
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

// Build a PNG-in-ICO file from an array of {size, buf} pairs.
// Format: 6-byte ICONDIR header + N×16-byte ICONDIRENTRY + PNG data blobs.
function buildIco(images) {
  const count = images.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: 1 = ICO
  header.writeUInt16LE(count, 4);  // number of images

  const entries = images.map(({ size, buf }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);   // width  (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1);   // height (0 = 256)
    entry.writeUInt8(0, 2);                         // palette colors
    entry.writeUInt8(0, 3);                         // reserved
    entry.writeUInt16LE(1, 4);                      // color planes
    entry.writeUInt16LE(32, 6);                     // bits per pixel
    entry.writeUInt32LE(buf.length, 8);             // data size
    entry.writeUInt32LE(offset, 12);                // data offset
    offset += buf.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(i => i.buf)]);
}

async function svgToPngBuffer(size) {
  return sharp(SVG).resize(size, size).png().toBuffer();
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });

  // 1. Generate individual PNGs (useful for debugging / future use)
  console.log('Generating PNGs…');
  for (const size of ALL_SIZES) {
    const buf = await svgToPngBuffer(size);
    fs.writeFileSync(path.join(OUT, `icon-${size}.png`), buf);
    process.stdout.write(`  ✓ ${size}x${size}\n`);
  }

  // 2. Windows — multi-resolution PNG-in-ICO
  console.log('Generating icon.ico (Windows)…');
  const icoImages = await Promise.all(
    ICO_SIZES.map(async size => ({ size, buf: await svgToPngBuffer(size) }))
  );
  fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco(icoImages));
  console.log('  ✓ icon.ico');

  // 3. macOS — .icns
  // Build the ICNS manually: header + icon family entries
  console.log('Generating icon.icns (macOS)…');
  const icnsEntries = [
    { osType: 'icp4', size: 16  },   // 16×16
    { osType: 'icp5', size: 32  },   // 32×32
    { osType: 'icp6', size: 64  },   // 64×64
    { osType: 'ic07', size: 128 },   // 128×128
    { osType: 'ic08', size: 256 },   // 256×256
    { osType: 'ic09', size: 512 },   // 512×512
    { osType: 'ic10', size: 1024},   // 1024×1024 (@2x 512)
  ];
  const chunks = [];
  for (const { osType, size } of icnsEntries) {
    const pngBuf = await svgToPngBuffer(size);
    const header = Buffer.alloc(8);
    header.write(osType, 0, 4, 'ascii');
    header.writeUInt32BE(pngBuf.length + 8, 4);
    chunks.push(header, pngBuf);
  }
  const body = Buffer.concat(chunks);
  const icnsHeader = Buffer.alloc(8);
  icnsHeader.write('icns', 0, 4, 'ascii');
  icnsHeader.writeUInt32BE(body.length + 8, 4);
  fs.writeFileSync(path.join(OUT, 'icon.icns'), Buffer.concat([icnsHeader, body]));
  console.log('  ✓ icon.icns');

  // 4. Linux — 512×512 PNG
  console.log('Generating icon.png (Linux)…');
  fs.copyFileSync(path.join(OUT, 'icon-512.png'), path.join(OUT, 'icon.png'));
  console.log('  ✓ icon.png');

  console.log('\nAll icons generated in electron/icons/');
}

run().catch(err => { console.error(err); process.exit(1); });
