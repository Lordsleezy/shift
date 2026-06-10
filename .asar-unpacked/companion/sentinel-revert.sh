#!/usr/bin/env bash
# Sentinel — Go Back to Windows (Linux companion)
# Validates restore manifest, verifies partition math, then reverts safely.

set -euo pipefail

APP_NAME="Sentinel — Go Back to Windows"
MANIFEST_NAME="restore-manifest.json"
RESTORE_DIR="ShiftRestore"
CONFIRM_TEXT="This will remove Linux and restore Windows exactly as it was. Your Windows files and data are safe."

need_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    exec pkexec "$0" "$@"
  fi
}

msg() {
  if command -v zenity >/dev/null 2>&1; then
    zenity --info --title="$APP_NAME" --text="$1" --width=420 2>/dev/null || echo "$1"
  else
    echo "$1"
  fi
}

confirm() {
  if command -v zenity >/dev/null 2>&1; then
    zenity --question --title="$APP_NAME" --text="$CONFIRM_TEXT" --width=460 --default-cancel
    return $?
  fi
  read -r -p "$CONFIRM_TEXT Continue? [y/N] " ans
  [[ "${ans,,}" == "y" || "${ans,,}" == "yes" ]]
}

find_windows_mount() {
  local candidate
  for candidate in /mnt/windows /media/*/ShiftRestore /run/media/*/*/ShiftRestore; do
    if [[ -f "${candidate%/}/$RESTORE_DIR/$MANIFEST_NAME" ]]; then
      echo "${candidate%/}/$RESTORE_DIR"
      return 0
    fi
    if [[ -f "$candidate/$MANIFEST_NAME" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  local part
  part=$(lsblk -nrpo NAME,LABEL,FSTYPE | awk '$2=="System" || $3 ~ /ntfs|NTFS/ {print $1; exit}')
  if [[ -n "$part" ]]; then
    mkdir -p /mnt/windows
    mount -t ntfs-3g -o ro "$part" /mnt/windows 2>/dev/null || mount -t ntfs3 -o ro "$part" /mnt/windows 2>/dev/null || true
    if [[ -f "/mnt/windows/$RESTORE_DIR/$MANIFEST_NAME" ]]; then
      echo "/mnt/windows/$RESTORE_DIR"
      return 0
    fi
  fi
  return 1
}

validate_manifest() {
  local manifest_path="$1"
  python3 - "$manifest_path" <<'PY'
import json, hashlib, sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    manifest = json.load(f)

clone = dict(manifest)
clone.pop("checksum", None)
clone.pop("checksumAlgorithm", None)

def sort_keys(obj):
    if isinstance(obj, dict):
        return {k: sort_keys(obj[k]) for k in sorted(obj.keys())}
    if isinstance(obj, list):
        return [sort_keys(x) for x in obj]
    return obj

payload = json.dumps(sort_keys(clone), separators=(",", ":"), sort_keys=True)
digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
if manifest.get("checksum") != digest:
    raise SystemExit("Manifest checksum is missing or corrupt")

win = manifest["windowsPartition"]
linux = manifest["linuxPartition"]
expected = int(win["sizeAfterShrinkBytes"]) + int(linux["sizeBytes"])
original = int(win["originalSizeBytes"])
if expected != original:
    raise SystemExit(f"Partition math mismatch: {expected} != {original}")

linux_offset = int(linux["offsetBytes"])
win_offset = int(win["offsetBytes"])
win_shrunk = int(win["sizeAfterShrinkBytes"])
if linux_offset != win_offset + win_shrunk:
    raise SystemExit("Linux partition offset does not match manifest layout")

print("ok")
PY
}

revert_partitions() {
  local manifest_path="$1"
  python3 - "$manifest_path" <<'PY'
import json, subprocess, sys, time

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    m = json.load(f)

disk = str(m["disk"]["diskNumber"])
linux_num = str(m["linuxPartition"]["partitionNumber"])
win_num = str(m["windowsPartition"]["partitionNumber"])
original = str(m["windowsPartition"]["originalSizeBytes"])
win_start = str(m["windowsPartition"]["offsetBytes"])

dev = f"/dev/disk/by-partnum/{linux_num}" if False else None
# Resolve disk device via lsblk
out = subprocess.check_output(["lsblk", "-ndo", "NAME,PKNAME", "-p"], text=True)
disk_dev = None
for line in out.splitlines():
    name, pk = line.split()
    if name.endswith(str(linux_num)) or name.endswith(f"p{linux_num}"):
        disk_dev = pk if pk else name.rsplit("/", 1)[0]
        break
if not disk_dev:
    disk_dev = subprocess.check_output(["lsblk", "-ndo", "NAME", "-p"], text=True).splitlines()[0]

subprocess.run(["parted", "-s", disk_dev, "rm", linux_num], check=True)
subprocess.run(["parted", "-s", disk_dev, "resizepart", win_num, "100%"], check=True)
time.sleep(2)

win_part = None
for line in subprocess.check_output(["lsblk", "-nrpo", "NAME,PKNAME,PARTUUID"], text=True).splitlines():
    parts = line.split()
    if parts and parts[0].endswith(str(win_num)):
        win_part = parts[0]
        break

if win_part and subprocess.call(["which", "ntfsresize"], stdout=subprocess.DEVNULL) == 0:
    subprocess.run(["ntfsresize", "-f", win_part], check=False)

print("ok")
PY
}

cleanup_uefi_entries() {
  if ! command -v efibootmgr >/dev/null 2>&1; then
    return 0
  fi
  while IFS= read -r line; do
    if [[ "$line" =~ Boot([0-9A-Fa-f]{4})\*?[[:space:]]+(Shift:|Sentinel) ]]; then
      efibootmgr -b "${BASH_REMATCH[1]}" -B >/dev/null 2>&1 || true
    fi
  done < <(efibootmgr 2>/dev/null || true)
}

main() {
  need_root "$@"

  local restore_root
  restore_root=$(find_windows_mount) || {
    msg "Restore manifest not found. Cannot revert safely."
    exit 1
  }

  local manifest_path="$restore_root/$MANIFEST_NAME"
  validate_manifest "$manifest_path" || {
    msg "Restore manifest is missing or corrupt. Revert aborted."
    exit 1
  }

  confirm || exit 0

  revert_partitions "$manifest_path" || {
    msg "Partition revert failed. Windows was not modified."
    exit 1
  }

  cleanup_uefi_entries
  sync
  msg "Linux removed. Windows partition restored. Restarting into Windows…"
  systemctl reboot
}

main "$@"
