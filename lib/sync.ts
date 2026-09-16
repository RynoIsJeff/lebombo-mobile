import { allJobCards, getSettings, putJobCardRaw, saveSettings } from "./db"
import type { CachedClient, JobCard, Settings } from "./types"

export interface SyncResult {
  sent: number
  failed: number
  /** Not an error the technician did anything about — there was just no signal. */
  offline: boolean
  error?: string
}

/**
 * Cards per request. Small enough that a connection dying mid-upload costs one
 * batch rather than a fortnight of work — signatures make these payloads far
 * from small.
 */
const BATCH_SIZE = 10

/** Only fully signed-off cards go up. Drafts stay here until they are finished. */
export function isReadyToSync(card: JobCard): boolean {
  return card.status === "queued" || card.status === "failed"
}

function payload(card: JobCard) {
  return {
    clientUuid: card.localId,
    orderNumber: card.orderNumber || null,
    clientId: card.clientId,
    storeName: card.storeName.trim(),
    unitNumber: card.unitNumber || null,
    notes: card.notes || null,
    managerName: card.managerName || null,
    managerSignature: card.managerSignature,
    capturedAt: card.capturedAt ?? card.updatedAt,
    visits: card.visits.map((v) => ({
      visitDate: v.visitDate,
      timeIn: v.timeIn || null,
      timeOut: v.timeOut || null,
    })),
    items: card.items.map((i) => i.trim()).filter(Boolean),
    materials: card.materials
      .filter((m) => m.description.trim())
      .map((m) => ({ description: m.description.trim(), quantity: m.quantity || 1 })),
  }
}

/** What happened to one batch. `abort` stops the run — the rest would fail too. */
interface BatchOutcome {
  sent: number
  failed: number
  abort?: { offline: boolean; error?: string }
}

async function sendBatch(batch: JobCard[], settings: Settings): Promise<BatchOutcome> {
  // Mark in flight so the UI stops offering "send" for these.
  for (const card of batch) {
    await putJobCardRaw({ ...card, status: "syncing", syncError: null })
  }

  const revert = async (error: string | null) => {
    for (const card of batch) {
      await putJobCardRaw({ ...card, status: "queued", syncError: error })
    }
  }

  let response: Response
  try {
    response = await fetch(`${settings.apiBase}/api/mobile/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.token}`,
      },
      body: JSON.stringify({ jobCards: batch.map(payload) }),
    })
  } catch {
    await revert(null) // No signal is not the technician's problem to read about.
    return { sent: 0, failed: 0, abort: { offline: true } }
  }

  if (response.status === 401) {
    await revert("This phone is no longer authorised")
    return {
      sent: 0,
      failed: 0,
      abort: {
        offline: false,
        error: "This phone is no longer authorised. Set it up again.",
      },
    }
  }

  if (!response.ok) {
    const message = await response
      .json()
      .then((d: any) => d?.error)
      .catch(() => null)
    await revert(message ?? "The office could not accept these job cards")
    return { sent: 0, failed: 0, abort: { offline: false, error: message ?? "Sync failed" } }
  }

  const data = (await response.json()) as {
    results: Array<{
      clientUuid: string
      status: "created" | "duplicate" | "failed"
      jobCardNumber?: string
      error?: string
    }>
  }

  let sent = 0
  let failed = 0
  const byId = new Map(batch.map((c) => [c.localId, c]))

  for (const result of data.results ?? []) {
    const card = byId.get(result.clientUuid)
    if (!card) continue

    if (result.status === "created" || result.status === "duplicate") {
      // A duplicate means an earlier attempt did land and we never heard back.
      // Same outcome: take the number the platform holds.
      sent++
      await putJobCardRaw({
        ...card,
        status: "synced",
        jobCardNumber: result.jobCardNumber ?? null,
        syncError: null,
      })
    } else {
      failed++
      await putJobCardRaw({
        ...card,
        status: "failed",
        syncError: result.error ?? "The office could not accept this job card",
      })
    }
    byId.delete(result.clientUuid)
  }

  // Anything the platform did not mention stays queued and goes again next time.
  for (const card of Array.from(byId.values())) {
    await putJobCardRaw({ ...card, status: "queued" })
  }

  return { sent, failed }
}

/**
 * Push every finished card to the platform.
 *
 * Works through the whole backlog a batch at a time, which matters after a week
 * out of coverage — one tap should clear the phone, not the first ten cards.
 *
 * Nothing is deleted locally on success: the card stays, now carrying the number
 * it was given, so the technician can still show a customer what they logged
 * last week. Cards the office rejects keep their place and retry, so a dropped
 * connection halfway through costs nothing.
 */
export async function syncNow(): Promise<SyncResult> {
  const settings = await getSettings()
  if (!settings.token || !settings.apiBase) {
    return { sent: 0, failed: 0, offline: false, error: "This phone is not set up yet" }
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { sent: 0, failed: 0, offline: true }
  }

  let sent = 0
  let failed = 0
  // Cards already tried this run. A rejected card stays "ready", so without
  // this the loop would hand the office the same bad card forever.
  const attempted = new Set<string>()

  while (true) {
    const batch = (await allJobCards())
      .filter((c) => isReadyToSync(c) && !attempted.has(c.localId))
      .slice(0, BATCH_SIZE)
    if (batch.length === 0) break

    batch.forEach((c) => attempted.add(c.localId))

    const outcome = await sendBatch(batch, settings)
    sent += outcome.sent
    failed += outcome.failed

    if (outcome.abort) {
      return { sent, failed, offline: outcome.abort.offline, error: outcome.abort.error }
    }
  }

  await refreshClients().catch(() => {})
  await saveSettings({ lastSyncAt: new Date().toISOString() })

  return { sent, failed, offline: false }
}

/** Pull the store list down so the picker keeps working out of signal. */
export async function refreshClients(): Promise<CachedClient[] | null> {
  const settings = await getSettings()
  if (!settings.token || !settings.apiBase) return null

  const response = await fetch(`${settings.apiBase}/api/mobile/bootstrap`, {
    headers: { Authorization: `Bearer ${settings.token}` },
    cache: "no-store",
  })
  if (!response.ok) return null

  const data = (await response.json()) as {
    clients: CachedClient[]
    technicianName?: string
  }
  if (!Array.isArray(data.clients)) return null

  await saveSettings({
    clients: data.clients,
    clientsFetchedAt: new Date().toISOString(),
  })
  return data.clients
}
