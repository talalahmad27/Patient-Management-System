# Design Document — Patient Record System

## Overview

A multi-tenant web application that enables doctors to manage patient records,
log visit notes, and track patient health measurements over time.

Each practice is fully isolated — a doctor can only access patients belonging
to their own practice. Authentication and authorisation are enforced at every
layer of the stack.

---

## Problem Statement

Doctors need a simple, structured way to:
- Register and manage patients under their practice
- Record clinical measurements at each visit (weight, blood pressure, etc.)
- Write and retrieve visit notes in chronological order
- View the full history of a patient across all past visits

---

## Goals (v1)

- A doctor can log in securely and access only their practice's patients
- A doctor can create a patient record with demographics and measurements
- A doctor can write a note against a patient visit
- A doctor can view the full history of a patient — all past visits, measurements, and notes
- An admin staff member can manage the practice and staff accounts
- No file attachments in v1 (placeholder column exists for future use)

## Non-Goals (v1)

- No billing or Medicare integration
- No file / pathology report uploads
- No multi-doctor shared notes
- No patient-facing portal
- No mobile app

---

## Users

| Role    | What they can do |
|---------|-----------------|
| Doctor  | View and manage patients, write notes, view history |
| Admin   | Manage practice details and staff accounts |

---

## Key Design Decisions

### Multi-tenancy via Practice isolation
Every record in the database is scoped to a `practice_id`. A doctor cannot
query patients from another practice — enforced at the API level via OpenFGA
relationship checks, and at the database level via practice_id on every table.

### SCD Type 2 for patient records
Patient demographics and measurements change over time. Rather than overwriting
rows, we use Slowly Changing Dimension Type 2 — each visit creates a new
versioned row with `effective_from` / `effective_to` timestamps. This gives us
a complete immutable history of how a patient's measurements changed over time.

### Notes in a separate table
Visit notes reference the exact patient version (`patient_dim_id`) they were
written against. This means the history view can reconstruct the full picture
for any past visit — measurements + note — without any ambiguity.

### Auth0 for identity, OpenFGA for authorisation
Auth0 handles login, password management, and JWT issuance. OpenFGA handles
fine-grained access control — checking whether a specific doctor is permitted
to read or write a specific patient. These are two separate concerns and are
kept separate by design.

### Repository pattern
All database queries live in repository files. Route handlers never contain
raw SQL. This keeps the codebase maintainable and makes testing straightforward.

### No ORM
Raw SQL via a pg connection pool. PostgreSQL-specific features (SCD2 patterns,
JSONB, partial indexes) are used directly. An ORM would abstract these away
and add unnecessary complexity.

### Soft deletes only
Medical records are never hard deleted. `is_deleted = true` on notes and
`is_current = false` on patient versions are the only deletion mechanisms.
This is both a compliance requirement and a safety net.

---

## Tech Stack

| Layer         | Choice              | Reason |
|---------------|---------------------|--------|
| Frontend      | Next.js (React)     | SSR, file-based routing, excellent Auth0 integration |
| Backend       | Node.js + Express   | Lightweight, large ecosystem, easy to structure |
| Database      | PostgreSQL 16       | Relational integrity, JSONB support, partial indexes |
| Auth identity | Auth0               | Managed login, JWT, MFA, password reset out of the box |
| Auth access   | OpenFGA             | Fine-grained relationship-based access control |
| Local infra   | Docker              | Postgres runs in a container — matches production exactly |
| Hosting (BE)  | AWS ECS             | Container-based, HIPAA-eligible, scales well |
| Hosting (FE)  | Vercel              | Zero-config Next.js deployment |
| Database host | AWS RDS             | Managed PostgreSQL, automated backups, encryption at rest |
| CI/CD         | GitHub Actions      | Push to main → auto deploy |

---

## Future Considerations (post v1)

- SOAP-structured notes (Subjective / Objective / Assessment / Plan)
- Pathology and imaging file attachments (S3 already placeholder)
- Medicare billing integration (provider numbers already stored)
- Multi-doctor practices with shared patient access
- Patient transfer between practices
- Referral letter generation from note content
- Full-text search across notes
