import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const files = [
  'index.html', 'manifest.webmanifest', 'brand/logo.svg',
  ...readdirSync('dist/icons').sort().map(name => 'icons/' + name),
  ...readdirSync('dist/assets').sort().map(name => 'assets/' + name),
]
const template = readFileSync('scripts/worker-template.js', 'utf8')
const hash = createHash('sha256').update(template)
for (const file of files) hash.update(file).update(readFileSync('dist/' + file))
const version = 'habit48-react-' + hash.digest('hex').slice(0, 16)
writeFileSync('dist/sw.js', template.replace("'__CACHE__'", JSON.stringify(version))
  .replace('/* __ASSETS__ */ []', JSON.stringify(files, null, 2)))
