(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let lastSyncTime = 0;
    let syncInProgress = false;
    let pendingSync = false;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
            sync_on_stop: true,
            sync_interval: 30
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
            version: 4,
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
            const remotePercent = remote[key]?.percent || 0;
            const localPercent = local[key]?.percent || 0;
            const remoteTime = remote[key]?.time || 0;
            const localTime = local[key]?.time || 0;
            
            if (!local[key]) {
                result[key] = remote[key];
                changed = true;
                console.log(`[Sync] ➕ Новый: ${key} (${remotePercent}%)`);
            } else if (remotePercent > localPercent || remoteTime > localTime) {
                result[key] = remote[key];
                changed = true;
                console.log(`[Sync] 🔄 Обновлён: ${key} (${localPercent}% → ${remotePercent}%)`);
            }
        }
        
        return { merged: result, changed };
    }

    // Получить TMDB ID текущего фильма в плеере
    function getCurrentMovieTmdbId() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                const movie = activity.movie;
                return extractTmdbIdFromItem(movie);
            }
            
            // Альтернативный способ через плеер
            if (Lampa.Player && Lampa.Player.current()) {
                const player = Lampa.Player.current();
                if (player.movie) {
                    return extractTmdbIdFromItem(player.movie);
                }
            }
        } catch(e) {
            console.error('[Sync] Ошибка получения текущего фильма:', e);
        }
        return null;
    }

    // Применить таймкод к текущему плееру
    function applyToCurrentPlayer(tmdbId, percent) {
        try {
            const player = Lampa.Player.current();
            if (!player) return false;
            
            const currentMovieId = getCurrentMovieTmdbId();
            if (currentMovieId && String(currentMovieId) === String(tmdbId)) {
                const duration = player.duration ? player.duration() : (player.video ? player.video.duration : 0);
                if (duration > 0) {
                    const seekTime = (percent / 100) * duration;
                    console.log(`[Sync] 🎯 Применяем таймкод к текущему плееру: ${percent}% (${Math.floor(seekTime)}с)`);
                    
                    if (player.seek) {
                        player.seek(seekTime);
                    } else if (player.setCurrentTime) {
                        player.setCurrentTime(seekTime);
                    } else if (player.video) {
                        player.video.currentTime = seekTime;
                    }
                    return true;
                }
            }
        } catch(e) {
            console.error('[Sync] Ошибка применения таймкода:', e);
        }
        return false;
    }

    // Обновить интерфейс таймкодов для карточек
    function refreshTimelineUI() {
        try {
            // Обновляем компоненты, которые показывают таймкоды
            if (Lampa.Component && Lampa.Component.list) {
                Lampa.Component.list().forEach(component => {
                    if (component.update && component.type === 'timeline') {
                        component.update();
                    }
                });
            }
            
            // Обновляем контент на главной
            if (Lampa.Controller && Lampa.Controller.content) {
                const content = Lampa.Controller.content();
                if (content && content.render) {
                    content.render();
                }
            }
            
            // Триггерим событие обновления таймкодов
            Lampa.Listener.trigger('timeline', 'update');
            console.log('[Sync] UI обновлён');
        } catch(e) {
            console.error('[Sync] Ошибка обновления UI:', e);
        }
    }

    function applyRemoteData(remote, applyToPlayer = true) {
        if (!remote?.file_view) return false;
        
        const localFileView = getFileView();
        const { merged, changed } = mergeFileView(localFileView, remote.file_view);
        
        if (changed) {
            setFileView(merged);
            console.log(`[Sync] Итог: ${Object.keys(merged).length} таймкодов`);
            
            // Обновляем UI
            refreshTimelineUI();
            
            // Применяем к текущему плееру, если есть подходящий таймкод
            if (applyToPlayer) {
                const currentTmdbId = getCurrentMovieTmdbId();
                if (currentTmdbId && merged[currentTmdbId]) {
                    const percent = merged[currentTmdbId].percent;
                    applyToCurrentPlayer(currentTmdbId, percent);
                }
            }
            
            return true;
        }
        return false;
    }

    function forceFullSync() {
        return new Promise((resolve) => {
            syncToGist(true, () => {
                setTimeout(() => {
                    syncFromGist(true, () => {
                        resolve();
                    });
                }, 500);
            });
        });
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
                if (showNotify) notify('✅ Таймкоды отправлены');
                lastSyncTime = Date.now();
                console.log(`[Sync] Отправлено успешно`);
                syncInProgress = false;
                
                if (pendingSync) {
                    pendingSync = false;
                    setTimeout(() => syncToGist(false, callback), 1000);
                } else if (callback) {
                    callback(true);
                }
            },
            error: (xhr) => {
                console.error('[Sync] Ошибка отправки:', xhr.status);
                if (showNotify) notify(`❌ Ошибка: ${xhr.status}`);
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
                        const count = Object.keys(remote.file_view || {}).length;
                        console.log(`[Sync] Загружено ${count} таймкодов (источник: ${remote.source || 'unknown'})`);
                        
                        const changed = applyRemoteData(remote, applyToPlayer);
                        if (showNotify && changed) {
                            notify(`📥 Загружено ${count} таймкодов`);
                        } else if (showNotify && !changed) {
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
                console.error('[Sync] Ошибка загрузки:', xhr.status);
                if (showNotify) notify(`❌ Ошибка: ${xhr.status}`);
                if (callback) callback(false);
            },
            complete: () => {
                syncInProgress = false;
            }
        });
    }

    // Следим за открытием плеера и применяем таймкод
    function hookPlayerOpen() {
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'open' && e.movie) {
                const tmdbId = extractTmdbIdFromItem(e.movie);
                if (tmdbId) {
                    setTimeout(() => {
                        const fileView = getFileView();
                        if (fileView[tmdbId] && fileView[tmdbId].percent) {
                            const percent = fileView[tmdbId].percent;
                            console.log(`[Sync] Найден таймкод для открытого фильма: ${percent}%`);
                            applyToCurrentPlayer(tmdbId, percent);
                        }
                    }, 1000); // Даём плееру время инициализироваться
                }
            }
        });
    }

    function hookPlayerEvents() {
        let lastPercent = 0;
        
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
                if (Math.abs(percent - lastPercent) >= 5) {
                    lastPercent = percent;
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
                syncFromGist(false, null, true); // Применяем к плееру если нужно
            }
        }, 60000);
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
                { title: '📤 Только отправить', action: 'upload' },
                { title: '📥 Только загрузить', action: 'download' },
                { title: '🔄 Применить к плееру', action: 'apply' },
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
                    notify('🔄 Полная синхронизация...');
                    await forceFullSync();
                    notify('✅ Синхронизация завершена');
                    setTimeout(() => showGistSetup(), 1500);
                } else if (item.action === 'upload') {
                    syncToGist(true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'download') {
                    syncFromGist(true, null, true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'apply') {
                    const currentTmdbId = getCurrentMovieTmdbId();
                    if (currentTmdbId) {
                        const fileView = getFileView();
                        if (fileView[currentTmdbId]) {
                            applyToCurrentPlayer(currentTmdbId, fileView[currentTmdbId].percent);
                            notify(`🎯 Применён таймкод: ${fileView[currentTmdbId].percent}%`);
                        } else {
                            notify('❌ Нет таймкода для текущего фильма');
                        }
                    } else {
                        notify('❌ Нет активного плеера');
                    }
                    setTimeout(() => showGistSetup(), 1500);
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
            icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.5-13H11v6l5.2 3.1.8-1.2-4.5-2.7z"/></svg>'
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
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'auto_apply', type: 'toggle', default: true },
            field: { name: 'Автоприменение таймкодов' },
            onChange: v => { const c = cfg(); c.auto_apply = v; saveCfg(c); }
        });
    }

    function init() {
        if (!cfg().enabled) return;
        
        const currentSource = Lampa.Storage.field('source') || 'tmdb';
        console.log(`[Sync] Инициализация. Профиль: ${getCurrentProfileId() || 'глобальный'}, источник: ${currentSource}`);
        
        const current = getFileView();
        const normalized = normalizeKeys(current);
        if (JSON.stringify(current) !== JSON.stringify(normalized)) {
            console.log('[Sync] Нормализация ключей в TMDB ID');
            setFileView(normalized);
        }
        
        hookPlayerOpen();     // Применяем таймкод при открытии плеера
        hookPlayerEvents();   // Синхронизируем прогресс
        addSettings();
        startBackgroundSync(); // Фоновая синхронизация
        
        setTimeout(() => {
            if (cfg().enabled) {
                syncFromGist(false, null, cfg().auto_apply !== false);
            }
        }, 3000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
