const gb = 1024 * 1024 * 1024;

export const osCatalog = [
  {
    id: "zorin",
    name: "Zorin OS",
    logo: "assets/os-logos/zorin.svg",
    description: "Looks and feels just like Windows. Easiest switch.",
    longDescription:
      "Zorin OS rearranges the desktop to feel familiar if you are coming from Windows. Apps, settings, and updates are straightforward — no terminal required for everyday tasks.",
    bestFor: ["Windows switchers", "Everyday use", "First-time Linux users"],
    requirements: { ram: 2 * gb, storage: 15 * gb, cpuCores: 2 },
    downloadSize: "3.5 GB",
    installTime: "25 to 35 minutes",
    demoVideoId: "y9hQsD9Wq3o",
    screenshots: [
      "assets/screenshots/zorin-1.svg",
      "assets/screenshots/zorin-2.svg",
      "assets/screenshots/zorin-3.svg"
    ]
  },
  {
    id: "mint",
    name: "Linux Mint",
    logo: "assets/os-logos/mint.svg",
    description: "Fast, stable, great for older hardware.",
    longDescription:
      "Linux Mint is built for reliability. It stays out of your way, runs well on modest hardware, and includes the apps most people need from day one.",
    bestFor: ["Older PCs", "Stability", "Simple desktops"],
    requirements: { ram: 2 * gb, storage: 20 * gb, cpuCores: 2 },
    downloadSize: "2.9 GB",
    installTime: "20 to 30 minutes",
    demoVideoId: "uYd7JzK9p0E",
    screenshots: [
      "assets/screenshots/mint-1.svg",
      "assets/screenshots/mint-2.svg",
      "assets/screenshots/mint-3.svg"
    ]
  },
  {
    id: "popos",
    name: "Pop!_OS",
    logo: "assets/os-logos/popos.svg",
    description: "Clean and productive. Great multitasking.",
    longDescription:
      "Pop!_OS from System76 focuses on a clean workspace with excellent tiling and developer-friendly defaults. Ideal if you juggle many windows or write code.",
    bestFor: ["Workstations", "Developers", "Multitasking"],
    requirements: { ram: 4 * gb, storage: 20 * gb, cpuCores: 4 },
    downloadSize: "3.1 GB",
    installTime: "25 to 40 minutes",
    demoVideoId: "6P-vjg2j8Ms",
    screenshots: [
      "assets/screenshots/popos-1.svg",
      "assets/screenshots/popos-2.svg",
      "assets/screenshots/popos-3.svg"
    ]
  },
  {
    id: "elementary",
    name: "elementary OS",
    logo: "assets/os-logos/elementary.svg",
    description: "Simple and beautiful. Feels like a Mac.",
    longDescription:
      "elementary OS prioritizes calm, focused design. Every app follows the same visual language, making it a natural fit if you prefer a Mac-style desktop.",
    bestFor: ["Mac-style layouts", "Clean design", "Distraction-free work"],
    requirements: { ram: 4 * gb, storage: 20 * gb, cpuCores: 2 },
    downloadSize: "3.3 GB",
    installTime: "25 to 35 minutes",
    manualDownloadOnly: true,
    manualDownloadUrl: "https://elementary.io/",
    demoVideoId: "jJeR9Fz3oHo",
    screenshots: [
      "assets/screenshots/elementary-1.svg",
      "assets/screenshots/elementary-2.svg",
      "assets/screenshots/elementary-3.svg"
    ]
  },
  {
    id: "ubuntu",
    name: "Ubuntu",
    logo: "assets/os-logos/ubuntu.svg",
    description: "The most popular Linux. Huge community support.",
    longDescription:
      "Ubuntu is the world's most widely used desktop Linux. Massive community forums, broad hardware support, and long-term updates make it a safe default choice.",
    bestFor: ["Broad support", "Learning Linux", "Reliable updates"],
    requirements: { ram: 4 * gb, storage: 25 * gb, cpuCores: 2 },
    downloadSize: "5.8 GB",
    installTime: "30 to 45 minutes",
    demoVideoId: "XtgYQ2K9p0E",
    screenshots: [
      "assets/screenshots/ubuntu-1.svg",
      "assets/screenshots/ubuntu-2.svg",
      "assets/screenshots/ubuntu-3.svg"
    ]
  },
  {
    id: "nobara",
    name: "Nobara Linux",
    logo: "assets/os-logos/nobara.svg",
    description: "Built for gaming. Best game compatibility.",
    longDescription:
      "Nobara is Fedora tuned for gaming out of the box — drivers, Proton, and tweaks are preconfigured so Steam and modern titles work with minimal setup.",
    bestFor: ["PC gaming", "Steam", "Modern graphics cards"],
    requirements: { ram: 4 * gb, storage: 40 * gb, cpuCores: 4 },
    downloadSize: "4.4 GB",
    installTime: "35 to 50 minutes",
    demoVideoId: "k9p0E6P-vjg",
    screenshots: [
      "assets/screenshots/nobara-1.svg",
      "assets/screenshots/nobara-2.svg",
      "assets/screenshots/nobara-3.svg"
    ]
  },
  {
    id: "steamos",
    name: "SteamOS",
    logo: "assets/os-logos/steamos.svg",
    description: "Console-style gaming for the living room.",
    longDescription:
      "SteamOS turns your PC into a couch-friendly game console. Valve has not released a general desktop ISO yet — Shift will notify you when it becomes available.",
    bestFor: ["TV gaming", "Steam library", "Controller-first use"],
    requirements: { ram: 4 * gb, storage: 64 * gb, cpuCores: 4 },
    downloadSize: "Coming soon",
    installTime: "Coming soon",
    comingSoon: true,
    screenshots: [
      "assets/screenshots/steamos-1.svg",
      "assets/screenshots/steamos-2.svg",
      "assets/screenshots/steamos-3.svg"
    ]
  }
];

