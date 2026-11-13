**Test build of an unofficial fork – not an official Stoat release.**
Includes fixes that are being prepared for upstream (stoatchat/for-desktop). Auto-updates are disabled in this build; reinstall the official version to go back.

### Downloads
| Platform | File |
|---|---|
| Windows (x64) – installer | `Stoat-…-windows-x64-setup.exe` |
| Windows (x64) – portable | `Stoat-…-windows-x64-portable.zip` (unzip, run `stoat-desktop.exe`) |
| macOS (Apple Silicon) | `Stoat-…-macos-arm64.dmg` (or `.zip`) |

Checksums: `SHA256SUMS.txt`

### The builds are not signed
- **Windows:** SmartScreen may warn → "More info" → "Run anyway".
- **macOS:** open the DMG, drag Stoat to Applications, then run once in Terminal:
  `xattr -cr /Applications/Stoat.app`
  (or right-click Stoat → Open → Open). Allow microphone/camera when asked.

### Feedback
Please report problems to the person who sent you this link (platform, version from the tray/menu bar, steps, what happened).
