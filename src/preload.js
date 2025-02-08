const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveSettings: async (settings) => {
        return await ipcRenderer.invoke('save-settings', settings);
    },
    fetchClansData: async (settings) => {
        return await ipcRenderer.invoke('fetch-clans-data', settings);
    },
    getSettings: async () => {
        try {
            return await ipcRenderer.invoke('get-settings');
        } catch (error) {
            console.error('Error in getSettings:', error);
            return {};
        }
    },
    selectDirectory: async () => {
        try {
            return await ipcRenderer.invoke('select-directory');
        } catch (error) {
            console.error('Error in selectDirectory:', error);
            return null;
        }
    },
    setAutoLaunch: async (enable) => {
        try {
            return await ipcRenderer.invoke('set-auto-launch', enable);
        } catch (error) {
            console.error('Error in setAutoLaunch:', error);
            return false;
        }
    }
});
