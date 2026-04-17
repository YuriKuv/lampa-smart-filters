(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    const SYNC_VERSION = 11;
    const BOOKMARKS_STORE = 'nsl_bookmarks';
    
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
    let bookmarksList = [];
    
    let protectedData = {};

    // ============ SVG ИКОНКИ ============
    const ICON_BOOKMARK = `
        <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/>
        </svg>
    `;
    
    const ICON_ADD = `
        <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z"/>
        </svg>
    `;
    
    const ICON_SYNC = `
        <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
    `;

    // ============ КОНФИГУРАЦИЯ ============
    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            
            // Таймкоды
            auto_sync: true,
            auto_save: true,
            sync_on_stop: true,
            sync_strategy: 'last_watch',
            sync_interval: 30,
            cleanup_days: 30,
            cleanup_completed: true,
            end_credits_threshold: 180,
            always_show_timeline: true,
            timeline_position: 'bottom',
            
            // Закладки
            bookmarks_enabled: true,
            bookmarks_button: 'side',
            bookmarks_sync_on_add: true,
            bookmarks_sync_on_remove: true,
            
            // Общие
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform ? Lampa.Platform.get() : 'Unknown',
            manual_profile_id: ''
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function notify(text, timeout) {
        if (timeout === undefined) timeout = 3000;
        Lampa.Noty.show(text, timeout);
    }

    function debounce(func, wait) {
        clearTimeout(uiUpdateTimer);
        uiUpdateTimer = setTimeout(func, wait);
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
        return `nsl_${type}_${profileId}`;
    }

    function getPluginHistory() {
        return Lampa.Storage.get(getPluginStorageKey('history'), []);
    }

    function setPluginHistory(data) {
        Lampa.Storage.set(getPluginStorageKey('history'), data, true);
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

    // ============ ЗАКЛАДКИ ============
    function loadBookmarks() {
        bookmarksList = Lampa.Storage.get(BOOKMARKS_STORE, []);
        return bookmarksList;
    }

    function saveBookmarks() {
        Lampa.Storage.set(BOOKMARKS_STORE, bookmarksList, true);
        renderBookmarks();
        
        const c = cfg();
        if (c.bookmarks_sync_on_add || c.bookmarks_sync_on_remove) {
            setTimeout(() => syncNow(false), 1000);
        }
    }

    function makeBookmarkKey(act) {
        return [
            act.url || '',
            act.component || '',
            act.source || '',
            act.id || '',
            act.job || '',
            JSON.stringify(act.genres || ''),
            JSON.stringify(act.params || '')
        ].join('|');
    }

    function bookmarkExists(act) {
        const key = makeBookmarkKey(act);
        return bookmarksList.some(i => i.key === key);
    }

    function isBookmarkAllowed() {
        const act = Lampa.Activity.active();
        if (!act) return false;

        if (act.component === 'actor' || act.component === 'person') return true;
        if (!act.url) return false;

        if (act.url === 'movie' || act.url === 'tv' || act.url === 'anime' || act.url === 'catalog') {
            return !!(act.genres || act.params || act.filter);
        }

        if (act.params || act.genres || act.sort || act.filter) return true;
        if (act.url.indexOf('discover') !== -1 && act.url.indexOf('?') !== -1) return true;

        return false;
    }

    function normalizeBookmark(act, customName) {
        const key = makeBookmarkKey(act);
        return {
            id: Date.now(),
            key: key,
            name: customName || act.title || act.name || 'Закладка',
            url: act.url,
            component: act.component || 'category_full',
            source: act.source || 'tmdb',
            id_person: act.id,
            job: act.job,
            genres: act.genres,
            params: act.params,
            page: act.page || 1,
            created: Date.now()
        };
    }

    function addBookmark() {
        const act = Lampa.Activity.active();

        if (!isBookmarkAllowed()) {
            notify('⚠️ Здесь нельзя создать закладку');
            return;
        }

        if (bookmarkExists(act)) {
            notify('📌 Уже есть в закладках');
            return;
        }

        Lampa.Input.edit({
            title: 'Название закладки',
            value: act.title || act.name || 'Закладка'
        }, (val) => {
            if (!val) return;
            
            bookmarksList.push(normalizeBookmark(act, val.trim()));
            bookmarksList.sort((a, b) => b.created - a.created);
            saveBookmarks();
            
            notify('✅ Закладка сохранена');
        });
    }

    function removeBookmark(item) {
        bookmarksList = bookmarksList.filter(i => i.id !== item.id);
        saveBookmarks();
        notify('🗑️ Закладка удалена');
    }

    function openBookmark(item) {
        Lampa.Activity.push({
            url: item.url,
            title: item.name,
            component: item.component,
            source: item.source,
            id: item.id_person,
            job: item.job,
            genres: item.genres,
            params: item.params,
            page: item.page
        });
    }

    function renderBookmarks() {
        $('.nsl-bookmark-item').remove();

        const root = $('.menu .menu__list').eq(0);
        if (!root.length) return;

        if (bookmarksList.length > 0) {
            // Добавляем разделитель
            root.append('<li class="menu__split nsl-bookmark-item"></li>');
        }

        bookmarksList.slice(0, 20).forEach(item => {
            const el = $(`
                <li class="menu__item selector nsl-bookmark-item">
                    <div class="menu__ico">${ICON_BOOKMARK}</div>
                    <div class="menu__text">${item.name}</div>
                </li>
            `);

            el.on('hover:enter', (e) => {
                e.stopPropagation();
                openBookmark(item);
            });

            el.on('hover:long', (e) => {
                e.stopPropagation();

                Lampa.Select.show({
                    title: `Удалить "${item.name}"?`,
                    items: [
                        { title: '❌ Нет', action: 'cancel' },
                        { title: '✅ Да', action: 'remove' }
                    ],
                    onSelect: (a) => {
                        if (a.action === 'remove') {
                            removeBookmark(item);
                        }
                    },
                    onBack: () => {
                        Lampa.Controller.toggle('content');
                    }
                });
            });

            root.append(el);
        });
    }

    function addBookmarkButton() {
        if ($('[data-nsl-bookmark-add]').length) return;

        const c = cfg();
        if (!c.bookmarks_enabled) return;

        const menu = $('.menu .menu__list');
        if (!menu.length) return;

        const btn = $(`
            <li class="menu__item selector" data-nsl-bookmark-add>
                <div class="menu__ico">${ICON_ADD}</div>
                <div class="menu__text">📌 В закладки</div>
            </li>
        `);

        btn.on('hover:enter', (e) => {
            e.stopPropagation();
            addBookmark();
        });

        menu.eq(1).prepend(btn);
    }

    // ============ СИНХРОНИЗАЦИЯ С GIST ============
    function getGistAuth() {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) return null;
        return { token: c.gist_token, id: c.gist_id };
    }

    function syncNow(showNotify, callback) {
        if (showNotify === undefined) showNotify = true;
        
        const gist = getGistAuth();
        if (!gist) {
            if (showNotify) notify('⚠️ GitHub Gist не настроен');
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
        
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${gist.token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: function(response) {
                try {
                    const content = response.files['lampa_sync.json']?.content;
                    let remoteData = { timeline: {}, history: [], bookmarks: [] };
                    
                    if (content) {
                        remoteData = JSON.parse(content);
                    }
                    
                    // Синхронизация таймкодов
                    const localTimeline = getFileView();
                    const remoteTimeline = remoteData.timeline || {};
                    const strategy = cfg().sync_strategy;
                    
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
                            
                            if (shouldUseLocal) {
                                mergedTimeline[key] = localRecord;
                                hasChanges = true;
                            }
                        }
                    }
                    
                    setFileView(mergedTimeline);
                    protectedData = { ...mergedTimeline };
                    
                    // Синхронизация истории
                    const localHistory = getPluginHistory();
                    const remoteHistory = remoteData.history || [];
                    
                    const mergedHistory = [...remoteHistory];
                    localHistory.forEach(local => {
                        if (!mergedHistory.find(r => r.hash === local.hash)) {
                            mergedHistory.push(local);
                            hasChanges = true;
                        }
                    });
                    
                    setPluginHistory(mergedHistory);
                    
                    // Синхронизация закладок
                    const remoteBookmarks = remoteData.bookmarks || [];
                    
                    if (remoteBookmarks.length > 0) {
                        const mergedBookmarks = [...remoteBookmarks];
                        bookmarksList.forEach(local => {
                            if (!mergedBookmarks.find(r => r.key === local.key)) {
                                mergedBookmarks.push(local);
                                hasChanges = true;
                            }
                        });
                        
                        bookmarksList = mergedBookmarks;
                        bookmarksList.sort((a, b) => b.created - a.created);
                        Lampa.Storage.set(BOOKMARKS_STORE, bookmarksList, true);
                        renderBookmarks();
                    } else if (bookmarksList.length > 0) {
                        hasChanges = true;
                    }
                    
                    // Отправка изменений
                    if (hasChanges) {
                        const dataToSend = {
                            version: SYNC_VERSION,
                            profile_id: getCurrentProfileId(),
                            device: cfg().device_name,
                            updated: Date.now(),
                            timeline: mergedTimeline,
                            history: mergedHistory,
                            bookmarks: bookmarksList
                        };
                        
                        $.ajax({
                            url: `https://api.github.com/gists/${gist.id}`,
                            method: 'PATCH',
                            headers: {
                                'Authorization': `token ${gist.token}`,
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
                                if (showNotify) notify('✅ Синхронизация завершена');
                                
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
                                console.error('[Sync] Error:', xhr);
                                if (showNotify) notify('❌ Ошибка: ' + xhr.status);
                                syncInProgress = false;
                                if (callback) callback(false);
                            }
                        });
                    } else {
                        if (showNotify) notify('✅ Данные актуальны');
                        syncInProgress = false;
                        if (callback) callback(true);
                        forceUITimelineUpdate();
                    }
                } catch(e) {
                    console.error('[Sync] Error:', e);
                    if (showNotify) notify('❌ Ошибка данных');
                    syncInProgress = false;
                    if (callback) callback(false);
                }
            },
            error: function(xhr) {
                console.error('[Sync] Error:', xhr);
                if (showNotify) notify('❌ Ошибка: ' + xhr.status);
                syncInProgress = false;
                if (callback) callback(false);
            }
        });
    }

    // ============ ТАЙМКОДЫ (упрощённая версия) ============
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
        `;
        document.head.appendChild(style);
        styleInjected = true;
    }

    function removeTimelineStyles() {
        const oldStyle = document.getElementById('tl-sync-styles');
        if (oldStyle) oldStyle.remove();
        styleInjected = false;
    }

    function enableAlwaysShowTimeline() {
        injectTimelineStyles();
    }

    function disableAlwaysShowTimeline() {
        removeTimelineStyles();
    }

    function forceUITimelineUpdate() {
        debounce(() => {
            if (Lampa.Timeline && Lampa.Timeline.read) {
                Lampa.Timeline.read(true);
            }
        }, 100);
    }

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
            
            return true;
        }
        return false;
    }

    function initPlayerHandler() {
        let lastSavedProgress = 0;
        let lastSyncToGist = 0;
        
        playerCheckInterval = setInterval(function() {
            const c = cfg();
            if (!c.enabled) return;
            
            const isPlayerOpen = Lampa.Player.opened();
            
            if (isPlayerOpen) {
                try {
                    const playerData = Lampa.Player.playdata();
                    if (playerData && playerData.timeline && playerData.timeline.time) {
                        const currentTime = playerData.timeline.time;
                        currentMovieTime = currentTime;
                        
                        const movieId = getCurrentMovieTmdbId();
                        if (movieId) {
                            currentMovieId = movieId;
                            
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
                } catch(e) {}
            }
        }, 1000);
    }

    function stopPlayerHandler() {
        if (playerCheckInterval) {
            clearInterval(playerCheckInterval);
            playerCheckInterval = null;
        }
    }

    function startBackgroundSync() {
        const c = cfg();
        
        if (autoSyncInterval) clearInterval(autoSyncInterval);
        
        autoSyncInterval = setInterval(function() {
            const currentCfg = cfg();
            if (!syncInProgress && currentCfg.auto_sync && currentCfg.enabled && !Lampa.Player.opened()) {
                syncNow(false);
            }
        }, c.sync_interval * 1000);
    }

    function stopBackgroundSync() {
        if (autoSyncInterval) {
            clearInterval(autoSyncInterval);
            autoSyncInterval = null;
        }
    }

    // ============ МЕНЮ НАСТРОЕК ============
    function showGistSetup() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '☁️ GitHub Gist Синхронизация',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓ Установлен' : '❌ Не установлен'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0, 8) + '…' : '❌ Не установлен'}`, action: 'id' },
                { title: '──────────', separator: true },
                { title: '🔄 Синхронизировать сейчас', action: 'sync' },
                { title: '──────────', separator: true },
                { title: '❌ Закрыть', action: 'cancel' }
            ],
            onSelect: (item) => {
                if (item.action === 'token') {
                    Lampa.Input.edit({
                        title: 'GitHub Token (ghp_...)',
                        value: c.gist_token,
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.gist_token = val || '';
                            saveCfg(c);
                            notify('✅ Токен сохранён');
                        }
                        showGistSetup();
                    });
                } else if (item.action === 'id') {
                    Lampa.Input.edit({
                        title: 'Gist ID',
                        value: c.gist_id,
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.gist_id = val || '';
                            saveCfg(c);
                            notify('✅ Gist ID сохранён');
                        }
                        showGistSetup();
                    });
                } else if (item.action === 'sync') {
                    Lampa.Controller.toggle('content');
                    syncNow(true);
                }
            },
            onBack: () => {
                Lampa.Controller.toggle('content');
            }
        });
    }

    function showMainMenu() {
        const c = cfg();
        const strategyName = c.sync_strategy === 'max_time' ? 'по длительности' : 'по дате';
        const positionName = c.timeline_position === 'bottom' ? 'снизу' : (c.timeline_position === 'center' ? 'по центру' : 'сверху');
        
        Lampa.Select.show({
            title: 'Синхронизация v' + SYNC_VERSION,
            items: [
                { title: (c.enabled ? '[OK]' : '[OFF]') + ' Плагин: ' + (c.enabled ? 'Вкл' : 'Выкл'), action: 'toggle_enabled' },
                { title: '──────────', separator: true },
                { title: '⏱️ Таймкоды', disabled: true },
                { title: (c.auto_save ? '[OK]' : '[OFF]') + ' Автосохранение: ' + (c.auto_save ? 'Вкл' : 'Выкл'), action: 'toggle_auto_save' },
                { title: (c.auto_sync ? '[OK]' : '[OFF]') + ' Автосинхронизация: ' + (c.auto_sync ? 'Вкл' : 'Выкл'), action: 'toggle_auto_sync' },
                { title: (c.always_show_timeline ? '[OK]' : '[OFF]') + ' Таймкоды всегда: ' + (c.always_show_timeline ? 'Вкл' : 'Выкл'), action: 'toggle_always_show' },
                { title: '──────────', separator: true },
                { title: '📌 Закладки', disabled: true },
                { title: (c.bookmarks_enabled ? '[OK]' : '[OFF]') + ' Закладки: ' + (c.bookmarks_enabled ? 'Вкл' : 'Выкл'), action: 'toggle_bookmarks' },
                { title: `📊 Всего закладок: ${bookmarksList.length}`, disabled: true },
                { title: '──────────', separator: true },
                { title: '☁️ GitHub Gist', action: 'gist' },
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
                } else if (item.action === 'toggle_auto_sync') {
                    c.auto_sync = !c.auto_sync;
                    saveCfg(c);
                    notify('Автосинхронизация ' + (c.auto_sync ? 'включена' : 'выключена'));
                    showMainMenu();
                } else if (item.action === 'toggle_auto_save') {
                    c.auto_save = !c.auto_save;
                    saveCfg(c);
                    notify('Автосохранение ' + (c.auto_save ? 'включено' : 'выключено'));
                    showMainMenu();
                } else if (item.action === 'toggle_always_show') {
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
                } else if (item.action === 'toggle_bookmarks') {
                    c.bookmarks_enabled = !c.bookmarks_enabled;
                    saveCfg(c);
                    if (c.bookmarks_enabled) {
                        addBookmarkButton();
                        renderBookmarks();
                        notify('Закладки включены');
                    } else {
                        $('[data-nsl-bookmark-add]').remove();
                        $('.nsl-bookmark-item').remove();
                        notify('Закладки выключены');
                    }
                    showMainMenu();
                } else if (item.action === 'gist') {
                    showGistSetup();
                } else if (item.action === 'cancel') {
                    Lampa.Controller.toggle('content');
                }
            },
            onBack: function() {
                Lampa.Controller.toggle('content');
            }
        });
    }

    function addSettingsButton() {
        if (!Lampa.SettingsApi) return;
        
        Lampa.SettingsApi.addComponent({
            component: 'nsl_sync',
            name: 'NSL Sync v' + SYNC_VERSION,
            icon: ICON_SYNC
        });
        
        Lampa.SettingsApi.addParam({
            component: 'nsl_sync',
            param: { name: 'open_menu', type: 'button' },
            field: { name: 'Открыть меню' },
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
            console.log('[NSL] Плагин выключен');
            return;
        }
        
        console.log('[NSL] 🚀 Запуск v' + SYNC_VERSION);
        
        // Загружаем закладки
        loadBookmarks();
        
        // Ждём полной загрузки Lampa
        setTimeout(() => {
            // Таймкоды
            if (c.always_show_timeline) enableAlwaysShowTimeline();
            protectedData = getFileView();
            initPlayerHandler();
            startBackgroundSync();
            
            // Закладки
            if (c.bookmarks_enabled) {
                addBookmarkButton();
                renderBookmarks();
            }
            
            // Автосинхронизация
            if (c.auto_sync) {
                setTimeout(() => syncNow(false), 3000);
            }
            
            console.log('[NSL] ✅ v' + SYNC_VERSION + ' загружен');
            notify('🚀 NSL Sync v' + SYNC_VERSION + ' загружен');
        }, 500);
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
