// Only the bundled top-level window may call privileged Electron IPC handlers.
exports.trustedSender = (event, window, expectedURL) => Boolean(
  window && event.sender === window.webContents &&
  event.senderFrame === window.webContents.mainFrame &&
  event.senderFrame?.url === expectedURL
);
