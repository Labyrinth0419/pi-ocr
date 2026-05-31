# pi-ocr

> ### ⚡ Zero setup. Works out of the box.
>
> Default backend is **MinerU** — a free cloud API.
> No GPU, no API key, no pip install. Just `pi install` and `/ocr`.

OCR for [Pi Coding Agent](https://pi.dev). Bridges the multimodal gap for non-vision LLMs like DeepSeek: when your model can't see images, `pi_ocr` reads them for you.

---

## Quickstart

```bash
pi install npm:pi-ocr
/ocr ./screenshot.png
/ocr ./paper.pdf
```

**That's all.** MinerU (free cloud API) is the default and requires nothing.

---

## Backends

Switch anytime with `/ocr` (no args).

| | Backend | Best for | Setup |
|---|---|---|---|
| ☁️ | **MinerU** (default) | PDFs, tables, general docs | None — works instantly |
| 🦙 | Ollama | Math formulas → LaTeX, offline | `brew install ollama && ollama pull glm-ocr` |
| 🔤 | Tesseract | Plain text, no formulas (~30MB) | `brew install tesseract` |
| 📐 | Pix2Text | Math + text, CPU Python | `pip install pix2text` |

---

## MinerU (default)

Free cloud API. Handles PDF, PNG, JPG, Docx, PPTx, Xlsx.

**Limits:** ≤10MB per file, ≤20 pages per request.

PDFs >20 pages can be auto-split (enabled by default in `/ocr` settings). Splitting needs `pip install pypdfium2`.

---

## Ollama (optional, for math formulas)

Local GPU OCR via [glm-ocr](https://ollama.com) — state-of-the-art formula recognition (94.6 OmniDocBench). Outputs LaTeX.

```bash
# macOS
brew install ollama
ollama pull glm-ocr
brew install poppler   # multi-page PDFs only

# Linux
curl -fsSL https://ollama.com/install.sh | sh
ollama pull glm-ocr
sudo apt install poppler-utils
```

Switch with `/ocr` → "OCR Backend" → ollama.

---

## Tesseract (optional, plain text only)

Classic OCR engine. Ultra-lightweight (~30MB), CPU-only, fast. **No formula support** — use Ollama or Pix2Text for math.

```bash
brew install tesseract              # macOS
sudo apt install tesseract-ocr      # Linux
```

Switch with `/ocr` → "OCR Backend" → tesseract.

---

## Pix2Text (optional, for math + text on CPU)

Local Python OCR. Mathpix alternative — handles text + formulas on CPU.

```bash
pip install pix2text
```

First run downloads ONNX models (~50MB). Switch with `/ocr` → "OCR Backend" → pix2text.

---

## Commands

| Command | |
|---|---|
| `/ocr` | Open settings (backend, model, split toggle) |
| `/ocr <file> [task]` | OCR a file |
| `/ocr <file> formula` | Math LaTeX output |

### Tasks

| Task | Output |
|---|---|
| `auto` (default) | Markdown + LaTeX |
| `text` | Plain Markdown |
| `formula` | LaTeX only |
| `table` | Markdown tables |
| `figure` | Description |

---

## Troubleshooting

**"Is Ollama running?"** → `ollama serve`

**MinerU 429** → Rate limited. Wait a minute or switch backend.

**"python3 not found" (Pix2Text)** → `python3 -m pip install pix2text`

**"tesseract not found"** → `brew install tesseract` (macOS) / `sudo apt install tesseract-ocr` (Linux)

**"pdftoppm not found" (Ollama multi-page)** → `brew install poppler` (macOS) / `sudo apt install poppler-utils` (Linux)

---

## License

MIT
