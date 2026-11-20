import { aliases } from './foods'
import { meals, type Food } from './journal'

export function total(items: readonly Food[] = []): number | null {
  return items.length ? items.reduce((sum, item) => sum + item.qty * item.rate, 0) : null
}
export function estimateCalories(journal: readonly string[]) {
  const items: Food[] = []
  const warnings: string[] = []
  meals.forEach((meal, index) => {
    const parts = (journal[index] ?? '').trim().split(/\s*(?:\+|,|;|\band\b|\bwith\b|\n)\s*/i)
    for (const part of parts) {
      if (!part.trim()) continue
      const matches = aliases.flatMap(([expression, rate, name, unit]) =>
        [...part.matchAll(expression)].map(match => ({
          at: match.index, end: match.index + match[0].length, rate, name, unit,
        }))).sort((a, b) => a.at - b.at || b.end - a.end)
      const accepted: typeof matches = []
      for (const match of matches) {
        if (!accepted.some(extra => match.at < extra.end && match.end > extra.at)) accepted.push(match)
      }
      if (!accepted.length) {
        warnings.push(meal + ': unknown food — ' + part)
        continue
      }
      accepted.forEach(({ at, end, name, rate, unit }, i) => {
        const before = part.slice(accepted[i - 1]?.end ?? 0, at)
        const after = part.slice(end, accepted[i + 1]?.at ?? part.length)
        const prefix = before.match(/(\d+(?:\.\d+)?)\s*(?:pieces?|pcs?|g|grams?|ml|tbsp)?\s*$/i)
        const suffix = after.match(/^\s*\(?\s*(\d+(?:\.\d+)?)\s*(g|grams?|ml|tbsp|pieces?|pcs?)\b/i)
        const amount = suffix ? Number(suffix[1]) : prefix ? Number(prefix[1]) : null
        const units = suffix?.[2] || prefix?.[0].match(/\b(g|grams?|ml|tbsp)\b/i)?.[1]
        let qty = 1
        if (/shawaya/i.test(name) && /quarter|1\/4/i.test(before)) {
          qty = 1.5
          warnings.push(meal + ': quarter shawaya assumed 150 g edible meat')
        } else if (amount === null) {
          warnings.push(meal + ': ' + name + ' assumed 1 ' + unit)
        } else if (unit === 'piece' || unit === 'tbsp') {
          qty = amount
        } else if (units && /g|ml/i.test(units)) {
          qty = amount / parseInt(unit)
        } else {
          qty = amount
          warnings.push(meal + ': ' + name + ' assumed ' + qty + ' × ' + unit)
        }
        items.push({ meal, name: name + ' (' + unit + ')', qty, rate })
      })
    }
  })
  return { items, warnings }
}