function hasGamingGpu(device) {
  if (!device?.gpu) return false;
  return /nvidia|amd|radeon|geforce|rtx|gtx|rx\s/i.test(device.gpu);
}

export function getCompatibility(osEntry, device) {
  if (!device) return { level: "unknown", label: "Checking", score: 0 };
  if (osEntry.comingSoon) return { level: "soon", label: "Coming soon", score: 0 };
  if (osEntry.manualDownloadOnly) return { level: "warning", label: "Manual download", score: 30 };

  if (device.platform === "darwin" && device.architecture === "arm64") {
    return { level: "warning", label: "Intel Macs only", score: 10 };
  }

  const ramOk = device.ramBytes >= osEntry.requirements.ram;
  const storageOk =
    device.storageAvailableBytes && device.storageAvailableBytes >= osEntry.requirements.storage;
  const cpuOk = !osEntry.requirements.cpuCores || device.cpuCores >= osEntry.requirements.cpuCores;

  let score = 0;
  if (ramOk) score += 35;
  if (storageOk) score += 35;
  if (cpuOk) score += 20;

  if (osEntry.id === "nobara") {
    if (hasGamingGpu(device)) score += 15;
    if (device.ramBytes < 8 * gb) {
      return { level: "warning", label: "Light gaming only", score: Math.max(score, 45), recommended: false };
    }
    if (hasGamingGpu(device) && ramOk && storageOk) {
      return { level: "good", label: "Great for gaming", score: 95, recommended: true };
    }
  }

  if ((osEntry.id === "mint" || osEntry.id === "zorin") && device.ramBytes <= 4 * gb && ramOk && storageOk) {
    return { level: "good", label: "Great for your PC", score: 92, recommended: true };
  }

  if (osEntry.id === "popos" && device.cpuCores >= 4 && ramOk && storageOk) {
    score += 10;
    return { level: "good", label: "Recommended", score: Math.min(score, 98), recommended: true };
  }

  if (ramOk && storageOk && cpuOk) {
    return {
      level: "good",
      label: "Compatible",
      score: Math.min(score + 10, 100),
      recommended: score >= 80
    };
  }
  if (ramOk || storageOk) return { level: "warning", label: "Limited", score: Math.max(score, 40) };
  return { level: "bad", label: "Low specs", score: Math.max(score, 15) };
}

export function sortByRecommendation(catalog, device) {
  return [...catalog].sort((a, b) => {
    const scoreA = getCompatibility(a, device).score || 0;
    const scoreB = getCompatibility(b, device).score || 0;
    if (a.comingSoon && !b.comingSoon) return 1;
    if (!a.comingSoon && b.comingSoon) return -1;
    return scoreB - scoreA;
  });
}
