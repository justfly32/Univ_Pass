const XLSX = require('xlsx')
const fs = require('fs')

const UNIV_NAME_MAP = {
  '서울대학교': '서울대',
  '연세대학교': '연세대',
  '고려대학교': '고려대',
  '서강대학교': '서강대',
  '성균관대학교': '성균관대',
  '한양대학교': '한양대',
  '중앙대학교': '중앙대',
  '경희대학교': '경희대',
  '한국외국어대학교': '한국외대',
  '서울시립대학교': '서울시립대',
  '이화여자대학교': '이화여대',
  '동국대학교': '동국대',
  '홍익대학교': '홍익대',
  '건국대학교': '건국대',
  '국민대학교': '국민대',
  '숭실대학교': '숭실대',
  '인하대학교': '인하대',
  '아주대학교': '아주대',
  '단국대학교': '단국대',
  '광운대학교': '광운대',
  '명지대학교': '명지대',
  '상명대학교': '상명대',
  '세종대학교': '세종대',
  '가천대학교': '가천대',
  '한성대학교': '한성대',
  '강원대학교': '강원대',
  '충북대학교': '충북대',
  '충남대학교': '충남대',
  '전북대학교': '전북대',
  '전남대학교': '전남대',
  '경북대학교': '경북대',
  '부산대학교': '부산대',
  '경상국립대학교': '경상국립대',
  '제주대학교': '제주대',
  '인천대학교': '인천대',
  '숙명여자대학교': '숙명여대',
  '경기대학교': '경기대'
}

const GRADE_TO_SCORE = {1:96, 2:89, 3:77, 4:60, 5:40, 6:23, 7:11, 8:4, 9:0}

function convertGrade(grade) {
  if (grade <= 0 || isNaN(grade)) return null
  const intPart = Math.floor(grade)
  if (intPart >= 9) return 0
  const lower = Math.min(intPart, 9)
  const upper = Math.min(intPart + 1, 9)
  const lowerScore = GRADE_TO_SCORE[lower]
  const upperScore = GRADE_TO_SCORE[upper]
  if (lowerScore === undefined) return null
  if (upperScore === undefined) return lowerScore
  const fraction = grade - lower
  return Math.round((lowerScore + (upperScore - lowerScore) * fraction) * 10) / 10
}

function normalize(name) {
  return name.replace(/[\s()（）★*]/g, '').toLowerCase()
}

function stripSuffix(name) {
  return name.replace(/(과|부|학과|학부|전공|대학|학과)$/, '')
}

function matchDeptName(excelDept, systemDept) {
  const a = normalize(excelDept)
  const b = normalize(systemDept)
  if (a === b) return true
  const aStripped = stripSuffix(a)
  const bStripped = stripSuffix(b)
  if (aStripped === bStripped && aStripped.length >= 3) return true
  if (a.length >= 4 && b.length >= 4) {
    if (a.startsWith(bStripped) && bStripped.length >= 3 && a.length - bStripped.length <= 3) return true
    if (b.startsWith(aStripped) && aStripped.length >= 3 && b.length - aStripped.length <= 3) return true
  }
  return false
}

function loadWorkbook(filePath) {
  return XLSX.readFile(filePath)
}

const SHEET_PRIORITY = ['2024 수시입결', '2023 수시입결', '2022 수시입결', '2021 수시입결', '2020 수시입결']

function extractYearFromSheet(sheetName) {
  const m = sheetName.match(/(\d{4})/)
  return m ? parseInt(m[1]) : 0
}

function parseSheet(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 })
  const rows = []
  let dataStart = -1
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length < 5) continue
    if (row[0] === 1 || row[0] === '1' || row[0] === 0 || row[0] === '0') {
      if (row[1] && typeof row[1] === 'string' && row[1].trim().length >= 2) {
        dataStart = i
        break
      }
    }
  }
  if (dataStart === -1) return rows

  for (let i = dataStart; i < data.length; i++) {
    const row = data[i]
    if (!row || !row[0]) continue
    const no = row[0]
    if (typeof no === 'string' && no.match(/^\d+$/) === null && typeof no !== 'number') continue
    if (typeof no === 'number' && no < 0) continue

    const univName = row[1] ? String(row[1]).trim() : ''
    const centerType = row[2] ? String(row[2]).trim() : ''
    const typeName = row[3] ? String(row[3]).trim() : ''
    const deptName = row[4] ? String(row[4]).trim() : ''
    if (!univName || !deptName) continue

    const convertedScore70 = parseFloat(row[9])
    const convertedScore50 = parseFloat(row[8])
    const grade70 = parseFloat(row[12])
    const grade50 = parseFloat(row[11])

    rows.push({
      univName,
      centerType,
      typeName,
      deptName,
      convertedScore50,
      convertedScore70,
      grade50,
      grade70,
      totalScore: parseFloat(row[10])
    })
  }
  return rows
}

function normalizeScore(value, totalScore) {
  if (!value || isNaN(value) || value <= 0) return null
  if (totalScore && !isNaN(totalScore) && totalScore > 0) {
    if (totalScore >= 900) {
      return Math.round((value / (totalScore / 100)) * 10) / 10
    }
    if (totalScore <= 100) {
      if (value > 100) return Math.round((value / 10) * 10) / 10
      return Math.round(value * 10) / 10
    }
    return Math.round((value / (totalScore / 100)) * 10) / 10
  }
  if (value > 100) {
    return Math.round((value / 10) * 10) / 10
  }
  return Math.round(value * 10) / 10
}

