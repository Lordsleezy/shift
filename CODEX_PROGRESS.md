# CODEX Progress — Shift by Sentinel

**Date:** 2026-06-08  
**Reviewer task:** Pre-commit safety audit (partition, boot, elementary ISO, 20 GB guard, elevated test)

---

## 1. Partition shrink (`src/main/partition.js`)

### What the code does
- **`Resize-Partition -DriveLetter C -Size $newSize`** — shrinks the existing NTFS Windows partition from the tail. Microsoft documents this as a **non-destructive** shrink: it does **not** format C: and does **not** run `Format-Volume` on C:.
- **`Format-Volume`** runs **only** on the **new** Linux partition letter after `New-Partition`.
- Pre-shrink guard: `$newSize -lt (Get-PartitionSupportedSize -DriveLetter C).SizeMin` rejects shrinks that would encroach on used clusters.

### Verdict: **Mechanism is correct in principle**
`Resize-Partition` is the right API for non-destructive shrink. Windows data on C: is not intentionally wiped by this script.

### Issues found
| Severity | Issue |
|----------|--------|
| **HIGH** | `Get-Partition -DriveLetter C` **fails on this test machine** (Snapdragon X / ARM64 Windows). `Get-Volume -DriveLetter C` works, but partition cmdlets return empty without elevation. Partition screen throws *"Could not find Windows (C:) partition"*. |
| **HIGH** | Storage cmdlets (`Get-Partition`, `Get-PartitionSupportedSize`, `Resize-Partition`) require **Administrator**. Non-elevated dev runs fail silently from the user's perspective. |
| **MEDIUM** | UI shows `windowsAfter = partitionSize - linuxBytes`, not **free space after shrink**. User asked for ≥20 GB **free** on Windows — not yet enforced. |
| **LOW** | `maxLinuxBytes` uses `maxShrink` (partition tail reclaim), not `freeBytes - 20GB`. User could pick a size that passes SizeMin but leaves Windows with &lt;20 GB free. |

### Elevated test (this machine)
- **OS:** Windows on ARM64 (Qualcomm Oryon), C: visible via `Get-Volume` (~238 GB free).
- **`npm run dev`:** Started successfully (Vite :5173 + Electron).
- **Partition IPC without elevation (before fix):** `getDriveLayout()` → **FAILED**.
- **Partition IPC without elevation (after fix):** `getDriveLayout()` → **SUCCEEDS** (volume fallback, `partitionDiscovered: false`, `elevated: false`, ~214 GB max Linux).
- **Partition screen UI:** Layout loads; admin banner shown; Continue blocked when not elevated or Windows free &lt; 20 GB after allocation.
- **Full wizard through Partition screen:** Reached in dev mode; apply not tested (destructive on daily driver).
- **Did not run `applyPartitionPlan`** — requires elevation + spare hardware/VM snapshot for safe validation.

---

## 2. Boot / GRUB setup (`src/main/extract.js`)

### What the code does
- Robocopies mounted ISO contents to the new FAT32 Linux partition.
- `configureGrub` copies `grubx64.efi` / `bootx64.efi` to **`{linuxDrive}:\EFI\SHIFT\`**
- `bcdedit` sets **`device partition={EFI_ESP}`** but **`path \EFI\SHIFT\grubx64.efi`** relative to ESP.

### Verdict: **BOOT PATH IS WRONG — will not boot Linux**
The boot file is written to the **Linux data partition** (e.g. D:), but `bcdedit` looks for it on the **EFI System Partition** (e.g. S:). The paths do not match; the new entry will not chainload the installer.

### Windows bootloader safety
- Uses `bcdedit /copy '{bootmgr}'` — adds a **new** entry; does **not** remove `{bootmgr}` or the Windows loader.
- **Risk:** Low for breaking Windows boot entirely; **Risk:** High that Linux entry is broken and user reboots into a failed boot option.

### Correct approach (needed fix)
For UEFI + extracted ISO on partition N:
```
bcdedit /set {guid} device partition=N:
bcdedit /set {guid} path \EFI\BOOT\bootx64.efi
```
(point at the distro's EFI boot file **on the Linux partition**, not ESP — standard for "partition install" setups)

Alternatively: copy `\EFI\ubuntu\grubx64.efi` (or distro path) **onto ESP** and point bcdedit at ESP — both are valid; current code mixes them.

### Not tested
- No reboot test performed (would risk boot loop on dev machine).

---

## 3. Elementary OS download (`src/main/install.js`)

### URL tested
`https://elementary.io/download/mirror?os=elementary&version=stable&arch=amd64`

### Result: **BROKEN — downloads HTML, not ISO**
| Step | Result |
|------|--------|
| HEAD/GET follow redirects | Final URL: `https://elementary.io/` |
| Content-Type | `text/html; charset=UTF-8` |
| Content-Length | none (HTML homepage) |

Also tested:
- `https://elementary.io/download?amount=0&product=elementary&arch=amd64` → homepage HTML
- Guessed CDN hosts (`download.elementary.io`, etc.) → DNS NXDOMAIN

