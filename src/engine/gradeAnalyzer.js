const Tesseract = require('tesseract.js')
const { PDFParse } = require('pdf-parse')
const path = require('path')
const fs = require('fs')

const LLM_MODEL = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-nano-30b-a3b:free'
const LLM_API_KEY = process.env.OPENROUTER_API_KEY || ''

const CATEGORIES = [
  { key: 'academic_competency', label: '학업역량' },
  { key: 'learning_attitude', label: '학습태도' },
  { key: 'career_competency', label: '진로역량' },
  { key: 'career_exploration', label: '진로탐색활동' },
  { key: 'character', label: '인성' },
  { key: 'leadership', label: '리더십' }
]

function buildPrompt(text) {
  return [
    {
      role: 'system',
      content: `당신은 한국 대학 입시 학생부(학교생활기록부) 평가 전문가입니다.
학생부 텍스트를 분석하여 다음 6개 항목을 0~10점(0.5점 단위)으로 평가하세요.

평가 항목:
- 학업역량 (academic_competency): 학업 성취도, 교과 이해도, 학업 태도
- 학습태도 (learning_attitude): 수업 참여도, 과제 수행, 학습 습관
- 진로역량 (career_competency): 진로 목표의 명확성, 관련 활동의 전문성
- 진로탐색활동 (career_exploration): 진로 관련 탐색 활동의 다양성과 깊이
- 인성 (character): 인성, 협력, 배려, 윤리의식
- 리더십 (leadership): 주도성, 팀워크, 의사소통 능력

반드시 다음 JSON 형식으로만 응답하세요:
{
  "scores": {
    "academic_competency": <0~10>,
    "learning_attitude": <0~10>,
    "career_competency": <0~10>,
    "career_exploration": <0~10>,
    "character": <0~10>,
    "leadership": <0~10>
  },
  "reasoning": "<간단한 평가 근거 (2~3문장)>"
}

점수는 학생부 텍스트에 직접 언급된 내용만 근거로 평가하세요. 추측하지 마세요.`
    },
    {
      role: 'user',
      content: `다음은 학생의 학교생활기록부 텍스트입니다. 각 항목을 평가해주세요.\n\n${text.substring(0, 8000)}`
    }
  ]
}

async function ocrImage(imagePath) {
  let worker
  try {
    worker = await Tesseract.createWorker('kor')
    const { data } = await worker.recognize(imagePath)
    return data.text
  } finally {
    if (worker) await worker.terminate().catch(() => {})
  }
}

async function callLLM(messages) {
  const headers = {
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/anomalyco/Univ_Pass',
    'X-Title': 'Univ_Pass'
  }
  if (LLM_API_KEY) headers['Authorization'] = `Bearer ${LLM_API_KEY}`

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM API 오류 (${response.status}): ${errorText}`)
  }

  const result = await response.json()
  return result.choices?.[0]?.message?.content || ''
}

function extractJSON(raw) {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('빈 응답')
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed)
  const codeMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (codeMatch) return JSON.parse(codeMatch[1])
  const braceMatch = trimmed.match(/(\{[\s\S]*\})/)
  if (braceMatch) return JSON.parse(braceMatch[1])
  throw new Error('JSON을 찾을 수 없습니다.')
}

function parseScores(parsed) {
  let rawScores = parsed.scores

  if (!rawScores && Array.isArray(parsed)) {
    rawScores = {}
    for (const item of parsed) {
      const key = CATEGORIES.find(c => c.label === item.category || c.key === item.category)?.key
      if (key && typeof item.score === 'number') rawScores[key] = item.score
    }
  }

  if (!rawScores && parsed.reasoning) {
    rawScores = { ...parsed }
    delete rawScores.reasoning
  }

  const scores = {}
  let hasValid = false
  for (const { key } of CATEGORIES) {
    const val = rawScores?.[key]
    if (typeof val === 'number' && val >= 0 && val <= 10) {
      scores[key] = Math.round(val * 2) / 2
      hasValid = true
    } else {
      scores[key] = null
    }
  }

  return { scores, hasValid }
}

async function analyzeStudentRecord(text) {
  const prompt = buildPrompt(text)

  let lastError = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const content = await callLLM(prompt)

    let parsed
    try {
      parsed = extractJSON(content)
    } catch (e) {
      lastError = 'LLM 응답을 분석할 수 없습니다.'
      console.error(`LLM 응답 파싱 실패 (attempt ${attempt + 1}):`, content.substring(0, 300))
      continue
    }

    const { scores, hasValid } = parseScores(parsed)
    if (hasValid) {
      return { scores, reasoning: parsed.reasoning || '' }
    }

    lastError = 'LLM이 올바른 점수 형식을 반환하지 않았습니다.'
    console.error(`LLM 응답 scores 누락 (attempt ${attempt + 1}):`, JSON.stringify(parsed).substring(0, 300))
  }

  throw new Error(lastError)
}

async function analyzeFromImage(imagePath) {
  const text = await ocrImage(imagePath)
  fs.unlink(imagePath, () => {})
  return await analyzeStudentRecord(text)
}

async function extractPdfText(pdfPath) {
  const buf = fs.readFileSync(pdfPath)
  const parser = new PDFParse({ data: buf, verbosity: 0 })
  const result = await parser.getText()
  await parser.destroy()
  return result.text
}

async function analyzeFromPdf(pdfPath) {
  const text = await extractPdfText(pdfPath)
  fs.unlink(pdfPath, () => {})
  return await analyzeStudentRecord(text)
}

module.exports = { analyzeFromImage, analyzeFromPdf, ocrImage, analyzeStudentRecord, CATEGORIES }
