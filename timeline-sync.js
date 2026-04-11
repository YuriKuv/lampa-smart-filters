(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    console.log('[Sync] Загрузка исправленной версии...');

    const CFG_KEY = 'timeline_sync_cfg';
    let lastSyncTime = 0;
    let syncInProgress = false;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
            sync_on_stop: true,
            sync_interval: 30,
            sync_strategy: 'last_played'
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function notify(text) {
        Lampa.Noty.show(text);
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

    // КЛЮЧЕВАЯ ФУНКЦИЯ: сохраняет таймкод в оба хранилища
    function saveToBothStorages(tmdbId, percent, time, updated) {
        const timestamp = updated || Date.now();
        const data = { percent: percent, time: time || 0, updated: timestamp };
        
        // 1. Сохраняем в наше хранилище
        const fileView = getFileView();
        fileView[tmdbId] = data;
        setFileView(fileView);
        
        // 2. Сохраняем в стандартное хранилище Lampa (ВАЖНО!)
        Lampa.Storage.set(`timeline_${tmdbId}`, { percent: percent, updated: timestamp }, true);
        
        // 3. Также сохраняем в общий timeline если нужно
        const globalTimeline = Lampa.Storage.get('timeline', {});
        globalTimeline[tmdbId] = { percent: percent, updated: timestamp };
        Lampa.Storage.set('timeline', globalTimeline, true);
        
        console.log(`[Sync] 💾 Сохранён таймкод ${tmdbId}: ${percent}% (в оба хранилища)`);
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
                if (!result[tmdbId] || (data[key].percent || 0) > (result[tmdbId].percent || 0)) {
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
        const strategy = cfg().sync_strategy;
        
        for (const key in remote) {
            const remoteData = remote[key];
            const localData = local[key];
            
            if (!localData) {
                result[key] = remoteData;
                changed = true;
                console.log(`[Sync] ➕ Новый: ${key} (${remoteData.percent}%)`);
                continue;
            }
            
            let shouldUpdate = false;
            
            if (strategy === 'last_played') {
                const remoteTime = remoteData.updated || 0;
                const localTime = localData.updated || 0;
                if (remoteTime > localTime) {
                    shouldUpdate = true;
                }
            } else if (strategy === 'max_progress') {
                const remotePercent = remoteData.percent || 0;
                const localPercent = localData.percent || 0;
                if (remotePercent > localPercent) {
                    shouldUpdate = true;
                }
            }
            
            if (shouldUpdate) {
                result[key] = remoteData;
                changed = true;
                console.log(`[Sync] 🔄 Обновлён: ${key} (${localData.percent}% → ${remoteData.percent}%)`);
            }
        }
        
        return { merged: result, changed };
    }

    // Применяем удалённые данные
    function applyRemoteData(remote) {
        if (!remote?.file_view) return false;
        
        const localFileView = getFileView();
        const { merged, changed } = mergeFileView(localFileView, remote.file_view);
        
        if (changed) {
            setFileView(merged);
            console.log(`[Sync] Сохранено ${Object.keys(merged).length} таймкодов`);
            
            // Синхронизируем с хранилищем Lampa
            for (const tmdbId in merged) {
                const data = merged[tmdbId];
                saveToBothStorages(tmdbId, data.percent, data.time, data.updated);
            }
            
            return true;
        }
        return false;
    }

    function getCurrentMovieTmdbId() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                return extractTmdbIdFromItem(activity.movie);
            }
            
            if (Lampa.Player && Lampa.Player.current()) {
                const player = Lampa.Player.current();
                if (player.movie) {
                    return extractTmdbIdFromItem(player.movie);
                }
            }
        } catch(e) {}
        return null;
    }

    function applyToCurrentPlayer(tmdbId, percent) {
        try {
            const player = Lampa.Player.current();
            if (!player) return false;
            
            const currentMovieId = getCurrentMovieTmdbId();
            if (currentMovieId && String(currentMovieId) === String(tmdbId)) {
                const duration = player.duration ? player.duration() : (player.video ? player.video.duration : 0);
                if (duration > 0) {
                    let time = (percent / 100) * duration;
                    if (percent >= 95) {
                        time = 0;
                    }
                    
                    if (player.seek) {
                        player.seek(time);
                    } else if (player.setCurrentTime) {
                        player.setCurrentTime(time);
                    } else if (player.video) {
                        player.video.currentTime = time;
                    }
                    console.log(`[Sync] 🎯 Применён таймкод: ${percent}%`);
                    return true;
                }
            }
        } catch(e) {}
        return false;
    }

    function syncToGist(showNotify = true, callback = null) {
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
        
        const data = getProgressData();
        const count = Object.keys(data.file_view).length;
        if (count === 0) {
            if (callback) callback(false);
            return;
        }
        
        syncInProgress = true;
        console.log(`[Sync] Отправка ${count} таймкодов...`);
        
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
                if (showNotify) notify('✅ Отправлено');
                lastSyncTime = Date.now();
                syncInProgress = false;
                if (callback) callback(true);
            },
            error: () => {
                if (showNotify) notify('❌ Ошибка отправки');
                syncInProgress = false;
                if (callback) callback(false);
            }
        });
    }

    function syncFromGist(showNotify = true, callback = null, applyToPlayer = true) {
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
        console.log(`[Sync] Загрузка с Gist...`);
        
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
                        const remoteCount = Object.keys(remote.file_view || {}).length;
                        console.log(`[Sync] Загружено ${remoteCount} таймкодов`);
                        
                        const changed = applyRemoteData(remote);
                        
                        if (changed && showNotify) {
                            notify(`📥 Загружено ${remoteCount} таймкодов`);
                        } else if (showNotify && !changed) {
                            notify('✅ Данные актуальны');
                        }
                        
                        if (applyToPlayer) {
                            const currentTmdbId = getCurrentMovieTmdbId();
                            if (currentTmdbId) {
                                const fileView = getFileView();
                                if (fileView[currentTmdbId]) {
                                    setTimeout(() => {
                                        applyToCurrentPlayer(currentTmdbId, fileView[currentTmdbId].percent);
                                    }, 500);
                                }
                            }
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
                console.error('[Sync] Ошибка:', xhr.status);
                if (showNotify) notify(`❌ Ошибка: ${xhr.status}`);
                if (callback) callback(false);
            },
            complete: () => {
                syncInProgress = false;
            }
        });
    }

    function hookPlayerOpen() {
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'open' && e.movie) {
                const tmdbId = extractTmdbIdFromItem(e.movie);
                if (tmdbId) {
                    setTimeout(() => {
                        const fileView = getFileView();
                        if (fileView[tmdbId]) {
                            let percent = fileView[tmdbId].percent;
                            if (percent >= 95) percent = 0;
                            applyToCurrentPlayer(tmdbId, percent);
                        }
                    }, 1000);
                }
            }
        });
    }

    function hookPlayerEvents() {
        let lastPercent = 0;
        let lastUpdateTime = Date.now();
        
        function throttledSync(force = false) {
            const interval = (cfg().sync_interval || 30) * 1000;
            if (force || Date.now() - lastSyncTime >= interval) {
                if (!syncInProgress) {
                    syncToGist(false);
                }
            }
        }
        
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'timeupdate' && e.time && e.duration) {
                const percent = Math.floor((e.time / e.duration) * 100);
                if (Math.abs(percent - lastPercent) >= 5 || Date.now() - lastUpdateTime >= 30000) {
                    lastPercent = percent;
                    lastUpdateTime = Date.now();
                    
                    const tmdbId = getCurrentMovieTmdbId();
                    if (tmdbId) {
                        saveToBothStorages(tmdbId, percent, e.time);
                        console.log(`[Sync] Прогресс: ${tmdbId} - ${percent}%`);
                    }
                    
                    throttledSync();
                }
            }
            
            if (e.type === 'stop' || e.type === 'pause') {
                if (cfg().sync_on_stop) {
                    throttledSync(true);
                }
            }
        });
    }

    function startBackgroundSync() {
        setInterval(() => {
            if (!syncInProgress && cfg().enabled) {
                syncFromGist(false, null, true);
            }
        }, 60000);
    }

    function forceFullSync() {
        notify('🔄 Полная синхронизация...');
        syncToGist(true, () => {
            setTimeout(() => {
                syncFromGist(true, () => {
                    notify('✅ Синхронизация завершена');
                }, true);
            }, 500);
        });
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
                { title: `⏱ Интервал: ${c.sync_interval} сек`, action: 'interval' },
                { title: '──────────', separator: true },
                { title: '🔄 Полная синхронизация', action: 'force', accent: true },
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
                } else if (item.action === 'interval') {
                    Lampa.Input.edit({ title: 'Интервал (сек, мин 15)', value: c.sync_interval, free: true }, (val) => {
                        if (val !== null && val >= 15) { c.sync_interval = val; saveCfg(c); notify(`Интервал: ${val} сек`); }
                        showGistSetup();
                    });
                } else if (item.action === 'force') {
                    forceFullSync();
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
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'sync_on_stop', type: 'toggle', default: true },
            field: { name: 'Синхронизировать при остановке' },
            onChange: v => { const c = cfg(); c.sync_on_stop = v; saveCfg(c); }
        });
    }

    // Импорт существующих таймкодов из старого хранилища
    function importExistingTimelines() {
        const profileId = getCurrentProfileId();
        if (!profileId) return;
        
        const oldKey = `file_view_${profileId}`;
        const oldData = Lampa.Storage.get(oldKey, {});
        
        if (Object.keys(oldData).length > 0) {
            console.log(`[Sync] Импорт ${Object.keys(oldData).length} существующих таймкодов...`);
            for (const tmdbId in oldData) {
                const data = oldData[tmdbId];
                saveToBothStorages(tmdbId, data.percent, data.time, data.updated);
            }
        }
    }

    function init() {
        if (!cfg().enabled) return;
        
        const profileId = getCurrentProfileId();
        console.log(`[Sync] Инициализация. Профиль: ${profileId || 'глобальный'}`);
        
        // Импортируем существующие таймкоды
        importExistingTimelines();
        
        hookPlayerOpen();
        hookPlayerEvents();
        addSettings();
        startBackgroundSync();
        
        setTimeout(() => {
            if (cfg().enabled && cfg().gist_token && cfg().gist_id) {
                syncFromGist(false, null, true);
            }
        }, 5000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
