// lib/entities.ts
// Single source of truth for all entities in the Marthashof development.
// Used in DB queries, AI prompts, UI filters, and email routing.

export const ENTITIES = [
  { id: 'schwedter-40',  label: 'Schwedter Str. 40', short: 'S40' },
  { id: 'schwedter-37',  label: 'Schwedter Str. 37', short: 'S37' },
  { id: 'marthashof-bg', label: 'Marthashof B–G',    short: 'B–G' },
  { id: 'marthashof-ho', label: 'Marthashof H–O',    short: 'H–O' },
  { id: 'marthashof-p',  label: 'Marthashof P',      short: 'P'   },
] as const

export type EntityId = typeof ENTITIES[number]['id']

export const ENTITY_IDS = ENTITIES.map(e => e.id)

export function getEntity(id: string) {
  return ENTITIES.find(e => e.id === id)
}

// ── CATEGORIES ───────────────────────────────────────────────
export const CATEGORIES = [
  { id: 'repairs',  label: 'Reparaturen',  icon: '🔧' },
  { id: 'heating',  label: 'Heizung',      icon: '🌡' },
  { id: 'water',    label: 'Wasser',       icon: '💧' },
  { id: 'post',     label: 'Post & Pakete',icon: '📬' },
  { id: 'admin',    label: 'Verwaltung',   icon: '📋' },
  { id: 'noise',    label: 'Lärm',         icon: '🔊' },
  { id: 'entry',    label: 'Zugang & Schlüssel', icon: '🔑' },
  { id: 'general',  label: 'Allgemein',    icon: '📌' },
] as const

export type CategoryId = typeof CATEGORIES[number]['id']

// ── ESCALATION CONFIG ─────────────────────────────────────────
export const ESCALATION = {
  thresholdPrimary: Number(process.env.ESCALATION_THRESHOLD_PRIMARY ?? 8),
  thresholdCC:      Number(process.env.ESCALATION_THRESHOLD_CC ?? 20),
  primary: {
    email: process.env.ESCALATION_PRIMARY_EMAIL!,
    name:  process.env.ESCALATION_PRIMARY_NAME!,
  },
  cc: {
    email: process.env.ESCALATION_CC_EMAIL!,
    name:  process.env.ESCALATION_CC_NAME!,
  },
}
