const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const schedule = require('node-schedule');
// const AutoLaunch = require('auto-launch');

let mainWindow;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettingsFromFile() {
    try {
        if (!fs.existsSync(settingsPath)) {
            return {
                savePath: '',
                scheduleTime: '',
                clan_id: '',
                autoLaunch: false,
                saveFormat: 'excel'
            };
        }
        const data = fs.readFileSync(settingsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {
            savePath: '',
            scheduleTime: '',
            clan_id: '',
            autoLaunch: false,
            saveFormat: 'excel'
        };
    }
}

// Обработчики IPC
// Для более безопасной обработки функций, что вызывается в html файлом
// Грубо говоря, это некий мост между этим файлом (index.js) и html
// Все функции, которые вызываются в html - обрабытываюься этим "мостом". 
// В свою же очередь, этот мост вызывает функции внутри этого "Главного" файла

ipcMain.handle('save-settings', async (event, settings) => {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        setupScheduledTasks();
        return true;
    } catch (error) {
        console.error('Error saving settings:', error);
        return false;
    }
});

ipcMain.handle('get-settings', async () => {
    return loadSettingsFromFile();
});

ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('set-auto-launch', async (event, enable) => {
    try {
        if (enable) {
            await autoLauncher.enable();
        } else {
            await autoLauncher.disable();
        }
        return true;
    } catch (error) {
        console.error('Auto-launch error:', error);
        return false;
    }
});

// Настройка планировщика задач
function setupScheduledTasks() {
    const settings = loadSettingsFromFile();
    
    schedule.gracefulShutdown();
    
    if (settings && settings.scheduleTime && settings.clan_id) {
        const [hours, minutes, seconds] = settings.scheduleTime.split(':');
        schedule.scheduleJob(`${seconds} ${minutes} ${hours} * * *`, async () => {
            await processClansList(settings.clan_id, settings);
        });
        console.log(`The data will be fetched at ${hours}:${minutes}:${seconds}`);
    }
}

