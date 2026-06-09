const { Menu, app } = require("electron");
const { checkForUpdatesManually } = require("./updater");

function buildAppMenu() {
  const template = [
    {
      label: "Help",
      submenu: [
        {
          label: "Check for Updates…",
          click: () => {
            checkForUpdatesManually().catch(() => {});
          }
        },
        { type: "separator" },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildAppMenu };
