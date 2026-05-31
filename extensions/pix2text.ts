/**
 * pi-minimodel-ocr — Pix2Text backend
 *
 * Uses Pix2Text (https://github.com/breezedeus/Pix2Text) — an open-source
 * Python alternative to Mathpix. Recognizes layouts, text, math formulas (LaTeX),
 * and tables, outputting Markdown directly. SMALL ONNX models, CPU-friendly.
 *
 * Prerequisites:
 *   pip install pix2text
 *
 * First run downloads ONNX models (~50MB) to ~/.pix2text/1.1/.
 */

import { spawn } from "node:child_process";
import { basename } from "node:path";
import type { Task, OcrResult, OcrProgressCallback } from "./types";
import { isImage, isPdf } from "./ollama";

// ── Embedded Python OCR engine ───────────────────────────────────────────────
//
// Pix2Text handles everything in one call:
//   - Images: p2t.recognize(path) → Markdown string
//   - PDFs:    p2t.recognize_pdf(path) → page-by-page Markdown
//
// Usage: python3 -c SCRIPT <file_path> <task>
//   Prints OCR result (Markdown with LaTeX) to stdout.

const PIX2TEXT_ENGINE = `
import sys, os
from pathlib import Path

file_path = sys.argv[1]
task = sys.argv[2]  # text, formula, table, figure, auto
ext = Path(file_path).suffix.lower()

# Suppress noisy stderr from model loading
os.environ.setdefault("DISABLE_TQDM", "1")

from pix2text import Pix2Text

# Initialize with formula recognition + text, disable table (avoids extra model download)
p2t = Pix2Text.from_config(enable_formula=True, enable_table=False)

if ext == ".pdf":
    # PDF mode: Pix2Text handles page splitting internally
    doc = p2t.recognize_pdf(file_path)
    print(doc.to_markdown())
elif ext in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif"):
    # Image mode: single call returns Markdown with LaTeX math
    result = p2t.recognize(file_path)
    print(result)
else:
    print(f"ERROR: unsupported file type {ext}")
    sys.exit(1)
`;

// ── Subprocess runner ────────────────────────────────────────────────────────

async function execPython(code: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn("python3", ["-c", code, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", () => resolve({
      stdout: "",
      stderr: "python3 not found. Install Python 3 with:\n  pip install pix2text",
      exitCode: 1,
    }));
    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(out).toString("utf8").trim(),
        stderr: Buffer.concat(err).toString("utf8").trim(),
        exitCode: code ?? 1,
      });
    });
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function pix2textOcr(
  filePath: string, task: Task,
  signal: AbortSignal | undefined, onProgress: OcrProgressCallback,
): Promise<OcrResult> {
  if (!isImage(filePath) && !isPdf(filePath)) {
    throw new Error(`Unsupported file type: ${basename(filePath)}`);
  }

  if (isPdf(filePath)) {
    onProgress("📄 Processing PDF with Pix2Text (text + formulas)…");
  } else {
    onProgress("🔍 Running Pix2Text OCR (text + formulas)…");
  }

  const { stdout, stderr, exitCode } = await execPython(PIX2TEXT_ENGINE, [filePath, task]);

  if (exitCode !== 0) {
    const msg = stderr || "Pix2Text failed";
    if (msg.includes("ModuleNotFoundError") || msg.includes("No module named")) {
      throw new Error("Pix2Text not installed. Run:\n  pip install pix2text");
    }
    if (msg.includes("table-rec") || msg.includes("pytorch_model")) {
      throw new Error("Pix2Text table model download failed. Try:\n  pip install pix2text --upgrade\nOr set enable_table=False in config.");
    }
    throw new Error(msg.slice(0, 1000));
  }

  // Filter out model-loading noise from stderr
  if (stderr && (stderr.includes("Error:") || stderr.includes("Traceback"))) {
    throw new Error(stderr.slice(0, 1000));
  }

  if (!stdout) {
    return { text: "", details: { backend: "pix2text", task, warning: "no text detected" } };
  }

  return { text: stdout, details: { backend: "pix2text", task } };
}
