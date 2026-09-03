---
name: ship-feature
description: Full release pipeline for ContentDownloader — clean up the changes since the last release, run an agent-based review and fix findings, build a release APK for one last local test, then on explicit confirmation push to `main` and cut a GitHub release. Works directly on `main`, no feature branches or PRs. Triggered by "ship it", "feature fertig machen", "release vorbereiten", "ship-feature".
---

# Ship Feature

Takes ContentDownloader's current unreleased work on `main` from "code changed" to "released",
through review and one last local test. Claude and the user work together directly on `main` —
no feature branches, no PRs. Chains existing skills/tools instead of reimplementing them.

Der gesamte Ablauf läuft auf Deutsch mit dem User (Rückfragen, Statusmeldungen, Zwischenstände) —
Commit-Nachrichten, PR-Titel/Body und Release-Notes bleiben **immer Englisch** (CLAUDE.md §5/§7).
Antwortsprache und Commit-Sprache nie angleichen.

## Step 0: Preconditions

- `git branch --show-current` — **must be `main`**. This project doesn't use feature branches; if
  somehow not on `main`, ask before continuing.
- `git status --short` — if there's uncommitted work, ask whether to commit it first (via
  [[smart-commit]]) before proceeding.
- `git describe --tags --abbrev=0` for the last release tag, then `git log <tag>..HEAD --oneline`
  — print the full list of unreleased commits so both you and the user know the scope before
  touching anything.

## Step 1: Clean up the diff

Invoke [[simplify]] scoped to the unreleased range (`git diff <last-tag>..HEAD`, or the working
tree if there's still uncommitted work from Step 0). This is the "changes einmal optimieren" step.

## Step 2: Whole-file DRY/KISS/SOLID audit

Invoke [[principles]] against every file touched since the last release tag
(`git diff <last-tag>..HEAD --name-only`).
**Run it non-interactively — do not wait for its normal "Welche Findings soll ich anwenden?"
confirmation, treat it as answered "alle" automatically** (explicit standing instruction for this
pipeline, confirmed 2026-08-20 — `ship-feature` is meant to run unattended up to the Step 5 build
gate, so no other approval prompt may block it).

One exception `principles` itself carves out even under "alle": a finding whose harm it
*concretely demonstrates* (counted couplings, a measured regression) normally still gets a single
`AskUserQuestion`. **In this pipeline, don't ask — skip applying that specific finding instead**
and list it in the final summary as "not auto-applied, needs a look" (a `spawn_task` chip via
`dismiss_task`/`spawn_task` is fine too). Skipping is the safe default here, not forcing the edit
through.

**Don't add a separate utils-audit step.** `principles`' own Step 3 already runs [[utils-audit]]
internally for every `.ts`/`.js`/`.py` file in its target set instead of redoing that analysis —
invoking it again as its own pipeline step would re-resolve and re-read the same (currently
nonexistent — no `utils.ts` anywhere in `app/` as of 2026-08-20) utils module a second time for
zero new findings. `principles` covers this on its own.

## Step 3: Agent code review

Invoke [[standards-spec-review]] with the unreleased range as its fixed point (`<last-tag>..HEAD`,
or `git diff` against the working tree if Step 0 found uncommitted work not yet folded into a
commit — same fallback as Step 1) and the plan file (if one exists for this feature) as the spec
source. It runs a two-axis Standards+Spec review and reports findings — it does not auto-fix (no
`--fix`/`--level` flags exist on it). After it reports, apply the findings you judge worth fixing
yourself (same restraint as Step 2's "alle" exception: skip anything whose fix is itself
risky/nontrivial, log those to `deferred-quality-backlog` instead of forcing them through). This
hunts correctness bugs, missing edge cases, and other issues that Steps 1–2 don't look for (neither
hunts bugs; that's this step's specific job, run last so it sees the already-cleaned-up code).

## Step 4: Safety net + compile check

1. Invoke [[hide-claude]] — unstages/flags any `.claude/`/`CLAUDE.md`/`.env` that may have crept
   into the diff across Steps 1–3. No gate, always safe to run.
2. Run a compile/type check for whatever changed — `npx tsc --noEmit -p .` in `app/` and/or
   `server/` (whichever workspace has changed files), matching how every fix this session was
   verified before being called done. A failure here stops the pipeline; report it and don't
   continue to the build step until it's fixed.

If any of Steps 1–4 produced file changes, commit them now as a single fix commit directly on
`main` (follow the commit-message spec in CLAUDE.md §7,
`git commit --author="Neyu703 <129206215+Neyu703@users.noreply.github.com>"` per this project's
CLAUDE.md) — do not leave review fixes uncommitted going into the build step.

## Step 5: Build a release APK for local testing — hard gate

1. Decide the version bump with the user: this is a release cut, so it always targets the next
   `X.0` (minor) regardless of what the internal patch counter currently reads — see
   `contentdownloader-versioning-convention` memory. Bump **both** `app/app.json`
   (`expo.version` + `expo.android.versionCode`) **and** `app/android/app/build.gradle`
   (`versionName` + `versionCode`), and give the bump commit's subject the
   `[vX.Y.Z] chore: ...` title format per that same convention.
2. Commit the version bump locally (its own small commit, same `--author` flag as every commit in
   this project) — **don't push yet.**
3. Invoke [[build-apk]] to build and deliver the release APK — it handles the
   `gradlew assembleRelease` build, the version-file consistency check, and the Drive naming
   convention; don't reimplement any of that here.
4. Tell the user the APK is ready to test and **stop here**. Do not push to `main`'s remote, do
   not cut a release, until the user explicitly confirms the local test passed (e.g. "passt",
   "funktioniert", "gut"). A build succeeding is not the same as the user confirming it — wait for
   the actual confirmation message, same as every APK build earlier in this project's history.

## Step 6: Push — only after Step 5's confirmation

`git push origin main` — all commits from Steps 1–5 go up together once the local test is
confirmed.

## Step 7: GitHub Release

1. `git log v{previous}..HEAD --oneline` against the last release tag for the changelog.
2. `gh release create v{version} <path-to-the-tested-apk>#ContentDownloader-v{version}.apk --title v{version} --notes "## Changes since v{previous}\n- ..."`
   — reuse the exact APK already built and tested in Step 5, don't rebuild.

## Rules

- **No feature branches, no PRs.** Everything happens directly on `main`, in commits — this
  skill's entire job is turning the currently-unreleased commits on `main` into a tested,
  released build.
- **The Step 5 confirmation gate is not optional** — clean results in Steps 1–4 are not permission
  to skip local device testing before pushing/releasing.
- **Step 2 runs non-interactively by standing instruction** (confirmed 2026-08-20) — never
  reintroduce its normal approval prompt inside this pipeline, and never silently force-apply
  the one demonstrated-harm exception `principles` itself would normally ask about (skip + report
  it instead, see Step 2).
- **Token efficiency (confirmed 2026-08-20):** don't add a separate `utils-audit` step —
  `principles` already covers it internally (see Step 2). Don't re-run a step that already
  produced a clean result earlier in the same pipeline attempt just to "be sure."
- Reuse the skills that already exist for each piece ([[simplify]], [[principles]],
  [[standards-spec-review]], [[hide-claude]], [[smart-commit]], [[build-apk]]) instead of
  reimplementing their logic inline here.
- Follow every existing ContentDownloader-project convention found in memory (version-bump-both-
  files, Drive delivery naming, `--author` flag) rather than improvising a new one — this skill is
  glue, not a new source of truth.
