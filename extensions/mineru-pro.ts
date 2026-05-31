/**
 * pi-ocr — MinerU Pro backend (Token-based precision API)
 *
 * Uses MinerU's precision extraction API with an API token:
 *   - ≤200MB per file, ≤200 pages per request
 *   - vlm model for higher accuracy
 *   - Output: Markdown + JSON + optional docx/html/latex
 *   - 1000 pages/day high-priority, then lower priority
 *
 * API flow:
 *   1. POST /api/v4/extract/task → task_id
 *   2. Poll GET /api/v4/extract/task/{task_id} until done
 *   3. GET zip_url → download and extract markdown
 *
 * Prerequisites: Apply for token at https://mineru.net/apiManage
 */

import { mkdtempSync, unlinkSync, rmdirSync, readdirSync, createWriteStream } from "node:fs";
import { basename, extname, join } from "node:path";
import { tmpdir } from "node:os";
import { stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { get } from "node:https";
import type { Task, OcrResult, OcrProgressCallback } from "./types";

const BASE_URL = "https://mineru.net/api/v4";

// ── API helpers ──────────────────────────────────────────────────────────────

async function apiPostPro(
  token: string, url: string, body: Record<string, unknown>,
): Promise<{ task_id?: string; file_urls?: string[]; batch_id?: string }> {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`MinerU Pro API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    code: number; msg: string;
    data: { task_id?: string; file_urls?: string[]; batch_id?: string };
  };
  if (data.code !== 0) throw new Error(`MinerU Pro API: ${data.msg || "unknown error"}`);
  return data.data;
}

async function apiGetPro(token: string, url: string): Promise<Record<string, unknown>> {
  const resp = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  return (await resp.json()) as Record<string, unknown>;
}

async function putFile(uploadUrl: string, filePath: string): Promise<void> {
  const { readFileSync } = await import("node:fs");
  const fileData = readFileSync(filePath);
  const resp = await fetch(uploadUrl, {
    method: "PUT",
    body: fileData,
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`File upload failed (${resp.status})`);
}

// ── Poll for result ──────────────────────────────────────────────────────────

async function pollTask(
  token: string, taskId: string, timeoutMs: number,
  onProgress: OcrProgressCallback,
): Promise<string> {
  const start = Date.now();
  let lastState = "";
  while (Date.now() - start < timeoutMs) {
    const data = await apiGetPro(token, `${BASE_URL}/extract/task/${taskId}`);
    const state = (data.data as any)?.state || "unknown";

    if (state === "done") {
      const zipUrl = (data.data as any)?.zip_url;
      if (!zipUrl) throw new Error("MinerU Pro returned done but no zip_url");
      // Download and extract markdown from zip
      const mdContent = await downloadAndExtractMd(zipUrl);
      return mdContent;
    }

    if (state === "failed") {
      throw new Error(`MinerU Pro parsing failed: ${(data.data as any)?.err_msg || "unknown"}`);
    }

    if (state !== lastState) {
      lastState = state;
      onProgress(`  ${state}…`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`MinerU Pro task ${taskId} timed out`);
}

// ── Download zip and extract markdown ───────────────────────────────────────

async function downloadAndExtractMd(zipUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-mineru-pro-"));
    const zipPath = join(tmpDir, "result.zip");

    const file = createWriteStream(zipPath);
    get(zipUrl, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        get(response.headers.location!, (redirectResp) => {
          redirectResp.pipe(file);
          redirectResp.on("end", () => extractAndRead(zipPath, tmpDir, resolve, reject));
        }).on("error", reject);
        return;
      }
      response.pipe(file);
      response.on("end", () => extractAndRead(zipPath, tmpDir, resolve, reject));
    }).on("error", reject);
  });
}

function extractAndRead(
  zipPath: string, tmpDir: string,
  resolve: (v: string) => void, reject: (e: Error) => void,
) {
  const { execFile } = require("node:child_process");
  execFile("unzip", ["-o", zipPath, "-d", tmpDir], (err: Error | null) => {
    if (err) {
      // Try python zipfile as fallback
      const child = spawn("python3", ["-c", `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1]) as z:
    z.extractall(sys.argv[2])
