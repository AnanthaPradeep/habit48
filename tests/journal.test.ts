import { describe, expect, it, vi } from 'vitest'
import { report, type Filters } from '../src/domain/analytics'
import { estimateCalories, total } from '../src/domain/calories'
import { blankEntry, challengeCount, isJournal, keys, monday, readJournal, shift, validDate, type Journal } from '../src/domain/journal'
import { mergeJournal } from '../src/services/cloud'
import { workbook } from '../src/services/exports'

const range: Filters = { from: '2024-02-01', to: '2024-03-31', period: 'daily', metric: 'cal' }
const entry = (notes: string) => ({ ...blankEntry(), notes })
const data = (entries: Journal['entries'] = {}): Journal => ({ start: '2024-02-28', target: 2, entries })

describe('existing journal storage and challenge rules', () => {
  it('retains current keys, date-indexed data and entries without calorie records', () => {
    const old = entry('older record')
    delete old.cal
    const current = data({ '2024-02-29': old })
    expect(readJournal({ getItem: key => key === keys.journal ? JSON.stringify(current) : null })).toEqual(current)
    expect(isJournal(current)).toBe(true)
    expect(keys).toEqual({ journal: 'myroutine-v1', legacy: 'habit48', beforeMerge: 'routine-before-merge',
      pending: 'routine-pending', session: 'routine-session', theme: 'routine-theme' })
  })
  it('recovers the original 48-day ordinal format across leap day', () => {
    const legacy = { start: '2024-02-28', entries: { 1: entry('one'), 3: entry('three') } }
    const result = readJournal({ getItem: key => key === keys.legacy ? JSON.stringify(legacy) : null })
    expect(result.target).toBe(48)
    expect(Object.keys(result.entries)).toEqual(['2024-02-28', '2024-03-01'])
    expect(shift('2024-03-01', -1)).toBe('2024-02-29')
    expect(monday('2024-03-03')).toBe('2024-02-26')
  })
  it('counts only entries within the inclusive challenge window and rejects invalid imports', () => {
    const journal = data({ '2024-02-27': entry('before'), '2024-02-28': entry('first'),
      '2024-02-29': entry('last'), '2024-03-01': entry('after') })
    expect(challengeCount(journal)).toBe(2)
    expect(challengeCount({ ...journal, target: 0 })).toBe(3)
    expect(validDate('2025-02-29')).toBe(false)
    expect(isJournal({ ...journal, entries: [] })).toBe(false)
    expect(isJournal({ ...journal, target: -1 })).toBe(false)
  })
})

describe('calorie parsing', () => {
  it('matches specific overlapping aliases, portions and calorie rates', () => {
    const { items, warnings } = estimateCalories(['4 idiyappam + 1 egg curry', 'rice (100 g)', '2 fried momos', 'quarter shawaya'])
    expect(items.map(item => item.qty * item.rate)).toEqual([300, 150, 130, 160, 330])
    expect(total(items)).toBe(1070)
    expect(warnings).toEqual(['Dinner: quarter shawaya assumed 150 g edible meat'])
  })
  it('flags unknown foods and assumes one portion for recognized foods without a quantity', () => {
    const { items, warnings } = estimateCalories(['idli and soup'])
    expect(total(items)).toBe(60)
    expect(warnings).toEqual(['Breakfast: Idli assumed 1 piece', 'Breakfast: unknown food — soup'])
    expect(total([])).toBeNull()
    expect(total([{ meal: 'Drinks', name: 'Water', qty: 1, rate: 0 }])).toBe(0)
  })
})

describe('reporting and exports', () => {
  const first = { ...entry('A < B & C'), h: [true, true, true, false, false, false, false, false, false],
    m: ['1.5', '30', '', null, '10'], cal: estimateCalories(['2 idli']).items }
  const second = { ...entry('Second'), m: ['', '0', '', '', '0'] }
  const journal = data({ '2024-02-29': first, '2024-03-01': second, '2024-04-01': second })
  it('groups by day, Monday or month and treats blank and zero metrics distinctly', () => {
    expect(report(journal, range).values.map(item => item.value)).toEqual([120, null])
    expect(report(journal, { ...range, period: 'weekly', metric: '1' }).values).toMatchObject([
      { key: '2024-02-26', value: 15, count: 2, strength: 1, calories: 120 },
    ])
    expect(report(journal, { ...range, period: 'monthly' }).values.map(item => item.key)).toEqual(['2024-02', '2024-03'])
  })
  it('exports both Excel sheets using the filtered date range and escaped text', async () => {
    const blob = workbook(journal, range)
    const bytes = Buffer.from(await blob.arrayBuffer())
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50)
    expect(bytes.toString()).toContain('Journal')
    expect(bytes.toString()).toContain('Summary')
    expect(bytes.toString()).toContain('A &lt; B &amp; C')
    expect(bytes.toString()).not.toContain('2024-04-01')
  })
})

describe('Supabase merge contract', () => {
  const base = data({ '2024-02-29': entry('base') })
  const local = data({ '2024-02-29': entry('local'), '2024-03-02': entry('local-only') })
  const cloud = data({ '2024-02-29': entry('cloud'), '2024-03-01': entry('cloud-only') })
  it('offers the original conflict choice and keeps independent edits from both sides', () => {
    const chooseCloud = vi.fn(() => false)
    const result = mergeJournal(local, cloud, base, chooseCloud)
    expect(chooseCloud).toHaveBeenCalledOnce()
    expect(chooseCloud).toHaveBeenCalledWith('Both devices changed 2024-02-29. Keep this device version?')
    expect(result.entries).toEqual({ ...cloud.entries, '2024-03-02': entry('local-only') })
  })
  it('keeps local challenge changes with a base and leaves source objects intact', () => {
    const chooseLocal = vi.fn(() => true)
    const result = mergeJournal({ ...local, target: 48 }, cloud, base, chooseLocal)
    expect(result.entries['2024-02-29'].notes).toBe('local')
    expect(result.target).toBe(48)
    expect(cloud.entries['2024-02-29'].notes).toBe('cloud')
  })
})