function findBestCutoffForDept(deptRows, systemDeptName) {
  const preferred = deptRows.filter(r => (r.centerType === '교과' || r.centerType === '종합') && /일반/.test(r.typeName))
  const secondary = deptRows.filter(r => r.centerType === '교과' || r.centerType === '종합')
  const fallback = deptRows
  let pool = preferred.length > 0 ? preferred : secondary
  if (pool.length === 0) pool = fallback

  for (const r of pool) {
    let score = null
    let sourceField = ''
    let sourceValue = null
    if (r.convertedScore70 && !isNaN(r.convertedScore70) && r.convertedScore70 > 0) {
      const ns = normalizeScore(r.convertedScore70, r.totalScore)
      if (ns !== null && ns > 0 && ns <= 100) { score = ns; sourceField = '대학별환산70%'; sourceValue = r.convertedScore70 }
    }
    if (score === null && r.convertedScore50 && !isNaN(r.convertedScore50) && r.convertedScore50 > 0) {
      const ns = normalizeScore(r.convertedScore50, r.totalScore)
      if (ns !== null && ns > 0 && ns <= 100) { score = ns; sourceField = '대학별환산50%'; sourceValue = r.convertedScore50 }
    }
    if (score === null && r.grade70 && !isNaN(r.grade70) && r.grade70 > 0) {
      const ns = convertGrade(r.grade70)
      if (ns !== null && ns <= 100) { score = ns; sourceField = '교과등급70%'; sourceValue = r.grade70 }
    }
    if (score === null && r.grade50 && !isNaN(r.grade50) && r.grade50 > 0) {
      const ns = convertGrade(r.grade50)
      if (ns !== null && ns <= 100) { score = ns; sourceField = '교과등급50%'; sourceValue = r.grade50 }
    }
    if (score !== null && score > 0 && score <= 100) {
      return {
        cutoffScore: score,
        sourceValue,
        sourceField,
        deptName: r.deptName,
        centerType: r.centerType,
        typeName: r.typeName,
        year: r.year
      }
    }
  }
  return null
}

async function analyzeCutoff(filePath, univId, univFullName, departments) {
  try {
    const wb = loadWorkbook(filePath)
    const excelName = UNIV_NAME_MAP[univFullName]
    if (!excelName) {
      return { success: false, error: `매핑되지 않은 대학명: ${univFullName}`, cutoffDepartments: [] }
    }

    const allSheetRows = []
    for (const sheetName of SHEET_PRIORITY) {
      if (!wb.SheetNames.includes(sheetName)) continue
      const ws = wb.Sheets[sheetName]
      const rows = parseSheet(ws)
      const year = extractYearFromSheet(sheetName)
      for (const r of rows) {
        r.year = year
      }
      allSheetRows.push(...rows)
    }

    if (allSheetRows.length === 0) {
      return { success: false, error: 'XLSX에서 데이터를 읽을 수 없습니다.', cutoffDepartments: [] }
    }

    const univRows = allSheetRows.filter(r => r.univName === excelName)
    if (univRows.length === 0) {
      return {
        success: false,
        error: `'${excelName}' 데이터를 XLSX에서 찾을 수 없습니다. (XLSX 내 대학명: ${excelName})`,
        cutoffDepartments: []
      }
    }

    const cutoffDepartments = []
    const unmatched = []

    for (const dept of departments) {
      const deptRows = univRows.filter(r => matchDeptName(r.deptName, dept.name))

      if (deptRows.length === 0) {
        unmatched.push(dept.name)
        cutoffDepartments.push({
          name: dept.name,
          cutoff_score: dept.cutoff_score,
          matched: false
        })
        continue
      }

      deptRows.sort((a, b) => {
        const aPref = (a.centerType === '교과' || a.centerType === '종합') && /일반/.test(a.typeName) ? 0 : 1
        const bPref = (b.centerType === '교과' || b.centerType === '종합') && /일반/.test(b.typeName) ? 0 : 1
        if (aPref !== bPref) return aPref - bPref
        return b.year - a.year
      })

      const best = findBestCutoffForDept(deptRows, dept.name)
      if (best) {
        cutoffDepartments.push({
          name: dept.name,
          cutoff_score: best.cutoffScore,
          matched: true,
          sourceValue: best.sourceValue,
          sourceField: best.sourceField,
          excelDeptName: best.deptName
        })
      } else {
        const firstRow = deptRows[0]
        let fallbackScore = null
        if (firstRow.convertedScore70) {
          fallbackScore = normalizeScore(firstRow.convertedScore70, firstRow.totalScore)
        } else if (firstRow.convertedScore50) {
          fallbackScore = normalizeScore(firstRow.convertedScore50, firstRow.totalScore)
        } else if (firstRow.grade70) {
          fallbackScore = convertGrade(firstRow.grade70)
        } else if (firstRow.grade50) {
          fallbackScore = convertGrade(firstRow.grade50)
        }
        cutoffDepartments.push({
          name: dept.name,
          cutoff_score: (fallbackScore !== null && fallbackScore > 0 && fallbackScore <= 100) ? Math.round(fallbackScore * 10) / 10 : dept.cutoff_score,
          matched: !!(fallbackScore !== null && fallbackScore > 0 && fallbackScore <= 100),
          sourceValue: firstRow.convertedScore70 || firstRow.convertedScore50 || firstRow.grade70 || firstRow.grade50,
          excelDeptName: firstRow.deptName
        })
      }
    }

    return {
      success: true,
      cutoffDepartments,
      totalFound: cutoffDepartments.filter(d => d.matched).length,
      totalUnmatched: unmatched.length,
      unmatched,
      year: Math.max(...univRows.map(r => r.year)),
      univRowsTotal: univRows.length
    }
  } catch (err) {
    return { success: false, error: err.message, cutoffDepartments: [] }
  }
}

module.exports = { analyzeCutoff, UNIV_NAME_MAP }
