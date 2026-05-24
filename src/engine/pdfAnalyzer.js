const { PDFParse } = require('pdf-parse')
const fs = require('fs')

async function extractText(pdfPath) {
  const buf = fs.readFileSync(pdfPath)
  const parser = new PDFParse({ data: buf, verbosity: 0 })
  const result = await parser.getText({ cellSeparator: '\t', cellThreshold: 10 })
  await parser.destroy()
  return result.text
}

function detectGradeConversion(text) {
  const m = text.match(/반영\s*점수\s*([\d\s.]+)/)
  if (m) {
    const nums = m[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
    if (nums.length === 9) {
      const table = {}
      for (let i = 0; i < 9; i++) table[String(i + 1)] = nums[i]
      return table
    }
  }
  return null
}

function isLikelyDeptName(name) {
  if (!name || name.length < 2) return false
  if (!/^[가-힣A-Za-z0-9()*★]+$/.test(name.replace(/\s/g, ''))) return false
  if (!/[가-힣]/.test(name)) return false
  return (/(?:과|부|학부|전공|학과)$/.test(name) && name.length >= 3)
}

const NON_DEPT_WORDS = new Set(['합계','소계','총계','계열','인문','자연','예능','체능','모집','인원','학교','학생','교과','대학','전형','선발','구분','수능','정시','계약학과','초과선발과','통합과','전공과'])

function extractDeptFromCell(cell) {
  // Extract the last 학과/학부/전공/etc name from a cell that may have combined info
  const m = cell.match(/([가-힣]{2,}(?:과|부|학부|전공|학과))\s*$/)
  return m ? m[1] : null
}

function findDeptPosition(cells) {
  // Strategy: prefer the last (rightmost) position where a dept name appears alone
  // If a cell contains a dept name as part of longer text, extract it
  let bestPos = -1
  let bestName = null

  for (let j = cells.length - 1; j >= 0; j--) {
    const raw = cells[j].replace(/[*★]/g, '').trim()
    // Try exact match first (cell is JUST a dept name)
    if (isLikelyDeptName(raw)) {
      bestPos = j
      bestName = raw
      break
    }
  }

  // If no exact match, try extracting from combined cells
  if (bestPos === -1) {
    for (let j = cells.length - 1; j >= 0; j--) {
      const extracted = extractDeptFromCell(cells[j])
      if (extracted && isLikelyDeptName(extracted)) {
        bestPos = j
        bestName = extracted
        break
      }
    }
  }

  // If we found a combined cell (has spaces), try to extract just the dept name
  if (bestPos !== -1 && bestName.includes(' ')) {
    const extracted = extractDeptFromCell(bestName)
    if (extracted && isLikelyDeptName(extracted)) {
      bestName = extracted
    }
  }

  return { pos: bestPos, name: bestName }
}

function parseDualColumnTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const deptRows = []
  const seen = new Set()

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split('\t').map(c => c.trim()).filter(Boolean)
    if (cells.length < 4 || cells.length > 10) continue
    const joined = cells.join(' ')
    if (joined.includes('합계') || joined.includes('총계')) continue

    const half = Math.ceil(cells.length / 2)

    for (let side = 0; side < 2; side++) {
      const start = side === 0 ? 0 : half
      const end = side === 0 ? half : cells.length
      const chunk = cells.slice(start, end)
      if (chunk.length < 2) continue

      let deptName = null
      let numIdx = -1

      for (let j = chunk.length - 1; j >= 0; j--) {
        const raw = chunk[j].replace(/[*★◆●]/g, '').trim()

        // Try exact match
        if (isLikelyDeptName(raw)) {
          const tooLong = (/\d[\s\u00a0]/.test(raw) || /[\s\u00a0]\d/.test(chunk[j]))
          if (!tooLong) { deptName = raw; numIdx = j; break }
        }

        // Try extracting dept name from mixed content like "★ 73 디자인융합학과" or "39 인문융합학부"
        const extracted = chunk[j].match(/([가-힣]{2,}(?:과|부|학부|전공|학과))\s*$/)
        if (extracted && isLikelyDeptName(extracted[1])) {
          deptName = extracted[1]
          numIdx = j
          break
        }
      }

      if (!deptName) continue

      let quota = null
      for (let j = numIdx + 1; j < chunk.length; j++) {
        const v = parseInt(chunk[j].replace(/[^\d-]/g, ''), 10)
        if (!isNaN(v) && v > 0 && v < 1000) {
          quota = v
          break
        }
      }
      if (quota === null && numIdx - 1 >= 0) {
        const v = parseInt(chunk[numIdx - 1].replace(/[^\d-]/g, ''), 10)
        if (!isNaN(v) && v > 0 && v < 1000) quota = v
      }
      if (quota === null) continue
      if (seen.has(deptName)) continue
      seen.add(deptName)

      if (/학생부|교과|학교생활|논술|실기|면접|수능|출결|서류/.test(deptName)) continue
      if (deptName.length > 15) continue

      const isMed = /의과|의예|한의|약학/.test(deptName)
      deptRows.push({
        name: deptName,
        gpa_weight: 0.5,
        record_weight: 0.5,
        cutoff_score: isMed ? 90 : 70
      })
    }
  }
  return deptRows
}

function parseDepartmentTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const deptRows = []

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split('\t').map(c => c.trim()).filter(Boolean)
    if (cells.length < 5 || cells.length > 14) continue

    const joined = cells.join(' ')
    if (joined.includes('특수기호 설명') || joined.includes('모집인원은') || joined.includes('전공자율선택제')) continue

    const { pos, name } = findDeptPosition(cells)
    if (pos === -1 || !name) continue

    let deptName = name
    let numbers = cells.slice(pos + 1)

    // If numbers contain Korean text, the dept name might appear again later
    // (e.g., ["심리학부","인문","심리학부*","25",...]) — find a later position
    if (numbers.some(n => /[가-힣a-zA-Z]/.test(n))) {
      const laterPos = findDeptPosition(cells.slice(pos + 1))
      if (laterPos.pos !== -1) {
        const actualPos = pos + 1 + laterPos.pos
        deptName = laterPos.name
        numbers = cells.slice(actualPos + 1)
      }
    }

    const cleanName = deptName.replace(/[*★]/g, '').trim()
    if (NON_DEPT_WORDS.has(cleanName)) continue

    function isNum(v) {
      const t = v.trim()
      if (t === '-') return true
      if (t === '◉') return true
      return !isNaN(parseInt(t, 10))
    }

    if (numbers.length < 2 || !numbers.every(n => isNum(n))) continue
    if (!numbers.some(n => { const t = n.trim(); return !isNaN(parseInt(t, 10)) && !t.includes('◉') })) continue

    deptRows.push({ name: cleanName, nums: numbers.map(n => {
      const v = parseInt(n, 10)
      return isNaN(v) ? -1 : v
    })})
  }

  const seen = new Set()
  return deptRows.filter(d => {
    if (seen.has(d.name)) return false
    seen.add(d.name)
    return true
  })
}

const ADMISSION_TYPES = [
  { key: 'scholarly', names: ['학교추천', '학생부교과'], label: '학교추천', gpaWeight: 0.9, recordWeight: 0.1 },
  { key: 'academic', names: ['학업우수'], label: '학업우수', gpaWeight: 0.3, recordWeight: 0.7 },
  { key: 'track', names: ['계열적합'], label: '계열적합', gpaWeight: 0.2, recordWeight: 0.8 },
  { key: 'opportunity', names: ['고른기회'], label: '고른기회', gpaWeight: 0.3, recordWeight: 0.7 },
  { key: 'multicultural', names: ['다문화'], label: '다문화', gpaWeight: 0.3, recordWeight: 0.7 },
  { key: 'worker', names: ['재직자'], label: '재직자', gpaWeight: 0.3, recordWeight: 0.7 },
  { key: 'cyber', names: ['사이버국방'], label: '사이버국방', gpaWeight: 0.3, recordWeight: 0.7 },
  { key: 'essay', names: ['논술'], label: '논술', gpaWeight: 0.5, recordWeight: 0.5 },
  { key: 'special', names: ['특기자', '실기/실적'], label: '특기자', gpaWeight: 0.25, recordWeight: 0.75 },
]

