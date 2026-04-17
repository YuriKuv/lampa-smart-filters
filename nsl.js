(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    const SYNC_VERSION = 11;
    
    // ============ СОСТОЯНИЕ ============
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
    let uiUpdateTimer = null;
    let syncingFromPlugin = false;
    let cubImportDone = false;
    
    let protectedData = {};
    let bookmarks = [];
    let bookmarksMap = {};
    let history = [];
    let historyMap = {};

    // ============ КОНФИГУРАЦИЯ ============
    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            auto_sync: true,
            auto_save: true,
            sync_on_stop: true,
            sync_strategy: 'last_watch',
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform ? Lampa.Platform.get() : 'Unknown',
            manual_profile_id: '',
            sync_interval: 30,
            cleanup_days: 30,
            cleanup_completed: true,
            end_credits_threshold: 180,
            always_show_timeline: true,
            timeline_position: 'bottom',
            sync_favorites: true,
            sync_history: true,
            unlock_premium: true,
            disable_cub: true,
            block_cub_delay: 3000,
            cub_import_done: false
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
        protectedData = { ...data };
        Lampa.Storage.set(getFileViewKey(), data, true);
        return data;
    }

    function getPluginStorageKey(type) {
        const profileId = getCurrentProfileId();
        return `tl_sync_${type}_${profileId}`;
    }

    function getPluginBookmarks() {
        return Lampa.Storage.get(getPluginStorageKey('bookmarks'), []);
    }

    function setPluginBookmarks(data) {
        Lampa.Storage.set(getPluginStorageKey('bookmarks'), data, true);
        bookmarks = data;
        createBookmarksMap();
        return data;
    }

    function getPluginHistory() {
        return Lampa.Storage.get(getPluginStorageKey('history'), []);
    }

    function setPluginHistory(data) {
        Lampa.Storage.set(getPluginStorageKey('history'), data, true);
        history = data;
        createHistoryMap();
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

    function clearCard(card) {
        return {
            id: card.id,
            tmdb_id: card.tmdb_id || card.id,
            title: card.title || card.name,
            original_name: card.original_name,
            original_title: card.original_title,
            poster_path: card.poster_path,
            backdrop_path: card.backdrop_path,
            release_date: card.release_date || card.first_air_date,
            vote_average: card.vote_average,
            source: card.source || getSource()
        };
    }

    function debounce(func, wait) {
        clearTimeout(uiUpdateTimer);
        uiUpdateTimer = setTimeout(func, wait);
    }

    // ============ ИМПОРТ ИЗ CUB ============
    function importFromCUB() {
        const c = cfg();
        if (c.cub_import_done) return Promise.resolve();
        if (!Lampa.Account || !Lampa.Account.Bookmarks) return Promise.resolve();
        
        console.log('[Sync] 📥 Начинаем импорт данных из CUB...');
        
        return new Promise((resolve) => {
            let imported = { bookmarks: 0, timeline: 0, history: 0 };
            
            // 1. Импорт закладок
            try {
                const cubBookmarks = Lampa.Account.Bookmarks.all();
                if (cubBookmarks.length) {
                    const localBookmarks = getPluginBookmarks();
                    const mergedBookmarks = [...localBookmarks];
                    
                    cubBookmarks.forEach(card => {
                        // Определяем тип закладки
                        let type = 'book';
                        const status = Lampa.Favorite.check(card);
                        if (status.like) type = 'like';
                        else if (status.wath) type = 'wath';
                        else if (status.history) type = 'history';
                        
                        const exists = mergedBookmarks.find(b => b.card_id === card.id && b.type === type);
                        if (!exists) {
                            mergedBookmarks.push({
                                card_id: card.id,
                                type: type,
                                data: clearCard(card),
                                time: Date.now()
                            });
                            imported.bookmarks++;
                        }
                    });
                    
                    setPluginBookmarks(mergedBookmarks);
                    syncToLampaFavorites();
                    console.log(`[Sync] 📚 Импортировано закладок: ${imported.bookmarks}`);
                }
            } catch(e) {
                console.warn('[Sync] Ошибка импорта закладок:', e);
            }
            
            // 2. Импорт таймкодов
            try {
                const fileView = getFileView();
                const cubTimeline = Lampa.Storage.get('file_view_' + Lampa.Account.Permit.account?.profile?.id, {});
                
                for (const key in cubTimeline) {
                    if (!fileView[key] || (cubTimeline[key].time || 0) > (fileView[key].time || 0)) {
                        fileView[key] = { ...cubTimeline[key], updated: Date.now() };
                        imported.timeline++;
                    }
                }
                
                if (imported.timeline > 0) {
                    setFileView(fileView);
                    console.log(`[Sync] ⏱️ Импортировано таймкодов: ${imported.timeline}`);
                }
            } catch(e) {
                console.warn('[Sync] Ошибка импорта таймкодов:', e);
            }
            
            // 3. Импорт истории просмотров
            try {
                const localHistory = getPluginHistory();
                const cubWatched = Lampa.Storage.get('online_watched_last', {});
                
                for (const hash in cubWatched) {
                    const record = cubWatched[hash];
                    const exists = localHistory.find(h => h.hash === hash);
                    if (!exists) {
                        localHistory.push({
                            hash: hash,
                            data: record,
                            time: Date.now(),
                            imported: true
                        });
                        imported.history++;
                    }
                }
                
                if (imported.history > 0) {
                    setPluginHistory(localHistory);
                    console.log(`[Sync] 📜 Импортировано записей истории: ${imported.history}`);
                }
            } catch(e) {
                console.warn('[Sync] Ошибка импорта истории:', e);
            }
            
            // Отмечаем, что импорт выполнен
            c.cub_import_done = true;
            saveCfg(c);
            cubImportDone = true;
            
            notify(`📦 Импорт из CUB: ${imported.bookmarks} закладок, ${imported.timeline} таймкодов, ${imported.history} истории`);
            console.log('[Sync] ✅ Импорт из CUB завершён');
            
            resolve();
        });
    }

    // ============ РАЗБЛОКИРОВКА ПРЕМИУМ-СТАТУСОВ ============
    function unlockPremiumFeatures() {
        if (!cfg().unlock_premium) return;
        
        if (Lampa.Account) {
            Lampa.Account.hasPremium = function() {
                return 999;
            };
        }
        
        if (Lampa.Arrays && Lampa.Arrays.movie_more) {
            const originalMovieMore = Lampa.Arrays.movie_more;
            Lampa.Arrays.movie_more = function(movie) {
                const items = originalMovieMore(movie);
                items.forEach(item => {
                    if (item.collect || item.marker) {
                        delete item.noenter;
                        delete item.ghost;
                    }
                });
                return items;
            };
        }
        
        console.log('[Sync] 🔓 Премиум-функции разблокированы');
    }

    // ============ ОТКЛЮЧЕНИЕ CUB ============
    function disableCUBSync() {
        if (!cfg().disable_cub) return;
        
        Lampa.Storage.set('account_sync', false, true);
        
        setTimeout(() => {
            if (Lampa.Account && Lampa.Account.Timeline) {
                const originalTimelineUpdate = Lampa.Account.Timeline.update;
                Lampa.Account.Timeline.update = function() {
                    console.log('[Sync] 🛑 CUB timeline update заблокирован');
                };
            }
            
            if (Lampa.Account && Lampa.Account.Bookmarks) {
                const originalBookmarksUpdate = Lampa.Account.Bookmarks.update;
                let firstCall = true;
                
                Lampa.Account.Bookmarks.update = function(call) {
                    if (firstCall) {
                        firstCall = false;
                        console.log('[Sync] 🔄 Первичная загрузка CUB bookmarks');
                        return originalBookmarksUpdate.call(this, call);
                    }
                    console.log('[Sync] 🛑 CUB bookmarks update заблокирован');
                    if (call) call();
                };
            }
            
            if (Lampa.Account && Lampa.Account.Permit) {
                Object.defineProperty(Lampa.Account.Permit, 'sync', {
                    get: function() { return false; },
                    configurable: true
                });
                console.log('[Sync] Account.Permit.sync отключен');
            }
        }, 1000);
        
        console.log('[Sync] 🛡️ Синхронизация CUB отключена');
    }

    // ============ БЛОКИРОВКА CUB ЗАПИСИ ============
    function blockCUBStorageWrites() {
        if (!cfg().disable_cub) return;
        
        const originalStorageSet = Lampa.Storage.set;
        
        const systemKeys = [
            'parental_control', 'parental_control_pin', 'parental_control_personal', 'parental_control_time',
            'menu', 'activity', 'controller', 'account', 'account_use', 'account_user',
            'profile', 'profile_id', 'settings', 'language', 'tmdb_lang', 'device_name',
            'platform', 'interface_size', 'light_version', 'pages_save_total', 'start_page', 'source',
            'favorite', 'file_view'
        ];
        
        Lampa.Storage.set = function(name, value, nolisten, callerror) {
            const isSystemKey = systemKeys.some(k => name === k || name.indexOf(k + '_') === 0);
            const isPluginKey = name.indexOf('tl_sync_') === 0;
            
            if (isSystemKey || isPluginKey) {
                return originalStorageSet.call(this, name, value, nolisten, callerror);
            }
            
            if (name.indexOf('file_view_') === 0 || name === 'favorite') {
                const stack = new Error().stack || '';
                
                if (stack.includes('account_') || stack.includes('Account.') || stack.includes('bookmarks')) {
                    console.warn('[Sync] 🛑 БЛОКИРОВАНА запись из CUB:', name);
                    return;
                }
            }
            
            return originalStorageSet.call(this, name, value, nolisten, callerror);
        };
        
        console.log('[Sync] 🛡️ Запись CUB заблокирована (с исключениями)');
    }

    // ============ ЗАЩИТА ОТ ПЕРЕЗАПИСИ ============
    function protectFileView() {
        const originalSetItem = localStorage.setItem;
        const lampaKey = getFileViewKey();
        
        localStorage.setItem = function(key, value) {
            if (key === lampaKey) {
                const stack = new Error().stack || '';
                
                if (stack.includes('Storage.cache') || stack.includes('cache')) {
                    return originalSetItem.call(this, key, value);
                }
                
                try {
                    const newData = JSON.parse(value);
                    const currentData = Lampa.Storage.get(lampaKey, {});
                    
                    for (const id in newData) {
                        const newRecord = newData[id];
                        const currentRecord = currentData[id];
                        
                        if (protectedData[id] && protectedData[id].time > 0) {
                            const newTime = newRecord.time || 0;
                            const protectedTime = protectedData[id].time || 0;
                            
                            if (newTime < protectedTime) {
                                console.warn(`[Sync] 🛑 БЛОКИРОВАНА перезапись ${id}: ${newTime} -> ${protectedTime}`);
                                newData[id] = { ...protectedData[id] };
                            }
                        } else if ((newRecord.time || 0) === 0 && currentRecord && currentRecord.time > 0) {
                            newData[id] = { ...currentRecord };
                        }
                    }
                    
                    for (const id in protectedData) {
                        if (!newData[id] && protectedData[id].time > 0) {
                            newData[id] = { ...protectedData[id] };
                        }
                    }
                    
                    value = JSON.stringify(newData);
                    protectedData = newData;
                } catch(e) {}
            }
            return originalSetItem.call(this, key, value);
        };
        
        console.log('[Sync] 🛡️ Защита file_view активирована');
    }

    // ============ ОЧИСТКА СТАРЫХ ЗАПИСЕЙ ============
    function cleanupOldRecords(showNotify) {
        if (showNotify === undefined) showNotify = false;
        
        const c = cfg();
        const now = Date.now();
        const fileView = getFileView();
        let cleaned = 0;
        let completed_cleaned = 0;
        
        const cutoffDate = now - (c.cleanup_days * 86400000);
        
        for (const key in fileView) {
            const record = fileView[key];
            let shouldDelete = false;
            
            const time = record.time || 0;
            const percent = record.percent || 0;
            const updated = record.updated || 0;
            
            if (time === 0 && percent === 0) {
                shouldDelete = true;
                cleaned++;
            } else if (c.cleanup_days > 0 && updated < cutoffDate) {
                shouldDelete = true;
                cleaned++;
            } else if (c.cleanup_completed && percent >= 95) {
                shouldDelete = true;
                completed_cleaned++;
            }
            
            if (shouldDelete) {
                delete fileView[key];
            }
        }
        
        if (cleaned > 0 || completed_cleaned > 0) {
            setFileView(fileView);
            protectedData = { ...fileView };
            
            if (Lampa.Timeline && Lampa.Timeline.read) {
                Lampa.Timeline.read(true);
            }
            
            console.log(`[Sync] 🧹 Очистка: удалено ${cleaned} старых/пустых и ${completed_cleaned} завершённых`);
            
            if (showNotify) {
                notify(`🧹 Удалено: ${cleaned} старых, ${completed_cleaned} завершённых`);
            }
        } else if (showNotify) {
            notify('🧹 Нет записей для очистки');
        }
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
                    
                    setTimeout(() => this.emit('watched'), 100);
                    
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

    // ============ ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ UI ============
    function forceUITimelineUpdate() {
        debounce(() => {
            if (Lampa.Activity && !Lampa.Activity.inActivity()) return;
            
            if (Lampa.Timeline && Lampa.Timeline.read) {
                Lampa.Timeline.read(true);
            }
            
            if (Lampa.Listener) {
                Lampa.Listener.send('state:changed', {
                    target: 'timeline',
                    reason: 'update',
                    data: { force: true }
                });
            }
            
            const cards = document.querySelectorAll('.card');
            cards.forEach(card => {
                if (card.card_data) delete card.card_data._timeline_cache;
                try { card.dispatchEvent(new Event('update')); } catch(e) {}
                if (card.classList.contains('focus')) {
                    card.classList.remove('focus');
                    setTimeout(() => card.classList.add('focus'), 10);
                }
            });
            
            if (Lampa.Maker && Lampa.Maker.map) {
                try {
                    const cardMap = Lampa.Maker.map('Card');
                    if (cardMap && cardMap.Watched) {
                        document.querySelectorAll('.card').forEach(card => {
                            const instance = card.instance;
                            if (instance && instance.emit) {
                                instance.emit('watched');
                                instance.emit('update');
                            }
                        });
                    }
                } catch(e) {}
            }
        }, 100);
    }

    // ============ СИНХРОНИЗАЦИЯ ИЗБРАННОГО ============
    function createBookmarksMap() {
        bookmarksMap = {};
        bookmarks.forEach(bookmark => {
            if (!bookmarksMap[bookmark.type]) bookmarksMap[bookmark.type] = {};
            bookmarksMap[bookmark.type][bookmark.card_id] = bookmark;
        });
    }

    function createHistoryMap() {
        historyMap = {};
        history.forEach(item => {
            historyMap[item.hash] = item;
        });
    }

    function syncToLampaFavorites() {
        const favorites = {
            book: [], like: [], wath: [], history: [],
            look: [], viewed: [], scheduled: [], continued: [], thrown: []
        };
        
        bookmarks.forEach(bookmark => {
            if (favorites[bookmark.type]) {
                favorites[bookmark.type].push(bookmark.data);
            }
        });
        
        Lampa.Storage.set('favorite', favorites, true);
        
        Lampa.Listener.send('state:changed', {
            target: 'favorite',
            reason: 'sync'
        });
    }

    function interceptFavorites() {
        Lampa.Listener.follow('state:changed', (e) => {
            if (e.target === 'favorite') {
                if (syncingFromPlugin) return;
                
                if (Lampa.ParentalControl && Lampa.ParentalControl.enabled && Lampa.ParentalControl.enabled()) {
                    console.log('[Sync] ParentalControl активен, пропускаем синхронизацию');
                    return;
                }
                
                if (e.reason === 'add' || e.reason === 'remove' || e.reason === 'update') {
                    syncingFromPlugin = true;
                    
                    const lampaFavorites = Lampa.Storage.get('favorite', {});
                    const newBookmarks = [];
                    
                    for (const type in lampaFavorites) {
                        if (Array.isArray(lampaFavorites[type])) {
                            lampaFavorites[type].forEach(card => {
                                newBookmarks.push({
                                    card_id: card.id,
                                    type: type,
                                    data: clearCard(card),
                                    time: Date.now()
                                });
                            });
                        }
                    }
                    
                    setPluginBookmarks(newBookmarks);
                    syncToLampaFavorites();
                    
                    if (cfg().auto_sync) {
                        setTimeout(() => syncNow(false), 1000);
                    }
                    
                    syncingFromPlugin = false;
                }
            }
        });
        
        const savedBookmarks = getPluginBookmarks();
        if (savedBookmarks.length) {
            bookmarks = savedBookmarks;
            createBookmarksMap();
            syncToLampaFavorites();
        }
        
        console.log('[Sync] 📚 Перехват избранного активирован');
    }

    // ============ СИНХРОНИЗАЦИЯ ИСТОРИИ ============
    function interceptHistory() {
        // Перехватываем добавление в историю
        Lampa.Listener.follow('state:changed', (e) => {
            if (e.target === 'favorite' && e.type === 'history' && e.reason === 'update') {
                if (syncingFromPlugin) return;
                
                const card = e.card;
                if (!card) return;
                
                addToHistory(card);
            }
        });
        
        // Перехватываем историю просмотра из плеера
        const originalSet = Lampa.Storage.set;
        Lampa.Storage.set = function(name, value, nolisten, callerror) {
            if (name === 'online_watched_last' && !syncingFromPlugin) {
                try {
                    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                    const historyData = getPluginHistory();
                    
                    for (const hash in parsed) {
                        const record = parsed[hash];
                        const exists = historyData.find(h => h.hash === hash);
                        
                        if (!exists) {
                            historyData.push({
                                hash: hash,
                                data: record,
                                time: Date.now()
                            });
                        } else {
                            exists.data = record;
                            exists.time = Date.now();
                        }
                    }
                    
                    setPluginHistory(historyData);
                    
                    if (cfg().auto_sync) {
                        setTimeout(() => syncNow(false), 1000);
                    }
                } catch(e) {}
            }
            
            return originalSet.call(this, name, value, nolisten, callerror);
        };
        
        console.log('[Sync] 📜 Перехват истории активирован');
    }

    function addToHistory(card) {
        const historyData = getPluginHistory();
        const hash = Lampa.Utils.hash(card.original_name ? card.original_name : card.original_title);
        
        const exists = historyData.find(h => h.hash === hash);
        if (!exists) {
            historyData.push({
                hash: hash,
                data: {
                    id: card.id,
                    title: card.title || card.name,
                    type: card.original_name ? 'tv' : 'movie'
                },
                time: Date.now()
            });
            
            setPluginHistory(historyData);
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
            let duration = Lampa.Player.playdata()?.timeline?.duration || 0;
            
            if (duration === 0 && fileView[movieKey]?.duration > 0) {
                duration = fileView[movieKey].duration;
            }
            
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            const seriesInfo = getSeriesInfoFromUrl();
            
            const record = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: Date.now(),
                tmdb_id: getCurrentMovieTmdbId(),
                source: getSource(),
                ...(seriesInfo && { season: seriesInfo.season, episode: seriesInfo.episode })
            };
            
            fileView[movieKey] = record;
            protectedData[movieKey] = record;
            setFileView(fileView);
            
            forceUITimelineUpdate();
            
            console.log(`[Sync] 💾 Сохранён прогресс: ${formatTime(currentTime)} (${percent}%)`);
            
            if (duration > 0) checkEndCredits(currentTime, duration);
            
            return true;
        }
        return false;
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
            
            Lampa.Noty.show('🎬 Финальные титры. Отметить как просмотренное?', 5000, function() {
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
        
        const record = {
            time: duration,
            percent: 100,
            duration: duration,
            updated: Date.now(),
            tmdb_id: getCurrentMovieTmdbId(),
            source: getSource(),
            completed: true
        };
        
        fileView[movieKey] = record;
        protectedData[movieKey] = record;
        setFileView(fileView);
        
        notify('✅ Отмечено как просмотренное');
        
        forceUITimelineUpdate();
        
        if (cfg().sync_on_stop) {
            setTimeout(() => syncNow(false), 500);
        }
    }

    // ============ СИНХРОНИЗАЦИЯ С GIST ============
    function syncNow(showNotify, callback) {
        if (showNotify === undefined) showNotify = true;
        
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
        if (syncInProgress) {
            pendingSync = true;
            if (callback) callback(false);
            return;
        }
        
        syncInProgress = true;
        
        if (showNotify) notify('🔄 Синхронизация...');
        
        console.log('[Sync] 📥 Загрузка данных с Gist...');
        
        $.ajax({
            url: 'https://api.github.com/gists/' + c.gist_id,
            method: 'GET',
            headers: {
                'Authorization': 'token ' + c.gist_token,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: function(response) {
                try {
                    const content = response.files['lampa_sync.json']?.content;
                    let remoteData = { timeline: {}, bookmarks: [], history: [] };
                    
                    if (content) {
                        remoteData = JSON.parse(content);
                        console.log('[Sync] Данные получены:', Object.keys(remoteData.timeline || {}).length, 'таймкодов,', remoteData.bookmarks?.length || 0, 'закладок,', remoteData.history?.length || 0, 'истории');
                    }
                    
                    // Синхронизация таймкодов
                    const localTimeline = getFileView();
                    const remoteTimeline = remoteData.timeline || {};
                    const strategy = c.sync_strategy;
                    
                    let mergedTimeline = { ...remoteTimeline };
                    let hasChanges = false;
                    
                    for (const key in localTimeline) {
                        const localRecord = localTimeline[key];
                        const remoteRecord = remoteTimeline[key];
                        
                        if (!remoteRecord) {
                            mergedTimeline[key] = localRecord;
                            hasChanges = true;
                        } else {
                            let shouldUseLocal = false;
                            
                            const localUpdated = localRecord.updated || 0;
                            const remoteUpdated = remoteRecord.updated || 0;
                            const localTime = localRecord.time || 0;
                            const remoteTime = remoteRecord.time || 0;
                            
                            if (strategy === 'max_time') {
                                if (localTime > remoteTime) shouldUseLocal = true;
                            } else {
                                if (localUpdated > remoteUpdated) shouldUseLocal = true;
                                else if (localUpdated === remoteUpdated && localTime > remoteTime) shouldUseLocal = true;
                            }
                            
                            if (shouldUseLocal && JSON.stringify(localRecord) !== JSON.stringify(remoteRecord)) {
                                mergedTimeline[key] = localRecord;
                                hasChanges = true;
                            }
                        }
                    }
                    
                    for (const key in remoteTimeline) {
                        if (!localTimeline[key]) {
                            mergedTimeline[key] = remoteTimeline[key];
                        }
                    }
                    
                    setFileView(mergedTimeline);
                    protectedData = { ...mergedTimeline };
                    
                    // Синхронизация закладок
                    if (c.sync_favorites) {
                        const localBookmarks = getPluginBookmarks();
                        const remoteBookmarks = remoteData.bookmarks || [];
                        
                        const mergedBookmarks = [...remoteBookmarks];
                        
                        localBookmarks.forEach(local => {
                            const existing = mergedBookmarks.find(r => r.card_id === local.card_id && r.type === local.type);
                            if (!existing) {
                                mergedBookmarks.push(local);
                                hasChanges = true;
                            } else if (local.time > existing.time) {
                                Object.assign(existing, local);
                                hasChanges = true;
                            }
                        });
                        
                        setPluginBookmarks(mergedBookmarks);
                        syncToLampaFavorites();
                    }
                    
                    // Синхронизация истории
                    if (c.sync_history) {
                        const localHistory = getPluginHistory();
                        const remoteHistory = remoteData.history || [];
                        
                        const mergedHistory = [...remoteHistory];
                        
                        localHistory.forEach(local => {
                            const existing = mergedHistory.find(r => r.hash === local.hash);
                            if (!existing) {
                                mergedHistory.push(local);
                                hasChanges = true;
                            } else if (local.time > existing.time) {
                                Object.assign(existing, local);
                                hasChanges = true;
                            }
                        });
                        
                        setPluginHistory(mergedHistory);
                    }
                    
                    if (hasChanges) {
                        const dataToSend = {
                            version: SYNC_VERSION,
                            profile_id: getCurrentProfileId(),
                            device: c.device_name,
                            source: getSource(),
                            updated: Date.now(),
                            timeline: mergedTimeline,
                            bookmarks: getPluginBookmarks(),
                            history: getPluginHistory()
                        };
                        
                        console.log('[Sync] 📤 Отправка данных...');
                        
                        $.ajax({
                            url: 'https://api.github.com/gists/' + c.gist_id,
                            method: 'PATCH',
                            headers: {
                                'Authorization': 'token ' + c.gist_token,
                                'Accept': 'application/vnd.github.v3+json'
                            },
                            data: JSON.stringify({
                                description: 'Lampa Sync v' + SYNC_VERSION,
                                public: false,
                                files: {
                                    'lampa_sync.json': {
                                        content: JSON.stringify(dataToSend, null, 2)
                                    }
                                }
                            }),
                            success: function() {
                                if (Lampa.Timeline && Lampa.Timeline.read) {
                                    Lampa.Timeline.read(true);
                                }
                                
                                if (showNotify) notify('✅ Синхронизация завершена');
                                console.log('[Sync] ✅ Синхронизация завершена');
                                
                                syncInProgress = false;
                                if (pendingSync) {
                                    pendingSync = false;
                                    setTimeout(() => syncNow(false, callback), 1000);
                                } else if (callback) {
                                    callback(true);
                                }
                                
                                forceUITimelineUpdate();
                            },
                            error: function(xhr) {
                                console.error('[Sync] ❌ Ошибка отправки:', xhr.status);
                                if (showNotify) notify('❌ Ошибка: ' + xhr.status);
                                syncInProgress = false;
                                if (callback) callback(false);
                            }
                        });
                    } else {
                        console.log('[Sync] Нет изменений');
                        if (showNotify) notify('✅ Данные актуальны');
                        syncInProgress = false;
                        if (callback) callback(true);
                        forceUITimelineUpdate();
                    }
                } catch(e) {
                    console.error('[Sync] ❌ Ошибка:', e);
                    if (showNotify) notify('❌ Ошибка данных');
                    syncInProgress = false;
                    if (callback) callback(false);
                }
            },
            error: function(xhr) {
                console.error('[Sync] ❌ Ошибка загрузки:', xhr.status);
                if (showNotify) notify('❌ Ошибка: ' + xhr.status);
                syncInProgress = false;
                if (callback) callback(false);
            }
        });
    }

    // ============ ЭКСПОРТ/ИМПОРТ ДАННЫХ ============
    function exportData() {
        const data = {
            version: SYNC_VERSION,
            profile_id: getCurrentProfileId(),
            device: cfg().device_name,
            exported: Date.now(),
            timeline: getFileView(),
            bookmarks: getPluginBookmarks(),
            history: getPluginHistory()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lampa_sync_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        notify('📤 Данные экспортированы');
    }

    function importData(callback) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    if (data.timeline) {
                        setFileView(data.timeline);
                        protectedData = { ...data.timeline };
                    }
                    if (data.bookmarks) {
                        setPluginBookmarks(data.bookmarks);
                        syncToLampaFavorites();
                    }
                    if (data.history) {
                        setPluginHistory(data.history);
                    }
                    
                    forceUITimelineUpdate();
                    notify('📥 Данные импортированы');
                    
                    if (callback) callback(true);
                } catch(err) {
                    console.error('[Sync] Ошибка импорта:', err);
                    notify('❌ Ошибка импорта');
                    if (callback) callback(false);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    function getStatistics() {
        const timeline = getFileView();
        const bookmarks = getPluginBookmarks();
        const history = getPluginHistory();
        
        const timelineCount = Object.keys(timeline).length;
        const completedCount = Object.values(timeline).filter(r => r.percent >= 95).length;
        const bookmarksByType = {};
        bookmarks.forEach(b => { bookmarksByType[b.type] = (bookmarksByType[b.type] || 0) + 1; });
        
        return { timelineCount, completedCount, bookmarksCount: bookmarks.length, historyCount: history.length, bookmarksByType };
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
        
        if (isV3 && Lampa.Timer && Lampa.Timer.add) {
            if (timerId) Lampa.Timer.remove(timerId);
            
            timerId = function() {
                const currentCfg = cfg();
                if (!syncInProgress && currentCfg.auto_sync && currentCfg.enabled && !Lampa.Player.opened()) {
                    syncNow(false);
                    cleanupOldRecords(false);
                }
            };
            
            Lampa.Timer.add(c.sync_interval * 1000, timerId);
        } else {
            if (autoSyncInterval) clearInterval(autoSyncInterval);
            
            autoSyncInterval = setInterval(function() {
                const currentCfg = cfg();
                if (!syncInProgress && currentCfg.auto_sync && currentCfg.enabled && !Lampa.Player.opened()) {
                    syncNow(false);
                    cleanupOldRecords(false);
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
        const stats = getStatistics();
        
        Lampa.Select.show({
            title: 'Синхронизация v' + SYNC_VERSION,
            items: [
                { title: (c.enabled ? '[OK]' : '[OFF]') + ' Плагин: ' + (c.enabled ? 'Вкл' : 'Выкл'), action: 'toggle_enabled' },
                { title: (c.auto_sync ? '[OK]' : '[OFF]') + ' Автосинхронизация: ' + (c.auto_sync ? 'Вкл' : 'Выкл'), action: 'toggle_auto_sync' },
                { title: (c.auto_save ? '[OK]' : '[OFF]') + ' Автосохранение: ' + (c.auto_save ? 'Вкл' : 'Выкл'), action: 'toggle_auto_save' },
                { title: '──────────', separator: true },
                { title: '📊 Статистика', action: 'show_stats' },
                { title: `   Таймкодов: ${stats.timelineCount} (завершено: ${stats.completedCount})` },
                { title: `   Закладок: ${stats.bookmarksCount}` },
                { title: `   История: ${stats.historyCount}` },
                { title: '──────────', separator: true },
                { title: (c.disable_cub ? '[OK]' : '[OFF]') + ' Отключить CUB: ' + (c.disable_cub ? 'Да' : 'Нет'), action: 'toggle_disable_cub' },
                { title: (c.sync_favorites ? '[OK]' : '[OFF]') + ' Синхр. избранного: ' + (c.sync_favorites ? 'Да' : 'Нет'), action: 'toggle_sync_favorites' },
                { title: (c.sync_history ? '[OK]' : '[OFF]') + ' Синхр. истории: ' + (c.sync_history ? 'Да' : 'Нет'), action: 'toggle_sync_history' },
                { title: (c.unlock_premium ? '[OK]' : '[OFF]') + ' Разблок. премиум: ' + (c.unlock_premium ? 'Да' : 'Нет'), action: 'toggle_unlock_premium' },
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
                { title: '🔑 Gist токен: ' + (c.gist_token ? '✓ установлен' : '❌ НЕ установлен'), action: 'set_token' },
                { title: '📄 Gist ID: ' + (c.gist_id ? c.gist_id.substring(0, 8) + '…' : '❌ НЕ установлен'), action: 'set_gist_id' },
                { title: '──────────', separator: true },
                { title: '🔄 Синхронизировать сейчас', action: 'sync_now' },
                { title: '📤 Экспорт данных', action: 'export_data' },
                { title: '📥 Импорт данных', action: 'import_data' },
                { title: '🗑️ Очистить пустые записи', action: 'force_cleanup' },
                { title: '🧹 Очистить старые записи', action: 'cleanup_now' },
                { title: '──────────', separator: true },
                { title: '❌ Закрыть', action: 'cancel' }
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
                else if (item.action === 'toggle_disable_cub') {
                    c.disable_cub = !c.disable_cub;
                    saveCfg(c);
                    notify('Отключение CUB ' + (c.disable_cub ? 'включено' : 'выключено') + '. Перезагрузите Lampa');
                    showMainMenu();
                }
                else if (item.action === 'toggle_sync_favorites') {
                    c.sync_favorites = !c.sync_favorites;
                    saveCfg(c);
                    notify('Синхронизация избранного ' + (c.sync_favorites ? 'включена' : 'выключена'));
                    showMainMenu();
                }
                else if (item.action === 'toggle_sync_history') {
                    c.sync_history = !c.sync_history;
                    saveCfg(c);
                    notify('Синхронизация истории ' + (c.sync_history ? 'включена' : 'выключена'));
                    showMainMenu();
                }
                else if (item.action === 'toggle_unlock_premium') {
                    c.unlock_premium = !c.unlock_premium;
                    saveCfg(c);
                    notify('Разблокировка премиум ' + (c.unlock_premium ? 'включена' : 'выключена') + '. Перезагрузите Lampa');
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
                            { title: '⬇️ Снизу', action: 'bottom' },
                            { title: '📍 По центру', action: 'center' },
                            { title: '⬆️ Сверху', action: 'top' }
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
                        title: 'GitHub Token (начинается с ghp_)', 
                        value: c.gist_token || '', 
                        free: true 
                    }, function(val) {
                        if (val !== null) {
                            c.gist_token = val || '';
                            saveCfg(c);
                            notify('✅ Токен сохранён');
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'set_gist_id') {
                    Lampa.Input.edit({ 
                        title: 'Gist ID (из URL gist.github.com/...)', 
                        value: c.gist_id || '', 
                        free: true 
                    }, function(val) {
                        if (val !== null) {
                            c.gist_id = val || '';
                            saveCfg(c);
                            notify('✅ Gist ID сохранён');
                        }
                        showMainMenu();
                    });
                }
                else if (item.action === 'sync_now') {
                    Lampa.Controller.toggle('content');
                    syncNow(true);
                }
                else if (item.action === 'export_data') {
                    Lampa.Controller.toggle('content');
                    exportData();
                }
                else if (item.action === 'import_data') {
                    Lampa.Controller.toggle('content');
                    importData(() => {
                        forceUITimelineUpdate();
                    });
                }
                else if (item.action === 'show_stats') {
                    const stats = getStatistics();
                    let bookmarksStr = '';
                    for (const type in stats.bookmarksByType) {
                        bookmarksStr += `\n   ${type}: ${stats.bookmarksByType[type]}`;
                    }
                    notify(`📊 Таймкоды: ${stats.timelineCount} (завершено: ${stats.completedCount})\n📚 Закладки: ${stats.bookmarksCount}${bookmarksStr}\n📜 История: ${stats.historyCount}`, 8000);
                    showMainMenu();
                }
                else if (item.action === 'force_cleanup') {
                    Lampa.Select.show({
                        title: 'Очистить пустые записи?',
                        items: [
                            { title: '❌ Отмена', action: 'cancel' },
                            { title: '✅ Да, очистить', action: 'confirm' }
                        ],
                        onSelect: function(subItem) {
                            if (subItem.action === 'confirm') {
                                Lampa.Controller.toggle('content');
                                cleanupOldRecords(true);
                            } else {
                                showMainMenu();
                            }
                        },
                        onBack: function() { showMainMenu(); }
                    });
                }
                else if (item.action === 'cleanup_now') {
                    Lampa.Select.show({
                        title: 'Очистить старые записи?',
                        items: [
                            { title: '❌ Отмена', action: 'cancel' },
                            { title: '✅ Да, очистить', action: 'confirm' }
                        ],
                        onSelect: function(subItem) {
                            if (subItem.action === 'confirm') {
                                Lampa.Controller.toggle('content');
                                cleanupOldRecords(true);
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
            name: 'Синхронизация v' + SYNC_VERSION,
            icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z M11 7v5l4 2.5 1-1.5-3-2V7z"/></svg>'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'open_menu', type: 'button' },
            field: { name: 'Открыть меню v' + SYNC_VERSION },
            onChange: function() {
                if (Lampa.Controller && Lampa.Controller.toggle) {
                    Lampa.Controller.toggle('settings');
                }
                setTimeout(() => showMainMenu(), 100);
            }
        });
    }

    // ============ ИНИЦИАЛИЗАЦИЯ ============
    function init() {
        isV3 = Lampa.Manifest && Lampa.Manifest.app_digital >= 300;
        
        addSettingsButton();
        
        const c = cfg();
        if (!c.enabled) {
            console.log('[Sync] Плагин выключен');
            return;
        }
        
        console.log('[Sync] 🚀 Запуск v' + SYNC_VERSION);
        
        // Сначала применяем некритичные настройки
        if (c.unlock_premium) unlockPremiumFeatures();
        if (c.always_show_timeline) enableAlwaysShowTimeline();
        
        protectFileView();
        protectedData = getFileView();
        
        interceptFavorites();
        interceptHistory();
        initPlayerHandler();
        startBackgroundSync();
        
        // Откладываем блокировку CUB и импорт
        setTimeout(() => {
            // Импорт из CUB при первом запуске
            if (!c.cub_import_done) {
                importFromCUB();
            }
            
            if (c.disable_cub) {
                disableCUBSync();
                blockCUBStorageWrites();
            }
            
            console.log('[Sync] ✅ Блокировка CUB активирована');
        }, c.block_cub_delay || 3000);
        
        setTimeout(() => {
            if (cfg().auto_sync) {
                syncNow(false);
                cleanupOldRecords(false);
            }
            forceRefreshCards();
        }, 4000);
        
        console.log('[Sync] ✅ v' + SYNC_VERSION + ' загружен');
        notify('🚀 Sync v' + SYNC_VERSION + ' загружен');
    }

    // Запуск
    if (window.Lampa && Lampa.Listener) {
        if (window.appready) init();
        else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') init(); });
    } else {
        setTimeout(function waitLampa() {
            if (window.Lampa && Lampa.Listener) {
                if (window.appready) init();
                else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') init(); });
            } else setTimeout(waitLampa, 100);
        }, 100);
    }
})();
