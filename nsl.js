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
        history: 'nsl_history.json'
    };
    
    // Категории избранного
    const FAVORITE_CATEGORIES = {
        'favorite':   { icon: '⭐', title: 'Избранное' },
        'watching':   { icon: '👁️', title: 'Смотрю' },
        'watchlist':  { icon: '📋', title: 'Буду смотреть' },
        'watched':    { icon: '✅', title: 'Просмотрено' },
        'dropped':    { icon: '❌', title: 'Брошено' },
        'collection': { icon: '📦', title: 'Коллекция' }
    };
    
    // Папки избранного (как в Lampa)
    const FAVORITE_FOLDERS = [
        { id: 'movies', icon: '🎬', title: 'Фильмы', mediaType: 'movie' },
        { id: 'tv', icon: '📺', title: 'Сериалы', mediaType: 'tv' },
        { id: 'cartoons', icon: '🐭', title: 'Мультфильмы', mediaType: 'cartoon' },
        { id: 'cartoons_tv', icon: '🐭📺', title: 'Мультсериалы', mediaType: 'cartoon_tv' },
        { id: 'anime', icon: '🇯🇵', title: 'Аниме', mediaType: 'anime' }
    ];
    
    // Категории истории
    const HISTORY_FILTERS = [
        { id: 'all', icon: '📜', title: 'Вся история' },
        { id: 'movies', icon: '🎬', title: 'Фильмы' },
        { id: 'tv', icon: '📺', title: 'Сериалы' },
        { id: 'cartoons', icon: '🐭', title: 'Мультфильмы' },
        { id: 'cartoons_tv', icon: '🐭📺', title: 'Мультсериалы' },
        { id: 'anime', icon: '🇯🇵', title: 'Аниме' }
    ];

    // ============ СОСТОЯНИЕ ============
    let sections = [];
    let favorites = [];
    let history = [];
    let timeline = {};
    
    let syncInProgress = false;
    let pendingSync = false;
    let playerCheckInterval = null;
    let autoSyncInterval = null;
    let uiUpdateTimer = null;
    let styleInjected = false;
    let currentMovieTime = 0;
    let lastSavedProgress = 0;

    // ============ УТИЛИТЫ ============
    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            // Таймкоды
            auto_save: true,
            auto_sync: true,
            sync_interval: 30,
            always_show_timeline: true,
            timeline_position: 'bottom',
            sync_strategy: 'last_watch',
            cleanup_days: 30,
            cleanup_completed: true,
            // Закладки разделов
            sections_enabled: true,
            sections_button: 'side', // 'side' или 'top'
            // Избранное
            favorites_enabled: true,
            auto_move_dropped: false,
            auto_move_dropped_days: 30,
            // История
            history_enabled: true,
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
        if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}`;
        return `${minutes}`;
    }

    function clearCard(card) {
        if (!card) return {};
        return {
            id: card.id,
            title: card.title || card.name,
            original_title: card.original_title,
            original_name: card.original_name,
            poster_path: card.poster_path,
            backdrop_path: card.backdrop_path,
            release_date: card.release_date || card.first_air_date,
            vote_average: card.vote_average,
            overview: card.overview,
            genre_ids: card.genre_ids,
            genres: card.genres,
            original_language: card.original_language,
            origin_country: card.origin_country,
            number_of_seasons: card.number_of_seasons,
            number_of_episodes: card.number_of_episodes,
            source: card.source || getSource()
        };
    }

    function detectMediaType(card) {
        if (!card) return 'movie';
        const isTV = !!(card.name || card.first_air_date || card.original_name);
        const genres = card.genres || card.genre_ids || [];
        const hasAnimation = genres.some(g => {
            const id = typeof g === 'object' ? g.id : g;
            return id === 16;
        });
        const isJapanese = (card.original_language === 'ja') || (card.origin_country || []).includes('JP');
        if (isJapanese && hasAnimation) return 'anime';
        if (hasAnimation) return isTV ? 'cartoon_tv' : 'cartoon';
        if (isTV) return 'tv';
        return 'movie';
    }

    function generateId() {
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
                const match = url.match(/S(\d+)E(\d+)/i) || url.match(/(\d+)x(\d+)/i);
                if (match) return `${tmdbId}_s${match[1]}_e${match[2]}`;
            }
            return String(tmdbId);
        } catch(e) {
            return null;
        }
    }

    function debounce(func, wait) {
        clearTimeout(uiUpdateTimer);
        uiUpdateTimer = setTimeout(func, wait);
    }

    // ============ ЗАГРУЗКА ДАННЫХ ============
    function loadSections() {
        sections = Lampa.Storage.get(getStorageKey(STORAGE_KEYS.sections), []);
        return sections;
    }

    function saveSections() {
        Lampa.Storage.set(getStorageKey(STORAGE_KEYS.sections), sections, true);
        renderSectionsMenu();
        if (cfg().auto_sync) syncFile('sections', sections);
    }

    function loadFavorites() {
        favorites = Lampa.Storage.get(getStorageKey(STORAGE_KEYS.favorites), []);
        return favorites;
    }

    function saveFavorites() {
        Lampa.Storage.set(getStorageKey(STORAGE_KEYS.favorites), favorites, true);
        if (cfg().auto_sync) syncFile('favorites', favorites);
    }

    function loadHistory() {
        history = Lampa.Storage.get(getStorageKey(STORAGE_KEYS.history), []);
        return history;
    }

    function saveHistory() {
        Lampa.Storage.set(getStorageKey(STORAGE_KEYS.history), history, true);
        if (cfg().auto_sync) syncFile('history', history);
    }

    function loadTimeline() {
        timeline = Lampa.Storage.get(getStorageKey(STORAGE_KEYS.timeline), {});
        return timeline;
    }

    function saveTimeline() {
        Lampa.Storage.set(getStorageKey(STORAGE_KEYS.timeline), timeline, true);
        if (cfg().auto_sync) syncFile('timeline', timeline);
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
        return !!(act.params || act.genres || act.sort || act.filter) || 
               (act.url.indexOf('discover') !== -1 && act.url.indexOf('?') !== -1);
    }

    function makeSectionKey(act) {
        return [
            act.url || '',
            act.component || '',
            act.source || '',
            act.id || '',
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
            sections.unshift({
                id: generateId(),
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
            if (sections.length > 50) sections = sections.slice(0, 50);
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
        $('.nsl-section-item, .nsl-split-sections').remove();
        if (!cfg().sections_enabled || !sections.length) return;
        const menuList = $('.menu__list').eq(0);
        if (!menuList.length) return;
        menuList.append('<li class="menu__split nsl-split-sections"></li>');
        sections.slice(0, 10).forEach(item => {
            const el = $(`<li class="menu__item selector nsl-section-item"><div class="menu__ico">📌</div><div class="menu__text">${item.name}</div></li>`);
            el.on('hover:enter', (e) => { e.stopPropagation(); openSection(item); });
            el.on('hover:long', (e) => {
                e.stopPropagation();
                Lampa.Select.show({
                    title: `Удалить "${item.name}"?`,
                    items: [{ title: '✅ Да', action: 'remove' }, { title: '❌ Нет', action: 'cancel' }],
                    onSelect: (a) => { if (a.action === 'remove') removeSection(item); }
                });
            });
            menuList.append(el);
        });
    }

    function addSectionButton() {
        if (!cfg().sections_enabled) return;
        const c = cfg();
        if (c.sections_button === 'top') {
            if (!Lampa.Head) return;
            Lampa.Head.addIcon('<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/></svg>', addSection);
        } else {
            const menuList = $('.menu__list').eq(1);
            if (!menuList.length) return;
            const btn = $(`<li class="menu__item selector nsl-section-add"><div class="menu__ico">📌</div><div class="menu__text">Добавить закладку</div></li>`);
            btn.on('hover:enter', addSection);
            menuList.prepend(btn);
        }
    }

    // ============ ИЗБРАННОЕ ============
    function getFavoritesByFolder(folderId) {
        const folder = FAVORITE_FOLDERS.find(f => f.id === folderId);
        if (!folder) return [];
        return favorites.filter(f => f.media_type === folder.mediaType)
            .sort((a, b) => b.updated - a.updated)
            .map(f => f.data);
    }

    function getFavoritesByCategory(category) {
        return favorites.filter(f => f.category === category)
            .sort((a, b) => b.updated - a.updated)
            .map(f => f.data);
    }

    function isInFavorites(cardId, category) {
        return favorites.some(f => f.card_id == cardId && f.category === category);
    }

    function addToFavorites(card, category) {
        if (!card || !card.id) return false;
        const mediaType = detectMediaType(card);
        const existing = favorites.find(f => f.card_id == card.id && f.category === category);
        if (existing) {
            existing.updated = Date.now();
        } else {
            favorites.unshift({
                id: generateId(),
                card_id: card.id,
                tmdb_id: card.tmdb_id || card.id,
                media_type: mediaType,
                category: category,
                data: clearCard(card),
                added: Date.now(),
                updated: Date.now()
            });
        }
        if (favorites.length > 500) favorites = favorites.slice(0, 500);
        saveFavorites();
        notify(`✅ Добавлено в "${FAVORITE_CATEGORIES[category].title}"`);
        return true;
    }

    function removeFromFavorites(cardId, category) {
        favorites = favorites.filter(f => !(f.card_id == cardId && f.category === category));
        saveFavorites();
    }

    function showFavoriteMenu(card) {
        const items = [];
        for (const cat in FAVORITE_CATEGORIES) {
            const info = FAVORITE_CATEGORIES[cat];
            const isAdded = isInFavorites(card.id, cat);
            items.push({
                title: `${info.icon} ${info.title}`,
                checkbox: true,
                checked: isAdded,
                onSelect: () => {
                    if (isAdded) {
                        removeFromFavorites(card.id, cat);
                        notify(`Удалено из "${info.title}"`);
                    } else {
                        addToFavorites(card, cat);
                    }
                }
            });
        }
        Lampa.Select.show({
            title: '⭐ Добавить в избранное',
            items: items,
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    // ============ ИСТОРИЯ ============
    function addToHistory(card, progress = {}) {
        if (!card || !card.id) return;
        const mediaType = detectMediaType(card);
        history.unshift({
            id: generateId(),
            card_id: card.id,
            tmdb_id: card.tmdb_id || card.id,
            media_type: mediaType,
            data: clearCard(card),
            watched_at: Date.now(),
            progress: progress
        });
        if (history.length > 500) history = history.slice(0, 500);
        saveHistory();
    }

    function getHistoryByFilter(filterId) {
        let filtered = history;
        if (filterId !== 'all') {
            filtered = history.filter(h => h.media_type === filterId);
        }
        return filtered.sort((a, b) => b.watched_at - a.watched_at).map(h => h.data);
    }

    // ============ ПРОДОЛЖИТЬ ПРОСМОТР ============
    function getContinueWatching() {
        const c = cfg();
        if (!c.continue_watching) return [];
        const result = [];
        const added = new Set();
        for (const key in timeline) {
            const record = timeline[key];
            const percent = record.percent || 0;
            if (percent >= c.continue_min_progress && percent <= c.continue_max_progress) {
                const tmdbId = record.tmdb_id || key.split('_')[0];
                const favItem = favorites.find(f => String(f.tmdb_id) === String(tmdbId));
                if (favItem && !added.has(favItem.card_id)) {
                    result.push({ ...favItem.data, progress: percent });
                    added.add(favItem.card_id);
                }
            }
        }
        return result.slice(0, 20);
    }

    // ============ ТАЙМКОДЫ ============
    function injectTimelineStyles() {
        if (styleInjected) return;
        const c = cfg();
        const pos = c.timeline_position || 'bottom';
        const styles = {
            bottom: 'bottom: 2.5em; top: auto;',
            center: 'bottom: auto; top: 50%; transform: translateY(-50%);',
            top: 'bottom: auto; top: 0.5em;'
        };
        const style = document.createElement('style');
        style.id = 'nsl-timeline-styles';
        style.textContent = `.card .card-watched{display:block!important;opacity:1!important;visibility:visible!important;pointer-events:none;${styles[pos]||styles.bottom}left:.8em!important;right:.8em!important;z-index:5!important;background:rgba(0,0,0,.7)!important;backdrop-filter:blur(2px);}.card:not(.focus) .card-watched{display:block!important;}`;
        document.head.appendChild(style);
        styleInjected = true;
    }

    function removeTimelineStyles() {
        $('#nsl-timeline-styles').remove();
        styleInjected = false;
    }

    function saveCurrentProgress(timeInSeconds) {
        const c = cfg();
        if (!c.auto_save) return false;
        const movieKey = getCurrentMovieKey();
        if (!movieKey) return false;
        const currentTime = Math.floor(timeInSeconds);
        const savedTime = timeline[movieKey]?.time || 0;
        if (Math.abs(currentTime - savedTime) < 10) return false;
        let duration = Lampa.Player.playdata()?.timeline?.duration || 0;
        if (duration === 0 && timeline[movieKey]?.duration > 0) duration = timeline[movieKey].duration;
        const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
        timeline[movieKey] = { time: currentTime, percent, duration, updated: Date.now() };
        saveTimeline();
        if (Lampa.Timeline) Lampa.Timeline.read(true);
        if (percent >= 90) {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) addToHistory(activity.movie, { time: currentTime, percent, duration });
        }
        return true;
    }

    function initPlayerHandler() {
        playerCheckInterval = setInterval(() => {
            if (!cfg().enabled || !Lampa.Player.opened()) return;
            try {
                const data = Lampa.Player.playdata();
                if (data?.timeline?.time) {
                    currentMovieTime = data.timeline.time;
                    if (cfg().auto_save) saveCurrentProgress(currentMovieTime);
                }
            } catch(e) {}
        }, 10000);
    }

    // ============ СИНХРОНИЗАЦИЯ С GIST ============
    function getGistAuth() {
        const c = cfg();
        return (c.gist_token && c.gist_id) ? { token: c.gist_token, id: c.gist_id } : null;
    }

    function syncFile(type, data) {
        const gist = getGistAuth();
        if (!gist) return;
        const files = {};
        files[GIST_FILES[type]] = { content: JSON.stringify(data) };
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'PATCH',
            headers: { 'Authorization': `token ${gist.token}` },
            data: JSON.stringify({ files })
        });
    }

    function syncAll(showNotify = true) {
        const gist = getGistAuth();
        if (!gist) { if (showNotify) notify('⚠️ Gist не настроен'); return; }
        if (syncInProgress) { pendingSync = true; return; }
        syncInProgress = true;
        if (showNotify) notify('🔄 Синхронизация...');
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'GET',
            headers: { 'Authorization': `token ${gist.token}` },
            success: (response) => {
                let hasChanges = false;
                ['timeline', 'sections', 'favorites', 'history'].forEach(type => {
                    try {
                        const file = response.files[GIST_FILES[type]];
                        if (file?.content) {
                            const remote = JSON.parse(file.content);
                            if (type === 'timeline') {
                                for (const k in remote) {
                                    if (!timeline[k] || remote[k].updated > timeline[k].updated) {
                                        timeline[k] = remote[k]; hasChanges = true;
                                    }
                                }
                            } else {
                                const local = type === 'sections' ? sections : (type === 'favorites' ? favorites : history);
                                remote.forEach(r => { if (!local.find(l => l.id === r.id)) { local.push(r); hasChanges = true; } });
                            }
                        }
                    } catch(e) {}
                });
                if (hasChanges) { saveSections(); saveFavorites(); saveHistory(); saveTimeline(); renderSectionsMenu(); }
                const files = {};
                files[GIST_FILES.timeline] = { content: JSON.stringify(timeline) };
                files[GIST_FILES.sections] = { content: JSON.stringify(sections) };
                files[GIST_FILES.favorites] = { content: JSON.stringify(favorites) };
                files[GIST_FILES.history] = { content: JSON.stringify(history) };
                $.ajax({
                    url: `https://api.github.com/gists/${gist.id}`,
                    method: 'PATCH',
                    headers: { 'Authorization': `token ${gist.token}` },
                    data: JSON.stringify({ files }),
                    success: () => {
                        if (showNotify) notify('✅ Синхронизация завершена');
                        syncInProgress = false;
                        if (pendingSync) { pendingSync = false; syncAll(false); }
                    },
                    error: () => { syncInProgress = false; if (showNotify) notify('❌ Ошибка отправки'); }
                });
            },
            error: () => { syncInProgress = false; if (showNotify) notify('❌ Ошибка загрузки'); }
        });
    }

    // ============ МЕНЮ НАСТРОЕК ============
    function showMainMenu() {
        const c = cfg();
        const stats = {
            sections: sections.length,
            favorites: favorites.length,
            history: history.length,
            timeline: Object.keys(timeline).length,
            favoritesByCat: {},
            favoritesByFolder: {}
        };
        FAVORITE_FOLDERS.forEach(f => { stats.favoritesByFolder[f.id] = favorites.filter(fv => fv.media_type === f.mediaType).length; });
        Object.keys(FAVORITE_CATEGORIES).forEach(cat => { stats.favoritesByCat[cat] = favorites.filter(f => f.category === cat).length; });
        
        const items = [
            { title: (c.enabled ? '[OK]' : '[OFF]') + ' Плагин: ' + (c.enabled ? 'Вкл' : 'Выкл'), action: 'toggle_enabled' },
            { title: '──────────', separator: true },
            { title: '📌 Закладки разделов', disabled: true },
            { title: `   Всего: ${stats.sections}`, disabled: true },
            { title: '   Положение кнопки: ' + (c.sections_button === 'side' ? 'Боковое меню' : 'Верхняя панель'), action: 'sections_button' },
            { title: '   🗑️ Очистить все', action: 'clear_sections' },
            { title: '──────────', separator: true },
            { title: '⭐ Избранное', disabled: true },
            { title: `   Всего: ${stats.favorites}`, disabled: true }
        ];
        
        FAVORITE_FOLDERS.forEach(f => {
            items.push({ title: `   ${f.icon} ${f.title}: ${stats.favoritesByFolder[f.id] || 0}`, disabled: true });
        });
        
        items.push({ title: '   ───────────────', separator: true });
        Object.keys(FAVORITE_CATEGORIES).forEach(cat => {
            items.push({ title: `   ${FAVORITE_CATEGORIES[cat].icon} ${FAVORITE_CATEGORIES[cat].title}: ${stats.favoritesByCat[cat] || 0}`, disabled: true });
        });
        
        items.push(
            { title: '   🔄 Авто в Брошено: ' + (c.auto_move_dropped ? 'Вкл' : 'Выкл'), action: 'toggle_auto_dropped' },
            { title: '   📅 Дней до Брошено: ' + c.auto_move_dropped_days, action: 'set_dropped_days' },
            { title: '   🗑️ Очистить всё', action: 'clear_favorites' },
            { title: '──────────', separator: true },
            { title: '📜 История просмотров', disabled: true },
            { title: `   Всего: ${stats.history}`, disabled: true }
        );
        
        HISTORY_FILTERS.forEach(f => {
            items.push({ title: `   ${f.icon} ${f.title}: ${history.filter(h => f.id === 'all' ? true : h.media_type === f.id).length}`, disabled: true });
        });
        
        items.push(
            { title: '   🗑️ Очистить историю', action: 'clear_history' },
            { title: '──────────', separator: true },
            { title: '⏱️ Таймкоды', disabled: true },
            { title: `   Всего: ${stats.timeline}`, disabled: true },
            { title: '   ' + (c.auto_save ? '[OK]' : '[OFF]') + ' Автосохранение: ' + (c.auto_save ? 'Вкл' : 'Выкл'), action: 'toggle_auto_save' },
            { title: '   ' + (c.auto_sync ? '[OK]' : '[OFF]') + ' Автосинхронизация: ' + (c.auto_sync ? 'Вкл' : 'Выкл'), action: 'toggle_auto_sync' },
            { title: '   ' + (c.always_show_timeline ? '[OK]' : '[OFF]') + ' Таймкоды на карточках: ' + (c.always_show_timeline ? 'Вкл' : 'Выкл'), action: 'toggle_timeline' },
            { title: '   Позиция: ' + (c.timeline_position === 'bottom' ? 'Снизу' : c.timeline_position === 'center' ? 'По центру' : 'Сверху'), action: 'timeline_position' },
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
        );
        
        Lampa.Select.show({
            title: 'NSL Sync v' + SYNC_VERSION,
            items: items,
            onSelect: (item) => {
                const c = cfg();
                if (item.action === 'toggle_enabled') {
                    c.enabled = !c.enabled; saveCfg(c);
                    if (c.enabled) { initPlayerHandler(); if (c.always_show_timeline) injectTimelineStyles(); addSectionButton(); renderSectionsMenu(); addMenuItems(); }
                    else { clearInterval(playerCheckInterval); clearInterval(autoSyncInterval); removeTimelineStyles(); $('.nsl-section-add, .nsl-section-item, .nsl-menu-item, .nsl-split-sections, .nsl-menu-split').remove(); }
                    notify('Плагин ' + (c.enabled ? 'включён' : 'выключен')); showMainMenu();
                } else if (item.action === 'sections_button') {
                    Lampa.Select.show({ title: 'Положение кнопки', items: [{ title: '📱 Боковое меню', action: 'side' }, { title: '⬆️ Верхняя панель', action: 'top' }], onSelect: (s) => { c.sections_button = s.action; saveCfg(c); $('.nsl-section-add').remove(); addSectionButton(); showMainMenu(); }, onBack: showMainMenu });
                } else if (item.action === 'clear_sections') { sections = []; saveSections(); renderSectionsMenu(); notify('✅ Закладки очищены'); showMainMenu(); }
                else if (item.action === 'clear_favorites') { favorites = []; saveFavorites(); notify('✅ Избранное очищено'); showMainMenu(); }
                else if (item.action === 'clear_history') { history = []; saveHistory(); notify('✅ История очищена'); showMainMenu(); }
                else if (item.action === 'clear_timeline') { timeline = {}; saveTimeline(); notify('✅ Таймкоды очищены'); showMainMenu(); }
                else if (item.action === 'toggle_auto_save') { c.auto_save = !c.auto_save; saveCfg(c); notify('Автосохранение ' + (c.auto_save ? 'включено' : 'выключено')); showMainMenu(); }
                else if (item.action === 'toggle_auto_sync') { c.auto_sync = !c.auto_sync; saveCfg(c); notify('Автосинхронизация ' + (c.auto_sync ? 'включена' : 'выключена')); showMainMenu(); }
                else if (item.action === 'toggle_timeline') { c.always_show_timeline = !c.always_show_timeline; saveCfg(c); c.always_show_timeline ? injectTimelineStyles() : removeTimelineStyles(); notify('Таймкоды ' + (c.always_show_timeline ? 'показываются' : 'скрыты')); showMainMenu(); }
                else if (item.action === 'timeline_position') {
                    Lampa.Select.show({ title: 'Позиция таймкода', items: [{ title: '⬇️ Снизу', action: 'bottom' }, { title: '📍 По центру', action: 'center' }, { title: '⬆️ Сверху', action: 'top' }], onSelect: (s) => { c.timeline_position = s.action; saveCfg(c); if (c.always_show_timeline) { removeTimelineStyles(); injectTimelineStyles(); } showMainMenu(); }, onBack: showMainMenu });
                } else if (item.action === 'toggle_auto_dropped') { c.auto_move_dropped = !c.auto_move_dropped; saveCfg(c); notify('Авто в Брошено ' + (c.auto_move_dropped ? 'включено' : 'выключено')); showMainMenu(); }
                else if (item.action === 'set_dropped_days') { Lampa.Input.edit({ title: 'Дней до Брошено', value: String(c.auto_move_dropped_days), free: true, number: true }, (v) => { if (v && !isNaN(v)) { c.auto_move_dropped_days = parseInt(v); saveCfg(c); } showMainMenu(); }); }
                else if (item.action === 'toggle_continue') { c.continue_watching = !c.continue_watching; saveCfg(c); addMenuItems(); notify('Продолжить просмотр ' + (c.continue_watching ? 'включено' : 'выключено')); showMainMenu(); }
                else if (item.action === 'set_min_progress') { Lampa.Input.edit({ title: 'Мин. прогресс %', value: String(c.continue_min_progress), free: true, number: true }, (v) => { if (v && !isNaN(v)) { c.continue_min_progress = parseInt(v); saveCfg(c); } showMainMenu(); }); }
                else if (item.action === 'set_max_progress') { Lampa.Input.edit({ title: 'Макс. прогресс %', value: String(c.continue_max_progress), free: true, number: true }, (v) => { if (v && !isNaN(v)) { c.continue_max_progress = parseInt(v); saveCfg(c); } showMainMenu(); }); }
                else if (item.action === 'gist') { showGistMenu(); }
                else if (item.action === 'sync_now') { Lampa.Controller.toggle('content'); syncAll(true); }
                else if (item.action === 'cancel') { Lampa.Controller.toggle('content'); }
            },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    function showGistMenu() {
        const c = cfg();
        Lampa.Select.show({
            title: '☁️ GitHub Gist',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓' : '❌'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0,8)+'…' : '❌'}`, action: 'id' },
                { title: '──────────', separator: true },
                { title: '📥 Импорт из CUB', action: 'import_cub' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                const c = cfg();
                if (item.action === 'token') { Lampa.Input.edit({ title: 'GitHub Token', value: c.gist_token, free: true }, (v) => { if (v !== null) { c.gist_token = v; saveCfg(c); } showGistMenu(); }); }
                else if (item.action === 'id') { Lampa.Input.edit({ title: 'Gist ID', value: c.gist_id, free: true }, (v) => { if (v !== null) { c.gist_id = v; saveCfg(c); } showGistMenu(); }); }
                else if (item.action === 'import_cub') { importFromCUB(); }
                else if (item.action === 'back') { showMainMenu(); }
            },
            onBack: () => showMainMenu()
        });
    }

    function importFromCUB() {
        const c = cfg();
        if (c.cub_import_done) { notify('Импорт уже выполнен'); return; }
        Lampa.Select.show({
            title: 'Импорт из CUB',
            items: [{ title: '📥 Импортировать закладки из CUB?', disabled: true }, { title: '──────────', separator: true }, { title: '✅ Да', action: 'import' }, { title: '❌ Нет', action: 'skip' }],
            onSelect: (item) => {
                if (item.action === 'import') {
                    const cub = Lampa.Storage.get('favorite', {});
                    let count = 0;
                    ['book', 'like', 'wath'].forEach(type => {
                        if (cub[type]) cub[type].forEach(card => { if (!favorites.find(f => f.card_id == card.id)) { favorites.push({ id: generateId(), card_id: card.id, tmdb_id: card.id, media_type: detectMediaType(card), category: 'favorite', data: clearCard(card), added: Date.now(), updated: Date.now() }); count++; } });
                    });
                    saveFavorites();
                    notify(`✅ Импортировано ${count} закладок`);
                }
                c.cub_import_done = true; saveCfg(c);
                Lampa.Controller.toggle('content');
            }
        });
    }

    // ============ БОКОВОЕ МЕНЮ ============
    function addMenuItems() {
        setTimeout(() => {
            $('.nsl-menu-item, .nsl-menu-split').remove();
            if (!cfg().enabled) return;
            const menuList = $('.menu__list').eq(0);
            if (!menuList.length) return;
            menuList.append('<li class="menu__split nsl-menu-split"></li>');
            
            const items = [
                { action: 'sections', icon: '📌', title: 'Мои закладки', enabled: cfg().sections_enabled },
                { action: 'favorites', icon: '⭐', title: 'Моё избранное', enabled: cfg().favorites_enabled },
                { action: 'history', icon: '📜', title: 'Моя история', enabled: cfg().history_enabled },
                { action: 'collection', icon: '📦', title: 'Коллекция', enabled: cfg().favorites_enabled },
                { action: 'continue', icon: '⏱️', title: 'Продолжить', enabled: cfg().continue_watching }
            ];
            
            items.forEach(item => {
                if (!item.enabled) return;
                const el = $(`<li class="menu__item selector nsl-menu-item" data-nsl="${item.action}"><div class="menu__ico">${item.icon}</div><div class="menu__text">${item.title}</div></li>`);
                el.on('hover:enter', (e) => { e.stopPropagation(); handleMenuAction(item.action); });
                menuList.append(el);
            });
        }, 500);
    }

    function handleMenuAction(action) {
        if (action === 'sections') {
            if (sections.length === 0) { notify('📌 Нет сохранённых закладок'); return; }
            if (sections.length === 1) { openSection(sections[0]); return; }
            const items = sections.map(s => ({ title: s.name, onSelect: () => openSection(s) }));
            Lampa.Select.show({ title: 'Мои закладки', items, onBack: () => Lampa.Controller.toggle('content') });
        } else if (action === 'favorites') {
            const items = FAVORITE_FOLDERS.map(f => ({ title: `${f.icon} ${f.title}`, onSelect: () => Lampa.Activity.push({ url: '', title: f.title, component: 'category', source: 'nsl_favorites', folder: f.id, page: 1 }) }));
            Lampa.Select.show({ title: 'Моё избранное', items, onBack: () => Lampa.Controller.toggle('content') });
        } else if (action === 'history') {
            const items = HISTORY_FILTERS.map(f => ({ title: `${f.icon} ${f.title}`, onSelect: () => Lampa.Activity.push({ url: '', title: f.title, component: 'category', source: 'nsl_history', filter: f.id, page: 1 }) }));
            Lampa.Select.show({ title: 'Моя история', items, onBack: () => Lampa.Controller.toggle('content') });
        } else if (action === 'collection') {
            Lampa.Activity.push({ url: '', title: 'Коллекция', component: 'category', source: 'nsl_favorites', category: 'collection', page: 1 });
        } else if (action === 'continue') {
            const data = getContinueWatching();
            Lampa.Activity.push({ url: '', title: 'Продолжить просмотр', component: 'category', source: 'nsl_continue', page: 1 });
        }
    }

    // ============ КНОПКА НА КАРТОЧКЕ ============
    function addCardButton() {
        Lampa.Listener.follow('full', (e) => {
            if (e.type !== 'complite' || !cfg().favorites_enabled) return;
            const start = e.link.items?.find(i => i.constructor.name === 'Start');
            if (!start) return;
            const container = start.html.find('.full-start-new__buttons');
            if (!container.length || container.find('.nsl-fav-btn').length) return;
            const btn = $(`<div class="full-start__button selector nsl-fav-btn"><div class="full-start__button-icon">⭐</div><div class="full-start__button-text">Добавить</div></div>`);
            btn.on('hover:enter', () => showFavoriteMenu(e.data.movie));
            container.prepend(btn);
        });
    }

    // ============ РЕГИСТРАЦИЯ ИСТОЧНИКОВ ============
    function registerSources() {
        Lampa.Api.sources.nsl_favorites = {
            category: (params, oncomplite) => {
                let data = params.folder ? getFavoritesByFolder(params.folder) : getFavoritesByCategory(params.category || 'favorite');
                const page = params.page || 1;
                oncomplite({ results: data.slice((page-1)*20, page*20), total_pages: Math.ceil(data.length/20), page });
            },
            full: (params, oncomplite) => Lampa.Api.sources.tmdb.full(params, oncomplite, () => {})
        };
        Lampa.Api.sources.nsl_history = {
            category: (params, oncomplite) => {
                const data = getHistoryByFilter(params.filter || 'all');
                const page = params.page || 1;
                oncomplite({ results: data.slice((page-1)*20, page*20), total_pages: Math.ceil(data.length/20), page });
            },
            full: (params, oncomplite) => Lampa.Api.sources.tmdb.full(params, oncomplite, () => {})
        };
        Lampa.Api.sources.nsl_continue = {
            category: (params, oncomplite) => {
                const data = getContinueWatching();
                const page = params.page || 1;
                oncomplite({ results: data.slice((page-1)*20, page*20), total_pages: Math.ceil(data.length/20), page });
            },
            full: (params, oncomplite) => Lampa.Api.sources.tmdb.full(params, oncomplite, () => {})
        };
    }

    // ============ НАСТРОЙКИ ============
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        Lampa.SettingsApi.addComponent({ component: 'nsl_sync', name: 'NSL Sync v' + SYNC_VERSION, icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>' });
        Lampa.SettingsApi.addParam({ component: 'nsl_sync', param: { name: 'open', type: 'button' }, field: { name: 'Открыть меню' }, onChange: () => { Lampa.Controller.toggle('settings'); setTimeout(showMainMenu, 100); } });
    }

    // ============ ИНИЦИАЛИЗАЦИЯ ============
    function init() {
        loadSections(); loadFavorites(); loadHistory(); loadTimeline();
        registerSources(); addSettings();
        if (!cfg().enabled) return;
        if (cfg().always_show_timeline) injectTimelineStyles();
        initPlayerHandler();
        addSectionButton();
        addMenuItems();
        addCardButton();
        setInterval(() => { if (cfg().auto_sync && !Lampa.Player.opened()) syncAll(false); }, cfg().sync_interval * 1000);
        if (cfg().auto_sync) setTimeout(() => syncAll(false), 3000);
        if (!cfg().cub_import_done && cfg().gist_token) setTimeout(importFromCUB, 2000);
        notify('🚀 NSL Sync v' + SYNC_VERSION + ' загружен');
    }

    if (window.Lampa && Lampa.Listener) {
        if (window.appready) init();
        else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') init(); });
    } else {
        setTimeout(function wait() { if (window.Lampa) init(); else setTimeout(wait, 100); }, 100);
    }
})();
