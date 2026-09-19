// scripts/backup/prune-old-backups.mjs
//
// Deletes dated backup files/folders older than RETENTION_DAYS.
// Works on two backup layouts:
//   backups/db/YYYY-MM-DD.sql        (a dated file)
//   backups/storage/YYYY-MM-DD/      (a dated folder, only at this depth)
//
// Usage: node prune-old-backups.mjs <dir> <mode: file|folder>
// Env: RETENTION_DAYS (default 90)

import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || "90", 10);
const [, , targetDir, mode] = process.argv;

if (!targetDir || !["file", "folder"].includes(mode)) {
  console.error("Usage: node prune-old-backups.mjs <dir> <file|folder>");
  process.exit(1);
}

const DATE_RE = /^(\d{4}-\d{2}-\d{2})(\.sql)?$/;

function isOlderThanRetention(dateStr) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const entryDate = new Date(dateStr + "T00:00:00Z");
  return entryDate < cutoff;
}

async function main() {
  let entries;
  try {
    entries = await readdir(targetDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log(`${targetDir} does not exist yet, nothing to prune.`);
      return;
    }
    throw err;
  }

  let removed = 0;
  for (const entry of entries) {
    const isRightType = mode === "file" ? entry.isFile() : entry.isDirectory();
    if (!isRightType) continue;

    const m = entry.name.match(DATE_RE);
    if (!m) continue; // not a dated entry, leave it alone

    const dateStr = m[1];
    if (isOlderThanRetention(dateStr)) {
      const full = path.join(targetDir, entry.name);
      await rm(full, { recursive: true, force: true });
      console.log(`Removed (older than ${RETENTION_DAYS}d): ${full}`);
      removed += 1;
    }
  }

  console.log(`Pruned ${removed} old backup entr${removed === 1 ? "y" : "ies"} from ${targetDir}.`);
}

main().catch((err) => {
  console.error("Prune failed:", err);
  process.exit(1);
});
