/**
 * pi-ocr — MinerU Pro backend (Precision API, token required)
 *
 * API reference: https://mineru.net/apiManage/docs
 *
 * Local file flow:
 *   1. POST /api/v4/file-urls/batch → {batch_id, file_urls[]}
 *   2. PUT file to file_urls[0] → auto-submits
 *   3. Poll GET /api/v4/extract-results/batch/{batch_id}
 *   4. Download full_zip_url → extract Markdown
 *
 * Limits: ≤200MB, ≤200 pages, 1000 pages/day high-priority
 */

import {
	createWriteStream,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { execFile, spawn } from "node:child_process";
import { basename, extname, join } from "node:path";
import { tmpdir } from "node:os";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { OcrProgressCallback, OcrResult } from "./types";

const BASE_URL = "https://mineru.net/api/v4";
const POLL_INTERVAL_MS = 5_000;

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
	return AbortSignal.any([
		...(signal ? [signal] : []),
		AbortSignal.timeout(timeoutMs),
	]);
}

function authHeaders(token: string) {
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${token}`,
	};
}

async function apiPost(
	token: string,
	url: string,
	body: Record<string, unknown>,
	signal: AbortSignal | undefined,
) {
	const resp = await fetch(url, {
		method: "POST",
		headers: authHeaders(token),
		body: JSON.stringify(body),
		signal: requestSignal(signal, 30_000),
	});
	if (!resp.ok) {
		throw new Error(
			`MinerU Pro ${resp.status}: ${(await resp.text()).slice(0, 200)}`,
		);
	}

	const data = (await resp.json()) as { code: number; msg: string; data: any };
	if (data.code !== 0) throw new Error(`MinerU Pro: ${data.msg}`);
	return data.data;
}

async function apiGet(
	token: string,
	url: string,
	signal: AbortSignal | undefined,
): Promise<any> {
	const resp = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
		signal: requestSignal(signal, 15_000),
	});
	if (!resp.ok) {
		throw new Error(
			`MinerU Pro poll ${resp.status}: ${(await resp.text()).slice(0, 200)}`,
		);
	}

	const data = (await resp.json()) as { code: number; msg: string; data: any };
	if (data.code !== 0) throw new Error(`MinerU Pro poll: ${data.msg}`);
	return data.data;
}

function waitForPoll(signal: AbortSignal | undefined): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, POLL_INTERVAL_MS);
		if (!signal) return;
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
}

async function downloadAndExtractMd(
	zipUrl: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	const tmpDir = mkdtempSync(join(tmpdir(), "pi-mineru-pro-"));
	const zipPath = join(tmpDir, "result.zip");

	try {
		const resp = await fetch(zipUrl, {
			signal: requestSignal(signal, 120_000),
		});
		if (!resp.ok) throw new Error(`Failed to download zip: ${resp.status}`);
		if (!resp.body) throw new Error("No response body");

		await pipeline(
			Readable.fromWeb(resp.body as any),
			createWriteStream(zipPath),
		);
		await extractZip(zipPath, tmpDir, signal);

		const files = readdirSync(tmpDir, { recursive: true }) as string[];
		const contentFiles = files.filter(
			(file) =>
				file.endsWith(".md") &&
				!file.includes("content_list") &&
				!file.includes("_model") &&
				!file.includes("middle") &&
				!file.includes("layout"),
		);
		if (contentFiles.length === 0) {
			throw new Error("No markdown in extracted zip");
		}

		return contentFiles
			.map((file) => readFileSync(join(tmpDir, file), "utf8"))
			.join("\n\n");
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
}

async function extractZip(
	zipPath: string,
	outDir: string,
	signal: AbortSignal | undefined,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		execFile("unzip", ["-qo", zipPath, "-d", outDir], (unzipError) => {
			if (!unzipError) {
				resolve();
				return;
			}

			const child = spawn(
				"python3",
				[
					"-c",
					`\nimport zipfile, sys\nwith zipfile.ZipFile(sys.argv[1]) as z: z.extractall(sys.argv[2])\n`,
					zipPath,
					outDir,
				],
				{ signal },
			);
			child.on("close", (code) => {
				if (code === 0) resolve();
				else reject(new Error(`python3 exited with code ${code}`));
			});
			child.on("error", reject);
		});
	});
}

async function processLocalFile(
	token: string,
	filePath: string,
	fileName: string,
	progressPrefix: string,
	signal: AbortSignal | undefined,
	onProgress: OcrProgressCallback,
): Promise<string> {
	onProgress(`${progressPrefix} requesting upload…`);
	const { batch_id, file_urls } = await apiPost(
		token,
		`${BASE_URL}/file-urls/batch`,
		{ files: [{ name: fileName }], model_version: "vlm" },
		signal,
	);
	if (!file_urls?.[0]) throw new Error("No upload URL returned");

	onProgress(`${progressPrefix} uploading…`);
	const putResp = await fetch(file_urls[0], {
		method: "PUT",
		body: readFileSync(filePath),
		signal: requestSignal(signal, 120_000),
	});
	if (!putResp.ok) {
		throw new Error(
			`MinerU Pro upload ${putResp.status}: ${(await putResp.text()).slice(0, 200)}`,
		);
	}

	return pollBatch(token, batch_id, 600_000, progressPrefix, signal, onProgress);
}

async function pollBatch(
	token: string,
	batchId: string,
	timeoutMs: number,
	progressPrefix: string,
	signal: AbortSignal | undefined,
	onProgress: OcrProgressCallback,
): Promise<string> {
	const start = Date.now();
	let lastState = "";

	while (Date.now() - start < timeoutMs) {
		const data = await apiGet(
			token,
			`${BASE_URL}/extract-results/batch/${batchId}`,
			signal,
		);
		const results: any[] = data.extract_result;

		if (results.length > 0 && results.every((result) =>
			result.state === "done" || result.state === "failed")) {
			const failed = results.find((result) => result.state === "failed");
			if (failed) {
				throw new Error(
					`MinerU Pro failed: ${failed.err_msg || failed.error || "unknown error"}`,
				);
			}

			const markdowns: string[] = [];
			for (const result of results) {
				if (!result.full_zip_url) {
					throw new Error(
						`MinerU Pro completed ${result.file_name || "file"} without full_zip_url`,
					);
				}
				onProgress(`${progressPrefix} downloading ${result.file_name}…`);
				markdowns.push(
					cleanMarkdown(await downloadAndExtractMd(result.full_zip_url, signal)),
				);
			}
			return markdowns.join("\n\n");
		}

		const running = results.find((result) => result.state === "running");
		const state = running?.state || results[0]?.state || "pending";
		if (state !== lastState) {
			lastState = state;
			const progress = running?.extract_progress;
			const pages = progress
				? ` ${progress.extracted_pages || "?"}/${progress.total_pages || "?"}p`
				: "";
			onProgress(`${progressPrefix} ${state}${pages}…`);
		}
		await waitForPoll(signal);
	}

	throw new Error(`MinerU Pro batch ${batchId} timed out`);
}

function cleanMarkdown(md: string): string {
	return md.replace(/!\[.*?\]\([^)]*\)\n*/g, "");
}

export async function mineruProOcr(
	filePath: string,
	token: string,
	signal: AbortSignal | undefined,
	onProgress: OcrProgressCallback,
): Promise<OcrResult> {
	const ext = extname(filePath).toLowerCase();
	const fileName = basename(filePath);
	const supported = [
		".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif",
		".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
	];
	if (!supported.includes(ext)) throw new Error(`MinerU Pro unsupported: ${ext}`);

	const stats = await stat(filePath);
	if (stats.size > 200 * 1024 * 1024) throw new Error("File exceeds 200MB limit");

	onProgress("[1/1] MinerU Pro (vlm)…");
	const markdown = await processLocalFile(
		token,
		filePath,
		fileName,
		"[1/1]",
		signal,
		onProgress,
	);
	onProgress("[1/1] done");

	return {
		text: cleanMarkdown(markdown),
		details: { backend: "mineru-pro", fileName },
	};
}
