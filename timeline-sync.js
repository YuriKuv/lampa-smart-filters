(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    const SYNC_META_KEY = 'timeline_sync_meta';
    let lastSyncTime = 0;
    let syncInProgress = false;
    let pendingSync = false;
    let currentMovieId = null;
    let currentMovieTime = 0;
    let autoSyncInterval = null;
    let playerCheckInterval = null;
    let lastPosition = 0;
    let endCreditsDetected = false;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            auto_sync: true,
            auto_save: true,
            sync_on_stop: true,
            sync_strategy: 'max_time',
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
            sync_interval: 30,
            smart_sync: true,
            cleanup_days: 30,
            cleanup_completed: true,
            end_credits_threshold: 180
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function getSyncMeta() {
        return Lampa.Storage.get(SYNC_META_KEY, {
            last_sync: 0,
            total_watch_time: 0,
            sync_count: 0,
            last_cleanup: 0
        }) || {};
    }

    function saveSyncMeta(meta) {
        Lampa.Storage.set(SYNC_META_KEY, meta, true);
    }

    function notify(text, timeout = 3000) {
        Lampa.Noty.show(text, timeout);
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

    function formatDuration(seconds) {
        if (!seconds || seconds < 0) return '0 мин';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours} ч ${minutes} мин`;
        }
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

    function getSeriesInfoFromUrl() {
        try {
            const playerData = Lampa.Player.playdata();
            if (playerData && playerData.path) {
                const url = playerData.path;
                const patterns = [
                    /S(\d+)E(\d+)/i,
                    /S(\d+)[\s.]*E(\d+)/i,
                    /(\d+)x(\d+)/i,
                    /Season[.\s]*(\d+)[.\s]*Episode[.\s]*(\d+)/i
                ];
                
                for (const pattern of patterns) {
                    const match = url.match(pattern);
                    if (match && match[1] && match[2]) {
                        return { season: parseInt(match[1]), episode: parseInt(match[2]) };
                    }
                }
            }
        } catch(e) {}
        return null;
    }

    function getCurrentMovieKey() {
        const tmdbId = getCurrentMovieTmdbId();
        if (!tmdbId) return null;
        
        const seriesInfo = getSeriesInfoFromUrl();
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
                const tmdbId = extractTmdbIdFromItem(movie);
                if (tmdbId) return tmdbId;
            }
            return currentMovieId;
        } catch(e) {
            return currentMovieId;
        }
    }

    // ============ УМНАЯ ОЧИСТКА ============
    function cleanupOldRecords(showNotify = false) {
        const c = cfg();
        const meta = getSyncMeta();
        const now = Date.now();
        
        // Проверяем раз в день или если принудительно
        if (!showNotify && now - meta.last_cleanup < 86400000) return;
        
        const fileView = getFileView();
        let cleaned = 0;
        let completed_cleaned = 0;
        
        const cutoffDate = now - (c.cleanup_days * 86400000);
        
        for (const key in fileView) {
            const record = fileView[key];
            let shouldDelete = false;
            
            // Очистка по возрасту
            if (c.cleanup_days > 0 && record.updated && record.updated < cutoffDate) {
                shouldDelete = true;
                cleaned++;
            }
            
            // Очистка завершённых
            if (c.cleanup_completed && record.percent >= 95) {
                shouldDelete = true;
                completed_cleaned++;
            }
            
            if (shouldDelete) {
                delete fileView[key];
            }
        }
        
        if (cleaned > 0 || completed_cleaned > 0) {
            setFileView(fileView);
            console.log(`[Sync] 🧹 Очистка: удалено ${cleaned} старых и ${completed_cleaned} завершённых записей`);
            if (showNotify) {
                notify(`🧹 Удалено: ${cleaned} старых, ${completed_cleaned} завершённых`);
            }
        } else if (showNotify) {
            notify('🧹 Нет записей для очистки');
        }
        
        meta.last_cleanup = now;
        saveSyncMeta(meta);
    }

    // ============ АВТО-ОПРЕДЕЛЕНИЕ ФИНАЛА ============
    function checkEndCredits(currentTime, duration) {
        const c = cfg();
        if (!duration || duration <= 0) return false;
        
        const remaining = duration - currentTime;
        const threshold = c.end_credits_threshold || 180;
        
        if (remaining <= threshold && remaining > 0 && !endCreditsDetected) {
            endCreditsDetected = true;
            
            if (currentTime > lastPosition + 30) {
                return false;
            }
            
            console.log(`[Sync] 🎬 Обнаружены финальные титры (осталось ${Math.floor(remaining)}с)`);
            
            Lampa.Noty.show('🎬 Финал близко! Отметить как просмотренное?', 5000, () => {
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
            completed: true
        };
        
        setFileView(fileView);
        notify('✅ Отмечено как просмотренное');
        
        if (Lampa.Timeline && Lampa.Timeline.update) {
            Lampa.Timeline.update({
                hash: movieKey,
                percent: 100,
                time: duration,
                duration: duration
            });
        }
        
        if (cfg().sync_on_stop) {
            setTimeout(() => syncToGist(false), 500);
        }
    }

    // ============ УМНАЯ СИНХРОНИЗАЦИЯ ============
    function getChangedRecords() {
        const meta = getSyncMeta();
        const fileView = getFileView();
        const changed = {};
        
        for (const key in fileView) {
            const record = fileView[key];
            if (record.updated && record.updated > meta.last_sync) {
                changed[key] = record;
            }
        }
        
        return changed;
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
            const duration = Lampa.Player.playdata()?.timeline?.duration || 0;
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            
            const seriesInfo = getSeriesInfoFromUrl();
            
            fileView[movieKey] = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: Date.now(),
                tmdb_id: getCurrentMovieTmdbId(),
                ...(seriesInfo && { season: seriesInfo.season, episode: seriesInfo.episode })
            };
            
            setFileView(fileView);
            console.log(`[Sync] 💾 Сохранён прогресс: ${formatTime(currentTime)} (${percent}%) для ${movieKey}`);
            
            if (duration > 0) {
                checkEndCredits(currentTime, duration);
            }
            
            if (Lampa.Timeline && Lampa.Timeline.update) {
                Lampa.Timeline.update({
                    hash: movieKey,
                    percent: percent,
                    time: currentTime,
                    duration: duration
                });
            }
            
            updateWatchTime(currentTime - savedTime);
            
            return true;
        }
        return false;
    }

    function updateWatchTime(addedSeconds) {
        if (addedSeconds <= 0) return;
        
        const meta = getSyncMeta();
        meta.total_watch_time = (meta.total_watch_time || 0) + addedSeconds;
        saveSyncMeta(meta);
    }

    // ============ СИНХРОНИЗАЦИЯ ============
    function syncToGist(showNotify, callback) {
        if (showNotify === undefined) showNotify = true;
        
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
        
        let data;
        let changedCount = 0;
        
        if (c.smart_sync) {
            const changed = getChangedRecords();
            changedCount = Object.keys(changed).length;
            
            if (changedCount === 0) {
                console.log('[Sync] 📤 Нет изменений для отправки');
                if (showNotify) notify('✅ Нет новых изменений');
                if (callback) callback(true);
                return;
            }
            
            data = {
                version: 6,
                profile_id: getCurrentProfileId(),
                device: c.device_name,
                source: Lampa.Storage.field('source') || 'tmdb',
                updated: Date.now(),
                smart_sync: true,
                changed_records: changed
            };
        } else {
            const fullData = getProgressData();
            changedCount = Object.keys(fullData.file_view).length;
            data = fullData;
        }
        
        syncInProgress = true;
        console.log(`[Sync] 📤 Отправка ${changedCount} записей...`);
        
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
                if (showNotify) notify(`✅ Отправлено ${changedCount} записей`);
                
                const meta = getSyncMeta();
                meta.last_sync = Date.now();
                meta.sync_count++;
                saveSyncMeta(meta);
                
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

    function syncFromGist(showNotify, callback, forceOverwrite) {
        if (showNotify === undefined) showNotify = true;
        if (forceOverwrite === undefined) forceOverwrite = false;
        
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
        console.log(`[Sync] 📥 Загрузка с Gist... ${forceOverwrite ? '(ПРИНУДИТЕЛЬНО)' : ''}`);
        
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
                        
                        let remoteFileView;
                        if (remote.smart_sync && remote.changed_records) {
                            remoteFileView = remote.changed_records;
                        } else {
                            remoteFileView = remote.file_view || {};
                        }
                        
                        const count = Object.keys(remoteFileView).length;
                        
                        const localFileView = getFileView();
                        const strategy = c.sync_strategy;
                        
                        let merged = { ...localFileView };
                        let changed = false;
                        let updatedCount = 0;
                        let newCount = 0;
                        let skippedCount = 0;
                        
                        for (const key in remoteFileView) {
                            const localRecord = localFileView[key];
                            const remoteRecord = remoteFileView[key];
                            
                            if (!localRecord) {
                                merged[key] = remoteRecord;
                                changed = true;
                                newCount++;
                                console.log(`[Sync] ➕ Новый: ${key} (${formatTime(remoteRecord.time)})`);
                                continue;
                            }
                            
                            let shouldUseRemote = false;
                            let reason = '';
                            
                            if (forceOverwrite) {
                                if (remoteRecord.time > localRecord.time) {
                                    shouldUseRemote = true;
                                    reason = `принудительно (время ${formatTime(localRecord.time)} → ${formatTime(remoteRecord.time)})`;
                                } else {
                                    skippedCount++;
                                }
                            } else if (strategy === 'max_time') {
                                if (remoteRecord.time > localRecord.time + 5) {
                                    shouldUseRemote = true;
                                    reason = `время ${formatTime(localRecord.time)} → ${formatTime(remoteRecord.time)}`;
                                }
                            } else if (strategy === 'last_watch') {
                                const remoteUpdated = remoteRecord.updated || 0;
                                const localUpdated = localRecord.updated || 0;
                                
                                if (remoteRecord.time > localRecord.time + 30) {
                                    shouldUseRemote = true;
                                    reason = `значительно большее время (${formatTime(localRecord.time)} → ${formatTime(remoteRecord.time)})`;
                                } else if (remoteUpdated > localUpdated + 5000) {
                                    shouldUseRemote = true;
                                    reason = `дата ${new Date(localUpdated).toLocaleString()} → ${new Date(remoteUpdated).toLocaleString()}`;
                                } else if (Math.abs(remoteUpdated - localUpdated) <= 5000) {
                                    if (remoteRecord.time > localRecord.time) {
                                        shouldUseRemote = true;
                                        reason = `время (даты близки) ${formatTime(localRecord.time)} → ${formatTime(remoteRecord.time)}`;
                                    }
                                }
                            }
                            
                            if (shouldUseRemote) {
                                merged[key] = remoteRecord;
                                changed = true;
                                updatedCount++;
                                console.log(`[Sync] 🔄 Обновлён ${key} (${reason})`);
                            }
                        }
                        
                        if (changed) {
                            setFileView(merged);
                            console.log(`[Sync] Итог: +${newCount} новых, ${updatedCount} обновлено, ${skippedCount} пропущено`);
                            
                            if (Lampa.Timeline && Lampa.Timeline.read) {
                                Lampa.Timeline.read(true);
                            }
                            
                            if (showNotify) {
                                if (forceOverwrite) {
                                    notify(`📥 Принудительно: +${newCount} новых, ${updatedCount} обновлено`);
                                } else {
                                    notify(`📥 Загружено: +${newCount} новых, ${updatedCount} обновлено`);
                                }
                            }
                        } else if (showNotify) {
                            if (skippedCount > 0) {
                                notify(`ℹ️ Пропущено ${skippedCount} записей (локальные новее)`);
                            } else {
                                notify('✅ Данные актуальны');
                            }
                        }
                        
                        if (callback) callback(true);
                    } else {
                        if (showNotify) notify('❌ Нет данных');
                        if (callback) callback(false);
                    }
                } catch(e) { 
                    console.error('[Sync] Ошибка парсинга:', e);
                    if (showNotify) notify('❌ Ошибка данных');
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

    function getProgressData() {
        return {
            version: 6,
            profile_id: getCurrentProfileId(),
            device: cfg().device_name,
            source: Lampa.Storage.field('source') || 'tmdb',
            updated: Date.now(),
            file_view: getFileView()
        };
    }

    // ============ ПРИНУДИТЕЛЬНАЯ СИНХРОНИЗАЦИЯ ============
    function forceSyncFromServer(showNotify) {
        if (showNotify === undefined) showNotify = true;
        
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            notify('⚠️ Gist не настроен');
            return;
        }
        
        if (showNotify) notify('🔄 Принудительная загрузка с сервера...');
        
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
                        let remoteFileView;
                        
                        if (remote.smart_sync && remote.changed_records) {
                            remoteFileView = remote.changed_records;
                        } else {
                            remoteFileView = remote.file_view || {};
                        }
                        
                        const localFileView = getFileView();
                        let merged = { ...localFileView };
                        let replacedCount = 0;
                        let addedCount = 0;
                        
                        for (const key in remoteFileView) {
                            const localRecord = localFileView[key];
                            const remoteRecord = remoteFileView[key];
                            
                            if (!localRecord) {
                                merged[key] = remoteRecord;
                                addedCount++;
                            } else if (remoteRecord.time > localRecord.time) {
                                merged[key] = remoteRecord;
                                replacedCount++;
                            }
                        }
                        
                        setFileView(merged);
                        
                        if (Lampa.Timeline && Lampa.Timeline.read) {
                            Lampa.Timeline.read(true);
                        }
                        
                        if (showNotify) {
                            notify(`✅ С сервера: +${addedCount} новых, ${replacedCount} обновлено`);
                        }
                        console.log(`[Sync] Принудительная загрузка: +${addedCount} новых, ${replacedCount} обновлено`);
                        
                        const meta = getSyncMeta();
                        meta.last_sync = Date.now();
                        saveSyncMeta(meta);
                        
                    } else {
                        if (showNotify) notify('❌ Нет данных на сервере');
                    }
                } catch(e) {
                    console.error('[Sync] Ошибка:', e);
                    if (showNotify) notify('❌ Ошибка данных');
                }
            },
            error: (xhr) => {
                console.error('[Sync] ❌ Ошибка загрузки:', xhr.status);
                if (showNotify) notify(`❌ Ошибка: ${xhr.status}`);
            }
        });
    }

    function forceSyncToServer(showNotify) {
        if (showNotify === undefined) showNotify = true;
        
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            notify('⚠️ Gist не настроен');
            return;
        }
        
        const fileView = getFileView();
        const count = Object.keys(fileView).length;
        
        if (count === 0) {
            notify('ℹ️ Нет локальных данных');
            return;
        }
        
        if (showNotify) notify(`🔄 Отправка ${count} записей на сервер...`);
        
        const data = {
            version: 6,
            profile_id: getCurrentProfileId(),
            device: c.device_name,
            source: Lampa.Storage.field('source') || 'tmdb',
            updated: Date.now(),
            file_view: fileView
        };
        
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
                if (showNotify) notify(`✅ Отправлено ${count} записей`);
                
                const meta = getSyncMeta();
                meta.last_sync = Date.now();
                meta.sync_count++;
                saveSyncMeta(meta);
                
                console.log(`[Sync] Принудительная отправка: ${count} записей`);
            },
            error: (xhr) => {
                console.error('[Sync] ❌ Ошибка отправки:', xhr.status);
                if (showNotify) notify(`❌ Ошибка: ${xhr.status}`);
            }
        });
    }

    // ============ КОНТЕКСТНОЕ МЕНЮ ============
    function syncMovieProgress(movie) {
        const tmdbId = extractTmdbIdFromItem(movie);
        if (!tmdbId) {
            notify('❌ Не удалось определить ID');
            return;
        }
        
        notify('🔄 Синхронизация...');
        
        syncFromGist(false, () => {
            notify('✅ Прогресс синхронизирован');
            
            if (Lampa.Timeline && Lampa.Timeline.read) {
                Lampa.Timeline.read(true);
            }
        }, true);
    }

    function resetMovieProgress(movie) {
        const tmdbId = extractTmdbIdFromItem(movie);
        if (!tmdbId) {
            notify('❌ Не удалось определить ID');
            return;
        }
        
        Lampa.Select.show({
            title: 'Сбросить прогресс?',
            items: [
                { title: '❌ Отмена', action: 'cancel' },
                { title: '✅ Да, сбросить везде', action: 'confirm' }
            ],
            onSelect: (item) => {
                if (item.action === 'confirm') {
                    const fileView = getFileView();
                    
                    for (const key in fileView) {
                        if (key.startsWith(tmdbId)) {
                            delete fileView[key];
                        }
                    }
                    
                    setFileView(fileView);
                    notify('✅ Прогресс сброшен');
                    
                    syncToGist(false);
                    
                    if (Lampa.Timeline && Lampa.Timeline.read) {
                        Lampa.Timeline.read(true);
                    }
                }
            }
        });
    }

    function markMovieAsWatched(movie) {
        const tmdbId = extractTmdbIdFromItem(movie);
        if (!tmdbId) {
            notify('❌ Не удалось определить ID');
            return;
        }
        
        const fileView = getFileView();
        const duration = movie.duration ? movie.duration * 60 : 0;
        
        fileView[tmdbId] = {
            time: duration,
            percent: 100,
            duration: duration,
            updated: Date.now(),
            tmdb_id: tmdbId,
            completed: true
        };
        
        setFileView(fileView);
        notify('✅ Отмечено как просмотренное');
        
        syncToGist(false);
        
        if (Lampa.Timeline && Lampa.Timeline.read) {
            Lampa.Timeline.read(true);
        }
    }

    function addContextMenu() {
        const checkAndPatch = () => {
            if (Lampa.Component && Lampa.Component.get) {
                const movieMore = Lampa.Component.get('movie_more');
                if (movieMore && movieMore.prototype && movieMore.prototype.build) {
                    const originalBuild = movieMore.prototype.build;
                    
                    movieMore.prototype.build = function() {
                        const items = originalBuild.call(this);
                        
                        const hasSyncItems = items.some(item => item.action === 'sync_progress');
                        if (!hasSyncItems && this.movie) {
                            items.push({ title: '──────────', separator: true });
                            
                            items.push({
                                title: '🔄 Синхронизировать прогресс',
                                action: 'sync_progress',
                                onSelect: () => {
                                    syncMovieProgress(this.movie);
                                }
                            });
                            
                            items.push({
                                title: '🗑️ Сбросить прогресс везде',
                                action: 'reset_progress',
                                onSelect: () => {
                                    resetMovieProgress(this.movie);
                                }
                            });
                            
                            items.push({
                                title: '✅ Отметить как просмотренное',
                                action: 'mark_watched',
                                onSelect: () => {
                                    markMovieAsWatched(this.movie);
                                }
                            });
                        }
                        
                        return items;
                    };
                    
                    console.log('[Sync] Контекстное меню добавлено через Component');
                    return true;
                }
            }
            
            if (Lampa.Arrays && Lampa.Arrays.movie_more) {
                const originalArray = Lampa.Arrays.movie_more;
                Lampa.Arrays.movie_more = function(movie) {
                    const items = originalArray(movie);
                    
                    const hasSyncItems = items.some(item => item.action === 'sync_progress');
                    if (!hasSyncItems && movie) {
                        items.push({ title: '──────────', separator: true });
                        items.push({
                            title: '🔄 Синхронизировать прогресс',
                            action: 'sync_progress',
                            onSelect: () => syncMovieProgress(movie)
                        });
                        items.push({
                            title: '🗑️ Сбросить прогресс везде',
                            action: 'reset_progress',
                            onSelect: () => resetMovieProgress(movie)
                        });
                        items.push({
                            title: '✅ Отметить как просмотренное',
                            action: 'mark_watched',
                            onSelect: () => markMovieAsWatched(movie)
                        });
                    }
                    
                    return items;
                };
                
                console.log('[Sync] Контекстное меню добавлено через Arrays');
                return true;
            }
            
            return false;
        };
        
        if (!checkAndPatch()) {
            setTimeout(() => {
                if (!checkAndPatch()) {
                    setTimeout(checkAndPatch, 3000);
                }
            }, 1000);
        }
        
        const originalShow = Lampa.Select.show;
        if (originalShow) {
            Lampa.Select.show = function(config) {
                if (config.title === 'Меню фильма' || config.title === 'Меню сериала') {
                    const hasSyncItems = config.items && config.items.some(item => 
                        item.action === 'sync_progress' || item.action === 'reset_progress' || item.action === 'mark_watched'
                    );
                    
                    if (!hasSyncItems && config.movie) {
                        config.items = config.items || [];
                        config.items.push({ title: '──────────', separator: true });
                        config.items.push({
                            title: '🔄 Синхронизировать прогресс',
                            action: 'sync_progress',
                            onSelect: () => syncMovieProgress(config.movie)
                        });
                        config.items.push({
                            title: '🗑️ Сбросить прогресс везде',
                            action: 'reset_progress',
                            onSelect: () => resetMovieProgress(config.movie)
                        });
                        config.items.push({
                            title: '✅ Отметить как просмотренное',
                            action: 'mark_watched',
                            onSelect: () => markMovieAsWatched(config.movie)
                        });
                    }
                }
                
                return originalShow.call(this, config);
            };
            
            console.log('[Sync] Добавлен перехватчик Lampa.Select.show');
        }
    }

    // ============ СТАТИСТИКА ============
    function showStatistics() {
        const fileView = getFileView();
        const meta = getSyncMeta();
        const c = cfg();
        
        const totalRecords = Object.keys(fileView).length;
        let totalMovies = 0;
        let totalEpisodes = 0;
        let completedCount = 0;
        let totalWatchTime = meta.total_watch_time || 0;
        let inProgressCount = 0;
        
        for (const key in fileView) {
            const record = fileView[key];
            if (key.includes('_s')) {
                totalEpisodes++;
            } else {
                totalMovies++;
            }
            if (record.percent >= 95) {
                completedCount++;
            } else if (record.percent > 0) {
                inProgressCount++;
            }
        }
        
        const items = [
            { title: '📊 Статистика просмотров', disabled: true },
            { title: '──────────', separator: true },
            { title: `📈 Всего записей: ${totalRecords}`, disabled: true },
            { title: `🎬 Фильмов: ${totalMovies}`, disabled: true },
            { title: `📺 Серий: ${totalEpisodes}`, disabled: true },
            { title: `✅ Просмотрено: ${completedCount}`, disabled: true },
            { title: `🔄 В процессе: ${inProgressCount}`, disabled: true },
            { title: `⏱️ Общее время: ${formatDuration(totalWatchTime)}`, disabled: true },
            { title: '──────────', separator: true },
            { title: `🔄 Синхронизаций: ${meta.sync_count || 0}`, disabled: true },
            { title: `📅 Последняя синх.: ${meta.last_sync ? new Date(meta.last_sync).toLocaleString() : 'никогда'}`, disabled: true },
            { title: `📱 Устройство: ${c.device_name}`, disabled: true },
            { title: `👤 Профиль: ${getCurrentProfileId() || 'глобальный'}`, disabled: true },
            { title: '──────────', separator: true },
            { title: '🔄 Обновить', action: 'refresh' },
            { title: '📤 Экспорт', action: 'export' },
            { title: '🧹 Очистить статистику', action: 'clear_stats' },
            { title: '⬅️ Назад', action: 'back' }
        ];
        
        Lampa.Select.show({
            title: 'Статистика синхронизации',
            items: items,
            onSelect: (item) => {
                if (item.action === 'refresh') {
                    showStatistics();
                } else if (item.action === 'export') {
                    exportStatistics();
                    setTimeout(() => showStatistics(), 500);
                } else if (item.action === 'clear_stats') {
                    clearStatistics();
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: () => {
                showMainMenu();
            }
        });
    }

    function clearStatistics() {
        Lampa.Select.show({
            title: 'Очистить статистику?',
            items: [
                { title: '❌ Отмена', action: 'cancel' },
                { title: '🗑️ Очистить счётчики', action: 'clear_counters' },
                { title: '⚠️ Очистить ВСЁ', action: 'clear_all' }
            ],
            onSelect: (item) => {
                if (item.action === 'clear_counters') {
                    const meta = getSyncMeta();
                    meta.sync_count = 0;
                    meta.total_watch_time = 0;
                    saveSyncMeta(meta);
                    notify('📊 Счётчики очищены');
                    setTimeout(() => showStatistics(), 500);
                } else if (item.action === 'clear_all') {
                    Lampa.Select.show({
                        title: 'Точно очистить ВСЁ?',
                        items: [
                            { title: '❌ Нет', action: 'cancel' },
                            { title: '✅ Да', action: 'confirm' }
                        ],
                        onSelect: (subItem) => {
                            if (subItem.action === 'confirm') {
                                setFileView({});
                                const meta = getSyncMeta();
                                meta.sync_count = 0;
                                meta.total_watch_time = 0;
                                meta.last_sync = 0;
                                saveSyncMeta(meta);
                                notify('🗑️ Все данные очищены');
                                
                                if (Lampa.Timeline && Lampa.Timeline.read) {
                                    Lampa.Timeline.read(true);
                                }
                                
                                setTimeout(() => showStatistics(), 500);
                            } else {
                                showStatistics();
                            }
                        },
                        onBack: () => showStatistics()
                    });
                } else {
                    showStatistics();
                }
            },
            onBack: () => showStatistics()
        });
    }

    function exportStatistics() {
        const fileView = getFileView();
        const meta = getSyncMeta();
        const c = cfg();
        
        const stats = {
            generated: new Date().toISOString(),
            profile: getCurrentProfileId(),
            device: c.device_name,
            total_records: Object.keys(fileView).length,
            total_watch_time_seconds: meta.total_watch_time || 0,
            total_watch_time_formatted: formatDuration(meta.total_watch_time || 0),
            sync_count: meta.sync_count || 0,
            last_sync: meta.last_sync ? new Date(meta.last_sync).toISOString() : null,
            records: fileView
        };
        
        const json = JSON.stringify(stats, null, 2);
        
        if (Lampa.Platform.is('android')) {
            Lampa.Utils.copyText(json);
            notify('📋 Статистика скопирована');
        } else {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lampa_stats_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            notify('📥 Статистика скачана');
        }
    }

    // ============ ПЛЕЕР ============
    function saveCurrentProgressForce() {
        if (currentMovieTime > 0) {
            saveCurrentProgress(currentMovieTime, true);
            if (cfg().sync_on_stop) {
                syncToGist(false);
            }
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
        
        playerCheckInterval = setInterval(() => {
            const c = cfg();
            if (!c.enabled) return;
            
            const isPlayerOpen = Lampa.Player.opened();
            const currentTime = getCurrentPlayerTime();
            
            if (wasPlayerOpen && !isPlayerOpen && currentMovieTime > 0) {
                console.log(`[Sync] 🛑 Плеер закрыт, сохранение на ${formatTime(currentMovieTime)}`);
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
                        console.log(`[Sync] 🎬 Новый ключ: ${movieKey}`);
                        lastMovieKey = movieKey;
                        lastSavedProgress = 0;
                        endCreditsDetected = false;
                    }
                    
                    if (c.auto_save && Math.floor(currentTime) - lastSavedProgress >= 10) {
                        if (saveCurrentProgress(currentTime)) {
                            lastSavedProgress = Math.floor(currentTime);
                            
                            const now = Date.now();
                            if (c.auto_sync && (now - lastSyncToGist) >= (c.sync_interval * 1000)) {
                                console.log(`[Sync] 📤 Автоотправка`);
                                syncToGist(false);
                                lastSyncToGist = now;
                            }
                        }
                    }
                }
            }
        }, 1000);
        
        console.log('[Sync] Обработчик плеера запущен');
    }

    function stopPlayerHandler() {
        if (playerCheckInterval) {
            clearInterval(playerCheckInterval);
            playerCheckInterval = null;
        }
    }

    function startBackgroundSync() {
        if (autoSyncInterval) clearInterval(autoSyncInterval);
        
        autoSyncInterval = setInterval(() => {
            const c = cfg();
            if (!syncInProgress && c.auto_sync && c.enabled && !Lampa.Player.opened()) {
                console.log(`[Sync] 🔄 Фоновая синхронизация`);
                syncFromGist(false);
                syncToGist(false);
                cleanupOldRecords(false);
            }
        }, 60000);
    }

    // ============ ГЛАВНОЕ МЕНЮ ============
    function showMainMenu() {
        const c = cfg();
        const strategyIcon = c.sync_strategy === 'max_time' ? '⏱️' : '📅';
        const strategyName = c.sync_strategy === 'max_time' ? 'по длительности' : 'по дате';
        
        Lampa.Select.show({
            title: 'Синхронизация таймкодов',
            items: [
                { title: `${c.enabled ? '✅' : '❌'} Плагин: ${c.enabled ? 'Вкл' : 'Выкл'}`, action: 'toggle_enabled' },
                { title: `${c.auto_sync ? '✅' : '❌'} Автосинхронизация: ${c.auto_sync ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_sync' },
                { title: `${c.auto_save ? '✅' : '❌'} Автосохранение: ${c.auto_save ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_save' },
                { title: `${c.smart_sync ? '✅' : '❌'} Умная синхр.: ${c.smart_sync ? 'Вкл' : 'Выкл'}`, action: 'toggle_smart_sync' },
                { title: '──────────', separator: true },
                { title: `${strategyIcon} Стратегия: ${strategyName}`, action: 'toggle_strategy' },
                { title: `⏱️ Интервал синхр.: ${c.sync_interval || 30} сек`, action: 'set_interval' },
                { title: `🎬 Порог титров: ${c.end_credits_threshold || 180} сек`, action: 'set_threshold' },
                { title: '──────────', separator: true },
                { title: `🧹 Очистка старше: ${c.cleanup_days} дней`, action: 'set_cleanup_days' },
                { title: `${c.cleanup_completed ? '✅' : '❌'} Очищать завершённые`, action: 'toggle_cleanup_completed' },
                { title: '──────────', separator: true },
                { title: `📱 Устройство: ${c.device_name}`, action: 'set_device' },
                { title: `👤 Профиль: ${c.manual_profile_id || 'авто'}`, action: 'set_profile' },
                { title: '──────────', separator: true },
                { title: `🔑 Gist токен: ${c.gist_token ? '✓ установлен' : '❌ не установлен'}`, action: 'set_token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0,8)+'…' : '❌ не установлен'}`, action: 'set_gist_id' },
                { title: '──────────', separator: true },
                { title: '📊 Статистика', action: 'statistics' },
                { title: '🔄 Отправить изменения', action: 'upload' },
                { title: '📥 Загрузить изменения', action: 'download' },
                { title: '⬇️ ЗАГРУЗИТЬ ВСЁ С СЕРВЕРА', action: 'force_download' },
                { title: '⬆️ ОТПРАВИТЬ ВСЁ НА СЕРВЕР', action: 'force_upload' },
                { title: '🔄 Полная синхронизация', action: 'force_sync' },
                { title: '🧹 Очистить сейчас', action: 'cleanup_now' },
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
                        stopPlayerHandler();
                    } else {
                        startBackgroundSync();
                        initPlayerHandler();
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
                else if (item.action === 'toggle_smart_sync') {
                    c.smart_sync = !c.smart_sync;
                    saveCfg(c);
                    notify(`Умная синхронизация ${c.smart_sync ? 'включена' : 'выключена'}`);
                    showMainMenu();
                }
                else if (item.action === 'toggle_strategy') {
                    c.sync_strategy = c.sync_strategy === 'max_time' ? 'last_watch' : 'max_time';
                    saveCfg(c);
                    const strategyName = c.sync_strategy === 'max_time' ? 'по длительности' : 'по дате';
                    notify(`Стратегия: ${strategyName}`);
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
                else if (item.action === 'set_threshold') {
                    Lampa.Input.edit({ title: 'Порог финальных титров (сек)', value: String(c.end_credits_threshold || 180), free: true, number: true }, (val) => {
                        if (val !== null && !isNaN(val) && val > 0) {
                            c.end_credits_threshold = parseInt(val);
                            saveCfg(c);
                            notify(`Порог: ${c.end_credits_threshold} сек`);
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'set_cleanup_days') {
                    Lampa.Input.edit({ title: 'Удалять записи старше (дней, 0 = откл)', value: String(c.cleanup_days || 30), free: true, number: true }, (val) => {
                        if (val !== null && !isNaN(val) && val >= 0) {
                            c.cleanup_days = parseInt(val);
                            saveCfg(c);
                            notify(`Очистка: ${c.cleanup_days} дней`);
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'toggle_cleanup_completed') {
                    c.cleanup_completed = !c.cleanup_completed;
                    saveCfg(c);
                    notify(`Очистка завершённых ${c.cleanup_completed ? 'включена' : 'выключена'}`);
                    showMainMenu();
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
                else if (item.action === 'statistics') {
                    setTimeout(() => showStatistics(), 100);
                }
                else if (item.action === 'upload') {
                    syncToGist(true);
                    setTimeout(() => showMainMenu(), 1000);
                }
                else if (item.action === 'download') {
                    syncFromGist(true);
                    setTimeout(() => showMainMenu(), 1000);
                }
                else if (item.action === 'force_download') {
                    Lampa.Select.show({
                        title: 'Загрузить все данные с сервера?',
                        items: [
                            { title: '❌ Отмена', action: 'cancel' },
                            { title: '✅ Да, загрузить всё', action: 'confirm' }
                        ],
                        onSelect: (subItem) => {
                            if (subItem.action === 'confirm') {
                                forceSyncFromServer(true);
                            }
                            setTimeout(() => showMainMenu(), 1000);
                        },
                        onBack: () => showMainMenu()
                    });
                }
                else if (item.action === 'force_upload') {
                    Lampa.Select.show({
                        title: 'Отправить все данные на сервер?',
                        items: [
                            { title: '❌ Отмена', action: 'cancel' },
                            { title: '✅ Да, отправить всё', action: 'confirm' }
                        ],
                        onSelect: (subItem) => {
                            if (subItem.action === 'confirm') {
                                forceSyncToServer(true);
                            }
                            setTimeout(() => showMainMenu(), 1000);
                        },
                        onBack: () => showMainMenu()
                    });
                }
                else if (item.action === 'force_sync') {
                    notify('🔄 Полная синхронизация...');
                    forceSyncToServer(false);
                    setTimeout(() => forceSyncFromServer(true), 1500);
                    setTimeout(() => showMainMenu(), 2500);
                }
                else if (item.action === 'cleanup_now') {
                    cleanupOldRecords(true);
                    setTimeout(() => showMainMenu(), 1000);
                }
            },
            onBack: () => {
                Lampa.Controller.toggle('content');
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
            field: { name: '⚙️ Открыть меню настроек' },
            onChange: () => {
                if (Lampa.Controller && Lampa.Controller.toggle) {
                    Lampa.Controller.toggle('settings');
                }
                setTimeout(() => showMainMenu(), 100);
            }
        });
        
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'open_stats', type: 'button' },
            field: { name: '📊 Статистика' },
            onChange: () => {
                if (Lampa.Controller && Lampa.Controller.toggle) {
                    Lampa.Controller.toggle('settings');
                }
                setTimeout(() => showStatistics(), 100);
            }
        });
    }

    function init() {
        const c = cfg();
        
        console.log(`[Sync] Инициализация v6.0`);
        console.log(`[Sync] Профиль: ${getCurrentProfileId() || 'глобальный'}`);
        console.log(`[Sync] Плагин: ${c.enabled ? 'Вкл' : 'Выкл'}`);
        console.log(`[Sync] Умная синхр.: ${c.smart_sync ? 'Вкл' : 'Выкл'}`);
        console.log(`[Sync] Стратегия: ${c.sync_strategy === 'max_time' ? 'по длительности' : 'по дате'}`);
        
        if (!c.enabled) {
            console.log('[Sync] Плагин выключен в настройках');
            return;
        }
        
        initPlayerHandler();
        addSettingsButton();
        addContextMenu();
        startBackgroundSync();
        
        setTimeout(() => {
            const c2 = cfg();
            if (c2.enabled && c2.auto_sync) {
                syncFromGist(false);
                cleanupOldRecords(false);
            }
        }, 3000);
        
        notify('✅ Синхронизация v6.0 загружена');
    }

    // Запуск
    if (window.Lampa && Lampa.Listener) {
        if (window.appready) {
            init();
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') init();
            });
        }
    } else {
        setTimeout(function waitLampa() {
            if (window.Lampa && Lampa.Listener) {
                if (window.appready) init();
                else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') init(); });
            } else {
                setTimeout(waitLampa, 100);
            }
        }, 100);
    }
})();