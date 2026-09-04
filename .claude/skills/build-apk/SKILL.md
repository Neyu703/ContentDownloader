---
name: build-apk
description: Build a ContentDownloader release APK via the Android Studio project's own Gradle wrapper (app/android, gradlew assembleRelease) and deliver it to the Drive folder under the project's versioned naming convention. Use this whenever the user asks to build the app, build an APK, cut a build for testing, or as part of the ship-feature release pipeline's build step — Claude builds these itself, no need to ask permission first.
---

# Build APK

Builds and delivers a ContentDownloader release APK. This is Claude's own build — the user has
confirmed repeatedly that Claude runs the build itself via the Android Studio project's Gradle
wrapper (the same toolchain Android Studio uses); there's no separate manual-only path.

## 1. Check the two version files agree

`app/app.json` (`expo.version` / `expo.android.versionCode`) and
`app/android/app/build.gradle` (`versionName` / `versionCode`) must read the exact same version
before building — a mismatch means the wrong build recipe would ship a version that doesn't match
what's in git history. `build.gradle` is now git-tracked specifically so this stays visible in
diffs, but check both files directly rather than trusting that:

```bash
grep -E '"version"|versionCode' app/app.json
grep -E 'versionCode|versionName' app/android/app/build.gradle
```

If they disagree, stop and ask the user which one is correct rather than guessing — don't silently
pick one.

## 2. Build

```bash
cd app/android
./gradlew.bat assembleRelease
```

Always the **release** variant, never debug — release has `debuggable true` set, so it stays
attachable via `adb logcat` despite being minified/shrunk, giving you a real production-shaped
build that's still debuggable if it crashes on-device.

Use `./gradlew.bat clean assembleRelease` instead whenever the Gradle version, JDK, or a
dependency changed since the last build. A plain incremental build can silently reuse a stale
cached compile output from before the change and report success on a toolchain that's actually
broken — this exact false-positive happened once already on this project. When in doubt about
whether something toolchain-related changed, `clean` is the safe default; it just costs more time.

Output lands at `app/android/app/build/outputs/apk/release/app-release.apk`.

## 3. Deliver to Drive

Copy the APK to:

```
E:\Drive\ContentDownloader\ContentDownloader-v{version}-RELEASE-DEBUG-{date}.apk
```

- `{version}` = `versionName` (e.g. `1.9.2`)
- `{date}` = today's date as `YYYY-MM-DD`
- `RELEASE-DEBUG` is a fixed literal encoding that this is the release build type with
  `debuggable true` — keep it even though it reads oddly

One file per version, never overwritten — this is the project's build history, not a scratch
folder. The one exception: if a build turns out broken on its *first* on-device test and no
GitHub Release references it yet, the same version+date file may be replaced same-day. Recycle-bin
the broken one first (never hard-delete):

```powershell
[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
  "E:\Drive\ContentDownloader\ContentDownloader-v{version}-RELEASE-DEBUG-{date}.apk",
  'OnlyErrorDialogs', 'SendToRecycleBin'
)
```

Verify the move actually landed (the .NET call sometimes throws a false "not found" even when it
succeeded) via `(New-Object -ComObject Shell.Application).Namespace(10)`. Then bump `versionCode`
in both version files before rebuilding — the corrected APK needs a higher versionCode to install
cleanly over the broken one already on the test device, even though `versionName`/semver stays the
same. Once a version has an actual GitHub Release, this exception no longer applies; a bug found
after that gets a new patch version through the normal versioning flow instead.

## 4. Report

Tell the user the APK is built and where it landed (full path), and its size. Don't push to
`main`'s remote or cut a GitHub Release as part of this — that's a separate, explicit step (see
`ship-feature` for the full pipeline this build step feeds into).

Note: this build always signs with the debug keystore, since `app/android/keystore.properties`
(the real release keystore config) is never present on a dev machine — only the
`release-apk` GitHub Actions workflow supplies it, producing the actual release-signed artifact.
If `keystore.properties` ever *is* present locally (deliberately reproducing CI's signing), this
same `assembleRelease` command will produce a real-signed APK instead — expected, not a bug.
