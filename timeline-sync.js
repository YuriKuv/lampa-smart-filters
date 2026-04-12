(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let lastSyncTime = 0;
    let syncInProgress = false;
    let pendingSync = false;
    let currentMovieId = null;
    let periodicSyncTimer = null;
    let isPlayerOpen = false;
    let lastCurrentTime = 0;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
            sync_on_stop: true,
            sync_interval: 30,
            button_position: 'head'
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function notify(text) {
        Lampa.Noty.show(text);
    }

    // Конвертация секунд в читаемый формат (минуты:секунды)
    function formatTime(seconds) {
        if (!seconds || seconds < 0) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    // Конвертация секунд в короткий формат (минуты)
    function formatTimeShort(seconds) {
        if (!seconds || seconds < 0) return '0 мин';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 1) return '< 1 мин';
        return `${minutes} мин`;
    }

    function getCurrentProfileId() {
        const c = cfg();
        if (c.manual_profile_id) return c.manual_profile_id;
        let profileId = Lampa.Storage.get('profile_id', '');
        if (profileId) return profileId;
        const accountUser = Lampa.Storage.get('account_user', {});
        if (accountUser.profile) return String(accountUser.profile);
        return '';
    }

    function getFileViewKey() {
        const profileId = getCurrentProfileId();
        return profileId ? `file_view_${profileId}` : 'file_view';
    }

    function getFileView() {
        return Lampa.Storage.get(getFileViewKey(), {});
    }

    function setFileView(data) {
        Lampa.Storage.set(getFileViewKey(), data, true);
        return data;
    }

    function extractTmdbIdFromItem(item) {
        if (!item) return null;
        if (item.tmdb_id) return String(item.tmdb_id);
        if (item.id && /^\d{6,8}$/.test(String(item.id))) {
            return String(item.id);
        }
        if (item.movie_id && /^\d{6,8}$/.test(String(item.movie_id))) {
            return String(item.movie_id);
        }
        return null;
    }

    function extractTmdbIdFromKey(key, item) {
        if (/^\d{6,8}$/.test(key)) return key;
        if (key.startsWith('tmdb_')) return key.replace('tmdb_', '');
        if (key.startsWith('cub_') && item) {
            return extractTmdbIdFromItem(item);
        }
        return extractTmdbIdFromItem(item);
    }

    function normalizeKeys(data) {
        const result = {};
        for (const key in data) {
            const tmdbId = extractTmdbIdFromKey(key, data[key]);
            if (tmdbId) {
                if (!result[tmdbId] || (data[key].time || 0) > (result[tmdbId].time || 0)) {
                    result[tmdbId] = { ...data[key], tmdb_id: tmdbId };
                }
            } else {
                result[key] = data[key];
            }
        }
        return result;
    }

    function getProgressData() {
        return {
            version: 5,
            profile_id: getCurrentProfileId(),
            device: cfg().device_name,
            source: Lampa.Storage.field('source') || 'tmdb',
            updated: Date.now(),
            file_view: normalizeKeys(getFileView())
        };
    }

    function mergeFileView(local, remote) {
        const result = { ...local };
        let changed = false;
        
        for (const key in remote) {
            const remoteTime = remote[key]?.time || 0;
            const localTime = local[key]?.time || 0;
            
            if (!local[key]) {
                result[key] = remote[key];
                changed = true;
                console.log(`[Sync] ➕ Новый: ${key} (${formatTime(remoteTime)})`);
            } else if (remoteTime > localTime + 5) {
                result[key] = remote[key];
                changed = true;
                console.log(`[Sync] 🔄 Обновлён: ${key} (${formatTime(localTime)} → ${formatTime(remoteTime)})`);
            }
        }
        return { merged: result, changed };
    }

    function getCurrentMovieTmdbId() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                const movie = activity.movie;
                const tmdbId = extractTmdbIdFromItem(movie);
                if (tmdbId) return tmdbId;
            }
            return currentMovieId;
        } catch(e) {
            return null;
        }
    }

    function saveCurrentProgress(timeInSeconds, forceSave = false) {
        const tmdbId = getCurrentMovieTmdbId();
        if (!tmdbId) return false;
        
        const fileView = getFileView();
        const currentTime = Math.floor(timeInSeconds);
        const savedTime = fileView[tmdbId]?.time || 0;
        
        if (Math.abs(currentTime - savedTime) >= 10 || forceSave) {
            const duration = Lampa.Player.playdata()?.timeline?.duration || 0;
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            
            fileView[tmdbId] = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: Date.now()
            };
            setFileView(fileView);
            console.log(`[Sync] 💾 Сохранён прогресс: ${formatTime(currentTime)} (${percent}%) для ${tmdbId}`);
            
            if (Lampa.Timeline && Lampa.Timeline.update) {
                Lampa.Timeline.update({
                    hash: tmdbId,
                    percent: percent,
                    time: currentTime,
                    duration: duration
                });
            }
            
            return true;
        }
        return false;
    }

    function syncToGist(showNotify = true, callback = null) {
        if (syncInProgress) {
            pendingSync = true;
            if (callback) callback(false);
            return;
        }
        
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
        const data = getProgressData();
        const count = Object.keys(data.file_view).length;
        if (count === 0) {
            if (callback) callback(false);
            return;
        }
        
        syncInProgress = true;
        console.log(`[Sync] 📤 Отправка ${count} таймкодов...`);
        
        $.ajax({
            url: `https://api.github.com/gists/${c.gist_id}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${c.gist_token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            data: JSON.stringify({
                description: 'Lampa Timeline Sync',
                public: false,
                files: { 'timeline.json': { content: JSON.stringify(data, null, 2) } }
            }),
            success: () => {
                if (showNotify) notify('✅ Таймкоды отправлены');
                lastSyncTime = Date.now();
                console.log(`[Sync] ✅ Отправлено успешно`);
                syncInProgress = false;
                
                if (pendingSync) {
                    pendingSync = false;
                    setTimeout(() => syncToGist(false, callback), 1000);
                } else if (callback) {
                    callback(true);
                }
            },
            error: (xhr) => {
                console.error('[Sync] ❌ Ошибка отправки:', xhr.status);
                if (showNotify) notify(`❌ Ошибка: ${xhr.status}`);
                syncInProgress = false;
                if (callback) callback(false);
            }
        });
    }

    function syncFromGist(showNotify = true, callback = null) {
        if (syncInProgress) {
            if (callback) callback(false);
            return;
        }
        
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
        syncInProgress = true;
        console.log(`[Sync] 📥 Загрузка с Gist...`);
        
        $.ajax({
            url: `https://api.github.com/gists/${c.gist_id}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${c.gist_token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: (data) => {
                try {
                    const content = data.files['timeline.json']?.content;
                    if (content) {
                        const remote = JSON.parse(content);
                        const count = Object.keys(remote.file_view || {}).length;
                        console.log(`[Sync] 📥 Загружено ${count} таймкодов`);
                        
                        const localFileView = getFileView();
                        const { merged, changed } = mergeFileView(localFileView, remote.file_view);
                        
                        if (changed) {
                            setFileView(merged);
                            console.log(`[Sync] Итог: ${Object.keys(merged).length} таймкодов`);
                            
                            if (Lampa.Timeline && Lampa.Timeline.read) {
                                Lampa.Timeline.read(true);
                            }
                            
                            if (showNotify) {
                                // Показываем уведомление с количеством обновлённых таймкодов
                                const changedCount = Object.keys(remote.file_view).length;
                                notify(`📥 Загружено ${changedCount} таймкодов`);
                            }
                        } else if (showNotify) {
                            notify('✅ Данные актуальны');
                        }
                        
                        if (callback) callback(true);
                    } else {
                        if (showNotify) notify('❌ Нет данных');
                        if (callback) callback(false);
                    }
                } catch(e) { 
                    console.error(e);
                    if (callback) callback(false);
                }
            },
            error: (xhr) => {
                console.error('[Sync] ❌ Ошибка загрузки:', xhr.status);
                if (showNotify) notify(`❌ Ошибка: ${xhr.status}`);
                if (callback) callback(false);
            },
            complete: () => {
                syncInProgress = false;
            }
        });
    }

    // Добавить кнопку синхронизации в интерфейс
    function addSyncButton() {
        const c = cfg();
        
        // Иконка для кнопки (облако с стрелками)
        const svgIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" fill="currentColor"/></svg>';
        
        // Функция синхронизации (отправить и загрузить)
        function doSync() {
            notify('🔄 Синхронизация...');
            syncToGist(true, () => {
                setTimeout(() => {
                    syncFromGist(true);
                }, 500);
            });
        }
        
        // Удаляем старую кнопку если есть
        $('.tl-sync-button').remove();
        
        // Создаём кнопку
        const syncButton = $(`<div class="tl-sync-button selector head__action" style="display: flex; align-items: center; justify-content: center;">${svgIcon}</div>`);
        syncButton.on('hover:enter', doSync);
        syncButton.on('click', doSync);
        
        // Добавляем в выбранное место
        if (c.button_position === 'head') {
            const headActions = $('.head__actions');
            if (headActions.length) {
                headActions.prepend(syncButton);
            } else {
                $('.head__body').append(syncButton);
            }
        } else {
            const menuList = $('.menu__list:eq(0)');
            if (menuList.length) {
                const menuItem = $(`<li class="menu__item selector tl-sync-button" style="order: -1;"><div class="menu__ico">${svgIcon}</div><div class="menu__text">Синхр.</div></li>`);
                menuItem.on('hover:enter', doSync);
                menuList.prepend(menuItem);
                syncButton.remove();
            } else {
                $('.head__actions').prepend(syncButton);
            }
        }
        
        console.log(`[Sync] Кнопка добавлена в позицию: ${c.button_position}`);
    }

    function initPlayerHandler() {
        let lastSavedProgressTime = 0;
        
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'open' && e.movie) {
                isPlayerOpen = true;
                currentMovieId = extractTmdbIdFromItem(e.movie);
                console.log(`[Sync] 🎬 Открыт фильм: ${currentMovieId}`);
                lastSavedProgressTime = 0;
                lastCurrentTime = 0;
                
                setTimeout(() => {
                    syncFromGist(false, (success) => {
                        if (success) {
                            const fileView = getFileView();
                            if (currentMovieId && fileView[currentMovieId] && fileView[currentMovieId].time) {
                                const savedTime = fileView[currentMovieId].time;
                                console.log(`[Sync] 🎯 Таймкод: ${formatTime(savedTime)}`);
                                notify(`🎯 Таймкод: ${formatTimeShort(savedTime)}`);
                            }
                        }
                    });
                }, 2000);
            }
            
            if (e.type === 'timeupdate' && e.time) {
                lastCurrentTime = e.time;
                
                const now = Date.now();
                if (now - lastSavedProgressTime >= 10000) {
                    lastSavedProgressTime = now;
                    saveCurrentProgress(lastCurrentTime, false);
                }
            }
            
            if (e.type === 'stop' || e.type === 'pause') {
                console.log(`[Sync] ${e.type === 'stop' ? '⏹️ Остановка' : '⏸️ Пауза'} - сохраняем`);
                if (lastCurrentTime > 0) {
                    saveCurrentProgress(lastCurrentTime, true);
                }
            }
        });
        
        periodicSyncTimer = setInterval(() => {
            if (isPlayerOpen && lastCurrentTime > 0 && Lampa.Player.opened()) {
                console.log('[Sync] ⏰ Периодическая отправка');
                saveCurrentProgress(lastCurrentTime, false);
                syncToGist(false);
            }
        }, 60000);
    }

    function startBackgroundSync() {
        setInterval(() => {
            if (!syncInProgress && cfg().enabled) {
                syncFromGist(false);
            }
        }, 120000);
    }

    function showGistSetup() {
        const c = cfg();
        Lampa.Select.show({
            title: 'Синхронизация таймкодов',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓' : '❌'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0,8)+'…' : '❌'}`, action: 'id' },
                { title: `📱 Устройство: ${c.device_name}`, action: 'device' },
                { title: `👤 Профиль: ${c.manual_profile_id || 'авто'}`, action: 'profile' },
                { title: '──────────', separator: true },
                { title: `📍 Позиция кнопки: ${c.button_position === 'head' ? 'Верхняя панель' : 'Левое меню'}`, action: 'position' },
                { title: '──────────', separator: true },
                { title: '🔄 Отправить таймкоды', action: 'upload' },
                { title: '📥 Загрузить таймкоды', action: 'download' },
                { title: '🔄 Полная синхронизация', action: 'force' },
                { title: '──────────', separator: true },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: async (item) => {
                if (item.action === 'token') {
                    Lampa.Input.edit({ title: 'GitHub Token', value: c.gist_token, free: true }, (val) => {
                        if (val !== null) { c.gist_token = val || ''; saveCfg(c); notify('Токен сохранён'); }
                        showGistSetup();
                    });
                } else if (item.action === 'id') {
                    Lampa.Input.edit({ title: 'Gist ID', value: c.gist_id, free: true }, (val) => {
                        if (val !== null) { c.gist_id = val || ''; saveCfg(c); notify('Gist ID сохранён'); }
                        showGistSetup();
                    });
                } else if (item.action === 'device') {
                    Lampa.Input.edit({ title: 'Имя устройства', value: c.device_name, free: true }, (val) => {
                        if (val !== null && val.trim()) { c.device_name = val.trim(); saveCfg(c); notify('Имя сохранено'); }
                        showGistSetup();
                    });
                } else if (item.action === 'profile') {
                    Lampa.Input.edit({ title: 'ID профиля (пусто = авто)', value: c.manual_profile_id, free: true }, (val) => {
                        if (val !== null) { c.manual_profile_id = val || ''; saveCfg(c); notify('Профиль сохранён'); }
                        showGistSetup();
                    });
                } else if (item.action === 'position') {
                    const newPos = c.button_position === 'head' ? 'menu' : 'head';
                    c.button_position = newPos;
                    saveCfg(c);
                    addSyncButton();
                    notify(`Кнопка перемещена в ${newPos === 'head' ? 'верхнюю панель' : 'левое меню'}`);
                    showGistSetup();
                } else if (item.action === 'upload') {
                    syncToGist(true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'download') {
                    syncFromGist(true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'force') {
                    notify('🔄 Полная синхронизация...');
                    syncToGist(true);
                    setTimeout(() => {
                        syncFromGist(true);
                    }, 1000);
                    setTimeout(() => showGistSetup(), 2000);
                }
            },
            onBack: () => {
                Lampa.Controller.toggle('content');
            }
        });
    }

    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'timeline_sync',
            name: 'Синхронизация таймкодов',
            icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/></svg>'
        });
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'gist_setup', type: 'button' },
            field: { name: '⚙️ Настройки Gist' },
            onChange: () => showGistSetup()
        });
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'sync_enabled', type: 'toggle', default: true },
            field: { name: 'Включить синхронизацию' },
            onChange: v => { const c = cfg(); c.enabled = v; saveCfg(c); }
        });
    }

    function init() {
        if (!cfg().enabled) return;
        
        console.log(`[Sync] Инициализация. Профиль: ${getCurrentProfileId() || 'глобальный'}`);
        
        const current = getFileView();
        const normalized = normalizeKeys(current);
        if (JSON.stringify(current) !== JSON.stringify(normalized)) {
            console.log('[Sync] Нормализация ключей');
            setFileView(normalized);
        }
        
        initPlayerHandler();
        addSettings();
        startBackgroundSync();
        addSyncButton();
        
        setTimeout(() => {
            if (cfg().enabled) {
                syncFromGist(false);
            }
        }, 3000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
