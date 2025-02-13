const { app, BrowserWindow, ipcMain, dialog } = require('electron');

const fs = require('fs');
const path = require('path');
const excelJS = require('exceljs');
const schedule = require('node-schedule');

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

let mainWindow;

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

// Обработчики IPC
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

// Настройка планировщика задач
function setupScheduledTasks() {
    const settings = loadSettingsFromFile();
    
    schedule.gracefulShutdown();
    
    if (settings && settings.scheduleTime && settings.clan_id) {
        const [hours, minutes, seconds] = settings.scheduleTime.split(':');
        schedule.scheduleJob(`${seconds} ${minutes} ${hours} * * *`, async () => {
            await processClansList(settings.clan_id, settings);
        });
        console.log(`Data will be fetched at: ${hours}:${minutes}:${seconds}`);
    }
}

// Обработчик запросов на получение данных. И уведомление на главном окне после завершения обработки. 
async function processClansList(clanIds, settings) {
    try {
        const ids = clanIds
            .replace(/\s+/g, '')
            .split(',')
            .filter(id => id);

        const failedClanIds = [];
        console.log(`Received list of clan IDs to process, count: ${ids.length}, IDs: ${ids}`);

        for (const id of ids) {
            console.log(`Processing clan with id: ${id}`);
            const data = await getData(id, true);
            
            if (data && !data.error) {
                await saveDataToFile(data, settings);
                console.log(`Clan with id: ${id} - successfully saved`);
            } else {
                await saveErrorLog(data?.info?.name || id, settings);
                failedClanIds.push(id);
            }
        }

        const message = failedClanIds.length
        ? `Не удалось получить данные и сохранить статистику для кланов с ID: ${failedClanIds.join(', ')}`
        : 'Статистика всех кланов успешно сохранена';

        console.log("All clans are saved");

        mainWindow.webContents.send('clans-saved', message);

    } catch (error) {
        console.error('Error in processClansList:', error);
        await saveErrorLog('unknown', settings);
    }
}

// Получение данных
async function getData(id, isClan) {
    const maxRetries = 3;
    const delay = 1500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(`https://squirrelsquery.yukkerike.ru/${isClan ? 'clan' : 'user'}/${id}?json`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (isClan) {
                return await getUsers(data);
            }

            return data;
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error);
            console.log(`Waiting ${delay} seconds before next attempt...`);
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
async function getUsers(clanData) {
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

// Генерации имени файла
function generateFileName(prefix, name) {
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

    return `${prefix}_${name || 'клан распущен, закрыт'}[${dateStr}_${timeStr}]`;
}

// Определение и сохранения файла в нужный формат. JSON и / или Excel.
async function saveDataToFile(data, settings) {
    const now = new Date();
    const fileName = generateFileName('clan_statistics', data.info.name);
    const filePath = path.join(settings.savePath, `${fileName}.json`);

    fs.mkdirSync(settings.savePath, { recursive: true });

    const formattedData = {
        date: now.toLocaleString(),
        id: data.id,
        leader_uid: data.leader_id.uid,
        name: data.info.name,
        total_players_exp: data.rank.dailyPlayerExp,
        total_clan_exp: data.rank.dailyExp,
        total_rating_exp: data.rank.DailyTotalRaiting,
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

    switch (settings.saveFormat) {
        case 'json':
            await fs.promises.writeFile(filePath, JSON.stringify(formattedData, null, 2));
            break;
        case 'excel':
            await saveToExcel(formattedData, settings.savePath, fileName);
            break;
        default:
            await fs.promises.writeFile(filePath, JSON.stringify(formattedData, null, 2));
            await saveToExcel(formattedData, settings.savePath, fileName);
            break;
    }
}

// Сохранение в Excel
async function saveToExcel(data, savePath, fileName) {
    const workbook = new excelJS.Workbook();
    const sheet = workbook.addWorksheet('Статистика клана');

    sheet.addRow(["ID клана:", data.id]);
    sheet.addRow(["UID вождя:", data.leader_uid]);
    sheet.addRow(["Название клана:", data.name]);
    sheet.addRow(["Дата сохранения:", data.date]);

    const headerRow = sheet.addRow(data.headers);
    headerRow.eachCell(cell => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '1B3A57' }
        };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
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

// Сохранение файла с ошибкой
async function saveErrorLog(clanName, settings) {
    try {
        const now = new Date();
        const fileName = generateFileName('error_clan_id', clanName);
        const savePath = settings.savePath;

        fs.mkdirSync(savePath, { recursive: true });

        const errorData = {
            error: "Произошла ошибка",
            time: now.toLocaleString(),
            possible_reasons: [
                "Отсутствовал интернет",
                "Сервер игры отключен",
                "ID клана указан неправильно",
                "Разрыв соединения из-за долгого ожидания ответа"
            ],
            
        };

        let filePath;
        switch (settings.saveFormat) {
            case 'json':
                filePath = path.join(savePath, `${fileName}.json`);
                await fs.promises.writeFile(filePath, JSON.stringify(errorData, null, 2));
                break;
            case 'excel':
                filePath = path.join(savePath, `${fileName}.xlsx`);
                await saveErrorToExcel(filePath, now);
                break;
            default:
                filePath = path.join(savePath, `${fileName}.json`);
                await fs.promises.writeFile(filePath, JSON.stringify(errorData, null, 2));

                const excelFilePath = path.join(savePath, `${fileName}.xlsx`);
                await saveErrorToExcel(excelFilePath, now);
                break;
        }

        console.log(`Error. File with possible reasons created: ${fileName}`);
    } catch (error) {
        console.error('Error saving error file:', error);
    }
}

// Избежание дублирования кода для сохранения ошибки в Excel
async function saveErrorToExcel(filePath, now) {
    const workbook = new excelJS.Workbook();
    const sheet = workbook.addWorksheet('Ошибка');

    sheet.addRow(["Произошла ошибка"]);
    sheet.addRow(["Время:", now.toLocaleString()]);
    sheet.addRow(["Возможные причины:"]);
    sheet.addRow(["1. Отсутствовал интернет"]);
    sheet.addRow(["2. Сервер игры отключен"]);
    sheet.addRow(["3. ID клана указан неправильно"]);
    sheet.addRow(["4. Разрыв соединения из-за долгого ожидания ответа"]);

    await workbook.xlsx.writeFile(filePath);
}