(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let syncInProgress = false;
    let pendingSync = false;
    let currentMovieId = null;
    let currentMovieTime = 0;
    let autoSyncInterval = null;
    let playerCheckInterval = null;
    let timerId = null;
    let lastPosition = 0;
    let endCreditsDetected = false;
    let isV3 = false;
    let styleInjected = false;
    let modulePatched = false;

    // ============ КОНФИГУРАЦИЯ ============
    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            auto_sync: true,
            auto_save: true,
            sync_on_stop: true,
            sync_strategy: 'max_time',
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform ? Lampa.Platform.get() : 'Unknown',
            manual_profile_id: '',
            sync_interval: 30,
            cleanup_days: 30,
            cleanup_completed: true,
            end_credits_threshold: 180,
            always_show_timeline: true,
            timeline_position: 'bottom'
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function notify(text, timeout) {
        if (timeout === undefined) timeout = 3000;
        Lampa.Noty.show(text, timeout);
    }

    // ============ УТИЛИТЫ ============
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
        if (item.id && /^\d{6,8}$/.test(String(item.id))) return String(item.id);
        if (item.movie_id && /^\d{6,8}$/.test(String(item.movie_id))) return String(item.movie_id);
        return null;
    }

    function getSeriesInfoFromUrl() {
        try {
            const playerData = Lampa.Player.playdata();
            if (playerData && playerData.path) {
                const url = playerData.path;
                const patterns = [/S(\d+)E(\d+)/i, /S(\d+)[\s.]*E(\d+)/i, /(\d+)x(\d+)/i, /Season[.\s]*(\d+)[.\s]*Episode[.\s]*(\d+)/i];
                for (const pattern of patterns) {
                    const match = url.match(pattern);
                    if (match && match[1] && match[2]) return { season: parseInt(match[1]), episode: parseInt(match[2]) };
                }
            }
        } catch(e) {}
        return null;
    }

    function getCurrentMovieKey() {
        const tmdbId = getCurrentMovieTmdbId();
        if (!tmdbId) return null;
        const seriesInfo = getSeriesInfoFromUrl();
        if (seriesInfo) return `${tmdbId}_s${seriesInfo.season}_e${seriesInfo.episode}`;
        return tmdbId;
    }

    function getCurrentMovieTmdbId() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                const tmdbId = extractTmdbIdFromItem(activity.movie);
                if (tmdbId) return tmdbId;
            }
            return currentMovieId;
        } catch(e) {
            return currentMovieId;
        }
    }

    function getSource() {
        return Lampa.Storage.field('source') || 'tmdb';
    }

    function formatTime(seconds) {
        if (!seconds || seconds < 0) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    // ============ ПАТЧ МОДУЛЯ WATCHED ============
    function patchWatchedModule() {
        if (modulePatched) return;
        if (!Lampa.Maker || !Lampa.Maker.map) return;

        try {
            const cardMap = Lampa.Maker.map('Card');
            if (cardMap && cardMap.Watched) {
                const originalOnCreate = cardMap.Watched.onCreate;
                
                cardMap.Watched.onCreate = function() {
                    if (originalOnCreate) originalOnCreate.call(this);
                    
                    const c = cfg();
                    if (!c.always_show_timeline) return;
                    
                    setTimeout(() => {
                        this.emit('watched');
                    }, 100);
                    
                    Lampa.Listener.follow('state:changed', (e) => {
                        if (e.target === 'timeline' && (e.reason === 'read' || e.reason === 'update')) {
                            setTimeout(() => this.emit('watched'), 50);
                        }
                    });
                };
                
                modulePatched = true;
                console.log('[Sync] Модуль Watched пропатчен');
            }
        } catch(e) {
            console.warn('[Sync] Не удалось пропатчить модуль Watched:', e);
        }
    }

    // ============ СТИЛИ ДЛЯ ТАЙМКОДОВ ============
    function getPositionStyles() {
        const c = cfg();
        const pos = c.timeline_position || 'bottom';
        const styles = {
            bottom: `bottom: 2.5em !important; top: auto !important;`,
            center: `bottom: auto !important; top: 50% !important; transform: translateY(-50%) !important;`,
            top: `bottom: auto !important; top: 0.5em !important;`
        };
        return styles[pos] || styles.bottom;
    }

    function injectTimelineStyles() {
        const oldStyle = document.getElementById('tl-sync-styles');
        if (oldStyle) oldStyle.remove();
        
        const positionStyles = getPositionStyles();
        
        const style = document.createElement('style');
        style.id = 'tl-sync-styles';
        style.textContent = `
            .card .card-watched {
                display: block !important;
                opacity: 1 !important;
                visibility: visible !important;
                pointer-events: none;
                ${positionStyles}
                left: 0.8em !important;
                right: 0.8em !important;
                z-index: 5 !important;
                background-color: rgba(0, 0, 0, 0.7) !important;
                -webkit-backdrop-filter: blur(2px);
                backdrop-filter: blur(2px);
            }
            
            .card:not(.focus) .card-watched {
                display: block !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
            
            .card-watched[style*="display: none"] {
                display: block !important;
            }
            
            .card-watched__item:nth-child(n+3) {
                display: none !important;
            }
            
            .card--wide .card-watched__item:nth-child(n+2) {
                display: none !important;
            }
            
            @media screen and (max-width: 480px) {
                .card .card-watched {
                    left: 0.5em !important;
                    right: 0.5em !important;
                }
            }
        `;
        document.head.appendChild(style);
        styleInjected = true;
        console.log('[Sync] Стили добавлены');
    }

    function removeTimelineStyles() {
        const oldStyle = document.getElementById('tl-sync-styles');
        if (oldStyle) oldStyle.remove();
        styleInjected = false;
    }

    function forceRefreshCards() {
        const c = cfg();
        if (!c.always_show_timeline) return;
        
        if (Lampa.Timeline && Lampa.Timeline.read) {
            Lampa.Timeline.read(true);
        }
        
        setTimeout(() => {
            document.querySelectorAll('.card').forEach(card => {
                card.classList.add('focus');
                setTimeout(() => card.classList.remove('focus'), 50);
            });
        }, 200);
    }

    function enableAlwaysShowTimeline() {
        injectTimelineStyles();
        patchWatchedModule();
        forceRefreshCards();
    }

    function disableAlwaysShowTimeline() {
        removeTimelineStyles();
    }

    // ============ ОЧИСТКА СТАРЫХ ЗАПИСЕЙ ============
    function cleanupOldRecords() {
        const c = cfg();
        const now = Date.now();
        const fileView = getFileView();
        let cleaned = 0;
        let completed_cleaned = 0;
        
        const cutoffDate = now - (c.cleanup_days * 86400000);
        
        for (const key in fileView) {
            const record = fileView[key];
            let shouldDelete = false;
            
            if (c.cleanup_days > 0 && record.updated && record.updated < cutoffDate) {
                shouldDelete = true;
                cleaned++;
            }
            
            if (c.cleanup_completed && record.percent >= 95) {
                shouldDelete = true;
                completed_cleaned++;
            }
            
            if (shouldDelete) delete fileView[key];
        }
        
        if (cleaned > 0 || completed_cleaned > 0) {
            setFileView(fileView);
            console.log(`[Sync] Очистка: удалено ${cleaned} старых и ${completed_cleaned} завершённых`);
        }
    }

    // ============ АВТО-ОПРЕДЕЛЕНИЕ ФИНАЛА ============
    function checkEndCredits(currentTime, duration) {
        const c = cfg();
        if (!duration || duration <= 0) return false;
        
        const remaining = duration - currentTime;
        const threshold = c.end_credits_threshold || 180;
        
        if (remaining <= threshold && remaining > 0 && !endCreditsDetected) {
            endCreditsDetected = true;
            if (currentTime > lastPosition + 30) return false;
            
            console.log(`[Sync] Обнаружены финальные титры (осталось ${Math.floor(remaining)}с)`);
            
            Lampa.Noty.show('Финальные титры. Отметить как просмотренное?', 5000, function() {
                markAsWatched();
            });
            
            return true;
        }
        
        lastPosition = currentTime;
        return false;
    }

    function markAsWatched() {
        const movieKey = getCurrentMovieKey();
        if (!movieKey) return;
        
        const duration = Lampa.Player.playdata()?.timeline?.duration || 0;
        const fileView = getFileView();
        
        fileView[movieKey] = {
            time: duration,
            percent: 100,
            duration: duration,
            updated: Date.now(),
            tmdb_id: getCurrentMovieTmdbId(),
            source: getSource(),
            completed: true
        };
        
        setFileView(fileView);
        notify('Отмечено как просмотренное');
        
        if (Lampa.Timeline && Lampa.Timeline.update) {
            Lampa.Timeline.update({
                hash: movieKey,
                percent: 100,
                time: duration,
                duration: duration
            });
        }
        
        if (cfg().sync_on_stop) {
            setTimeout(function() { syncNow(false); }, 500);
        }
    }

    // ============ СОХРАНЕНИЕ ПРОГРЕССА ============
    function saveCurrentProgress(timeInSeconds, force) {
        if (force === undefined) force = false;
        
        const c = cfg();
        if (!c.auto_save && !force) return false;
        
        const movieKey = getCurrentMovieKey();
        if (!movieKey) return false;
        
        const fileView = getFileView();
        const currentTime = Math.floor(timeInSeconds);
        const savedTime = fileView[movieKey]?.time || 0;
        
        if (force || Math.abs(currentTime - savedTime) >= 10) {
            const duration = Lampa.Player.playdata()?.timeline?.duration || 0;
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            const seriesInfo = getSeriesInfoFromUrl();
            
            fileView[movieKey] = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: Date.now(),
                tmdb_id: getCurrentMovieTmdbId(),
                source: getSource(),
                ...(seriesInfo && { season: seriesInfo.season, episode: seriesInfo.episode })
            };
            
            setFileView(fileView);
            console.log(`[Sync] Сохранён прогресс: ${formatTime(currentTime)} (${percent}%) для ${movieKey}`);
            
            if (duration > 0) checkEndCredits(currentTime, duration);
            
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

    // ============ СИНХРОНИЗАЦИЯ ============
    function syncNow(showNotify, callback) {
        if (showNotify === undefined) showNotify = true;
        
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
        if (syncInProgress) {
            pendingSync = true;
            if (callback) callback(false);
            return;
        }
        
        syncInProgress = true;
        
        if (showNotify) notify('Синхронизация...');
        
        // Получаем данные с сервера
        $.ajax({
            url: 'https://api.github.com/gists/' + c.gist_id,
            method: 'GET',
            headers: {
                'Authorization': 'token ' + c.gist_token,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: function(response) {
                try {
                    const content = response.files['timeline.json']?.content;
                    let remoteData = { file_view: {} };
                    
                    if (content) {
                        remoteData = JSON.parse(content);
                    }
                    
                    const localFileView = getFileView();
                    const remoteFileView = remoteData.file_view || {};
                    const strategy = c.sync_strategy;
                    
                    let merged = { ...remoteFileView };
                    let hasChanges = false;
                    let updatedCount = 0;
                    let newCount = 0;
                    
                    // Применяем локальные изменения
                    for (const key in localFileView) {
                        const localRecord = localFileView[key];
                        const remoteRecord = remoteFileView[key];
                        
                        if (!remoteRecord) {
                            merged[key] = localRecord;
                            hasChanges = true;
                            newCount++;
                        } else {
                            let shouldUpdate = false;
                            
                            if (strategy === 'max_time') {
                                shouldUpdate = localRecord.time > remoteRecord.time + 5;
                            } else {
                                const localUpdated = localRecord.updated || 0;
                                const remoteUpdated = remoteRecord.updated || 0;
                                
                                if (localRecord.time > remoteRecord.time + 30) {
                                    shouldUpdate = true;
                                } else if (localRecord.percent === 100 && remoteRecord.percent < 100) {
                                    shouldUpdate = true;
                                } else if (localUpdated > remoteUpdated + 5000) {
                                    shouldUpdate = true;
                                }
                            }
                            
                            if (shouldUpdate) {
                                merged[key] = localRecord;
                                hasChanges = true;
                                updatedCount++;
                            }
                        }
                    }
                    
                    // Проверяем записи с сервера, которых нет локально
                    for (const key in remoteFileView) {
                        if (!localFileView[key]) {
                            merged[key] = remoteFileView[key];
                        }
                    }
                    
                    // Сохраняем объединённые данные
                    setFileView(merged);
                    
                    if (hasChanges) {
                        // Отправляем полный file_view
                        const dataToSend = {
                            version: 6,
                            profile_id: getCurrentProfileId(),
                            device: c.device_name,
                            source: getSource(),
                            updated: Date.now(),
                            file_view: merged
                        };
                        
                        $.ajax({
                            url: 'https://api.github.com/gists/' + c.gist_id,
                            method: 'PATCH',
                            headers: {
                                'Authorization': 'token ' + c.gist_token,
                                'Accept': 'application/vnd.github.v3+json'
                            },
                            data: JSON.stringify({
                                description: 'Lampa Timeline Sync',
                                public: false,
                                files: {
                                    'timeline.json': {
                                        content: JSON.stringify(dataToSend, null, 2)
                                    }
                                }
                            }),
                            success: function() {
                                if (Lampa.Timeline && Lampa.Timeline.read) {
                                    Lampa.Timeline.read(true);
                                }
                                
                                if (showNotify) {
                                    notify('Синхронизировано: +' + newCount + ' новых, ' + updatedCount + ' обновлено');
                                }
                                
                                console.log('[Sync] Синхронизация завершена: +' + newCount + ' новых, ' + updatedCount + ' обновлено');
                                
                                syncInProgress = false;
                                if (pendingSync) {
                                    pendingSync = false;
                                    setTimeout(() => syncNow(false, callback), 1000);
                                } else if (callback) {
                                    callback(true);
                                }
                            },
                            error: function(xhr) {
                                console.error('[Sync] Ошибка отправки:', xhr.status);
                                if (showNotify) notify('Ошибка отправки: ' + xhr.status);
                                syncInProgress = false;
                                if (callback) callback(false);
                            }
                        });
                    } else {
                        console.log('[Sync] Нет изменений для отправки');
                        if (showNotify) notify('Данные актуальны');
                        
                        if (Lampa.Timeline && Lampa.Timeline.read) {
                            Lampa.Timeline.read(true);
                        }
                        
                        syncInProgress = false;
                        if (callback) callback(true);
                    }
                } catch(e) {
                    console.error('[Sync] Ошибка обработки данных:', e);
                    if (showNotify) notify('Ошибка данных');
                    syncInProgress = false;
                    if (callback) callback(false);
                }
            },
            error: function(xhr) {
                console.error('[Sync] Ошибка получения данных:', xhr.status);
                if (showNotify) notify('Ошибка: ' + xhr.status);
                syncInProgress = false;
                if (callback) callback(false);
            }
        });
    }

    function fullResetFromServer(showNotify) {
        if (showNotify === undefined) showNotify = true;
        
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            notify('Gist не настроен');
            return;
        }
        
        if (showNotify) notify('Загрузка с сервера...');
        
        $.ajax({
            url: 'https://api.github.com/gists/' + c.gist_id,
            method: 'GET',
            headers: {
                'Authorization': 'token ' + c.gist_token,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: function(data) {
                try {
                    const content = data.files['timeline.json']?.content;
                    if (content) {
                        const remote = JSON.parse(content);
                        const remoteFileView = remote.file_view || {};
                        
                        setFileView(remoteFileView);
                        
                        if (Lampa.Timeline && Lampa.Timeline.read) {
                            Lampa.Timeline.read(true);
                        }
                        
                        const count = Object.keys(remoteFileView).length;
                        if (showNotify) notify('Загружено ' + count + ' записей');
                    } else {
                        if (showNotify) notify('Нет данных на сервере');
                    }
                } catch(e) {
                    console.error('[Sync] Ошибка:', e);
                    if (showNotify) notify('Ошибка данных');
                }
            },
            error: function(xhr) {
                console.error('[Sync] Ошибка загрузки:', xhr.status);
                if (showNotify) notify('Ошибка: ' + xhr.status);
            }
        });
    }

    // ============ ПЛЕЕР ============
    function saveCurrentProgressForce() {
        if (currentMovieTime > 0) {
            saveCurrentProgress(currentMovieTime, true);
            if (cfg().sync_on_stop) syncNow(false);
        }
    }

    function initPlayerHandler() {
        let lastSavedProgress = 0;
        let lastSyncToGist = 0;
        endCreditsDetected = false;
        
        function getCurrentPlayerTime() {
            try {
                if (Lampa.Player.opened()) {
                    const playerData = Lampa.Player.playdata();
                    if (playerData && playerData.timeline && playerData.timeline.time) {
                        return playerData.timeline.time;
                    }
                }
            } catch(e) {}
            return null;
        }
        
        function getCurrentMovieIdFromActivity() {
            try {
                const activity = Lampa.Activity.active();
                if (activity && activity.movie) {
                    return extractTmdbIdFromItem(activity.movie);
                }
            } catch(e) {}
            return null;
        }
        
        let wasPlayerOpen = false;
        let lastMovieKey = null;
        
        playerCheckInterval = setInterval(function() {
            const c = cfg();
            if (!c.enabled) return;
            
            const isPlayerOpen = Lampa.Player.opened();
            const currentTime = getCurrentPlayerTime();
            
            // При закрытии плеера сохраняем прогресс
            if (wasPlayerOpen && !isPlayerOpen && currentMovieTime > 0) {
                saveCurrentProgressForce();
                endCreditsDetected = false;
            }
            wasPlayerOpen = isPlayerOpen;
            
            if (isPlayerOpen && currentTime !== null && currentTime > 0) {
                const movieId = getCurrentMovieIdFromActivity();
                if (movieId) {
                    currentMovieId = movieId;
                    currentMovieTime = currentTime;
                    
                    const movieKey = getCurrentMovieKey();
                    if (movieKey && movieKey !== lastMovieKey) {
                        lastMovieKey = movieKey;
                        lastSavedProgress = 0;
                        endCreditsDetected = false;
                    }
                    
                    if (c.auto_save && Math.floor(currentTime) - lastSavedProgress >= 10) {
                        if (saveCurrentProgress(currentTime)) {
                            lastSavedProgress = Math.floor(currentTime);
                            
                            const now = Date.now();
                            if (c.auto_sync && (now - lastSyncToGist) >= (c.sync_interval * 1000)) {
                                syncNow(false);
                                lastSyncToGist = now;
                            }
                        }
                    }
                }
            }
        }, 1000);
    }

    function stopPlayerHandler() {
        if (playerCheckInterval) {
            clearInterval(playerCheckInterval);
            playerCheckInterval = null;
        }
    }

    // ============ ФОНОВАЯ СИНХРОНИЗАЦИЯ ============
    function startBackgroundSync() {
        const c = cfg();
        
        if (isV3 && Lampa.Timer) {
            if (timerId) Lampa.Timer.remove(timerId);
            
            timerId = function() {
                const currentCfg = cfg();
                if (!syncInProgress && currentCfg.auto_sync && currentCfg.enabled && !Lampa.Player.opened()) {
                    syncNow(false);
                    cleanupOldRecords();
                }
            };
            
            Lampa.Timer.add(c.sync_interval * 1000, timerId);
        } else {
            if (autoSyncInterval) clearInterval(autoSyncInterval);
            
            autoSyncInterval = setInterval(function() {
                const currentCfg = cfg();
                if (!syncInProgress && currentCfg.auto_sync && currentCfg.enabled && !Lampa.Player.opened()) {
                    syncNow(false);
                    cleanupOldRecords();
                }
            }, c.sync_interval * 1000);
        }
    }

    function stopBackgroundSync() {
        if (isV3 && Lampa.Timer && timerId) {
            Lampa.Timer.remove(timerId);
            timerId = null;
        }
        if (autoSyncInterval) {
            clearInterval(autoSyncInterval);
            autoSyncInterval = null;
        }
    }

    // ============ МЕНЮ ============
    function showMainMenu() {
        const c = cfg();
        const strategyName = c.sync_strategy === 'max_time' ? 'по длительности' : 'по дате';
        const positionName = c.timeline_position === 'bottom' ? 'снизу' : (c.timeline_position === 'center' ? 'по центру' : 'сверху');
        
        Lampa.Select.show({
            title: 'Синхронизация таймкодов',
            items: [
                { title: (c.enabled ? '[OK]' : '[OFF]') + ' Плагин: ' + (c.enabled ? 'Вкл' : 'Выкл'), action: 'toggle_enabled' },
                { title: (c.auto_sync ? '[OK]' : '[OFF]') + ' Автосинхронизация: ' + (c.auto_sync ? 'Вкл' : 'Выкл'), action: 'toggle_auto_sync' },
                { title: (c.auto_save ? '[OK]' : '[OFF]') + ' Автосохранение: ' + (c.auto_save ? 'Вкл' : 'Выкл'), action: 'toggle_auto_save' },
                { title: '──────────', separator: true },
                { title: (c.always_show_timeline ? '[OK]' : '[OFF]') + ' Таймкоды всегда: ' + (c.always_show_timeline ? 'Вкл' : 'Выкл'), action: 'toggle_always_show' },
                { title: 'Позиция таймкода: ' + positionName, action: 'toggle_position' },
                { title: 'Стратегия: ' + strategyName, action: 'toggle_strategy' },
                { title: 'Интервал синхр.: ' + (c.sync_interval || 30) + ' сек', action: 'set_interval' },
                { title: 'Порог титров: ' + (c.end_credits_threshold || 180) + ' сек', action: 'set_threshold' },
                { title: '──────────', separator: true },
                { title: 'Очистка старше: ' + (c.cleanup_days || 0) + ' дней', action: 'set_cleanup_days' },
                { title: (c.cleanup_completed ? '[OK]' : '[OFF]') + ' Очищать завершённые', action: 'toggle_cleanup_completed' },
                { title: '──────────', separator: true },
                { title: 'Устройство: ' + (c.device_name || 'Unknown'), action: 'set_device' },
                { title: 'Профиль: ' + (c.manual_profile_id || 'авто'), action: 'set_profile' },
                { title: '──────────', separator: true },
                { title: 'Gist токен: ' + (c.gist_token ? 'установлен' : 'НЕ установлен'), action: 'set_token' },
                { title: 'Gist ID: ' + (c.gist_id ? c.gist_id.substring(0, 8) + '…' : 'НЕ установлен'), action: 'set_gist_id' },
                { title: '──────────', separator: true },
                { title: 'Синхронизировать сейчас', action: 'sync_now' },
                { title: 'Полный сброс (загрузить с сервера)', action: 'full_reset' },
                { title: '──────────', separator: true },
                { title: 'Закрыть', action: 'cancel' }
            ],
            onSelect: function(item) {
                const c = cfg();
                
                if (item.action === 'toggle_enabled') {
                    c.enabled = !c.enabled;
                    saveCfg(c);
                    
                    if (!c.enabled) {
                        stopBackgroundSync();
                        stopPlayerHandler();
                        disableAlwaysShowTimeline();
                    } else {
                        startBackgroundSync();
                        initPlayerHandler();
                        if (c.always_show_timeline) enableAlwaysShowTimeline();
                    }
                    
                    notify('Плагин ' + (c.enabled ? 'включён' : 'выключен'));
                    showMainMenu();
                }
                else if (item.action === 'toggle_auto_sync') {
                    c.auto_sync = !c.auto_sync;
                    saveCfg(c);
                    notify('Автосинхронизация ' + (c.auto_sync ? 'включена' : 'выключена'));
                    showMainMenu();
                }
                else if (item.action === 'toggle_auto_save') {
                    c.auto_save = !c.auto_save;
                    saveCfg(c);
                    notify('Автосохранение ' + (c.auto_save ? 'включено' : 'выключено'));
                    showMainMenu();
                }
                else if (item.action === 'toggle_always_show') {
                    c.always_show_timeline = !c.always_show_timeline;
                    saveCfg(c);
                    if (c.always_show_timeline) {
                        enableAlwaysShowTimeline();
                        notify('Таймкоды всегда видны');
                    } else {
                        disableAlwaysShowTimeline();
                        notify('Таймкоды только при наведении');
                    }
                    showMainMenu();
                }
                else if (item.action === 'toggle_position') {
                    Lampa.Select.show({
                        title: 'Позиция таймкода',
                        items: [
                            { title: 'Снизу', action: 'bottom' },
                            { title: 'По центру', action: 'center' },
                            { title: 'Сверху', action: 'top' }
                        ],
                        onSelect: function(subItem) {
                            if (subItem.action) {
                                c.timeline_position = subItem.action;
                                saveCfg(c);
                                if (c.always_show_timeline) enableAlwaysShowTimeline();
                                const posName = subItem.action === 'bottom' ? 'снизу' : (subItem.action === 'center' ? 'по центру' : 'сверху');
                                notify('Позиция: ' + posName);
                            }
                            showMainMenu();
                        },
                        onBack: function() { showMainMenu(); }
                    });
                }
                else if (item.action === 'toggle_strategy') {
                    c.sync_strategy = c.sync_strategy === 'max_time' ? 'last_watch' : 'max_time';
                    saveCfg(c);
                    notify('Стратегия: ' + (c.sync_strategy === 'max_time' ? 'по длительности' : 'по дате'));
                    showMainMenu();
                }
                else if (item.action === 'set_interval') {
                    Lampa.Input.edit({ 
                        title: 'Интервал синхронизации (сек)', 
                        value: String(c.sync_interval || 30), 
                        free: true, 
                        number: true 
                    }, function(val) {
                        if (val !== null && !isNaN(val) && val > 0) {
                            c.sync_interval = parseInt(val);
                            saveCfg(c);
                            notify('Интервал: ' + c.sync_interval + ' сек');
                            if (c.enabled) {
                                stopBackgroundSync();
                                startBackgroundSync();
                            }
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'set_threshold') {
                    Lampa.Input.edit({ 
                        title: 'Порог финальных титров (сек)', 
                        value: String(c.end_credits_threshold || 180), 
                        free: true, 
                        number: true 
                    }, function(val) {
                        if (val !== null && !isNaN(val) && val > 0) {
                            c.end_credits_threshold = parseInt(val);
                            saveCfg(c);
                            notify('Порог: ' + c.end_credits_threshold + ' сек');
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'set_cleanup_days') {
                    Lampa.Input.edit({ 
                        title: 'Удалять записи старше (дней, 0 = откл)', 
                        value: String(c.cleanup_days || 30), 
                        free: true, 
                        number: true 
                    }, function(val) {
                        if (val !== null && !isNaN(val) && val >= 0) {
                            c.cleanup_days = parseInt(val);
                            saveCfg(c);
                            notify('Очистка: ' + (c.cleanup_days === 0 ? 'отключена' : c.cleanup_days + ' дней'));
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'toggle_cleanup_completed') {
                    c.cleanup_completed = !c.cleanup_completed;
                    saveCfg(c);
                    notify('Очистка завершённых ' + (c.cleanup_completed ? 'включена' : 'выключена'));
                    showMainMenu();
                }
                else if (item.action === 'set_device') {
                    Lampa.Input.edit({ 
                        title: 'Имя устройства', 
                        value: c.device_name || '', 
                        free: true 
                    }, function(val) {
                        if (val !== null && val.trim()) {
                            c.device_name = val.trim();
                            saveCfg(c);
                            notify('Имя сохранено');
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'set_profile') {
                    Lampa.Input.edit({ 
                        title: 'ID профиля (пусто = авто)', 
                        value: c.manual_profile_id || '', 
                        free: true 
                    }, function(val) {
                        if (val !== null) {
                            c.manual_profile_id = val || '';
                            saveCfg(c);
                            notify('Профиль сохранён');
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'set_token') {
                    Lampa.Input.edit({ 
                        title: 'GitHub Token', 
                        value: c.gist_token || '', 
                        free: true 
                    }, function(val) {
                        if (val !== null) {
                            c.gist_token = val || '';
                            saveCfg(c);
                            notify('Токен сохранён');
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'set_gist_id') {
                    Lampa.Input.edit({ 
                        title: 'Gist ID', 
                        value: c.gist_id || '', 
                        free: true 
                    }, function(val) {
                        if (val !== null) {
                            c.gist_id = val || '';
                            saveCfg(c);
                            notify('Gist ID сохранён');
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'sync_now') {
                    Lampa.Controller.toggle('content');
                    syncNow(true);
                }
                else if (item.action === 'full_reset') {
                    Lampa.Select.show({
                        title: 'Заменить локальные данные серверными?',
                        items: [
                            { title: 'Отмена', action: 'cancel' },
                            { title: 'Да, заменить', action: 'confirm' }
                        ],
                        onSelect: function(subItem) {
                            if (subItem.action === 'confirm') {
                                Lampa.Controller.toggle('content');
                                fullResetFromServer(true);
                            } else {
                                showMainMenu();
                            }
                        },
                        onBack: function() { showMainMenu(); }
                    });
                }
                else if (item.action === 'cancel') {
                    Lampa.Controller.toggle('content');
                }
            },
            onBack: function() {
                Lampa.Controller.toggle('content');
            }
        });
    }

    // ============ КНОПКА В НАСТРОЙКАХ ============
    function addSettingsButton() {
        if (!Lampa.SettingsApi) return;
        
        Lampa.SettingsApi.addComponent({
            component: 'timeline_sync',
            name: 'Синхронизация таймкодов',
            icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z M11 7v5l4 2.5 1-1.5-3-2V7z"/></svg>'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'open_menu', type: 'button' },
            field: { name: 'Открыть меню настроек' },
            onChange: function() {
                if (Lampa.Controller && Lampa.Controller.toggle) {
                    Lampa.Controller.toggle('settings');
                }
                setTimeout(function() { showMainMenu(); }, 100);
            }
        });
    }

    // ============ ИНИЦИАЛИЗАЦИЯ ============
    function init() {
        isV3 = Lampa.Manifest && Lampa.Manifest.app_digital >= 300;
        
        const c = cfg();
        if (!c.enabled) return;
        
        if (c.always_show_timeline) {
            enableAlwaysShowTimeline();
        }
        
        initPlayerHandler();
        addSettingsButton();
        startBackgroundSync();
        
        // Первая синхронизация через 3 секунды
        setTimeout(function() {
            const c2 = cfg();
            if (c2.enabled && c2.auto_sync) {
                syncNow(false);
                cleanupOldRecords();
            }
            forceRefreshCards();
        }, 3000);
        
        console.log('[Sync] Плагин загружен v7.0');
    }

    // Запуск
    if (window.Lampa && Lampa.Listener) {
        if (window.appready) init();
        else Lampa.Listener.follow('app', function(e) { if (e.type === 'ready') init(); });
    } else {
        setTimeout(function waitLampa() {
            if (window.Lampa && Lampa.Listener) {
                if (window.appready) init();
                else Lampa.Listener.follow('app', function(e) { if (e.type === 'ready') init(); });
            } else setTimeout(waitLampa, 100);
        }, 100);
    }
})();
