(function () {
    'use strict';

    if (window.nsl_sync_init) return;
    window.nsl_sync_init = true;

    const CFG_KEY = 'nsl_sync_cfg';
    const SYNC_VERSION = 12;
    
    // ============ СОСТОЯНИЕ ============
    let syncInProgress = false;
    let pendingSync = false;
    let currentMovieId = null;
    let currentMovieTime = 0;
    let currentMovieDuration = 0;
    let autoSyncInterval = null;
    let playerCheckInterval = null;
    let lastSavedProgress = 0;
    let lastSyncToGist = 0;
    let endCreditsDetected = false;
    let isV3 = false;
    let styleInjected = false;
    let uiUpdateTimer = null;
    let lastWatchedCard = null;
    
    let protectedData = {};
    let favoritesList = [];
    let historyList = [];
    let sectionsList = [];

    // ============ КОНСТАНТЫ ============
    const FAVORITE_TYPES = {
        'favorite': { icon: '⭐', title: 'Избранное', color: '#FFD700' },
        'watchlist': { icon: '📋', title: 'Буду смотреть', color: '#4CAF50' },
        'watching': { icon: '👁️', title: 'Смотрю', color: '#2196F3' },
        'viewed': { icon: '✅', title: 'Просмотрено', color: '#9E9E9E' },
        'dropped': { icon: '❌', title: 'Брошено', color: '#F44336' }
    };

    // ============ SVG ИКОНКИ ============
    const ICONS = {
        sync: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>',
        favorite: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
        history: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>',
        section: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/></svg>',
        add: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>',
        trash: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
        edit: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>'
    };

    // ============ КОНФИГУРАЦИЯ ============
    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            
            // Таймкоды
            auto_save: true,
            auto_sync: true,
            sync_interval: 30,
            sync_strategy: 'last_watch',
            cleanup_days: 30,
            cleanup_completed: true,
            end_credits_threshold: 180,
            always_show_timeline: true,
            timeline_position: 'bottom',
            
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

    function notify(text, timeout = 3000) {
        Lampa.Noty.show(text, timeout);
    }

    function debounce(func, wait) {
        clearTimeout(uiUpdateTimer);
        uiUpdateTimer = setTimeout(func, wait);
    }

    function generateUUID() {
        return 'nsl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ============ УТИЛИТЫ ============
    function getCurrentProfileId() {
        const c = cfg();
        if (c.manual_profile_id) return c.manual_profile_id;
        let profileId = Lampa.Storage.get('profile_id', '');
        if (profileId) return profileId;
        const accountUser = Lampa.Storage.get('account_user', {});
        if (accountUser.profile) return String(accountUser.profile);
        return 'default';
    }

    function getStorageKey(type) {
        const profileId = getCurrentProfileId();
        return `nsl_${type}_${profileId}`;
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

    function extractTmdbId(item) {
        if (!item) return null;
        if (item.tmdb_id) return String(item.tmdb_id);
        if (item.id && /^\d+$/.test(String(item.id))) return String(item.id);
        return null;
    }

    function getSeriesInfoFromUrl() {
        try {
            const playerData = Lampa.Player.playdata();
            if (playerData && playerData.path) {
                const url = playerData.path;
                const patterns = [/S(\d+)E(\d+)/i, /(\d+)x(\d+)/i, /Season[.\s]*(\d+)[.\s]*Episode[.\s]*(\d+)/i];
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
        if (seriesInfo) return `${tmdbId}_s${seriesInfo.season}_e${seriesInfo.episode}`;
        return tmdbId;
    }

    function getCurrentMovieTmdbId() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                const tmdbId = extractTmdbId(activity.movie);
                if (tmdbId) return tmdbId;
            }
            return currentMovieId;
        } catch(e) {
            return currentMovieId;
        }
    }

    function getCurrentMovieCard() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) return activity.movie;
            return null;
        } catch(e) {
            return null;
        }
    }

    function clearCardData(card) {
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
            media_type: card.original_name ? 'tv' : 'movie'
        };
    }

    function formatTime(seconds) {
        if (!seconds || seconds < 0) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    // ============ ЗАГРУЗКА ДАННЫХ ============
    function loadFavorites() {
        favoritesList = Lampa.Storage.get(getStorageKey('favorites'), []);
        return favoritesList;
    }

    function saveFavorites() {
        Lampa.Storage.set(getStorageKey('favorites'), favoritesList, true);
        if (cfg().auto_sync) setTimeout(() => syncNow(false), 1000);
    }

    function loadHistory() {
        historyList = Lampa.Storage.get(getStorageKey('history'), []);
        return historyList;
    }

    function saveHistory() {
        Lampa.Storage.set(getStorageKey('history'), historyList, true);
        if (cfg().auto_sync) setTimeout(() => syncNow(false), 1000);
    }

    function loadSections() {
        sectionsList = Lampa.Storage.get(getStorageKey('sections'), []);
        return sectionsList;
    }

    function saveSections() {
        Lampa.Storage.set(getStorageKey('sections'), sectionsList, true);
        if (cfg().auto_sync) setTimeout(() => syncNow(false), 1000);
    }

    // ============ ИЗБРАННОЕ ============
    function isInFavorites(cardId, type) {
        return favoritesList.some(f => f.card_id === cardId && f.type === type);
    }

    function getFavoriteStatus(cardId) {
        const status = {};
        Object.keys(FAVORITE_TYPES).forEach(type => {
            status[type] = isInFavorites(cardId, type);
        });
        return status;
    }

    function toggleFavorite(card, type) {
        const cardId = String(card.id);
        const existing = favoritesList.findIndex(f => f.card_id === cardId && f.type === type);
        
        if (existing !== -1) {
            favoritesList.splice(existing, 1);
            notify(`Удалено из "${FAVORITE_TYPES[type].title}"`);
        } else {
            // Удаляем другие статусы той же группы
            if (['watching', 'viewed', 'dropped'].includes(type)) {
                favoritesList = favoritesList.filter(f => 
                    !(f.card_id === cardId && ['watching', 'viewed', 'dropped'].includes(f.type))
                );
            }
            
            favoritesList.push({
                id: generateUUID(),
                card_id: cardId,
                type: type,
                data: clearCardData(card),
                added: Date.now(),
                notes: ''
            });
            notify(`Добавлено в "${FAVORITE_TYPES[type].title}"`);
        }
        
        saveFavorites();
        return !existing;
    }

    function showFavoriteMenu(card) {
        const cardId = String(card.id);
        const status = getFavoriteStatus(cardId);
        const items = [];
        
        // Категории избранного
        Object.entries(FAVORITE_TYPES).forEach(([type, info]) => {
            items.push({
                title: `${info.icon} ${info.title}`,
                checkbox: true,
                checked: status[type],
                type: type,
                color: info.color
            });
        });
        
        items.push({ title: '──────────', separator: true });
        items.push({ title: '📝 Добавить заметку', action: 'note' });
        items.push({ title: '❌ Закрыть', action: 'cancel' });
        
        Lampa.Select.show({
            title: card.title || card.name || 'Закладки',
            items: items,
            onSelect: (item) => {
                if (item.action === 'note') {
                    const existing = favoritesList.find(f => f.card_id === cardId);
                    Lampa.Input.edit({
                        title: 'Заметка',
                        value: existing?.notes || '',
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            const fav = favoritesList.find(f => f.card_id === cardId);
                            if (fav) {
                                fav.notes = val;
                                saveFavorites();
                                notify('✅ Заметка сохранена');
                            }
                        }
                    });
                } else if (item.action === 'cancel') {
                    Lampa.Controller.toggle('content');
                } else if (item.type) {
                    toggleFavorite(card, item.type);
                    setTimeout(() => showFavoriteMenu(card), 100);
                }
            },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    // ============ ИСТОРИЯ ============
    function addToHistory(card, progress = {}) {
        const cardId = String(card.id);
        
        // Удаляем старую запись если есть
        historyList = historyList.filter(h => h.card_id !== cardId);
        
        // Добавляем новую в начало
        historyList.unshift({
            id: generateUUID(),
            card_id: cardId,
            data: clearCardData(card),
            viewed_at: Date.now(),
            progress: progress
        });
        
        // Ограничиваем историю 100 записями
        if (historyList.length > 100) {
            historyList = historyList.slice(0, 100);
        }
        
        saveHistory();
    }

    // ============ РАЗДЕЛЫ (ЗАКЛАДКИ) ============
    function makeSectionKey(act) {
        return [
            act.url || '',
            act.component || '',
            JSON.stringify(act.genres || ''),
            JSON.stringify(act.params || '')
        ].join('|');
    }

    function isSectionAllowed() {
        const act = Lampa.Activity.active();
        if (!act) return false;
        if (act.component === 'actor' || act.component === 'person') return true;
        if (!act.url) return false;
        if (act.url === 'main' || act.url === 'feed') return false;
        return !!(act.genres || act.params || act.filter || act.url.indexOf('discover') !== -1);
    }

    function sectionExists(act) {
        const key = makeSectionKey(act);
        return sectionsList.some(s => s.key === key);
    }

    function addSection() {
        const act = Lampa.Activity.active();
        
        if (!isSectionAllowed()) {
            notify('⚠️ Этот раздел нельзя добавить в закладки');
            return;
        }
        
        if (sectionExists(act)) {
            notify('📌 Раздел уже в закладках');
            return;
        }
        
        Lampa.Input.edit({
            title: 'Название закладки',
            value: act.title || act.name || 'Закладка'
        }, (val) => {
            if (!val) return;
            
            sectionsList.push({
                id: generateUUID(),
                key: makeSectionKey(act),
                name: val.trim(),
                url: act.url,
                component: act.component || 'category_full',
                source: act.source || 'tmdb',
                id_person: act.id,
                job: act.job,
                genres: act.genres,
                params: act.params,
                page: act.page || 1,
                created: Date.now()
            });
            
            sectionsList.sort((a, b) => b.created - a.created);
            saveSections();
            renderSections();
            notify('✅ Раздел добавлен в закладки');
        });
    }

    function removeSection(item) {
        sectionsList = sectionsList.filter(s => s.id !== item.id);
        saveSections();
        renderSections();
        notify('🗑️ Закладка удалена');
    }

    function openSection(item) {
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

    // ============ РЕНДЕР МЕНЮ ============
    function renderSections() {
        $('.nsl-section-item').remove();
        
        const menuList = $('.menu__list').eq(0);
        if (!menuList.length) return;
        
        if (sectionsList.length > 0) {
            menuList.append('<li class="menu__split nsl-section-item"></li>');
        }
        
        sectionsList.slice(0, 20).forEach(item => {
            const el = $(`
                <li class="menu__item selector nsl-section-item">
                    <div class="menu__ico">${ICONS.section}</div>
                    <div class="menu__text">${item.name}</div>
                </li>
            `);
            
            el.on('hover:enter', (e) => {
                e.stopPropagation();
                openSection(item);
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
                        if (a.action === 'remove') removeSection(item);
                    },
                    onBack: () => Lampa.Controller.toggle('content')
                });
            });
            
            menuList.append(el);
        });
    }

    function addUIElements() {
        // Кнопка добавления раздела
        if (!$('[data-nsl-section-add]').length) {
            const menu = $('.menu .menu__list');
            if (menu.length) {
                const btn = $(`
                    <li class="menu__item selector" data-nsl-section-add>
                        <div class="menu__ico">${ICONS.add}</div>
                        <div class="menu__text">📌 В закладки</div>
                    </li>
                `);
                
                btn.on('hover:enter', (e) => {
                    e.stopPropagation();
                    addSection();
                });
                
                menu.eq(1).prepend(btn);
            }
        }
        
        // Кнопка на карточке фильма
        if (!window.nsl_card_button_added) {
            window.nsl_card_button_added = true;
            
            const originalFullCreate = Lampa.Maker?.map('Card')?.Full?.onCreate;
            if (originalFullCreate) {
                Lampa.Maker.map('Card').Full.onCreate = function() {
                    originalFullCreate.call(this);
                    
                    setTimeout(() => {
                        const buttons = this.html.find('.full-start__buttons');
                        if (buttons.length && !this.html.find('.nsl-favorite-btn').length) {
                            const btn = $(`
                                <div class="full-start__button selector nsl-favorite-btn">
                                    <div class="full-start__button-icon">⭐</div>
                                    <div class="full-start__button-text">В избранное</div>
                                </div>
                            `);
                            
                            btn.on('hover:enter', (e) => {
                                e.stopPropagation();
                                showFavoriteMenu(this.card);
                            });
                            
                            buttons.append(btn);
                        }
                    }, 100);
                };
            }
        }
    }

    // ============ ТАЙМКОДЫ ============
    function injectTimelineStyles() {
        if (styleInjected) return;
        
        const c = cfg();
        const pos = c.timeline_position || 'bottom';
        const styles = {
            bottom: `bottom: 2.5em !important; top: auto !important;`,
            center: `bottom: auto !important; top: 50% !important; transform: translateY(-50%) !important;`,
            top: `bottom: auto !important; top: 0.5em !important;`
        };
        
        const style = document.createElement('style');
        style.id = 'nsl-timeline-styles';
        style.textContent = `
            .card .card-watched {
                display: block !important;
                opacity: 1 !important;
                visibility: visible !important;
                pointer-events: none;
                ${styles[pos] || styles.bottom}
                left: 0.8em !important;
                right: 0.8em !important;
                z-index: 5 !important;
                background-color: rgba(0, 0, 0, 0.7) !important;
                backdrop-filter: blur(2px);
            }
            .card:not(.focus) .card-watched {
                display: block !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
        `;
        document.head.appendChild(style);
        styleInjected = true;
    }

    function removeTimelineStyles() {
        const style = document.getElementById('nsl-timeline-styles');
        if (style) style.remove();
        styleInjected = false;
    }

    function forceUITimelineUpdate() {
        debounce(() => {
            if (Lampa.Timeline?.read) Lampa.Timeline.read(true);
        }, 100);
    }

    function saveCurrentProgress(timeInSeconds, force = false) {
        const c = cfg();
        if (!c.auto_save && !force) return false;
        
        const movieKey = getCurrentMovieKey();
        if (!movieKey) return false;
        
        const fileView = getFileView();
        const currentTime = Math.floor(timeInSeconds);
        
        if (force || Math.abs(currentTime - lastSavedProgress) >= 10) {
            const duration = currentMovieDuration || Lampa.Player.playdata()?.timeline?.duration || 0;
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            const seriesInfo = getSeriesInfoFromUrl();
            
            fileView[movieKey] = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: Date.now(),
                ...(seriesInfo && { season: seriesInfo.season, episode: seriesInfo.episode })
            };
            
            protectedData[movieKey] = fileView[movieKey];
            setFileView(fileView);
            lastSavedProgress = currentTime;
            
            forceUITimelineUpdate();
            
            // Добавляем в историю при 5% просмотра
            const card = getCurrentMovieCard();
            if (card && percent >= 5 && lastWatchedCard?.id !== card.id) {
                lastWatchedCard = card;
                addToHistory(card, {
                    time: currentTime,
                    percent: percent,
                    ...seriesInfo
                });
            }
            
            return true;
        }
        return false;
    }

    function initPlayerHandler() {
        playerCheckInterval = setInterval(() => {
            const c = cfg();
            if (!c.enabled) return;
            
            if (Lampa.Player.opened()) {
                try {
                    const playerData = Lampa.Player.playdata();
                    if (playerData?.timeline) {
                        const time = playerData.timeline.time;
                        const duration = playerData.timeline.duration;
                        
                        if (time !== undefined) {
                            currentMovieTime = time;
                            currentMovieDuration = duration;
                            
                            const movieId = getCurrentMovieTmdbId();
                            if (movieId) {
                                currentMovieId = movieId;
                                
                                if (c.auto_save) {
                                    saveCurrentProgress(time);
                                }
                                
                                const now = Date.now();
                                if (c.auto_sync && (now - lastSyncToGist) >= (c.sync_interval * 1000)) {
                                    syncNow(false);
                                    lastSyncToGist = now;
                                }
                            }
                        }
                    }
                } catch(e) {}
            }
        }, 1000);
    }

    // ============ СИНХРОНИЗАЦИЯ С GIST ============
    function getGistAuth() {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) return null;
        return { token: c.gist_token, id: c.gist_id };
    }

    function syncNow(showNotify = true, callback = null) {
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
            success: (response) => {
                try {
                    const content = response.files['lampa_sync.json']?.content;
                    let remoteData = { timeline: {}, favorites: [], history: [], sections: [] };
                    
                    if (content) remoteData = JSON.parse(content);
                    
                    const c = cfg();
                    const strategy = c.sync_strategy;
                    let hasChanges = false;
                    
                    // Таймкоды
                    const localTimeline = getFileView();
                    const remoteTimeline = remoteData.timeline || {};
                    const mergedTimeline = { ...remoteTimeline };
                    
                    for (const key in localTimeline) {
                        const local = localTimeline[key];
                        const remote = remoteTimeline[key];
                        
                        if (!remote) {
                            mergedTimeline[key] = local;
                            hasChanges = true;
                        } else {
                            const localTime = local.time || 0;
                            const remoteTime = remote.time || 0;
                            const localUpdated = local.updated || 0;
                            const remoteUpdated = remote.updated || 0;
                            
                            if (strategy === 'max_time' ? localTime > remoteTime : localUpdated > remoteUpdated) {
                                mergedTimeline[key] = local;
                                hasChanges = true;
                            }
                        }
                    }
                    
                    setFileView(mergedTimeline);
                    
                    // Избранное
                    const remoteFavorites = remoteData.favorites || [];
                    const mergedFavorites = [...remoteFavorites];
                    
                    favoritesList.forEach(local => {
                        const exists = mergedFavorites.find(r => r.card_id === local.card_id && r.type === local.type);
                        if (!exists) {
                            mergedFavorites.push(local);
                            hasChanges = true;
                        } else if (local.added > exists.added) {
                            Object.assign(exists, local);
                            hasChanges = true;
                        }
                    });
                    
                    favoritesList = mergedFavorites;
                    saveFavorites();
                    
                    // История
                    const remoteHistory = remoteData.history || [];
                    const mergedHistory = [...remoteHistory];
                    
                    historyList.forEach(local => {
                        if (!mergedHistory.find(r => r.card_id === local.card_id)) {
                            mergedHistory.push(local);
                            hasChanges = true;
                        }
                    });
                    
                    historyList = mergedHistory.sort((a, b) => b.viewed_at - a.viewed_at);
                    saveHistory();
                    
                    // Разделы
                    const remoteSections = remoteData.sections || [];
                    const mergedSections = [...remoteSections];
                    
                    sectionsList.forEach(local => {
                        if (!mergedSections.find(r => r.key === local.key)) {
                            mergedSections.push(local);
                            hasChanges = true;
                        }
                    });
                    
                    sectionsList = mergedSections.sort((a, b) => b.created - a.created);
                    saveSections();
                    renderSections();
                    
                    if (hasChanges) {
                        const dataToSend = {
                            version: SYNC_VERSION,
                            profile_id: getCurrentProfileId(),
                            device: c.device_name,
                            updated: Date.now(),
                            timeline: mergedTimeline,
                            favorites: favoritesList,
                            history: historyList,
                            sections: sectionsList
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
                            success: () => {
                                if (showNotify) notify('✅ Синхронизация завершена');
                                syncInProgress = false;
                                if (pendingSync) {
                                    pendingSync = false;
                                    setTimeout(() => syncNow(false, callback), 1000);
                                } else if (callback) callback(true);
                                forceUITimelineUpdate();
                            },
                            error: (xhr) => {
                                console.error('[NSL] Sync error:', xhr);
                                if (showNotify) notify('❌ Ошибка: ' + xhr.status);
                                syncInProgress = false;
                                if (callback) callback(false);
                            }
                        });
                    } else {
                        if (showNotify) notify('✅ Данные актуальны');
                        syncInProgress = false;
                        if (callback) callback(true);
                    }
                } catch(e) {
                    console.error('[NSL] Parse error:', e);
                    if (showNotify) notify('❌ Ошибка данных');
                    syncInProgress = false;
                    if (callback) callback(false);
                }
            },
            error: (xhr) => {
                console.error('[NSL] Load error:', xhr);
                if (showNotify) notify('❌ Ошибка: ' + xhr.status);
                syncInProgress = false;
                if (callback) callback(false);
            }
        });
    }

    function startBackgroundSync() {
        if (autoSyncInterval) clearInterval(autoSyncInterval);
        const c = cfg();
        autoSyncInterval = setInterval(() => {
            if (!syncInProgress && c.auto_sync && c.enabled && !Lampa.Player.opened()) {
                syncNow(false);
            }
        }, c.sync_interval * 1000);
    }

    // ============ МЕНЮ НАСТРОЕК ============
    function showGistSettings() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '☁️ GitHub Gist',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓ Установлен' : '❌ Не установлен'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0, 8) + '…' : '❌ Не установлен'}`, action: 'id' },
                { title: '──────────', separator: true },
                { title: '📤 Выгрузить сейчас', action: 'upload' },
                { title: '📥 Загрузить сейчас', action: 'download' },
                { title: '──────────', separator: true },
                { title: '🗑️ Очистить все данные', action: 'clear_all' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'token') {
                    Lampa.Input.edit({
                        title: 'GitHub Token',
                        value: c.gist_token,
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.gist_token = val || '';
                            saveCfg(c);
                            notify('✅ Токен сохранён');
                        }
                        showGistSettings();
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
                        showGistSettings();
                    });
                } else if (item.action === 'upload') {
                    Lampa.Controller.toggle('content');
                    syncNow(true);
                } else if (item.action === 'download') {
                    Lampa.Controller.toggle('content');
                    syncNow(true);
                } else if (item.action === 'clear_all') {
                    Lampa.Select.show({
                        title: 'Очистить ВСЕ данные?',
                        items: [
                            { title: '❌ Нет', action: 'cancel' },
                            { title: '✅ Да, очистить', action: 'confirm' }
                        ],
                        onSelect: (a) => {
                            if (a.action === 'confirm') {
                                setFileView({});
                                favoritesList = [];
                                historyList = [];
                                sectionsList = [];
                                saveFavorites();
                                saveHistory();
                                saveSections();
                                renderSections();
                                notify('🗑️ Все данные очищены');
                            }
                            showGistSettings();
                        },
                        onBack: () => showGistSettings()
                    });
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: () => showMainMenu()
        });
    }

    function showTimelineSettings() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '⏱️ Таймкоды',
            items: [
                { title: (c.auto_save ? '[OK]' : '[OFF]') + ' Автосохранение', action: 'auto_save' },
                { title: (c.always_show_timeline ? '[OK]' : '[OFF]') + ' Показывать на карточках', action: 'always_show' },
                { title: `📊 Позиция: ${c.timeline_position === 'bottom' ? 'Снизу' : c.timeline_position === 'center' ? 'По центру' : 'Сверху'}`, action: 'position' },
                { title: `🔄 Стратегия: ${c.sync_strategy === 'max_time' ? 'По времени' : 'По дате'}`, action: 'strategy' },
                { title: `⏰ Интервал синхр.: ${c.sync_interval} сек`, action: 'interval' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'auto_save') {
                    c.auto_save = !c.auto_save;
                    saveCfg(c);
                    showTimelineSettings();
                } else if (item.action === 'always_show') {
                    c.always_show_timeline = !c.always_show_timeline;
                    saveCfg(c);
                    c.always_show_timeline ? injectTimelineStyles() : removeTimelineStyles();
                    showTimelineSettings();
                } else if (item.action === 'position') {
                    Lampa.Select.show({
                        title: 'Позиция таймкода',
                        items: [
                            { title: '⬇️ Снизу', action: 'bottom' },
                            { title: '📍 По центру', action: 'center' },
                            { title: '⬆️ Сверху', action: 'top' }
                        ],
                        onSelect: (s) => {
                            c.timeline_position = s.action;
                            saveCfg(c);
                            removeTimelineStyles();
                            injectTimelineStyles();
                            showTimelineSettings();
                        },
                        onBack: () => showTimelineSettings()
                    });
                } else if (item.action === 'strategy') {
                    c.sync_strategy = c.sync_strategy === 'max_time' ? 'last_watch' : 'max_time';
                    saveCfg(c);
                    showTimelineSettings();
                } else if (item.action === 'interval') {
                    Lampa.Input.edit({
                        title: 'Интервал (сек)',
                        value: String(c.sync_interval),
                        free: true,
                        number: true
                    }, (val) => {
                        if (val && !isNaN(val) && val >= 10) {
                            c.sync_interval = parseInt(val);
                            saveCfg(c);
                            stopBackgroundSync();
                            startBackgroundSync();
                        }
                        showTimelineSettings();
                    });
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: () => showMainMenu()
        });
    }

    function showMainMenu() {
        const c = cfg();
        const stats = {
            favorites: favoritesList.length,
            history: historyList.length,
            sections: sectionsList.length,
            timeline: Object.keys(getFileView()).length
        };
        
        Lampa.Select.show({
            title: 'NSL Sync v' + SYNC_VERSION,
            items: [
                { title: (c.enabled ? '✅' : '❌') + ' Плагин: ' + (c.enabled ? 'Вкл' : 'Выкл'), action: 'toggle_enabled' },
                { title: '──────────', separator: true },
                { title: `⭐ Избранное (${stats.favorites})`, action: 'favorites_menu' },
                { title: `📜 История (${stats.history})`, action: 'history_menu' },
                { title: `📌 Закладки разделов (${stats.sections})`, action: 'sections_menu' },
                { title: `⏱️ Таймкоды (${stats.timeline})`, action: 'timeline_settings' },
                { title: '──────────', separator: true },
                { title: '☁️ GitHub Gist', action: 'gist_settings' },
                { title: '🔄 Синхронизировать', action: 'sync_now' },
                { title: '──────────', separator: true },
                { title: '❌ Закрыть', action: 'cancel' }
            ],
            onSelect: (item) => {
                if (item.action === 'toggle_enabled') {
                    c.enabled = !c.enabled;
                    saveCfg(c);
                    if (c.enabled) {
                        init();
                    } else {
                        location.reload();
                    }
                    showMainMenu();
                } else if (item.action === 'timeline_settings') {
                    showTimelineSettings();
                } else if (item.action === 'gist_settings') {
                    showGistSettings();
                } else if (item.action === 'sync_now') {
                    Lampa.Controller.toggle('content');
                    syncNow(true);
                } else if (item.action === 'favorites_menu') {
                    showFavoritesList();
                } else if (item.action === 'history_menu') {
                    showHistoryList();
                } else if (item.action === 'sections_menu') {
                    showSectionsList();
                } else if (item.action === 'cancel') {
                    Lampa.Controller.toggle('content');
                }
            },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    function showFavoritesList() {
        const items = Object.entries(FAVORITE_TYPES).map(([type, info]) => {
            const count = favoritesList.filter(f => f.type === type).length;
            return { title: `${info.icon} ${info.title} (${count})`, action: type };
        });
        
        items.push({ title: '──────────', separator: true });
        items.push({ title: '◀ Назад', action: 'back' });
        
        Lampa.Select.show({
            title: '⭐ Избранное',
            items: items,
            onSelect: (item) => {
                if (item.action === 'back') {
                    showMainMenu();
                } else {
                    showFavoritesByType(item.action);
                }
            },
            onBack: () => showMainMenu()
        });
    }

    function showFavoritesByType(type) {
        const filtered = favoritesList.filter(f => f.type === type);
        const items = filtered.map(f => ({
            title: f.data.title || f.data.name || 'Без названия',
            card: f.data
        }));
        
        items.push({ title: '──────────', separator: true });
        items.push({ title: '◀ Назад', action: 'back' });
        
        Lampa.Select.show({
            title: FAVORITE_TYPES[type].title,
            items: items,
            onSelect: (item) => {
                if (item.action === 'back') {
                    showFavoritesList();
                } else if (item.card) {
                    Lampa.Activity.push({
                        url: '',
                        component: 'full',
                        id: item.card.id,
                        card: item.card
                    });
                }
            },
            onBack: () => showFavoritesList()
        });
    }

    function showHistoryList() {
        const items = historyList.map(h => ({
            title: h.data.title || h.data.name || 'Без названия',
            card: h.data
        }));
        
        items.push({ title: '──────────', separator: true });
        items.push({ title: '🗑️ Очистить историю', action: 'clear' });
        items.push({ title: '◀ Назад', action: 'back' });
        
        Lampa.Select.show({
            title: '📜 История',
            items: items,
            onSelect: (item) => {
                if (item.action === 'back') {
                    showMainMenu();
                } else if (item.action === 'clear') {
                    historyList = [];
                    saveHistory();
                    notify('История очищена');
                    showMainMenu();
                } else if (item.card) {
                    Lampa.Activity.push({
                        url: '',
                        component: 'full',
                        id: item.card.id,
                        card: item.card
                    });
                }
            },
            onBack: () => showMainMenu()
        });
    }

    function showSectionsList() {
        const items = sectionsList.map(s => ({
            title: s.name,
            section: s
        }));
        
        items.push({ title: '──────────', separator: true });
        items.push({ title: '🗑️ Очистить все', action: 'clear' });
        items.push({ title: '◀ Назад', action: 'back' });
        
        Lampa.Select.show({
            title: '📌 Закладки разделов',
            items: items,
            onSelect: (item) => {
                if (item.action === 'back') {
                    showMainMenu();
                } else if (item.action === 'clear') {
                    sectionsList = [];
                    saveSections();
                    renderSections();
                    notify('Закладки очищены');
                    showMainMenu();
                } else if (item.section) {
                    openSection(item.section);
                }
            },
            onBack: () => showMainMenu()
        });
    }

    function addSettingsButton() {
        if (!Lampa.SettingsApi) return;
        
        Lampa.SettingsApi.addComponent({
            component: 'nsl_sync',
            name: 'NSL Sync',
            icon: ICONS.sync
        });
        
        Lampa.SettingsApi.addParam({
            component: 'nsl_sync',
            param: { name: 'open_menu', type: 'button' },
            field: { name: 'Открыть меню' },
            onChange: () => {
                if (Lampa.Controller?.toggle) {
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
        
        // Загружаем данные
        loadFavorites();
        loadHistory();
        loadSections();
        
        setTimeout(() => {
            // UI элементы
            addUIElements();
            renderSections();
            
            // Таймкоды
            protectedData = getFileView();
            if (c.always_show_timeline) injectTimelineStyles();
            initPlayerHandler();
            startBackgroundSync();
            
            // Автосинхронизация
            if (c.auto_sync) {
                setTimeout(() => syncNow(false), 3000);
            }
            
            console.log('[NSL] ✅ Загружено');
            notify('🚀 NSL Sync v' + SYNC_VERSION + ' загружен');
        }, 500);
    }

    // Запуск
    if (window.Lampa && Lampa.Listener) {
        if (window.appready) init();
        else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') init(); });
    } else {
        setTimeout(() => {
            if (window.Lampa && Lampa.Listener) {
                if (window.appready) init();
                else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') init(); });
            }
        }, 100);
    }
})();
