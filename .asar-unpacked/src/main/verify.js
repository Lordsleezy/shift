const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const http = require("http");
const { URL } = require("url");

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    lib
      .get(url, { headers: { "User-Agent": "Shift-by-Sentinel/0.1" } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          fetchText(new URL(res.headers.location, url).href).then(resolve).catch(reject);
          return;
        }
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function sha256File(filePath, onProgress) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    let bytes = 0;
    const total = fs.statSync(filePath).size;

    stream.on("data", (chunk) => {
      bytes += chunk.length;
      hash.update(chunk);
      onProgress?.({
        phase: "verify",
        received: bytes,
        total,
        percent: Math.round((bytes / total) * 100)
      });
    });
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function fetchExpectedSha256(checksumUrl, isoFilename) {
  const text = await fetchText(checksumUrl);
  const line = text.split(/\r?\n/).find((entry) => entry.includes(isoFilename));
  if (!line) {
    throw new Error(`Checksum not found for ${isoFilename}`);
  }
  return line.trim().split(/\s+/)[0].replace("*", "");
}

async function verifyIso(filePath, isoConfig, onProgress) {
  let expected = isoConfig.sha256;
  if (!expected && isoConfig.checksumUrl) {
    expected = await fetchExpectedSha256(isoConfig.checksumUrl, isoConfig.filename);
  }
  if (!expected) {
    throw new Error("No checksum configured for this distro");
  }

  const actual = await sha256File(filePath, onProgress);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Checksum mismatch.\nExpected: ${expected}\nGot:      ${actual}`);
  }

  return { ok: true, sha256: actual };
}

module.exports = { verifyIso, sha256File };
