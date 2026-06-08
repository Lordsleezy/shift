const fs = require("fs");
const https = require("https");
const http = require("http");
const { URL } = require("url");
const path = require("path");

function downloadFile(url, destPath, onProgress, signal) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const tempPath = `${destPath}.part`;

    function follow(currentUrl, redirects = 0) {
      if (redirects > 10) {
        reject(new Error("Too many redirects while downloading ISO"));
        return;
      }

      const parsed = new URL(currentUrl);
      const lib = parsed.protocol === "https:" ? https : http;

      const req = lib.get(
        currentUrl,
        { headers: { "User-Agent": "Shift-by-Sentinel/0.1" } },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume();
            follow(new URL(res.headers.location, currentUrl).href, redirects + 1);
            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            return;
          }

          const total = Number(res.headers["content-length"] || 0);
          let received = 0;
          const file = fs.createWriteStream(tempPath);

          res.on("data", (chunk) => {
            if (signal?.aborted) {
              req.destroy();
              file.close(() => {
                fs.unlink(tempPath, () => reject(new Error("Download cancelled")));
              });
              return;
            }
            received += chunk.length;
            onProgress?.({
              phase: "download",
              received,
              total,
              percent: total ? Math.round((received / total) * 100) : null
            });
          });

          res.pipe(file);
          file.on("finish", () => {
            file.close(() => {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              fs.renameSync(tempPath, destPath);
              resolve({ path: destPath, bytes: received });
            });
          });
          file.on("error", (err) => {
            fs.unlink(tempPath, () => reject(err));
          });
        }
      );

      req.on("error", reject);
      if (signal) {
        signal.addEventListener("abort", () => req.destroy());
      }
    }

    follow(url);
  });
}

module.exports = { downloadFile };
