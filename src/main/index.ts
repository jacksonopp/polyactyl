import { app, BrowserWindow, Menu, MenuItem, nativeImage, shell } from 'electron';
import { join } from 'path';

import { registerIpcHandlers } from './ipcHandlers';

function sendMenuAction(action: string) {
  const wins = BrowserWindow.getAllWindows();
  wins.forEach(w => w.webContents.send('menu:action', action));
}

function buildMenu(): Menu {
  const isMac = process.platform === 'darwin';

  const template: (Electron.MenuItemConstructorOptions | MenuItem)[] = [
    // macOS app menu
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),

    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuAction('file:openFolder'),
        },
        {
          label: 'Open File…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendMenuAction('file:openFile'),
        },
        { type: 'separator' },
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuAction('file:newFile'),
        },
        {
          label: 'New Folder',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendMenuAction('file:newFolder'),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuAction('file:save'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },

    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },

    {
      label: 'View',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+P',
          click: () => sendMenuAction('view:commandPalette'),
        },
        {
          label: 'Command Palette (Actions)',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => sendMenuAction('view:commandPaletteActions'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Empty Folders',
          click: () => sendMenuAction('view:toggleEmptyFolders'),
        },
        { type: 'separator' },
        { role: 'reload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' },
        { role: 'togglefullscreen' as const },
      ],
    },

    {
      label: 'Git',
      submenu: [
        {
          label: 'Switch Branch…',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => sendMenuAction('git:switchBranch'),
        },
        { type: 'separator' },
        {
          label: 'Fetch',
          click: () => sendMenuAction('git:fetch'),
        },
        {
          label: 'Pull',
          click: () => sendMenuAction('git:pull'),
        },
        {
          label: 'Push',
          click: () => sendMenuAction('git:push'),
        },
        { type: 'separator' },
        {
          label: 'Commit…',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => sendMenuAction('git:commit'),
        },
      ],
    },

    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function createWindow(): BrowserWindow {
  const icon = nativeImage.createFromPath(join(__dirname, '../../assets/polyactyl.png'));
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Polyactyl',
    icon,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  Menu.setApplicationMenu(buildMenu());
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
