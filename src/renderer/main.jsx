import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCompatibility, osCatalog, sortByRecommendation } from "../shared/catalog";
import "./styles.css";

const SCREEN = {
  WELCOME: 0,
  DEVICE: 1,
  KEY: 2,
  OS: 3,
  BACKUP: 4,
  PARTITION: 5,
  PREPARING: 6,
  REVERT: 7,
  READY: 8
};

const SCREEN_LABELS = [
  "Welcome",
  "Device Check",
  "Windows Key",
  "OS Picker",
  "Backup",
  "Partition",
  "Preparing",
  "Go Back",
  "Ready"
];

const PHASES = ["download", "verify", "extract", "grub", "restore", "companion", "done"];
const ARM64_DEMO_MESSAGE =
  "Live demo requires an Intel or AMD processor. On this device you can install directly — Shift handles everything.";
const PHASE_LABELS = {
  download: "Downloading",
  verify: "Verifying",
  extract: "Extracting",
  grub: "Bootloader",
  restore: "Restore manifest",
  companion: "Revert companion",
  done: "Ready"
};

const formatGb = (bytes) => (bytes ? `${Math.round(bytes / 1024 / 1024 / 1024)} GB` : "Checking");
const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${bytes} B`;
};

function maskKey(key) {
  if (!key) return "";
  const parts = key.split("-");
  return parts.map((part, i) => (i < 2 ? part : "*****")).join("-");
}

function shouldShowKeyScreen(device) {
  return device?.platform === "win32" && device?.productKey?.found;
}

function Badge({ compatibility }) {
  const colors = {
    good: "bg-emerald-400/15 text-emerald-200 border-emerald-300/30",
    warning: "bg-amber-400/15 text-amber-200 border-amber-300/30",
    bad: "bg-red-400/15 text-red-200 border-red-300/30",
    soon: "bg-slate-400/15 text-slate-300 border-slate-300/20",
    unknown: "bg-teal-400/15 text-teal-200 border-teal-300/30"
  };
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${colors[compatibility.level]}`}>
      {compatibility.label}
    </span>
  );
}

