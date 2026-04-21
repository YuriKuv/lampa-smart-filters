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
    const STORE_BOOKMARKS = `nsl_bookmarks_${PROFILE_ID}_v2`;
    const STORE_FAVORITES = `nsl_favorites_${PROFILE_ID}_v2`;
    const STORE_HISTORY = `nsl_history_${PROFILE_ID}_v2`;
    const STORE_TIMELINE = `nsl_timeline_${PROFILE_ID}_v2`;
    const CFG = `nsl_cfg_${PROFILE_ID}_v2`;
    const GIST_CACHE = `nsl_gist_cache_${PROFILE_ID}`;

    window.NSL = {};

    const FAVORITE_CATEGORIES = [
        { id: 'favorite', name: '⭐ Избранное', icon: '⭐' },
        { id: 'watching', name: '👁️ Смотрю', icon: '👁️' },
        { id: 'planned', name: '📋 Буду смотреть', icon: '📋' },
        { id: 'watched', name: '✅ Просмотрено', icon: '✅' },
        { id: 'abandoned', name: '❌ Брошено', icon: '❌' },
        { id: 'collection', name: '📦 Коллекция', icon: '📦' }
    ];

    const MEDIA_TYPES = {
        movie: { name: 'Фильмы', icon: '🎬' },
        tv: { name: 'Сериалы', icon: '📺' },
        cartoon: { name: 'Мультфильмы', icon: '🐭' },
        cartoon_series: { name: 'Мультсериалы', icon: '🐭📺' },
        anime: { name: 'Аниме', icon: '🇯🇵' }
    };

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
            show_continue: true,
            continue_min_progress: 5,
            continue_max_progress: 95,
            cleanup_older_days: 0,
            cleanup_completed: false
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
    
    function getHistory() { return Lampa.Storage.get(STORE_HISTORY, []) || []; }
    function saveHistory(l) { Lampa.Storage.set(STORE_HISTORY, l, true); }
    
    function getTimeline() { return Lampa.Storage.get(STORE_TIMELINE, {}) || {}; }
    function saveTimeline(t) { Lampa.Storage.set(STORE_TIMELINE, t, true); }

    function notify(text) { 
        if (Lampa.Noty) Lampa.Noty.show(text);
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
            'overview', 'genre_ids', 'source', 'animation', 'anime'];
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

    let lock = false;
    
    function unlock() { setTimeout(() => { lock = false; }, 200); }

    function saveBookmark() {
        if (lock) return;
        lock = true;

        const act = Lampa.Activity.active();

        if (!isAllowedForBookmark()) {
            notify('Здесь нельзя создать закладку');
            return unlock();
        }

        if (bookmarkExists(act)) {
            notify('Уже есть');
            return unlock();
        }

        Lampa.Input.edit({
            title: 'Название',
            value: act.title || act.name || 'Закладка'
        }, (val) => {
            if (!val) return unlock();

            const l = getBookmarks();
            l.push({ ...normalizeBookmark(act), name: val.trim() });
            saveBookmarks(l);

            const c = cfg();
            if (c.sync_on_add && c.gist_token && c.gist_id) {
                setTimeout(() => syncToGist(false), 100);
            }

            notify('Сохранено');
            unlock();
        }, unlock);
    }

    function removeBookmark(item) {
        const l = getBookmarks().filter(i => i.id !== item.id);
        saveBookmarks(l);
        notify('Удалено');
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
        const menuList = $('.menu__list').first();
        if (!menuList.length) return;

        getBookmarks().forEach(item => {
            const el = $(`
                <li class="menu__item selector nsl-bookmark-item">
                    <div class="menu__ico">${ICON_FLAG}</div>
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
                        { title: 'Нет', action: 'cancel' },
                        { title: 'Да', action: 'remove' }
                    ],
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
                const btn = $(`
                    <li class="menu__item selector" data-nsl-save>
                        <div class="menu__ico">${ICON_ADD}</div>
                        <div class="menu__text">Сохранить раздел</div>
                    </li>
                `);
                btn.on('hover:enter', (e) => {
                    e.stopPropagation();
                    saveBookmark();
                });
                menuList.prepend(btn);
            }
        } else if (c.button_position === 'top') {
            const head = $('.head__actions, .head__buttons').first();
            if (head.length) {
                const btn = $(`
                    <div class="head__action selector" data-nsl-save>
                        <div class="head__action-ico">${ICON_ADD}</div>
                    </div>
                `);
                btn.on('hover:enter', (e) => {
                    e.stopPropagation();
                    saveBookmark();
                });
                head.prepend(btn);
            }
        }
    }

    // ======================
    // ИЗБРАННОЕ
    // ======================
    
    function addToFavorites(card, category) {
        if (!card || !card.id) return false;
        
        const tmdbId = extractTmdbId(card);
        const mediaType = getMediaType(card);
        const favorites = getFavorites();
        const existingIndex = favorites.findIndex(f => f.tmdb_id === tmdbId && f.category === category);
        
        const favoriteItem = {
            id: Date.now(),
            card_id: card.id,
            tmdb_id: tmdbId,
            media_type: mediaType,
            category: category,
            data: cleanCardData(card),
            added: Date.now(),
            updated: Date.now()
        };
        
        if (existingIndex >= 0) {
            favorites[existingIndex] = favoriteItem;
        } else {
            favorites.push(favoriteItem);
        }
        
        setTimeout(() => {
            saveFavorites(favorites);
            checkAutoAbandoned();
        }, 50);
        
        return true;
    }
    
    function removeFromFavorites(card, category) {
        const tmdbId = extractTmdbId(card);
        const favorites = getFavorites();
        const index = favorites.findIndex(f => f.tmdb_id === tmdbId && f.category === category);
        
        if (index >= 0) {
            favorites.splice(index, 1);
            setTimeout(() => saveFavorites(favorites), 50);
            return true;
        }
        return false;
    }
    
    function toggleFavorite(card, category) {
        return isInFavorites(card, category) ? removeFromFavorites(card, category) : addToFavorites(card, category);
    }
    
    function isInFavorites(card, category) {
        const tmdbId = extractTmdbId(card);
        return getFavorites().some(f => f.tmdb_id === tmdbId && f.category === category);
    }
    
    function getFavoritesByCategory(category) {
        return getFavorites().filter(f => f.category === category);
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
                item.category = 'abandoned';
                item.updated = now;
                changed = true;
            }
        }
        
        if (changed) {
            setTimeout(() => saveFavorites(favorites), 50);
            setTimeout(() => notify('📦 Некоторые позиции перемещены в "Брошено"'), 100);
        }
    }
    
    function clearAllFavorites() {
        Lampa.Select.show({
            title: '⚠️ Очистить всё избранное?',
            items: [
                { title: '✅ Да, очистить всё', action: 'clear' },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: (opt) => { 
                if (opt.action === 'clear') { 
                    saveFavorites([]); 
                    notify('🗑️ Избранное очищено'); 
                } 
            },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    // ======================
    // ИСТОРИЯ
    // ======================
    
    function addToHistory(card, progress) {
        if (!card || !card.id) return false;
        
        const tmdbId = extractTmdbId(card);
        const mediaType = getMediaType(card);
        const history = getHistory();
        const existingIndex = history.findIndex(h => h.tmdb_id === tmdbId);
        
        const historyItem = {
            id: Date.now(),
            card_id: card.id,
            tmdb_id: tmdbId,
            media_type: mediaType,
            data: cleanCardData(card),
            watched_at: Date.now(),
            progress: progress || { percent: 100 }
        };
        
        if (existingIndex >= 0) {
            history[existingIndex] = historyItem;
        } else {
            history.unshift(historyItem);
        }
        
        saveHistory(history.length > 500 ? history.slice(0, 500) : history);
        return true;
    }
    
    function clearHistory() {
        Lampa.Select.show({
            title: '⚠️ Очистить всю историю?',
            items: [
                { title: '✅ Да, очистить', action: 'clear' },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: (opt) => { 
                if (opt.action === 'clear') { 
                    saveHistory([]); 
                    notify('🗑️ История очищена'); 
                } 
            },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }
    
    function getHistoryByMediaType(mediaType) {
        const history = getHistory();
        return mediaType === 'all' ? [...history] : history.filter(h => h.media_type === mediaType);
    }

    // ======================
    // ТАЙМКОДЫ
    // ======================
    
    let playerInterval = null;
    let currentMovieTime = 0;
    let currentMovieKey = null;
    let lastSavedProgress = 0;
    let videoDuration = 0;
    
    function getCurrentMovieKey() {
        try {
            const activity = Lampa.Activity.active();
            if (!activity || !activity.movie) return null;
            
            const movie = activity.movie;
            const tmdbId = extractTmdbId(movie);
            if (!tmdbId) return null;
            
            const playerData = Lampa.Player.playdata();
            if (playerData && (playerData.season || playerData.episode)) {
                return `${tmdbId}_s${playerData.season || 1}_e${playerData.episode || 1}`;
            }
            
            return String(tmdbId);
        } catch (e) {
            return null;
        }
    }
    
    function getCurrentPlayerTime() {
        try {
            if (Lampa.Player.opened()) {
                const playerData = Lampa.Player.playdata();
                if (playerData?.timeline?.time !== undefined) return playerData.timeline.time;
            }
        } catch (e) {}
        return null;
    }
    
    function getVideoDuration() {
        try {
            const playerData = Lampa.Player.playdata();
            if (playerData?.timeline?.duration && playerData.timeline.duration > 0) return playerData.timeline.duration;
            
            const video = document.querySelector('video');
            if (video && video.duration && !isNaN(video.duration) && video.duration > 0) return video.duration;
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
            
            timeline[movieKey] = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: Date.now(),
                tmdb_id: tmdbId
            };
            
            saveTimeline(timeline);
            lastSavedProgress = currentTime;
            currentMovieTime = currentTime;
            
            if (Lampa.Timeline?.update) {
                Lampa.Timeline.update({ hash: movieKey, percent: percent, time: currentTime, duration: duration });
            }
            
            return true;
        }
        return false;
    }
    
    function initPlayerHandler() {
        let wasPlayerOpen = false;
        let lastSyncToGist = 0;
        
        if (playerInterval) clearInterval(playerInterval);
        
        playerInterval = setInterval(() => {
            const c = cfg();
            if (!c.enabled) return;
            
            const isPlayerOpen = Lampa.Player.opened();
            const currentTime = getCurrentPlayerTime();
            
            if (isPlayerOpen && !wasPlayerOpen) {
                setTimeout(() => { videoDuration = getVideoDuration(); }, 2000);
            }
            
            if (wasPlayerOpen && !isPlayerOpen) {
                if (currentMovieTime > 0) {
                    saveProgress(currentMovieTime, true);
                    
                    if (videoDuration > 0) {
                        const percent = Math.round((currentMovieTime / videoDuration) * 100);
                        if (percent >= 90) {
                            const activity = Lampa.Activity.active();
                            if (activity && activity.movie) addToHistory(activity.movie, { percent: percent });
                        }
                    }
                    
                    if (c.auto_sync && c.gist_token && c.gist_id) {
                        setTimeout(() => syncToGist(false), 500);
                    }
                    
                    setTimeout(() => addContinueToMenu(), 1000);
                }
                
                currentMovieTime = 0;
                currentMovieKey = null;
                lastSavedProgress = 0;
                videoDuration = 0;
            }
            
            wasPlayerOpen = isPlayerOpen;
            
            if (isPlayerOpen && currentTime !== null && currentTime > 0) {
                currentMovieTime = currentTime;
                const movieKey = getCurrentMovieKey();
                
                if (movieKey && movieKey !== currentMovieKey) {
                    currentMovieKey = movieKey;
                    lastSavedProgress = 0;
                    videoDuration = 0;
                }
                
                if (c.auto_save && Math.floor(currentTime) - lastSavedProgress >= 10) {
                    if (saveProgress(currentTime, false)) {
                        const now = Date.now();
                        if (c.auto_sync && (now - lastSyncToGist) >= c.sync_interval * 1000) {
                            setTimeout(() => syncToGist(false), 100);
                            lastSyncToGist = now;
                        }
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
            if (olderThan > 0 && record.updated && (now - record.updated) > olderThan) {
                delete timeline[key];
                changed = true;
            } else if (c.cleanup_completed && record.percent >= 95) {
                delete timeline[key];
                changed = true;
            }
        }
        
        if (changed) {
            saveTimeline(timeline);
            notify('🧹 Таймкоды очищены');
        }
    }
    
    function clearAllTimeline() {
        Lampa.Select.show({
            title: '⚠️ Очистить все таймкоды?',
            items: [
                { title: '✅ Да, очистить', action: 'clear' },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: (opt) => { 
                if (opt.action === 'clear') { 
                    saveTimeline({}); 
                    notify('🗑️ Таймкоды очищены'); 
                } 
            },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    // ======================
    // ПРОДОЛЖИТЬ ПРОСМОТР
    // ======================
    
    function getContinueWatching() {
        const c = cfg();
        if (!c.show_continue) return [];
        
        const timeline = getTimeline();
        const favorites = getFavorites();
        const result = [];
        
        for (const [key, timelineItem] of Object.entries(timeline)) {
            const percent = timelineItem.percent || 0;
            
            if (percent >= c.continue_min_progress && percent <= c.continue_max_progress) {
                const favoriteItem = favorites.find(f => f.tmdb_id === timelineItem.tmdb_id);
                
                result.push({
                    key: key,
                    tmdb_id: timelineItem.tmdb_id,
                    time: timelineItem.time || 0,
                    percent: percent,
                    duration: timelineItem.duration || 0,
                    updated: timelineItem.updated || 0,
                    data: favoriteItem?.data || { id: timelineItem.tmdb_id, title: 'ID: ' + timelineItem.tmdb_id }
                });
            }
        }
        
        result.sort((a, b) => (b.updated || 0) - (a.updated || 0));
        return result;
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
                    
                    // Ищем контейнер с кнопками
                    const buttonsContainer = $('.full-start-new__buttons, .full-start__buttons').first();
                    if (!buttonsContainer.length) return;
                    if (buttonsContainer.find('.nsl-favorite-button').length) return;
                    
                    const isFavorite = isInFavorites(movie, 'favorite');
                    
                    // Создаем кнопку с правильными классами для навигации
                    const button = $(`
                        <div class="full-start__button selector nsl-favorite-button" tabindex="0" role="button">
                            <svg viewBox="0 0 24 24" width="20" height="20">
                                <path fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" 
                                      d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/>
                            </svg>
                            <span>В избранное</span>
                        </div>
                    `);
                    
                    // Обработчик выбора
                    button.on('hover:enter', () => {
                        const categories = [
                            { id: 'favorite', name: 'Избранное', checked: isInFavorites(movie, 'favorite') },
                            { id: 'watching', name: 'Смотрю', checked: isInFavorites(movie, 'watching') },
                            { id: 'planned', name: 'Буду смотреть', checked: isInFavorites(movie, 'planned') },
                            { id: 'watched', name: 'Просмотрено', checked: isInFavorites(movie, 'watched') },
                            { id: 'abandoned', name: 'Брошено', checked: isInFavorites(movie, 'abandoned') },
                            { id: 'collection', name: 'Коллекция', checked: isInFavorites(movie, 'collection') }
                        ];
                        
                        const items = categories.map(cat => ({
                            title: cat.name, checkbox: true, checked: cat.checked, category: cat.id
                        }));
                        
                        items.push({ title: '──────────', separator: true });
                        items.push({ title: '❌ Закрыть', action: 'close' });
                        
                        Lampa.Select.show({
                            title: 'Добавить в избранное',
                            items: items,
                            onCheck: (item) => {
                                setTimeout(() => {
                                    toggleFavorite(movie, item.category);
                                    const isAny = categories.some(c => c.id !== 'collection' && isInFavorites(movie, c.id));
                                    button.find('path').attr('fill', isAny ? 'currentColor' : 'none');
                                }, 50);
                            },
                            onSelect: (item) => {
                                if (item.action === 'close') return;
                                setTimeout(() => {
                                    toggleFavorite(movie, item.category);
                                    const isAny = categories.some(c => c.id !== 'collection' && isInFavorites(movie, c.id));
                                    button.find('path').attr('fill', isAny ? 'currentColor' : 'none');
                                }, 50);
                            },
                            onBack: () => Lampa.Controller.toggle('content')
                        });
                    });
                    
                    // Важно: добавляем кнопку ПЕРЕД кнопкой "Смотреть" чтобы она была первой в навигации
                    const playButton = buttonsContainer.find('.button--play, .full-start__button').first();
                    if (playButton.length) {
                        playButton.before(button);
                    } else {
                        buttonsContainer.prepend(button);
                    }
                    
                    // Для Android TV: обновляем навигацию
                    if (isAndroid && Lampa.Controller) {
                        setTimeout(() => {
                            // Принудительно обновляем коллекцию фокусируемых элементов
                            Lampa.Controller.collectionSet(buttonsContainer);
                        }, 100);
                    }
                    
                } catch (err) {
                    console.error('[NSL] Error adding button:', err);
                }
            }, 500);
        }
    });
}

    // ======================
    // МЕНЮ
    // ======================
    
    function addFavoritesToMenu() {
        const menuList = $('.menu__list').eq(1);
        if (!menuList.length) return;
        if ($('.nsl-favorites-item').length) return;
        
        const el = $(`
            <li class="menu__item selector nsl-favorites-item">
                <div class="menu__text">⭐ Избранное</div>
            </li>
        `);
        el.on('hover:enter', (e) => { e.stopPropagation(); showFavoritesMenu(); });
        menuList.append(el);
    }
    
    function addHistoryToMenu() {
        const menuList = $('.menu__list').eq(1);
        if (!menuList.length) return;
        if ($('.nsl-history-item').length) return;
        
        const el = $(`
            <li class="menu__item selector nsl-history-item">
                <div class="menu__text">📜 История</div>
            </li>
        `);
        el.on('hover:enter', (e) => { e.stopPropagation(); showHistoryMenu(); });
        menuList.append(el);
    }
    
    function addContinueToMenu() {
        const c = cfg();
        if (!c.show_continue) return;
        
        const continueItems = getContinueWatching();
        if (continueItems.length === 0) return;
        
        let menuList = $('.menu__list').eq(1);
        if (!menuList.length) menuList = $('.menu__list').last();
        if (!menuList.length) return;
        
        $('.nsl-continue-item').remove();
        
        const el = $(`
            <li class="menu__item selector nsl-continue-item">
                <div class="menu__text">⏱️ Продолжить (${continueItems.length})</div>
            </li>
        `);
        el.on('hover:enter', (e) => { e.stopPropagation(); showContinueMenu(); });
        menuList.append(el);
    }
    
    function showFavoritesMenu() {
        const items = FAVORITE_CATEGORIES.map(cat => {
            const count = getFavoritesByCategory(cat.id).length;
            return { title: `${cat.icon} ${cat.name} (${count})`, onSelect: () => showFavoritesByCategory(cat.id, cat.name) };
        });
        
        items.push({ title: '──────────', separator: true });
        items.push({ title: '🗑️ Очистить всё', onSelect: () => clearAllFavorites() });
        items.push({ title: '❌ Закрыть', onSelect: () => Lampa.Controller.toggle('content') });
        
        Lampa.Select.show({ 
            title: '⭐ Избранное', 
            items: items, 
            onBack: () => Lampa.Controller.toggle('content')
        });
    }
    
    function showFavoritesByCategory(category, categoryName) {
        const items = getFavoritesByCategory(category);
        if (items.length === 0) { notify(`В "${categoryName}" ничего нет`); return; }
        
        const grouped = {};
        for (const type in MEDIA_TYPES) {
            grouped[type] = items.filter(item => item.media_type === type);
        }
        
        const menuItems = [];
        for (const [type, typeItems] of Object.entries(grouped)) {
            if (typeItems.length > 0) {
                const typeInfo = MEDIA_TYPES[type];
                menuItems.push({
                    title: `${typeInfo.icon} ${typeInfo.name} (${typeItems.length})`,
                    onSelect: () => showFavoritesList(typeItems, `${categoryName} - ${typeInfo.name}`)
                });
            }
        }
        
        menuItems.push({ title: '──────────', separator: true });
        menuItems.push({ title: '◀ Назад', onSelect: () => showFavoritesMenu() });
        menuItems.push({ title: '❌ Закрыть', onSelect: () => Lampa.Controller.toggle('content') });
        
        Lampa.Select.show({ 
            title: categoryName, 
            items: menuItems, 
            onBack: () => showFavoritesMenu()
        });
    }
    
    function showFavoritesList(items, title) {
        const menuItems = items.map(item => ({
            title: item.data?.title || item.data?.name || 'Без названия',
            onSelect: () => Lampa.Router.call('full', { id: item.card_id, source: item.data?.source || 'tmdb' }),
            onLongPress: () => {
                Lampa.Select.show({
                    title: `Удалить из "${title}"?`,
                    items: [
                        { title: '✅ Да, удалить', action: 'delete' },
                        { title: '❌ Отмена', action: 'cancel' }
                    ],
                    onSelect: (opt) => {
                        if (opt.action === 'delete') {
                            removeFromFavorites(item.data, item.category);
                            showFavoritesByCategory(item.category, title.split(' - ')[0]);
                        }
                    },
                    onBack: () => Lampa.Controller.toggle('content')
                });
            }
        }));
        
        menuItems.push({ title: '──────────', separator: true });
        menuItems.push({ title: '◀ Назад', onSelect: () => showFavoritesByCategory(items[0]?.category, title.split(' - ')[0]) });
        menuItems.push({ title: '❌ Закрыть', onSelect: () => Lampa.Controller.toggle('content') });
        
        Lampa.Select.show({ 
            title: title, 
            items: menuItems, 
            onBack: () => showFavoritesByCategory(items[0]?.category, title.split(' - ')[0])
        });
    }
    
    function showHistoryMenu() {
        const types = [
            { id: 'all', name: '📜 Вся история' },
            { id: 'movie', name: '🎬 Фильмы' },
            { id: 'tv', name: '📺 Сериалы' },
            { id: 'cartoon', name: '🐭 Мультфильмы' },
            { id: 'cartoon_series', name: '🐭📺 Мультсериалы' },
            { id: 'anime', name: '🇯🇵 Аниме' }
        ];
        
        const items = types.map(type => {
            const count = getHistoryByMediaType(type.id).length;
            return { title: `${type.name} (${count})`, onSelect: () => showHistoryList(type.id, type.name) };
        });
        
        items.push({ title: '──────────', separator: true });
        items.push({ title: '🗑️ Очистить историю', onSelect: () => clearHistory() });
        items.push({ title: '❌ Закрыть', onSelect: () => Lampa.Controller.toggle('content') });
        
        Lampa.Select.show({ 
            title: '📜 История просмотров', 
            items: items, 
            onBack: () => Lampa.Controller.toggle('content')
        });
    }
    
    function showHistoryList(mediaType, title) {
        const items = getHistoryByMediaType(mediaType);
        if (items.length === 0) { notify(`В "${title}" ничего нет`); return; }
        
        const menuItems = items.slice(0, 50).map(item => ({
            title: item.data?.title || item.data?.name || 'Без названия',
            sub: new Date(item.watched_at).toLocaleDateString(),
            onSelect: () => Lampa.Router.call('full', { id: item.card_id, source: item.data?.source || 'tmdb' })
        }));
        
        menuItems.push({ title: '──────────', separator: true });
        menuItems.push({ title: '◀ Назад', onSelect: () => showHistoryMenu() });
        menuItems.push({ title: '❌ Закрыть', onSelect: () => Lampa.Controller.toggle('content') });
        
        Lampa.Select.show({ 
            title: title, 
            items: menuItems, 
            onBack: () => showHistoryMenu()
        });
    }
    
    function showContinueMenu() {
        const items = getContinueWatching();
        if (items.length === 0) { notify('⏱️ Нет фильмов/сериалов для продолжения'); return; }
        
        const menuItems = items.map(item => {
            const title = item.data?.title || item.data?.name || item.tmdb_id || 'Без названия';
            return {
                title: title,
                sub: `${formatTime(item.time)} / ${formatTime(item.duration)} (${item.percent}%)`,
                onSelect: () => Lampa.Router.call('full', { id: item.tmdb_id, source: 'tmdb' })
            };
        });
        
        menuItems.push({ title: '──────────', separator: true });
        menuItems.push({ title: '❌ Закрыть', onSelect: () => Lampa.Controller.toggle('content') });
        
        Lampa.Select.show({ 
            title: '⏱️ Продолжить просмотр', 
            items: menuItems, 
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    // ======================
    // GITHUB GIST СИНХРОНИЗАЦИЯ
    // ======================

    function getGistData() {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) return null;
        return { token: c.gist_token, id: c.gist_id };
    }

    function getAllSyncData() {
        return {
            version: 3,
            profile_id: PROFILE_ID,
            updated: new Date().toISOString(),
            bookmarks: getBookmarks(),
            favorites: getFavorites(),
            history: getHistory(),
            timeline: getTimeline()
        };
    }

    function syncToGist(showNotify) {
        const gist = getGistData();
        if (!gist) { if (showNotify) notify('⚠️ GitHub Gist не настроен'); return; }

        const allData = getAllSyncData();
        
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${gist.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                description: 'NSL Sync Data',
                public: false,
                files: { 'nsl_sync.json': { content: JSON.stringify(allData) } }
            }),
            success: () => {
                if (showNotify) notify('✅ Отправлено');
                Lampa.Storage.set(GIST_CACHE + '_last_sync', Date.now());
            },
            error: () => { if (showNotify) notify('❌ Ошибка'); },
            timeout: 15000,
            crossDomain: true
        });
    }

    function syncFromGist(showNotify) {
        const gist = getGistData();
        if (!gist) { if (showNotify) notify('⚠️ GitHub Gist не настроен'); return; }

        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${gist.token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: (data) => {
                try {
                    const content = data.files['nsl_sync.json']?.content;
                    if (!content) return;

                    const remote = JSON.parse(content);
                    const strategy = cfg().sync_strategy;
                    let totalChanges = 0;
                    
                    if (remote.timeline) {
                        const localTimeline = getTimeline();
                        let changed = false;
                        
                        for (const key in remote.timeline) {
                            const remoteRec = remote.timeline[key];
                            const localRec = localTimeline[key];
                            
                            if (!remoteRec.updated) remoteRec.updated = 0;
                            
                            if (!localRec) {
                                localTimeline[key] = remoteRec;
                                changed = true;
                            } else {
                                if (!localRec.updated) localRec.updated = 0;
                                
                                if (strategy === 'max_time') {
                                    if (remoteRec.time > localRec.time) {
                                        localTimeline[key] = remoteRec;
                                        changed = true;
                                    }
                                } else {
                                    if (remoteRec.updated > localRec.updated) {
                                        localTimeline[key] = remoteRec;
                                        changed = true;
                                    }
                                }
                            }
                        }
                        
                        if (changed) { saveTimeline(localTimeline); totalChanges++; }
                    }
                    
                    if (remote.favorites) {
                        const localFavs = getFavorites();
                        let changed = false;
                        
                        for (const remoteFav of remote.favorites) {
                            const key = `${remoteFav.tmdb_id}_${remoteFav.category}`;
                            if (!localFavs.some(f => `${f.tmdb_id}_${f.category}` === key)) {
                                localFavs.push(remoteFav);
                                changed = true;
                            }
                        }
                        
                        if (changed) { saveFavorites(localFavs); totalChanges++; }
                    }
                    
                    if (remote.bookmarks) {
                        const localBookmarks = getBookmarks();
                        let changed = false;
                        
                        for (const remoteBm of remote.bookmarks) {
                            if (!localBookmarks.some(b => b.key === remoteBm.key)) {
                                localBookmarks.push(remoteBm);
                                changed = true;
                            }
                        }
                        
                        if (changed) { saveBookmarks(localBookmarks); totalChanges++; }
                    }
                    
                    if (remote.history) {
                        const localHistory = getHistory();
                        let changed = false;
                        
                        for (const remoteHist of remote.history) {
                            if (!localHistory.some(h => h.tmdb_id === remoteHist.tmdb_id)) {
                                localHistory.push(remoteHist);
                                changed = true;
                            }
                        }
                        
                        if (changed) {
                            localHistory.sort((a, b) => (b.watched_at || 0) - (a.watched_at || 0));
                            saveHistory(localHistory);
                            totalChanges++;
                        }
                    }

                    Lampa.Storage.set(GIST_CACHE + '_last_sync', Date.now());
                    
                    setTimeout(() => { addContinueToMenu(); renderBookmarks(); }, 500);
                    
                    if (showNotify) notify(totalChanges > 0 ? `📥 Загружено` : '✅ Актуально');
                    
                } catch(e) {
                    if (showNotify) notify('❌ Ошибка');
                }
            },
            error: () => { if (showNotify) notify('❌ Ошибка'); },
            timeout: 15000,
            crossDomain: true
        });
    }

    function checkAutoSync() {
        const c = cfg();
        if (!c.sync_auto_interval) return;
        
        const lastSync = Lampa.Storage.get(GIST_CACHE + '_last_sync', 0);
        if (Date.now() - lastSync > (c.sync_interval_minutes || 60) * 60 * 1000) {
            syncFromGist(false);
        }
    }

    let syncTimer = null;
    
    function startAutoSync() {
        if (syncTimer) clearInterval(syncTimer);
        syncTimer = setInterval(() => checkAutoSync(), 5 * 60 * 1000);
    }

    // ======================
    // НАСТРОЙКИ
    // ======================

    function showMainMenu() {
        Lampa.Select.show({
            title: 'NSL Sync v20',
            items: [
                { title: `📌 Закладки разделов (${getBookmarks().length})`, action: 'sections' },
                { title: `⭐ Избранное (${getFavorites().length})`, action: 'favorites' },
                { title: `📜 История (${getHistory().length})`, action: 'history' },
                { title: `⏱️ Таймкоды (${Object.keys(getTimeline()).length})`, action: 'timeline' },
                { title: `⏱️ Продолжить просмотр`, action: 'continue' },
                { title: `☁️ GitHub Gist`, action: 'gist' },
                { title: '──────────', separator: true },
                { title: `🔄 Синхронизировать сейчас`, action: 'sync_now' },
                { title: `❌ Закрыть`, action: 'cancel' }
            ],
            onSelect: (item) => {
                if (item.action === 'sections') showSectionsSettings();
                else if (item.action === 'favorites') showFavoritesSettings();
                else if (item.action === 'history') showHistoryMenu();
                else if (item.action === 'timeline') showTimelineSettings();
                else if (item.action === 'continue') showContinueSettings();
                else if (item.action === 'gist') showGistSetup();
                else if (item.action === 'sync_now') {
                    notify('🔄 Синхронизация...');
                    syncToGist(true);
                    setTimeout(() => syncFromGist(true), 1500);
                }
            },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }
    
    function showSectionsSettings() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '📌 Закладки разделов',
            items: [
                { title: `📍 Положение кнопки: ${c.button_position === 'side' ? 'Боковое меню' : 'Верхняя панель'}`, action: 'toggle_position' },
                { title: `📌 Сохранить текущий раздел`, action: 'save_section' },
                { title: `🗑️ Очистить все (${getBookmarks().length})`, action: 'clear_sections' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'toggle_position') {
                    c.button_position = c.button_position === 'side' ? 'top' : 'side';
                    saveCfg(c);
                    notify('Настройка применится после перезагрузки');
                    showSectionsSettings();
                } else if (item.action === 'save_section') {
                    saveBookmark();
                    setTimeout(() => showSectionsSettings(), 1000);
                } else if (item.action === 'clear_sections') {
                    saveBookmarks([]);
                    notify('🗑️ Все закладки удалены');
                    showSectionsSettings();
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: () => showMainMenu()
        });
    }
    
    function showFavoritesSettings() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '⭐ Избранное',
            items: [
                { title: `🔄 Авто в Брошено: ${c.auto_abandoned ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_abandoned' },
                { title: `📅 Дней до Брошено: ${c.abandoned_days}`, action: 'set_abandoned_days' },
                { title: `🗑️ Очистить всё`, action: 'clear_favorites' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'toggle_auto_abandoned') {
                    c.auto_abandoned = !c.auto_abandoned;
                    saveCfg(c);
                    showFavoritesSettings();
                } else if (item.action === 'set_abandoned_days') {
                    Lampa.Input.edit({ title: 'Дней без просмотра', value: String(c.abandoned_days), free: true, number: true }, (val) => {
                        if (val !== null && !isNaN(val) && val > 0) {
                            c.abandoned_days = parseInt(val);
                            saveCfg(c);
                        }
                        showFavoritesSettings();
                    });
                } else if (item.action === 'clear_favorites') {
                    clearAllFavorites();
                    showFavoritesSettings();
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: () => showMainMenu()
        });
    }
    
    function showTimelineSettings() {
        const c = cfg();
        const strategyName = c.sync_strategy === 'max_time' ? 'По длительности' : 'По дате';
        
        Lampa.Select.show({
            title: '⏱️ Таймкоды',
            items: [
                { title: `✅ Автосохранение: ${c.auto_save ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_save' },
                { title: `✅ Автосинхронизация: ${c.auto_sync ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_sync' },
                { title: `⏱️ Интервал синхр.: ${c.sync_interval} сек`, action: 'set_interval' },
                { title: `📊 Стратегия: ${strategyName}`, action: 'toggle_strategy' },
                { title: `🗑️ Удалять старше: ${c.cleanup_older_days || 'никогда'} дней`, action: 'set_cleanup_days' },
                { title: `✅ Удалять завершённые: ${c.cleanup_completed ? 'Вкл' : 'Выкл'}`, action: 'toggle_cleanup_completed' },
                { title: `🗑️ Очистить все таймкоды`, action: 'clear_timeline' },
                { title: `🧹 Очистить старые сейчас`, action: 'cleanup_now' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'toggle_auto_save') {
                    c.auto_save = !c.auto_save; saveCfg(c); showTimelineSettings();
                } else if (item.action === 'toggle_auto_sync') {
                    c.auto_sync = !c.auto_sync; saveCfg(c); showTimelineSettings();
                } else if (item.action === 'set_interval') {
                    Lampa.Input.edit({ title: 'Интервал (сек)', value: String(c.sync_interval), free: true, number: true }, (val) => {
                        if (val !== null && !isNaN(val) && val > 0) {
                            c.sync_interval = parseInt(val); saveCfg(c);
                        }
                        showTimelineSettings();
                    });
                } else if (item.action === 'toggle_strategy') {
                    c.sync_strategy = c.sync_strategy === 'max_time' ? 'last_watch' : 'max_time';
                    saveCfg(c); showTimelineSettings();
                } else if (item.action === 'set_cleanup_days') {
                    Lampa.Input.edit({ title: 'Удалять старше (дней, 0 = откл)', value: String(c.cleanup_older_days), free: true, number: true }, (val) => {
                        if (val !== null && !isNaN(val)) {
                            c.cleanup_older_days = parseInt(val); saveCfg(c);
                        }
                        showTimelineSettings();
                    });
                } else if (item.action === 'toggle_cleanup_completed') {
                    c.cleanup_completed = !c.cleanup_completed; saveCfg(c); showTimelineSettings();
                } else if (item.action === 'clear_timeline') {
                    clearAllTimeline(); showTimelineSettings();
                } else if (item.action === 'cleanup_now') {
                    cleanupTimeline(); showTimelineSettings();
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: () => showMainMenu()
        });
    }
    
    function showContinueSettings() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '⏱️ Продолжить просмотр',
            items: [
                { title: `✅ Показывать: ${c.show_continue ? 'Вкл' : 'Выкл'}`, action: 'toggle_show' },
                { title: `📊 Мин. прогресс: ${c.continue_min_progress}%`, action: 'set_min' },
                { title: `📊 Макс. прогресс: ${c.continue_max_progress}%`, action: 'set_max' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'toggle_show') {
                    c.show_continue = !c.show_continue; saveCfg(c); addContinueToMenu(); showContinueSettings();
                } else if (item.action === 'set_min') {
                    Lampa.Input.edit({ title: 'Мин. прогресс (%)', value: String(c.continue_min_progress), free: true, number: true }, (val) => {
                        if (val !== null && !isNaN(val) && val >= 0 && val <= 100) {
                            c.continue_min_progress = parseInt(val); saveCfg(c);
                        }
                        showContinueSettings();
                    });
                } else if (item.action === 'set_max') {
                    Lampa.Input.edit({ title: 'Макс. прогресс (%)', value: String(c.continue_max_progress), free: true, number: true }, (val) => {
                        if (val !== null && !isNaN(val) && val >= 0 && val <= 100) {
                            c.continue_max_progress = parseInt(val); saveCfg(c);
                        }
                        showContinueSettings();
                    });
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: () => showMainMenu()
        });
    }
    
    function showGistSetup() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '☁️ GitHub Gist',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓ Установлен' : '❌ Не установлен'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0, 8) + '…' : '❌ Не установлен'}`, action: 'id' },
                { title: '──────────', separator: true },
                { title: '📤 Экспорт на Gist', action: 'upload' },
                { title: '📥 Импорт с Gist', action: 'download' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'token') {
                    Lampa.Input.edit({ title: 'GitHub Token', value: c.gist_token || '', free: true }, (val) => {
                        if (val !== null) { c.gist_token = val; saveCfg(c); notify('Токен сохранён'); }
                        showGistSetup();
                    });
                } else if (item.action === 'id') {
                    Lampa.Input.edit({ title: 'Gist ID', value: c.gist_id || '', free: true }, (val) => {
                        if (val !== null) { c.gist_id = val; saveCfg(c); notify('Gist ID сохранён'); }
                        showGistSetup();
                    });
                } else if (item.action === 'upload') {
                    notify('📤 Отправка...'); syncToGist(true); setTimeout(() => showGistSetup(), 1500);
                } else if (item.action === 'download') {
                    notify('📥 Загрузка...'); syncFromGist(true); setTimeout(() => showGistSetup(), 1500);
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: () => showMainMenu()
        });
    }

    function addSettingsButton() {
        setTimeout(() => {
            let menuList = $('.menu__list').last();
            if (!menuList.length) menuList = $('.menu__list').eq(1);
            if (menuList.length && !$('.nsl-settings-item').length) {
                const el = $(`
                    <li class="menu__item selector nsl-settings-item">
                        <div class="menu__text">⚙️ NSL Sync</div>
                    </li>
                `);
                el.on('hover:enter', (e) => { e.stopPropagation(); showMainMenu(); });
                menuList.append(el);
            }
        }, 2000);
    }

    // ======================
    // ИНИЦИАЛИЗАЦИЯ
    // ======================

    function onAppClose() {
        const c = cfg();
        if (c.sync_on_close && c.gist_token && c.gist_id) syncToGist(false);
    }

    function onAppStart() {
        const c = cfg();
        if (c.sync_on_start && c.gist_token && c.gist_id) {
            setTimeout(() => syncFromGist(false), 5000);
        }
    }

    function init() {
        if (!cfg().enabled) return;

        setTimeout(() => {
            addBookmarkButton();
            addFavoritesToMenu();
            addHistoryToMenu();
            addContinueToMenu();
            addSettingsButton();
            renderBookmarks();
        }, 1000);

        addFavoriteButtonToCard();
        initPlayerHandler();
        
        startAutoSync();
        onAppStart();
        
        Lampa.Listener.follow('state:changed', (e) => {
            if (e.target === 'nsl_favorites' || e.target === 'timeline') {
                setTimeout(addContinueToMenu, 100);
            }
        });
        
        window.addEventListener('beforeunload', onAppClose);
        
        window.NSL = {
            cfg, getFavorites, getBookmarks, getHistory, getTimeline,
            syncToGist, syncFromGist, addToFavorites, toggleFavorite, addContinueToMenu
        };
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });

})();