`, zipPath, tmpDir]);
      child.on("close", (code) => {
        if (code !== 0) { reject(new Error("Failed to extract zip")); return; }
        readMarkdown(tmpDir, resolve, reject);
      });
      child.on("error", () => reject(new Error("Failed to extract zip: no unzip or python3")));
      return;
    }
    readMarkdown(tmpDir, resolve, reject);
  });
}

function readMarkdown(
  tmpDir: string,
  resolve: (v: string) => void, reject: (e: Error) => void,
) {
  const { readFileSync, readdirSync } = require("node:fs");
  const { join } = require("node:path");
  try {
    // Find the .md file in extracted directory
    const files = readdirSync(tmpDir, { recursive: true }) as string[];
    const mdFile = files.find(f => f.endsWith(".md"));
    if (mdFile) {
      const content = readFileSync(join(tmpDir, mdFile), "utf8");
      cleanupDir(tmpDir);
      resolve(content);
    } else {
      reject(new Error("No markdown file in extracted zip"));
    }
  } catch (e: any) {
    cleanupDir(tmpDir);
    reject(e);
  }
}

function cleanupDir(dir: string) {
  try {
    const { rmSync } = require("node:fs");
    rmSync(dir, { recursive: true, force: true });
  } catch { /* best effort */ }
}

// ── Process single file ──────────────────────────────────────────────────────

async function mineruProProcessFile(
  token: string, filePath: string, fileName: string,
  progressPrefix: string, onProgress: OcrProgressCallback,
): Promise<string> {
  const stats = await stat(filePath);
  const sizeMB = stats.size / (1024 * 1024);

  // Step 1: Get signed upload URL (batch API for local files)
  onProgress(`${progressPrefix} requesting upload URL…`);
  const { file_urls, batch_id } = await apiPostPro(token, `${BASE_URL}/file-urls/batch`, {
    files: [{ name: fileName }],
    model_version: "vlm",
  });

  if (!file_urls?.[0]) throw new Error("MinerU Pro did not return upload URL");

  // Step 2: Upload file
  onProgress(`${progressPrefix} uploading (${sizeMB.toFixed(1)}MB)…`);
  await putFile(file_urls[0], filePath);

  // Step 3: Submit task via URL (using the uploaded file)
  // The batch API auto-submits after upload; we need to poll the batch
  onProgress(`${progressPrefix} parsing…`);
  return await pollBatch(token, batch_id!, 600_000, progressPrefix, onProgress);
}

async function pollBatch(
  token: string, batchId: string, timeoutMs: number,
  progressPrefix: string, onProgress: OcrProgressCallback,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await apiGetPro(token, `${BASE_URL}/extract/task/batch/${batchId}`);
    const batchData = data.data as any;
    const state = batchData?.state || "unknown";

    if (state === "done") {
      const tasks = batchData?.tasks || [];
      const results: string[] = [];
      for (const t of tasks) {
        if (t.state === "done" && t.zip_url) {
          const md = await downloadAndExtractMd(t.zip_url);
          results.push(md);
        }
      }
      return results.join("\n\n");
    }

    if (state === "failed") {
      throw new Error(`MinerU Pro batch failed: ${batchData?.err_msg || "unknown"}`);
    }

    const elapsed = Math.floor((Date.now() - start) / 1000);
    onProgress(`${progressPrefix} ${state} (${elapsed}s)`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`MinerU Pro batch ${batchId} timed out`);
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function mineruProOcr(
  filePath: string, task: Task, token: string,
  signal: AbortSignal | undefined, onProgress: OcrProgressCallback,
): Promise<OcrResult> {
  const ext = extname(filePath).toLowerCase();
  const fileName = basename(filePath);

  if (![".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"].includes(ext)) {
    throw new Error(`MinerU Pro does not support: ${ext}`);
  }

  const stats = await stat(filePath);
  if (stats.size > 200 * 1024 * 1024) {
    throw new Error(`File exceeds 200MB limit`);
  }

  onProgress("[1/1] MinerU Pro (vlm)…");
  const markdown = await mineruProProcessFile(token, filePath, fileName, "[1/1]", onProgress);
  onProgress("[1/1] done");
  return { text: markdown, details: { backend: "mineru-pro", fileName } };
}
