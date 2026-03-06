const { app, BrowserWindow, ipcMain } = require('electron');
const { join } = require('path');

const PORT = parseInt(process.env.PORT || '3210', 10);
const HOST = process.env.HOST || '127.0.0.1';

let mainWindow: any = null;

function startServer(): void {
	// Point core's router at the built SPA
	process.env.OMO_GUI_DIR = join(__dirname, '..', 'build');

	const { initialize, createServer } = require(join(__dirname, 'server-entry.cjs'));
	initialize();
	createServer({ port: PORT, hostname: HOST });
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		frame: false,
		title: 'omo reader',
		backgroundColor: '#0a0a0f',
		webPreferences: {
			preload: join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	mainWindow.loadURL(`http://${HOST}:${PORT}`);

	mainWindow.on('closed', () => {
		mainWindow = null;
	});

	mainWindow.on('maximize', () => {
		mainWindow?.webContents.send('window-maximized', true);
	});

	mainWindow.on('unmaximize', () => {
		mainWindow?.webContents.send('window-maximized', false);
	});
}

app.whenReady().then(() => {
	ipcMain.handle('window-minimize', () => mainWindow?.minimize());
	ipcMain.handle('window-maximize', () => {
		if (mainWindow?.isMaximized()) {
			mainWindow.unmaximize();
		} else {
			mainWindow?.maximize();
		}
	});
	ipcMain.handle('window-close', () => mainWindow?.close());
	ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

	startServer();
	createWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
