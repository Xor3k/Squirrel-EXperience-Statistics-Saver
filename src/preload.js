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
});

window.addEventListener('DOMContentLoaded', () => {
    let fadeOutTimeoutId;
    let clearTimeoutId;
    let isMessageVisible = false;

    ipcRenderer.on('clans-saved', (event, message) => {
        const messageElement = document.getElementById('message');
        if (isMessageVisible) {
            messageElement.classList.remove('show');
            messageElement.classList.add('fadeOut');

            setTimeout(() => {
                messageElement.textContent = message;
                messageElement.classList.remove('fadeOut');
                messageElement.classList.add('show');
                resetTimers();
            }, 1000);
        } else {
            messageElement.textContent = message;
            messageElement.classList.add('show');
            isMessageVisible = true;
            resetTimers(); 
        }
    });

    function resetTimers() {
        clearTimeout(fadeOutTimeoutId);
        clearTimeout(clearTimeoutId);

        fadeOutTimeoutId = setTimeout(() => {
            document.getElementById('message').classList.add('fadeOut');
        }, 30000);

        clearTimeoutId = setTimeout(() => {
            const messageElement = document.getElementById('message');
            messageElement.textContent = '';
            messageElement.classList.remove('fadeOut', 'show');
            isMessageVisible = false;
        }, 31000);
    }
});
