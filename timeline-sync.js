(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let lastSyncTime = 0;
    let syncInProgress = false;
    let pendingSync = false;
    let currentMovieId = null;
    let lastSavedTime = 0;
    let currentMovieTime = 0;
    let playerOpenTime = 0;

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
            return currentMovieId;
        }
    }

    // Сохраняем прогресс в Timeline API
    function saveCurrentProgress(timeInSeconds, force = false) {
        const tmdbId = getCurrentMovieTmdbId();
        if (!tmdbId) return false;
        
        const fileView = getFileView();
        const currentTime = Math.floor(timeInSeconds);
        const savedTime = fileView[tmdbId]?.time || 0;
        
        // Сохраняем если разница больше 10 секунд или принудительно
        if (force || Math.abs(currentTime - savedTime) >= 10) {
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
            lastSavedTime = currentTime;
            
            // Обновляем через Timeline API Lampa
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
                            
                            // Обновляем данные в Timeline API
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

    // Функция для применения сохранённого таймкода
    function applySavedTimecode(tmdbId, savedTime, percent) {
        try {
            const player = Lampa.Player.core();
            if (player && player.setCurrentTime) {
                player.setCurrentTime(savedTime);
                console.log(`[Sync] 🎯 Применён таймкод: ${formatTime(savedTime)}`);
                notify(`🎯 Таймкод: ${formatTime(savedTime)}`);
                return true;
            } else if (Lampa.Player.playdata()) {
                const playdata = Lampa.Player.playdata();
                if (playdata.timeline) {
                    playdata.timeline.time = savedTime;
                    playdata.timeline.percent = percent;
                    playdata.timeline.continued = false;
                    console.log(`[Sync] 🎯 Применён таймкод через playdata: ${formatTime(savedTime)}`);
                    notify(`🎯 Таймкод: ${formatTime(savedTime)}`);
                    
                    // Дополнительная попытка через seek
                    if (Lampa.Player.core() && Lampa.Player.core().seek) {
                        Lampa.Player.core().seek(savedTime);
                    }
                    return true;
                }
            }
        } catch(err) {
            console.log('[Sync] Ошибка применения таймкода:', err);
        }
        return false;
    }

    // Функция ожидания готовности плеера
    function waitForPlayer(tmdbId, savedTime, percent, maxAttempts = 10) {
        let attempts = 0;
        
        const checkPlayer = setInterval(() => {
            attempts++;
            
            if (Lampa.Player.opened() && Lampa.Player.core()) {
                clearInterval(checkPlayer);
                setTimeout(() => {
                    applySavedTimecode(tmdbId, savedTime, percent);
                }, 500);
            } else if (attempts >= maxAttempts) {
                clearInterval(checkPlayer);
                console.log('[Sync] Не удалось применить таймкод: плеер не готов');
            }
        }, 500);
    }

    function initPlayerHandler() {
        let lastSavedProgress = 0;
        let saveInterval = null;
        
        // Слушаем события плеера
        Lampa.Listener.follow('player', (e) => {
            // Открытие фильма
            if (e.type === 'open' && e.movie) {
                currentMovieId = extractTmdbIdFromItem(e.movie);
                currentMovieTime = 0;
                playerOpenTime = Date.now();
                console.log(`[Sync] 🎬 Открыт фильм: ${currentMovieId}`);
                
                // Загружаем таймкод
                setTimeout(() => {
                    syncFromGist(false, (success) => {
                        if (success && currentMovieId) {
                            const fileView = getFileView();
                            if (fileView[currentMovieId] && fileView[currentMovieId].time) {
                                const savedTime = fileView[currentMovieId].time;
                                const percent = fileView[currentMovieId].percent;
                                console.log(`[Sync] 🎯 Найден таймкод: ${formatTime(savedTime)}`);
                                
                                if (savedTime > 0) {
                                    waitForPlayer(currentMovieId, savedTime, percent);
                                }
                            }
                        }
                    });
                }, 1500);
            }
            
            // Обновление времени
            if (e.type === 'timeupdate' && e.time) {
                currentMovieTime = e.time;
                
                // Автоматическое сохранение каждые 10 секунд
                if (Math.floor(currentMovieTime) - lastSavedProgress >= 10) {
                    if (saveCurrentProgress(currentMovieTime)) {
                        lastSavedProgress = Math.floor(currentMovieTime);
                        
                        // Автоматическая отправка на сервер каждые 30 секунд
                        const now = Date.now();
                        if (cfg().enabled && now - lastSyncTime > 30000) {
                            syncToGist(false);
                        }
                    }
                }
            }
            
            // Пауза - сохраняем прогресс
            if (e.type === 'pause') {
                console.log(`[Sync] ⏸️ Пауза на ${formatTime(currentMovieTime)}`);
                if (currentMovieTime > 0) {
                    saveCurrentProgress(currentMovieTime, true);
                    if (cfg().sync_on_stop) {
                        syncToGist(false);
                    }
                }
            }
            
            // Стоп - финальное сохранение
            if (e.type === 'stop') {
                console.log(`[Sync] ⏹️ Остановлен на ${formatTime(currentMovieTime)}`);
                if (currentMovieTime > 0) {
                    saveCurrentProgress(currentMovieTime, true);
                    if (cfg().sync_on_stop) {
                        syncToGist(false);
                    }
                }
                currentMovieId = null;
                currentMovieTime = 0;
                lastSavedProgress = 0;
            }
        });
        
        // Дополнительный интервал для автоматического сохранения и синхронизации
        setInterval(() => {
            if (Lampa.Player.opened() && currentMovieTime > 0) {
                // Сохраняем прогресс каждые 10 секунд
                if (Math.floor(currentMovieTime) - lastSavedProgress >= 10) {
                    if (saveCurrentProgress(currentMovieTime)) {
                        lastSavedProgress = Math.floor(currentMovieTime);
                    }
                }
                
                // Автосинхронизация с сервером
                if (cfg().enabled && Date.now() - lastSyncTime > (cfg().sync_interval * 1000 || 30000)) {
                    if (!syncInProgress && currentMovieId) {
                        console.log(`[Sync] 🔄 Автосинхронизация (интервал)`);
                        syncToGist(false);
                    }
                }
            }
        }, 5000);
    }

    function startBackgroundSync() {
        // Фоновая синхронизация каждые 60 секунд
        setInterval(() => {
            if (!syncInProgress && cfg().enabled && !Lampa.Player.opened()) {
                console.log(`[Sync] 🔄 Фоновая синхронизация`);
                syncFromGist(false);
                syncToGist(false);
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
                { title: `⏱️ Интервал: ${c.sync_interval || 30} сек`, action: 'interval' },
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
                } else if (item.action === 'interval') {
                    Lampa.Input.edit({ title: 'Интервал синхронизации (сек)', value: String(c.sync_interval || 30), free: true, number: true }, (val) => {
                        if (val !== null && !isNaN(val) && val > 0) { 
                            c.sync_interval = parseInt(val); 
                            saveCfg(c); 
                            notify(`Интервал: ${c.sync_interval} сек`); 
                        }
                        showGistSetup();
                    });
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
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'sync_on_stop', type: 'toggle', default: true },
            field: { name: 'Синхронизировать при остановке' },
            onChange: v => { const c = cfg(); c.sync_on_stop = v; saveCfg(c); }
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
        
        // Первая синхронизация через 3 секунды
        setTimeout(() => {
            if (cfg().enabled) {
                syncFromGist(false);
            }
        }, 3000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
