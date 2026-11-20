import { report, type Filters } from '../domain/analytics'
import { total } from '../domain/calories'
import { habits, meals, metrics, percent, type Journal } from '../domain/journal'

type Cell = string | number | null
type Matrix = Cell[][]
// XML 1.0 excludes these control characters from spreadsheet cells.
// eslint-disable-next-line no-control-regex
const esc = (value: Cell) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export function download(blob: Blob, filename: string) {
  const anchor = document.createElement('a')
  const url = URL.createObjectURL(blob)
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function sheet(matrix: Matrix) {
  return '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    matrix.map(row => '<row>' + row.map(value => typeof value === 'number'
      ? '<c><v>' + value + '</v></c>'
      : '<c t="inlineStr"><is><t xml:space="preserve">' + esc(value) + '</t></is></c>').join('') + '</row>').join('') +
    '</sheetData></worksheet>'
}

function zip(files: Record<string, string>) {
  const output: Uint8Array<ArrayBuffer>[] = []
  const directory: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  const littleEndian = (value: number, size: number) => Array.from({ length: size }, (_, index) => (value >>> (8 * index)) & 255)
  const encoder = new TextEncoder()
  for (const [name, text] of Object.entries(files)) {
    const filename = encoder.encode(name)
    const bytes = encoder.encode(text)
    let crc = -1
    for (const byte of bytes) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
    const shared = [20, 0, 0, 0, 0, 0, 0, 0, 33, 0, ...littleEndian(~crc, 4),
      ...littleEndian(bytes.length, 4), ...littleEndian(bytes.length, 4), ...littleEndian(filename.length, 2), 0, 0]
    const header = Uint8Array.from([80, 75, 3, 4, ...shared, ...filename])
    output.push(header, bytes)
    directory.push(Uint8Array.from([80, 75, 1, 2, 20, 0, ...shared, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...littleEndian(offset, 4), ...filename]))
    offset += header.length + bytes.length
  }
  const directoryLength = directory.reduce((size, bytes) => size + bytes.length, 0)
  const end = Uint8Array.from([80, 75, 5, 6, 0, 0, 0, 0, ...littleEndian(directory.length, 2),
    ...littleEndian(directory.length, 2), ...littleEndian(directoryLength, 4), ...littleEndian(offset, 4), 0, 0])
  return new Blob([...output, ...directory, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function workbook(journal: Journal, filters: Filters) {
  const { rows, values } = report(journal, filters)
  const headings = ['Date', ...habits, ...meals, ...metrics, 'Notes', 'Habit %', 'Logged calories (kcal)', 'Calorie breakdown']
  const entries: Matrix = [headings, ...rows.map(([day, entry]): Cell[] => {
    const calories = total(entry.cal)
    return [day, ...entry.h.map(done => done ? 'Yes' : 'No'), ...entry.f, ...entry.m, entry.notes,
      Math.round(percent(entry)), calories === null ? '' : Math.round(calories),
      (entry.cal ?? []).map(item => item.meal + ': ' + item.name + ' × ' + item.qty + ' = ' + Math.round(item.qty * item.rate) + ' kcal').join('; ')]
  })]
  const summary: Matrix = [['Period', 'Logged days', 'Average habit %', 'Strength days', 'Average logged kcal'],
    ...values.map(value => [value.key, value.count, Math.round(value.habit), value.strength, value.calories === null ? '' : Math.round(value.calories)])]
  return zip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Journal" sheetId="1" r:id="rId1"/><sheet name="Summary" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet(entries),
    'xl/worksheets/sheet2.xml': sheet(summary),
  })
}
