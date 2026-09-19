// scripts/backup/backup-storage.mjs
//
// Downloads every file from every public Supabase Storage bucket into
// backups/storage/<bucket>/<path> in the current working directory.
// Run inside the db-backups branch checkout (see .github/workflows/daily-backup.yml).
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT_DIR = process.env.BACKUP_OUT_DIR || "backups/storage";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function listAllFiles(bucket, prefix = "") {
  const files = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`list(${bucket}, ${prefix}) failed: ${error.message}`);

  for (const entry of data) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Supabase returns folders as entries with id === null and no metadata
    if (entry.id === null && !entry.metadata) {
      const nested = await listAllFiles(bucket, fullPath);
      files.push(...nested);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function downloadFile(bucket, filePath) {
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error) throw new Error(`download(${bucket}/${filePath}) failed: ${error.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  const destPath = path.join(OUT_DIR, bucket, filePath);
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, buf);
  return buf.length;
}

async function main() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);

  let totalFiles = 0;
  let totalBytes = 0;

  for (const bucket of buckets) {
    console.log(`\n== Bucket: ${bucket.name} ==`);
    const files = await listAllFiles(bucket.name);
    console.log(`  ${files.length} files found`);

    for (const filePath of files) {
      try {
        const size = await downloadFile(bucket.name, filePath);
        totalFiles += 1;
        totalBytes += size;
      } catch (err) {
        console.error(`  FAILED: ${bucket.name}/${filePath} -> ${err.message}`);
      }
    }
  }

  console.log(`\nDone. ${totalFiles} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total.`);
}

main().catch((err) => {
  console.error("Storage backup failed:", err);
  process.exit(1);
});
