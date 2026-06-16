<!--
Sync Impact Report
==================
Version change: (none) → 1.0.0
Rationale: Initial ratification. No prior constitution existed; this is a net-new
governing document derived from the current codebase and workflows, so it is
seeded as MAJOR version 1.0.0 per semantic versioning conventions for first releases.

Modified principles: N/A (initial creation)

Added sections:
- Core Principles (I-V): Type Safety, Process Isolation & IPC Security,
  Local-First & Offline-Capable, Cross-Platform Parity, Continuous Release Discipline
- Technology Stack Constraints
- Development Workflow & Quality Gates
- Governance

Removed sections: N/A

Templates requiring updates:
- ✅ .specify/templates/plan-template.md — generic "Constitution Check" gate references
  this file by convention; no edits needed, gate will be evaluated against the
  principles below at plan time.
- ✅ .specify/templates/spec-template.md — no constitution-specific references; no
  changes required.
- ✅ .specify/templates/tasks-template.md — test tasks remain OPTIONAL per template
  default, consistent with Principle V (tests are not currently part of this
  project's workflow; see Development Workflow & Quality Gates).
- ✅ README.md — no contradictions found; no edits required.
- ⚠ No dedicated CONTRIBUTING.md or agent-specific guidance file exists yet beyond
  CLAUDE.md (which only points to the active plan). Consider adding contributor-facing
  docs that reference this constitution if the project gains outside contributors.

Follow-up TODOs:
- None. All placeholders resolved from current repository state (package.json,
  .github/workflows/release.yml, tsconfig.web.json, src/ layout).
-->

# Polyactyl Constitution

## Core Principles

### I. Type Safety First (NON-NEGOTIABLE)

TypeScript `strict` mode MUST remain enabled across all three project targets
(`tsconfig.web.json`, `tsconfig.node.json`, `tsconfig.json`). New code MUST NOT
introduce `any`, non-null assertions (`!`), or `@ts-ignore`/`@ts-expect-error`
suppressions to silence type errors — fix the underlying type instead. A
narrowly-scoped, commented exception is permitted only when a third-party type
definition is genuinely wrong or missing, and the comment MUST explain why.

**Rationale**: Polyactyl has no automated test suite today; the type checker is
the primary safety net catching mistakes before they reach a packaged build.
Weakening strictness removes that net without replacing it with anything.

### II. Process Isolation & IPC Security

The Electron main, preload, and renderer processes MUST remain separated per
`electron-vite`'s structure (`src/main`, `src/preload`, `src/renderer`).
Renderer code MUST NOT gain direct Node.js or filesystem access — all
privileged operations (file I/O, running HTTP requests via httpYac, git
status, etc.) MUST go through an explicit, named IPC channel registered in
`src/main/ipcHandlers.ts` and exposed via the preload bridge. `nodeIntegration`
MUST stay disabled and `contextIsolation` MUST stay enabled in
`src/main/index.ts`'s `BrowserWindow` configuration.

**Rationale**: Polyactyl executes user-authored `.http`/`.rest` files and
scripts (via httpYac). Collapsing the process boundary would let a malicious
or buggy request file reach the filesystem or shell directly instead of
through audited, narrow IPC surfaces.

### III. Local-First, Offline-Capable

Polyactyl MUST function fully against local files with no required network
service of its own. Features MUST NOT introduce a mandatory backend, account
system, or telemetry endpoint that the app depends on to perform its core
job: browsing, editing, and running `.http`/`.rest` files and viewing
responses. Outbound network calls the user's own requests make (the HTTP
requests being tested) are exempt — this principle governs Polyactyl's own
infrastructure dependencies, not the traffic it sends on the user's behalf.

**Rationale**: Polyactyl is a developer tool that wraps httpYac for local
`.http` file workflows. Its value proposition is staying out of the way of
the developer's existing files and editor habits; a required cloud dependency
would contradict that and add operational burden with no corresponding repo
infrastructure to support it.

### IV. Cross-Platform Parity

