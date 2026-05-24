const dataManager = require('../data')

const CATEGORY_LABELS = {
  academic_competency: '학업역량',
  learning_attitude: '학습태도',
  career_competency: '진로역량',
  career_exploration: '진로탐색활동',
  character: '인성',
  leadership: '리더십'
}

function getGradeConversion(univId) {
  const db = dataManager.getAll()
  const univ = db.universities.find(u => u.id === univId)
  const key = univ ? univ.grade_conversion : 'default'
  return db.grade_conversions[key] || db.grade_conversions.default
}

function convertGradeToScore(grade, conversionTable) {
  if (Number.isInteger(grade)) {
    const score = conversionTable[String(grade)]
    return score !== undefined ? score : 20
  }
  const lower = Math.floor(grade)
  const upper = Math.ceil(grade)
  const lowerScore = conversionTable[String(lower)]
  const upperScore = conversionTable[String(upper)]
  if (lowerScore === undefined && upperScore === undefined) return 20
  if (lowerScore === undefined) return upperScore
  if (upperScore === undefined) return lowerScore
  const fraction = grade - lower
  return Math.round((lowerScore + (upperScore - lowerScore) * fraction) * 100) / 100
}

function calcStudentRecordScore(recordScores, categoryWeights) {
  let weightedSum = 0
  let maxWeightedSum = 0
  const details = []

  for (const [cat, weight] of Object.entries(categoryWeights)) {
    const score = recordScores[cat] || 0
    weightedSum += score * weight
    maxWeightedSum += 10 * weight
    details.push({
      category: cat,
      label: CATEGORY_LABELS[cat] || cat,
      score,
      weight,
      weighted: score * weight,
      maxWeighted: 10 * weight
    })
  }

  const normalized = maxWeightedSum > 0 ? (weightedSum / maxWeightedSum) * 100 : 0

  return { weightedSum, maxWeightedSum, normalized, details }
}

function calcTotalScore(gpaScore, recordScoreNormalized, gpaWeight, recordWeight) {
  return gpaScore * gpaWeight + recordScoreNormalized * recordWeight
}

function calcProbability(userScore, cutoffScore) {
  if (cutoffScore <= 0) return 0
  const raw = (userScore / cutoffScore) * 100
  return Math.min(Math.round(raw * 100) / 100, 99)
}

function calcGradeProbability(gpaGrade, cutoffGrade) {
  if (cutoffGrade <= 0) return 0
  if (cutoffGrade >= 9) return 50
  let prob
  if (gpaGrade <= cutoffGrade) {
    // meets or exceeds cutoff
    const excess = cutoffGrade - gpaGrade
    const maxExcess = cutoffGrade - 1
    prob = 50 + (excess / maxExcess) * 49
  } else {
    // below cutoff
    const deficit = gpaGrade - cutoffGrade
    const maxDeficit = 9 - cutoffGrade
    prob = 50 - (deficit / maxDeficit) * 50
  }
  return Math.min(Math.max(Math.round(prob * 100) / 100, 0), 99)
}

function getGradeAdvice(gpaGrade) {
  if (gpaGrade <= 1.5) return '매우 우수한 내신 성적입니다. 수시 상위권 대학 지원 가능합니다.'
  if (gpaGrade <= 2.5) return '양호한 내신 성적입니다. 수시 중상위권 대학을 목표로 하세요.'
  if (gpaGrade <= 4.0) return '보통 수준의 내신 성적입니다. 수시 학생부 보완이 필요합니다.'
  if (gpaGrade <= 6.0) return '내신 성적이 낮은 편입니다. 수시 학생부와 비교과 활동으로 만회해야 합니다.'
  return '내신 성적이 매우 낮습니다. 학생부 종합전형보다는 교과전형에 집중하거나 수능 준비를 병행하세요.'
}

function getRecordAdvice(recordScores) {
  const weaknesses = []
  const strengths = []

  for (const [cat, score] of Object.entries(recordScores)) {
    if (score <= 5) weaknesses.push(CATEGORY_LABELS[cat] || cat)
    else if (score >= 8) strengths.push(CATEGORY_LABELS[cat] || cat)
  }

  let advice = ''
  if (weaknesses.length > 0) {
    advice += `수시 전형 대비 보완 필요 항목: ${weaknesses.join(', ')}. `
  }
  if (strengths.length > 0) {
    advice += `수시 전형 강점 항목: ${strengths.join(', ')}.`
  }
  if (!advice) {
    advice = '전반적으로 균형 잡힌 학생부입니다. 수시 전형에 적합합니다.'
  }
  return advice
}

function analyze(student, univId, deptName, admissionType) {
  const db = dataManager.getAll()
  const univ = db.universities.find(u => u.id === univId)
  if (!univ) return null

  const dept = admissionType
    ? univ.departments.find(d => d.name === deptName && d.admission_type === admissionType)
    : univ.departments.find(d => d.name === deptName)
  if (!dept) return null

  const isGradeCutoff = dept.cutoff_is_grade

  const conversionTable = getGradeConversion(univId)
  const gpaScore = convertGradeToScore(student.gpa_grade, conversionTable)

  const categoryWeights = dept.category_weights || db.category_weights_default
  const recordResult = calcStudentRecordScore(student.record_scores, categoryWeights)

  let totalScore, cutoffScore, probability
  const noRecord = dept.no_record

  if (isGradeCutoff || noRecord) {
    const cutoffGrade = dept.cutoff_score
    cutoffScore = convertGradeToScore(cutoffGrade, conversionTable)
    totalScore = gpaScore
    probability = calcGradeProbability(student.gpa_grade, cutoffGrade)
  } else {
    cutoffScore = dept.cutoff_score
    totalScore = calcTotalScore(gpaScore, recordResult.normalized, dept.gpa_weight, dept.record_weight)
    probability = calcProbability(totalScore, cutoffScore)
  }

  return {
    university: univ.name,
    universityId: univ.id,
    department: dept.name,
    gpaScore,
    recordScore: recordResult.normalized,
    gpaWeight: dept.gpa_weight,
    recordWeight: dept.record_weight,
    totalScore: Math.round(totalScore * 100) / 100,
    cutoffScore: cutoffScore,
    cutoffRaw: dept.cutoff_score,
    cutoffIsGrade: isGradeCutoff,
    noRecord,
    probability,
    recordDetails: recordResult.details,
    gradeAdvice: getGradeAdvice(student.gpa_grade),
    recordAdvice: getRecordAdvice(student.record_scores)
  }
}

module.exports = { analyze, convertGradeToScore, calcStudentRecordScore, calcTotalScore, calcProbability, calcGradeProbability, CATEGORY_LABELS }
