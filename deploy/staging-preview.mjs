// Servidor de preview staging: estáticos de dist-staging + proxy /api → :3101
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const root = '/opt/icemm-staging/frontend/dist-staging'
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' }
http.createServer((req, res) => {
  if (req.url.startsWith('/api')) {
    const p = http.request({ host: '127.0.0.1', port: 3101, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
    p.on('error', () => { res.writeHead(502); res.end() }); return req.pipe(p)
  }
  let f = path.join(root, path.normalize(decodeURIComponent(req.url.split('?')[0])))
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html')
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res)
}).listen(4177, '127.0.0.1', () => console.log('preview :4177'))
