# Security Scanning — Addendum to Port & Hardening Design

**Date:** 2026-04-22
**Parent spec:** `2026-04-20-castle-budget-port-and-hardening-design.md`
**Status:** Approved for planning

## Context

After completing the port-and-hardening implementation work (tasks T01–T24 on branch `impl/port-and-hardening`) but before merging to `main` and pushing, the project scope was extended to include a security scanning pipeline. The original spec explicitly placed "GitHub Actions CI" in out-of-scope; this addendum brings back a narrower, security-focused CI plus local tooling, and gates the merge-to-main on passing scans.

## Scope added

Five scanners, with a dev-fast / CI-complete split:

| Tool             | Class                  | Local | CI  | Notes                                                       |
|------------------|------------------------|-------|-----|-------------------------------------------------------------|
| ESLint           | Lint (SAST-lite)       | ✅    | ✅  | TS + React rules, both workspaces                          |
| Trivy            | SCA + container scan   | ✅    | ✅  | `fs` + built image scans; `.trivyignore` for accepted vulns |
| Checkmarx KICS   | IaC (Docker, compose)  | ✅    | ✅  | Dockerfiles, docker-compose, nginx.conf                    |
| CodeQL           | SAST                   | ❌    | ✅  | GitHub-Actions only; no practical local run                 |
| OWASP ZAP        | DAST                   | opt.  | ✅  | Baseline scan against compose stack; full/active deferred   |

The dev loop:
- `npm run scan` runs ESLint + Trivy + KICS locally (fast; no stack needed).
- On push and PR to `main`, GitHub Actions runs all five (including CodeQL + ZAP against an ephemeral compose stack).

## Triage policy

Findings are tiered. Default action per severity:

- **Critical / High** → fix immediately, block merge.
- **Medium** → reviewed case-by-case. Considered as a set — chainability risk grows with count. If the collective medium footprint enables privilege escalation or data exposure chains, fix; otherwise document in an accept file.
- **Low / Info** → accept by default, document if the volume is meaningful.

Accepted findings are recorded with a rationale:
- Trivy: `.trivyignore` with comments referencing the CVE and why.
- KICS: `.kics-ignore` or `--include-queries`/`--exclude-queries` config.
- CodeQL: `.github/codeql/config.yml` with query-level excludes.
- ESLint: `// eslint-disable-next-line <rule>` with adjacent reason comment.

No blanket `--ignore-unfixed` or silent suppression. Every accept has a paper trail.

## Execution order

Tracked as tasks S1–S8:

- **S1 (this doc):** Addendum written and committed.
- **S2:** ESLint configs + dependencies + scripts.
- **S3:** Trivy wrapper script + empty `.trivyignore` skeleton.
- **S4:** KICS wrapper script (Docker-based).
- **S5:** `npm run scan` aggregator.
- **S6:** GitHub Actions `.github/workflows/security.yml` with all five scanners.
- **S7:** Baseline scan run; produce severity breakdown per tool.
- **S8:** Triage + fix findings iteratively until merge bar is met.

S7's output determines the shape of S8. The user reviews severity breakdown before deciding fix scope (especially for medium-tier findings, where chainability is the key concern).

## Acceptance criteria

Before merging `impl/port-and-hardening` to `main`:

- `npm run scan` passes locally with zero critical/high findings.
- `.github/workflows/security.yml` exists and triggers on `push` + `pull_request` to `main`.
- Every accepted finding (of any severity retained) has a documented rationale in its tool-specific accept file.
- Medium-severity findings reviewed for chainability; documented accepts or fixes landed.
- CodeQL and ZAP findings from first CI run are triaged and fixed or accepted before second push attempt to main.

## Risks

- **Transitive npm dependency vulns** — deps like `bcrypt`, `prisma`, `fastify` may have transitive vulns with no clean fix at the time we scan. Policy says document + accept with clear rationale, re-review periodically.
- **ZAP false positives** — baseline scans can flag cookie attributes, header presence, etc. that are acceptable for a LAN-only app. These go to an accept list with LAN-context rationale.
- **CodeQL secret scans** — the seed.ts test passwords and JWT/cookie secret placeholders in `.env.example` may trigger. These are not real secrets; accept with rationale.
- **CI runtime cost** — full scan suite in GH Actions is ~15 min per run. Acceptable for a project with low commit volume; reconsider if dev pace grows.

## Out of scope

- Snyk, Semgrep, Bandit, or other scanners not named in the original user request.
- Active/full ZAP scans (only baseline for now).
- Runtime WAF / IDS (out of scope for a 2-user LAN app).
- Secrets scanning of git history (project is only days old; low value).
- SBOM generation (may revisit later).
