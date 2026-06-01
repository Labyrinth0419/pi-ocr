/**
 * pi-ocr — Tesseract backend
 *
 * Uses Tesseract OCR (https://github.com/tesseract-ocr/tesseract) —
 * the classic open-source OCR engine. Ultra-lightweight (~30MB),
 * zero Python deps, CPU-only, fast on plain text.
 *
 * Prerequisites:
 *   brew install tesseract        # macOS
 *   sudo apt install tesseract-ocr # Linux
 *
 * For non-English languages, install the corresponding lang pack:
 *   brew install tesseract-lang   # macOS (all languages)
 *   sudo apt install tesseract-ocr-chi-sim  # Chinese simplified
 */

import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import type { Task, OcrResult, OcrProgressCallback } from "./types";
import { isImage, isPdf, getPdfPageCount } from "./ollama";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function execCapture(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", () => resolve({
      stdout: "", stderr: "tesseract not found. Install: brew install tesseract", code: 1,
    }));
    child.on("close", (code) => resolve({
      stdout: Buffer.concat(out).toString("utf8").trim(),
      stderr: Buffer.concat(err).toString("utf8").trim(),
      code: code ?? 1,
    }));
  });
}

function cleanupDir(dir: string) {
  try {
    for (const f of readdirSync(dir)) unlinkSync(join(dir, f));
    rmdirSync(dir);
  } catch { /* best effort */ }
}

// ── PDF → image conversion (reuses ollama helpers approach) ──────────────────

async function convertPdfPage(pdfPath: string, pageIndex: number, outPath: string): Promise<void> {
  if (process.platform === "darwin") {
    if (pageIndex === 0) {
      const { code, stderr } = await execCapture("sips", ["-s", "format", "png", pdfPath, "--out", outPath]);
      if (code !== 0) throw new Error(`sips PDF page 1 conversion failed (code ${code}): ${stderr}`);
      return;
    }
  }
  const { code, stderr } = await execCapture("pdftoppm", [
    "-png", "-r", "200", "-f", String(pageIndex + 1), "-l", String(pageIndex + 1),
    "-singlefile", pdfPath, outPath.replace(/\.png$/, ""),
  ]);
  if (code !== 0) throw new Error(`pdftoppm page ${pageIndex + 1} failed (code ${code}): ${stderr}`);
}

// ── Tesseract OCR ────────────────────────────────────────────────────────────

async function tesseractImage(imagePath: string, _task: Task): Promise<string> {
  const { stdout, stderr, code } = await execCapture("tesseract", [
    imagePath, "stdout",
    "-l", "eng+chi_sim",   // English + Chinese simplified
    "--psm", "3",  // Auto page segmentation
  ]);

  if (code !== 0) {
    const msg = stderr || "tesseract failed";
    if (msg.includes("not found") || msg.includes("ENOENT")) {
      throw new Error("tesseract not found. Install: brew install tesseract");
    }
    throw new Error(msg.slice(0, 500));
  }

  return stdout;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function tesseractOcr(
  filePath: string, task: Task,
  signal: AbortSignal | undefined, onProgress: OcrProgressCallback,
): Promise<OcrResult> {
  let resultText = "";
  let tmpDir: string | null = null;

  try {
    if (isPdf(filePath)) {
      onProgress("📄 Converting PDF pages to images…");
      tmpDir = mkdtempSync(join(tmpdir(), "pi-tesseract-"));
      const pageCount = await getPdfPageCount(filePath);

      const pageResults: string[] = [];
      for (let i = 0; i < pageCount; i++) {
        if (signal?.aborted) throw new Error("Aborted");
        const pageOut = join(tmpDir, `page_${i + 1}.png`);

        try {
          await convertPdfPage(filePath, i, pageOut);
        } catch (e: any) {
          pageResults.push(`## Page ${i + 1}\n\n> ⚠️ Skipped: ${e.message}`);
          continue;
        }

        onProgress(`📄 Page ${i + 1}/${pageCount}`);
        const pageText = await tesseractImage(pageOut, task);
        if (!pageText.trim()) {
          pageResults.push(`## Page ${i + 1}\n\n> ⚠️ No text detected`);
        } else {
          pageResults.push(`## Page ${i + 1}\n\n${pageText}`);
        }
      }
      resultText = pageResults.join("\n\n");
    } else if (isImage(filePath)) {
      resultText = await tesseractImage(filePath, task);
    } else {
      throw new Error(`Unsupported file type: ${basename(filePath)}`);
    }

    return { text: resultText, details: { backend: "tesseract", task } };
  } finally {
    if (tmpDir) cleanupDir(tmpDir);
  }
}
