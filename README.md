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

**That's all.** MinerU (free cloud API) is the default — zero config.

---

## Backends

Switch anytime with `/ocr` (no args).

| | Backend | Best for | Setup |
|---|---|---|---|
| ☁️ | **MinerU** (default) | PDFs, general docs | None |
| ☁️ | **MinerU Pro** | Large PDFs, vlm accuracy | API token |
| 🦙 | Ollama | Math formulas → LaTeX | GPU + 2.2GB model |
| 🔤 | Tesseract | Plain text (~30MB) | `brew install tesseract` |
| 📐 | Pix2Text | Math + text, GPU/CPU | `pip install pix2text` |

---

## MinerU (default)

Free cloud API. Images are wrapped as PDF so language-aware OCR applies.

**Limits:** ≤10MB, ≤20 pages/request. PDFs >20 pages auto-split via pypdfium2.

---

## MinerU Pro (vlm model)

Higher accuracy via token-based precision API. **≤200MB, ≤200 pages** — no splitting needed.

Get a free token at [mineru.net/apiManage](https://mineru.net/apiManage), then set it in `/ocr` settings. 1000 pages/day high-priority.

---

## Ollama

Local GPU OCR via [glm-ocr](https://ollama.com) — state-of-the-art formula recognition (94.6 OmniDocBench). Outputs LaTeX.

```bash
# macOS
brew install ollama && ollama pull glm-ocr
brew install poppler   # multi-page PDFs

# Linux
curl -fsSL https://ollama.com/install.sh | sh
ollama pull glm-ocr
sudo apt install poppler-utils
```

---

## Tesseract

Classic OCR engine. Ultra-lightweight (~30MB). **No formula support** — use Ollama or Pix2Text for math.

```bash
brew install tesseract              # macOS
sudo apt install tesseract-ocr      # Linux
```

Supports Chinese: `brew install tesseract-lang` (auto-installed on macOS).

---

## Pix2Text

Mathpix alternative — handles text + formulas on GPU (CUDA/MPS) or CPU. Auto-detects best device.

```bash
pip install pix2text
```

First run downloads ONNX models (~50MB).

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

**MinerU 429** → Wait a minute or switch backend.

**MinerU Pro 401** → Regenerate token at mineru.net/apiManage.

**"Is Ollama running?"** → `ollama serve`

**"pdftoppm not found"** → `brew install poppler` / `sudo apt install poppler-utils`

**"python3 not found" (Pix2Text)** → `pip install pix2text`

**"tesseract not found"** → `brew install tesseract` / `sudo apt install tesseract-ocr`

---

## License

MIT
