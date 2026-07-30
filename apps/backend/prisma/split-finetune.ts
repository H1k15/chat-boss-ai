/**
 * Tách file finetune JSONL (do export:finetune tạo) thành train/val (90/10).
 *
 * CHẠY:  pnpm --filter @cba/backend split:finetune
 * Đọc file exports/finetune-*.jsonl MỚI NHẤT, ghi exports/train.jsonl + val.jsonl.
 * Shuffle TẤT ĐỊNH (seed cố định) để tái lập y hệt mỗi lần chạy.
 * Các file trong exports/ đã gitignore (chứa PII — KHÔNG commit/chia sẻ).
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname, '..', 'exports');

function latestExport(): string {
  const files = readdirSync(dir)
    .filter((f) => /^finetune-.*\.jsonl$/.test(f))
    .sort();
  if (!files.length) {
    // eslint-disable-next-line no-console
    console.error('Không thấy exports/finetune-*.jsonl. Chạy export:finetune trước.');
    process.exit(1);
  }
  return join(dir, files[files.length - 1]);
}

// mulberry32 — PRNG tất định (không dùng Math.random để tái lập được).
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function main(): void {
  const file = latestExport();
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim());

  const rnd = makeRng(42);
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }

  const nVal = Math.max(1, Math.round(lines.length * 0.1));
  const val = lines.slice(0, nVal);
  const train = lines.slice(nVal);
  writeFileSync(join(dir, 'train.jsonl'), train.join('\n') + '\n', 'utf8');
  writeFileSync(join(dir, 'val.jsonl'), val.join('\n') + '\n', 'utf8');

  // eslint-disable-next-line no-console
  console.log(
    `Nguồn: ${file}\nTổng ${lines.length} -> train ${train.length} + val ${val.length}\n` +
      `Ghi: exports/train.jsonl , exports/val.jsonl`,
  );
}

main();
