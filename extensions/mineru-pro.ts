/**
 * pi-ocr — MinerU Pro backend (Precision API, token required)
 *
 * API reference: https://mineru.net/apiManage/docs
 *
 * Single file flow (URL mode):
 *   1. POST /api/v4/extract/task → {task_id}
 *   2. Poll GET /api/v4/extract/task/{task_id} → {state, full_zip_url}
 *   3. Download full_zip_url → extract .md
 *
 * Local file flow (batch upload):
 *   1. POST /api/v4/file-urls/batch → {batch_id, file_urls[]}
 *   2. PUT file to file_urls[0] → auto-submits
 *   3. Poll GET /api/v4/extract-results/batch/{batch_id} → {extract_result[].full_zip_url}
 *   4. Download zip → extract .md
 *
 * Limits: ≤200MB, ≤200 pages, 1000 pages/day high-priority
 */

import { readFileSync, mkdtempSync, readdirSync, rmSync, createWriteStream } from "node:fs";
import { basename, extname, join } from "node:path";
import { tmpdir } from "node:os";
import { stat } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Task, OcrResult, OcrProgressCallback } from "./types";

const BASE_URL = "https://mineru.net/api/v4";

// ── Auth helper ─────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
}

// ── API calls ───────────────────────────────────────────────────────────────

async function apiPost(token: string, url: string, body: Record<string, unknown>) {
  const resp = await fetch(url, {
    method: "POST", headers: authHeaders(token),
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`MinerU Pro ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = (await resp.json()) as { code: number; msg: string; data: any };
  if (data.code !== 0) throw new Error(`MinerU Pro: ${data.msg}`);
  return data.data;
}

async function apiGet(token: string, url: string): Promise<any> {
  const resp = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await resp.json()) as { code: number; msg: string; data: any };
  if (data.code !== 0) throw new Error(`MinerU Pro poll: ${data.msg}`);
  return data.data;
}

// ── Download zip and extract .md ───────────────────────────────────────────

async function downloadAndExtractMd(zipUrl: string): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), "pi-mineru-pro-"));
  const zipPath = join(tmpDir, "result.zip");

  // Download zip — stream to disk to avoid OOM on large files
  const resp = await fetch(zipUrl, { signal: AbortSignal.timeout(120_000) });
  if (!resp.ok) throw new Error(`Failed to download zip: ${resp.status}`);
  if (!resp.body) throw new Error("No response body");
  await pipeline(Readable.fromWeb(resp.body as any), createWriteStream(zipPath));

  // Extract
  try {
    await extractZip(zipPath, tmpDir);
  } catch {
    throw new Error("Failed to extract zip — install unzip or python3");
  } finally {
    try { rmSync(zipPath, { force: true }); } catch { /* cleanup */ }
  }

  // Find and read .md file
  try {
    const files = readdirSync(tmpDir, { recursive: true }) as string[];
    const mdFile = files.find(f => f.endsWith(".md") && !f.includes("content_list") && !f.includes("model"));
    if (!mdFile) throw new Error("No markdown in extracted zip");

    // Read all .md files that are actual content (not content_list.json.md or model.json.md)
    const contentFiles = files.filter(f => f.endsWith(".md") && !f.includes("_content_list") && !f.includes("_model") && !f.includes("middle") && !f.includes("layout"));
    const content = contentFiles.map(f => {
      const text = readFileSync(join(tmpDir, f), "utf8");
      return text;
    }).join("\n\n");

    cleanupDir(tmpDir);
    return content || readFileSync(join(tmpDir, mdFile), "utf8");
  } finally {
    cleanupDir(tmpDir);
  }
}

async function extractZip(zipPath: string, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Try unzip first
    execFile("unzip", ["-qo", zipPath, "-d", outDir], (err: Error | null) => {
      if (!err) return resolve();
      // Fallback: python3
      const child = spawn("python3", ["-c", `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1]) as z: z.extractall(sys.argv[2])
`, zipPath, outDir]);
      child.on("close", (code) => code === 0 ? resolve() : reject(new Error("extract failed")));
      child.on("error", () => reject(new Error("no extract tool")));
    });
  });
}

function cleanupDir(dir: string) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort — dir may already be gone */ }
}

// ── Public API ───────────────────────────────────────────────────────────────
async function processLocalFile(
  token: string, filePath: string, fileName: string,
  progressPrefix: string, onProgress: OcrProgressCallback,
): Promise<string> {
  // Step 1: Get signed upload URL
  onProgress(`${progressPrefix} requesting upload…`);
  const { batch_id, file_urls } = await apiPost(token, `${BASE_URL}/file-urls/batch`, {
    files: [{ name: fileName }],
    model_version: "vlm",
  });

  if (!file_urls?.[0]) throw new Error("No upload URL returned");

  // Step 2: Upload file (no Content-Type header per docs)
  onProgress(`${progressPrefix} uploading…`);
  const fileData = readFileSync(filePath);
  const putResp = await fetch(file_urls[0], {
    method: "PUT",
    body: fileData,
    signal: AbortSignal.timeout(120_000),
  });
  if (!putResp.ok) throw new Error(`Upload failed: ${putResp.status}`);

  // Upload complete → auto-submitted. Poll batch.
  return await pollBatch(token, batch_id, 600_000, progressPrefix, onProgress);
}

async function pollBatch(
  token: string, batchId: string, timeoutMs: number,
  progressPrefix: string, onProgress: OcrProgressCallback,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await apiGet(token, `${BASE_URL}/extract-results/batch/${batchId}`);
    const results: any[] = data.extract_result || [];

    const allDone = results.every((r: any) => r.state === "done" || r.state === "failed");
    if (allDone) {
      const markdowns: string[] = [];
      for (const r of results) {
        if (r.state === "done" && r.full_zip_url) {
          onProgress(`${progressPrefix} downloading ${r.file_name}…`);
          const md = cleanMarkdown(await downloadAndExtractMd(r.full_zip_url));
          markdowns.push(md);
        }
      }
      return markdowns.join("\n\n");
    }

    // Show progress
    const running = results.filter((r: any) => r.state === "running");
    if (running.length > 0) {
      const r = running[0];
      const pct = r.extract_progress
        ? `${r.extract_progress.extracted_pages || "?"}/${r.extract_progress.total_pages || "?"}p`
        : "";
      onProgress(`${progressPrefix} running ${pct}…`);
    } else {
      onProgress(`${progressPrefix} ${results[0]?.state || "pending"}…`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`MinerU Pro batch ${batchId} timed out`);
}

// ── Output cleanup ───────────────────────────────────────────────────────────

function cleanMarkdown(md: string): string {
  // Remove MinerU's embedded image references (any image directory)
  return md.replace(/!\[.*?\]\([^)]*\)\n*/g, "");
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function mineruProOcr(
  filePath: string, _task: Task, token: string,
  _signal: AbortSignal | undefined, onProgress: OcrProgressCallback,
): Promise<OcrResult> {
  const ext = extname(filePath).toLowerCase();
  const fileName = basename(filePath);

  if (![".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"].includes(ext)) {
    throw new Error(`MinerU Pro unsupported: ${ext}`);
  }

  const stats = await stat(filePath);
  if (stats.size > 200 * 1024 * 1024) throw new Error("File exceeds 200MB limit");

  onProgress("[1/1] MinerU Pro (vlm)…");
  const markdown = await processLocalFile(token, filePath, fileName, "[1/1]", onProgress);
  onProgress("[1/1] done");

  return { text: cleanMarkdown(markdown), details: { backend: "mineru-pro", fileName } };
}
