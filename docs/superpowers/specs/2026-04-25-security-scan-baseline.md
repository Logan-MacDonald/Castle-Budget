# Security Scan Baseline (S7)

**Date:** 2026-04-25
**Branch:** `impl/port-and-hardening`
**Parent spec:** `2026-04-22-security-scanning-addendum.md`
**Purpose:** Severity breakdown per local-runnable scanner, to drive S8 triage.

CI-only scanners (CodeQL, ZAP) are not represented here; their first baseline lands on the first push of `.github/workflows/security.yml` (S6).

## Summary

| Tool   | Critical | High | Medium | Low | Info | Total |
|--------|---------:|-----:|-------:|----:|-----:|------:|
| Trivy (vulns)      | 2 | 8 | 3  | 1 | – | 14 |
| Trivy (misconfigs) | 0 | 2 | 0  | 2 | – | 4  |
| KICS               | 0 | 2 | 14 | 2 | 1 | 19 |
| ESLint             | – | – | –  | – | – | 12 warnings (0 errors) |

Merge bar (per addendum) is **0 critical / 0 high**. Current gap: **2 critical + 12 high** across Trivy + KICS.

## Trivy — vulnerabilities (14)

All in npm `package-lock.json`. Production deps only (dev deps suppressed).

### Critical (2)
| CVE | Package | Installed | Fixed in |
|-----|---------|-----------|----------|
| CVE-2026-34950 | fast-jwt | 4.0.5 | 6.2.0 |
| CVE-2026-35039 | fast-jwt | 4.0.5 | 6.2.0 |

### High (8)
| CVE | Package | Installed | Fixed in |
|-----|---------|-----------|----------|
| CVE-2026-35042 | fast-jwt | 4.0.5 | — (no fix) |
| CVE-2026-25223 | fastify | 4.29.1 | 5.7.2 |
| CVE-2026-23745 | tar | 6.2.1 | 7.5.3 |
| CVE-2026-23950 | tar | 6.2.1 | 7.5.4 |
| CVE-2026-24842 | tar | 6.2.1 | 7.5.7 |
| CVE-2026-26960 | tar | 6.2.1 | 7.5.8 |
| CVE-2026-29786 | tar | 6.2.1 | 7.5.10 |
| CVE-2026-31802 | tar | 6.2.1 | 7.5.11 |

### Medium (3) / Low (1)
- MEDIUM CVE-2025-30144 fast-jwt → 5.0.6
- MEDIUM CVE-2026-35040 fast-jwt → 6.2.1
- MEDIUM CVE-2026-3635 fastify → 5.8.3
- LOW CVE-2026-25224 fastify → 5.7.3

**Likely fix path:** bump `fast-jwt` to ≥6.2.1, `fastify` to ≥5.8.3 (major bump — check breaking changes), `tar` to ≥7.5.11 (likely transitive — `npm ls tar`). One unfixed HIGH on fast-jwt (CVE-2026-35042) needs a separate decision (mitigate, accept with rationale, or wait for upstream).

## Trivy — misconfigurations (4)

| Severity | Rule | File |
|----------|------|------|
| HIGH | DS-0002 Image user should not be 'root' | packages/api/Dockerfile |
| HIGH | DS-0002 Image user should not be 'root' | packages/web/Dockerfile |
| LOW  | DS-0026 No HEALTHCHECK defined | packages/api/Dockerfile |
| LOW  | DS-0026 No HEALTHCHECK defined | packages/web/Dockerfile |

## KICS (19)

| Severity | Rule | Files |
|----------|------|------:|
| HIGH   | Missing User Instruction | 2 |
| MEDIUM | Container Capabilities Unrestricted | 4 |
| MEDIUM | Security Opt Not Set | 4 |
| MEDIUM | Healthcheck Not Set | 3 |
| MEDIUM | Container Traffic Not Bound To Host Interface | 1 |
| MEDIUM | Privileged Ports Mapped In Container | 1 |
| MEDIUM | Unpinned Package Version in Apk Add | 1 |
| LOW    | Healthcheck Instruction Missing | 2 |
| INFO   | Shared Volumes Between Containers | 1 |

### Cross-tool overlap (important)
Trivy DS-0002 (HIGH × 2) and KICS "Missing User Instruction" (HIGH × 2) flag **the same two Dockerfiles**. Adding `USER` directives to `packages/api/Dockerfile` and `packages/web/Dockerfile` resolves 4 HIGH findings.

Trivy DS-0026 (LOW × 2), KICS "Healthcheck Instruction Missing" (LOW × 2), and KICS "Healthcheck Not Set" (MEDIUM × 3) overlap similarly — `HEALTHCHECK` in Dockerfiles + healthcheck in compose addresses both.

## ESLint (12 warnings, 0 errors)

`max-warnings=0` causes the script to exit 1.

**packages/api (1):**
- `src/routes/auth.test.ts:11` — unused `digest` var

**packages/web (11):**
- `src/pages/BillsPage.tsx:52` — unused `fifthBills`
- `src/pages/DashboardPage.tsx:4` — 6 unused recharts imports (AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer)
- `src/pages/DebtPage.tsx:3` — unused `Legend`
- `src/pages/DebtPage.tsx:33` — react-hooks/exhaustive-deps (missing `load`)
- `src/pages/IncomePage.tsx:180` — react-hooks/exhaustive-deps (missing `loadUsers`)
- `src/pages/SavingsPage.tsx:3` — unused `Target`

All are deletion or `_` prefix fixes except the two react-hooks warnings, which require deciding whether to include the dep, memoize the callback, or suppress with a justification comment.

## Triage plan (S8)

Suggested order, smallest blast radius first:

1. **ESLint cleanup** — delete unused imports/vars; resolve react-hooks warnings on a case-by-case basis. Removes the entire 12-warning baseline.
2. **Dockerfile USER + HEALTHCHECK** — closes 4 HIGH (Trivy DS-0002 ×2, KICS Missing User ×2) and 4 LOW + 3 MEDIUM healthcheck findings in one pass.
3. **npm dependency bumps** — `fast-jwt` ≥6.2.1, `fastify` ≥5.8.3, force-resolve `tar` ≥7.5.11. Closes 2 CRITICAL + 7 HIGH + 3 MEDIUM + 1 LOW.
4. **fast-jwt CVE-2026-35042 (unfixed HIGH)** — assess exploitability for our auth flow; mitigate or document acceptance in `.trivyignore`.
5. **KICS MEDIUM (compose hardening)** — capabilities drop, security_opt no-new-privileges, host-interface bind. These are a related set and worth bundling.
6. **KICS INFO + remaining LOW** — accept with rationale where appropriate.

After steps 1–4 the merge bar is met (0 critical / 0 high). Steps 5–6 address the medium-tier "chainability" review the addendum calls for.