async function processClansList(clanIds, settings) {
    try {
        const ids = clanIds.split(',').map(id => id.trim()).filter(id => id);
        console.log('Processing clan IDs:', ids);
        
        for (const id of ids) {
            console.log(`Processing clan with ID: ${id}`);
            const data = await getData(id, true);
            
            if (data && !data.error) {
                await saveDataToFile(data, settings);
                console.log(`Clan ${id} data successfully saved`);
            } else {
                console.error(`Error processing clan with ID: ${id}`, data);
                await saveErrorLog(data?.info?.name || id, settings);
            }
        }
    } catch (error) {
        console.error('Error in processClansList:', error);
        await saveErrorLog('unknown', settings);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 720,
        height: 800,
        autoHideMenuBar: true,
        icon: path.join(__dirname, '/img/ferret.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
    createWindow();
    setupScheduledTasks();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// const exePath = app.getPath('exe');

// const autoLauncher = new AutoLaunch({
//     name: app.getName('Squirrel EXperience. Statistics Saver'),
//     path: exePath,
// });

// Получение данных
async function getData(id, isClan) {
    const maxRetries = 3;
    const delay = 1500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} get data for ${isClan ? 'player' : 'clan'}, UID (id): ${id}`);
            const response = await fetch(`https://squirrelsquery.yukkerike.ru/${isClan ? 'clan' : 'user'}/${id}?json`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`Successfully received data for ${isClan ? 'clan' : 'player'}, UID (id): ${id}`);    
            
            if (isClan) {
                return await processClanData(data);
            }
            return data;
        } catch (error) {
            console.error(`Attempt  ${attempt} failed:`, error);
            console.log(`Waiting ${delay/1500} seconds before next attempt...`);
            if (attempt === maxRetries) {
                console.error(`All ${maxRetries} attempts failed for ${isClan ? 'clan' : 'player'} ${id}`);
                return {
                    error: "Error fetching data",
                    time: new Date().toISOString(),
                    details: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Если игрок покинул клан, получаем его актуальные данные
async function processClanData(clanData) {
    if (!clanData || !clanData.statistics) {
        return clanData;
    }

    for (let i = 0; i < clanData.statistics.length; i++) {
        const player = clanData.statistics[i];
        player.index = i + 1;
        if (!player.uid.exp) {
            const playerData = await getData(player.uid.uid, false);
            if (playerData && !playerData.error) {
                player.uid.exp = playerData.exp;
                player.uid.name = `${playerData.name} | покинул клан`;
            } else {
                player.uid.exp = 'нет данных';
            }
        }
    }

    return clanData;
}

// Сохранение в файл Json
async function saveDataToFile(data, settings) {
    const now = new Date();

    const dateStr = now.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).replace(/\//g, '.');
    
    const timeStr = now.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).replace(/:/g, '.');

    const fileName = `clan_statistics-${data.info.name || 'unknown'}[${dateStr}_${timeStr}]`;

    if (!fs.existsSync(settings.savePath)) {
        fs.mkdirSync(settings.savePath, { recursive: true });
    }

    const formattedData = {
        date: now.toLocaleString(),
        id: data.id,
        name: data.info.name,
        total_players_exp: data.rank.dailyPlayerExp,
        total_clan_exp: data.rank.dailyExp,
        total_raiting_exp: data.rank.DailyTotalRaiting,
        headers: [
            "№",
            "UID",
            "Ник",
            "Опыт игрока",
            "Опыт клана",
            "Очки рейтинга",
            "Общий опыт игрока"
        ],
        rows: data.statistics.map((player, index) => [
            player.index,
            player.uid.uid,
            player.uid.name,
            player.samples,
            player.exp,
            player.clan_rating,
            player.uid.exp
        ])
    };

    if (settings.saveFormat === 'json') {
        const filePath = path.join(settings.savePath, `${fileName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(formattedData, null, 2));
    } else if (settings.saveFormat === 'excel') {
        await saveToExcel(formattedData, settings.savePath, fileName);
    }
}

// Сохранение в Excel
async function saveToExcel(data, savePath, fileName) {

    const excelJS = require('exceljs');
    const workbook = new excelJS.Workbook();
    const sheet = workbook.addWorksheet('Статистика клана');
    
    sheet.addRow(["ID клана:", data.id]);
    sheet.addRow(["Название клана:", data.name]);
    sheet.addRow(["Дата сохранения:", data.date]);

    const headerRow = sheet.addRow(data.headers);
    headerRow.eachCell(cell => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '1B3A57' }
        };
        cell.font = { 
            color: { argb: 'FFFFFFFF' },
            bold: true 
        };
        cell.alignment = { horizontal: 'center' };
    });

    data.rows.forEach((row, index) => {
        const excelRow = sheet.addRow(row);
        excelRow.eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: index % 2 === 0 ? 'B0C4DE' : 'D6E4F0' }
            };
            cell.alignment = { horizontal: 'left' };
        });
    });

    sheet.addRow([
        "Всего:", "", "",
        data.total_players_exp,
        data.total_clan_exp,
        data.total_raiting_exp
    ]);
    
    sheet.columns.forEach(column => {
        column.width = 20;
    });

    await workbook.xlsx.writeFile(path.join(savePath, `${fileName}.xlsx`));
}

// Сохранение в файла с ошибками. И обработчик для определения в каком виде сохранять файл
async function saveErrorLog(clanName, settings) {
    try {
        const now = new Date();
        const dateStr = now.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '.');
        
        const timeStr = now.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).replace(/:/g, '.');

        const fileName = `error_clan_id_${clanName || 'unknown'}[${dateStr}_${timeStr}]`;

        if (!fs.existsSync(settings.savePath)) {
            fs.mkdirSync(settings.savePath, { recursive: true });
        }

        if (settings.saveFormat === 'json') {
            const errorData = {
                error: "Произошла ошибка",
                possible_reasons: [
                    "Отсутствовал интернет",
                    "Сервер игры отключен",
                    "ID клана указан неправильно",
                    "Разрыв соединения из-за долгого ожидания ответа"
                ],
                time: now.toLocaleString()
            };
            const filePath = path.join(settings.savePath, `${fileName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(errorData, null, 2));
        } else if (settings.saveFormat === 'excel') {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Ошибка');
            
            sheet.addRow(["Произошла ошибка"]);
            sheet.addRow(["Время:", now.toLocaleString()]);
            sheet.addRow(["Возможные причины:"]);
            sheet.addRow(["1. Отсутствовал интернет"]);
            sheet.addRow(["2. Сервер игры отключен"]);
            sheet.addRow(["3. ID клана указан неправильно"]);
            sheet.addRow(["4. Разрыв соединения из-за долгого ожидания ответа"]);

            const filePath = path.join(settings.savePath, `${fileName}.xlsx`);
            await workbook.xlsx.writeFile(filePath);
        }

        console.log(`Error file saved: ${fileName}`);
    } catch (error) {
        console.error('Error saving error file:', error);
    }
}