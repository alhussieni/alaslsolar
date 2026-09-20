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
const CONCURRENCY = parseInt(process.env.BACKUP_CONCURRENCY || "8", 10);
const PER_FILE_TIMEOUT_MS = parseInt(process.env.BACKUP_FILE_TIMEOUT_MS || "60000", 10);
const MAX_RECURSION_DEPTH = 20;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function listAllFiles(bucket, prefix = "", depth = 0) {
  if (depth > MAX_RECURSION_DEPTH) {
    console.error(`  WARNING: max recursion depth hit at ${bucket}/${prefix}, stopping descent here`);
    return [];
  }
  const files = [];
  const { data, error } = await withTimeout(
    supabase.storage.from(bucket).list(prefix, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    }),
    PER_FILE_TIMEOUT_MS,
    `list(${bucket}, ${prefix})`
  );
  if (error) throw new Error(`list(${bucket}, ${prefix}) failed: ${error.message}`);

  for (const entry of data) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Supabase returns folders as entries with id === null and no metadata
    if (entry.id === null && !entry.metadata) {
      const nested = await listAllFiles(bucket, fullPath, depth + 1);
      files.push(...nested);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function downloadFile(bucket, filePath) {
  const { data, error } = await withTimeout(
    supabase.storage.from(bucket).download(filePath),
    PER_FILE_TIMEOUT_MS,
    `download(${bucket}/${filePath})`
  );
  if (error) throw new Error(`download(${bucket}/${filePath}) failed: ${error.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  const destPath = path.join(OUT_DIR, bucket, filePath);
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, buf);
  return buf.length;
}

// نزّل بالدفعات (batches) عشان نقلل عدد الطلبات المتزامنة لسيرفر Supabase
// من غير ما نعمل 309 طلب مرة واحدة، ومن غير ما ننزل واحد واحد ونستنى دقايق.
async function downloadInBatches(jobs, concurrency) {
  let totalFiles = 0;
  let totalBytes = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(({ bucket, filePath }) => downloadFile(bucket, filePath))
    );
    results.forEach((r, idx) => {
      const { bucket, filePath } = batch[idx];
      if (r.status === "fulfilled") {
        totalFiles += 1;
        totalBytes += r.value;
      } else {
        failed += 1;
        console.error(`  FAILED: ${bucket}/${filePath} -> ${r.reason.message}`);
      }
    });
    console.log(
      `  progress: ${Math.min(i + concurrency, jobs.length)}/${jobs.length} files processed`
    );
  }
  return { totalFiles, totalBytes, failed };
}

async function main() {
  console.log(`Concurrency: ${CONCURRENCY}, per-file timeout: ${PER_FILE_TIMEOUT_MS}ms`);

  const { data: buckets, error } = await withTimeout(
    supabase.storage.listBuckets(),
    PER_FILE_TIMEOUT_MS,
    "listBuckets"
  );
  if (error) throw new Error(`listBuckets failed: ${error.message}`);

  const jobs = [];
  for (const bucket of buckets) {
    console.log(`\n== Listing bucket: ${bucket.name} ==`);
    const files = await listAllFiles(bucket.name);
    console.log(`  ${files.length} files found`);
    for (const filePath of files) jobs.push({ bucket: bucket.name, filePath });
  }

  console.log(`\nDownloading ${jobs.length} files total...`);
  const { totalFiles, totalBytes, failed } = await downloadInBatches(jobs, CONCURRENCY);

  console.log(
    `\nDone. ${totalFiles} files ok, ${failed} failed, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total.`
  );
  if (failed > 0) {
    console.error(`${failed} file(s) failed to download - see FAILED lines above.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Storage backup failed:", err);
  process.exit(1);
});
