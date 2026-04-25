# Security Findings — Documented Accepts (S8)

**Date:** 2026-04-25
**Branch:** `impl/port-and-hardening`
**Parent specs:**
- `2026-04-22-security-scanning-addendum.md` (triage policy)
- `2026-04-25-security-scan-baseline.md` (S7 baseline)

The addendum requires a paper trail for every retained finding. This file
documents the post-S8 set: items intentionally not fixed, with rationale.
The merge bar (0 critical / 0 high) is met by other means; everything
listed here is MEDIUM or below.

## KICS

| Severity | Query ID | Rule | Files | Decision |
|----------|----------|------|-------|----------|
| MEDIUM | `ce76b7d0-9e77-464d-b86f-c5c48e03e22d` | Container Capabilities Unrestricted | postgres, nginx (edge) | accept |
| MEDIUM | `451d79dc-0588-476a-ad03-3c7f0320abb3` | Container Traffic Not Bound To Host Interface | nginx (edge) | accept |
| MEDIUM | `bc2908f3-f73c-40a9-8793-c1b7d5544f79` | Privileged Ports Mapped In Container | nginx (edge) | accept |
| MEDIUM | `d3499f6d-1651-41bb-a9a7-de925fea487b` | Unpinned Package Version in Apk Add | packages/api/Dockerfile | accept |
| LOW | `aa93e17f-b6db-4162-9334-c70334e7ac28` | Chown Flag Exists | packages/api/Dockerfile | accept |
| INFO | `8c978947-0ff6-485c-b0c2-0bfca6026466` | Shared Volumes Between Containers | docker-compose.yml | accept |

### Rationale

**Container Capabilities Unrestricted (MEDIUM × 2)** —
All four services run with `cap_drop: [ALL]`. Postgres and the edge nginx
need a small `cap_add` set for legitimate startup work (postgres' root
entrypoint chowns the data dir then setuid()s to the postgres user; nginx
master forks workers and binds port 80). KICS flags any non-empty
`cap_add` as "unrestricted." The added caps are the minimum set required
for the image to function and are far below the default capability set
that would apply without `cap_drop: [ALL]`.

**Container Traffic Not Bound To Host Interface (MEDIUM × 1)** —
The edge nginx exposes `80:80`, which compose binds to `0.0.0.0:80`.
This is intentional: the app is a LAN-only home budgeting tool meant to
be reachable from the household's devices via `http://budget.home`. A
loopback-only bind would defeat the purpose. Network reachability is
controlled at the LAN/router level, not by docker port binding.

**Privileged Ports Mapped In Container (MEDIUM × 1)** —
Edge nginx listens on port 80 because it is the de-facto port for HTTP
on the LAN. The container drops all caps and re-adds only
`NET_BIND_SERVICE` (plus chown/setuid/setgid for nginx's master→worker
handoff). This is the standard hardened pattern for a public-facing
nginx; the alternative (8080+) would require LAN clients to type a port
number, with no security gain.

**Unpinned Package Version in Apk Add (MEDIUM × 1)** —
`packages/api/Dockerfile` runs `apk add --no-cache openssl` without
pinning to `openssl=<version>-rN`. Pinning to an alpine-package-revision
breaks the build on every alpine package bump and provides no
reproducibility benefit beyond the alpine base-image tag we already pin
(`node:20-alpine` resolves to a digest at build time). A future move to
`node:20-alpine@sha256:...` would lock the entire OS layer including
openssl, making a per-package pin redundant.

**Chown Flag Exists (LOW × 5)** —
The api Dockerfile uses `COPY --chown=node:node` to set ownership during
the copy. KICS prefers `COPY` followed by `RUN chown`. The `--chown`
form produces a single layer and is the docker-recommended pattern; the
`RUN chown` alternative would add a layer and double the image's
file-content size on disk (because the rewritten files form a new layer
that doesn't dedupe with the original). Functionally equivalent.

**Shared Volumes Between Containers (INFO × 1)** —
Reported because the `pg_data` named volume is referenced from the
postgres service. This is the standard pattern for persistent postgres
storage; no other service mounts it. KICS warns about the *capability*
to share, not actual sharing.

## Trivy

| Severity | ID | Where | Decision |
|----------|-----|-------|----------|
| MEDIUM | CVE-2026-4367 (libxpm) | nginxinc/nginx-unprivileged:alpine base | accept until base image updates |

**libxpm CVE-2026-4367 (MEDIUM × 1)** —
The web container's base is `nginxinc/nginx-unprivileged:alpine`, which
bundles alpine 3.23.4 with `libxpm 3.5.17-r0`. The fix is in
`libxpm 3.5.19-r0`, expected in alpine 3.23.5 / a later
`nginxinc/nginx-unprivileged:alpine` rebuild. We don't use any code
path that exercises libxpm (nginx serves static SPA files; no XPM image
processing). Re-check on next image rebuild.

## Review schedule

- Re-evaluate each entry on every dependency / base-image bump.
- Treat the table as authoritative: if a finding stops appearing in a
  scan it should be removed from this doc; if a new MEDIUM/LOW appears
  it must either be fixed or added here with rationale.
