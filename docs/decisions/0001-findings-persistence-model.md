# ADR 0001 - Findings Persistence Model

## Status

Accepted

## Context

The MVP currently persists jobs and reports in local JSON files under `.driftlyzer/`.
This is enough for bootstrap, but not enough for query-heavy workflows:

- dashboard pagination/filtering
- finding history by fingerprint
- PR-level analytics and publication audit
- future multi-tenant operation

## Decision

Adopt a relational persistence model defined in `infra/database/schema.sql` with these core entities:

- `scan_jobs`
- `repository_scans`
- `scan_artifacts`
- `scan_relations`
- `scan_findings`
- `finding_related_artifacts`
- `pull_request_comments`

### Contract Mapping

`scan_findings` stores stable contract v1 fields directly:

- `finding_id`
- `schema_version`
- `rule_version`
- `fingerprint`
- score breakdown columns
- semantic review fields

### Why relational now

- deterministic joins from finding -> artifacts -> relations
- fast filtering by severity/type/publishable
- compatibility with SQLite (local), Postgres (cloud), Turso/libSQL
- straightforward migration path from file-based persistence

## Consequences

Positive:

- dashboard can fetch focused queries without loading full report blobs
- historical trend analysis per fingerprint becomes straightforward
- PR publication audit becomes first-class

Tradeoffs:

- migration logic from JSON to DB is required
- write path becomes multi-table transaction

## Follow-up

1. Add repository adapter (`FilePersistenceAdapter` and `SqlPersistenceAdapter`) behind one interface.
2. Introduce migrations and versioned schema evolution.
3. Move API feed endpoints to query SQL instead of JSON files.
