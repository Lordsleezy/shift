const WEBVM_ALPINE_DESKTOP = "https://webvm.io/alpine.html";
const WEBVM_DEBIAN = "https://webvm.io";

const WEBVM_DEMO_URLS = {
  zorin: WEBVM_ALPINE_DESKTOP,
  mint: WEBVM_ALPINE_DESKTOP,
  popos: WEBVM_ALPINE_DESKTOP,
  elementary: WEBVM_ALPINE_DESKTOP,
  ubuntu: WEBVM_DEBIAN,
  nobara: WEBVM_ALPINE_DESKTOP
};

const DISTRO_SOURCES = {
  zorin: {
    url: "https://mirrors.edge.kernel.org/zorinos-isos/17/Zorin-OS-17.3-Core-64-bit-r2.iso",
    filename: "Zorin-OS-17.3-Core-64-bit-r2.iso",
    sha256: "c1510d1e16ec50c884faeb4e32326ba8d2e38d2cf22698b649168011d00220f6"
  },
  mint: {
    url: "https://mirrors.kernel.org/linuxmint/stable/22.1/linuxmint-22.1-cinnamon-64bit.iso",
    filename: "linuxmint-22.1-cinnamon-64bit.iso",
    sha256: "ccf482436df954c0ad6d41123a49fde79352ca71f7a684a97d5e0a0c39d7f39f"
  },
  popos: {
    url: "https://iso.pop-os.org/22.04/amd64/intel/35/pop-os_22.04_amd64_intel_35.iso",
    filename: "pop-os_22.04_amd64_intel_35.iso",
    checksumUrl: "https://iso.pop-os.org/22.04/amd64/intel/35/SHA256SUMS"
  },
  elementary: {
    manualDownloadOnly: true,
    filename: "elementaryos-8.1-stable-amd64.20260219.iso",
    sha256: "bda93040d08c05911fb159f8150bf8f4ef2db6567ef6e2acd197cb6f395d3446",
    manualDownloadUrl: "https://elementary.io/"
  },
  ubuntu: {
    url: "https://releases.ubuntu.com/24.04.4/ubuntu-24.04.4-desktop-amd64.iso",
    filename: "ubuntu-24.04.4-desktop-amd64.iso",
    sha256: "3a4c9877b483ab46d7c3fbe165a0db275e1ae3cfe56a5657e5a47c2f99a99d1e"
  },
  nobara: {
    url: "https://nobara-images.nobaraproject.org/Nobara-41-Official-2024-12-31.iso",
    filename: "Nobara-41-Official-2024-12-31.iso"
  },
  steamos: {
    comingSoon: true
  }
};

const DISTRO_NAMES = {
  zorin: "Zorin OS",
  mint: "Linux Mint",
  popos: "Pop!_OS",
  elementary: "elementary OS",
  ubuntu: "Ubuntu",
  nobara: "Nobara Linux",
  steamos: "SteamOS"
};

function getDistroSource(distroId) {
  return DISTRO_SOURCES[distroId] || null;
}

function getDistroName(distroId) {
  return DISTRO_NAMES[distroId] || distroId;
}

function getWebvmDemoUrl(distroId) {
  return WEBVM_DEMO_URLS[distroId] || null;
}

module.exports = {
  DISTRO_SOURCES,
  DISTRO_NAMES,
  WEBVM_DEMO_URLS,
  getDistroSource,
  getDistroName,
  getWebvmDemoUrl
};
