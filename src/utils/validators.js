const CATEGORIES = ['academic_competency', 'learning_attitude', 'career_competency', 'career_exploration', 'character', 'leadership']

function validateStudentInput(data) {
  const errors = []
  const noRecord = data.no_record === '1' || data.no_record === true

  if (!data.name || data.name.trim().length < 1) {
    errors.push('이름을 입력해주세요.')
  }

  const grade = Number(data.gpa_grade)
  if (isNaN(grade) || grade < 1 || grade > 9) {
    errors.push('내신 등급은 1에서 9 사이여야 합니다.')
  }

  if (!noRecord) {
    for (const cat of CATEGORIES) {
      const val = Number(data[cat])
      if (isNaN(val) || val < 0 || val > 10) {
        const labels = {
          academic_competency: '학업역량',
          learning_attitude: '학습태도',
          career_competency: '진로역량',
          career_exploration: '진로탐색활동',
          character: '인성',
          leadership: '리더십'
        }
        errors.push(`${labels[cat]} 점수는 0에서 10 사이여야 합니다.`)
      }
    }
  }

  return errors
}

function buildStudent(data) {
  const noRecord = data.no_record === '1' || data.no_record === true
  if (noRecord) {
    return {
      name: data.name.trim(),
      gpa_grade: Number(data.gpa_grade),
      no_record: true,
      record_scores: {
        academic_competency: 0,
        learning_attitude: 0,
        career_competency: 0,
        career_exploration: 0,
        character: 0,
        leadership: 0
      }
    }
  }
  return {
    name: data.name.trim(),
    gpa_grade: Number(data.gpa_grade),
    record_scores: {
      academic_competency: Number(data.academic_competency),
      learning_attitude: Number(data.learning_attitude),
      career_competency: Number(data.career_competency),
      career_exploration: Number(data.career_exploration),
      character: Number(data.character),
      leadership: Number(data.leadership)
    }
  }
}

module.exports = { validateStudentInput, buildStudent, CATEGORIES }