function detectRatioPatterns(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let currentSection = null
  const ratios = {}

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split('\t').map(c => c.trim()).filter(Boolean)
    const joined = cells.join(' ')

    for (const at of ADMISSION_TYPES) {
      for (const n of at.names) {
        if (joined.includes(n) && joined.includes('전형') && !joined.includes('요약') && !joined.includes('모집단위')) {
          currentSection = at.key
          break
        }
      }
    }

    if (!currentSection) continue

    const pct = joined.match(/(\d+)%/g)
    if (!pct) continue

    if (joined.includes('학생부(교과)') || joined.includes('교과') && joined.includes('%')) {
      const gpaPct = joined.match(/교과\)?\s*(\d+)%/)
      if (gpaPct) {
        if (!ratios[currentSection]) ratios[currentSection] = {}
        ratios[currentSection].gpaWeight = parseInt(gpaPct[1]) / 100
        ratios[currentSection].recordWeight = parseFloat((1 - ratios[currentSection].gpaWeight).toFixed(2))
      }
    }

    if (joined.includes('서류') && joined.includes('%') && !joined.includes('교과') && !joined.includes('논술')) {
      if (!ratios[currentSection]) ratios[currentSection] = {}
      if (ratios[currentSection].gpaWeight === undefined) {
        const at = ADMISSION_TYPES.find(t => t.key === currentSection)
        ratios[currentSection].gpaWeight = at ? at.gpaWeight : 0.5
        ratios[currentSection].recordWeight = at ? at.recordWeight : 0.5
      }
    }
  }

  return ratios
}

function getTypeForDept(nums) {
  const types = ['scholarly', 'academic', 'opportunity', 'worker']
  const typeIndices = [1, 2, 3, 4]
  let maxVal = 0
  let bestType = 'scholarly'
  for (let t = 0; t < types.length; t++) {
    const idx = typeIndices[t]
    if (idx < nums.length && nums[idx] > maxVal) {
      maxVal = nums[idx]
      bestType = types[t]
    }
  }
  return bestType
}

function parseDepartmentData(text) {
  let tableDepts = parseDepartmentTable(text)

  // If regular table parsing found very few, try dual-column layout
  if (tableDepts.length < 5) {
    const dualDepts = parseDualColumnTable(text)
    if (dualDepts.length > tableDepts.length) {
      tableDepts = dualDepts
    }
  }

  if (tableDepts.length === 0) return fallbackParse(text)

  const ratios = detectRatioPatterns(text)
  const depts = []

  for (const d of tableDepts) {
    const hasWeights = d.gpa_weight !== undefined
    const gpaWeight = hasWeights ? d.gpa_weight : (() => {
      const typeKey = getTypeForDept(d.nums)
      const at = ADMISSION_TYPES.find(t => t.key === typeKey) || ADMISSION_TYPES[0]
      const specific = ratios[typeKey] || {}
      return specific.gpaWeight !== undefined ? specific.gpaWeight : at.gpaWeight
    })()
    const recordWeight = hasWeights ? d.record_weight : parseFloat((1 - gpaWeight).toFixed(2))

    const isMed = /의과|의예|한의|약학/.test(d.name)
    depts.push({
      name: d.name,
      gpa_weight: gpaWeight,
      record_weight: recordWeight,
      cutoff_score: isMed ? 90 : 70
    })
  }

  depts.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  return depts
}

function fallbackParse(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const tableCandidates = []
  for (const line of lines) {
    const cells = line.split('\t').map(c => c.trim()).filter(Boolean)
    for (const c of cells) {
      const m = c.match(/^([가-힣]{2,}(?:과|부|학부|전공|학과))$/)
      if (m && !NON_DEPT_WORDS.has(m[1])) {
        const clean = m[1].replace(/[*★]/g, '').trim()
        if (!tableCandidates.includes(clean)) tableCandidates.push(clean)
      }
    }
  }
  return tableCandidates.map(name => ({
    name,
    gpa_weight: 0.5,
    record_weight: 0.5,
    cutoff_score: /의과|의예|한의|약학/.test(name) ? 90 : 70
  }))
}

async function analyzePlan(pdfPath) {
  try {
    const text = await extractText(pdfPath)
    const departments = parseDepartmentData(text)
    const gradeConv = detectGradeConversion(text)

    return {
      success: true,
      departments,
      totalFound: departments.length,
      source: departments.length > 0 ? 'table' : 'fallback',
      detectedGradeConversion: gradeConv
    }
  } catch (err) {
    return { success: false, error: err.message, departments: [] }
  }
}

module.exports = { analyzePlan, extractText, parseDepartmentData, detectGradeConversion }
