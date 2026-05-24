const https = require('https')
const http = require('http')

function fetchUrl(url, timeout = 8000, redirects = 5) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && redirects > 0 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href
        resolve(fetchUrl(redirectUrl, timeout, redirects - 1))
        return
      }
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        const titleMatch = data.match(/<title>([^<]*)<\/title>/i)
        resolve({
          success: true,
          status: res.statusCode,
          title: titleMatch ? titleMatch[1].trim() : 'N/A',
          bodyLength: data.length
        })
      })
    })
    req.on('error', (err) => {
      resolve({ success: false, status: 0, title: err.message, bodyLength: 0 })
    })
    req.on('timeout', () => {
      req.destroy()
      resolve({ success: false, status: 0, title: 'Timeout', bodyLength: 0 })
    })
  })
}

async function checkUniversityUrls(univ) {
  const results = {}
  if (univ.admission_url) {
    results.admission_url = await fetchUrl(univ.admission_url)
  }
  if (univ.plan_url) {
    results.plan_url = await fetchUrl(univ.plan_url)
  }
  if (univ.cutoff_url) {
    results.cutoff_url = await fetchUrl(univ.cutoff_url)
  }
  return results
}

module.exports = { fetchUrl, checkUniversityUrls }
