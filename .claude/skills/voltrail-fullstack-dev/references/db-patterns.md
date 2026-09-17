# Database Query Patterns for VolTrail

## Connection

```typescript
import { getRawSql } from '@/lib/db';
const sql = getRawSql();
```

## INSERT Pattern
```typescript
import { randomUUID } from 'crypto';
const id = randomUUID();
await sql`
  INSERT INTO passports (id, tenant_id, passport_id, product_uid, status, created_at, updated_at)
  VALUES (${id}, ${tenantId}::uuid, ${passportId}, ${productUid}, 'draft', NOW(), NOW())
`;
// Use the known values directly — don't try to .returning()
```

## SELECT Pattern
```typescript
const rows = await sql`
  SELECT id, tenant_id, email, role, status
  FROM users
  WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT ${limit} OFFSET ${offset}
` as Record<string, unknown>[];
```

## UPDATE Pattern
```typescript
await sql`
  UPDATE passports
  SET status = ${newStatus}, updated_at = NOW()
  WHERE id = ${passportId}::uuid AND tenant_id = ${tenantId}::uuid
`;
// If you need the updated row, SELECT it back:
const [updated] = await sql`SELECT * FROM passports WHERE id = ${id}::uuid` as Record<string, unknown>[];
```

## DELETE Pattern (soft delete)
```typescript
await sql`
  UPDATE passports SET deleted_at = NOW() WHERE id = ${id}::uuid
`;
```

## COUNT Pattern
```typescript
const [countRow] = await sql`
  SELECT COUNT(*)::int AS count FROM passports
  WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
` as Record<string, unknown>[];
const total = (countRow?.count as number) ?? 0;
```

## JSONB Pattern
```typescript
const payload = JSON.stringify(data);
await sql`
  INSERT INTO passport_versions (id, passport_id, version, payload, data_hash, created_at)
  VALUES (${id}, ${passportId}::uuid, ${version}, ${payload}::jsonb, ${dataHash}, NOW())
`;
```

## UUID Casting
Always cast UUID parameters with `::uuid`:
```typescript
WHERE id = ${id}::uuid           // ✓
WHERE id = ${id}                 // ✗ May fail silently
WHERE tenant_id = ${tid}::uuid  // ✓
```

## Anti-Patterns to AVOID

```typescript
// NEVER use Drizzle .returning() — returns empty array on Neon HTTP
const [row] = await db.insert(table).values({}).returning();  // ✗

// NEVER use Drizzle .update().returning()
const [row] = await db.update(table).set({}).where().returning();  // ✗

// NEVER filter data_requests by deleted_at — table has no such column
WHERE deleted_at IS NULL  // ✗ on data_requests table

// NEVER use deprecated rawSql proxy
import { rawSql } from '@/lib/db';  // ✗ Use getRawSql() instead
```

## Tables WITHOUT deleted_at column
- `data_requests` — no soft delete
- `passport_versions` — versions are immutable
- `audit_events` — events are immutable
- `notifications` — no soft delete
