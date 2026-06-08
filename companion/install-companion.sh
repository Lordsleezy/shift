#!/usr/bin/env bash
# Installed by Shift onto the Linux staging partition.
# Run once after Linux is installed, or from the live session desktop shortcut copy.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/sentinel-revert}"

install_companion() {
  mkdir -p "$INSTALL_ROOT"
  cp "$SCRIPT_DIR/sentinel-revert.sh" "$INSTALL_ROOT/sentinel-revert.sh"
  chmod +x "$INSTALL_ROOT/sentinel-revert.sh"

  local desktop_dir
  desktop_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$desktop_dir"
  cp "$SCRIPT_DIR/sentinel-revert.desktop" "$desktop_dir/sentinel-revert.desktop"
  sed -i "s|/opt/sentinel-revert|$INSTALL_ROOT|g" "$desktop_dir/sentinel-revert.desktop" 2>/dev/null || \
    sed -i '' "s|/opt/sentinel-revert|$INSTALL_ROOT|g" "$desktop_dir/sentinel-revert.desktop"

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$desktop_dir" 2>/dev/null || true
  fi

  echo "Sentinel Revert companion installed."
}

install_companion
