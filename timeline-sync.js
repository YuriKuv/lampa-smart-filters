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
    let autoSyncInterval = null;
    let autoSaveInterval = null;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            auto_sync: true,
            auto_save: true,
            sync_on_stop: true,
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

    function saveCurrentProgress(timeInSeconds, force = false) {
        const c = cfg();
        if (!c.auto_save && !force) return false;
        
        const tmdbId = getCurrentMovieTmdbId();
        if (!tmdbId) return false;
        
        const fileView = getFileView();
        const currentTime = Math.floor(timeInSeconds);
        const savedTime = fileView[tmdbId]?.time || 0;
        
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
        const c = cfg();
        if (!c.auto_sync) {
            if (showNotify) notify('⚠️ Автосинхронизация выключена');
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
        const c = cfg();
        if (!c.auto_sync) {
            if (showNotify) notify('⚠️ Автосинхронизация выключена');
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
        
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'open' && e.movie) {
                currentMovieId = extractTmdbIdFromItem(e.movie);
                currentMovieTime = 0;
                lastSavedProgress = 0;
                console.log(`[Sync] 🎬 Открыт фильм: ${currentMovieId}`);
                
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
            
            if (e.type === 'timeupdate' && e.time) {
                currentMovieTime = e.time;
                
                if (cfg().auto_save && Math.floor(currentMovieTime) - lastSavedProgress >= 10) {
                    if (saveCurrentProgress(currentMovieTime)) {
                        lastSavedProgress = Math.floor(currentMovieTime);
                        
                        if (cfg().auto_sync && Date.now() - lastSyncTime > (cfg().sync_interval * 1000)) {
                            syncToGist(false);
                        }
                    }
                }
            }
            
            if (e.type === 'pause') {
                console.log(`[Sync] ⏸️ Пауза на ${formatTime(currentMovieTime)}`);
                if (currentMovieTime > 0) {
                    saveCurrentProgress(currentMovieTime, true);
                    if (cfg().sync_on_stop && cfg().auto_sync) {
                        syncToGist(false);
                    }
                }
            }
            
            if (e.type === 'stop') {
                console.log(`[Sync] ⏹️ Остановлен на ${formatTime(currentMovieTime)}`);
                if (currentMovieTime > 0) {
                    saveCurrentProgress(currentMovieTime, true);
                    if (cfg().sync_on_stop && cfg().auto_sync) {
                        syncToGist(false);
                    }
                }
                currentMovieId = null;
                currentMovieTime = 0;
                lastSavedProgress = 0;
            }
        });
    }

    function startBackgroundSync() {
        if (autoSyncInterval) clearInterval(autoSyncInterval);
        
        autoSyncInterval = setInterval(() => {
            const c = cfg();
            if (!syncInProgress && c.auto_sync && !Lampa.Player.opened()) {
                console.log(`[Sync] 🔄 Фоновая синхронизация`);
                syncFromGist(false);
                syncToGist(false);
            }
        }, 60000);
    }

    function showMainMenu() {
        const c = cfg();
        Lampa.Select.show({
            title: 'Синхронизация таймкодов',
            items: [
                { title: `${c.enabled ? '✅' : '❌'} Плагин: ${c.enabled ? 'Включён' : 'Выключен'}`, action: 'toggle_enabled' },
                { title: `${c.auto_sync ? '✅' : '❌'} Автосинхронизация: ${c.auto_sync ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_sync' },
                { title: `${c.auto_save ? '✅' : '❌'} Автосохранение: ${c.auto_save ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_save' },
                { title: `${c.sync_on_stop ? '✅' : '❌'} Синхр. при остановке: ${c.sync_on_stop ? 'Вкл' : 'Выкл'}`, action: 'toggle_sync_stop' },
                { title: '──────────', separator: true },
                { title: `⏱️ Интервал синхр.: ${c.sync_interval || 30} сек`, action: 'set_interval' },
                { title: `📱 Устройство: ${c.device_name}`, action: 'set_device' },
                { title: `👤 Профиль: ${c.manual_profile_id || 'авто'}`, action: 'set_profile' },
                { title: '──────────', separator: true },
                { title: `🔑 Gist токен: ${c.gist_token ? '✓ установлен' : '❌ не установлен'}`, action: 'set_token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0,8)+'…' : '❌ не установлен'}`, action: 'set_gist_id' },
                { title: '──────────', separator: true },
                { title: '🔄 Отправить таймкоды', action: 'upload' },
                { title: '📥 Загрузить таймкоды', action: 'download' },
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
                    if (!c.enabled) {
                        if (autoSyncInterval) clearInterval(autoSyncInterval);
                    } else {
                        startBackgroundSync();
                    }
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
                    notify(`Синхронизация при остановке ${c.sync_on_stop ? 'включена' : 'выключена'}`);
                    showMainMenu();
                }
                else if (item.action === 'set_interval') {
                    Lampa.Input.edit({ title: 'Интервал синхронизации (сек)', value: String(c.sync_interval || 30), free: true, number: true }, (val) => {
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
                    Lampa.Input.edit({ title: 'ID профиля (пусто = авто)', value: c.manual_profile_id, free: true }, (val) => {
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
                    setTimeout(() => {
                        syncFromGist(true);
                    }, 1000);
                    setTimeout(() => showMainMenu(), 2000);
                }
            },
            onBack: () => {
                Lampa.Controller.toggle('content');
            }
        });
    }

    function addSettingsButton() {
        // Добавляем кнопку в главное меню Lampa
        Lampa.Menu.add({
            title: 'Синхр. таймкодов',
            icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z M11 7v5l4 2.5 1-1.5-3-2V7z"/></svg>',
            onSelect: () => showMainMenu()
        });
        
        // Также добавляем в раздел настроек
        Lampa.SettingsApi.addParam({
            component: 'user',
            param: { name: 'timeline_sync_menu', type: 'button' },
            field: { name: '🎬 Синхронизация таймкодов' },
            onChange: () => showMainMenu()
        });
    }

    function init() {
        const c = cfg();
        if (!c.enabled) return;
        
        console.log(`[Sync] Инициализация. Профиль: ${getCurrentProfileId() || 'глобальный'}`);
        console.log(`[Sync] Автосинхронизация: ${c.auto_sync ? 'Вкл' : 'Выкл'}`);
        console.log(`[Sync] Автосохранение: ${c.auto_save ? 'Вкл' : 'Выкл'}`);
        
        const current = getFileView();
        const normalized = normalizeKeys(current);
        if (JSON.stringify(current) !== JSON.stringify(normalized)) {
            console.log('[Sync] Нормализация ключей');
            setFileView(normalized);
        }
        
        initPlayerHandler();
        addSettingsButton();
        startBackgroundSync();
        
        setTimeout(() => {
            if (cfg().enabled && cfg().auto_sync) {
                syncFromGist(false);
            }
        }, 3000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
