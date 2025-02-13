const timeInputs = {
    hours: document.getElementById('hours'),
    minutes: document.getElementById('minutes'),
    seconds: document.getElementById('seconds')
};

function setTime(hours, minutes, seconds) {
    timeInputs.hours.value = hours.toString().padStart(2, '0');
    timeInputs.minutes.value = minutes.toString().padStart(2, '0');
    timeInputs.seconds.value = seconds.toString().padStart(2, '0');
}

function setMidnight() {
    setTime(0, 0, 0);
}

function setCurrentTime() {
    const now = new Date();
    setTime(now.getHours(), now.getMinutes(), now.getSeconds());
}

function adjustHours(change) {
    let currentHours = parseInt(timeInputs.hours.value);
    currentHours = (currentHours + change + 24) % 24;
    setTime(currentHours, parseInt(timeInputs.minutes.value), parseInt(timeInputs.seconds.value));
}

function adjustSeconds(change) {
    let currentHours = parseInt(timeInputs.hours.value) || 0;
    let currentMinutes = parseInt(timeInputs.minutes.value) || 0;
    let currentSeconds = parseInt(timeInputs.seconds.value) || 0;

    currentSeconds += change;

    if (currentSeconds >= 60) {
        currentMinutes += Math.floor(currentSeconds / 60);
        currentSeconds = Math.min(currentSeconds % 60, 59);
    } else if (currentSeconds < 0) {
        if (currentMinutes > 0 || currentHours > 0) {
            if (currentMinutes === 0) {
                currentHours--;
                currentMinutes = 59;
            } else {
                currentMinutes--;
            }
            currentSeconds = Math.max(60 + currentSeconds, 0);
        } else {
            currentSeconds = 0;
        }
    }

    if (currentMinutes >= 60) {
        currentHours += Math.floor(currentMinutes / 60);
        currentMinutes = currentMinutes % 60;
    }

    currentHours = currentHours % 24;

    setTime(currentHours, currentMinutes, currentSeconds);
}

async function saveSettings() {
    const hours = document.getElementById('hours').value.padStart(2, '0');
    const minutes = document.getElementById('minutes').value.padStart(2, '0');
    const seconds = document.getElementById('seconds').value.padStart(2, '0');
    const getPath = document.getElementById('savePath').value;
    const checkPath = /^[A-Za-z]:\\/.test(getPath);
    const path = checkPath ? getPath : `D:\\Squirrel EXperience Statistics Saver\\${getPath}`;

    const settings = {
        savePath: path,
        scheduleTime: `${hours}:${minutes}:${seconds}`,
        clan_id: document.getElementById('clan_id').value,
        saveFormat: document.getElementById('saveFormat').value
    };

    const success = await window.electronAPI.saveSettings(settings);
    const button = document.querySelector('.save-button');
    const originalText = button.textContent;
    button.disabled = true;

    if (success) {
        button.textContent = 'Сохранено';
        button.classList.add('success');
    } else {
        button.textContent = 'Не удалось сохранить настройки';
        button.classList.add('error');
    }

    setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('success', 'error');
        button.disabled = false;
    }, 1700);
}

async function loadSettings() {
    const settings = await window.electronAPI.getSettings();
    document.getElementById('savePath').value = settings.savePath || '';
    
    if (settings.scheduleTime) {
        const [hours, minutes, seconds] = settings.scheduleTime.split(':');
        document.getElementById('hours').value = hours;
        document.getElementById('minutes').value = minutes;
        document.getElementById('seconds').value = seconds;
    }
    
    document.getElementById('clan_id').value = settings.clan_id || '';
    document.getElementById('saveFormat').value = settings.saveFormat || 'excel';
}

async function selectDirectory() {
    try {
        const path = await window.electronAPI.selectDirectory();
        if (path) {
            document.getElementById('savePath').value = path;
        }
    } catch (error) {
        console.error('Ошибка при выборе директории:', error);
    }
}

function clearClanId() {
    document.getElementById('clan_id').value = '';
    document.getElementById('clan_id').focus();
}

function timeInput(input, nextId, lastId) {
    input.value = input.value.replace(/[^0-9]/g, '');

    if (input.id === 'hours' && input.value > 23) input.value = 23;
    if (input.id === 'minutes' && input.value > 59) input.value = 59;
    if (input.id === 'seconds' && input.value > 59) input.value = 59;

    if (input.value.length >= 2 && nextId) {
        const currentValue = input.value;
        const nextInput = document.getElementById(nextId);
        nextInput.focus();
        nextInput.value = currentValue.slice(2);
        input.value = currentValue.slice(0, 2);
    }

    if (input.id === lastId) {
        const totalValue = (timeInputs.hours.value + timeInputs.minutes.value + timeInputs.seconds.value).replace(/[^0-9]/g, '');
        
        if (totalValue.length >= 6) {
            document.getElementById('hours').value = totalValue.slice(0, 2);
            document.getElementById('minutes').value = totalValue.slice(2, 4);
            document.getElementById('seconds').value = totalValue.slice(4, 6);
        }
    }
}

function setTimeFormat() {
    const timeInputs = ['hours', 'minutes', 'seconds'];
    
    timeInputs.forEach(id => {
        const input = document.getElementById(id);
        input.addEventListener('blur', () => formatTimeInput(input));
    });
}

function formatTimeInput(input) {
    if (input.value && input.value.length === 1) {
        input.value = input.value.padStart(2, '0');
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const infoToggles = document.querySelectorAll('.info-toggle');

    infoToggles.forEach(toggle => {
        toggle.addEventListener('click', function () {
            const content = this.nextElementSibling;

            if (content.classList.contains('show')) {
                content.style.maxHeight = content.scrollHeight + 'px';
                requestAnimationFrame(() => {
                    content.style.maxHeight = '0';
                    content.style.opacity = '0';
                    content.style.transform = 'translateY(-5px)';
                });

                content.addEventListener('transitionend', function handler(event) {
                    if (event.propertyName === 'max-height' && content.style.maxHeight === '0px') {
                        content.classList.remove('show');
                        content.removeEventListener('transitionend', handler);
                    }
                });
            } else {
                content.classList.add('show');
                content.style.maxHeight = '0';
                content.style.opacity = '0';
                content.style.transform = 'translateY(-5px)';

                requestAnimationFrame(() => {
                    content.style.maxHeight = content.scrollHeight + 'px';
                    content.style.opacity = '1';
                    content.style.transform = 'translateY(0)';
                });

                content.addEventListener('transitionend', function handler(event) {
                    if (event.propertyName === 'max-height' && content.style.maxHeight !== '0px') {
                        content.removeEventListener('transitionend', handler);
                    }
                });
            }
        });
    });

    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const openContents = document.querySelectorAll('.info-content.show');
            openContents.forEach(content => {
                const currentHeight = content.offsetHeight + 'px';
                content.style.maxHeight = 'auto';
                const newHeight = content.scrollHeight + 'px';

                content.style.maxHeight = currentHeight;
                requestAnimationFrame(() => {
                    content.style.maxHeight = newHeight;
                });
            });
        }, 150);
    });
});

window.onload = function() {
    loadSettings();
    setTimeFormat();
};