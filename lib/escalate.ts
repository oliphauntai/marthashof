// lib/escalate.ts
// Called after every vote. Checks if threshold crossed, sends email if so.

import { sql } from './db'
import { ESCALATION, ENTITIES, CATEGORIES } from './entities'

export async function checkAndEscalate(postId: string): Promise<void> {
  // Get current vote count and post details
  const [post] = await sql`
    SELECT
      p.id,
      p.subject,
      p.anonymised_content,
      p.entity_id,
      p.category,
      p.escalated_at,
      p.escalation_level,
      p.published_at,
      COUNT(v.id)::int AS vote_count
    FROM posts p
    LEFT JOIN votes v ON v.post_id = p.id
    WHERE p.id = ${postId}
    AND p.status = 'published'
    GROUP BY p.id
  `

  if (!post) return

  const votes = post.vote_count as number
  const currentLevel = post.escalation_level as number

  // Determine if we need to escalate
  const shouldEscalateLevel1 = votes >= ESCALATION.thresholdPrimary && currentLevel < 1
  const shouldEscalateLevel2 = votes >= ESCALATION.thresholdCC && currentLevel < 2

  if (!shouldEscalateLevel1 && !shouldEscalateLevel2) return

  const level = shouldEscalateLevel2 ? 2 : 1
  const entity = ENTITIES.find(e => e.id === post.entity_id)
  const category = CATEGORIES.find(c => c.id === post.category)

  await sendEscalationEmail({
    postId: post.id as string,
    subject: post.subject as string,
    content: post.anonymised_content as string,
    entityLabel: entity?.label ?? 'Marthashof (alle Gebäude)',
    categoryLabel: category?.label ?? 'Allgemein',
    voteCount: votes,
    level,
  })

  // Update post escalation level
  await sql`
    UPDATE posts
    SET escalation_level = ${level}, escalated_at = now()
    WHERE id = ${postId}
  `

  // Log escalation
  await sql`
    INSERT INTO escalations (post_id, vote_count, escalation_level, recipient_email, cc_email)
    VALUES (
      ${postId},
      ${votes},
      ${level},
      ${ESCALATION.primary.email},
      ${level >= 2 ? ESCALATION.cc.email : null}
    )
  `
}

// ── EMAIL ────────────────────────────────────────────────────

interface EscalationEmailParams {
  postId:        string
  subject:       string
  content:       string
  entityLabel:   string
  categoryLabel: string
  voteCount:     number
  level:         number
}

async function sendEscalationEmail(params: EscalationEmailParams) {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const emailBody = `
Sehr geehrter Herr Czerwonka,

${params.voteCount} Bewohner/innen der Anlage Marthashof haben ein gemeinsames Anliegen markiert, das Ihre Aufmerksamkeit benötigt.

─────────────────────────────────────
Bereich:    ${params.entityLabel}
Kategorie:  ${params.categoryLabel}
Betreff:    ${params.subject}
Stimmen:    ${params.voteCount}
─────────────────────────────────────

${params.content}

─────────────────────────────────────

Sie können den Status dieses Anliegens unter folgendem Link aktualisieren:
${appUrl}/api/status/${params.postId}?token=${process.env.ADMIN_SECRET}

Mögliche Statusangaben: Bestätigt | In Bearbeitung | Erledigt

Mit freundlichen Grüßen
Marthashof Informationsportal
  `.trim()

  await resend.emails.send({
    from:    'Marthashof Portal <noreply@marthashof.app>',
    to:      ESCALATION.primary.email,
    cc:      params.level >= 2 ? ESCALATION.cc.email : undefined,
    subject: `[Marthashof] ${params.voteCount} Stimmen: ${params.subject}`,
    text:    emailBody,
  })
}
