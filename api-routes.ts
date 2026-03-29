// This file is reference only — split into separate files as we build each feature
// See comments above each section for the file path

// ══════════════════════════════════════════════════════════════
// app/api/posts/route.ts
// GET /api/posts — public board feed
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const entity   = searchParams.get('entity')
  const category = searchParams.get('category')
  const limit    = Math.min(Number(searchParams.get('limit') ?? 50), 100)
  const offset   = Number(searchParams.get('offset') ?? 0)

  const rows = await sql`
    SELECT
      id,
      published_at,
      subject,
      anonymised_content AS content,
      entity_id,
      category,
      scope,
      vote_count,
      escalation_level,
      escalated_at
    FROM posts_with_votes
    WHERE
      (${entity}::text   IS NULL OR entity_id = ${entity}   OR scope = 'all')
      AND
      (${category}::text IS NULL OR category  = ${category})
    ORDER BY published_at DESC
    LIMIT  ${limit}
    OFFSET ${offset}
  `

  return NextResponse.json({ posts: rows })
}