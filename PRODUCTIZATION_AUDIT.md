# Rethink Core v0.1 Productization Audit

Audit date: 2026-07-18. “Production-capable” below means verified for its stated boundary, not generally ready for unrestricted multi-user use.

## 1. True production-capable features

Within a single-browser, single-project-session boundary: deterministic Demo Mode; strict state/schema validation; visible guided routing; canonical state reduction; evidence/assumption links; version checkpoints; human gates and overrides; portable JSON export/import; project-ID context checks; health endpoint; static/API serving; and failure-without-mutation behavior are implemented and automated-tested.

The complete public application is not yet production-ready for open multi-user use.

## 2. Prototype-quality areas

General live route quality, OIP/CDIL/OAMPES depth, threshold calibration, the module ecosystem, device-local storage, and the single-active-project UI remain prototype quality. The UI is polished for Guided Mode but has no accounts, collaboration, accessibility audit, analytics, or operational admin surface.

## 3. What still depends on Demo Mode

The reproducible reviewer walkthrough and offline/no-key fallback depend on deterministic Demo Mode. Demo Mode demonstrates contracts and continuity but does not perform public research or general reasoning across arbitrary domains.

## 4. What requires an OpenAI API key

Live STM/routing, live method execution, and OpenAI hosted web search require a server-side `OPENAI_API_KEY`, network access, and API quota. Project management, manual state edits, import/export, Lab Notebook inspection, and Demo Mode do not.

## 5. Current persistence guarantee

The active session survives page reloads and application/server restarts in the same browser profile and deployment origin while that origin's `localStorage` remains intact. A versioned project backup provides manual portability. Notebook export provides a focused audit artifact.

## 6. Project isolation

Every project has an ID. Routes and cycles must echo it; foreign IDs fail validation. Prompts contain only the active project's original input and structured state. Unidentified legacy notebook entries are quarantined from reasoning. Import restores one project and never silently merges another. Regression tests cover contamination terms from the sample project.

## 7. Survival across application restarts

Yes, on the same browser profile and origin. State lives in browser storage, independent of the Node process.

## 8. Survival across redeployment

Usually, if the public origin remains identical and the browser preserves site data. This is not guaranteed by the application. An origin change, storage clearing, browser policy, private-session cleanup, or device loss can remove it. The server/container stores no user project data.

## 9. Backups

The UI exports a versioned complete-project JSON backup and a separate Lab Notebook JSON. Project import validates the format/version and state, preserves project identity, and records the import. Backups are manual, unencrypted files; there is no scheduled backup service or remote restore system.

## 10. Public deployability

Yes for a controlled demonstration. The repository includes a Node production command, Docker image definition, Render Blueprint, `/api/health`, graceful shutdown, production binding, baseline security headers, and environment-variable configuration. No public deployment was created during this audit, so public reachability is not yet verified.

## 11. Recommended deployment path

Use the included Docker/Render path for Build Week because it preserves the current single-origin Node architecture with minimal platform-specific code. Add `OPENAI_API_KEY` as a host secret, use a restricted/revocable key and spending controls, and run the release checklist against the deployed URL.

## 12. Remaining security risks

No authentication, authorization, server-side rate limiting, WAF policy, abuse detection, centralized logs, dependency/image scanning workflow, secrets rotation workflow, data encryption for exported JSON, privacy policy, or formal threat model. Any visitor to a public Live deployment can consume the configured API budget. Browser storage is readable by code running on the same origin; XSS defenses are important even with the current CSP.

## 13. Requirements for public multi-user use

Accounts and session security; tenant/project ownership enforcement; server-side durable storage; row-level authorization; migrations; encryption; backups and restore tests; delete/export workflows; rate limits and quotas; abuse controls; observability; incident response; privacy/retention policies; CSRF/CORS review if the architecture splits origins; load testing; accessibility and browser coverage; and formal security review.

## 14. Modules addable without rewriting Core

Trusted build-time modules implementing the common contract can be registered without editing PEC state, STM priority mechanics, evidence linkage, Lab Notebook reduction, or dispositions. DEFINE, VALIDATE, STRESS_TEST, ROOT_CAUSE, MEASURE, PRIORITIZE, SIMPLIFY, OPTIMIZE, TEST, CAPTURE, DECIDE, OIP, CDIL, and OAMPES use that contract. Dynamic third-party installation is future work, not a current capability.

Domain products such as CHOICE remain outside Core unless an explicit compatible module invokes them.

## 15. Before the Build Week deadline

Required remaining release work:

1. configure a funded/restricted OpenAI key in a non-local environment;
2. run one real Live route and one required public-research cycle, checking structured output and citations;
3. deploy the exact repository to the controlled public URL;
4. run Demo, state-edit, export/import, reload, health, mobile, and console checks on that URL;
5. record the URL and actual results in the submission material;
6. produce the demo video from the same deployed product.

Automated test and local smoke coverage are green. A paid Live API call and real public-host acceptance are the two material unverified boundaries.
