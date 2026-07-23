# ADR 0003: Control plane and provider baseline

Status: superseded on 2026-07-22 by [ADR 0009](0009-zero-cost-pilot-platform.md) after the owner rejected the paid baseline.

## Decision

- Build a modular Node/TypeScript control-plane service with a Next.js web application, one portable PostgreSQL schema, and a same-origin WebSocket endpoint. Keep business logic outside framework route handlers.
- Package the service as a standard OCI container. Do not depend on proprietary database APIs for authorization, retention, or realtime semantics.
- Prototype deployment baseline: Railway Pro for the continuously reachable application process, Neon Launch PostgreSQL, and Resend transactional email. Local development uses a local PostgreSQL container and console email.
- Keep storage, email, authentication, and realtime behind application interfaces so a provider can be replaced without changing tenant or identity boundaries.
- Do not create provider accounts or resources until the owner authorizes external systems and a child-data/privacy review confirms acceptable contracts and regions.

## Cost assumption, not a promise

As of 2026-07-22, budget approximately USD $35/month before usage overages: Railway Pro's $20 minimum and Neon's published typical $15 Launch workload. Resend's published free allowance is likely enough for one camp's instructor email, but production must not depend on a free tier remaining available. Add domain, observability, backup, and egress costs after measurement.

Railway Hobby is not the production baseline, and Vercel Hobby is excluded because it is described as personal/non-commercial. Neon Free is suitable for development only; its scale-to-zero and limited storage/restore window are not a classroom availability commitment.

## Rejection/exit criteria

Reject this provider set if persistent outbound Host connections are not reliable, data-processing terms/region are unsuitable for child data, recovery objectives cannot be met, or a measured one-camp workload materially exceeds the estimate.

## Evidence

- Railway pricing: <https://docs.railway.com/pricing>
- Neon pricing: <https://neon.com/pricing>
- Resend pricing: <https://resend.com/pricing>
- Vercel plan scope: <https://vercel.com/pricing>

## Supersession note

This comparison is retained as evidence of the rejected paid baseline. No Railway, Neon, or Resend resource was created from this decision. ADR 0009 replaces the deployment and authentication choices for the one-camp pilot while keeping standard PostgreSQL migrations and provider boundaries.
