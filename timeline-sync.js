(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let lastSyncTime = 0;
    let syncInProgress = false;
    let pendingSync = false;
    let currentMovieId = null;
    let lastCurrentTime = 0;
    let lastSaveTime = 0;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
            sync_on_stop: true,
            sync_interval: 30,
            button_position: 'head',
            sync_strategy: 'max_time'
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function notify(text) {
        Lampa.Noty.show(text);
    }

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

    // Основная логика слияния с учётом выбранной стратегии
    function mergeFileView(local, remote) {
        const result = { ...local };
        let changed = false;
        const strategy = cfg().sync_strategy;
        
        for (const key in remote) {
            const remoteItem = remote[key];
            const localItem = local[key];
            
            const remoteTime = remoteItem?.time || 0;
            const localTime = localItem?.time || 0;
            const remotePercent = remoteItem?.percent || 0;
            const localPercent = localItem?.percent || 0;
            const remoteUpdated = remoteItem?.updated || 0;
            const localUpdated = localItem?.updated || 0;
            
            let shouldUseRemote = false;
            let reason = '';
            
            if (!localItem) {
                shouldUseRemote = true;
                reason = 'новый таймкод';
            } else {
                switch (strategy) {
                    case 'max_time':
                        if (remoteTime > localTime + 5) {
                            shouldUseRemote = true;
                            reason = `время (${formatTime(localTime)} → ${formatTime(remoteTime)})`;
                        } else if (localTime > remoteTime + 5) {
                            reason = `локальное время больше (${formatTime(localTime)} > ${formatTime(remoteTime)})`;
                        }
                        break;
                        
                    case 'max_percent':
                        if (remotePercent > localPercent + 3) {
                            shouldUseRemote = true;
                            reason = `процент (${localPercent}% → ${remotePercent}%)`;
                        } else if (localPercent > remotePercent + 3) {
                            reason = `локальный процент больше (${localPercent}% > ${remotePercent}%)`;
                        }
                        break;
                        
                    case 'newest':
                        // Сравниваем по дате обновления
                        const remoteDate = new Date(remoteUpdated);
                        const localDate = new Date(localUpdated);
                        
                        if (remoteUpdated > localUpdated + 10000) { // плюс 10 секунд
                            shouldUseRemote = true;
                            reason = `дата (${localDate.toLocaleTimeString()} → ${remoteDate.toLocaleTimeString()})`;
                        } else if (localUpdated > remoteUpdated + 10000) {
                            reason = `локальная дата новее (${localDate.toLocaleTimeString()} > ${remoteDate.toLocaleTimeString()})`;
                        } else {
                            // Если даты близки, сравниваем время
                            if (remoteTime > localTime + 5) {
                                shouldUseRemote = true;
                                reason = `даты близки, но время больше (${formatTime(localTime)} → ${formatTime(remoteTime)})`;
                            }
                        }
                        break;
                        
                    default:
                        if (remoteTime > localTime + 5) {
                            shouldUseRemote = true;
                            reason = `время (${formatTime(localTime)} → ${formatTime(remoteTime)})`;
                        }
                }
            }
            
            if (shouldUseRemote) {
                // Сохраняем remote, но ОБЯЗАТЕЛЬНО сохраняем его updated
                result[key] = {
                    ...remoteItem,
                    updated: remoteUpdated || Date.now()
                };
                changed = true;
                console.log(`[Sync] 🔄 ЗАМЕНА (${reason}): ${key}`);
                console.log(`   Локальное:  время=${formatTime(localTime)} (${localPercent}%), обновлён=${localDateString(localUpdated)}`);
                console.log(`   Удалённое:  время=${formatTime(remoteTime)} (${remotePercent}%), обновлён=${remoteDateString(remoteUpdated)}`);
            } else if (reason) {
                console.log(`[Sync] ⏸ ОСТАВЛЕНО (${reason}): ${key}`);
            }
        }
        return { merged: result, changed };
    }
    
    function localDateString(timestamp) {
        if (!timestamp) return 'никогда';
        return new Date(timestamp).toLocaleString();
    }
    
    function remoteDateString(timestamp) {
        if (!timestamp) return 'никогда';
        return new Date(timestamp).toLocaleString();
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

    // Сохранение прогресса с ОБЯЗАТЕЛЬНЫМ обновлением даты
    function saveCurrentProgress(timeInSeconds, forceSync = false) {
        const tmdbId = getCurrentMovieTmdbId();
        if (!tmdbId) return false;
        
        const fileView = getFileView();
        const currentTime = Math.floor(timeInSeconds);
        const savedTime = fileView[tmdbId]?.time || 0;
        const now = Date.now();
        
        // Сохраняем если прошло 10 секунд или принудительно
        if (Math.abs(currentTime - savedTime) >= 10 || forceSync || (now - lastSaveTime) >= 10000) {
            const duration = Lampa.Player.playdata()?.timeline?.duration || 0;
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            
            const newData = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: now  // ВАЖНО: всегда обновляем дату при сохранении!
            };
            
            fileView[tmdbId] = newData;
            setFileView(fileView);
            lastSaveTime = now;
            
            console.log(`[Sync] 💾 СОХРАНЕНО: ${formatTime(currentTime)} (${percent}%) для ${tmdbId}`);
            console.log(`   Время обновления: ${new Date(now).toLocaleTimeString()}`);
            
            if (Lampa.Timeline && Lampa.Timeline.update) {
                Lampa.Timeline.update({
                    hash: tmdbId,
                    percent: percent,
                    time: currentTime,
                    duration: duration
                });
            }
            
            // Принудительная отправка при остановке
            if (forceSync && cfg().sync_on_stop) {
                syncToGist(false);
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
        
        // Перед отправкой убеждаемся, что у всех записей есть updated
        const fileView = getFileView();
        let needUpdate = false;
        for (const key in fileView) {
            if (!fileView[key].updated) {
                fileView[key].updated = Date.now();
                needUpdate = true;
            }
        }
        if (needUpdate) {
            setFileView(fileView);
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
        console.log(`[Sync] 📥 Загрузка с Gist... Стратегия: ${c.sync_strategy}`);
        
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
                            
                            if (showNotify) notify(`📥 Загружено ${count} таймкодов`);
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

    function fullSync() {
        notify('🔄 Синхронизация...');
        syncToGist(true, () => {
            setTimeout(() => {
                syncFromGist(true);
            }, 500);
        });
    }

    function addHeadButton() {
        const svgIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" fill="currentColor"/></svg>';
        
        $('.tl-sync-button').remove();
        
        const syncButton = $(`<div class="tl-sync-button selector head__action" style="display: flex; align-items: center; justify-content: center;">${svgIcon}</div>`);
        syncButton.on('hover:enter', fullSync);
        syncButton.on('click', fullSync);
        
        const headActions = $('.head__actions');
        if (headActions.length) {
            headActions.prepend(syncButton);
        } else {
            $('.head__body').append(syncButton);
        }
        
        console.log('[Sync] Кнопка добавлена в верхнюю панель');
    }

    function initPlayerHandler() {
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'open' && e.movie) {
                currentMovieId = extractTmdbIdFromItem(e.movie);
                console.log(`[Sync] 🎬 Открыт фильм: ${currentMovieId}`);
                lastCurrentTime = 0;
                lastSaveTime = 0;
                
                setTimeout(() => {
                    syncFromGist(false, (success) => {
                        if (success) {
                            const fileView = getFileView();
                            if (currentMovieId && fileView[currentMovieId] && fileView[currentMovieId].time) {
                                const savedTime = fileView[currentMovieId].time;
                                console.log(`[Sync] 🎯 Загружен таймкод: ${formatTime(savedTime)}`);
                                console.log(`   Обновлён: ${new Date(fileView[currentMovieId].updated).toLocaleString()}`);
                                notify(`🎯 Таймкод: ${formatTimeShort(savedTime)}`);
                            }
                        }
                    });
                }, 2000);
            }
            
            if (e.type === 'timeupdate' && e.time) {
                lastCurrentTime = e.time;
                // Автосохранение каждые 10 секунд
                const now = Date.now();
                if (now - lastSaveTime >= 10000) {
                    saveCurrentProgress(lastCurrentTime, false);
                }
            }
            
            if (e.type === 'stop') {
                console.log('[Sync] ⏹️ Плеер остановлен');
                if (lastCurrentTime > 0) {
                    saveCurrentProgress(lastCurrentTime, true);
                }
            }
            
            if (e.type === 'pause') {
                console.log('[Sync] ⏸️ Пауза');
                if (lastCurrentTime > 0) {
                    saveCurrentProgress(lastCurrentTime, false);
                }
            }
        });
    }

    function startBackgroundSync() {
        setInterval(() => {
            if (!syncInProgress && cfg().enabled) {
                syncFromGist(false);
            }
        }, 60000);
    }

    function showGistSetup() {
        const c = cfg();
        const strategyNames = {
            'max_time': '⏱ По времени просмотра',
            'max_percent': '📊 По проценту просмотра',
            'newest': '🕐 По дате обновления'
        };
        
        Lampa.Select.show({
            title: 'Синхронизация таймкодов',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓' : '❌'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0,8)+'…' : '❌'}`, action: 'id' },
                { title: `📱 Устройство: ${c.device_name}`, action: 'device' },
                { title: `👤 Профиль: ${c.manual_profile_id || 'авто'}`, action: 'profile' },
                { title: '──────────', separator: true },
                { title: `🔄 Стратегия: ${strategyNames[c.sync_strategy] || strategyNames.max_time}`, action: 'strategy' },
                { title: '──────────', separator: true },
                { title: '📤 Отправить таймкоды', action: 'upload' },
                { title: '📥 Загрузить таймкоды', action: 'download' },
                { title: '🔄 Полная синхронизация', action: 'force' },
                { title: '──────────', separator: true },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: (item) => {
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
                } else if (item.action === 'strategy') {
                    Lampa.Select.show({
                        title: 'Стратегия синхронизации',
                        items: [
                            { title: '⏱ По максимальному времени просмотра', value: 'max_time', desc: 'Берётся наибольшее время (секунды)' },
                            { title: '📊 По максимальному проценту просмотра', value: 'max_percent', desc: 'Берётся наибольший процент' },
                            { title: '🕐 По дате последнего обновления', value: 'newest', desc: 'Берётся самый свежий таймкод' }
                        ].map(opt => ({
                            title: opt.title,
                            subtitle: opt.desc,
                            value: opt.value,
                            selected: c.sync_strategy === opt.value
                        })),
                        onSelect: (opt) => {
                            c.sync_strategy = opt.value;
                            saveCfg(c);
                            notify(`Стратегия: ${opt.title}`);
                            showGistSetup();
                        },
                        onBack: () => showGistSetup()
                    });
                } else if (item.action === 'upload') {
                    syncToGist(true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'download') {
                    syncFromGist(true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'force') {
                    fullSync();
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
        console.log(`[Sync] Стратегия синхронизации: ${cfg().sync_strategy}`);
        
        const current = getFileView();
        const normalized = normalizeKeys(current);
        if (JSON.stringify(current) !== JSON.stringify(normalized)) {
            console.log('[Sync] Нормализация ключей');
            setFileView(normalized);
        }
        
        initPlayerHandler();
        addSettings();
        startBackgroundSync();
        addHeadButton();
        
        setTimeout(() => {
            if (cfg().enabled) {
                syncFromGist(false);
            }
        }, 3000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
