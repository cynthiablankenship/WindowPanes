# WindowPanes CI and Release Automation

WindowPanes uses GitHub Actions for pull-request validation, main branch validation, and tagged release builds. The workflows use GitHub-hosted runners and do not require repository secrets.

## CI Workflow

The CI workflow lives at `.github/workflows/ci.yml`.

It runs on:

```text
push to main
pull_request to main
```

Each run validates the app on `macos-latest`, `windows-latest`, and `ubuntu-latest` with:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

CI intentionally does not package installers. Packaging is handled by the release workflow so normal branch and pull-request checks stay focused on source validation.

## Release Workflow

The release workflow lives at `.github/workflows/release.yml`.

It runs when a tag matching this pattern is pushed:

```text
windowpanes-v*
```

The Windows release job runs on `windows-latest`:

```powershell
npm ci
npm run typecheck
npm test
npm run dist:win:gemstone
```

It uploads the NSIS installer:

```text
dist/WindowPanes-Setup-*.exe
```

For version `0.2.6`, the expected installer name is:

```text
WindowPanes-Setup-0.2.6.exe
```

The Linux release job runs on `ubuntu-latest`, installs Linux packaging dependencies, then runs:

```bash
npm ci
npm run typecheck
npm test
npm run dist:linux:gemstone
```

It uploads the AppImage:

```text
dist/*.AppImage
```

For version `0.2.6`, the expected AppImage name is:

```text
WindowPanes-0.2.6-x86_64.AppImage
```

After the packaging jobs finish, the publish job creates or updates the GitHub Release for the pushed tag using the built-in `GITHUB_TOKEN`. The macOS DMG, Windows installer, and Linux AppImage are attached to the GitHub Release. They are also available as workflow artifacts from the release run.

Signing and notarization are not part of this pass. Windows SmartScreen/code signing should be handled as future release hardening work.

The Linux AppImage is built automatically in GitHub Actions, but visual validation still needs a Linux desktop or full Linux desktop VM. Validate launch behavior, app icons, window behavior, and desktop integration before treating a release as fully smoked.

## Cutting a Release

Before cutting a release, make sure `main` is clean and includes the changes you want to release.

```bash
git status
```

Run local checks if desired:

```bash
npm run typecheck
npm test
npm run build
```

Create and push a release tag from `main`:

```bash
git tag windowpanes-v0.2.6
git push origin main --tags
```

Pushing the tag starts the release workflow. When the workflow completes, release artifacts appear under the GitHub Release for that tag and in the workflow run artifacts.
