import { app, BrowserWindow, ipcMain, Menu, net, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;
const APP_ID = 'com.dhyana.meditation';
function resolveWindowIconPath() {
    if (isDev)
        return path.join(app.getAppPath(), 'build', 'icon.ico');
    return path.join(process.resourcesPath, 'icon.ico');
}
/** Hosts the renderer is allowed to reach via main-process fetch (CORS-safe packaged builds). */
const NET_FETCH_ALLOWED_HOSTS = new Set([
    'api.openai.com',
    'api-inference.huggingface.co',
    'router.huggingface.co',
    'api.elevenlabs.io',
    'generativelanguage.googleapis.com',
]);
function assertNetFetchUrl(urlString) {
    let u;
    try {
        u = new URL(urlString);
    }
    catch {
        throw new Error('Invalid URL');
    }
    const proto = u.protocol.toLowerCase();
    if (proto !== 'https:' && proto !== 'http:') {
        throw new Error(`Blocked fetch protocol: ${proto}`);
    }
    const host = u.hostname.toLowerCase();
    if (!NET_FETCH_ALLOWED_HOSTS.has(host)) {
        throw new Error(`Blocked fetch host: ${host}`);
    }
}
function assertOpenExternalUrl(urlString) {
    let u;
    try {
        u = new URL(urlString);
    }
    catch {
        throw new Error('Invalid URL');
    }
    const p = u.protocol.toLowerCase();
    if (p !== 'https:' && p !== 'http:') {
        throw new Error('Only http(s) links can be opened in the browser');
    }
}
ipcMain.handle('open-external', async (_event, url) => {
    assertOpenExternalUrl(url);
    await shell.openExternal(url);
});
ipcMain.handle('electron-net-fetch', async (_event, payload) => {
    assertNetFetchUrl(payload.url);
    const res = await net.fetch(payload.url, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body ?? undefined,
    });
    const body = await res.arrayBuffer();
    const headers = {};
    res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
    });
    return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers,
        body,
    };
});
function createWindow() {
    // Remove the native application menu bar (File/Edit/View/Window/Help).
    Menu.setApplicationMenu(null);
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'ZenGM - Guided Meditation Generator',
        backgroundColor: '#f7f7f7',
        icon: resolveWindowIconPath(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    if (isDev) {
        const port = process.env.VITE_PORT || '3000';
        win.loadURL(`http://localhost:${port}`);
    }
    else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    win.webContents.setWindowOpenHandler((details) => {
        const url = details.url;
        if (url.startsWith('https:') || url.startsWith('http:')) {
            void shell.openExternal(url);
        }
        return { action: 'deny' };
    });
}
app.setAppUserModelId(APP_ID);
app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
