# WSL Ubuntu 24.04 Linux AppImage Build

This project can build the Linux AppImage from WSL Ubuntu 24.04. Use WSL for the build, then use a real Ubuntu Desktop VM or physical Linux system for visual validation before release.

WSLg on this machine was not reliable for GUI smoke testing. Prefer a real Ubuntu Desktop VM or physical Linux install for validating window behavior, app icons, desktop integration, and launch behavior.

On Ubuntu 24.04, running the AppImage may require the FUSE 2 compatibility package:

```bash
sudo apt install -y libfuse2t64
```

## Windows PowerShell Workflow

Run these commands from the Windows repo root:

```powershell
git status
git log --oneline -n 3
```

Recreate a clean WSL build clone from the Windows repo:

```powershell
wsl -d Ubuntu-24.04 -- bash -lc "rm -rf ~/src/WindowPanes && git clone /mnt/c/path/to/WindowPanes ~/src/WindowPanes"
```

Build inside WSL:

```powershell
wsl -d Ubuntu-24.04 -- bash -lc "cd ~/src/WindowPanes && npm ci && npm run typecheck && npm test && npm run dist:linux:gemstone"
```

Copy the AppImage back to the Windows `dist` folder:

```powershell
wsl -d Ubuntu-24.04 -- bash -lc "cp ~/src/WindowPanes/dist/WindowPanes-0.2.4-x86_64.AppImage /mnt/c/path/to/WindowPanes/dist/"
```

Verify the artifact from Windows:

```powershell
Get-ChildItem .\dist | Select-Object Name,Length,LastWriteTime
```

Expected AppImage path after copying back:

```text
C:\path\to\WindowPanes\dist\WindowPanes-0.2.4-x86_64.AppImage
```

## Validation Notes

- WSL can build the AppImage, including the native `node-pty` dependency, when the WSL environment has the required build toolchain.
- WSLg is useful for quick experiments only on this machine; it was not reliable enough for GUI release smoke testing.
- Validate Linux releases on real Ubuntu Desktop or a full Ubuntu Desktop VM, especially icon/window behavior and desktop integration.
- If the AppImage does not launch on Ubuntu 24.04 because FUSE 2 is missing, install `libfuse2t64` with the command above and retry.
