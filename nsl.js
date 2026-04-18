(function () {
    'use strict';

    if (window.nsl_sync_init) return;
    window.nsl_sync_init = true;

    // ============ КОНФИГУРАЦИЯ ============
    const CFG_KEY = 'nsl_sync_cfg';
    const SYNC_VERSION = 11;
    
    const STORAGE_KEYS = {
        sections: 'nsl_sections',
        favorites: 'nsl_favorites',
        history: 'nsl_history',
        timeline: 'nsl_timeline'
    };
    
    const GIST_FILES = {
        timeline: 'nsl_timeline.json',
        sections: 'nsl_sections.json',
        favorites: 'nsl_favorites.json',
        history: 'nsl_history.json',
        config: 'nsl_config.json'
    };
    
    // Категории избранного
    const FAVORITE_CATEGORIES = {
        'favorite':   { icon: '⭐', title: 'Избранное', color: '#FFD700' },
        'watching':   { icon: '👁️', title: 'Смотрю', color: '#2196F3' },
        'watchlist':  { icon: '📋', title: 'Буду смотреть', color: '#4CAF50' },
        'watched':    { icon: '✅', title: 'Просмотрено', color: '#9C27B0' },
        'dropped':    { icon: '❌', title: 'Брошено', color: '#F44336' },
        'collection': { icon: '📦', title: 'Коллекция', color: '#FF9800' }
    };
    
    // Папки избранного
    const FAVORITE_FOLDERS = {
        'movies':      { icon: '🎬', title: 'Фильмы', mediaType: 'movie' },
        'tv':          { icon: '📺', title: 'Сериалы', mediaType: 'tv' },
        'cartoons':    { icon: '🐭', title: 'Мультфильмы', mediaType: 'cartoon' },
        'cartoons_tv': { icon: '🐭📺', title: 'Мультсериалы', mediaType: 'cartoon_tv' },
        'anime':       { icon: '🇯🇵', title: 'Аниме', mediaType: 'anime' }
    };
    
    // Категории истории
    const HISTORY_FILTERS = {
        'all':       { icon: '📜', title: 'Вся история' },
        'movies':    { icon: '🎬', title: 'Фильмы' },
        'tv':        { icon: '📺', title: 'Сериалы' },
        'cartoons':  { icon: '🐭', title: 'Мультфильмы' },
        'cartoons_tv': { icon: '🐭📺', title: 'Мультсериалы' },
        'anime':     { icon: '🇯🇵', title: 'Аниме' }
    };

    // ============ СОСТОЯНИЕ ============
    let syncInProgress = false;
    let pendingSync = false;
    let currentMovieId = null;
    let currentMovieTime = 0;
    let autoSyncInterval = null;
    let playerCheckInterval = null;
    let lastPosition = 0;
    let endCreditsDetected = false;
    let styleInjected = false;
    let uiUpdateTimer = null;
    let isV3 = false;
    
    // Данные
    let sections = [];
    let favorites = [];
    let history = [];
    let timeline = {};
    let protectedTimeline = {};

    // ============ SVG ИКОНКИ ============
    const ICONS = {
        sync: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>',
        add: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>',
        sections: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/></svg>',
        favorite: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
        history: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>',
        collection: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16zM9 8h10v2H9zm0 4h10v2H9z"/></svg>',
        continue: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-.5-13v4l5 3-5 3v-4H9V7h2.5z"/></svg>'
    };

    // ============ КОНФИГУРАЦИЯ ============
    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            
            // Таймкоды
            auto_sync: true,
            auto_save: true,
            sync_interval: 30,
            always_show_timeline: true,
            timeline_position: 'bottom',
            sync_strategy: 'last_watch',
            cleanup_days: 30,
            cleanup_completed: true,
            
            // Закладки разделов
            sections_enabled: true,
            sections_button: 'side',
            
            // Избранное
            favorites_enabled: true,
            favorites_sync: true,
            auto_move_dropped: true,
            auto_move_dropped_days: 30,
            
            // История
            history_enabled: true,
            history_sync: true,
            
            // Продолжить просмотр
            continue_watching: true,
            continue_min_progress: 5,
            continue_max_progress: 95,
            
            // Gist
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform ? Lampa.Platform.get() : 'Unknown',
            manual_profile_id: '',
            
            // Импорт
            cub_import_done: false
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

    function getStorageKey(baseKey) {
        const profileId = getCurrentProfileId();
        return profileId ? `${baseKey}_${profileId}` : baseKey;
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
        if (!card) return {};
        
        const fields = [
            'id', 'title', 'name', 'original_title', 'original_name',
            'poster_path', 'backdrop_path', 'profile_path',
            'release_date', 'first_air_date', 'vote_average',
            'overview', 'genre_ids', 'genres', 'original_language',
            'origin_country', 'number_of_seasons', 'number_of_episodes',
            'source'
        ];
        
        const cleaned = {};
        fields.forEach(f => {
            if (typeof card[f] !== 'undefined' && card[f] !== null) {
                cleaned[f] = card[f];
            }
        });
        
        cleaned.source = card.source || getSource();
        
        return cleaned;
    }

    function detectMediaType(card) {
        if (!card) return 'movie';
        
        const isTV = !!(card.name || card.first_air_date || card.original_name);
        const genres = card.genres || card.genre_ids || [];
        
        const hasAnimation = genres.some(g => {
            const id = typeof g === 'object' ? g.id : g;
            return id === 16;
        });
        
        const isJapanese = Lampa.Utils.containsJapanese(card.original_name || card.name || '') 
                        || card.original_language === 'ja'
                        || (card.origin_country || []).includes('JP');
        
        if (isJapanese && hasAnimation) return 'anime';
        if (hasAnimation) return isTV ? 'cartoon_tv' : 'cartoon';
        if (isTV) return 'tv';
        return 'movie';
    }

    function generateUUID() {
        return 'nsl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function getCurrentMovieKey() {
        try {
            const activity = Lampa.Activity.active();
            if (!activity || !activity.movie) return null;
            
            const card = activity.movie;
            const tmdbId = card.tmdb_id || card.id;
            if (!tmdbId) return null;
            
            const playerData = Lampa.Player.playdata();
            if (playerData && playerData.path) {
                const url = playerData.path;
                const patterns = [/S(\d+)E(\d+)/i, /(\d+)x(\d+)/i];
                for (const pattern of patterns) {
                    const match = url.match(pattern);
                    if (match && match[1] && match[2]) {
                        return `${tmdbId}_s${match[1]}_e${match[2]}`;
                    }
                }
            }
            
            return String(tmdbId);
        } catch(e) {
            return null;
        }
    }

    // ============ ЗАГРУЗКА ДАННЫХ ============
    function loadSections() {
        sections = Lampa.Storage.get(getStorageKey(STORAGE_KEYS.sections), []);
        return sections;
    }

    function saveSections() {
        Lampa.Storage.set(getStorageKey(STORAGE_KEYS.sections), sections, true);
        renderSectionsMenu();
        if (cfg().auto_sync) syncSpecificFile('sections', sections);
    }

    function loadFavorites() {
        favorites = Lampa.Storage.get(getStorageKey(STORAGE_KEYS.favorites), []);
        return favorites;
    }

    function saveFavorites() {
        Lampa.Storage.set(getStorageKey(STORAGE_KEYS.favorites), favorites, true);
        if (cfg().favorites_sync) syncSpecificFile('favorites', favorites);
    }

    function loadHistory() {
        history = Lampa.Storage.get(getStorageKey(STORAGE_KEYS.history), []);
        return history;
    }

    function saveHistory() {
        Lampa.Storage.set(getStorageKey(STORAGE_KEYS.history), history, true);
        if (cfg().history_sync) syncSpecificFile('history', history);
    }

    function loadTimeline() {
        const key = getStorageKey(STORAGE_KEYS.timeline);
        timeline = Lampa.Storage.get(key, {});
        protectedTimeline = { ...timeline };
        return timeline;
    }

    function saveTimeline() {
        const key = getStorageKey(STORAGE_KEYS.timeline);
        Lampa.Storage.set(key, timeline, true);
        protectedTimeline = { ...timeline };
        if (cfg().auto_sync) syncSpecificFile('timeline', timeline);
    }

    // ============ ЗАКЛАДКИ РАЗДЕЛОВ ============
    function isSectionAllowed() {
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

    function makeSectionKey(act) {
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

    function sectionExists(act) {
        const key = makeSectionKey(act);
        return sections.some(s => s.key === key);
    }

    function addSection() {
        const act = Lampa.Activity.active();
        
        if (!isSectionAllowed()) {
            notify('⚠️ Здесь нельзя создать закладку');
            return;
        }
        
        if (sectionExists(act)) {
            notify('📌 Уже есть в закладках');
            return;
        }
        
        Lampa.Input.edit({
            title: 'Название закладки',
            value: act.title || act.name || 'Закладка'
        }, (val) => {
            if (!val) return;
            
            sections.push({
                id: generateUUID(),
                key: makeSectionKey(act),
                name: val.trim(),
                url: act.url,
                component: act.component || 'category_full',
                source: act.source || getSource(),
                id_person: act.id,
                job: act.job,
                genres: act.genres,
                params: act.params,
                page: act.page || 1,
                created: Date.now()
            });
            
            sections.sort((a, b) => b.created - a.created);
            saveSections();
            notify('✅ Закладка сохранена');
        });
    }

    function removeSection(item) {
        sections = sections.filter(s => s.id !== item.id);
        saveSections();
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

    function renderSectionsMenu() {
        $('.nsl-section-item, .nsl-menu-split-sections').remove();
        
        if (!cfg().sections_enabled || !sections.length) return;
        
        const root = $('.menu .menu__list').eq(0);
        if (!root.length) return;
        
        root.append('<li class="menu__split nsl-menu-split-sections"></li>');
        
        sections.slice(0, 20).forEach(item => {
            const el = $(`
                <li class="menu__item selector nsl-section-item">
                    <div class="menu__ico">${ICONS.sections}</div>
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
            
            root.append(el);
        });
    }

    function addSectionButton() {
        if (!cfg().sections_enabled) return;
        
        const c = cfg();
        
        setTimeout(() => {
            if (c.sections_button === 'top') {
                // В верхней панели
                const head = $('.head__actions, .head__buttons').first();
                if (!head.length) return;
                
                const btn = $(`
                    <div class="head__action selector" data-nsl-section-add>
                        <div class="head__action-ico">📌</div>
                    </div>
                `);
                
                btn.on('hover:enter', (e) => {
                    e.stopPropagation();
                    addSection();
                });
                
                head.prepend(btn);
            } else {
                // В боковом меню
                const menu = $('.menu .menu__list').eq(1); // Второй список (после основных)
                if (!menu.length) return;
                
                const btn = $(`
                    <li class="menu__item selector" data-nsl-section-add>
                        <div class="menu__ico">📌</div>
                        <div class="menu__text">Добавить закладку</div>
                    </li>
                `);
                
                btn.on('hover:enter', (e) => {
                    e.stopPropagation();
                    addSection();
                });
                
                menu.prepend(btn);
            }
        }, 1000);
    }

    // ============ ИЗБРАННОЕ ============
    function addToFavorites(card, category) {
        if (!card || !card.id) return false;
        
        const mediaType = detectMediaType(card);
        const existing = favorites.find(f => f.card_id === card.id && f.category === category);
        
        if (existing) {
            // Перемещаем в начало и обновляем время
            existing.updated = Date.now();
            favorites = favorites.filter(f => !(f.card_id === card.id && f.category === category));
            favorites.unshift(existing);
        } else {
            favorites.unshift({
                id: generateUUID(),
                card_id: card.id,
                tmdb_id: card.tmdb_id || card.id,
                media_type: mediaType,
                category: category,
                data: clearCard(card),
                added: Date.now(),
                updated: Date.now(),
                notes: '',
                rating: 0
            });
        }
        
        saveFavorites();
        notify(`✅ Добавлено в "${FAVORITE_CATEGORIES[category].title}"`);
        return true;
    }

    function removeFromFavorites(cardId, category) {
        favorites = favorites.filter(f => !(f.card_id === cardId && f.category === category));
        saveFavorites();
    }

    function isInFavorites(cardId, category) {
        return favorites.some(f => f.card_id === cardId && f.category === category);
    }

    function getFavoritesByFolder(folder) {
        const folderInfo = FAVORITE_FOLDERS[folder];
        if (!folderInfo) return [];
        
        return favorites
            .filter(f => f.media_type === folderInfo.mediaType)
            .sort((a, b) => b.updated - a.updated)
            .map(f => f.data);
    }

    function getFavoritesByCategory(category) {
        return favorites
            .filter(f => f.category === category)
            .sort((a, b) => b.updated - a.updated)
            .map(f => f.data);
    }

    function showFavoriteMenu(card) {
        const items = [];
        
        for (const cat in FAVORITE_CATEGORIES) {
            const info = FAVORITE_CATEGORIES[cat];
            const isAdded = isInFavorites(card.id, cat);
            
            items.push({
                title: `${info.icon} ${info.title}`,
                where: cat,
                checkbox: true,
                checked: isAdded,
                onSelect: () => {
                    if (isAdded) {
                        removeFromFavorites(card.id, cat);
                        notify(`Удалено из "${info.title}"`);
                    } else {
                        addToFavorites(card, cat);
                    }
                    Lampa.Controller.toggle('content');
                }
            });
        }
        
        Lampa.Select.show({
            title: 'Добавить в избранное',
            items: items,
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    function showFavoritesScreen() {
        // Сначала показываем папки (как в стандартном избранном Lampa)
        const items = [];
        
        for (const key in FAVORITE_FOLDERS) {
            const info = FAVORITE_FOLDERS[key];
            const count = favorites.filter(f => f.media_type === info.mediaType).length;
            
            if (count > 0 || true) { // Показываем даже пустые
                items.push({
                    title: `${info.icon} ${info.title}`,
                    count: count,
                    folder: key,
                    onSelect: () => {
                        Lampa.Activity.push({
                            url: '',
                            title: info.title,
                            component: 'category',
                            source: 'nsl_favorites',
                            folder: key,
                            page: 1
                        });
                    }
                });
            }
        }
        
        // Если нет папок, показываем сообщение
        if (items.length === 0) {
            Lampa.Activity.push({
                url: '',
                title: 'Моё избранное',
                component: 'category',
                source: 'nsl_favorites',
                folder: 'empty',
                page: 1
            });
            return;
        }
        
        // Используем стандартный компонент избранного Lampa
        Lampa.Activity.push({
            url: '',
            title: 'Моё избранное',
            component: 'favorite', // Стандартный компонент!
            source: 'nsl_favorites',
            folder: 'folders',
            page: 1
        });
    }

    // ============ ИСТОРИЯ ============
    function addToHistory(card, progress = {}) {
        if (!card || !card.id) return;
        
        const mediaType = detectMediaType(card);
        
        history.unshift({
            id: generateUUID(),
            card_id: card.id,
            tmdb_id: card.tmdb_id || card.id,
            media_type: mediaType,
            data: clearCard(card),
            watched_at: Date.now(),
            progress: progress
        });
        
        // Ограничиваем историю 500 записями
        if (history.length > 500) {
            history = history.slice(0, 500);
        }
        
        saveHistory();
    }

    function getHistoryByFilter(filter) {
        let filtered = history;
        
        if (filter !== 'all') {
            const filterInfo = HISTORY_FILTERS[filter];
            if (filterInfo) {
                filtered = history.filter(h => h.media_type === filter);
            }
        }
        
        return filtered.sort((a, b) => b.watched_at - a.watched_at).map(h => h.data);
    }

    function showHistoryScreen(filter) {
        const filterInfo = HISTORY_FILTERS[filter];
        if (!filterInfo) return;
        
        Lampa.Activity.push({
            url: '',
            title: filterInfo.title,
            component: 'category',
            source: 'nsl_history',
            filter: filter,
            page: 1
        });
    }

    // ============ ПРОДОЛЖИТЬ ПРОСМОТР ============
    function getContinueWatching() {
        const c = cfg();
        if (!c.continue_watching) return [];
        
        const result = [];
        const added = new Set();
        
        // Из таймлайна
        for (const key in timeline) {
            const record = timeline[key];
            const percent = record.p || record.percent || 0;
            
            if (percent >= c.continue_min_progress && percent <= c.continue_max_progress) {
                // Ищем карточку в избранном или истории
                const tmdbId = record.tmdb_id || key.split('_')[0];
                const favItem = favorites.find(f => String(f.tmdb_id) === String(tmdbId));
                
                if (favItem && !added.has(favItem.card_id)) {
                    result.push({
                        ...favItem.data,
                        progress: percent,
                        continue_time: record.t || record.time || 0
                    });
                    added.add(favItem.card_id);
                }
            }
        }
        
        // Из истории
        const lastWatched = {};
        history.forEach(h => {
            if (!lastWatched[h.card_id] || h.watched_at > lastWatched[h.card_id].watched_at) {
                lastWatched[h.card_id] = h;
            }
        });
        
        for (const cardId in lastWatched) {
            if (added.has(cardId)) continue;
            
            const h = lastWatched[cardId];
            const percent = h.progress?.percent || h.progress?.p || 0;
            
            if (percent >= c.continue_min_progress && percent <= c.continue_max_progress) {
                result.push({
                    ...h.data,
                    progress: percent,
                    continue_time: h.progress?.time || h.progress?.t || 0
                });
                added.add(cardId);
            }
        }
        
        return result.slice(0, 20);
    }

    function showContinueWatching() {
        const items = getContinueWatching();
        
        Lampa.Activity.push({
            url: '',
            title: 'Продолжить просмотр',
            component: 'category',
            source: 'nsl_continue',
            page: 1
        });
    }

    // ============ ТАЙМКОДЫ ============
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
        if (styleInjected) return;
        
        const style = document.createElement('style');
        style.id = 'nsl-timeline-styles';
        style.textContent = `
            .card .card-watched {
                display: block !important;
                opacity: 1 !important;
                visibility: visible !important;
                pointer-events: none;
                ${getPositionStyles()}
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
        const style = document.getElementById('nsl-timeline-styles');
        if (style) style.remove();
        styleInjected = false;
    }

    function forceUITimelineUpdate() {
        debounce(() => {
            if (Lampa.Timeline && Lampa.Timeline.read) {
                Lampa.Timeline.read(true);
            }
        }, 100);
    }

    function saveCurrentProgress(timeInSeconds, force = false) {
        const c = cfg();
        if (!c.auto_save && !force) return false;
        
        const movieKey = getCurrentMovieKey();
        if (!movieKey) return false;
        
        const currentTime = Math.floor(timeInSeconds);
        const savedTime = timeline[movieKey]?.time || 0;
        
        if (force || Math.abs(currentTime - savedTime) >= 10) {
            let duration = Lampa.Player.playdata()?.timeline?.duration || 0;
            if (duration === 0 && timeline[movieKey]?.duration > 0) {
                duration = timeline[movieKey].duration;
            }
            
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            
            timeline[movieKey] = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: Date.now()
            };
            
            saveTimeline();
            forceUITimelineUpdate();
            
            // Добавляем в историю при завершении
            if (percent >= 90) {
                const activity = Lampa.Activity.active();
                if (activity && activity.movie) {
                    addToHistory(activity.movie, { time: currentTime, percent, duration });
                }
            }
            
            return true;
        }
        return false;
    }

    function initPlayerHandler() {
        let lastSavedProgress = 0;
        let lastSyncToGist = 0;
        
        playerCheckInterval = setInterval(() => {
            const c = cfg();
            if (!c.enabled) return;
            
            if (Lampa.Player.opened()) {
                try {
                    const playerData = Lampa.Player.playdata();
                    if (playerData && playerData.timeline && playerData.timeline.time) {
                        const currentTime = playerData.timeline.time;
                        
                        if (c.auto_save && Math.floor(currentTime) - lastSavedProgress >= 10) {
                            if (saveCurrentProgress(currentTime)) {
                                lastSavedProgress = Math.floor(currentTime);
                                
                                const now = Date.now();
                                if (c.auto_sync && (now - lastSyncToGist) >= (c.sync_interval * 1000)) {
                                    syncAll();
                                    lastSyncToGist = now;
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

    // ============ АВТО-ПЕРЕМЕЩЕНИЕ В БРОШЕНО ============
    function checkAutoMoveToDropped() {
        const c = cfg();
        if (!c.auto_move_dropped) return;
        
        const now = Date.now();
        const cutoff = now - (c.auto_move_dropped_days * 24 * 60 * 60 * 1000);
        let changed = false;
        
        favorites.forEach(item => {
            if ((item.category === 'watching' || item.category === 'watchlist') && item.updated < cutoff) {
                const lastWatched = history
                    .filter(h => h.card_id === item.card_id)
                    .sort((a, b) => b.watched_at - a.watched_at)[0];
                
                if (!lastWatched || lastWatched.watched_at < cutoff) {
                    item.category = 'dropped';
                    item.updated = now;
                    changed = true;
                }
            }
        });
        
        if (changed) {
            saveFavorites();
        }
    }

    function startBackgroundTasks() {
        const c = cfg();
        
        setInterval(() => {
            if (!syncInProgress && c.auto_sync && c.enabled && !Lampa.Player.opened()) {
                syncAll();
                checkAutoMoveToDropped();
            }
        }, c.sync_interval * 1000);
    }

    // ============ СИНХРОНИЗАЦИЯ С GIST ============
    function getGistAuth() {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) return null;
        return { token: c.gist_token, id: c.gist_id };
    }

    function syncSpecificFile(fileType, data, showNotify = false) {
        const gist = getGistAuth();
        if (!gist) return;
        
        const files = {};
        files[GIST_FILES[fileType]] = { content: JSON.stringify(data, null, 2) };
        
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${gist.token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            data: JSON.stringify({ files }),
            success: () => {
                console.log(`[NSL] ${fileType} synced`);
                if (showNotify) notify(`✅ ${fileType} синхронизирован`);
            },
            error: (xhr) => {
                console.error(`[NSL] ${fileType} sync error:`, xhr);
                if (showNotify) notify(`❌ Ошибка синхронизации ${fileType}`);
            }
        });
    }

    function syncAll(showNotify = true) {
        const gist = getGistAuth();
        if (!gist) {
            if (showNotify) notify('⚠️ GitHub Gist не настроен');
            return;
        }
        
        if (syncInProgress) {
            pendingSync = true;
            return;
        }
        
        syncInProgress = true;
        if (showNotify) notify('🔄 Синхронизация...');
        
        // Сначала загружаем все данные
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${gist.token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: (response) => {
                let hasChanges = false;
                
                // Синхронизация каждого файла
                ['timeline', 'sections', 'favorites', 'history'].forEach(type => {
                    try {
                        const file = response.files[GIST_FILES[type]];
                        if (file && file.content) {
                            const remoteData = JSON.parse(file.content);
                            const localData = type === 'timeline' ? timeline : 
                                             type === 'sections' ? sections :
                                             type === 'favorites' ? favorites : history;
                            
                            // Простое слияние - более новые записи побеждают
                            if (type === 'timeline') {
                                for (const key in remoteData) {
                                    if (!timeline[key] || remoteData[key].updated > timeline[key].updated) {
                                        timeline[key] = remoteData[key];
                                        hasChanges = true;
                                    }
                                }
                            } else {
                                const merged = [...remoteData];
                                localData.forEach(local => {
                                    const existing = merged.find(r => r.id === local.id);
                                    if (!existing) {
                                        merged.push(local);
                                        hasChanges = true;
                                    } else if (local.updated > existing.updated || local.watched_at > existing.watched_at) {
                                        Object.assign(existing, local);
                                        hasChanges = true;
                                    }
                                });
                                
                                if (type === 'sections') sections = merged;
                                else if (type === 'favorites') favorites = merged;
                                else if (type === 'history') history = merged;
                            }
                        }
                    } catch(e) {
                        console.warn(`[NSL] Error parsing ${type}:`, e);
                    }
                });
                
                // Сохраняем локально
                if (hasChanges) {
                    saveTimeline();
                    saveSections();
                    saveFavorites();
                    saveHistory();
                    renderSectionsMenu();
                }
                
                // Отправляем локальные изменения
                const files = {};
                files[GIST_FILES.timeline] = { content: JSON.stringify(timeline, null, 2) };
                files[GIST_FILES.sections] = { content: JSON.stringify(sections, null, 2) };
                files[GIST_FILES.favorites] = { content: JSON.stringify(favorites, null, 2) };
                files[GIST_FILES.history] = { content: JSON.stringify(history, null, 2) };
                
                $.ajax({
                    url: `https://api.github.com/gists/${gist.id}`,
                    method: 'PATCH',
                    headers: {
                        'Authorization': `token ${gist.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    data: JSON.stringify({ files }),
                    success: () => {
                        if (showNotify) notify('✅ Синхронизация завершена');
                        syncInProgress = false;
                        if (pendingSync) {
                            pendingSync = false;
                            setTimeout(() => syncAll(false), 1000);
                        }
                    },
                    error: (xhr) => {
                        if (showNotify) notify('❌ Ошибка отправки: ' + xhr.status);
                        syncInProgress = false;
                    }
                });
            },
            error: (xhr) => {
                if (showNotify) notify('❌ Ошибка загрузки: ' + xhr.status);
                syncInProgress = false;
            }
        });
    }

    // ============ ИМПОРТ ИЗ CUB ============
    function importFromCUB() {
        const c = cfg();
        if (c.cub_import_done) return;
        
        Lampa.Select.show({
            title: 'Импорт из CUB',
            items: [
                { title: '📥 Импортировать закладки и историю из CUB?', disabled: true },
                { title: '──────────', separator: true },
                { title: '✅ Да, импортировать', action: 'import' },
                { title: '❌ Нет, пропустить', action: 'skip' }
            ],
            onSelect: (item) => {
                if (item.action === 'import') {
                    notify('🔄 Импорт из CUB...');
                    
                    try {
                        // Импорт закладок
                        const cubFavorites = Lampa.Storage.get('favorite', {});
                        let imported = 0;
                        
                        for (const type in cubFavorites) {
                            if (Array.isArray(cubFavorites[type])) {
                                cubFavorites[type].forEach(card => {
                                    if (!favorites.find(f => f.card_id === card.id)) {
                                        favorites.push({
                                            id: generateUUID(),
                                            card_id: card.id,
                                            tmdb_id: card.tmdb_id || card.id,
                                            media_type: detectMediaType(card),
                                            category: type === 'book' ? 'favorite' : 
                                                      type === 'like' ? 'favorite' :
                                                      type === 'wath' ? 'watchlist' :
                                                      type === 'history' ? 'watched' : 'favorite',
                                            data: clearCard(card),
                                            added: Date.now(),
                                            updated: Date.now(),
                                            notes: '',
                                            rating: 0
                                        });
                                        imported++;
                                    }
                                });
                            }
                        }
                        
                        saveFavorites();
                        notify(`✅ Импортировано ${imported} закладок`);
                    } catch(e) {
                        console.warn('[NSL] Import error:', e);
                        notify('❌ Ошибка импорта');
                    }
                    
                    c.cub_import_done = true;
                    saveCfg(c);
                } else {
                    c.cub_import_done = true;
                    saveCfg(c);
                }
                Lampa.Controller.toggle('content');
            },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    // ============ РЕГИСТРАЦИЯ ИСТОЧНИКОВ ДАННЫХ ============
// Регистрация источников - ИСПРАВЛЕНО
    function registerSources() {
        // Избранное
        Lampa.Api.sources.nsl_favorites = {
            category: function(params, oncomplite, onerror) {
                const folder = params.folder || 'movies';
                let data = [];
                
                if (folder === 'folders') {
                    // Возвращаем папки (как в bookmarks.js)
                    const folders = [];
                    for (const key in FAVORITE_FOLDERS) {
                        const info = FAVORITE_FOLDERS[key];
                        const count = favorites.filter(f => f.media_type === info.mediaType).length;
                        if (count > 0) {
                            folders.push({
                                id: key,
                                title: info.title,
                                count: count,
                                media: info.mediaType
                            });
                        }
                    }
                    data = folders;
                } else {
                    // Возвращаем карточки из папки
                    data = getFavoritesByFolder(folder);
                }
                
                const page = params.page || 1;
                const perPage = 20;
                
                oncomplite({
                    results: data.slice((page - 1) * perPage, page * perPage),
                    total_pages: Math.ceil(data.length / perPage),
                    page: page
                });
            },
            full: function(params, oncomplite, onerror) {
                Lampa.Api.sources.tmdb.full(params, oncomplite, onerror);
            }
        };
        
        // История
        Lampa.Api.sources.nsl_history = {
            category: function(params, oncomplite, onerror) {
                const filter = params.filter || 'all';
                const data = getHistoryByFilter(filter);
                
                const page = params.page || 1;
                const perPage = 20;
                
                oncomplite({
                    results: data.slice((page - 1) * perPage, page * perPage),
                    total_pages: Math.ceil(data.length / perPage),
                    page: page
                });
            },
            full: function(params, oncomplite, onerror) {
                Lampa.Api.sources.tmdb.full(params, oncomplite, onerror);
            }
        };
        
        // Продолжить просмотр
        Lampa.Api.sources.nsl_continue = {
            category: function(params, oncomplite, onerror) {
                const data = getContinueWatching();
                
                const page = params.page || 1;
                const perPage = 20;
                
                oncomplite({
                    results: data.slice((page - 1) * perPage, page * perPage),
                    total_pages: Math.ceil(data.length / perPage),
                    page: page
                });
            },
            full: function(params, oncomplite, onerror) {
                Lampa.Api.sources.tmdb.full(params, oncomplite, onerror);
            }
        };
    }

    // ============ БОКОВОЕ МЕНЮ ============
    function addMenuItems() {
        const c = cfg();
        
        // Ждём пока меню полностью отрисуется
        setTimeout(() => {
            const menuList = $('.menu .menu__list').eq(0);
            if (!menuList.length) return;
            
            // Удаляем старые пункты
            $('.nsl-menu-item, .nsl-menu-split').remove();
            
            // Добавляем разделитель
            menuList.append('<li class="menu__split nsl-menu-split"></li>');
            
            // Мои закладки (если есть)
            if (c.sections_enabled) {
                menuList.append(`
                    <li class="menu__item selector nsl-menu-item" data-nsl="sections">
                        <div class="menu__ico">📌</div>
                        <div class="menu__text">Мои закладки</div>
                    </li>
                `);
            }
            
            // Моё избранное
            if (c.favorites_enabled) {
                menuList.append(`
                    <li class="menu__item selector nsl-menu-item" data-nsl="favorites">
                        <div class="menu__ico">⭐</div>
                        <div class="menu__text">Моё избранное</div>
                    </li>
                `);
            }
            
            // Моя история
            if (c.history_enabled) {
                menuList.append(`
                    <li class="menu__item selector nsl-menu-item" data-nsl="history">
                        <div class="menu__ico">📜</div>
                        <div class="menu__text">Моя история</div>
                    </li>
                `);
            }
            
            // Коллекция
            if (c.favorites_enabled) {
                menuList.append(`
                    <li class="menu__item selector nsl-menu-item" data-nsl="collection">
                        <div class="menu__ico">📦</div>
                        <div class="menu__text">Коллекция</div>
                    </li>
                `);
            }
            
            // Продолжить просмотр
            if (c.continue_watching) {
                menuList.append(`
                    <li class="menu__item selector nsl-menu-item" data-nsl="continue">
                        <div class="menu__ico">⏱️</div>
                        <div class="menu__text">Продолжить</div>
                    </li>
                `);
            }
            
            // Обработчики
            $('[data-nsl="sections"]').off('hover:enter').on('hover:enter', function(e) {
                e.stopPropagation();
                if (sections.length === 1) {
                    openSection(sections[0]);
                } else if (sections.length > 1) {
                    showSectionsList();
                } else {
                    notify('📌 Нет сохранённых закладок');
                }
            });
            
            $('[data-nsl="favorites"]').off('hover:enter').on('hover:enter', function(e) {
                e.stopPropagation();
                showFavoritesScreen();
            });
            
            $('[data-nsl="history"]').off('hover:enter').on('hover:enter', function(e) {
                e.stopPropagation();
                showHistoryScreen('all');
            });
            
            $('[data-nsl="collection"]').off('hover:enter').on('hover:enter', function(e) {
                e.stopPropagation();
                showCollectionScreen();
            });
            
            $('[data-nsl="continue"]').off('hover:enter').on('hover:enter', function(e) {
                e.stopPropagation();
                showContinueWatching();
            });
            
        }, 1000);
    }

    function showSectionsList() {
        const items = sections.map(s => ({
            title: s.name,
            section: s,
            onSelect: () => openSection(s)
        }));
        
        Lampa.Select.show({
            title: 'Мои закладки',
            items: items,
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    function showFoldersMenu(type) {
        const items = [];
        const folders = type === 'favorites' ? FAVORITE_FOLDERS : HISTORY_FILTERS;
        
        for (const key in folders) {
            const info = folders[key];
            items.push({
                title: `${info.icon} ${info.title}`,
                folder: key,
                onSelect: () => {
                    if (type === 'favorites') {
                        showFavoritesScreen(key);
                    } else {
                        showHistoryScreen(key);
                    }
                }
            });
        }
        
        Lampa.Select.show({
            title: type === 'favorites' ? 'Моё избранное' : 'Моя история',
            items: items,
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    // ============ КНОПКА НА КАРТОЧКЕ ============
    function addFavoriteButton() {
        Lampa.Listener.follow('full', (e) => {
            if (e.type !== 'complite') return;
            
            const startComponent = e.link.items?.find(item => item.constructor.name === 'Start');
            if (!startComponent) return;
            
            const card = e.data.movie;
            const buttonsContainer = startComponent.html.find('.full-start-new__buttons');
            
            // Проверяем, не добавлена ли уже кнопка
            if (buttonsContainer.find('.nsl-favorite-btn').length) return;
            
            const btn = $(`
                <div class="full-start__button selector nsl-favorite-btn" data-action="favorite">
                    <div class="full-start__button-icon">⭐</div>
                    <div class="full-start__button-text">Добавить</div>
                </div>
            `);
            
            btn.on('hover:enter', () => showFavoriteMenu(card));
            
            // Вставляем первой
            buttonsContainer.prepend(btn);
        });
    }

    // ============ МЕНЮ НАСТРОЕК ============
    function getStats() {
        return {
            timeline: Object.keys(timeline).length,
            sections: sections.length,
            favorites: favorites.length,
            history: history.length,
            favoritesByCategory: FAVORITE_CATEGORIES,
            favoritesByFolder: FAVORITE_FOLDERS
        };
    }

    function showMainMenu() {
        const c = cfg();
        const stats = getStats();
        
        const items = [
            { title: (c.enabled ? '[OK]' : '[OFF]') + ' Плагин: ' + (c.enabled ? 'Вкл' : 'Выкл'), action: 'toggle_enabled' },
            { title: '──────────', separator: true },
            { title: '📌 Закладки разделов', disabled: true },
            { title: `   Всего: ${stats.sections}`, disabled: true },
            { title: '   Положение кнопки: ' + (c.sections_button === 'side' ? 'Боковое меню' : 'Верхняя панель'), action: 'sections_button' },
            { title: '   🗑️ Очистить все', action: 'clear_sections' },
            { title: '──────────', separator: true },
            { title: '⭐ Избранное', disabled: true },
            { title: `   Всего: ${stats.favorites}`, disabled: true },
            { title: '   🔄 Авто в Брошено: ' + (c.auto_move_dropped ? 'Вкл' : 'Выкл'), action: 'toggle_auto_dropped' },
            { title: '   📅 Дней до Брошено: ' + c.auto_move_dropped_days, action: 'set_dropped_days' },
            { title: '   🗑️ Очистить всё', action: 'clear_favorites' },
            { title: '──────────', separator: true },
            { title: '📜 История просмотров', disabled: true },
            { title: `   Всего: ${stats.history}`, disabled: true },
            { title: '   🗑️ Очистить историю', action: 'clear_history' },
            { title: '──────────', separator: true },
            { title: '⏱️ Таймкоды', disabled: true },
            { title: `   Всего: ${stats.timeline}`, disabled: true },
            { title: '   ' + (c.auto_save ? '[OK]' : '[OFF]') + ' Автосохранение: ' + (c.auto_save ? 'Вкл' : 'Выкл'), action: 'toggle_auto_save' },
            { title: '   ' + (c.auto_sync ? '[OK]' : '[OFF]') + ' Автосинхронизация: ' + (c.auto_sync ? 'Вкл' : 'Выкл'), action: 'toggle_auto_sync' },
            { title: '   ' + (c.always_show_timeline ? '[OK]' : '[OFF]') + ' Таймкоды на карточках: ' + (c.always_show_timeline ? 'Вкл' : 'Выкл'), action: 'toggle_timeline' },
            { title: '   🗑️ Очистить все', action: 'clear_timeline' },
            { title: '──────────', separator: true },
            { title: '⏱️ Продолжить просмотр', disabled: true },
            { title: '   ' + (c.continue_watching ? '[OK]' : '[OFF]') + ' Показывать: ' + (c.continue_watching ? 'Вкл' : 'Выкл'), action: 'toggle_continue' },
            { title: '   Мин. прогресс: ' + c.continue_min_progress + '%', action: 'set_min_progress' },
            { title: '   Макс. прогресс: ' + c.continue_max_progress + '%', action: 'set_max_progress' },
            { title: '──────────', separator: true },
            { title: '☁️ Синхронизация Gist', action: 'gist' },
            { title: '──────────', separator: true },
            { title: '🔄 Синхронизировать сейчас', action: 'sync_now' },
            { title: '❌ Закрыть', action: 'cancel' }
        ];
        
        Lampa.Select.show({
            title: 'NSL Sync v' + SYNC_VERSION,
            items: items,
            onSelect: (item) => {
                const c = cfg();
                
                if (item.action === 'toggle_enabled') {
                    c.enabled = !c.enabled;
                    saveCfg(c);
                    
                    if (c.enabled) {
                        startPlayerHandler();
                        startBackgroundTasks();
                        if (c.always_show_timeline) injectTimelineStyles();
                        addSectionButton();
                        addMenuItems();
                    } else {
                        stopPlayerHandler();
                        removeTimelineStyles();
                        $('[data-nsl-section-add]').remove();
                        $('.nsl-menu-item, .nsl-menu-split-main').remove();
                    }
                    
                    notify('Плагин ' + (c.enabled ? 'включён' : 'выключен'));
                    showMainMenu();
                } else if (item.action === 'toggle_auto_dropped') {
                    c.auto_move_dropped = !c.auto_move_dropped;
                    saveCfg(c);
                    notify('Авто в Брошено ' + (c.auto_move_dropped ? 'включено' : 'выключено'));
                    showMainMenu();
                } else if (item.action === 'set_dropped_days') {
                    Lampa.Input.edit({
                        title: 'Дней до Брошено',
                        value: String(c.auto_move_dropped_days),
                        free: true,
                        number: true
                    }, (val) => {
                        if (val && !isNaN(val) && val > 0) {
                            c.auto_move_dropped_days = parseInt(val);
                            saveCfg(c);
                        }
                        showMainMenu();
                    });
                } else if (item.action === 'clear_sections') {
                    sections = [];
                    saveSections();
                    renderSectionsMenu();
                    notify('✅ Закладки очищены');
                    showMainMenu();
                } else if (item.action === 'clear_favorites') {
                    favorites = [];
                    saveFavorites();
                    notify('✅ Избранное очищено');
                    showMainMenu();
                } else if (item.action === 'clear_history') {
                    history = [];
                    saveHistory();
                    notify('✅ История очищена');
                    showMainMenu();
                } else if (item.action === 'clear_timeline') {
                    timeline = {};
                    saveTimeline();
                    notify('✅ Таймкоды очищены');
                    showMainMenu();
                } else if (item.action === 'toggle_auto_save') {
                    c.auto_save = !c.auto_save;
                    saveCfg(c);
                    notify('Автосохранение ' + (c.auto_save ? 'включено' : 'выключено'));
                    showMainMenu();
                } else if (item.action === 'toggle_auto_sync') {
                    c.auto_sync = !c.auto_sync;
                    saveCfg(c);
                    notify('Автосинхронизация ' + (c.auto_sync ? 'включена' : 'выключена'));
                    showMainMenu();
                } else if (item.action === 'toggle_timeline') {
                    c.always_show_timeline = !c.always_show_timeline;
                    saveCfg(c);
                    if (c.always_show_timeline) {
                        injectTimelineStyles();
                    } else {
                        removeTimelineStyles();
                    }
                    notify('Таймкоды ' + (c.always_show_timeline ? 'показываются' : 'скрыты'));
                    showMainMenu();
                } else if (item.action === 'toggle_continue') {
                    c.continue_watching = !c.continue_watching;
                    saveCfg(c);
                    addMenuItems();
                    notify('Продолжить просмотр ' + (c.continue_watching ? 'включено' : 'выключено'));
                    showMainMenu();
                } else if (item.action === 'set_min_progress') {
                    Lampa.Input.edit({
                        title: 'Минимальный прогресс (%)',
                        value: String(c.continue_min_progress),
                        free: true,
                        number: true
                    }, (val) => {
                        if (val && !isNaN(val) && val >= 0 && val <= 100) {
                            c.continue_min_progress = parseInt(val);
                            saveCfg(c);
                        }
                        showMainMenu();
                    });
                } else if (item.action === 'set_max_progress') {
                    Lampa.Input.edit({
                        title: 'Максимальный прогресс (%)',
                        value: String(c.continue_max_progress),
                        free: true,
                        number: true
                    }, (val) => {
                        if (val && !isNaN(val) && val >= 0 && val <= 100) {
                            c.continue_max_progress = parseInt(val);
                            saveCfg(c);
                        }
                        showMainMenu();
                    });
                } else if (item.action === 'sections_button') {
                    Lampa.Select.show({
                        title: 'Положение кнопки',
                        items: [
                            { title: '📱 Боковое меню', action: 'side' },
                            { title: '⬆️ Верхняя панель', action: 'top' }
                        ],
                        onSelect: (sub) => {
                            c.sections_button = sub.action;
                            saveCfg(c);
                            $('[data-nsl-section-add]').remove();
                            addSectionButton();
                            showMainMenu();
                        },
                        onBack: () => showMainMenu()
                    });
                } else if (item.action === 'gist') {
                    showGistMenu();
                } else if (item.action === 'sync_now') {
                    Lampa.Controller.toggle('content');
                    syncAll(true);
                } else if (item.action === 'cancel') {
                    Lampa.Controller.toggle('content');
                }
            },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    function showGistMenu() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '☁️ GitHub Gist',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓ Установлен' : '❌ Не установлен'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0, 8) + '…' : '❌ Не установлен'}`, action: 'id' },
                { title: '──────────', separator: true },
                { title: '📤 Экспорт всех данных', action: 'export' },
                { title: '📥 Импорт из CUB', action: 'import_cub' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                const c = cfg();
                
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
                        showGistMenu();
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
                        showGistMenu();
                    });
                } else if (item.action === 'export') {
                    const data = { timeline, sections, favorites, history };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `nsl_backup_${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    notify('📤 Данные экспортированы');
                    showGistMenu();
                } else if (item.action === 'import_cub') {
                    importFromCUB();
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: () => showMainMenu()
        });
    }

    function addSettingsButton() {
        if (!Lampa.SettingsApi) return;
        
        Lampa.SettingsApi.addComponent({
            component: 'nsl_sync',
            name: 'NSL Sync v' + SYNC_VERSION,
            icon: ICONS.sync
        });
        
        Lampa.SettingsApi.addParam({
            component: 'nsl_sync',
            param: { name: 'open_menu', type: 'button' },
            field: { name: 'Открыть меню' },
            onChange: () => {
                if (Lampa.Controller && Lampa.Controller.toggle) {
                    Lampa.Controller.toggle('settings');
                }
                setTimeout(showMainMenu, 100);
            }
        });
    }

    // ============ ИНИЦИАЛИЗАЦИЯ ============
    function init() {
        isV3 = Lampa.Manifest && Lampa.Manifest.app_digital >= 300;
        
        // Загружаем данные
        loadSections();
        loadFavorites();
        loadHistory();
        loadTimeline();
        
        // Регистрируем источники
        registerSources();
        
        // Добавляем кнопку в настройки
        addSettingsButton();
        
        const c = cfg();
        if (!c.enabled) {
            console.log('[NSL] Плагин выключен');
            return;
        }
        
        console.log('[NSL] 🚀 Запуск v' + SYNC_VERSION);
        
        // Ждём полной загрузки Lampa
        setTimeout(() => {
            // Таймкоды
            if (c.always_show_timeline) injectTimelineStyles();
            initPlayerHandler();
            
            // Закладки разделов
            if (c.sections_enabled) {
                addSectionButton();
                renderSectionsMenu();
            }
            
            // Меню
            addMenuItems();
            
            // Кнопка на карточке
            if (c.favorites_enabled) {
                addFavoriteButton();
            }
            
            // Фоновые задачи
            startBackgroundTasks();
            
            // Импорт из CUB (если не делали)
            if (!c.cub_import_done && c.gist_token && c.gist_id) {
                setTimeout(() => importFromCUB(), 2000);
            }
            
            // Автосинхронизация при старте
            if (c.auto_sync) {
                setTimeout(() => syncAll(false), 3000);
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
