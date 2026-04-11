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
            sync_interval: 30,
            sync_strategy: 'last_played' // last_played, max_progress, manual
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
            version: 5,
            profile_id: getCurrentProfileId(),
            device: cfg().device_name,
            source: Lampa.Storage.field('source') || 'tmdb',
            updated: Date.now(),
            file_view: normalizeKeys(getFileView())
        };
    }

    // НОВАЯ ЛОГИКА СЛИЯНИЯ с учётом стратегии
    function mergeFileView(local, remote) {
        const result = { ...local };
        let changed = false;
        const strategy = cfg().sync_strategy;
        
        for (const key in remote) {
            const remoteData = remote[key];
            const localData = local[key];
            
            if (!localData) {
                // Новый таймкод
                result[key] = remoteData;
                changed = true;
                console.log(`[Sync] ➕ Новый: ${key} (${remoteData.percent}%, время: ${new Date(remoteData.updated).toLocaleTimeString()})`);
                continue;
            }
            
            let shouldUpdate = false;
            let reason = '';
            
            switch(strategy) {
                case 'last_played':
                    // Приоритет по времени последнего обновления (UNIX timestamp)
                    const remoteTime = remoteData.updated || 0;
                    const localTime = localData.updated || 0;
                    if (remoteTime > localTime) {
                        shouldUpdate = true;
                        reason = `последнее время: ${new Date(remoteTime).toLocaleTimeString()} > ${new Date(localTime).toLocaleTimeString()}`;
                    }
                    break;
                    
                case 'max_progress':
                    // Старая логика - максимальный процент
                    const remotePercent = remoteData.percent || 0;
                    const localPercent = localData.percent || 0;
                    if (remotePercent > localPercent) {
                        shouldUpdate = true;
                        reason = `больше процент: ${remotePercent}% > ${localPercent}%`;
                    }
                    break;
                    
                case 'manual':
                    // Ручной режим - ничего не делаем автоматически
                    shouldUpdate = false;
                    break;
                    
                default:
                    // По умолчанию - последнее время
                    const defRemoteTime = remoteData.updated || 0;
                    const defLocalTime = localData.updated || 0;
                    if (defRemoteTime > defLocalTime) {
                        shouldUpdate = true;
                        reason = `последнее время (дефолт)`;
                    }
            }
            
            if (shouldUpdate) {
                result[key] = remoteData;
                changed = true;
                console.log(`[Sync] 🔄 Обновлён: ${key} (${localData.percent}% → ${remoteData.percent}%, причина: ${reason})`);
            }
        }
        
        return { merged: result, changed };
    }

    function getCurrentMovieTmdbId() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                const movie = activity.movie;
                return extractTmdbIdFromItem(movie);
            }
            
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

    function applyToCurrentPlayer(tmdbId, percent, seekTime = null) {
        try {
            const player = Lampa.Player.current();
            if (!player) return false;
            
            const currentMovieId = getCurrentMovieTmdbId();
            if (currentMovieId && String(currentMovieId) === String(tmdbId)) {
                const duration = player.duration ? player.duration() : (player.video ? player.video.duration : 0);
                if (duration > 0) {
                    let time = seekTime !== null ? seekTime : (percent / 100) * duration;
                    // Если таймкод больше 95% - начинаем с начала (пересмотр)
                    if (percent >= 95) {
                        time = 0;
                        console.log(`[Sync] 🎬 Таймкод ${percent}% >= 95%, начинаем с начала`);
                    }
                    console.log(`[Sync] 🎯 Применяем таймкод к плееру: ${percent}% (${Math.floor(time)}с)`);
                    
                    if (player.seek) {
                        player.seek(time);
                    } else if (player.setCurrentTime) {
                        player.setCurrentTime(time);
                    } else if (player.video) {
                        player.video.currentTime = time;
                    }
                    return true;
                }
            }
        } catch(e) {
            console.error('[Sync] Ошибка применения таймкода:', e);
        }
        return false;
    }

    function forceRefreshCache() {
        try {
            console.log('[Sync] Принудительное обновление кэша...');
            
            if (Lampa.Cache && Lampa.Cache.clear) {
                Lampa.Cache.clear('timeline');
                Lampa.Cache.clear('file_view');
            }
            
            if (Lampa.Timeline && Lampa.Timeline.update) {
                Lampa.Timeline.update();
            }
            
            if (Lampa.Controller && Lampa.Controller.reload) {
                Lampa.Controller.reload();
            }
            
            if (Lampa.Component && Lampa.Component.list) {
                Lampa.Component.list().forEach(component => {
                    if (component.update) component.update();
                    if (component.render && component.type === 'catalog') component.render();
                });
            }
            
            Lampa.Listener.trigger('timeline', 'update');
            Lampa.Listener.trigger('storage', 'update', { key: getFileViewKey() });
            
            $('.timeline-progress, .movie-item__progress, .progress-bar').each(function() {
                const $el = $(this);
                const tmdbId = $el.closest('[data-id]').attr('data-id');
                if (tmdbId) {
                    const fileView = getFileView();
                    if (fileView[tmdbId]) {
                        const percent = fileView[tmdbId].percent || 0;
                        $el.css('width', percent + '%');
                        if ($el.find('.progress-text')) {
                            $el.find('.progress-text').text(percent + '%');
                        }
                    }
                }
            });
            
            console.log('[Sync] Кэш обновлён');
            return true;
        } catch(e) {
            console.error('[Sync] Ошибка обновления кэша:', e);
            return false;
        }
    }

    function forceFullSyncWithCacheClear() {
        return new Promise(async (resolve) => {
            notify('🔄 Полная синхронизация...');
            forceRefreshCache();
            
            syncFromGist(false, async (success) => {
                if (success) {
                    setTimeout(() => {
                        forceRefreshCache();
                        notify('✅ Синхронизация завершена');
                        resolve(true);
                    }, 500);
                } else {
                    notify('❌ Ошибка синхронизации');
                    resolve(false);
                }
            }, true);
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
        console.log(`[Sync] Отправка ${count} таймкодов (стратегия: ${c.sync_strategy})...`);
        
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
                        
                        const localFileView = getFileView();
                        const { merged, changed } = mergeFileView(localFileView, remote.file_view);
                        
                        if (changed) {
                            setFileView(merged);
                            console.log(`[Sync] Сохранено ${Object.keys(merged).length} таймкодов`);
                            
                            forceRefreshCache();
                            
                            if (applyToPlayer) {
                                const currentTmdbId = getCurrentMovieTmdbId();
                                if (currentTmdbId && merged[currentTmdbId]) {
                                    const percent = merged[currentTmdbId].percent;
                                    applyToCurrentPlayer(currentTmdbId, percent);
                                }
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
                console.error('[Sync] Ошибка загрузки:', xhr.status);
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
                        if (fileView[tmdbId] && fileView[tmdbId].percent) {
                            let percent = fileView[tmdbId].percent;
                            // Если досмотрено до 95% - начинаем сначала
                            if (percent >= 95) {
                                percent = 0;
                                console.log(`[Sync] Фильм досмотрен до ${fileView[tmdbId].percent}%, начинаем с начала`);
                            }
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
                // Сохраняем при изменении на 5% ИЛИ раз в 30 секунд
                if (Math.abs(percent - lastPercent) >= 5 || Date.now() - lastUpdateTime >= 30000) {
                    lastPercent = percent;
                    lastUpdateTime = Date.now();
                    
                    // Сохраняем текущий прогресс с временной меткой
                    const tmdbId = getCurrentMovieTmdbId();
                    if (tmdbId) {
                        const fileView = getFileView();
                        fileView[tmdbId] = {
                            percent: percent,
                            time: e.time,
                            updated: Date.now(),
                            device: cfg().device_name
                        };
                        setFileView(fileView);
                        console.log(`[Sync] Сохранён прогресс: ${tmdbId} - ${percent}%`);
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
                console.log('[Sync] Фоновая проверка обновлений...');
                syncFromGist(false, null, true);
            }
        }, 60000);
    }

    function showGistSetup() {
        const c = cfg();
        const strategies = {
            'last_played': '🕐 По последнему просмотру (рекомендуется)',
            'max_progress': '📈 По максимальному прогрессу',
            'manual': '✋ Ручной режим'
        };
        
        Lampa.Select.show({
            title: 'Синхронизация таймкодов',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓' : '❌'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0,8)+'…' : '❌'}`, action: 'id' },
                { title: `📱 Устройство: ${c.device_name}`, action: 'device' },
                { title: `👤 Профиль: ${c.manual_profile_id || 'авто'}`, action: 'profile' },
                { title: `⏱ Интервал: ${c.sync_interval} сек`, action: 'interval' },
                { title: `🎯 Стратегия: ${strategies[c.sync_strategy] || strategies.last_played}`, action: 'strategy' },
                { title: '──────────', separator: true },
                { title: '🔄 ПОЛНАЯ СИНХРОНИЗАЦИЯ', action: 'force', accent: true },
                { title: '🗑 Очистить кэш', action: 'clearcache' },
                { title: '📤 Только отправить', action: 'upload' },
                { title: '📥 Только загрузить', action: 'download' },
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
                } else if (item.action === 'strategy') {
                    Lampa.Select.show({
                        title: 'Стратегия синхронизации',
                        items: [
                            { title: '🕐 По последнему просмотру', action: 'last_played', desc: 'Берётся таймкод с самой свежей датой просмотра' },
                            { title: '📈 По максимальному прогрессу', action: 'max_progress', desc: 'Берётся наибольший процент просмотра' },
                            { title: '✋ Ручной режим', action: 'manual', desc: 'Автосинхронизация отключена' }
                        ],
                        onSelect: (strategyItem) => {
                            c.sync_strategy = strategyItem.action;
                            saveCfg(c);
                            notify(`Стратегия: ${strategyItem.title}`);
                            showGistSetup();
                        }
                    });
                } else if (item.action === 'force') {
                    await forceFullSyncWithCacheClear();
                    setTimeout(() => showGistSetup(), 1500);
                } else if (item.action === 'clearcache') {
                    forceRefreshCache();
                    notify('🗑 Кэш таймкодов очищен');
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'upload') {
                    syncToGist(true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'download') {
                    syncFromGist(true, null, true);
                    setTimeout(() => showGistSetup(), 1000);
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
    }

    function init() {
        if (!cfg().enabled) return;
        
        const currentSource = Lampa.Storage.field('source') || 'tmdb';
        console.log(`[Sync] Инициализация. Профиль: ${getCurrentProfileId() || 'глобальный'}, источник: ${currentSource}, стратегия: ${cfg().sync_strategy}`);
        
        const current = getFileView();
        const normalized = normalizeKeys(current);
        if (JSON.stringify(current) !== JSON.stringify(normalized)) {
            console.log('[Sync] Нормализация ключей');
            setFileView(normalized);
        }
        
        hookPlayerOpen();
        hookPlayerEvents();
        addSettings();
        startBackgroundSync();
        
        setTimeout(() => {
            if (cfg().enabled) {
                syncFromGist(false, null, true);
            }
        }, 3000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
