// scripts/backup/backup-storage.mjs
//
// Incremental Supabase Storage backup.
//
// Every run still produces a FULL snapshot folder (backups/storage/<date>/<bucket>/<path>),
// but a file is only DOWNLOADED from Supabase when it is new or changed since the
// previous snapshot. Unchanged files are copied locally from the previous snapshot
// folder, so they cost zero Supabase egress.
//
// Change detection: same path + same size + same eTag as in the previous snapshot's
// _manifest.json. If metadata is missing for a file, it is downloaded (safe default).
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional env vars:
//   BACKUP_OUT_DIR          output folder of THIS run (set by the workflow)
//   BACKUP_CONCURRENCY      default 8
//   BACKUP_FILE_TIMEOUT_MS  default 60000
//   BACKUP_FORCE_FULL=1     ignore previous snapshot and download everything

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile, readFile, readdir, copyFile, stat } from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT_DIR = process.env.BACKUP_OUT_DIR || "backups/storage";
const CONCURRENCY = parseInt(process.env.BACKUP_CONCURRENCY || "8", 10);
const PER_FILE_TIMEOUT_MS = parseInt(process.env.BACKUP_FILE_TIMEOUT_MS || "60000", 10);
const FORCE_FULL = process.env.BACKUP_FORCE_FULL === "1";
const MAX_RECURSION_DEPTH = 20;
const MANIFEST_NAME = "_manifest.json";
const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

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

// Returns [{ path, size, etag, updatedAt }]
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
      files.push({
        path: fullPath,
        size: entry.metadata?.size ?? null,
        etag: entry.metadata?.eTag ?? null,
        updatedAt: entry.updated_at ?? null,
      });
    }
  }
  return files;
}

// Find the newest previous snapshot folder (sibling of OUT_DIR) that has a manifest.
async function loadPreviousSnapshot() {
  if (FORCE_FULL) {
    console.log("BACKUP_FORCE_FULL=1 -> full download, previous snapshot ignored.");
    return null;
  }
  const parent = path.dirname(path.resolve(OUT_DIR));
  const self = path.basename(path.resolve(OUT_DIR));
  let names;
  try {
    names = await readdir(parent);
  } catch {
    return null;
  }
  const candidates = names.filter((n) => DATE_DIR_RE.test(n) && n !== self).sort().reverse();
  for (const name of candidates) {
    const dir = path.join(parent, name);
    try {
      const manifest = JSON.parse(await readFile(path.join(dir, MANIFEST_NAME), "utf8"));
      console.log(`Previous snapshot: ${name} (${Object.keys(manifest).length} files in manifest)`);
      return { dir, manifest };
    } catch {
      // no manifest in this folder (older full-format snapshot) -> try an older one
    }
  }
  console.log("No previous snapshot with a manifest found -> full download this run.");
  return null;
}

function sameAsPrevious(prev, bucket, f) {
  if (!prev) return false;
  const old = prev.manifest[`${bucket}/${f.path}`];
  if (!old) return false;
  if (f.size == null || f.etag == null) return false; // not enough info -> download
  return old.size === f.size && old.etag === f.etag;
}

async function fetchFile(bucket, f, prev) {
  const destPath = path.join(OUT_DIR, bucket, f.path);
  await mkdir(path.dirname(destPath), { recursive: true });

  // 1) unchanged -> local copy from previous snapshot (no egress)
  if (sameAsPrevious(prev, bucket, f)) {
    const srcPath = path.join(prev.dir, bucket, f.path);
    try {
      const s = await stat(srcPath);
      if (s.size === f.size) {
        await copyFile(srcPath, destPath);
        return { bytes: s.size, downloaded: false };
      }
    } catch {
      // previous copy missing/corrupt -> fall through to download
    }
  }

  // 2) new / changed / unverifiable -> download
  const { data, error } = await withTimeout(
    supabase.storage.from(bucket).download(f.path),
    PER_FILE_TIMEOUT_MS,
    `download(${bucket}/${f.path})`
  );
  if (error) throw new Error(`download(${bucket}/${f.path}) failed: ${error.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  await writeFile(destPath, buf);
  return { bytes: buf.length, downloaded: true };
}

async function processInBatches(jobs, concurrency, prev) {
  const stats = { files: 0, failed: 0, downloaded: 0, reused: 0, downloadedBytes: 0, reusedBytes: 0 };
  const manifest = {};

  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(({ bucket, file }) => fetchFile(bucket, file, prev)));
    results.forEach((r, idx) => {
      const { bucket, file } = batch[idx];
      if (r.status === "fulfilled") {
        stats.files += 1;
        if (r.value.downloaded) {
          stats.downloaded += 1;
          stats.downloadedBytes += r.value.bytes;
        } else {
          stats.reused += 1;
          stats.reusedBytes += r.value.bytes;
        }
        manifest[`${bucket}/${file.path}`] = { size: file.size, etag: file.etag, updatedAt: file.updatedAt };
      } else {
        stats.failed += 1;
        console.error(`  FAILED: ${bucket}/${file.path} -> ${r.reason.message}`);
      }
    });
    console.log(`  progress: ${Math.min(i + concurrency, jobs.length)}/${jobs.length} files processed`);
  }
  return { stats, manifest };
}

async function main() {
  console.log(`Concurrency: ${CONCURRENCY}, per-file timeout: ${PER_FILE_TIMEOUT_MS}ms`);
  const prev = await loadPreviousSnapshot();

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
    for (const file of files) jobs.push({ bucket: bucket.name, file });
  }

  console.log(`\nProcessing ${jobs.length} files total...`);
  const { stats, manifest } = await processInBatches(jobs, CONCURRENCY, prev);

  await mkdir(OUT_DIR, { recursive: true });
  // Only write a manifest when every file succeeded, so a partial run can never
  // cause a later run to wrongly treat a missing file as "unchanged".
  if (stats.failed === 0) {
    await writeFile(path.join(OUT_DIR, MANIFEST_NAME), JSON.stringify(manifest));
  } else {
    console.error("Manifest NOT written because some files failed.");
  }

  const mb = (n) => (n / 1024 / 1024).toFixed(2);
  console.log(
    `\nDone. ${stats.files} files ok, ${stats.failed} failed.\n` +
      `  Downloaded from Supabase: ${stats.downloaded} files, ${mb(stats.downloadedBytes)} MB (egress)\n` +
      `  Reused from previous snapshot: ${stats.reused} files, ${mb(stats.reusedBytes)} MB (no egress)`
  );
  if (stats.failed > 0) {
    console.error(`${stats.failed} file(s) failed - see FAILED lines above.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Storage backup failed:", err);
  process.exit(1);
});