function App() {
  const [screen, setScreen] = useState(SCREEN.WELCOME);
  const [device, setDevice] = useState(null);
  const [selectedId, setSelectedId] = useState("zorin");
  const [confirmed, setConfirmed] = useState(false);
  const [backup, setBackup] = useState({
    Documents: false,
    Photos: false,
    Downloads: false,
    "Browser bookmarks": false
  });
  const [installProgress, setInstallProgress] = useState(null);
  const [installError, setInstallError] = useState("");
  const [partitionLayout, setPartitionLayout] = useState(null);
  const [linuxBytes, setLinuxBytes] = useState(null);
  const [partitionApplying, setPartitionApplying] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const installStarted = useRef(false);

  useEffect(() => {
    const unsub = window.shiftAPI?.onUpdateReady?.(() => setUpdateReady(true));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    async function loadDevice() {
      if (window.shiftAPI) {
        const report = await window.shiftAPI.getDeviceReport();
        setDevice(report);
      }
    }
    loadDevice();
  }, []);

  const advance = useCallback(
    (from) => {
      let next = from + 1;
      if (from === SCREEN.DEVICE && !shouldShowKeyScreen(device)) next = SCREEN.OS;
      return Math.min(next, SCREEN.READY);
    },
    [device]
  );

  const retreat = useCallback(
    (from) => {
      let prev = from - 1;
      if (from === SCREEN.OS && !shouldShowKeyScreen(device)) prev = SCREEN.DEVICE;
      return Math.max(prev, SCREEN.WELCOME);
    },
    [device]
  );

  const next = () => setScreen((s) => advance(s));
  const back = () => setScreen((s) => retreat(s));

  const sortedCatalog = useMemo(() => sortByRecommendation(osCatalog, device), [device]);
  const selected = useMemo(
    () => osCatalog.find((item) => item.id === selectedId) || osCatalog[0],
    [selectedId]
  );

  const readinessCopy =
    device?.readiness === "ready"
      ? "Your device is ready"
      : device?.readiness === "limited"
        ? "Your device can run lighter options"
        : "Your device may need a lightweight OS";

  useEffect(() => {
    if (screen !== SCREEN.PREPARING || installStarted.current) return;
    installStarted.current = true;
    setInstallError("");
    setInstallProgress({ phase: "download", percent: 0, message: "Starting…" });

    const unsub = window.shiftAPI?.onInstallProgress?.((data) => setInstallProgress(data));

    window.shiftAPI
      ?.startInstall?.({ distroId: selectedId })
      .then((result) => {
        if (result?.ok) setScreen(SCREEN.REVERT);
        else setInstallError(result?.error || "Install preparation failed");
      })
      .catch((err) => setInstallError(err.message || String(err)));

    return () => {
      unsub?.();
      installStarted.current = false;
    };
  }, [screen, selectedId]);

  useEffect(() => {
    if (screen !== SCREEN.PARTITION) return;
    window.shiftAPI?.getPartitionLayout?.().then((layout) => {
      setPartitionLayout(layout);
      setLinuxBytes(layout?.recommendedLinuxBytes || layout?.minLinuxBytes || 40 * 1024 ** 3);
    });
  }, [screen]);

  return (
    <div className="dark">
      {updateReady && (
        <UpdateBanner onDismiss={() => setUpdateReady(false)} />
      )}
      <div className="min-h-screen overflow-hidden bg-shift-surface text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(20,184,166,.18),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(10,22,40,.95),transparent_28%)]" />
        <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-5">
          <header className="flex items-center gap-4">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-shift-accent transition-all duration-500"
                style={{ width: `${((screen + 1) / SCREEN_LABELS.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-white/45">
              {screen + 1} / {SCREEN_LABELS.length}
            </span>
          </header>

          {device?.sMode && <SModeBlocker />}
          {!device?.sMode && screen === SCREEN.WELCOME && <Welcome onNext={next} />}
          {!device?.sMode && screen === SCREEN.DEVICE && (
            <DeviceCheck device={device} readinessCopy={readinessCopy} onBack={back} onNext={next} />
          )}
          {!device?.sMode && screen === SCREEN.KEY && shouldShowKeyScreen(device) && (
            <WindowsKey device={device} onBack={back} onNext={next} />
          )}
          {!device?.sMode && screen === SCREEN.OS && (
            <OSPicker
              device={device}
              catalog={sortedCatalog}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              onBack={back}
              onNext={next}
            />
          )}
          {!device?.sMode && screen === SCREEN.BACKUP && (
            <BackupReminder
              backup={backup}
              setBackup={setBackup}
              confirmed={confirmed}
              setConfirmed={setConfirmed}
              onBack={back}
              onNext={next}
            />
          )}
          {!device?.sMode && screen === SCREEN.PARTITION && (
            <PartitionScreen
              layout={partitionLayout}
              linuxBytes={linuxBytes}
              setLinuxBytes={setLinuxBytes}
              applying={partitionApplying}
              onApply={async () => {
                setPartitionApplying(true);
                try {
                  await window.shiftAPI.applyPartition(linuxBytes);
                  next();
                } catch (err) {
                  alert(err.message || String(err));
                } finally {
                  setPartitionApplying(false);
                }
              }}
              onBack={back}
            />
          )}
          {!device?.sMode && screen === SCREEN.PREPARING && (
            <Preparing
              selected={selected}
              progress={installProgress}
              error={installError}
              onCancel={() => {
                window.shiftAPI?.cancelInstall?.();
                installStarted.current = false;
                setScreen(SCREEN.OS);
              }}
            />
          )}
          {!device?.sMode && screen === SCREEN.REVERT && (
            <RevertTrust onBack={() => setScreen(SCREEN.OS)} onNext={() => setScreen(SCREEN.READY)} />
          )}
          {!device?.sMode && screen === SCREEN.READY && (
            <Ready selected={selected} onBack={() => setScreen(SCREEN.OS)} />
          )}

          <footer className="mt-auto pt-6 text-center text-xs text-white/45">by Sentinel Prime</footer>
        </main>
      </div>
    </div>
  );
}

function UpdateBanner({ onDismiss }) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-4 border-b border-shift-accent/40 bg-shift-accent px-5 py-3 text-shift-navy shadow-glow">
      <p className="text-sm font-semibold md:text-base">Update available — restart to install</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-lg border border-shift-navy/20 bg-shift-navy/10 px-4 py-1.5 text-sm font-semibold hover:bg-shift-navy/20"
      >
        Later
      </button>
    </div>
  );
}

function Welcome({ onNext }) {
  return (
    <section className="grid flex-1 place-items-center text-center">
      <div className="max-w-2xl">
        <div className="mx-auto mb-8 grid h-24 w-24 place-items-center rounded-3xl bg-shift-navy text-4xl font-black text-shift-accent shadow-glow ring-2 ring-shift-accent/30">
          S
        </div>
        <h1 className="text-5xl font-black tracking-tight md:text-7xl">Shift by Sentinel</h1>
        <p className="mt-5 text-xl text-white/65">Free your computer from the OS it came with</p>
        <button
          onClick={onNext}
          className="mt-10 rounded-2xl bg-shift-accent px-8 py-4 text-lg font-bold text-shift-navy shadow-glow transition hover:-translate-y-0.5 hover:bg-shift-accent-hover"
        >
          Get Started
        </button>
        <p className="mt-14 text-sm text-white/45">Installs Linux directly on your internal drive — no USB needed</p>
      </div>
    </section>
  );
}

function SModeBlocker() {
  return (
    <section className="mx-auto grid flex-1 max-w-3xl place-items-center">
      <div className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-8">
        <h1 className="text-3xl font-bold">Windows S Mode needs to be turned off first</h1>
        <p className="mt-4 text-white/70">
          S Mode blocks installer tools that Shift needs. Microsoft lets you switch out of S Mode for free.
        </p>
        <ol className="mt-6 list-decimal space-y-3 pl-6 text-white/75">
          <li>Open Settings.</li>
          <li>Go to Activation.</li>
          <li>Choose Switch out of S Mode.</li>
          <li>Select Get from the Microsoft Store page.</li>
          <li>Restart Shift by Sentinel after Windows confirms the change.</li>
        </ol>
      </div>
    </section>
  );
}

function DeviceCheck({ device, readinessCopy, onBack, onNext }) {
  const rows = [
    ["RAM", formatGb(device?.ramBytes)],
    ["Storage available", formatGb(device?.storageAvailableBytes)],
    ["CPU", device ? `${device.cpu} (${device.cpuCores} cores)` : "Checking"],
    ["Graphics", device?.gpu || "Checking"],
    ["Current OS", device?.currentOS || "Checking"],
    [
      "Secure Boot",
      device?.secureBoot?.enabled === true
        ? "Enabled"
        : device?.secureBoot?.enabled === false
          ? "Disabled"
          : "Not reported"
    ],
    ["S Mode", device?.sMode ? "Enabled — must disable" : "Not detected"]
  ];

  return (
    <ScreenShell title="Device Check" subtitle={readinessCopy} onBack={onBack} onNext={onNext}>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm text-white/45">{label}</div>
            <div className="mt-2 font-semibold">{value}</div>
          </div>
        ))}
      </div>
      {device?.appleSiliconWarning && (
        <p className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-amber-100">
          Apple Silicon Macs need special builds. Shift will only show operating systems that can be installed safely.
        </p>
      )}
    </ScreenShell>
  );
}

function WindowsKey({ device, onBack, onNext }) {
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const key = device?.productKey?.key || "";

  async function handleSave() {
    setSaving(true);
    try {
      await window.shiftAPI.saveProductKey(key);
      onNext();
    } catch (err) {
      alert(err.message || "Could not save product key");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenShell
      title="Your Windows license key"
      subtitle="We found a product key embedded in your device firmware."
      onBack={onBack}
      onNext={handleSave}
      nextLabel={saving ? "Saving…" : "Save & Continue"}
      nextDisabled={saving}
    >
      <div className="rounded-3xl border border-shift-accent/30 bg-shift-accent/10 p-6">
        <div className="font-mono text-2xl tracking-widest">{revealed ? key : maskKey(key)}</div>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="mt-4 text-sm text-shift-accent underline-offset-2 hover:underline"
        >
          {revealed ? "Hide key" : "Reveal key"}
        </button>
      </div>
      <p className="mt-6 leading-relaxed text-white/70">
        Your Windows license key has been found and saved locally on your computer. If you ever run Windows in a
        virtual machine, this key can activate it. It is never sent to the cloud.
      </p>
      <p className="mt-3 text-sm text-white/45">Tap Save &amp; Continue to store the key in Shift&apos;s secure app data folder.</p>
    </ScreenShell>
  );
}

function ProgressOverlay({ entry, mode, progress, error, onCancel }) {
  const phase = progress?.phase || "download";
  const percent = progress?.percent ?? 0;
  const isRunning = mode === "demo" && phase === "running";
  const isDownload = mode === "download";
  const title = isRunning
    ? `Trying ${entry.name}`
    : isDownload
      ? `Downloading ${entry.name}`
      : `Preparing ${entry.name} demo`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-shift-navy p-8 shadow-glow">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-white/60">
          {isRunning
            ? "The desktop opens in a separate window. This is a live session — nothing is installed. Close the window when you are done."
            : progress?.message || "Please wait…"}
        </p>

        {!isRunning && (
          <>
            {progress?.total > 0 && (
              <p className="mt-2 text-xs text-white/45">
                {formatBytes(progress.received)} / {formatBytes(progress.total)}
              </p>
            )}
            <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-shift-accent transition-all" style={{ width: `${percent}%` }} />
            </div>
          </>
        )}

        {error && (
          <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>
        )}

        {!isRunning && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-6 rounded-xl border border-white/15 px-5 py-3 text-sm hover:bg-white/5"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function OSPicker({ device, catalog, selectedId, setSelectedId, onBack, onNext }) {
  const selected = catalog.find((e) => e.id === selectedId);
  const nextBlocked = selected?.comingSoon || selected?.manualDownloadOnly;
  const [isoStatus, setIsoStatus] = useState({});
  const hostIsArm64 = device?.hostArchitecture === "arm64";
  const [demoSupported, setDemoSupported] = useState(!hostIsArm64);
  const [demoUnsupportedMessage, setDemoUnsupportedMessage] = useState(hostIsArm64 ? ARM64_DEMO_MESSAGE : "");
  const [demoCapabilityLoaded, setDemoCapabilityLoaded] = useState(hostIsArm64);
  const [overlayEntry, setOverlayEntry] = useState(null);
  const [overlayMode, setOverlayMode] = useState(null);
  const [overlayProgress, setOverlayProgress] = useState(null);
  const [overlayError, setOverlayError] = useState("");
  const actionActive = useRef(false);

  useEffect(() => {
    if (!window.shiftAPI?.getDemoStatus) return;
    Promise.all(catalog.map((entry) => window.shiftAPI.getDemoStatus(entry.id))).then((statuses) => {
      const next = {};
      statuses.forEach((status, i) => {
        next[catalog[i].id] = status;
      });
      setIsoStatus(next);
      const first = statuses[0];
      if (first) {
        setDemoSupported(first.demoSupported !== false);
        setDemoUnsupportedMessage(first.demoUnsupportedMessage || ARM64_DEMO_MESSAGE);
        setDemoCapabilityLoaded(true);
      }
    });
  }, [catalog]);

  async function handleDownload(entry) {
    if (entry.comingSoon || actionActive.current) return;
    setSelectedId(entry.id);

    if (entry.manualDownloadOnly) {
      window.open(entry.manualDownloadUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setOverlayEntry(entry);
    setOverlayMode("download");
    setOverlayError("");
    setOverlayProgress({ phase: "download", percent: 0, message: "Checking ISO…" });
    actionActive.current = true;

    const unsub = window.shiftAPI.onIsoProgress?.((data) => setOverlayProgress(data));

    try {
      const result = await window.shiftAPI.downloadIso(entry.id);
      if (!result?.ok) throw new Error(result?.error || "Download failed");
      const status = await window.shiftAPI.getDemoStatus(entry.id);
      setIsoStatus((prev) => ({ ...prev, [entry.id]: status }));
      setOverlayEntry(null);
      setOverlayMode(null);
      setOverlayProgress(null);
    } catch (err) {
      setOverlayError(err.message || String(err));
    } finally {
      unsub?.();
      actionActive.current = false;
    }
  }

  async function handleTryDemo(entry) {
    if (entry.comingSoon || entry.manualDownloadOnly || !demoSupported || actionActive.current) return;
    setSelectedId(entry.id);
    setOverlayEntry(entry);
    setOverlayMode("demo");
    setOverlayError("");
    setOverlayProgress({ phase: "download", percent: 0, message: "Checking ISO…" });
    actionActive.current = true;

    const unsub = window.shiftAPI.onDemoProgress?.((data) => setOverlayProgress(data));
    let failed = false;

    try {
      const status = await window.shiftAPI.getDemoStatus(entry.id);
      const result = await window.shiftAPI.startDemo(entry.id);
      if (!result?.ok) throw new Error(result?.error || "Demo failed to start");

      setIsoStatus((prev) => ({
        ...prev,
        [entry.id]: { ...status, downloaded: true, available: true }
      }));
    } catch (err) {
      failed = true;
      setOverlayError(err.message || String(err));
    } finally {
      unsub?.();
      actionActive.current = false;
      if (!failed) {
        setOverlayEntry(null);
        setOverlayMode(null);
        setOverlayProgress(null);
      }
    }
  }

  function cancelOverlay() {
    if (overlayMode === "download") {
      window.shiftAPI?.cancelIsoDownload?.();
    } else {
      window.shiftAPI?.cancelDemo?.();
    }
    actionActive.current = false;
    setOverlayEntry(null);
    setOverlayMode(null);
    setOverlayProgress(null);
    setOverlayError("");
  }

  const overlayOpen = Boolean(overlayEntry);
  const demoRunning = overlayMode === "demo" && overlayProgress?.phase === "running";
  const buttonClass =
    "flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <>
      {overlayOpen && (
        <ProgressOverlay
          entry={overlayEntry}
          mode={overlayMode}
          progress={overlayProgress}
          error={overlayError}
          onCancel={cancelOverlay}
        />
      )}
      <ScreenShell
        title="Pick your new operating system"
        subtitle="Download an ISO to install later, try a live demo, or continue to install on your drive."
        onBack={onBack}
        onNext={onNext}
        nextDisabled={nextBlocked || demoRunning}
        nextLabel="Install"
      >
        {!demoSupported && demoUnsupportedMessage && (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-white/70">
            {demoUnsupportedMessage}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {catalog.map((entry) => {
            const compatibility = getCompatibility(entry, device);
            const isSelected = selectedId === entry.id;
            const status = isoStatus[entry.id];
            const demoDisabled =
              entry.comingSoon || entry.manualDownloadOnly || !demoCapabilityLoaded || !demoSupported || demoRunning;
            const downloadDisabled = entry.comingSoon || demoRunning;

            return (
              <div
                key={entry.id}
                className={`relative rounded-3xl border p-5 transition ${
                  isSelected ? "border-shift-accent bg-shift-accent/10 shadow-glow" : "border-white/10 bg-white/5"
                } ${entry.comingSoon ? "opacity-50" : ""}`}
              >
                {compatibility.recommended && !entry.comingSoon && (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-shift-accent px-3 py-0.5 text-xs font-bold text-shift-navy">
                    Recommended for you
                  </span>
                )}
                <button
                  type="button"
                  disabled={entry.comingSoon}
                  onClick={() => setSelectedId(entry.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <img src={entry.logo} alt="" className="h-12 w-12" />
                    <Badge compatibility={compatibility} />
                  </div>
                  <h3 className="mt-4 text-xl font-bold">{entry.name}</h3>
                  <p className="mt-2 text-sm text-white/60">{entry.description}</p>
                </button>

                {!entry.comingSoon && (
                  <>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        disabled={downloadDisabled}
                        onClick={() => handleDownload(entry)}
                        className={`${buttonClass} border-white/20 bg-white/5 hover:bg-white/10`}
                      >
                        {entry.manualDownloadOnly ? "Get ISO" : status?.downloaded ? "Downloaded" : "Download"}
                      </button>
                      <button
                        type="button"
                        disabled={demoDisabled}
                        onClick={() => handleTryDemo(entry)}
                        className={`${buttonClass} border-shift-accent/50 bg-shift-accent/15 text-shift-accent hover:bg-shift-accent/25`}
                      >
                        Try Demo
                      </button>
                    </div>
                    {!demoSupported && demoUnsupportedMessage && (
                      <p className="mt-3 text-xs leading-relaxed text-white/50">{demoUnsupportedMessage}</p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </ScreenShell>
    </>
  );
}

function BackupReminder({ backup, setBackup, confirmed, setConfirmed, onBack, onNext }) {
  return (
    <ScreenShell
      title="Back up your important files"
      subtitle="Before we continue, make sure you have copied anything important somewhere safe."
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!confirmed}
    >
      {Object.keys(backup).map((item) => (
        <label
          key={item}
          className="mb-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
        >
          <input
            type="checkbox"
            checked={backup[item]}
            onChange={(event) => setBackup({ ...backup, [item]: event.target.checked })}
          />
          {item}
        </label>
      ))}
      <div className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-amber-100">
        Shift will shrink your Windows partition to make room for Linux. Your files stay on the Windows side — but
        always keep a backup of anything you cannot lose.
      </div>
      <label className="mt-5 flex items-center gap-3 font-semibold">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        I have backed up anything important
      </label>
    </ScreenShell>
  );
}

function PartitionScreen({ layout, linuxBytes, setLinuxBytes, applying, onApply, onBack }) {
  if (!layout) {
    return (
      <ScreenShell title="Partition" subtitle="Reading your drive layout…" onBack={onBack} nextDisabled hideNext>
        <div className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-12 text-center text-white/50">
          Scanning partitions…
        </div>
      </ScreenShell>
    );
  }

  const win = layout.windowsPartition;
  const min = layout.minLinuxBytes;
  const max = layout.maxLinuxBytes;
  const minWindowsFree = layout.minWindowsFreeBytes || 20 * 1024 ** 3;
  const windowsFreeAfter = win.freeBytes - linuxBytes;
  const unsafeFree = windowsFreeAfter < minWindowsFree;
  const pct = max > min ? ((linuxBytes - min) / (max - min)) * 100 : 50;
  const winPartitionAfter = win.sizeBytes - linuxBytes;

  return (
    <ScreenShell
      title="Make room for Linux"
      subtitle="Drag the slider to choose how much space Linux gets. Windows is shrunk non-destructively — your files on C: are preserved."
      onBack={onBack}
      onNext={onApply}
      nextLabel={applying ? "Applying…" : "Create Linux partition"}
      nextDisabled={applying || linuxBytes < min || linuxBytes > max || unsafeFree || !layout.elevated}
    >
      {!layout.elevated && (
        <div className="mb-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-amber-100">
          Administrator privileges are required to shrink the Windows partition. Close Shift and run it as Administrator.
        </div>
      )}
      {unsafeFree && (
        <div className="mb-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">
          This allocation would leave Windows with only {formatGb(Math.max(0, windowsFreeAfter))} free. Shift requires at
          least {formatGb(minWindowsFree)} free on Windows after shrinking.
        </div>
      )}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="mb-2 flex justify-between text-sm text-white/50">
          <span>Windows ({win.driveLetter}:)</span>
          <span>Linux</span>
        </div>

        <div className="relative flex h-16 overflow-hidden rounded-2xl ring-1 ring-white/10">
          <div
            className="flex items-center justify-center bg-blue-500/30 text-sm font-semibold transition-all duration-200"
            style={{ width: `${100 - pct}%` }}
          >
            {formatGb(winPartitionAfter)}
          </div>
          <div
            className="flex items-center justify-center bg-shift-accent/40 text-sm font-semibold text-white transition-all duration-200"
            style={{ width: `${pct}%` }}
          >
            {formatGb(linuxBytes)}
          </div>
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step={1024 * 1024 * 1024}
          value={Math.min(linuxBytes, max)}
          onChange={(e) => setLinuxBytes(Number(e.target.value))}
          className="mt-6 w-full accent-shift-accent"
        />

        <div className="mt-2 flex justify-between text-xs text-white/45">
          <span>Min {formatGb(min)}</span>
          <span>Max {formatGb(max)}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <Stat label="Windows free now" value={formatGb(win.freeBytes)} />
        <Stat label="Linux allocation" value={formatGb(linuxBytes)} />
        <Stat label="Windows free after shrink" value={formatGb(windowsFreeAfter)} />
      </div>

      <p className="mt-5 text-sm text-white/50">
        Shift creates a new partition and formats it for the installer. No USB drive is required.
      </p>
    </ScreenShell>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/45">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function Preparing({ selected, progress, error, onCancel }) {
  const phase = progress?.phase || "download";
  const percent = progress?.percent ?? 0;

  return (
    <section className="mx-auto grid w-full max-w-3xl flex-1 place-items-center">
      <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-3xl font-bold">Preparing {selected.name}</h1>
        <p className="mt-2 text-white/60">{progress?.message || "Starting…"}</p>

        {progress?.total > 0 && (
          <p className="mt-1 text-sm text-white/45">
            {formatBytes(progress.received)} / {formatBytes(progress.total)}
          </p>
        )}

        <div className="mt-8 h-4 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-shift-accent transition-all" style={{ width: `${percent}%` }} />
        </div>

        <div className="mt-6 grid grid-cols-7 gap-2 text-center text-xs sm:text-sm">
          {PHASES.map((name) => (
            <div
              key={name}
              className={name === phase ? "font-bold text-shift-accent" : "text-white/45"}
            >
              {PHASE_LABELS[name]}
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</div>
        )}

        <button onClick={onCancel} className="mt-8 rounded-xl border border-white/15 px-5 py-3 hover:bg-white/5">
          Cancel
        </button>
      </div>
    </section>
  );
}

function RevertTrust({ onBack, onNext }) {
  return (
    <ScreenShell
      title="You can always go back to Windows"
      subtitle="Before Shift changed anything, it saved a snapshot of your computer exactly as it was. If you ever want Windows back the way it was, you can — safely."
      onBack={onBack}
      onNext={onNext}
      nextLabel="Continue to Restart"
    >
      <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-6">
        <h3 className="text-xl font-bold text-emerald-100">Your undo button is ready</h3>
        <p className="mt-3 leading-relaxed text-white/75">
          Shift saved a restore plan on your Windows drive and on the new Linux side. Your photos, documents, and apps
          on Windows stay put — undo only removes Linux and gives that space back to Windows.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h4 className="font-semibold text-shift-accent">After Linux is installed</h4>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            Open your app menu and choose{" "}
            <strong className="font-semibold text-white">Sentinel — Go Back to Windows</strong>. Tap one button, confirm
            once, and Shift puts Windows back exactly how it was.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h4 className="font-semibold text-shift-accent">When your computer starts up</h4>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            On the startup menu, pick{" "}
            <strong className="font-semibold text-white">Sentinel — Go Back to Windows</strong> — even if Linux will not
            boot. Windows opens and runs the restore for you automatically.
          </p>
        </div>
      </div>

      <ul className="mt-6 list-disc space-y-2 pl-6 text-sm leading-relaxed text-white/60">
        <li>Your Windows files are not deleted — only the Linux side is removed.</li>
        <li>Shift double-checks its restore plan before changing anything. If something looks wrong, it stops.</li>
        <li>You do not need to be a computer expert. The app walks you through it in plain language.</li>
      </ul>
    </ScreenShell>
  );
}

function Ready({ selected, onBack }) {
  const [rebooting, setRebooting] = useState(false);

  async function handleReboot() {
    setRebooting(true);
    try {
      await window.shiftAPI.rebootToInstall();
    } catch (err) {
      alert(err.message || "Could not restart");
      setRebooting(false);
    }
  }

  return (
    <ScreenShell
      title="Ready to install"
      subtitle="Your installer is on disk and the bootloader is configured. Restart when you are ready."
      onBack={onBack}
      onNext={handleReboot}
      nextLabel={rebooting ? "Restarting…" : "Restart to Install"}
      nextDisabled={rebooting}
    >
      <div className="rounded-3xl border border-shift-accent/40 bg-shift-accent/10 p-6">
        <h3 className="text-2xl font-bold">{selected.name}</h3>
        <p className="mt-2 text-white/65">Download size: {selected.downloadSize}</p>
        <p className="text-white/65">Estimated install time: {selected.installTime}</p>
      </div>
      <ul className="mt-6 list-disc space-y-3 pl-6 text-white/70">
        <li>Your computer will restart into the {selected.name} installer.</li>
        <li>If you change your mind later, open Sentinel — Go Back to Windows from your Linux app menu, or pick it on the startup menu.</li>
        <li>You will choose your language, keyboard, and account name.</li>
        <li>If Secure Boot blocks the installer, Shift will guide you through disabling it.</li>
      </ul>
    </ScreenShell>
  );
}

function ScreenShell({ title, subtitle, children, onBack, onNext, nextDisabled, nextLabel = "Next", hideNext }) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-black tracking-tight">{title}</h1>
        <p className="mt-3 max-w-2xl text-white/60">{subtitle}</p>
      </div>
      <div>{children}</div>
      <div className="mt-8 flex justify-between">
        <button onClick={onBack} className="rounded-xl border border-white/15 px-5 py-3 hover:bg-white/5">
          Back
        </button>
        {!hideNext && (
          <button
            disabled={nextDisabled}
            onClick={onNext}
            className="rounded-xl bg-shift-accent px-6 py-3 font-bold text-shift-navy disabled:cursor-not-allowed disabled:opacity-40"
          >
            {nextLabel}
          </button>
        )}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
