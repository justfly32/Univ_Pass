## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | No | `''` | OpenRouter API key (required for paid models, free models work without) |
| `OPENROUTER_MODEL` | No | `nvidia/nemotron-3-nano-30b-a3b:free` | OpenRouter model ID for 학생부 OCR analysis |

## Project Info

- Server: Express + EJS on port 3000
- OCR engine: Tesseract.js with Korean language
- LLM provider: OpenRouter
- 학생부 이미지 분석: OCR → LLM → 6개 항목 점수 자동 채움
