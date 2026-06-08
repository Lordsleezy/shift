# Shift by Sentinel

Shift by Sentinel is a cross-platform Electron v22 desktop application that helps non-technical users browse, preview, and prepare to install free operating systems.

The app is designed as an OS storefront: users can check their device, compare operating systems in plain English, confirm backup readiness, prepare an installer, and restart when ready.

## Current scaffold

- Electron v22 main process with a secure preload bridge
- React renderer with Tailwind styling
- Six-screen flow: Welcome, Device Check, OS Picker, Backup Reminder, Preparing, Ready to Install
- Device detection for RAM, CPU, storage, current OS, Windows S Mode, Secure Boot, UEFI Windows product key backup path, and Mac Intel vs Apple Silicon
- OS catalog in `src/shared/catalog.js` with seven operating system entries
- Placeholder OS logos and screenshot previews in `assets/`

## Requirements

- Node.js 18 or newer for development
- npm
- Windows 7+ or macOS 10.9+ target behavior through Electron v22

## Setup

```powershell
cd C:\Users\pgg12\Desktop\shift-by-sentinel
npm install
npm run dev
```

## Build

```powershell
npm run build
```

Pack without creating an installer:

```powershell
npm run pack
```

## Notes for installer work

The current scaffold simulates download, verification, boot preparation, and ready states in the renderer. Real installer preparation should be implemented in the main process with explicit admin permission, checksum verification, secure ISO download sources, and platform-specific boot media handling.

Windows-specific detection is implemented in `src/main/system.js`:

- S Mode registry check
- Secure Boot detection
- UEFI Windows product key extraction through `wmic`
- Product key backup to the app data directory

macOS-specific detection reports Intel vs Apple Silicon and surfaces compatibility warnings for Apple Silicon.

No git repository is initialized by this scaffold.