Every user-facing feature MUST work on macOS, Windows, and Linux before it is
considered complete, since `electron-builder` ships all three
(`build:mac`, `build:win`, `build:linux`) from the same codebase and CI builds
all three on every release. Platform-specific code (file paths, shell
invocations, native menus) MUST be guarded by explicit platform checks rather
than assumed from the development machine's OS. A feature that only works on
one platform MUST be flagged as a known limitation in the PR description, not
silently merged.

**Rationale**: The release pipeline (`.github/workflows/release.yml`) builds
and ships artifacts for all three operating systems on every push to `main`.
A platform regression is invisible until a user on that platform hits it,
because there is no automated cross-platform test coverage today.

### V. Continuous Release Discipline

Every push to `main` triggers an automated patch version bump and a build +
GitHub release across all platforms (see `.github/workflows/release.yml`).
Treat every merge to `main` as equivalent to shipping to users: it MUST build
cleanly (`npm run build`) and MUST NOT knowingly introduce a regression.
Work-in-progress or experimental code belongs on a feature branch, not on
`main`, until it is ready to ship. Because there is no automated test suite,
manual verification of the affected feature (see Development Workflow below)
is the gate that substitutes for automated CI checks before merging.

**Rationale**: There is no manual release approval step — version bump,
build, and publish happen unattended on every merge. The cost of merging
broken code to `main` is an immediate, multi-platform broken release, not a
staged rollout.

## Technology Stack Constraints

- **Core stack**: Electron, React 18, TypeScript (strict), Zustand for
  renderer state, `electron-vite` for build tooling, `electron-builder` for
  packaging, and `httpyac` as the request-execution engine. Swapping any of
  these (e.g., replacing Zustand with another state library, or httpYac with
  a custom HTTP engine) is an architectural change requiring a constitution
  amendment and explicit justification in the relevant `plan.md`'s Complexity
  Tracking table — not a routine refactor.
- **Editor/syntax tooling**: CodeMirror 6 (`@codemirror/*`) is the established
  editor component; introducing a second, competing editor framework MUST be
  justified rather than added alongside it.
- **Docs site**: The `docs/` directory is a separate Astro project with its
  own dependency tree and deploy workflow (`.github/workflows/deploy-docs.yml`).
  It is documentation, not application code, and is exempt from Principles I,
  II, and IV (it does not run as part of the desktop app and is not built by
  `electron-builder`).

## Development Workflow & Quality Gates

- There is currently no automated test suite. Until one is introduced,
  changes to request execution, file I/O, and IPC handlers MUST be manually
  verified by running the app (`npm run dev`) and exercising the golden path
  plus at least one edge case before merging, per the project's general
  verification practice.
- If a future change introduces automated tests, they MUST be runnable via a
  documented `npm` script, and that script MUST be wired into CI before tests
  are treated as a merge gate — a test that doesn't run in CI provides no
  guarantee.
- Linting/formatting: if ESLint/Prettier config is added to the project, it
  MUST be run as part of `npm run build` or a pre-commit hook so it cannot be
  silently skipped; until then, code style is enforced through review.
- PRs that touch `src/main/ipcHandlers.ts` or `src/main/index.ts` (the
  privilege boundary) warrant extra scrutiny against Principle II regardless
  of how small the diff looks.

## Governance

This constitution supersedes ad-hoc conventions for any conflict between the
two. Amendments require:

1. A documented rationale (what's changing and why) in the same spirit as the
   Sync Impact Report produced when this document is edited.
2. A version bump following semantic versioning: MAJOR for backward-incompatible
   principle removals/redefinitions, MINOR for new principles or materially
   expanded guidance, PATCH for clarifications and wording fixes.
3. Propagation check: re-read `.specify/templates/plan-template.md`,
   `spec-template.md`, and `tasks-template.md` for now-stale references, and
   update them in the same change.

All feature plans MUST pass the Constitution Check gate in `plan-template.md`
against the principles above before Phase 0 research begins, and MUST
re-check after Phase 1 design. Any violation MUST be justified in that plan's
Complexity Tracking table or the simpler alternative MUST be adopted instead.

**Version**: 1.0.0 | **Ratified**: 2026-06-16 | **Last Amended**: 2026-06-16
