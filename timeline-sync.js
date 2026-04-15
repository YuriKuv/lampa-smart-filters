(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let lastSyncTime = 0;
    let syncInProgress = false;
    let pendingSync = false;
    let currentMovieId = null;
    let currentMovieTime = 0;
    let autoSyncInterval = null;
    let playerCheckInterval = null;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            auto_sync: true,
            auto_save: true,
            sync_on_stop: true,
            sync_strategy: 'last_watch',
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
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

    function getSeriesInfo() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                const movie = activity.movie;
                if (movie.season !== undefined && movie.episode !== undefined) {
                    return { season: parseInt(movie.season), episode: parseInt(movie.episode) };
                }
                if (movie.number !== undefined && movie.season !== undefined) {
                    return { season: parseInt(movie.season), episode: parseInt(movie.number) };
                }
            }
            
            const playerData = Lampa.Player.playdata();
            if (playerData && playerData.path) {
                const url = playerData.path;
                const match = url.match(/[Ss](\d+)[\.\-_]?[Ee](\d+)/i);
                if (match && match[1] && match[2]) {
                    return { season: parseInt(match[1]), episode: parseInt(match[2]) };
                }
            }
        } catch(e) {}
        return null;
    }

    function getCurrentMovieKey() {
        const tmdbId = getCurrentMovieTmdbId();
        if (!tmdbId) return null;
        const seriesInfo = getSeriesInfo();
        if (seriesInfo) {
            return `${tmdbId}_s${seriesInfo.season}_e${seriesInfo.episode}`;
        }
        return tmdbId;
    }

    function getCurrentMovieTmdbId() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                const movie = activity.movie;
                if (movie.tmdb_id) return String(movie.tmdb_id);
                if (movie.id && /^\d{6,8}$/.test(String(movie.id))) {
                    return String(movie.id);
                }
            }
            return currentMovieId;
        } catch(e) {
            return currentMovieId;
        }
    }

    function saveCurrentProgress(timeInSeconds, force = false) {
        const c = cfg();
        if (!c.auto_save && !force) return false;
        
        const movieKey = getCurrentMovieKey();
        if (!movieKey) return false;
        
        const fileView = getFileView();
        const currentTime = Math.floor(timeInSeconds);
        const savedTime = fileView[movieKey]?.time || 0;
        
        if (force || Math.abs(currentTime - savedTime) >= 10) {
            const playerData = Lampa.Player.playdata();
            const duration = playerData?.timeline?.duration || 0;
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            const seriesInfo = getSeriesInfo();
            
            const record = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: Date.now(),
                tmdb_id: getCurrentMovieTmdbId()
            };
            if (seriesInfo) {
                record.season = seriesInfo.season;
                record.episode = seriesInfo.episode;
            }
            
            fileView[movieKey] = record;
            setFileView(fileView);
            console.log(`[Sync] 💾 Сохранён: ${formatTime(currentTime)} для ${movieKey}`);
            
            if (Lampa.Timeline && Lampa.Timeline.update) {
                Lampa.Timeline.update({
                    hash: movieKey,
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
        const c = cfg();
        if (!c.auto_sync && !showNotify) {
            if (callback) callback(false);
            return;
        }
        if (syncInProgress) {
            pendingSync = true;
            if (callback) callback(false);
            return;
        }
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
        const data = {
            version: 5,
            profile_id: getCurrentProfileId(),
            device: c.device_name,
            source: Lampa.Storage.field('source') || 'tmdb',
            updated: Date.now(),
            file_view: getFileView()
        };
        
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
                syncInProgress = false;
                if (pendingSync) {
                    pendingSync = false;
                    setTimeout(() => syncToGist(false, callback), 1000);
                } else if (callback) callback(true);
            },
            error: (xhr) => {
                if (showNotify) notify(`❌ Ошибка: ${xhr.status}`);
                syncInProgress = false;
                if (callback) callback(false);
            }
        });
    }

    function syncFromGist(showNotify = true, callback = null) {
        const c = cfg();
        if (!c.auto_sync && !showNotify) {
            if (callback) callback(false);
            return;
        }
        if (syncInProgress) {
            if (callback) callback(false);
            return;
        }
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
        syncInProgress = true;
        
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
                        const remoteFileView = remote.file_view || {};
                        const localFileView = getFileView();
                        const strategy = c.sync_strategy;
                        
                        let merged = { ...localFileView };
                        let changed = false;
                        
                        for (const key in remoteFileView) {
                            const localRecord = localFileView[key];
                            const remoteRecord = remoteFileView[key];
                            
                            if (!localRecord) {
                                merged[key] = remoteRecord;
                                changed = true;
                                continue;
                            }
                            
                            if (strategy === 'max_time' && remoteRecord.time > localRecord.time + 5) {
                                merged[key] = remoteRecord;
                                changed = true;
                            } else if (strategy === 'last_watch' && (remoteRecord.updated || 0) > (localRecord.updated || 0)) {
                                merged[key] = remoteRecord;
                                changed = true;
                            }
                        }
                        
                        if (changed) {
                            setFileView(merged);
                            if (Lampa.Timeline && Lampa.Timeline.read) {
                                Lampa.Timeline.read(true);
                            }
                            if (showNotify) notify(`📥 Загружено ${Object.keys(remoteFileView).length} таймкодов`);
                        } else if (showNotify) {
                            notify('✅ Данные актуальны');
                        }
                        if (callback) callback(true);
                    } else {
                        if (showNotify) notify('❌ Нет данных');
                        if (callback) callback(false);
                    }
                } catch(e) {
                    if (callback) callback(false);
                }
            },
            error: (xhr) => {
                if (showNotify) notify(`❌ Ошибка: ${xhr.status}`);
                if (callback) callback(false);
            },
            complete: () => {
                syncInProgress = false;
            }
        });
    }

    function initPlayerHandler() {
        let lastSavedProgress = 0;
        let lastSyncToGist = 0;
        
        playerCheckInterval = setInterval(() => {
            const c = cfg();
            if (!c.enabled) return;
            
            const isPlayerOpen = Lampa.Player.opened();
            if (!isPlayerOpen) return;
            
            let currentTime = null;
            try {
                const playerData = Lampa.Player.playdata();
                if (playerData && playerData.timeline && playerData.timeline.time) {
                    currentTime = playerData.timeline.time;
                }
            } catch(e) {}
            
            if (currentTime === null || currentTime <= 0) return;
            
            currentMovieTime = currentTime;
            const movieId = getCurrentMovieTmdbId();
            if (movieId) currentMovieId = movieId;
            
            if (c.auto_save && Math.floor(currentTime) - lastSavedProgress >= 10) {
                if (saveCurrentProgress(currentTime)) {
                    lastSavedProgress = Math.floor(currentTime);
                    const now = Date.now();
                    if (c.auto_sync && (now - lastSyncToGist) >= (c.sync_interval * 1000)) {
                        syncToGist(false);
                        lastSyncToGist = now;
                    }
                }
            }
        }, 1000);
        
        // Обработка закрытия плеера
        let wasOpen = false;
        const checkClose = setInterval(() => {
            const isOpen = Lampa.Player.opened();
            if (wasOpen && !isOpen && currentMovieTime > 0) {
                saveCurrentProgress(currentMovieTime, true);
                if (cfg().sync_on_stop) syncToGist(false);
            }
            wasOpen = isOpen;
        }, 500);
        
        window.tl_checkInterval = playerCheckInterval;
        window.tl_checkClose = checkClose;
    }

    function stopPlayerHandler() {
        if (window.tl_checkInterval) clearInterval(window.tl_checkInterval);
        if (window.tl_checkClose) clearInterval(window.tl_checkClose);
    }

    function startBackgroundSync() {
        if (autoSyncInterval) clearInterval(autoSyncInterval);
        autoSyncInterval = setInterval(() => {
            const c = cfg();
            if (!syncInProgress && c.auto_sync && c.enabled && !Lampa.Player.opened()) {
                syncFromGist(false);
                syncToGist(false);
            }
        }, 60000);
    }

    function showMainMenu() {
        const c = cfg();
        const strategyName = c.sync_strategy === 'max_time' ? 'по длительности' : 'по дате';
        
        Lampa.Select.show({
            title: 'Синхронизация таймкодов',
            items: [
                { title: `${c.enabled ? '✅' : '❌'} Плагин: ${c.enabled ? 'Вкл' : 'Выкл'}`, action: 'toggle_enabled' },
                { title: `${c.auto_sync ? '✅' : '❌'} Автосинхронизация: ${c.auto_sync ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_sync' },
                { title: `${c.auto_save ? '✅' : '❌'} Автосохранение: ${c.auto_save ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_save' },
                { title: `${c.sync_on_stop ? '✅' : '❌'} Синхр. при остановке: ${c.sync_on_stop ? 'Вкл' : 'Выкл'}`, action: 'toggle_sync_stop' },
                { title: '──────────', separator: true },
                { title: `🔄 Стратегия: ${strategyName}`, action: 'toggle_strategy' },
                { title: `⏱️ Интервал: ${c.sync_interval || 30} сек`, action: 'set_interval' },
                { title: `📱 Устройство: ${c.device_name}`, action: 'set_device' },
                { title: `👤 Профиль: ${c.manual_profile_id || 'авто'}`, action: 'set_profile' },
                { title: '──────────', separator: true },
                { title: `🔑 Gist токен: ${c.gist_token ? '✓' : '❌'}`, action: 'set_token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0,8)+'…' : '❌'}`, action: 'set_gist_id' },
                { title: '──────────', separator: true },
                { title: '🔄 Отправить', action: 'upload' },
                { title: '📥 Загрузить', action: 'download' },
                { title: '🔄 Полная синхронизация', action: 'force' },
                { title: '──────────', separator: true },
                { title: '❌ Закрыть', action: 'cancel' }
            ],
            onSelect: (item) => {
                const c = cfg();
                if (item.action === 'toggle_enabled') {
                    c.enabled = !c.enabled;
                    saveCfg(c);
                    notify(`Плагин ${c.enabled ? 'включён' : 'выключен'}`);
                    if (!c.enabled) stopPlayerHandler();
                    else { startBackgroundSync(); initPlayerHandler(); }
                    showMainMenu();
                }
                else if (item.action === 'toggle_auto_sync') {
                    c.auto_sync = !c.auto_sync;
                    saveCfg(c);
                    notify(`Автосинхронизация ${c.auto_sync ? 'включена' : 'выключена'}`);
                    showMainMenu();
                }
                else if (item.action === 'toggle_auto_save') {
                    c.auto_save = !c.auto_save;
                    saveCfg(c);
                    notify(`Автосохранение ${c.auto_save ? 'включено' : 'выключено'}`);
                    showMainMenu();
                }
                else if (item.action === 'toggle_sync_stop') {
                    c.sync_on_stop = !c.sync_on_stop;
                    saveCfg(c);
                    notify(`Синхр. при остановке ${c.sync_on_stop ? 'вкл' : 'выкл'}`);
                    showMainMenu();
                }
                else if (item.action === 'toggle_strategy') {
                    c.sync_strategy = c.sync_strategy === 'max_time' ? 'last_watch' : 'max_time';
                    saveCfg(c);
                    notify(`Стратегия: ${c.sync_strategy === 'max_time' ? 'по длительности' : 'по дате'}`);
                    showMainMenu();
                }
                else if (item.action === 'set_interval') {
                    Lampa.Input.edit({ title: 'Интервал (сек)', value: String(c.sync_interval || 30), free: true, number: true }, (val) => {
                        if (val !== null && !isNaN(val) && val > 0) {
                            c.sync_interval = parseInt(val);
                            saveCfg(c);
                            notify(`Интервал: ${c.sync_interval} сек`);
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'set_device') {
                    Lampa.Input.edit({ title: 'Имя устройства', value: c.device_name, free: true }, (val) => {
                        if (val !== null && val.trim()) {
                            c.device_name = val.trim();
                            saveCfg(c);
                            notify('Имя сохранено');
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'set_profile') {
                    Lampa.Input.edit({ title: 'ID профиля', value: c.manual_profile_id, free: true }, (val) => {
                        if (val !== null) {
                            c.manual_profile_id = val || '';
                            saveCfg(c);
                            notify('Профиль сохранён');
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'set_token') {
                    Lampa.Input.edit({ title: 'GitHub Token', value: c.gist_token, free: true }, (val) => {
                        if (val !== null) {
                            c.gist_token = val || '';
                            saveCfg(c);
                            notify('Токен сохранён');
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'set_gist_id') {
                    Lampa.Input.edit({ title: 'Gist ID', value: c.gist_id, free: true }, (val) => {
                        if (val !== null) {
                            c.gist_id = val || '';
                            saveCfg(c);
                            notify('Gist ID сохранён');
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'upload') {
                    syncToGist(true);
                    setTimeout(() => showMainMenu(), 1000);
                }
                else if (item.action === 'download') {
                    syncFromGist(true);
                    setTimeout(() => showMainMenu(), 1000);
                }
                else if (item.action === 'force') {
                    notify('🔄 Полная синхронизация...');
                    syncToGist(true);
                    setTimeout(() => syncFromGist(true), 1000);
                    setTimeout(() => showMainMenu(), 2000);
                }
            }
        });
    }

    function addSettingsButton() {
        Lampa.SettingsApi.addComponent({
            component: 'timeline_sync',
            name: 'Синхронизация таймкодов',
            icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z M11 7v5l4 2.5 1-1.5-3-2V7z"/></svg>'
        });
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'open_menu', type: 'button' },
            field: { name: '⚙️ Открыть меню' },
            onChange: () => showMainMenu()
        });
    }

    function init() {
        const c = cfg();
        console.log(`[Sync] Инициализация. Профиль: ${getCurrentProfileId() || 'глобальный'}`);
        if (!c.enabled) return;
        
        initPlayerHandler();
        addSettingsButton();
        startBackgroundSync();
        setTimeout(() => { if (cfg().enabled && cfg().auto_sync) syncFromGist(false); }, 3000);
        notify('✅ Синхронизация таймкодов загружена');
    }

    if (window.Lampa && Lampa.Listener) {
        if (window.appready) init();
        else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
    } else {
        setTimeout(function wait() {
            if (window.Lampa && Lampa.Listener) {
                if (window.appready) init();
                else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
            } else setTimeout(wait, 100);
        }, 100);
    }
})();
