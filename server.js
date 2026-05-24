require('dotenv').config()
const express = require('express')
const path = require('path')
const fs = require('fs')
const multer = require('multer')
const { validateStudentInput, buildStudent } = require('./src/utils/validators')
const { matchAll, getUniversityList, searchUniversities } = require('./src/engine/matcher')
const dataManager = require('./src/data')
const { checkUniversityUrls } = require('./src/engine/scraper')
const { analyzePlan } = require('./src/engine/pdfAnalyzer')
const { analyzeCutoff } = require('./src/engine/cutoffAnalyzer')
const { analyzeFromImage, analyzeFromPdf, analyzeStudentRecord } = require('./src/engine/gradeAnalyzer')

process.on('uncaughtException', (err) => console.error('Uncaught:', err.message))
process.on('unhandledRejection', (err) => console.error('Unhandled:', err.message))

const app = express()
const PORT = process.env.PORT || 3000
const UPLOADS_DIR = path.join(__dirname, 'uploads')
const SAVED_DIR = path.join(__dirname, 'data', 'saved')

for (const dir of [UPLOADS_DIR, SAVED_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, req.params.univId + '-plan.pdf')
})
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const pdfMimes = ['application/pdf', 'application/x-pdf', 'application/acrobat', 'applications/vnd.pdf', 'text/pdf', 'text/x-pdf']
    if (pdfMimes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true)
    } else {
      cb(new Error('PDF 파일만 업로드 가능합니다.'), false)
    }
  }
})

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.static(path.join(__dirname, 'public')))
app.use('/uploads', express.static(UPLOADS_DIR))
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, 'record_' + Date.now() + path.extname(file.originalname))
})
const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    const extOk = /\.(jpe?g|png|webp)$/i.test(file.originalname)
    if (allowed.includes(file.mimetype) || extOk) {
      cb(null, true)
    } else {
      cb(new Error('JPG, PNG, WEBP 파일만 업로드 가능합니다.'), false)
    }
  }
})

app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(express.json({ limit: '10mb' }))

app.get('/', (req, res) => {
  const admissionType = req.query.type || '종합'
  const universities = getUniversityList(admissionType)
  res.render('index', {
    errors: [],
    data: null,
    universities,
    admissionType,
    activeTab: 'analyze'
  })
})

app.post('/analyze', (req, res) => {
  const errors = validateStudentInput(req.body)
  const admissionType = req.body.admission_type || '종합'

  if (errors.length > 0) {
    const universities = getUniversityList(admissionType)
    return res.render('index', {
      errors,
      data: req.body,
      admissionType,
      universities,
      activeTab: 'analyze'
    })
  }

  const student = buildStudent(req.body)
  let results = matchAll(student, admissionType)

  const deptQuery = (req.body.dept_query || '').trim().toLowerCase()
  if (deptQuery) {
    results = results.filter(r => r.department.toLowerCase().includes(deptQuery))
  }

  const highProb = results.filter(r => r.probability >= 70)
  const midProb = results.filter(r => r.probability >= 40 && r.probability < 70)
  const lowProb = results.filter(r => r.probability < 40)

  const resultData = { student, results, highProb, midProb, lowProb, totalUnivs: results.length, deptQuery, admissionType }

  res.render('result', { ...resultData, savedId: null })
})

app.get('/api/universities', (req, res) => {
  const query = req.query.q
  if (query) return res.json(searchUniversities(query))
  res.json(getUniversityList())
})

app.get('/admin', (req, res) => {
  const admissionType = req.query.type || '종합'
  const universities = getUniversityList(admissionType)
  res.render('admin', { universities, admissionType, activeTab: 'admin' })
})

app.get('/admin/:univId', (req, res) => {
  const univ = dataManager.getUniversity(req.params.univId)
  if (!univ) return res.redirect('/admin')
  const db = dataManager.getAll()
  const admissionType = req.query.type || '종합'
  res.render('admin_edit', {
    univ,
    gradeConversions: db.grade_conversions,
    defaultWeights: db.category_weights_default,
    admissionType,
    urlStatus: null,
    saved: false,
    activeTab: 'admin'
  })
})

