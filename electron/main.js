// ContextForge desktop wrapper (Electron).
//
// ContextForge is a static, zero-dependency web app. This file does not add any
// new behaviour to it — it just launches the SAME app you already use on Netlify,
// served from a tiny local HTTP server on 127.0.0.1, inside a native window.
//
// Why a local server instead of loading the file directly (file://)?
// The File System Access API (window.showDirectoryPicker, used for "Select Project")
// is a secure-context feature. It is reliably available on http://localhost in all
// Chromium builds (including Electron's), so serving locally guarantees the folder
// picker and "Download All to Folder" work exactly like they do in Chrome/Edge.
'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Reuse the project's own static file map so behaviour matches `npm run preview`.
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

// In a packaged app, electron-builder puts extra resources under process.resourcesPath.
// In dev (npm run electron:dev) we read straight from the dist/ folder next to this file.
const DIST_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '..', 'dist');

let server;
let serverPort = 0;

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const rel = path.normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^(\.\.[/\\])+/, '');
        const file = path.join(DIST_DIR, rel);
        if (!file.startsWith(DIST_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
        const data = await fs.promises.readFile(file);
        const ext = path.extname(file);
        res.writeHead(200, { 'Content-Type': `${TYPES[ext] || 'application/octet-stream'}; charset=utf-8` });
        res.end(data);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });
    // Port 0 = let the OS assign a free local port; this app only ever listens on 127.0.0.1.
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
    server.on('error', reject);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#09090b',
    title: 'ContextForge',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadURL(`http://127.0.0.1:${serverPort}/`);

  // Any attempt to open an external link opens the user's default browser instead
  // of a second Electron window (there are none in this app, but this is a safe default).
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});
