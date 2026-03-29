// lib/ai.ts
// Two Claude calls per post:
// 1. anonymise()   — strip all PII, keep only factual content
// 2. categorise()  — detect entity, category, scope, generate subject

import Anthropic from '@anthropic-ai/sdk'
import { ENTITIES, CATEGORIES, type EntityId, type CategoryId } from './entities'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── TYPES ────────────────────────────────────────────────────

export interface ProcessedPost {
  subject:            string
  anonymisedContent:  string
  entityId:           EntityId | null   // null = development-wide / unclear
  category:           CategoryId
  scope:              'entity' | 'all'
  confidence:         number            // 0-1, for logging
}

// ── ANONYMISE ────────────────────────────────────────────────

export async function anonymiseContent(raw: string): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are a privacy filter for a residential building notice board in Berlin.

Your task: rewrite the following email or message so that:
- ALL personal names are removed (residents, staff, managers, anyone)
- ALL email addresses are removed
- ALL phone numbers are removed  
- ALL specific flat/apartment numbers are removed
- ALL personal account details are removed
- The factual, building-relevant information is fully preserved
- The meaning and usefulness of the message is unchanged
- Write in the same language as the original (German or English)
- Do NOT add any preamble — return ONLY the cleaned text

Original message:
---
${raw}
---`
    }]
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from anonymise')
  return content.text.trim()
}

// ── CATEGORISE ───────────────────────────────────────────────

export async function categorisePost(
  anonymisedContent: string,
  subject?: string
): Promise<Omit<ProcessedPost, 'anonymisedContent'>> {

  const entityList = ENTITIES.map(e => `- ${e.id}: "${e.label}"`).join('\n')
  const categoryList = CATEGORIES.map(c => `- ${c.id}: ${c.label}`).join('\n')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You are classifying a post for a residential building notice board in Berlin.

The development "Marthashof" consists of 5 separate entities:
${entityList}

Available categories:
${categoryList}

Analyse the following post and return ONLY a JSON object with these exact fields:
{
  "subject": "a short German subject line (max 8 words, no personal info)",
  "entityId": "one of the entity IDs above, or null if it applies to the whole development",
  "category": "one of the category IDs above",
  "scope": "entity" or "all" (all = affects multiple or all entities),
  "confidence": 0.0-1.0
}

Post content:
---
${subject ? `Subject: ${subject}\n\n` : ''}${anonymisedContent}
---

Return ONLY the JSON object, no other text.`
    }]
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from categorise')

  try {
    const parsed = JSON.parse(content.text.trim())
    return {
      subject:    parsed.subject    ?? 'Neue Mitteilung',
      entityId:   parsed.entityId   ?? null,
      category:   parsed.category   ?? 'general',
      scope:      parsed.scope      ?? 'entity',
      confidence: parsed.confidence ?? 0.5,
    }
  } catch {
    return {
      subject:    subject ?? 'Neue Mitteilung',
      entityId:   null,
      category:   'general',
      scope:      'entity',
      confidence: 0.3,
    }
  }
}

// ── PROCESS (both steps together) ────────────────────────────

export async function processIncomingPost(
  rawContent: string,
  rawSubject?: string
): Promise<ProcessedPost> {
  const [anonymisedContent, classification] = await Promise.all([
    anonymiseContent(rawContent),
    categorisePost(rawContent, rawSubject), // categorise from original for better signal
  ])

  return {
    ...classification,
    anonymisedContent,
  }
}
