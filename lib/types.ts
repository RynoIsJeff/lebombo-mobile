/** One trip to site. A job that runs over several days has one of these per day. */
export interface Visit {
  /** "2026-09-08" — a calendar day, not an instant. */
  visitDate: string
  /** "10:00" as written on the card. */
  timeIn: string
  timeOut: string
}

export interface Material {
  description: string
  quantity: number
}

/**
 * Where a job card is in its life.
 *
 * `draft`   — still being worked on. Lives on this phone only, and has no
 *             number: a job that is not finished is not a job card yet.
 * `queued`  — finished and signed off, waiting for signal.
 * `syncing` — currently being sent.
 * `synced`  — accepted by the platform, which assigned `jobCardNumber`.
 * `failed`  — the platform rejected it. Stays on the phone with the reason so
 *             the technician can fix it rather than losing the work.
 */
export type JobCardStatus = "draft" | "queued" | "syncing" | "synced" | "failed"

export interface JobCard {
  /** Minted here, before the card has ever seen the network. Keeps sync idempotent. */
  localId: string
  status: JobCardStatus

  /** Assigned by the platform on sync. Null until then — that is the point. */
  jobCardNumber: string | null

  orderNumber: string
  /** Null when the technician typed a store that is not on the cached list. */
  clientId: string | null
  storeName: string
  unitNumber: string

  visits: Visit[]
  /** Lines of the "Job Description" column. */
  items: string[]
  materials: Material[]
  notes: string

  managerName: string
  /** PNG data URL drawn on the phone by whoever signed the job off. */
  managerSignature: string | null

  createdAt: string
  updatedAt: string
  /** Set when the technician marks it complete — the moment it became a card. */
  capturedAt: string | null

  /** Why the last sync attempt failed, shown on the card. */
  syncError: string | null
}

/** A store, cached so the picker works with no signal. */
export interface CachedClient {
  id: string
  name: string
  groupName: string | null
}

/** Everything about this phone's setup. One row, key "settings". */
export interface Settings {
  technicianName: string
  /** PNG data URL drawn once at setup, stamped on every card. */
  signature: string | null
  deviceLabel: string
  /** Bearer token from pairing. Its presence is what "set up" means. */
  token: string | null
  /** Where the platform lives. Baked in at build time, overridable for testing. */
  apiBase: string
  clients: CachedClient[]
  clientsFetchedAt: string | null
  lastSyncAt: string | null
}

export function emptyJobCard(localId: string, today: string): JobCard {
  return {
    localId,
    status: "draft",
    jobCardNumber: null,
    orderNumber: "",
    clientId: null,
    storeName: "",
    unitNumber: "",
    visits: [{ visitDate: today, timeIn: "", timeOut: "" }],
    items: [""],
    materials: [],
    notes: "",
    managerName: "",
    managerSignature: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    capturedAt: null,
    syncError: null,
  }
}
