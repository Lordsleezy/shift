const path = require("path");
const { app } = require("electron");

function getShiftDataDir() {
  return path.join(app.getPath("userData"), "ShiftBySentinel");
}

function getIsoDir() {
  return path.join(getShiftDataDir(), "isos");
}

function getSecretsDir() {
  return path.join(getShiftDataDir(), "secrets");
}

function getInstallDir() {
  return path.join(getShiftDataDir(), "install");
}

function getIsoPath(distroId, filename) {
  return path.join(getIsoDir(), filename || `${distroId}.iso`);
}

module.exports = {
  getShiftDataDir,
  getIsoDir,
  getSecretsDir,
  getInstallDir,
  getIsoPath
};
