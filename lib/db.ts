import type { JobCard, Settings } from "./types"

/**
 * IndexedDB, hand-rolled. This is the only copy of a technician's work until it
 * syncs, so it is deliberately plain: two stores, no migrations to get wrong,
 * no dependency that could change under us.
 *
 * localStorage would have been simpler still, but it is capped around 5MB and a
 * signature is tens of kilobytes — a week of cards would fill it.
 */
const DB_NAME = "lebombo-field"
const DB_VERSION = 1
const JOB_CARDS = "jobCards"
const SETTINGS = "settings"

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser has no offline storage"))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(JOB_CARDS)) {
        db.createObjectStore(JOB_CARDS, { keyPath: "localId" })
      }
      if (!db.objectStoreNames.contains(SETTINGS)) {
        db.createObjectStore(SETTINGS)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode)
        const request = run(transaction.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        transaction.onabort = () => reject(transaction.error)
      })
  )
}

/* ─────────────────────────────── Job cards ─────────────────────────────── */

export async function allJobCards(): Promise<JobCard[]> {
  const cards = await tx<JobCard[]>(JOB_CARDS, "readonly", (s) => s.getAll())
  // Newest first, by when the technician last touched it.
  return cards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getJobCard(localId: string): Promise<JobCard | undefined> {
  return tx<JobCard | undefined>(JOB_CARDS, "readonly", (s) => s.get(localId))
}

export async function putJobCard(card: JobCard): Promise<JobCard> {
  const next = { ...card, updatedAt: new Date().toISOString() }
  await tx(JOB_CARDS, "readwrite", (s) => s.put(next))
  return next
}

/** Write without touching updatedAt — used by sync, which is not an edit. */
export async function putJobCardRaw(card: JobCard): Promise<void> {
  await tx(JOB_CARDS, "readwrite", (s) => s.put(card))
}

export async function deleteJobCard(localId: string): Promise<void> {
  await tx(JOB_CARDS, "readwrite", (s) => s.delete(localId))
}

/* ──────────────────────────────── Settings ─────────────────────────────── */

const DEFAULT_SETTINGS: Settings = {
  technicianName: "",
  signature: null,
  deviceLabel: "",
  token: null,
  apiBase: (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, ""),
  clients: [],
  clientsFetchedAt: null,
  lastSyncAt: null,
  deviceRevoked: false,
}

export async function getSettings(): Promise<Settings> {
  const stored = await tx<Settings | undefined>(SETTINGS, "readonly", (s) => s.get("settings"))
  return {
    // Spread over the defaults so a field added in a later release is present
    // on a phone that was set up before it existed.
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    // The deployed origin always wins over the one saved at pairing. Without
    // this, the platform's URL is frozen into each phone the first time it
    // syncs, and moving the platform to a custom domain would strand every
    // phone already in the field with no way to fix it but a reinstall.
    apiBase: DEFAULT_SETTINGS.apiBase || stored?.apiBase || "",
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await tx(SETTINGS, "readwrite", (s) => s.put(next, "settings"))
  return next
}