### Current stable (from [elementary.io/docs/installation](https://elementary.io/docs/installation/))
- File: `elementaryos-8.1-stable-amd64.20260219.iso`
- SHA256: `bda93040d08c05911fb159f8150bf8f4ef2db6567ef6e2acd197cb6f395d3446`
- Requires pay-what-you-want browser flow; **no stable programmatic direct URL** found.

### Verdict
If a user selects elementary OS today, Shift would save an HTML file named `.iso` and skip checksum (no hash configured). **Must fix before release.**

---

## 4. 20 GB Windows free-space guard

### Status before audit: **NOT IMPLEMENTED**

Required rule: block continue if `windowsFreeAfterShrink < 20 GB`.

Correct formula (NTFS shrink reclaims from free space at partition end first):
```
windowsFreeAfter = freeBytes - linuxBytes   (when linuxBytes <= maxShrink)
```

---

## 5. Other notes

- **Nobara:** No static SHA256; verify step skipped — acceptable but weaker integrity.
- **Pop!_OS:** Checksum fetched from `SHA256SUMS` at download time — good.
- **GPU detection:** `wmic path win32_VideoController get Name` returned empty on ARM test machine (not critical).

---

## 6. Fixes applied in this commit (post-audit)

See git diff for:
- Partition: robust C: discovery, 20 GB guard, admin error messages
- Boot: bcdedit points to `\EFI\BOOT\bootx64.efi` on Linux partition
- Elementary: removed broken redirect URL; marked `manualDownload` / blocked from automated pipeline until official API available
- Renderer: partition warning UI when Windows free &lt; 20 GB after allocation

---

## 7. Recommended manual QA (real hardware, elevated)

1. Run Shift **as Administrator**
2. Walk Welcome → Device Check → OS Picker (pick Ubuntu — known good ISO)
3. Partition: confirm layout loads, 20 GB guard blocks unsafe sizes
4. **Do not apply partition on production PC without backup**
5. On spare VM with snapshot: apply partition, confirm C: data intact, new partition formatted
6. Preparing: confirm ISO download + SHA256 pass
7. Reboot test on spare hardware only

---

## 8. Go Back to Windows revert (2026-06-08)

### Implemented
- Pre-partition snapshot: layout, BCD entries, drive letters (`restore-manifest.js`)
- Dual manifest write: `C:\ShiftRestore\` + Linux partition `ShiftRestore\`
- Boot menu entry: **`Sentinel — Go Back to Windows`** via `bcdedit` + ESP GRUB stub (`revert-boot.js`)
- Linux companion: **Sentinel — Go Back to Windows** app menu entry (`companion/`)
- Wizard step 8: plain-language trust screen before restart
- Revert validates manifest checksum and partition math before any disk changes

### Known items to verify during Legion testing (real hardware)

| Item | What to test | Risk if broken |
|------|----------------|------------------|
| **ESP GRUB write to NTFS** | Boot menu entry → GRUB writes `BOOT_TRIGGER_REVERT` on C: via `insmod ntfs` + `write`, then chainloads Windows | Revert from boot menu may not trigger; Linux companion still works |
| **Linux companion `parted` paths** | Run companion on target distros (Zorin, Mint, Ubuntu, etc.) after full install | Revert from Linux app may fail on some partition layouts |
| **Boot menu → trigger → scheduled task → revert** | Select **Sentinel — Go Back to Windows** at UEFI boot → Windows starts → `SentinelRevertBootTrigger` runs `revert.ps1` | Boot-menu revert path incomplete; Windows-side manual revert still available |

### Boot menu entry name (confirmed in code)
- Linux install: `Shift: {distro name}` (e.g. `Shift: Zorin OS`)
- Revert: **`Sentinel — Go Back to Windows`** — appears in Windows boot manager alongside Windows and Linux entries

---

## 9. Bundled dependencies (2026-06-08)

### Rule
One `.exe` install — zero additional downloads or separate installs for Shift features.

### Bundled with the Windows installer
| Component | Purpose | Location |
|-----------|---------|----------|
| **QEMU** (`qemu-system-x86_64.exe` + DLLs + firmware) | Try Demo live VM | `resources/qemu/` via `extraResources` |

Fetched at build time by `scripts/fetch-qemu-win.js` (Stefan Weil W64 build, pinned version). Not committed to git.

### Uses OS built-ins (no separate install)
| Tool | Purpose |
|------|---------|
| PowerShell | Partition, BCD, revert scripts |
| `bcdedit` | Boot entries |
| `robocopy` | ISO extract |
| `Resize-Partition` / `Get-Partition` | Disk layout |
| `shutdown.exe` | Reboot |

### Not bundled (by design)
| Item | Reason |
|------|--------|
| Linux ISOs | Downloaded on demand to `%APPDATA%` during install/demo |
| Linux companion `parted` / `zenity` | Runs on installed Linux, not Windows |
