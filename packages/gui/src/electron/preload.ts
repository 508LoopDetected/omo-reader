const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
	minimize: () => ipcRenderer.invoke('window-minimize'),
	toggleMaximize: () => ipcRenderer.invoke('window-maximize'),
	close: () => ipcRenderer.invoke('window-close'),
	isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
	onMaximizedChange: (callback: (maximized: boolean) => void) => {
		ipcRenderer.on('window-maximized', (_event: any, maximized: boolean) => callback(maximized));
	},
});
