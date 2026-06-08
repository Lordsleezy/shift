import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCompatibility, osCatalog } from "../shared/catalog";
import "./styles.css";

const screens = ["Welcome", "Device Check", "OS Picker", "Backup", "Preparing", "Ready"];
const formatGb = (bytes) => bytes ? `${Math.round(bytes / 1024 / 1024 / 1024)} GB` : "Checking";

function Badge({ compatibility }) {
  const colors = {
    good: "bg-emerald-400/15 text-emerald-200 border-emerald-300/30",
    warning: "bg-amber-400/15 text-amber-200 border-amber-300/30",
    bad: "bg-red-400/15 text-red-200 border-red-300/30",
    soon: "bg-slate-400/15 text-slate-300 border-slate-300/20",
    unknown: "bg-blue-400/15 text-blue-200 border-blue-300/30"
  };
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${colors[compatibility.level]}`}>{compatibility.label}</span>;
}

function App() {
  const [screen, setScreen] = useState(0);
  const [device, setDevice] = useState(null);
  const [theme, setTheme] = useState("dark");
  const [selectedId, setSelectedId] = useState("zorin");
  const [expandedId, setExpandedId] = useState("zorin");
  const [confirmed, setConfirmed] = useState(false);
  const [backup, setBackup] = useState({ Documents: false, Photos: false, Downloads: false, "Browser bookmarks": false });
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    async function loadDevice() {
      if (window.shiftAPI) {
        const report = await window.shiftAPI.getDeviceReport();
        setDevice(report);
      }
    }
    loadDevice();
  }, []);

  useEffect(() => {
    if (screen !== 4) return;
    setProgress(0);
    let active = true;
    async function runProgress() {
      for (let value = 0; value <= 100; value += 2) {
        if (!active) return;
        setProgress(value);
        await new Promise((resolve) => setTimeout(resolve, 90));
      }
      if (active) setScreen(5);
    }
    runProgress();
    return () => { active = false; };
  }, [screen]);

  const selected = useMemo(() => osCatalog.find((item) => item.id === selectedId) || osCatalog[0], [selectedId]);
  const readinessCopy = device?.readiness === "ready" ? "Your device is ready" : device?.readiness === "limited" ? "Your device can run lighter options" : "Your device may need a lightweight OS";

  function next() { setScreen((value) => Math.min(value + 1, screens.length - 1)); }
  function back() { setScreen((value) => Math.max(value - 1, 0)); }

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="min-h-screen overflow-hidden bg-slate-100 text-slate-950 transition-colors dark:bg-[#070915] dark:text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(79,142,247,.22),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(26,31,58,.9),transparent_28%)]" />
        <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-5">
          <header className="flex items-center justify-between gap-4">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-300/50 dark:bg-white/10"><div className="h-full rounded-full bg-shift-accent transition-all" style={{ width: `${((screen + 1) / screens.length) * 100}%` }} /></div>
            <button className="rounded-full border border-slate-300 px-4 py-2 text-sm dark:border-white/15" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light mode" : "Dark mode"}</button>
          </header>

          {device?.sMode && <SModeBlocker />}
          {!device?.sMode && screen === 0 && <Welcome onNext={next} />}
          {!device?.sMode && screen === 1 && <DeviceCheck device={device} readinessCopy={readinessCopy} onBack={back} onNext={next} />}
          {!device?.sMode && screen === 2 && <OSPicker device={device} selectedId={selectedId} setSelectedId={setSelectedId} expandedId={expandedId} setExpandedId={setExpandedId} onBack={back} onNext={next} />}
          {!device?.sMode && screen === 3 && <BackupReminder backup={backup} setBackup={setBackup} confirmed={confirmed} setConfirmed={setConfirmed} onBack={back} onNext={next} />}
          {!device?.sMode && screen === 4 && <Preparing selected={selected} progress={progress} onCancel={() => setScreen(2)} />}
          {!device?.sMode && screen === 5 && <Ready selected={selected} onBack={() => setScreen(2)} />}

          <footer className="mt-auto pt-6 text-center text-xs text-slate-500 dark:text-white/45">by Sentinel Prime</footer>
        </main>
      </div>
    </div>
  );
}

function Welcome({ onNext }) {
  return <section className="grid flex-1 place-items-center text-center"><div className="max-w-2xl"><div className="mx-auto mb-8 grid h-24 w-24 place-items-center rounded-3xl bg-shift-navy text-4xl font-black text-white shadow-glow">S</div><h1 className="text-5xl font-black tracking-tight md:text-7xl">Shift by Sentinel</h1><p className="mt-5 text-xl text-slate-600 dark:text-white/65">Free your computer from the OS it came with</p><button onClick={onNext} className="mt-10 rounded-2xl bg-shift-accent px-8 py-4 text-lg font-bold text-white shadow-glow transition hover:-translate-y-1">Get Started</button><p className="mt-14 text-sm text-slate-500 dark:text-white/45">Works on Windows 7+ and Mac 2010+</p></div></section>;
}

function SModeBlocker() {
  return <section className="mx-auto grid flex-1 max-w-3xl place-items-center"><div className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-8"><h1 className="text-3xl font-bold">Windows S Mode needs to be turned off first</h1><p className="mt-4 text-slate-700 dark:text-white/70">S Mode blocks installer tools that Shift needs. Microsoft lets you switch out of S Mode for free.</p><ol className="mt-6 list-decimal space-y-3 pl-6 text-slate-700 dark:text-white/75"><li>Open Settings.</li><li>Go to Activation.</li><li>Choose Switch out of S Mode.</li><li>Select Get from the Microsoft Store page.</li><li>Restart Shift by Sentinel after Windows confirms the change.</li></ol></div></section>;
}

function DeviceCheck({ device, readinessCopy, onBack, onNext }) {
  const rows = [["RAM", formatGb(device?.ramBytes)], ["Storage available", formatGb(device?.storageAvailableBytes)], ["CPU", device ? `${device.cpu} (${device.cpuCores} cores)` : "Checking"], ["Current OS", device?.currentOS || "Checking"], ["Secure Boot", device?.secureBoot?.enabled === true ? "Enabled" : device?.secureBoot?.enabled === false ? "Disabled" : "Not reported"]];
  return <ScreenShell title="Device Check" subtitle={readinessCopy} onBack={onBack} onNext={onNext}><div className="grid gap-4 md:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-300/60 bg-white/70 p-5 dark:border-white/10 dark:bg-white/5"><div className="text-sm text-slate-500 dark:text-white/45">{label}</div><div className="mt-2 font-semibold">{value}</div></div>)}</div>{device?.appleSiliconWarning && <p className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-amber-900 dark:text-amber-100">Apple Silicon Macs need special builds. Shift will only show operating systems that can be installed safely.</p>}{device?.productKey?.saved && <p className="mt-5 text-sm text-slate-500 dark:text-white/50">Your Windows product key was saved locally before continuing.</p>}</ScreenShell>;
}

function OSPicker({ device, selectedId, setSelectedId, expandedId, setExpandedId, onBack, onNext }) {
  return <ScreenShell title="Pick your new operating system" subtitle="Choose the desktop that fits how you use your computer." onBack={onBack} onNext={onNext}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{osCatalog.map((entry) => { const compatibility = getCompatibility(entry, device); const expanded = expandedId === entry.id; return <button key={entry.id} disabled={entry.comingSoon} onClick={() => { setSelectedId(entry.id); setExpandedId(expanded ? "" : entry.id); }} className={`text-left rounded-3xl border p-5 transition ${selectedId === entry.id ? "border-shift-accent bg-shift-accent/10 shadow-glow" : "border-slate-300/70 bg-white/75 dark:border-white/10 dark:bg-white/5"} ${entry.comingSoon ? "cursor-not-allowed opacity-50" : "hover:-translate-y-1"}`}><div className="flex items-start justify-between gap-3"><img src={entry.logo} alt="" className="h-12 w-12" /><Badge compatibility={compatibility} /></div><h3 className="mt-4 text-xl font-bold">{entry.name}</h3><p className="mt-2 text-sm text-slate-600 dark:text-white/60">{entry.description}</p>{expanded && <div className="mt-5 space-y-4"><div className="grid grid-cols-3 gap-2">{entry.screenshots.map((shot) => <img key={shot} src={shot} alt={`${entry.name} preview`} className="rounded-xl border border-white/10" />)}</div><div className="flex flex-wrap gap-2">{entry.bestFor.map((tag) => <span key={tag} className="rounded-full bg-shift-navy px-3 py-1 text-xs text-white">{tag}</span>)}</div><p className="text-xs text-slate-500 dark:text-white/45">Needs {formatGb(entry.requirements.ram)} RAM and {formatGb(entry.requirements.storage)} free storage.</p></div>}</button>; })}</div></ScreenShell>;
}

function BackupReminder({ backup, setBackup, confirmed, setConfirmed, onBack, onNext }) {
  return <ScreenShell title="Back up your important files" subtitle="Before we continue, make sure you have copied anything important somewhere safe." onBack={onBack} onNext={onNext} nextDisabled={!confirmed}>{Object.keys(backup).map((item) => <label key={item} className="mb-3 flex items-center gap-3 rounded-2xl border border-slate-300/60 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5"><input type="checkbox" checked={backup[item]} onChange={(event) => setBackup({ ...backup, [item]: event.target.checked })} />{item}</label>)}<div className="mt-6 rounded-2xl border border-red-300/30 bg-red-400/10 p-5 text-red-900 dark:text-red-100">This will replace your current operating system. This cannot be undone.</div><label className="mt-5 flex items-center gap-3 font-semibold"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I understand my current OS will be replaced</label></ScreenShell>;
}

function Preparing({ selected, progress, onCancel }) {
  const step = progress < 45 ? "Downloading" : progress < 70 ? "Verifying" : progress < 94 ? "Preparing boot" : "Ready";
  return <section className="mx-auto grid flex-1 w-full max-w-3xl place-items-center"><div className="w-full rounded-3xl border border-white/10 bg-white/80 p-8 dark:bg-white/5"><h1 className="text-3xl font-bold">Preparing {selected.name}</h1><p className="mt-2 text-slate-600 dark:text-white/60">Estimated time remaining: {Math.max(1, Math.ceil((100 - progress) / 12))} minutes</p><div className="mt-8 h-4 overflow-hidden rounded-full bg-slate-300 dark:bg-white/10"><div className="h-full rounded-full bg-shift-accent transition-all" style={{ width: `${progress}%` }} /></div><div className="mt-6 grid grid-cols-4 gap-2 text-center text-sm">{["Downloading", "Verifying", "Preparing boot", "Ready"].map((name) => <div key={name} className={name === step ? "font-bold text-shift-accent" : "text-slate-500 dark:text-white/45"}>{name}</div>)}</div><button onClick={onCancel} className="mt-8 rounded-xl border border-slate-300 px-5 py-3 dark:border-white/15">Cancel</button></div></section>;
}

function Ready({ selected, onBack }) {
  return <ScreenShell title="Ready to install" subtitle="Your installer is prepared. Restart when you are ready to begin." onBack={onBack} nextLabel="Restart to Install"><div className="rounded-3xl border border-shift-accent/40 bg-shift-accent/10 p-6"><h3 className="text-2xl font-bold">{selected.name}</h3><p className="mt-2 text-slate-600 dark:text-white/65">Download size: {selected.downloadSize}</p><p className="text-slate-600 dark:text-white/65">Estimated install time: {selected.installTime}</p></div><ul className="mt-6 list-disc space-y-3 pl-6 text-slate-700 dark:text-white/70"><li>Your computer will restart into the installer.</li><li>You will choose your language, keyboard, and account name.</li><li>Shift will guide you back if your device needs Secure Boot changes.</li></ul></ScreenShell>;
}

function ScreenShell({ title, subtitle, children, onBack, onNext, nextDisabled, nextLabel = "Next" }) {
  return <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center py-8"><div className="mb-8"><h1 className="text-4xl font-black tracking-tight">{title}</h1><p className="mt-3 max-w-2xl text-slate-600 dark:text-white/60">{subtitle}</p></div><div>{children}</div><div className="mt-8 flex justify-between"><button onClick={onBack} className="rounded-xl border border-slate-300 px-5 py-3 dark:border-white/15">Back</button><button disabled={nextDisabled} onClick={onNext} className="rounded-xl bg-shift-accent px-6 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{nextLabel}</button></div></section>;
}

createRoot(document.getElementById("root")).render(<App />);
