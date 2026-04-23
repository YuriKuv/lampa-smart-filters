(function () {
    'use strict';

    if (window.nsl_sync_init) return;
    window.nsl_sync_init = true;

    // ======================
    // 0. ОПРЕДЕЛЕНИЕ ПЛАТФОРМЫ И ПРОФИЛЯ
    // ======================
    
    const isAndroid = navigator.userAgent.toLowerCase().indexOf('android') > -1 || 
                      (typeof window.AndroidJS !== 'undefined');
    
    function getProfileId() {
        try {
            const account = Lampa.Storage.get('account', {});
            const profile = account.profile || {};
            return String(profile.id || 'default');
        } catch (e) {
            return 'default';
        }
    }

    const PROFILE_ID = getProfileId();
    const STORE_BOOKMARKS = `nsl_bookmarks_${PROFILE_ID}_v4`;
    const STORE_FAVORITES = `nsl_favorites_${PROFILE_ID}_v4`;
    const STORE_TIMELINE = `nsl_timeline_${PROFILE_ID}_v4`;
    const STORE_MOVE_LOG = `nsl_move_log_${PROFILE_ID}_v1`;
    const CFG = `nsl_cfg_${PROFILE_ID}_v4`;
    const GIST_CACHE = `nsl_gist_cache_${PROFILE_ID}`;

    window.NSL = {};

    const FAVORITE_CATEGORIES = [
        { id: 'favorite', name: 'Избранное', icon: '⭐' },
        { id: 'watching', name: 'Смотрю', icon: '👁️' },
        { id: 'planned', name: 'Буду смотреть', icon: '📋' },
        { id: 'watched', name: 'Просмотрено', icon: '✅' },
        { id: 'abandoned', name: 'Брошено', icon: '❌' },
        { id: 'collection', name: 'Коллекция', icon: '📦' }
    ];

    const MEDIA_TYPES = {
        movie: { name: 'Фильмы', icon: '🎬' },
        tv: { name: 'Сериалы', icon: '📺' },
        cartoon: { name: 'Мультфильмы', icon: '🐭' },
        cartoon_series: { name: 'Мультсериалы', icon: '🐭' },
        anime: { name: 'Аниме', icon: '🐭' }
    };

    const STATUS_PRIORITY = {
        'watching': 1,
        'abandoned': 2,
        'watched': 3,
        'planned': 4,
        'favorite': 5,
        'collection': 6
    };

    const CATEGORY_RULES = {
        abandoned: { removeFrom: ['favorite', 'watching', 'planned', 'watched'] },
        watched: { removeFrom: ['favorite', 'watching', 'planned'] },
        watching: { removeFrom: ['planned'] },
        collection: { removeFrom: [] },
        favorite: { removeFrom: [] },
        planned: { removeFrom: [] }
    };

    let timelineStylesInjected = false;
    let timelineModulePatched = false;
    let ratingsObserver = null;

    function cfg() {
        return Lampa.Storage.get(CFG, {
            enabled: true,
            button_position: 'side',
            gist_token: '',
            gist_id: '',
            sync_on_start: true,
            sync_on_close: false,
            sync_on_add: true,
            sync_on_remove: true,
            sync_auto_interval: true,
            sync_interval_minutes: 60,
            auto_save: true,
            auto_sync: true,
            sync_interval: 30,
            sync_strategy: 'max_time',
            auto_abandoned: false,
            abandoned_days: 30,
            auto_watching: true,
            watching_min_progress: 5,
            watching_max_progress: 95,
            auto_watched: true,
            watched_min_progress: 95,
            show_move_notifications: true,
            cleanup_older_days: 0,
            cleanup_completed: false,
            show_timeline_on_cards: true,
            timeline_position: 'bottom',
            show_ratings: true,
            ratings_on_cards: true,
            ratings_on_full: true,
            ratings_source: 'both'
        }) || {};
    }

    function saveCfg(c) { Lampa.Storage.set(CFG, c, true); }

    function getBookmarks() { return Lampa.Storage.get(STORE_BOOKMARKS, []) || []; }
    function saveBookmarks(l) { Lampa.Storage.set(STORE_BOOKMARKS, l, true); renderBookmarks(); }
    
    function getFavorites() { return Lampa.Storage.get(STORE_FAVORITES, []) || []; }
    function saveFavorites(l) { 
        Lampa.Storage.set(STORE_FAVORITES, l, true); 
        setTimeout(() => Lampa.Listener.send('state:changed', { target: 'nsl_favorites', reason: 'update' }), 100);
    }
    
    function getTimeline() { return Lampa.Storage.get(STORE_TIMELINE, {}) || {}; }
    function saveTimeline(t) { 
        Lampa.Storage.set(STORE_TIMELINE, t, true); 
        setTimeout(() => Lampa.Listener.send('state:changed', { target: 'timeline', reason: 'update' }), 100);
    }
    
    function getMoveLog() { return Lampa.Storage.get(STORE_MOVE_LOG, []) || []; }
    function saveMoveLog(l) { 
        if (l.length > 50) l = l.slice(-50);
        Lampa.Storage.set(STORE_MOVE_LOG, l, true); 
    }

    function notify(text) { 
        if (Lampa.Noty) Lampa.Noty.show(text);
    }

    function logMove(action, title, fromCategory, toCategory) {
        const c = cfg();
        if (!c.show_move_notifications && fromCategory) return;
        
        const logEntry = {
            time: Date.now(),
            action: action,
            title: title,
            from: fromCategory || 'none',
            to: toCategory || 'none'
        };
        
        const log = getMoveLog();
        log.push(logEntry);
        saveMoveLog(log);
        
        if (c.show_move_notifications) {
            const catNames = {};
            FAVORITE_CATEGORIES.forEach(c => catNames[c.id] = c.name);
            
            if (action === 'move') notify(`📦 "${title}" → ${catNames[toCategory]}`);
            else if (action === 'auto_watching') notify(`👁️ "${title}" → Смотрю`);
            else if (action === 'auto_watched') notify(`✅ "${title}" → Просмотрено`);
            else if (action === 'auto_abandoned') notify(`❌ "${title}" → Брошено`);
            else if (action === 'return_abandoned') notify(`🔄 "${title}" возвращён в Смотрю`);
            else if (action === 'return_watched') notify(`🔄 "${title}" возвращён в Смотрю (повторный просмотр)`);
        }
    }

    function formatTime(seconds) {
        if (!seconds || seconds < 0) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    function extractTmdbId(item) {
        if (!item) return null;
        if (item.tmdb_id) return String(item.tmdb_id);
        if (item.id && /^\d{6,8}$/.test(String(item.id))) return String(item.id);
        if (item.movie_id && /^\d{6,8}$/.test(String(item.movie_id))) return String(item.movie_id);
        return null;
    }

    function getMediaType(item) {
        if (!item) return 'movie';
        if (item.original_name) {
            if (item.anime) return 'anime';
            if (item.animation) return 'cartoon_series';
            return 'tv';
        }
        if (item.animation) return 'cartoon';
        return 'movie';
    }

    function cleanCardData(card) {
        const cleaned = {};
        const allowedFields = ['id', 'title', 'name', 'original_title', 'original_name', 
            'poster_path', 'backdrop_path', 'vote_average', 'release_date', 'first_air_date',
            'overview', 'genre_ids', 'source', 'animation', 'anime', 'kp_rating', 'rating'];
        for (const field of allowedFields) {
            if (card[field] !== undefined) cleaned[field] = card[field];
        }
        return cleaned;
    }

    // ======================
    // ЗАКЛАДКИ РАЗДЕЛОВ
    // ======================
    
    const ICON_FLAG = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/></svg>';
    const ICON_ADD = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>';

    function makeKey(a) {
        return [a.url || '', a.component || '', a.source || '', a.id || '', a.job || '',
            JSON.stringify(a.genres || ''), JSON.stringify(a.params || '')].join('|');
    }

    function bookmarkExists(act) {
        return getBookmarks().some(i => i.key === makeKey(act));
    }

    function isAllowedForBookmark() {
        const act = Lampa.Activity.active();
        if (!act) return false;
        if (act.component === 'actor' || act.component === 'person') return true;
        if (!act.url) return false;
        if (['movie', 'tv', 'anime', 'catalog'].includes(act.url)) return false;
        if (act.params || act.genres || act.sort || act.filter) return true;
        return act.url.indexOf('discover') !== -1 && act.url.indexOf('?') !== -1;
    }

    function normalizeBookmark(a) {
        return {
            id: Date.now(),
            key: makeKey(a),
            name: a.title || a.name || 'Закладка',
            url: a.url,
            component: a.component || 'category_full',
            source: a.source || 'tmdb',
            id_person: a.id,
            job: a.job,
            genres: a.genres,
            params: a.params,
            page: a.page || 1,
            created: Date.now()
        };
    }

    function saveBookmark() {
        const act = Lampa.Activity.active();
        if (!isAllowedForBookmark()) { notify('Здесь нельзя создать закладку'); return; }
        if (bookmarkExists(act)) { notify('Уже есть'); return; }
        Lampa.Input.edit({ title: 'Название', value: act.title || act.name || 'Закладка' }, (val) => {
            if (!val) return;
            const l = getBookmarks();
            l.push({ ...normalizeBookmark(act), name: val.trim() });
            saveBookmarks(l);
            const c = cfg();
            if (c.sync_on_add && c.gist_token && c.gist_id) setTimeout(() => syncToGist(false), 100);
            notify('Сохранено');
        }, () => {});
    }

    function removeBookmark(item) { saveBookmarks(getBookmarks().filter(i => i.id !== item.id)); notify('Удалено'); }

    function openBookmark(item) {
        Lampa.Activity.push({
            url: item.url, title: item.name, component: item.component, source: item.source,
            id: item.id_person, job: item.job, genres: item.genres, params: item.params, page: item.page
        });
    }

    function renderBookmarks() {
        $('.nsl-bookmark-item').remove();
        const menuList = $('.menu__list').first();
        if (!menuList.length) return;
        getBookmarks().forEach(item => {
            const el = $(`<li class="menu__item selector nsl-bookmark-item"><div class="menu__ico">${ICON_FLAG}</div><div class="menu__text">${item.name}</div></li>`);
            el.on('hover:enter', (e) => { e.stopPropagation(); openBookmark(item); });
            el.on('hover:long', (e) => {
                e.stopPropagation();
                Lampa.Select.show({
                    title: `Удалить "${item.name}"?`,
                    items: [{ title: 'Нет', action: 'cancel' }, { title: 'Да', action: 'remove' }],
                    onSelect: (a) => { if (a.action === 'remove') removeBookmark(item); },
                    onBack: () => Lampa.Controller.toggle('content')
                });
            });
            menuList.append(el);
        });
    }

    function addBookmarkButton() {
        if ($('[data-nsl-save]').length) return;
        const c = cfg();
        if (c.button_position === 'side') {
            const menuList = $('.menu__list').eq(1);
            if (menuList.length) {
                const btn = $(`<li class="menu__item selector" data-nsl-save><div class="menu__ico">${ICON_ADD}</div><div class="menu__text">Сохранить раздел</div></li>`);
                btn.on('hover:enter', (e) => { e.stopPropagation(); saveBookmark(); });
                menuList.prepend(btn);
            }
        } else if (c.button_position === 'top') {
            const head = $('.head__actions, .head__buttons').first();
            if (head.length) {
                const btn = $(`<div class="head__action selector" data-nsl-save><div class="head__action-ico">${ICON_ADD}</div></div>`);
                btn.on('hover:enter', (e) => { e.stopPropagation(); saveBookmark(); });
                head.prepend(btn);
            }
        }
    }

    // ======================
    // ИЗБРАННОЕ
    // ======================

    function getBaseTmdbId(tmdbId) {
        if (!tmdbId) return null;
        return String(tmdbId).replace(/[_-].*$/, '');
    }

    function applyCategoryRules(tmdbId, newCategory, favorites) {
        const rules = CATEGORY_RULES[newCategory];
        if (!rules || !rules.removeFrom.length) return false;
        const baseId = getBaseTmdbId(tmdbId);
        let changed = false;
        for (const catToRemove of rules.removeFrom) {
            const index = favorites.findIndex(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === catToRemove);
            if (index >= 0) { favorites.splice(index, 1); changed = true; }
        }
        return changed;
    }

    function addToFavorites(card, category) {
        if (!card || !card.id) return false;
        const tmdbId = extractTmdbId(card);
        const mediaType = getMediaType(card);
        const favorites = getFavorites();
        const baseId = getBaseTmdbId(tmdbId);
        const inCollection = favorites.find(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === 'collection');
        applyCategoryRules(tmdbId, category, favorites);
        const existingIndex = favorites.findIndex(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === category);
        const favoriteItem = {
            id: Date.now(), card_id: card.id, tmdb_id: tmdbId, media_type: mediaType,
            category: category, data: cleanCardData(card), added: Date.now(), updated: Date.now()
        };
        const title = card.title || card.name || 'Без названия';
        if (existingIndex >= 0) favorites[existingIndex] = favoriteItem;
        else { favorites.push(favoriteItem); logMove('add', title, null, category); }
        if (inCollection && category !== 'collection') {
            if (!favorites.some(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === 'collection')) favorites.push(inCollection);
        }
        setTimeout(() => { saveFavorites(favorites); checkAutoAbandoned(); }, 50);
        return true;
    }
    
    function removeFromFavorites(card, category) {
        const tmdbId = extractTmdbId(card);
        const favorites = getFavorites();
        const baseId = getBaseTmdbId(tmdbId);
        const index = favorites.findIndex(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === category);
        if (index >= 0) { favorites.splice(index, 1); setTimeout(() => saveFavorites(favorites), 50); return true; }
        return false;
    }
    
    function toggleFavorite(card, category) {
        return isInFavorites(card, category) ? removeFromFavorites(card, category) : addToFavorites(card, category);
    }
    
    function isInFavorites(card, category) {
        const tmdbId = extractTmdbId(card);
        const baseId = getBaseTmdbId(tmdbId);
        return getFavorites().some(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === category);
    }
    
    function getFavoritesByCategory(category) { return getFavorites().filter(f => f.category === category); }
    
    function deleteCompletely(item) {
        const favorites = getFavorites();
        const timeline = getTimeline();
        const baseId = getBaseTmdbId(item.tmdb_id);
        const title = item.data?.title || item.data?.name || 'Без названия';
        saveFavorites(favorites.filter(f => getBaseTmdbId(f.tmdb_id) !== baseId));
        for (const key in timeline) { if (getBaseTmdbId(timeline[key].tmdb_id) === baseId) delete timeline[key]; }
        saveTimeline(timeline);
        notify(`🗑️ "${title}" удалён полностью`);
        logMove('delete', title, item.category, null);
    }
    
    function checkAutoAbandoned() {
        const c = cfg();
        if (!c.auto_abandoned) return;
        const now = Date.now();
        const abandonedAfter = c.abandoned_days * 24 * 60 * 60 * 1000;
        const favorites = getFavorites();
        let changed = false;
        for (const item of favorites.filter(f => f.category === 'watching')) {
            const lastUpdate = item.updated || item.added;
            if (lastUpdate > 0 && (now - lastUpdate) > abandonedAfter) {
                item.category = 'abandoned'; item.updated = now;
                applyCategoryRules(item.tmdb_id, 'abandoned', favorites);
                logMove('auto_abandoned', item.data?.title || item.data?.name || 'Без названия', 'watching', 'abandoned');
                changed = true;
            }
        }
        if (changed) setTimeout(() => saveFavorites(favorites), 50);
    }
    
    function returnToWatching(tmdbId) {
        const favorites = getFavorites();
        const baseId = getBaseTmdbId(tmdbId);
        const item = favorites.find(f => getBaseTmdbId(f.tmdb_id) === baseId && (f.category === 'abandoned' || f.category === 'watched'));
        if (item) {
            const oldCategory = item.category;
            const title = item.data?.title || item.data?.name || 'Без названия';
            item.category = 'watching'; item.updated = Date.now();
            applyCategoryRules(tmdbId, 'watching', favorites);
            logMove(oldCategory === 'abandoned' ? 'return_abandoned' : 'return_watched', title, oldCategory, 'watching');
            saveFavorites(favorites);
            return true;
        }
        return false;
    }
    
    function syncTimelineWithCategories() {
        const c = cfg();
        if (!c.auto_watching && !c.auto_watched) return;
        const timeline = getTimeline();
        const favorites = getFavorites();
        let changed = false;
        for (const [key, item] of Object.entries(timeline)) {
            const tmdbId = item.tmdb_id;
            if (!tmdbId) continue;
            const baseId = getBaseTmdbId(tmdbId);
            const percent = item.percent || 0;
            if (favorites.some(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === 'abandoned')) continue;
            const existingWatching = favorites.find(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === 'watching');
            const existingWatched = favorites.find(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === 'watched');
            const existingPlanned = favorites.find(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === 'planned');
            const existingFavorite = favorites.find(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === 'favorite');
            const existingAny = existingWatching || existingWatched || existingPlanned || existingFavorite;
            const cardData = existingAny?.data || { id: tmdbId, title: 'ID: ' + baseId };
            const title = cardData.title || cardData.name || 'ID: ' + baseId;
            const mediaType = (key.includes('_s') || key.includes('_e')) ? 'tv' : 'movie';
            
            if (c.auto_watched && !existingWatched && percent >= c.watched_min_progress) {
                if (existingWatching) { existingWatching.category = 'watched'; existingWatching.updated = Date.now(); applyCategoryRules(tmdbId, 'watched', favorites); logMove('auto_watched', title, 'watching', 'watched'); changed = true; }
                else if (existingPlanned) { existingPlanned.category = 'watched'; existingPlanned.updated = Date.now(); applyCategoryRules(tmdbId, 'watched', favorites); logMove('auto_watched', title, 'planned', 'watched'); changed = true; }
                else if (existingFavorite) { existingFavorite.category = 'watched'; existingFavorite.updated = Date.now(); applyCategoryRules(tmdbId, 'watched', favorites); logMove('auto_watched', title, 'favorite', 'watched'); changed = true; }
                else { favorites.push({ id: Date.now(), card_id: baseId, tmdb_id: baseId, media_type: mediaType, category: 'watched', data: cardData, added: Date.now(), updated: Date.now() }); logMove('auto_watched', title, null, 'watched'); changed = true; }
                continue;
            }
            
            if (c.auto_watching && !existingWatching && !existingWatched && percent >= c.watching_min_progress && percent <= c.watching_max_progress) {
                if (existingPlanned) { existingPlanned.category = 'watching'; existingPlanned.updated = Date.now(); applyCategoryRules(tmdbId, 'watching', favorites); logMove('auto_watching', title, 'planned', 'watching'); changed = true; }
                else if (existingFavorite) { existingFavorite.category = 'watching'; existingFavorite.updated = Date.now(); applyCategoryRules(tmdbId, 'watching', favorites); logMove('auto_watching', title, 'favorite', 'watching'); changed = true; }
                else { favorites.push({ id: Date.now(), card_id: baseId, tmdb_id: baseId, media_type: mediaType, category: 'watching', data: cardData, added: Date.now(), updated: Date.now() }); logMove('auto_watching', title, null, 'watching'); changed = true; }
            }
        }
        if (changed) saveFavorites(favorites);
    }
    
    function clearAllFavorites() {
        Lampa.Select.show({
            title: '⚠️ Очистить всё избранное?',
            items: [{ title: '✅ Да, очистить всё', action: 'clear' }, { title: '❌ Отмена', action: 'cancel' }],
            onSelect: (opt) => { if (opt.action === 'clear') { saveFavorites([]); notify('🗑️ Избранное очищено'); logMove('clear_all', 'Все фильмы', null, null); } },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    // ======================
    // ТАЙМКОДЫ
    // ======================
    
    let playerInterval = null, currentMovieTime = 0, currentMovieKey = null, lastSavedProgress = 0, videoDuration = 0;
    
    function getCurrentMovieKey() {
        try {
            const activity = Lampa.Activity.active();
            if (!activity || !activity.movie) return null;
            const movie = activity.movie;
            const tmdbId = extractTmdbId(movie);
            if (!tmdbId) return null;
            const playerData = Lampa.Player.playdata();
            if (playerData && (playerData.season || playerData.episode)) return `${tmdbId}_s${playerData.season || 1}_e${playerData.episode || 1}`;
            return String(tmdbId);
        } catch (e) { return null; }
    }
    
    function getCurrentPlayerTime() {
        try { if (Lampa.Player.opened()) { const d = Lampa.Player.playdata(); if (d?.timeline?.time !== undefined) return d.timeline.time; } } catch (e) {}
        return null;
    }
    
    function getVideoDuration() {
        try {
            const d = Lampa.Player.playdata();
            if (d?.timeline?.duration && d.timeline.duration > 0) return d.timeline.duration;
            const v = document.querySelector('video');
            if (v && v.duration && !isNaN(v.duration) && v.duration > 0) return v.duration;
        } catch (e) {}
        return 0;
    }
    
    function saveProgress(timeInSeconds, force) {
        const c = cfg();
        if (!c.auto_save && !force) return false;
        const movieKey = getCurrentMovieKey();
        if (!movieKey) return false;
        const currentTime = Math.floor(timeInSeconds);
        const timeline = getTimeline();
        const savedTime = timeline[movieKey]?.time || 0;
        if (force || Math.abs(currentTime - savedTime) >= 10) {
            let duration = getVideoDuration();
            if (!duration && timeline[movieKey]?.duration) duration = timeline[movieKey].duration;
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            const tmdbId = extractTmdbId(Lampa.Activity.active()?.movie);
            timeline[movieKey] = { time: currentTime, percent: percent, duration: duration, updated: Date.now(), tmdb_id: tmdbId };
            saveTimeline(timeline);
            lastSavedProgress = currentTime; currentMovieTime = currentTime;
            if (tmdbId && currentTime > 60) returnToWatching(tmdbId);
            syncTimelineWithCategories();
            if (Lampa.Timeline?.update) Lampa.Timeline.update({ hash: movieKey, percent: percent, time: currentTime, duration: duration });
            return true;
        }
        return false;
    }
    
    function initPlayerHandler() {
        let wasPlayerOpen = false, lastSyncToGist = 0;
        if (playerInterval) clearInterval(playerInterval);
        playerInterval = setInterval(() => {
            const c = cfg();
            if (!c.enabled) return;
            const isPlayerOpen = Lampa.Player.opened();
            const currentTime = getCurrentPlayerTime();
            if (isPlayerOpen && !wasPlayerOpen) setTimeout(() => { videoDuration = getVideoDuration(); }, 2000);
            if (wasPlayerOpen && !isPlayerOpen) {
                if (currentMovieTime > 0) { saveProgress(currentMovieTime, true); if (c.auto_sync && c.gist_token && c.gist_id) setTimeout(() => syncToGist(false), 500); }
                currentMovieTime = 0; currentMovieKey = null; lastSavedProgress = 0; videoDuration = 0;
            }
            wasPlayerOpen = isPlayerOpen;
            if (isPlayerOpen && currentTime !== null && currentTime > 0) {
                currentMovieTime = currentTime;
                const movieKey = getCurrentMovieKey();
                if (movieKey && movieKey !== currentMovieKey) { currentMovieKey = movieKey; lastSavedProgress = 0; videoDuration = 0; }
                if (c.auto_save && Math.floor(currentTime) - lastSavedProgress >= 10) {
                    if (saveProgress(currentTime, false)) {
                        const now = Date.now();
                        if (c.auto_sync && (now - lastSyncToGist) >= c.sync_interval * 1000) { setTimeout(() => syncToGist(false), 100); lastSyncToGist = now; }
                    }
                }
            }
        }, 1000);
    }
    
    function cleanupTimeline() {
        const c = cfg();
        if (!c.cleanup_older_days && !c.cleanup_completed) return;
        const now = Date.now();
        const olderThan = c.cleanup_older_days * 24 * 60 * 60 * 1000;
        const timeline = getTimeline();
        let changed = false;
        for (const key in timeline) {
            const record = timeline[key];
            if (olderThan > 0 && record.updated && (now - record.updated) > olderThan) { delete timeline[key]; changed = true; }
            else if (c.cleanup_completed && record.percent >= 95) { delete timeline[key]; changed = true; }
        }
        if (changed) { saveTimeline(timeline); notify('🧹 Таймкоды очищены'); }
    }
    
    function clearAllTimeline() {
        Lampa.Select.show({
            title: '⚠️ Очистить все таймкоды?',
            items: [{ title: '✅ Да, очистить', action: 'clear' }, { title: '❌ Отмена', action: 'cancel' }],
            onSelect: (opt) => { if (opt.action === 'clear') { saveTimeline({}); notify('🗑️ Таймкоды очищены'); } },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    // ======================
    // СТАТУС НА КАРТОЧКЕ
    // ======================

    function getCategoryDisplay(category, tmdbId) {
        const displays = {
            'watching': { text: 'Смотрю', icon: '👁️' },
            'abandoned': { text: 'Брошено', icon: '❌' },
            'watched': { text: 'Просмотрено', icon: '✅' },
            'planned': { text: 'Буду смотреть', icon: '📋' },
            'favorite': { text: 'В избранном', icon: '⭐' },
            'collection': { text: 'В коллекции', icon: '📦' }
        };
        const base = displays[category];
        if (!base) return null;
        let extraInfo = '', extraText = '';
        if (category === 'watching' && tmdbId) {
            const baseId = getBaseTmdbId(tmdbId);
            const timeline = getTimeline();
            let timelineItem = null;
            for (const key in timeline) { if (getBaseTmdbId(timeline[key].tmdb_id) === baseId) { timelineItem = timeline[key]; break; } }
            if (timelineItem) { extraInfo = ` ${timelineItem.percent || 0}%`; extraText = `Прогресс: ${timelineItem.percent || 0}%`; }
        }
        if (category === 'abandoned' && tmdbId) {
            const baseId = getBaseTmdbId(tmdbId);
            const favorites = getFavorites();
            const item = favorites.find(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category === 'abandoned');
            if (item) {
                const daysAgo = Math.floor((Date.now() - (item.updated || item.added)) / (1000 * 60 * 60 * 24));
                if (daysAgo > 0) { extraInfo = daysAgo === 1 ? ' 1 день' : ` ${daysAgo} дн.`; extraText = `Не смотрели ${daysAgo} ${getDaysWord(daysAgo)}`; }
            }
        }
        return { ...base, displayText: base.text + extraInfo, extraText, category };
    }

    function getDaysWord(days) {
        if (days % 10 === 1 && days % 100 !== 11) return 'день';
        if (days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20)) return 'дня';
        return 'дней';
    }

    function getMovieStatus(movie) {
        const tmdbId = extractTmdbId(movie);
        if (!tmdbId) return null;
        const baseId = getBaseTmdbId(tmdbId);
        const favorites = getFavorites();
        const movieCategories = favorites.filter(f => getBaseTmdbId(f.tmdb_id) === baseId).map(f => f.category);
        if (movieCategories.length === 0) return null;
        let bestCategory = null, bestPriority = 999;
        for (const cat of movieCategories) { const priority = STATUS_PRIORITY[cat] || 999; if (priority < bestPriority) { bestPriority = priority; bestCategory = cat; } }
        if (bestCategory === 'collection' && movieCategories.length > 1) {
            for (const cat of movieCategories) { if (cat !== 'collection') { const priority = STATUS_PRIORITY[cat] || 999; if (priority < bestPriority) { bestPriority = priority; bestCategory = cat; } } }
        }
        if (bestCategory === 'favorite' && movieCategories.length > 1) {
            for (const cat of movieCategories) { if (cat !== 'favorite' && cat !== 'collection') return getCategoryDisplay(cat, tmdbId); }
        }
        return getCategoryDisplay(bestCategory, tmdbId);
    }

    function addStatusToCard() {
        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite') {
                setTimeout(() => {
                    try {
                        const movie = e.data.movie;
                        if (!movie || !movie.id) return;
                        const statusContainer = $('.full-start__status').first();
                        if (!statusContainer.length) return;
                        $('.nsl-movie-status').remove();
                        const status = getMovieStatus(movie);
                        if (!status) return;
                        const statusEl = $(`<div class="full-start__status nsl-movie-status" style="margin-left:8px;display:flex;align-items:center;gap:6px;padding:0 12px;height:32px;border-radius:4px;background-color:rgba(0,0,0,0.4);color:rgba(255,255,255,0.9)!important;font-size:16px!important;font-weight:400;cursor:help;white-space:nowrap;border:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);" title="${status.extraText || status.text}"><span style="font-size:16px!important;line-height:1;">${status.icon}</span><span style="font-size:16px!important;line-height:1;">${status.displayText}</span></div>`);
                        statusContainer.after(statusEl);
                    } catch (err) { console.error('[NSL] Error adding status:', err); }
                }, 300);
            }
        });
    }

    function refreshCardStatus() {
        const movie = Lampa.Activity.active()?.movie;
        if (!movie) return;
        $('.nsl-movie-status').remove();
        const status = getMovieStatus(movie);
        if (!status) return;
        const statusContainer = $('.full-start__status').first();
        if (!statusContainer.length) return;
        const statusEl = $(`<div class="full-start__status nsl-movie-status" style="margin-left:8px;display:flex;align-items:center;gap:6px;padding:0 12px;height:32px;border-radius:4px;background-color:rgba(0,0,0,0.4);color:rgba(255,255,255,0.9)!important;font-size:16px!important;font-weight:400;cursor:help;white-space:nowrap;border:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);" title="${status.extraText || status.text}"><span style="font-size:16px!important;line-height:1;">${status.icon}</span><span style="font-size:16px!important;line-height:1;">${status.displayText}</span></div>`);
        statusContainer.after(statusEl);
    }

    function refreshFavoriteButton() {
        const movie = Lampa.Activity.active()?.movie;
        if (!movie) return;
        const button = $('.nsl-favorite-button');
        if (!button.length) return;
        const tmdbId = extractTmdbId(movie);
        const baseId = getBaseTmdbId(tmdbId);
        const isAny = getFavorites().some(f => getBaseTmdbId(f.tmdb_id) === baseId && f.category !== 'collection');
        button.find('path').attr('fill', isAny ? 'currentColor' : 'none');
    }

    // ======================
    // КНОПКА НА КАРТОЧКЕ
    // ======================
    
    function addFavoriteButtonToCard() {
        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite') {
                setTimeout(() => {
                    try {
                        const movie = e.data.movie;
                        if (!movie || !movie.id) return;
                        const buttonsContainer = $('.full-start-new__buttons, .full-start__buttons').first();
                        if (!buttonsContainer.length || buttonsContainer.find('.nsl-favorite-button').length) return;
                        const isFavorite = isInFavorites(movie, 'favorite');
                        const button = $(`<div class="full-start__button selector nsl-favorite-button" tabindex="0" role="button"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/></svg><span>В избранное</span></div>`);
                        button.on('hover:enter', () => {
                            const categories = [
                                { id: 'favorite', name: 'Избранное', checked: isInFavorites(movie, 'favorite') },
                                { id: 'watching', name: 'Смотрю', checked: isInFavorites(movie, 'watching') },
                                { id: 'planned', name: 'Буду смотреть', checked: isInFavorites(movie, 'planned') },
                                { id: 'watched', name: 'Просмотрено', checked: isInFavorites(movie, 'watched') },
                                { id: 'abandoned', name: 'Брошено', checked: isInFavorites(movie, 'abandoned') },
                                { id: 'collection', name: 'Коллекция', checked: isInFavorites(movie, 'collection') }
                            ];
                            const items = categories.map(cat => ({ title: cat.name, checkbox: true, checked: cat.checked, category: cat.id }));
                            items.push({ title: '──────────', separator: true }, { title: '❌ Закрыть', action: 'close' });
                            Lampa.Select.show({
                                title: 'Добавить в избранное', items: items,
                                onCheck: (item) => {
                                    setTimeout(() => {
                                        toggleFavorite(movie, item.category);
                                        const isAny = categories.some(c => c.id !== 'collection' && isInFavorites(movie, c.id));
                                        button.find('path').attr('fill', isAny ? 'currentColor' : 'none');
                                        refreshCardStatus();
                                    }, 50);
                                },
                                onSelect: (item) => {
                                    if (item.action === 'close') return;
                                    setTimeout(() => {
                                        toggleFavorite(movie, item.category);
                                        const isAny = categories.some(c => c.id !== 'collection' && isInFavorites(movie, c.id));
                                        button.find('path').attr('fill', isAny ? 'currentColor' : 'none');
                                        refreshCardStatus();
                                    }, 50);
                                },
                                onBack: () => Lampa.Controller.toggle('content')
                            });
                        });
                        const playButton = buttonsContainer.find('.button--play, .full-start__button').first();
                        playButton.length ? playButton.before(button) : buttonsContainer.prepend(button);
                        if (isAndroid && Lampa.Controller) setTimeout(() => Lampa.Controller.collectionSet(buttonsContainer), 100);
                    } catch (err) { console.error('[NSL] Error adding button:', err); }
                }, 500);
            }
        });
    }

    // ======================
    // НАША СТРАНИЦА ИЗБРАННОГО
    // ======================

    function registerNSLFavoritesComponent() {
        if (!Lampa.Component) {
            console.warn('[NSL] Lampa.Component не доступен');
            return;
        }
        
        // Основная страница избранного
        Lampa.Component.add('nsl_favorites', {
            component: function(object) {
                console.log('[NSL] Создание нашей страницы избранного');
                let comp = Lampa.Utils.createInstance(Lampa.Main, object, { empty: { router: 'bookmarks' } });
                if (Lampa.EmptyRouter) comp.use(Lampa.EmptyRouter, 0);
                
                comp.use({
                    onCreate: function() {
                        let lines = [];
                        
                        // Категории
                        let categoryLine = {
                            results: [],
                            params: {
                                module: Lampa.LineModule ? Lampa.LineModule.toggle(Lampa.LineModule.MASK.base, 'More', 'Event') : {},
                                items: { view: 20 }
                            }
                        };
                        
                        FAVORITE_CATEGORIES.forEach(cat => {
                            const count = getFavoritesByCategory(cat.id).length;
                            if (count > 0) {
                                categoryLine.results.push({
                                    title: cat.icon + ' ' + cat.name,
                                    count: count,
                                    params: {
                                        module: Lampa.RegisterModule ? Lampa.RegisterModule.only('Line', 'Callback') : {},
                                        createInstance: (item) => Lampa.Register ? new Lampa.Register(item) : item,
                                        emit: {
                                            onEnter: () => Lampa.Activity.push({ url: '', title: cat.name, component: 'nsl_category', source: 'tmdb', category: cat.id, page: 1 })
                                        }
                                    }
                                });
                            }
                        });
                        
                        if (categoryLine.results.length > 0) lines.push(categoryLine);
                        
                        // Карточки по категориям
                        FAVORITE_CATEGORIES.forEach(cat => {
                            const items = getFavoritesByCategory(cat.id);
                            if (items.length > 0) {
                                const movies = items.filter(i => i.media_type === 'movie' || (!i.media_type && !i.data?.original_name));
                                const series = items.filter(i => i.media_type === 'tv' || i.data?.original_name);
                                let cards = [];
                                
                                if (movies.length > 0 && series.length > 0) {
                                    cards.push({
                                        results: movies, media: 'movies', title: 'Фильмы', count: movies.length,
                                        params: {
                                            module: Lampa.CardModule ? Lampa.CardModule.only('Folder', 'Callback') : {},
                                            emit: {
                                                onEnter: () => Lampa.Activity.push({ url: '', title: cat.name + ' - Фильмы', component: 'nsl_category', source: 'tmdb', category: cat.id, filter: 'movie', page: 1 })
                                            }
                                        }
                                    });
                                    cards.push({
                                        results: series, media: 'tv', title: 'Сериалы', count: series.length,
                                        params: {
                                            module: Lampa.CardModule ? Lampa.CardModule.only('Folder', 'Callback') : {},
                                            emit: {
                                                onEnter: () => Lampa.Activity.push({ url: '', title: cat.name + ' - Сериалы', component: 'nsl_category', source: 'tmdb', category: cat.id, filter: 'tv', page: 1 })
                                            }
                                        }
                                    });
                                }
                                
                                items.slice(0, 20).forEach(item => {
                                    const card = item.data || {};
                                    card.params = {
                                        emit: {
                                            onEnter: (data) => {
                                                let method = item.media_type === 'tv' || card.original_name ? 'tv' : 'movie';
                                                const cardObject = { id: card.id || item.card_id || getBaseTmdbId(item.tmdb_id), source: card.source || 'tmdb', title: card.title, name: card.name, original_name: card.original_name, poster_path: card.poster_path, backdrop_path: card.backdrop_path, overview: card.overview, vote_average: card.vote_average, first_air_date: card.first_air_date, release_date: card.release_date, img: card.img };
                                                Object.keys(cardObject).forEach(k => { if (cardObject[k] === undefined) delete cardObject[k]; });
                                                Lampa.Activity.push({ id: cardObject.id, method: method, card: cardObject, url: '', component: 'full', source: cardObject.source, page: 1 });
                                            },
                                            onFocus: () => { if (Lampa.Background && card.backdrop_path) Lampa.Background.change(Lampa.Utils.cardImgBackground(card)); }
                                        }
                                    };
                                    cards.push(card);
                                });
                                
                                lines.push({
                                    title: cat.icon + ' ' + cat.name, results: cards, type: cat.id,
                                    total_pages: items.length > 20 ? Math.ceil(items.length / 20) : 1,
                                    params: {
                                        module: Lampa.LineModule ? Lampa.LineModule.toggle(Lampa.LineModule.MASK.base, 'Event') : {},
                                        emit: { onMore: () => Lampa.Activity.push({ url: '', title: cat.name, component: 'nsl_category', source: 'tmdb', category: cat.id, page: 2 }) }
                                    }
                                });
                            }
                        });
                        
                        if (Lampa.ContentRows) Lampa.ContentRows.call('bookmarks', {}, lines);
                        lines.length > 0 ? comp.build(lines) : comp.empty();
                    }
                });
                
                return comp;
            }
        });
        
        // Страница отдельной категории
        Lampa.Component.add('nsl_category', {
            component: function(object) {
                let comp = Lampa.Utils.createInstance(Lampa.Category || Lampa.Items.Category, object, {
                    module: Lampa.CategoryModule ? Lampa.CategoryModule.toggle(Lampa.CategoryModule.MASK.base, 'Pagination') : {},
                    empty: { type: object.category, router: 'favorites' }
                });
                if (Lampa.EmptyRouter) comp.use(Lampa.EmptyRouter, 0);
                
                comp.use({
                    onCreate: function() {
                        let items = getFavoritesByCategory(object.category);
                        if (object.filter === 'movie') items = items.filter(i => i.media_type === 'movie' || (!i.media_type && !i.data?.original_name));
                        else if (object.filter === 'tv') items = items.filter(i => i.media_type === 'tv' || i.data?.original_name);
                        
                        const page = object.page || 1, perPage = 20;
                        const pageItems = items.slice((page - 1) * perPage, page * perPage);
                        
                        let cards = pageItems.map(item => {
                            const card = item.data || {};
                            card.params = {
                                emit: {
                                    onEnter: (data) => {
                                        let method = item.media_type === 'tv' || card.original_name ? 'tv' : 'movie';
                                        const cardObject = { id: card.id || item.card_id || getBaseTmdbId(item.tmdb_id), source: card.source || 'tmdb', title: card.title, name: card.name, original_name: card.original_name, poster_path: card.poster_path, backdrop_path: card.backdrop_path, overview: card.overview, vote_average: card.vote_average, first_air_date: card.first_air_date, release_date: card.release_date, img: card.img };
                                        Object.keys(cardObject).forEach(k => { if (cardObject[k] === undefined) delete cardObject[k]; });
                                        Lampa.Activity.push({ id: cardObject.id, method: method, card: cardObject, url: '', component: 'full', source: cardObject.source, page: 1 });
                                    },
                                    onFocus: () => { if (Lampa.Background && card.backdrop_path) Lampa.Background.change(Lampa.Utils.cardImgBackground(card)); }
                                }
                            };
                            return card;
                        });
                        
                        setTimeout(() => this.build({ results: cards, page: page, total_pages: Math.ceil(items.length / perPage) }), 10);
                    },
                    onNext: function(resolve, reject) {
                        let items = getFavoritesByCategory(object.category);
                        if (object.filter === 'movie') items = items.filter(i => i.media_type === 'movie' || (!i.media_type && !i.data?.original_name));
                        else if (object.filter === 'tv') items = items.filter(i => i.media_type === 'tv' || i.data?.original_name);
                        
                        const page = object.page || 1, perPage = 20;
                        const pageItems = items.slice((page - 1) * perPage, page * perPage);
                        
                        resolve({ results: pageItems.map(item => { const card = item.data || {}; card.params = { emit: { onEnter: (data) => { let method = item.media_type === 'tv' || card.original_name ? 'tv' : 'movie'; Lampa.Activity.push({ id: card.id || item.card_id || getBaseTmdbId(item.tmdb_id), method: method, card: card, url: '', component: 'full', source: card.source || 'tmdb', page: 1 }); } } }; return card; }), page: page, total_pages: Math.ceil(items.length / perPage) });
                    }
                });
                
                return comp;
            }
        });
        
        console.log('[NSL] Компоненты NSL Favorites зарегистрированы');
    }

    function addFavoritesToMenu() {
        const menuList = $('.menu__list').eq(1);
        if (!menuList.length || $('.nsl-favorites-item').length) return;
        const el = $(`<li class="menu__item selector nsl-favorites-item"><div class="menu__text">⭐ Избранное</div></li>`);
        el.on('hover:enter', (e) => {
            e.stopPropagation();
            Lampa.Activity.push({ url: '', title: 'Избранное', component: 'nsl_favorites', source: 'tmdb', page: 1 });
        });
        menuList.append(el);
    }

    // ======================
    // ТАЙМКОДЫ НА КАРТОЧКАХ
    // ======================

    function getTimelinePositionStyles() {
        const c = cfg();
        const pos = c.timeline_position || 'bottom';
        return { bottom: `bottom: 2.5em !important; top: auto !important;`, center: `bottom: auto !important; top: 50% !important; transform: translateY(-50%) !important;`, top: `bottom: auto !important; top: 0.5em !important;` }[pos] || `bottom: 2.5em !important; top: auto !important;`;
    }

    function injectTimelineStyles() {
        const oldStyle = document.getElementById('nsl-timeline-styles');
        if (oldStyle) oldStyle.remove();
        const positionStyles = getTimelinePositionStyles();
        const style = document.createElement('style');
        style.id = 'nsl-timeline-styles';
        style.textContent = `.card .card-watched { display: block !important; opacity: 1 !important; visibility: visible !important; pointer-events: none; ${positionStyles} left: 0.8em !important; right: 0.8em !important; z-index: 5 !important; background-color: rgba(0, 0, 0, 0.7) !important; -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); border-radius: 0.5em !important; } .card:not(.focus) .card-watched { display: block !important; opacity: 1 !important; visibility: visible !important; } .card-watched[style*="display: none"] { display: block !important; } .card-watched__item:nth-child(n+3) { display: none !important; } .card--wide .card-watched__item:nth-child(n+2) { display: none !important; }`;
        document.head.appendChild(style);
        timelineStylesInjected = true;
    }

    function removeTimelineStyles() { const s = document.getElementById('nsl-timeline-styles'); if (s) s.remove(); timelineStylesInjected = false; }

    function patchTimelineModule() {
        if (timelineModulePatched || !Lampa.Maker?.map) return;
        try {
            const cardMap = Lampa.Maker.map('Card');
            if (cardMap?.Watched) {
                const orig = cardMap.Watched.onCreate;
                cardMap.Watched.onCreate = function() {
                    if (orig) orig.call(this);
                    if (!cfg().show_timeline_on_cards) return;
                    setTimeout(() => this.emit('watched'), 100);
                    Lampa.Listener.follow('state:changed', (e) => { if (e.target === 'timeline') setTimeout(() => this.emit('watched'), 50); });
                };
                timelineModulePatched = true;
            }
        } catch(e) {}
    }

    function forceRefreshCards() {
        if (!cfg().show_timeline_on_cards) return;
        if (Lampa.Timeline?.read) Lampa.Timeline.read(true);
        setTimeout(() => document.querySelectorAll('.card').forEach(c => { c.classList.add('focus'); setTimeout(() => c.classList.remove('focus'), 50); }), 200);
    }

    function enableTimelineOnCards() { injectTimelineStyles(); patchTimelineModule(); forceRefreshCards(); }
    function disableTimelineOnCards() { removeTimelineStyles(); }

    // ======================
    // РЕЙТИНГИ НА КАРТОЧКАХ
    // ======================

    function getCardRatings(card) {
        const ratings = {}, c = cfg();
        if (card.vote_average && (c.ratings_source === 'tmdb' || c.ratings_source === 'both')) ratings.tmdb = parseFloat(card.vote_average).toFixed(1);
        if ((c.ratings_source === 'kp' || c.ratings_source === 'both')) {
            if (card.kp_rating) ratings.kp = parseFloat(card.kp_rating).toFixed(1);
            else if (card.rating) ratings.kp = parseFloat(card.rating).toFixed(1);
        }
        return ratings;
    }

    function getDisplayRating(card) {
        const ratings = getCardRatings(card), c = cfg();
        if (c.ratings_source === 'both') return ratings.kp || ratings.tmdb || null;
        if (c.ratings_source === 'kp') return ratings.kp || null;
        if (c.ratings_source === 'tmdb') return ratings.tmdb || null;
        return null;
    }

    function updateCardRatingElement(cardElement, cardData) {
        const rating = getDisplayRating(cardData);
        let voteEl = cardElement.querySelector('.card__vote');
        if (rating) {
            if (!voteEl) { const viewEl = cardElement.querySelector('.card__view'); if (viewEl) { voteEl = document.createElement('div'); voteEl.className = 'card__vote'; viewEl.appendChild(voteEl); } }
            if (voteEl) { voteEl.textContent = rating; voteEl.style.display = ''; }
        } else if (voteEl) voteEl.style.display = 'none';
    }

    function processExistingCards() { document.querySelectorAll('.card.card--loaded').forEach(c => { if (c.card_data) updateCardRatingElement(c, c.card_data); }); }

    function setupRatingsObserver() {
        if (ratingsObserver) ratingsObserver.disconnect();
        if (!cfg().show_ratings || !cfg().ratings_on_cards) return;
        ratingsObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === 1) {
                        if (node.classList?.contains('card')) setTimeout(() => { if (node.card_data) updateCardRatingElement(node, node.card_data); }, 100);
                        const cards = node.querySelectorAll ? node.querySelectorAll('.card') : [];
                        cards.forEach(c => setTimeout(() => { if (c.card_data) updateCardRatingElement(c, c.card_data); }, 100));
                    }
                }
            }
        });
        ratingsObserver.observe(document.body, { childList: true, subtree: true });
        setTimeout(processExistingCards, 500);
    }

    function patchCardRender() {
        if (!Lampa.Maker?.map) return;
        try {
            const cardMap = Lampa.Maker.map('Card');
            if (cardMap?.Base) {
                const orig = cardMap.Base.onCreate;
                cardMap.Base.onCreate = function() {
                    if (orig) orig.call(this);
                    if (!cfg().show_ratings || !cfg().ratings_on_cards) return;
                    setTimeout(() => { const d = this.data, e = this.render().get(0); if (d && e) updateCardRatingElement(e, d); }, 50);
                };
            }
        } catch(e) {}
    }

    function enableRatings() { patchCardRender(); setupRatingsObserver(); processExistingCards(); }
    function disableRatings() { if (ratingsObserver) { ratingsObserver.disconnect(); ratingsObserver = null; } document.querySelectorAll('.card__vote').forEach(el => el.style.display = 'none'); }
    function refreshRatingsSettings() { const c = cfg(); c.show_ratings && c.ratings_on_cards ? enableRatings() : disableRatings(); }

    // ======================
    // GITHUB GIST СИНХРОНИЗАЦИЯ
    // ======================

    function getGistData() { const c = cfg(); return (c.gist_token && c.gist_id) ? { token: c.gist_token, id: c.gist_id } : null; }
    function getAllSyncData() { return { version: 5, profile_id: PROFILE_ID, updated: new Date().toISOString(), bookmarks: getBookmarks(), favorites: getFavorites(), timeline: getTimeline() }; }

    function mergeTimeline(localTimeline, remoteTimeline, strategy) {
        const merged = { ...localTimeline }; let changes = 0;
        for (const key in remoteTimeline) {
            const remoteRec = remoteTimeline[key], localRec = merged[key];
            if (!remoteRec.updated) remoteRec.updated = remoteRec.saved_at || 0;
            if (!localRec) { merged[key] = remoteRec; changes++; }
            else {
                if (!localRec.updated) localRec.updated = localRec.saved_at || 0;
                const ru = remoteRec.updated || 0, lu = localRec.updated || 0, rt = remoteRec.time || 0, lt = localRec.time || 0;
                let upd = false;
                if (strategy === 'max_time') { if (rt > lt) upd = true; }
                else { if (ru > lu) upd = true; else if (ru === lu && rt > lt) upd = true; }
                if (upd) { merged[key] = remoteRec; changes++; }
            }
        }
        return { merged, changes };
    }

    function cleanupDuplicateCategories() {
        const favorites = getFavorites(); const tmdbMap = new Map(); let changed = false;
        for (const item of favorites) { const baseId = getBaseTmdbId(item.tmdb_id); if (!tmdbMap.has(baseId)) tmdbMap.set(baseId, []); tmdbMap.get(baseId).push(item); }
        for (const [baseId, items] of tmdbMap) {
            if (items.length <= 1) continue;
            const categories = items.map(i => i.category); let keep = [...categories];
            if (categories.includes('abandoned')) keep = keep.filter(c => c === 'abandoned' || c === 'collection');
            else if (categories.includes('watched')) keep = keep.filter(c => c === 'watched' || c === 'collection');
            else if (categories.includes('watching')) keep = keep.filter(c => c === 'watching' || c === 'collection');
            else if (categories.includes('planned') && categories.includes('favorite')) keep = ['planned', 'collection'];
            const uniqueKeep = [...new Set(keep)];
            for (const item of items) { if (!uniqueKeep.includes(item.category)) { const idx = favorites.findIndex(f => f.id === item.id); if (idx >= 0) { favorites.splice(idx, 1); changed = true; } } }
            for (const cat of uniqueKeep) { const catItems = items.filter(i => i.category === cat); if (catItems.length > 1) { catItems.sort((a, b) => (b.updated || 0) - (a.updated || 0)); for (let i = 1; i < catItems.length; i++) { const idx = favorites.findIndex(f => f.id === catItems[i].id); if (idx >= 0) { favorites.splice(idx, 1); changed = true; } } } }
        }
        if (changed) { saveFavorites(favorites); logMove('cleanup', 'Система', null, null); }
        return changed;
    }

    function syncToGist(showNotify) {
        const gist = getGistData();
        if (!gist) { if (showNotify) notify('⚠️ GitHub Gist не настроен'); return; }
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`, method: 'GET',
            headers: { 'Authorization': `token ${gist.token}`, 'Accept': 'application/vnd.github.v3+json' },
            success: (data) => {
                try {
                    const content = data.files['nsl_sync.json']?.content;
                    let remoteData = { bookmarks: [], favorites: [], timeline: {} };
                    if (content) remoteData = JSON.parse(content);
                    const localData = getAllSyncData(), strategy = cfg().sync_strategy;
                    const { merged: mergedTimeline } = mergeTimeline(localData.timeline, remoteData.timeline || {}, strategy);
                    const mergedFavorites = [...(remoteData.favorites || [])];
                    for (const localFav of localData.favorites) {
                        const key = `${getBaseTmdbId(localFav.tmdb_id)}_${localFav.category}`;
                        const existingIndex = mergedFavorites.findIndex(f => `${getBaseTmdbId(f.tmdb_id)}_${f.category}` === key);
                        if (existingIndex === -1) mergedFavorites.push(localFav);
                        else { const remoteFav = mergedFavorites[existingIndex]; if ((localFav.updated || 0) > (remoteFav.updated || 0)) mergedFavorites[existingIndex] = localFav; }
                    }
                    const mergedBookmarks = [...(remoteData.bookmarks || [])];
                    for (const localBm of localData.bookmarks) { if (!mergedBookmarks.some(b => b.key === localBm.key)) mergedBookmarks.push(localBm); }
                    $.ajax({
                        url: `https://api.github.com/gists/${gist.id}`, method: 'PATCH',
                        headers: { 'Authorization': `token ${gist.token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                        data: JSON.stringify({ description: 'NSL Sync Data', public: false, files: { 'nsl_sync.json': { content: JSON.stringify({ version: 5, profile_id: PROFILE_ID, updated: new Date().toISOString(), bookmarks: mergedBookmarks, favorites: mergedFavorites, timeline: mergedTimeline }) } } }),
                        success: () => {
                            saveTimeline(mergedTimeline); saveFavorites(mergedFavorites); saveBookmarks(mergedBookmarks);
                            syncTimelineWithCategories();
                            if (showNotify) notify('✅ Синхронизировано');
                            Lampa.Storage.set(GIST_CACHE + '_last_sync', Date.now());
                            setTimeout(() => renderBookmarks(), 500);
                        },
                        error: (xhr) => { console.error('[NSL] Send error:', xhr.status); if (showNotify) notify('❌ Ошибка отправки'); },
                        timeout: 15000, crossDomain: true
                    });
                } catch(e) { console.error('[NSL] Sync error:', e); if (showNotify) notify('❌ Ошибка синхронизации'); }
            },
            error: (xhr) => {
                console.error('[NSL] Gist fetch error:', xhr.status);
                const localData = getAllSyncData();
                $.ajax({
                    url: `https://api.github.com/gists/${gist.id}`, method: 'PATCH',
                    headers: { 'Authorization': `token ${gist.token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                    data: JSON.stringify({ description: 'NSL Sync Data', public: false, files: { 'nsl_sync.json': { content: JSON.stringify(localData) } } }),
                    success: () => { if (showNotify) notify('✅ Отправлено'); Lampa.Storage.set(GIST_CACHE + '_last_sync', Date.now()); },
                    error: () => { if (showNotify) notify('❌ Ошибка'); },
                    timeout: 15000, crossDomain: true
                });
            },
            timeout: 15000, crossDomain: true
        });
    }

    function syncFromGist(showNotify) {
        const gist = getGistData();
        if (!gist) { if (showNotify) notify('⚠️ GitHub Gist не настроен'); return; }
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`, method: 'GET',
            headers: { 'Authorization': `token ${gist.token}`, 'Accept': 'application/vnd.github.v3+json' },
            success: (data) => {
                try {
                    const content = data.files['nsl_sync.json']?.content;
                    if (!content) { if (showNotify) notify('⚠️ Файл не найден'); return; }
                    const remote = JSON.parse(content), strategy = cfg().sync_strategy; let totalChanges = 0;
                    if (remote.timeline) {
                        const localTimeline = getTimeline();
                        const { merged, changes } = mergeTimeline(localTimeline, remote.timeline, strategy);
                        if (changes > 0) { saveTimeline(merged); totalChanges += changes; for (const key in remote.timeline) { const rec = merged[key]; if (Lampa.Timeline?.update) Lampa.Timeline.update({ hash: key, percent: rec.percent || 0, time: rec.time || 0, duration: rec.duration || 0 }); } }
                    }
                    if (remote.favorites) {
                        const localFavs = getFavorites(); let changed = false;
                        for (const remoteFav of remote.favorites) {
                            const key = `${getBaseTmdbId(remoteFav.tmdb_id)}_${remoteFav.category}`;
                            const existingIndex = localFavs.findIndex(f => `${getBaseTmdbId(f.tmdb_id)}_${f.category}` === key);
                            if (existingIndex === -1) { localFavs.push(remoteFav); changed = true; }
                            else { const localFav = localFavs[existingIndex]; if ((remoteFav.updated || 0) > (localFav.updated || 0)) { localFavs[existingIndex] = remoteFav; changed = true; } }
                        }
                        if (changed) { saveFavorites(localFavs); totalChanges++; }
                    }
                    if (remote.bookmarks) {
                        const localBookmarks = getBookmarks(); let changed = false;
                        for (const remoteBm of remote.bookmarks) { if (!localBookmarks.some(b => b.key === remoteBm.key)) { localBookmarks.push(remoteBm); changed = true; } }
                        if (changed) { saveBookmarks(localBookmarks); totalChanges++; }
                    }
                    cleanupDuplicateCategories(); syncTimelineWithCategories();
                    Lampa.Storage.set(GIST_CACHE + '_last_sync', Date.now());
                    setTimeout(() => renderBookmarks(), 500);
                    if (showNotify) notify(totalChanges > 0 ? `📥 Загружено ${totalChanges} изм.` : '✅ Актуально');
                } catch(e) { console.error('[NSL] Parse error:', e); if (showNotify) notify('❌ Ошибка чтения'); }
            },
            error: (xhr) => { console.error('[NSL] Load error:', xhr.status); if (showNotify) notify('❌ Ошибка загрузки'); },
            timeout: 15000, crossDomain: true
        });
    }

    function checkAutoSync() {
        const c = cfg();
        if (!c.sync_auto_interval) return;
        if (Date.now() - Lampa.Storage.get(GIST_CACHE + '_last_sync', 0) > (c.sync_interval_minutes || 60) * 60 * 1000) syncFromGist(false);
    }

    let syncTimer = null;
    function startAutoSync() { if (syncTimer) clearInterval(syncTimer); syncTimer = setInterval(() => checkAutoSync(), 5 * 60 * 1000); }

    // ======================
    // НАСТРОЙКИ
    // ======================

    function showMainMenu() {
        const c = cfg();
        const tPos = c.timeline_position === 'bottom' ? 'снизу' : (c.timeline_position === 'center' ? 'по центру' : 'сверху');
        const rSrc = c.ratings_source === 'both' ? 'КП + TMDB' : (c.ratings_source === 'kp' ? 'Кинопоиск' : 'TMDB');
        
        Lampa.Select.show({
            title: 'NSL Sync v26',
            items: [
                { title: `📌 Закладки разделов (${getBookmarks().length})`, action: 'sections' },
                { title: `⭐ Избранное (${getFavorites().length})`, action: 'favorites' },
                { title: `⏱️ Таймкоды (${Object.keys(getTimeline()).length})`, action: 'timeline' },
                { title: `☁️ GitHub Gist`, action: 'gist' },
                { title: '──────────', separator: true },
                { title: `🎬 Таймкоды на карточках: ${c.show_timeline_on_cards ? 'Вкл' : 'Выкл'}`, action: 'toggle_timeline_cards' },
                { title: `📍 Позиция таймкодов: ${tPos}`, action: 'timeline_position' },
                { title: '──────────', separator: true },
                { title: `⭐ Рейтинги: ${c.show_ratings ? 'Вкл' : 'Выкл'}`, action: 'toggle_ratings' },
                { title: `📊 Источник рейтингов: ${rSrc}`, action: 'ratings_source' },
                { title: `🖼️ На карточках: ${c.ratings_on_cards ? 'Вкл' : 'Выкл'}`, action: 'toggle_ratings_cards' },
                { title: `📄 На странице: ${c.ratings_on_full ? 'Вкл' : 'Выкл'}`, action: 'toggle_ratings_full' },
                { title: '──────────', separator: true },
                { title: `🔄 Синхронизировать сейчас`, action: 'sync_now' },
                { title: `🧹 Очистить дубликаты`, action: 'cleanup_duplicates' },
                { title: `📋 Лог перемещений`, action: 'show_log' },
                { title: `❌ Закрыть`, action: 'cancel' }
            ],
            onSelect: (item) => {
                const c = cfg();
                if (item.action === 'sections') showSectionsSettings();
                else if (item.action === 'favorites') showFavoritesSettings();
                else if (item.action === 'timeline') showTimelineSettings();
                else if (item.action === 'gist') showGistSetup();
                else if (item.action === 'toggle_timeline_cards') { c.show_timeline_on_cards = !c.show_timeline_on_cards; saveCfg(c); c.show_timeline_on_cards ? enableTimelineOnCards() : disableTimelineOnCards(); notify('Таймкоды ' + (c.show_timeline_on_cards ? 'включены' : 'выключены')); showMainMenu(); }
                else if (item.action === 'timeline_position') {
                    Lampa.Select.show({
                        title: 'Позиция', items: [{ title: 'Снизу', action: 'bottom' }, { title: 'По центру', action: 'center' }, { title: 'Сверху', action: 'top' }],
                        onSelect: (s) => { if (s.action) { c.timeline_position = s.action; saveCfg(c); if (c.show_timeline_on_cards) enableTimelineOnCards(); notify('Позиция: ' + s.action); } showMainMenu(); },
                        onBack: () => showMainMenu()
                    });
                }
                else if (item.action === 'toggle_ratings') { c.show_ratings = !c.show_ratings; saveCfg(c); refreshRatingsSettings(); notify('Рейтинги ' + (c.show_ratings ? 'включены' : 'выключены')); showMainMenu(); }
                else if (item.action === 'ratings_source') {
                    Lampa.Select.show({
                        title: 'Источник', items: [{ title: 'Кинопоиск', action: 'kp' }, { title: 'TMDB', action: 'tmdb' }, { title: 'КП + TMDB', action: 'both' }],
                        onSelect: (s) => { if (s.action) { c.ratings_source = s.action; saveCfg(c); refreshRatingsSettings(); notify('Источник: ' + (s.action === 'both' ? 'КП + TMDB' : s.action === 'kp' ? 'Кинопоиск' : 'TMDB')); } showMainMenu(); },
                        onBack: () => showMainMenu()
                    });
                }
                else if (item.action === 'toggle_ratings_cards') { c.ratings_on_cards = !c.ratings_on_cards; saveCfg(c); refreshRatingsSettings(); notify('На карточках ' + (c.ratings_on_cards ? 'вкл' : 'выкл')); showMainMenu(); }
                else if (item.action === 'toggle_ratings_full') { c.ratings_on_full = !c.ratings_on_full; saveCfg(c); notify('На странице ' + (c.ratings_on_full ? 'вкл' : 'выкл')); showMainMenu(); }
                else if (item.action === 'sync_now') { notify('🔄 Синхронизация...'); syncToGist(true); setTimeout(() => syncFromGist(true), 1500); }
                else if (item.action === 'cleanup_duplicates') { if (cleanupDuplicateCategories()) { notify('🧹 Дубликаты очищены'); syncTimelineWithCategories(); } else notify('✅ Дубликатов не найдено'); showMainMenu(); }
                else if (item.action === 'show_log') showMoveLog();
            },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }
    
    function showMoveLog() {
        const log = getMoveLog();
        if (log.length === 0) { notify('📋 Лог пуст'); return; }
        const items = log.slice(-30).reverse().map(entry => {
            const time = new Date(entry.time).toLocaleString(); let text = '';
            if (entry.action === 'move') { const fc = FAVORITE_CATEGORIES.find(c => c.id === entry.from)?.name || entry.from; const tc = FAVORITE_CATEGORIES.find(c => c.id === entry.to)?.name || entry.to; text = `📦 "${entry.title}" ${fc} → ${tc}`; }
            else if (entry.action === 'auto_watching') text = `👁️ "${entry.title}" → Смотрю`;
            else if (entry.action === 'auto_watched') text = `✅ "${entry.title}" → Просмотрено`;
            else if (entry.action === 'auto_abandoned') text = `❌ "${entry.title}" → Брошено`;
            else if (entry.action === 'return_abandoned') text = `🔄 "${entry.title}" возвращён в Смотрю`;
            else if (entry.action === 'return_watched') text = `🔄 "${entry.title}" возвращён в Смотрю (повтор)`;
            else if (entry.action === 'delete') text = `🗑️ "${entry.title}" удалён полностью`;
            else if (entry.action === 'clear_all') text = `🗑️ Всё избранное очищено`;
            else if (entry.action === 'cleanup') text = `🧹 Системная очистка дубликатов`;
            else text = `${entry.action}: ${entry.title}`;
            return { title: text, sub: time };
        });
        items.push({ title: '──────────', separator: true }, { title: '🗑️ Очистить лог', action: 'clear' }, { title: '❌ Закрыть', onSelect: () => {} });
        Lampa.Select.show({ title: '📋 Лог перемещений', items: items, onSelect: (item) => { if (item.action === 'clear') { saveMoveLog([]); notify('📋 Лог очищен'); } }, onBack: () => showMainMenu() });
    }
    
    function showSectionsSettings() {
        const c = cfg();
        Lampa.Select.show({
            title: '📌 Закладки разделов',
            items: [
                { title: `📍 Положение: ${c.button_position === 'side' ? 'Боковое меню' : 'Верхняя панель'}`, action: 'toggle_position' },
                { title: `📌 Сохранить раздел`, action: 'save_section' },
                { title: `🗑️ Очистить (${getBookmarks().length})`, action: 'clear_sections' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'toggle_position') { c.button_position = c.button_position === 'side' ? 'top' : 'side'; saveCfg(c); notify('Применится после перезагрузки'); showSectionsSettings(); }
                else if (item.action === 'save_section') { saveBookmark(); setTimeout(() => showSectionsSettings(), 1000); }
                else if (item.action === 'clear_sections') { saveBookmarks([]); notify('🗑️ Закладки удалены'); showSectionsSettings(); }
                else if (item.action === 'back') showMainMenu();
            },
            onBack: () => showMainMenu()
        });
    }
    
    function showFavoritesSettings() {
        const c = cfg();
        Lampa.Select.show({
            title: '⭐ Избранное',
            items: [
                { title: `🔔 Уведомления: ${c.show_move_notifications ? 'Вкл' : 'Выкл'}`, action: 'toggle_notifications' },
                { title: '──────────', separator: true },
                { title: `🔄 Авто в Брошено: ${c.auto_abandoned ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_abandoned' },
                { title: `📅 Дней до Брошено: ${c.abandoned_days}`, action: 'set_abandoned_days' },
                { title: '──────────', separator: true },
                { title: `👁️ Авто в Смотрю: ${c.auto_watching ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_watching' },
                { title: `📊 Порог Смотрю: ${c.watching_min_progress}%-${c.watching_max_progress}%`, action: 'set_watching_range' },
                { title: '──────────', separator: true },
                { title: `✅ Авто в Просмотрено: ${c.auto_watched ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_watched' },
                { title: `📊 Порог Просмотрено: ${c.watched_min_progress}%`, action: 'set_watched_threshold' },
                { title: '──────────', separator: true },
                { title: `🗑️ Очистить всё`, action: 'clear_favorites' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'toggle_notifications') { c.show_move_notifications = !c.show_move_notifications; saveCfg(c); showFavoritesSettings(); }
                else if (item.action === 'toggle_auto_abandoned') { c.auto_abandoned = !c.auto_abandoned; saveCfg(c); showFavoritesSettings(); }
                else if (item.action === 'set_abandoned_days') { Lampa.Input.edit({ title: 'Дней', value: String(c.abandoned_days), free: true, number: true }, (val) => { if (val && !isNaN(val) && val > 0) { c.abandoned_days = parseInt(val); saveCfg(c); } showFavoritesSettings(); }); }
                else if (item.action === 'toggle_auto_watching') { c.auto_watching = !c.auto_watching; saveCfg(c); showFavoritesSettings(); }
                else if (item.action === 'set_watching_range') showWatchingRangeSettings();
                else if (item.action === 'toggle_auto_watched') { c.auto_watched = !c.auto_watched; saveCfg(c); showFavoritesSettings(); }
                else if (item.action === 'set_watched_threshold') { Lampa.Input.edit({ title: 'Порог %', value: String(c.watched_min_progress), free: true, number: true }, (val) => { if (val && !isNaN(val) && val >= 0 && val <= 100) { c.watched_min_progress = parseInt(val); saveCfg(c); } showFavoritesSettings(); }); }
                else if (item.action === 'clear_favorites') { clearAllFavorites(); showFavoritesSettings(); }
                else if (item.action === 'back') showMainMenu();
            },
            onBack: () => showMainMenu()
        });
    }
    
    function showWatchingRangeSettings() {
        const c = cfg();
        Lampa.Select.show({
            title: '📊 Порог "Смотрю"',
            items: [
                { title: `Мин: ${c.watching_min_progress}%`, action: 'set_min' },
                { title: `Макс: ${c.watching_max_progress}%`, action: 'set_max' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'set_min') { Lampa.Input.edit({ title: 'Мин. %', value: String(c.watching_min_progress), free: true, number: true }, (val) => { if (val && !isNaN(val) && val >= 0 && val <= 100) { c.watching_min_progress = parseInt(val); saveCfg(c); } showWatchingRangeSettings(); }); }
                else if (item.action === 'set_max') { Lampa.Input.edit({ title: 'Макс. %', value: String(c.watching_max_progress), free: true, number: true }, (val) => { if (val && !isNaN(val) && val >= 0 && val <= 100) { c.watching_max_progress = parseInt(val); saveCfg(c); } showWatchingRangeSettings(); }); }
                else if (item.action === 'back') showFavoritesSettings();
            },
            onBack: () => showFavoritesSettings()
        });
    }
    
    function showTimelineSettings() {
        const c = cfg();
        const sName = c.sync_strategy === 'max_time' ? 'По длительности' : 'По дате';
        Lampa.Select.show({
            title: '⏱️ Таймкоды',
            items: [
                { title: `✅ Автосохранение: ${c.auto_save ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_save' },
                { title: `✅ Автосинхронизация: ${c.auto_sync ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_sync' },
                { title: `⏱️ Интервал: ${c.sync_interval}с`, action: 'set_interval' },
                { title: `📊 Стратегия: ${sName}`, action: 'toggle_strategy' },
                { title: `🗑️ Старше: ${c.cleanup_older_days || 'никогда'} дн.`, action: 'set_cleanup_days' },
                { title: `✅ Завершённые: ${c.cleanup_completed ? 'Вкл' : 'Выкл'}`, action: 'toggle_cleanup_completed' },
                { title: `🗑️ Очистить все`, action: 'clear_timeline' },
                { title: `🧹 Очистить старые`, action: 'cleanup_now' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'toggle_auto_save') { c.auto_save = !c.auto_save; saveCfg(c); showTimelineSettings(); }
                else if (item.action === 'toggle_auto_sync') { c.auto_sync = !c.auto_sync; saveCfg(c); showTimelineSettings(); }
                else if (item.action === 'set_interval') { Lampa.Input.edit({ title: 'Секунд', value: String(c.sync_interval), free: true, number: true }, (val) => { if (val && !isNaN(val) && val > 0) { c.sync_interval = parseInt(val); saveCfg(c); } showTimelineSettings(); }); }
                else if (item.action === 'toggle_strategy') { c.sync_strategy = c.sync_strategy === 'max_time' ? 'last_watch' : 'max_time'; saveCfg(c); notify('Стратегия: ' + (c.sync_strategy === 'max_time' ? 'По длительности' : 'По дате')); showTimelineSettings(); }
                else if (item.action === 'set_cleanup_days') { Lampa.Input.edit({ title: 'Дней (0=откл)', value: String(c.cleanup_older_days), free: true, number: true }, (val) => { if (val !== null && !isNaN(val)) { c.cleanup_older_days = parseInt(val); saveCfg(c); } showTimelineSettings(); }); }
                else if (item.action === 'toggle_cleanup_completed') { c.cleanup_completed = !c.cleanup_completed; saveCfg(c); showTimelineSettings(); }
                else if (item.action === 'clear_timeline') { clearAllTimeline(); showTimelineSettings(); }
                else if (item.action === 'cleanup_now') { cleanupTimeline(); showTimelineSettings(); }
                else if (item.action === 'back') showMainMenu();
            },
            onBack: () => showMainMenu()
        });
    }
    
    function showGistSetup() {
        const c = cfg();
        Lampa.Select.show({
            title: '☁️ GitHub Gist',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓' : '❌'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0, 8) + '…' : '❌'}`, action: 'id' },
                { title: '──────────', separator: true },
                { title: '📤 Экспорт', action: 'upload' },
                { title: '📥 Импорт', action: 'download' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'token') { Lampa.Input.edit({ title: 'Token', value: c.gist_token || '', free: true }, (val) => { if (val !== null) { c.gist_token = val; saveCfg(c); notify('Сохранён'); } showGistSetup(); }); }
                else if (item.action === 'id') { Lampa.Input.edit({ title: 'Gist ID', value: c.gist_id || '', free: true }, (val) => { if (val !== null) { c.gist_id = val; saveCfg(c); notify('Сохранён'); } showGistSetup(); }); }
                else if (item.action === 'upload') { notify('📤 Отправка...'); syncToGist(true); setTimeout(() => showGistSetup(), 1500); }
                else if (item.action === 'download') { notify('📥 Загрузка...'); syncFromGist(true); setTimeout(() => showGistSetup(), 1500); }
                else if (item.action === 'back') showMainMenu();
            },
            onBack: () => showMainMenu()
        });
    }

    function addSettingsButton() {
        setTimeout(() => {
            let menuList = $('.menu__list').last();
            if (!menuList.length) menuList = $('.menu__list').eq(1);
            if (menuList.length && !$('.nsl-settings-item'.length) {
                const el = $(`<li class="menu__item selector nsl-settings-item"><div class="menu__text">⚙️ NSL Sync</div></li>`);
                el.on('hover:enter', (e) => { e.stopPropagation(); showMainMenu(); });
                menuList.append(el);
            }
        }, 2000);
    }

    // ======================
    // ИНИЦИАЛИЗАЦИЯ
    // ======================

    function onAppClose() { const c = cfg(); if (c.sync_on_close && c.gist_token && c.gist_id) syncToGist(false); }
    function onAppStart() { const c = cfg(); if (c.sync_on_start && c.gist_token && c.gist_id) setTimeout(() => syncFromGist(false), 5000); }

    function init() {
        if (!cfg().enabled) return;
        console.log('[NSL] Init v26 for profile:', PROFILE_ID);

        setTimeout(() => registerNSLFavoritesComponent(), 500);

        setTimeout(() => {
            addBookmarkButton();
            addFavoritesToMenu();
            addSettingsButton();
            renderBookmarks();
        }, 1000);

        addFavoriteButtonToCard();
        addStatusToCard();
        initPlayerHandler();
        
        startAutoSync();
        onAppStart();
        
        const c = cfg();
        if (c.show_timeline_on_cards) enableTimelineOnCards();
        if (c.show_ratings) refreshRatingsSettings();
        
        setTimeout(() => { cleanupDuplicateCategories(); syncTimelineWithCategories(); }, 3000);
        
        Lampa.Listener.follow('state:changed', (e) => {
            if (e.target === 'nsl_favorites' || e.target === 'timeline') {
                setTimeout(() => { refreshCardStatus(); refreshFavoriteButton(); }, 100);
            }
        });
        
        window.addEventListener('beforeunload', onAppClose);
        
        window.NSL = {
            cfg, getFavorites, getBookmarks, getTimeline,
            syncToGist, syncFromGist, addToFavorites, toggleFavorite,
            getMoveLog, getMovieStatus, refreshCardStatus,
            cleanupDuplicateCategories, enableTimelineOnCards, refreshRatingsSettings
        };
        
        console.log('[NSL] Init complete');
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });

})();
