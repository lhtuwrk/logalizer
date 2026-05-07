// Read a file as an async iterable of lines, efficient for large files.
import fs from 'fs';
import zlib from 'zlib';
import readline from 'readline';

export async function* readLines(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 256 * 1024 });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

// Same as readLines but transparently decompresses a .gz file on the fly.
export async function* readGzipLines(filePath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of rl) yield line;
}

export async function* iterText(text) {
  // Split-by-newline iterable for pasted text.
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      let end = i;
      if (end > start && text.charCodeAt(end - 1) === 13) end--;
      yield text.slice(start, end);
      start = i + 1;
    }
  }
  if (start < text.length) yield text.slice(start);
}
