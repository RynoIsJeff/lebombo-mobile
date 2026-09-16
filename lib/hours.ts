import type { Visit } from "./types"

/**
 * Hours between two "HH:MM" clock readings, or null if either is unusable.
 *
 * This mirrors `labourHours` in the platform (lib/job-card-shared.ts) so the
 * hours a technician sees on the phone are the hours the office bills. If one
 * changes, change both.
 */
export function visitHours(timeIn?: string | null, timeOut?: string | null): number | null {
  const toMinutes = (v?: string | null) => {
    const m = v?.trim().match(/^(\d{1,2})[:h.]?(\d{2})$/)
    if (!m) return null
    const h = Number(m[1])
    const min = Number(m[2])
    if (h > 23 || min > 59) return null
    return h * 60 + min
  }

  const start = toMinutes(timeIn)
  const end = toMinutes(timeOut)
  if (start === null || end === null) return null

  // A card that runs past midnight reads as "22:00" to "01:00".
  const minutes = end >= start ? end - start : end + 24 * 60 - start
  if (minutes === 0) return null
  return Math.round((minutes / 60) * 100) / 100
}

/** Total hours across every trip to site. */
export function totalHours(visits: Visit[]): number | null {
  const hours = visits
    .map((v) => visitHours(v.timeIn, v.timeOut))
    .filter((h): h is number => h !== null)
  if (hours.length === 0) return null
  return Math.round(hours.reduce((sum, h) => sum + h, 0) * 100) / 100
}

/** Today as "2026-09-16", in the phone's own timezone — not UTC. */
export function todayISO(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}
