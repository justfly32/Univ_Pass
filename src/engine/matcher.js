const dataManager = require('../data')
const { analyze } = require('./calculator')

function matchAll(student, admissionType) {
  const db = dataManager.getAll()
  const results = []

  for (const univ of db.universities) {
    const depts = admissionType
      ? univ.departments.filter(d => d.admission_type === admissionType)
      : univ.departments
    for (const dept of depts) {
      const result = analyze(student, univ.id, dept.name, admissionType)
      if (result) {
        result.admissionType = dept.admission_type
        result.cutoffRaw = dept.cutoff_grade || dept.cutoff_score
        result.cutoffIsGrade = !!dept.cutoff_is_grade
        result.noRecord = !!dept.no_record
        results.push(result)
      }
    }
  }

  results.sort((a, b) => {
    if (b.probability !== a.probability) return b.probability - a.probability
    return b.totalScore - a.totalScore
  })

  return results
}

function searchUniversities(query) {
  const db = dataManager.getAll()
  return db.universities.filter(u =>
    u.name.includes(query) || u.id.includes(query.toLowerCase()) || u.region.includes(query)
  ).map(u => ({
    id: u.id,
    name: u.name,
    type: u.type,
    region: u.region,
    admission_url: u.admission_url,
    plan_url: u.plan_url,
    cutoff_url: u.cutoff_url,
    departments: u.departments.map(d => d.name)
  }))
}

function getUniversityList(admissionType) {
  const db = dataManager.getAll()
  return db.universities.map(u => {
    const depts = admissionType
      ? u.departments.filter(d => d.admission_type === admissionType)
      : u.departments
    return {
      id: u.id,
      name: u.name,
      type: u.type,
      region: u.region,
      admission_url: u.admission_url,
      plan_url: u.plan_url,
      cutoff_url: u.cutoff_url,
      departmentCount: depts.length,
      departments: depts.map(d => d.name),
      교과Count: u.departments.filter(d => d.admission_type === '교과').length,
      종합Count: u.departments.filter(d => d.admission_type === '종합').length,
    }
  })
}

module.exports = { matchAll, searchUniversities, getUniversityList }
