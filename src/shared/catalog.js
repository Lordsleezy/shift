const gb = 1024 * 1024 * 1024;

export const osCatalog = [
  {
    id: "zorin",
    name: "Zorin OS",
    logo: "assets/os-logos/zorin.svg",
    description: "Looks and feels just like Windows. Easiest switch.",
    bestFor: ["Windows switchers", "Everyday use", "First-time Linux users"],
    requirements: { ram: 2 * gb, storage: 15 * gb },
    downloadSize: "3.5 GB",
    installTime: "25 to 35 minutes",
    screenshots: ["assets/screenshots/zorin-1.svg", "assets/screenshots/zorin-2.svg", "assets/screenshots/zorin-3.svg"]
  },
  {
    id: "mint",
    name: "Linux Mint",
    logo: "assets/os-logos/mint.svg",
    description: "Fast, stable, great for older hardware.",
    bestFor: ["Older PCs", "Stability", "Simple desktops"],
    requirements: { ram: 2 * gb, storage: 20 * gb },
    downloadSize: "2.9 GB",
    installTime: "20 to 30 minutes",
    screenshots: ["assets/screenshots/mint-1.svg", "assets/screenshots/mint-2.svg", "assets/screenshots/mint-3.svg"]
  },
  {
    id: "popos",
    name: "Pop!_OS",
    logo: "assets/os-logos/popos.svg",
    description: "Clean and productive. Great multitasking.",
    bestFor: ["Workstations", "Developers", "Multitasking"],
    requirements: { ram: 4 * gb, storage: 20 * gb },
    downloadSize: "3.1 GB",
    installTime: "25 to 40 minutes",
    screenshots: ["assets/screenshots/popos-1.svg", "assets/screenshots/popos-2.svg", "assets/screenshots/popos-3.svg"]
  },
  {
    id: "elementary",
    name: "elementary OS",
    logo: "assets/os-logos/elementary.svg",
    description: "Simple and beautiful. Feels like a Mac.",
    bestFor: ["Mac-style layouts", "Clean design", "Distraction-free work"],
    requirements: { ram: 4 * gb, storage: 20 * gb },
    downloadSize: "2.7 GB",
    installTime: "25 to 35 minutes",
    screenshots: ["assets/screenshots/elementary-1.svg", "assets/screenshots/elementary-2.svg", "assets/screenshots/elementary-3.svg"]
  },
  {
    id: "ubuntu",
    name: "Ubuntu",
    logo: "assets/os-logos/ubuntu.svg",
    description: "The most popular Linux. Huge community support.",
    bestFor: ["Broad support", "Learning Linux", "Reliable updates"],
    requirements: { ram: 4 * gb, storage: 25 * gb },
    downloadSize: "5.8 GB",
    installTime: "30 to 45 minutes",
    screenshots: ["assets/screenshots/ubuntu-1.svg", "assets/screenshots/ubuntu-2.svg", "assets/screenshots/ubuntu-3.svg"]
  },
  {
    id: "nobara",
    name: "Nobara Linux",
    logo: "assets/os-logos/nobara.svg",
    description: "Built for gaming. Best game compatibility.",
    bestFor: ["PC gaming", "Steam", "Modern graphics cards"],
    requirements: { ram: 4 * gb, storage: 40 * gb },
    downloadSize: "4.4 GB",
    installTime: "35 to 50 minutes",
    screenshots: ["assets/screenshots/nobara-1.svg", "assets/screenshots/nobara-2.svg", "assets/screenshots/nobara-3.svg"]
  },
  {
    id: "steamos",
    name: "SteamOS",
    logo: "assets/os-logos/steamos.svg",
    description: "Console-style gaming for the living room.",
    bestFor: ["TV gaming", "Steam library", "Controller-first use"],
    requirements: { ram: 4 * gb, storage: 64 * gb },
    downloadSize: "Coming soon",
    installTime: "Coming soon",
    comingSoon: true,
    screenshots: ["assets/screenshots/steamos-1.svg", "assets/screenshots/steamos-2.svg", "assets/screenshots/steamos-3.svg"]
  }
];

export function getCompatibility(osEntry, device) {
  if (!device) return { level: "unknown", label: "Checking" };
  if (osEntry.comingSoon) return { level: "soon", label: "Coming soon" };
  if (device.platform === "darwin" && device.architecture === "arm64") {
    return { level: "warning", label: "Intel Macs only" };
  }
  const ramOk = device.ramBytes >= osEntry.requirements.ram;
  const storageOk = device.storageAvailableBytes && device.storageAvailableBytes >= osEntry.requirements.storage;
  if (ramOk && storageOk) return { level: "good", label: "Compatible" };
  if (ramOk || storageOk) return { level: "warning", label: "Limited" };
  return { level: "bad", label: "Low specs" };
}