app.post('/admin/:univId', (req, res) => {
  const univId = req.params.univId
  const existing = dataManager.getUniversity(univId)
  if (!existing) return res.redirect('/admin')

  const admissionType = req.body.admission_type || '종합'

  const dept = req.body.dept || {}
  const names = Array.isArray(dept.name) ? dept.name : (dept.name ? [dept.name] : [])
  const gpaWs = Array.isArray(dept.gpa_weight) ? dept.gpa_weight : (dept.gpa_weight ? [dept.gpa_weight] : [])
  const recordWs = Array.isArray(dept.record_weight) ? dept.record_weight : (dept.record_weight ? [dept.record_weight] : [])
  const cutoffs = Array.isArray(dept.cutoff_score) ? dept.cutoff_score : (dept.cutoff_score ? [dept.cutoff_score] : [])
  const types = Array.isArray(dept.admission_type) ? dept.admission_type : (dept.admission_type ? [dept.admission_type] : [])
  const noRecordsRaw = dept.no_record
  const noRecords = Array.isArray(noRecordsRaw) ? noRecordsRaw : (noRecordsRaw ? [noRecordsRaw] : [])

  const submittedDepartments = []
  for (let i = 0; i < names.length; i++) {
    const name = names[i] ? names[i].trim() : ''
    if (!name) continue
    const noRecord = noRecords[i] === '1' || noRecords[i] === true
    submittedDepartments.push({
      name,
      admission_type: types[i] || admissionType,
      gpa_weight: noRecord ? 1.0 : (parseFloat(gpaWs[i]) || 0.5),
      record_weight: noRecord ? 0.0 : (parseFloat(recordWs[i]) || 0.5),
      cutoff_score: parseFloat(cutoffs[i]) || 50,
      no_record: noRecord || undefined
    })
  }

  // Merge with existing departments of the other type
  const otherType = admissionType === '교과' ? '종합' : '교과'
  const otherDepts = (existing.departments || []).filter(d => d.admission_type === otherType)
  const mergedDepartments = [...submittedDepartments, ...otherDepts]

  const gradeConversion = req.body.grade_conversion || 'default'
  const admissionUrl = req.body.admission_url || ''
  const planUrl = req.body.plan_url || ''
  const cutoffUrl = req.body.cutoff_url || ''

  const categoryWeights = {}
  for (const key of ['academic_competency', 'learning_attitude', 'career_competency', 'career_exploration', 'character', 'leadership']) {
    const val = parseFloat(req.body['cw_' + key])
    if (!isNaN(val)) categoryWeights[key] = val
  }

  dataManager.saveUniversity(univId, {
    grade_conversion: gradeConversion,
    departments: mergedDepartments,
    admission_url: admissionUrl || undefined,
    plan_url: planUrl || undefined,
    cutoff_url: cutoffUrl || undefined,
    category_weights: Object.keys(categoryWeights).length ? categoryWeights : undefined
  })

  const updatedUniv = dataManager.getUniversity(univId)
  const db = dataManager.getAll()
  res.render('admin_edit', {
    univ: updatedUniv,
    gradeConversions: db.grade_conversions,
    defaultWeights: db.category_weights_default,
    admissionType,
    urlStatus: null,
    saved: true,
    activeTab: 'admin'
  })
})

app.post('/admin/:univId/save-urls', (req, res) => {
  const univId = req.params.univId
  const existing = dataManager.getUniversity(univId)
  if (!existing) return res.json({ success: false, error: '대학을 찾을 수 없습니다.' })

  dataManager.saveUniversity(univId, {
    admission_url: req.body.admission_url ? String(req.body.admission_url).trim() : undefined,
    plan_url: req.body.plan_url ? String(req.body.plan_url).trim() : undefined,
    cutoff_url: req.body.cutoff_url ? String(req.body.cutoff_url).trim() : undefined
  })

  res.json({ success: true })
})

app.post('/admin/:univId/save-guide', (req, res) => {
  const univId = req.params.univId
  const existing = dataManager.getUniversity(univId)
  if (!existing) return res.json({ success: false, error: '대학을 찾을 수 없습니다.' })
  dataManager.saveUniversity(univId, {
    admission_guide: req.body.admission_guide ? String(req.body.admission_guide).trim() : ''
  })
  res.json({ success: true })
})

app.post('/admin/:univId/reset', (req, res) => {
  dataManager.resetUniversity(req.params.univId)
  res.redirect('/admin/' + req.params.univId)
})

app.get('/admin/:univId/check-url', async (req, res) => {
  const univ = dataManager.getUniversity(req.params.univId)
  if (!univ) return res.json({ error: 'Not found' })
  const status = await checkUniversityUrls(univ)
  res.json(status)
})

app.post('/admin/:univId/upload-plan', (req, res, next) => {
  upload.single('plan_pdf')(req, res, function(err) {
    if (err) return res.json({ success: false, error: err.message })
    if (!req.file) return res.json({ success: false, error: 'PDF 파일만 업로드 가능합니다.' })
    res.json({ success: true, filename: req.file.filename })
  })
})

app.post('/admin/:univId/analyze-plan', async (req, res) => {
  const pdfPath = path.join(UPLOADS_DIR, req.params.univId + '-plan.pdf')
  if (!fs.existsSync(pdfPath)) return res.json({ success: false, error: '업로드된 PDF가 없습니다.' })
  const result = await analyzePlan(pdfPath)
  res.json(result)
})

const cutoffStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, req.params.univId + '-cutoff.xlsx')
})
const uploadCutoff = multer({
  storage: cutoffStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith('.xlsx') || file.originalname.toLowerCase().endsWith('.xls')
    cb(ok ? null : new Error('XLSX/XLS 파일만 업로드 가능합니다.'), ok)
  }
})

app.post('/admin/:univId/upload-cutoff', (req, res, next) => {
  uploadCutoff.single('cutoff_file')(req, res, function(err) {
    if (err) return res.json({ success: false, error: err.message })
    if (!req.file) return res.json({ success: false, error: '파일을 업로드해주세요.' })
    res.json({ success: true, filename: req.file.filename })
  })
})

app.post('/admin/:univId/analyze-cutoff', async (req, res) => {
  const cutoffPath = path.join(UPLOADS_DIR, req.params.univId + '-cutoff.xlsx')
  if (!fs.existsSync(cutoffPath)) return res.json({ success: false, error: '업로드된 입결 파일이 없습니다.' })

  const univ = dataManager.getUniversity(req.params.univId)
  if (!univ) return res.json({ success: false, error: '대학 정보를 찾을 수 없습니다.' })

  const result = await analyzeCutoff(cutoffPath, req.params.univId, univ.name, univ.departments)
  res.json(result)
})

app.post('/api/analyze-student-record', (req, res, next) => {
  uploadImage.single('student_record')(req, res, async function(err) {
    if (err) return res.json({ success: false, error: err.message })
    if (!req.file) return res.json({ success: false, error: '이미지 파일을 업로드해주세요.' })
    if (req.file.size < 100) {
      fs.unlink(req.file.path, () => {})
      return res.json({ success: false, error: '파일이 비어 있습니다.' })
    }

    try {
      const result = await analyzeFromImage(req.file.path)
      res.json({ success: true, ...result })
    } catch (e) {
      res.json({ success: false, error: e.message })
    }
  })
})

app.post('/api/analyze-student-text', async (req, res) => {
  try {
    const text = (req.body.text || '').trim()
    if (!text) return res.json({ success: false, error: '학생부 텍스트를 입력해주세요.' })
    if (text.length < 10) return res.json({ success: false, error: '텍스트가 너무 짧습니다 (최소 10자).' })

    const result = await analyzeStudentRecord(text)
    res.json({ success: true, ...result })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, 'record_pdf_' + Date.now() + '.pdf')
})
const uploadStudentPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')
    cb(ok ? null : new Error('PDF 파일만 업로드 가능합니다.'), ok)
  }
})

app.post('/api/analyze-student-pdf', (req, res, next) => {
  uploadStudentPdf.single('student_record_pdf')(req, res, async function(err) {
    if (err) return res.json({ success: false, error: err.message })
    if (!req.file) return res.json({ success: false, error: 'PDF 파일을 업로드해주세요.' })

    try {
      const result = await analyzeFromPdf(req.file.path)
      res.json({ success: true, ...result })
    } catch (e) {
      res.json({ success: false, error: e.message })
    }
  })
})

app.post('/api/save-result', (req, res) => {
  try {
    const { student, results, highProb, midProb, lowProb, totalUnivs, deptQuery } = req.body
    if (!student || !results) return res.json({ success: false, error: '저장할 데이터가 없습니다.' })

    const id = String(Date.now())
    const entry = { id, createdAt: new Date().toISOString(), student, results, highProb, midProb, lowProb, totalUnivs, deptQuery }
    fs.writeFileSync(path.join(SAVED_DIR, id + '.json'), JSON.stringify(entry, null, 2), 'utf8')
    res.json({ success: true, id })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

app.get('/saved', (req, res) => {
  const files = fs.readdirSync(SAVED_DIR).filter(f => f.endsWith('.json')).sort().reverse()
  const list = files.map(f => {
    const d = JSON.parse(fs.readFileSync(path.join(SAVED_DIR, f), 'utf8'))
    return { id: d.id, name: d.student.name, createdAt: d.createdAt, totalUnivs: d.totalUnivs, deptQuery: d.deptQuery }
  })
  res.render('saved', { list, activeTab: 'saved' })
})

app.get('/saved/:id', (req, res) => {
  const filePath = path.join(SAVED_DIR, req.params.id + '.json')
  if (!fs.existsSync(filePath)) return res.redirect('/saved')
  const d = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  res.render('result', { ...d, savedId: d.id })
})

app.listen(PORT, () => {
  console.log(`Univ_Pass 서버가 http://localhost:${PORT} 에서 실행 중입니다.`)
})
