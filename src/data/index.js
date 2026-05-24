const fs = require('fs')
const path = require('path')

const BASE_PATH = path.join(__dirname, 'universities.json')
const OVERRIDES_PATH = path.join(__dirname, 'user_overrides.json')

let cache = null

function loadBase() {
  return JSON.parse(fs.readFileSync(BASE_PATH, 'utf-8'))
}

function loadOverrides() {
  try {
    if (fs.existsSync(OVERRIDES_PATH)) {
      return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8'))
    }
  } catch (e) {}
  return { universities: [] }
}

function invalidateCache() {
  cache = null
}

function getAll() {
  if (cache) return cache
  const base = loadBase()
  const overrides = loadOverrides()

  for (const ov of overrides.universities) {
    const idx = base.universities.findIndex(u => u.id === ov.id)
    if (idx >= 0) {
      base.universities[idx] = { ...base.universities[idx], ...ov }
      if (ov.departments) base.universities[idx].departments = ov.departments
    } else {
      base.universities.push(ov)
    }
  }

  cache = base
  return cache
}

function getUniversity(univId) {
  return getAll().universities.find(u => u.id === univId) || null
}

function saveUniversity(univId, data) {
  invalidateCache()
  const overrides = loadOverrides()
  const idx = overrides.universities.findIndex(u => u.id === univId)
  const existing = idx >= 0 ? { ...overrides.universities[idx] } : { id: univId }
  if (data.grade_conversion !== undefined) existing.grade_conversion = data.grade_conversion
  if (data.departments !== undefined && data.departments.length > 0) existing.departments = data.departments
  if (data.admission_url !== undefined) existing.admission_url = data.admission_url
  if (data.plan_url !== undefined) existing.plan_url = data.plan_url
  if (data.cutoff_url !== undefined) existing.cutoff_url = data.cutoff_url
  if (data.category_weights !== undefined) existing.category_weights = data.category_weights
  if (data.admission_guide !== undefined) existing.admission_guide = data.admission_guide
  if (idx >= 0) {
    overrides.universities[idx] = existing
  } else {
    overrides.universities.push(existing)
  }
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2), 'utf-8')
  return true
}

function resetUniversity(univId) {
  invalidateCache()
  const overrides = loadOverrides()
  overrides.universities = overrides.universities.filter(u => u.id !== univId)
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2), 'utf-8')
  return true
}

module.exports = { getAll, getUniversity, saveUniversity, resetUniversity }
