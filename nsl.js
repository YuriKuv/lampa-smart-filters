(function () {
    'use strict';

    if (window.nsl_init) return;
    window.nsl_init = true;

    // ======================
    // 1. КОНФИГУРАЦИЯ
    // ======================
    
    const STORE_BOOKMARKS = 'nsl_bookmarks_v1';
    const STORE_FAVORITES = 'nsl_favorites_v1';
    const STORE_HISTORY = 'nsl_history_v1';
    const STORE_TIMELINE = 'nsl_timeline_v1';
    const CFG = 'nsl_cfg_v1';
    const GIST_CACHE = 'nsl_gist_cache';

    window.NSL = {};

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
            cleanup_completed: false,
            show_timeline_on_cards: true,
            timeline_position: 'bottom'
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG, c, true);
    }

    // ========= STORAGE =========
    function getBookmarks() { return Lampa.Storage.get(STORE_BOOKMARKS, []) || []; }
    function saveBookmarks(l) { Lampa.Storage.set(STORE_BOOKMARKS, l, true); renderBookmarks(); }
    function getFavorites() { return Lampa.Storage.get(STORE_FAVORITES, []) || []; }
    function saveFavorites(l) { Lampa.Storage.set(STORE_FAVORITES, l, true); Lampa.Listener.send('state:changed', { target: 'nsl_favorites', reason: 'update' }); }
    function getHistory() { return Lampa.Storage.get(STORE_HISTORY, []) || []; }
    function saveHistory(l) { Lampa.Storage.set(STORE_HISTORY, l, true); }
    function getTimeline() { return Lampa.Storage.get(STORE_TIMELINE, {}) || {}; }
    function saveTimeline(t) { Lampa.Storage.set(STORE_TIMELINE, t, true); }

    function notify(t) { Lampa.Noty.show(t); }
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
    // 2. ЗАКЛАДКИ РАЗДЕЛОВ
    // ======================
    
    const ICON_FLAG = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/></svg>';
    const ICON_ADD = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>';

    function makeKey(a) {
        return [a.url || '', a.component || '', a.source || '', a.id || '', a.job || '', 
            JSON.stringify(a.genres || ''), JSON.stringify(a.params || '')].join('|');
    }

    function saveBookmark() {
        const act = Lampa.Activity.active();
        if (!act || !act.url) { notify('Нельзя сохранить этот раздел'); return; }
        
        const exists = getBookmarks().some(i => i.key === makeKey(act));
        if (exists) { notify('Уже есть'); return; }
        
        Lampa.Input.edit({ title: 'Название', value: act.title || act.name || 'Закладка' }, (val) => {
            if (!val) return;
            const l = getBookmarks();
            l.push({
                id: Date.now(),
                key: makeKey(act),
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
            saveBookmarks(l);
            notify('Сохранено');
        });
    }

    function removeBookmark(item) {
        saveBookmarks(getBookmarks().filter(i => i.id !== item.id));
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
            const el = $(`<li class="menu__item selector nsl-bookmark-item"><div class="menu__ico">${ICON_FLAG}</div><div class="menu__text">${item.name}</div></li>`);
            el.on('hover:enter', () => openBookmark(item));
            el.on('hover:long', () => {
                Lampa.Select.show({
                    title: `Удалить "${item.name}"?`,
                    items: [{ title: 'Нет', action: 'cancel' }, { title: 'Да', action: 'remove' }],
                    onSelect: (a) => { if (a.action === 'remove') removeBookmark(item); }
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
                btn.on('hover:enter', () => saveBookmark());
                menuList.prepend(btn);
            }
        } else if (c.button_position === 'top') {
            const head = $('.head__actions, .head__buttons').first();
            if (head.length) {
                const btn = $(`<div class="head__action selector" data-nsl-save><div class="head__action-ico">${ICON_ADD}</div></div>`);
                btn.on('hover:enter', () => saveBookmark());
                head.prepend(btn);
            }
        }
    }

    // ======================
    // 3. ИЗБРАННОЕ
    // ======================
    
    function addToFavorites(card, category) {
        if (!card || !card.id) return false;
        const tmdbId = extractTmdbId(card);
        const favorites = getFavorites();
        const existingIndex = favorites.findIndex(f => f.tmdb_id === tmdbId && f.category === category);
        const item = {
            id: Date.now(), card_id: card.id, tmdb_id: tmdbId, media_type: getMediaType(card),
            category: category, data: cleanCardData(card), added: Date.now(), updated: Date.now()
        };
        if (existingIndex >= 0) favorites[existingIndex] = item;
        else favorites.push(item);
        saveFavorites(favorites);
        if (cfg().sync_on_add) syncToGist(false);
        return true;
    }
    
    function removeFromFavorites(card, category) {
        const tmdbId = extractTmdbId(card);
        const favorites = getFavorites();
        const index = favorites.findIndex(f => f.tmdb_id === tmdbId && f.category === category);
        if (index >= 0) favorites.splice(index, 1);
        saveFavorites(favorites);
        if (cfg().sync_on_remove) syncToGist(false);
        return index >= 0;
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

    // ======================
    // 4. ИСТОРИЯ
    // ======================
    
    function addToHistory(card, progress) {
        if (!card || !card.id) return false;
        const tmdbId = extractTmdbId(card);
        const history = getHistory();
        const existingIndex = history.findIndex(h => h.tmdb_id === tmdbId);
        const item = {
            id: Date.now(), card_id: card.id, tmdb_id: tmdbId, media_type: getMediaType(card),
            data: cleanCardData(card), watched_at: Date.now(), progress: progress || { percent: 100 }
        };
        if (existingIndex >= 0) history[existingIndex] = item;
        else history.unshift(item);
        if (history.length > 500) saveHistory(history.slice(0, 500));
        else saveHistory(history);
        return true;
    }
    
    function clearHistory() {
        Lampa.Select.show({
            title: '⚠️ Очистить всю историю?',
            items: [{ title: 'Нет', action: 'cancel' }, { title: 'Да', action: 'clear' }],
            onSelect: (opt) => { if (opt.action === 'clear') { saveHistory([]); notify('История очищена'); } }
        });
    }
    
    function getHistoryByMediaType(mediaType) {
        const history = getHistory();
        if (mediaType === 'all') return [...history];
        return history.filter(h => h.media_type === mediaType);
    }

    // ======================
    // 5. ТАЙМКОДЫ
    // ======================
    
    let playerInterval = null, currentMovieTime = 0, currentMovieKey = null, lastSavedProgress = 0;
    
    function getCurrentMovieKey() {
        try {
            const activity = Lampa.Activity.active();
            if (!activity || !activity.movie) return null;
            const tmdbId = extractTmdbId(activity.movie);
            if (!tmdbId) return null;
            const playerData = Lampa.Player.playdata();
            if (playerData && (playerData.season || playerData.episode)) {
                return `${tmdbId}_s${playerData.season || 1}_e${playerData.episode || 1}`;
            }
            return String(tmdbId);
        } catch (e) { return null; }
    }
    
    function saveProgress(timeInSeconds, force = false) {
        if (!cfg().auto_save && !force) return false;
        const movieKey = getCurrentMovieKey();
        if (!movieKey) return false;
        const currentTime = Math.floor(timeInSeconds);
        const timeline = getTimeline();
        const savedTime = timeline[movieKey]?.time || 0;
        if (force || Math.abs(currentTime - savedTime) >= 10) {
            const playerData = Lampa.Player.playdata();
            const duration = playerData?.timeline?.duration || 0;
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            timeline[movieKey] = {
                time: currentTime, percent: percent, duration: duration,
                updated: Date.now(), tmdb_id: extractTmdbId(Lampa.Activity.active()?.movie)
            };
            saveTimeline(timeline);
            lastSavedProgress = currentTime;
            currentMovieTime = currentTime;
            if (Lampa.Timeline && Lampa.Timeline.update) {
                Lampa.Timeline.update({ hash: movieKey, percent: percent, time: currentTime, duration: duration });
            }
            return true;
        }
        return false;
    }
    
    function initPlayerHandler() {
        let wasPlayerOpen = false;
        if (playerInterval) clearInterval(playerInterval);
        playerInterval = setInterval(() => {
            if (!cfg().enabled) return;
            const isPlayerOpen = Lampa.Player.opened();
            const currentTime = (() => {
                try {
                    if (Lampa.Player.opened()) {
                        const pd = Lampa.Player.playdata();
                        return pd?.timeline?.time || null;
                    }
                } catch(e) {}
                return null;
            })();
            if (wasPlayerOpen && !isPlayerOpen && currentMovieTime > 0) {
                saveProgress(currentMovieTime, true);
                if (cfg().auto_sync) syncToGist(false);
            }
            wasPlayerOpen = isPlayerOpen;
            if (isPlayerOpen && currentTime !== null && currentTime > 0) {
                currentMovieTime = currentTime;
                const movieKey = getCurrentMovieKey();
                if (movieKey && movieKey !== currentMovieKey) {
                    currentMovieKey = movieKey;
                    lastSavedProgress = 0;
                }
                if (cfg().auto_save && Math.floor(currentTime) - lastSavedProgress >= 10) {
                    if (saveProgress(currentTime) && cfg().auto_sync) {
                        syncToGist(false);
                    }
                }
            }
        }, 1000);
    }
    
    // Слушатель для истории
    function initHistoryListener() {
        Lampa.Player.listener.follow('destroy', () => {
            try {
                const activity = Lampa.Activity.active();
                if (activity && activity.movie) {
                    const timeline = getTimeline();
                    const movieKey = getCurrentMovieKey();
                    const progress = timeline[movieKey];
                    if (progress && progress.percent >= 90) {
                        addToHistory(activity.movie, progress);
                    }
                }
            } catch(e) {}
        });
    }

    // ======================
    // 6. ПРОДОЛЖИТЬ ПРОСМОТР
    // ======================
    
    function getContinueWatching() {
        if (!cfg().show_continue) return [];
        const timeline = getTimeline();
        const favorites = getFavorites();
        const result = [];
        for (const [key, item] of Object.entries(timeline)) {
            if (item.percent >= cfg().continue_min_progress && item.percent <= cfg().continue_max_progress) {
                const fav = favorites.find(f => f.tmdb_id === item.tmdb_id);
                result.push({ key, tmdb_id: item.tmdb_id, time: item.time, percent: item.percent, 
                    duration: item.duration, updated: item.updated, data: fav?.data });
            }
        }
        result.sort((a, b) => (b.updated || 0) - (a.updated || 0));
        return result;
    }

    // ======================
    // 7. КНОПКА НА КАРТОЧКЕ
    // ======================
    
    function addFavoriteButtonToCard() {
        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite') {
                setTimeout(() => {
                    try {
                        const movie = e.data.movie;
                        if (!movie || !movie.id) return;
                        const container = $('.full-start-new__buttons, .full-start__buttons').first();
                        if (!container.length || container.find('.nsl-favorite-button').length) return;
                        const isFav = isInFavorites(movie, 'favorite');
                        const btn = $(`<div class="full-start__button selector nsl-favorite-button">
                            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/></svg>
                            <span>В избранное</span>
                        </div>`);
                        btn.on('hover:enter', () => {
                            const categories = [
                                { id: 'favorite', name: 'Избранное', checked: isInFavorites(movie, 'favorite') },
                                { id: 'watching', name: 'Смотрю', checked: isInFavorites(movie, 'watching') },
                                { id: 'planned', name: 'Буду смотреть', checked: isInFavorites(movie, 'planned') },
                                { id: 'watched', name: 'Просмотрено', checked: isInFavorites(movie, 'watched') },
                                { id: 'abandoned', name: 'Брошено', checked: isInFavorites(movie, 'abandoned') },
                                { id: 'collection', name: 'Коллекция', checked: isInFavorites(movie, 'collection') }
                            ];
                            const items = categories.map(c => ({ title: c.name, checkbox: true, checked: c.checked, category: c.id }));
                            items.push({ title: '──────────', separator: true }, { title: '❌ Закрыть', action: 'close' });
                            Lampa.Select.show({
                                title: 'Добавить в избранное',
                                items: items,
                                onCheck: (item) => {
                                    toggleFavorite(movie, item.category);
                                    const anyFav = categories.some(c => c.id !== 'collection' && isInFavorites(movie, c.id));
                                    btn.find('path').attr('fill', anyFav ? 'currentColor' : 'none');
                                },
                                onSelect: (item) => {
                                    if (item.action === 'close') return;
                                    toggleFavorite(movie, item.category);
                                    const anyFav = categories.some(c => c.id !== 'collection' && isInFavorites(movie, c.id));
                                    btn.find('path').attr('fill', anyFav ? 'currentColor' : 'none');
                                }
                            });
                        });
                        const playBtn = container.find('.button--play');
                        playBtn.length ? playBtn.after(btn) : container.prepend(btn);
                    } catch(err) { console.error(err); }
                }, 500);
            }
        });
    }

    // ======================
    // 8. МЕНЮ (с правильным закрытием)
    // ======================
    
    function closeMenu() {
        Lampa.Controller.toggle('menu');
    }
    
    function addFavoritesToMenu() {
        const menuList = $('.menu__list').eq(1);
        if (!menuList.length || $('.nsl-favorites-item').length) return;
        const el = $(`<li class="menu__item selector nsl-favorites-item"><div class="menu__text">⭐ Избранное</div></li>`);
        el.on('hover:enter', () => { closeMenu(); showFavoritesMenu(); });
        menuList.append(el);
    }
    
    function addHistoryToMenu() {
        const menuList = $('.menu__list').eq(1);
        if (!menuList.length || $('.nsl-history-item').length) return;
        const el = $(`<li class="menu__item selector nsl-history-item"><div class="menu__text">📜 История</div></li>`);
        el.on('hover:enter', () => { closeMenu(); showHistoryMenu(); });
        menuList.append(el);
    }
    
    function addContinueToMenu() {
        if (!cfg().show_continue) return;
        const items = getContinueWatching();
        if (!items.length) return;
        const menuList = $('.menu__list').eq(1);
        if (!menuList.length || $('.nsl-continue-item').length) return;
        const el = $(`<li class="menu__item selector nsl-continue-item"><div class="menu__text">⏱️ Продолжить (${items.length})</div></li>`);
        el.on('hover:enter', () => { closeMenu(); showContinueMenu(); });
        menuList.append(el);
    }
    
    function showFavoritesMenu() {
        const cats = [
            { id: 'favorite', name: '⭐ Избранное' }, { id: 'watching', name: '👁️ Смотрю' },
            { id: 'planned', name: '📋 Буду смотреть' }, { id: 'watched', name: '✅ Просмотрено' },
            { id: 'abandoned', name: '❌ Брошено' }, { id: 'collection', name: '📦 Коллекция' }
        ];
        const items = cats.map(c => ({ title: `${c.name} (${getFavoritesByCategory(c.id).length})`, onSelect: () => showFavoritesByCategory(c.id, c.name) }));
        items.push({ title: '──────────', separator: true }, { title: '🗑️ Очистить всё', onSelect: () => clearAllFavorites() }, { title: '❌ Закрыть' });
        Lampa.Select.show({ title: '⭐ Избранное', items, onBack: () => Lampa.Controller.toggle('content') });
    }
    
    function showFavoritesByCategory(category, catName) {
        const items = getFavoritesByCategory(category);
        if (!items.length) { notify(`В "${catName}" ничего нет`); return; }
        const grouped = {};
        for (const type of ['movie', 'tv', 'cartoon', 'cartoon_series', 'anime']) {
            grouped[type] = items.filter(i => i.media_type === type);
        }
        const typeNames = { movie: '🎬 Фильмы', tv: '📺 Сериалы', cartoon: '🐭 Мультфильмы', cartoon_series: '🐭📺 Мультсериалы', anime: '🇯🇵 Аниме' };
        const menuItems = [];
        for (const [type, list] of Object.entries(grouped)) {
            if (list.length) menuItems.push({ title: `${typeNames[type]} (${list.length})`, onSelect: () => showFavoritesList(list, `${catName} - ${typeNames[type]}`) });
        }
        menuItems.push({ title: '──────────', separator: true }, { title: '◀ Назад', onSelect: () => showFavoritesMenu() }, { title: '❌ Закрыть' });
        Lampa.Select.show({ title: catName, items: menuItems, onBack: () => showFavoritesMenu() });
    }
    
    function showFavoritesList(items, title) {
        const menuItems = items.map(i => ({
            title: i.data?.title || i.data?.name || 'Без названия',
            onSelect: () => Lampa.Router.call('full', { id: i.card_id, source: i.data?.source || 'tmdb' }),
            onLongPress: () => {
                Lampa.Select.show({
                    title: `Удалить из "${title}"?`,
                    items: [{ title: 'Нет' }, { title: 'Да', action: 'delete' }],
                    onSelect: (opt) => { if (opt.action === 'delete') { removeFromFavorites(i.data, i.category); showFavoritesByCategory(i.category, title.split(' - ')[0]); } }
                });
            }
        }));
        menuItems.push({ title: '──────────', separator: true }, { title: '◀ Назад', onSelect: () => showFavoritesByCategory(items[0]?.category, title.split(' - ')[0]) }, { title: '❌ Закрыть' });
        Lampa.Select.show({ title: title, items: menuItems, onBack: () => showFavoritesByCategory(items[0]?.category, title.split(' - ')[0]) });
    }
    
    function showHistoryMenu() {
        const types = [
            { id: 'all', name: '📜 Вся история' }, { id: 'movie', name: '🎬 Фильмы' }, { id: 'tv', name: '📺 Сериалы' },
            { id: 'cartoon', name: '🐭 Мультфильмы' }, { id: 'cartoon_series', name: '🐭📺 Мультсериалы' }, { id: 'anime', name: '🇯🇵 Аниме' }
        ];
        const items = types.map(t => ({ title: `${t.name} (${getHistoryByMediaType(t.id).length})`, onSelect: () => showHistoryList(t.id, t.name) }));
        items.push({ title: '──────────', separator: true }, { title: '🗑️ Очистить историю', onSelect: () => clearHistory() }, { title: '❌ Закрыть' });
        Lampa.Select.show({ title: '📜 История просмотров', items, onBack: () => Lampa.Controller.toggle('content') });
    }
    
    function showHistoryList(mediaType, title) {
        const items = getHistoryByMediaType(mediaType);
        if (!items.length) { notify(`В "${title}" ничего нет`); return; }
        const menuItems = items.slice(0, 50).map(i => ({
            title: i.data?.title || i.data?.name || 'Без названия',
            sub: new Date(i.watched_at).toLocaleDateString(),
            onSelect: () => Lampa.Router.call('full', { id: i.card_id, source: i.data?.source || 'tmdb' })
        }));
        menuItems.push({ title: '──────────', separator: true }, { title: '◀ Назад', onSelect: () => showHistoryMenu() }, { title: '❌ Закрыть' });
        Lampa.Select.show({ title: title, items: menuItems, onBack: () => showHistoryMenu() });
    }
    
    function showContinueMenu() {
        const items = getContinueWatching();
        if (!items.length) { notify('Нет фильмов для продолжения'); return; }
        const menuItems = items.map(i => ({
            title: i.data?.title || i.data?.name || i.tmdb_id || 'Без названия',
            sub: `${formatTime(i.time)} / ${formatTime(i.duration)} (${i.percent}%)`,
            onSelect: () => Lampa.Router.call('full', { id: i.tmdb_id, source: 'tmdb' })
        }));
        menuItems.push({ title: '──────────', separator: true }, { title: '❌ Закрыть' });
        Lampa.Select.show({ title: '⏱️ Продолжить просмотр', items: menuItems, onBack: () => Lampa.Controller.toggle('content') });
    }
    
    function clearAllFavorites() {
        Lampa.Select.show({
            title: '⚠️ Очистить всё избранное?',
            items: [{ title: 'Нет' }, { title: 'Да', action: 'clear' }],
            onSelect: (opt) => { if (opt.action === 'clear') { saveFavorites([]); notify('Избранное очищено'); } }
        });
    }

    // ======================
    // 9. GITHUB GIST СИНХРОНИЗАЦИЯ
    // ======================

    function getGistData() {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) return null;
        return { token: c.gist_token, id: c.gist_id };
    }

    function getAllSyncData() {
        return {
            version: 3,
            updated: new Date().toISOString(),
            favorites: getFavorites(),
            timeline: getTimeline(),
            bookmarks: getBookmarks(),
            history: getHistory()
        };
    }

    function syncToGist(showNotify = true) {
        const gist = getGistData();
        if (!gist) { if (showNotify) notify('⚠️ GitHub Gist не настроен'); return false; }
        
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'PATCH',
            headers: { 'Authorization': `token ${gist.token}`, 'Accept': 'application/vnd.github.v3+json' },
            data: JSON.stringify({
                description: 'NSL Sync Data',
                public: false,
                files: { 'nsl_sync.json': { content: JSON.stringify(getAllSyncData(), null, 2) } }
            }),
            success: () => {
                if (showNotify) notify('✅ Данные отправлены в Gist');
                Lampa.Storage.set(GIST_CACHE + '_last_sync', Date.now());
            },
            error: (xhr) => {
                console.error('[NSL] Sync error:', xhr);
                if (showNotify) notify('❌ Ошибка: ' + (xhr.responseJSON?.message || 'Unknown'));
            }
        });
    }

    function syncFromGist(showNotify = true) {
        const gist = getGistData();
        if (!gist) { if (showNotify) notify('⚠️ GitHub Gist не настроен'); return false; }
        
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'GET',
            headers: { 'Authorization': `token ${gist.token}`, 'Accept': 'application/vnd.github.v3+json' },
            success: (data) => {
                try {
                    const content = data.files['nsl_sync.json']?.content;
                    if (!content) { if (showNotify) notify('⚠️ Файл не найден'); return; }
                    const remote = JSON.parse(content);
                    let changes = 0;
                    
                    // Избранное
                    if (remote.favorites) {
                        const local = getFavorites();
                        for (const fav of remote.favorites) {
                            const key = `${fav.tmdb_id}_${fav.category}`;
                            if (!local.some(f => `${f.tmdb_id}_${f.category}` === key)) {
                                local.push(fav);
                                changes++;
                            }
                        }
                        if (changes) saveFavorites(local);
                    }
                    
                    // Таймкоды
                    if (remote.timeline) {
                        const local = getTimeline();
                        for (const [key, val] of Object.entries(remote.timeline)) {
                            if (!local[key] || (cfg().sync_strategy === 'max_time' && val.time > local[key].time + 5)) {
                                local[key] = val;
                                changes++;
                            }
                        }
                        if (changes) saveTimeline(local);
                    }
                    
                    if (showNotify) notify(changes ? `📥 Загружено ${changes} новых элементов` : '✅ Данные актуальны');
                } catch(e) { console.error(e); if (showNotify) notify('❌ Ошибка чтения'); }
            },
            error: (xhr) => { console.error(xhr); if (showNotify) notify('❌ Ошибка загрузки'); }
        });
    }

    function startAutoSync() {
        setInterval(() => {
            const c = cfg();
            if (!c.sync_auto_interval) return;
            const last = Lampa.Storage.get(GIST_CACHE + '_last_sync', 0);
            if (Date.now() - last > (c.sync_interval_minutes || 60) * 60 * 1000) {
                syncFromGist(false);
            }
        }, 5 * 60 * 1000);
    }

    // ======================
    // 10. НАСТРОЙКИ
    // ======================

    function showMainMenu() {
        Lampa.Select.show({
            title: 'NSL Sync v16',
            items: [
                { title: '📌 Закладки разделов', action: 'sections' },
                { title: '⭐ Избранное', action: 'favorites' },
                { title: '📜 История', action: 'history' },
                { title: '⏱️ Таймкоды', action: 'timeline' },
                { title: '⏱️ Продолжить просмотр', action: 'continue' },
                { title: '☁️ GitHub Gist', action: 'gist' },
                { title: '──────────', separator: true },
                { title: '🔄 Синхронизировать сейчас', action: 'sync' },
                { title: '❌ Закрыть', action: 'cancel' }
            ],
            onSelect: (item) => {
                if (item.action === 'sections') showSectionsSettings();
                else if (item.action === 'favorites') showFavoritesSettings();
                else if (item.action === 'history') showHistoryMenu();
                else if (item.action === 'timeline') showTimelineSettings();
                else if (item.action === 'continue') showContinueSettings();
                else if (item.action === 'gist') showGistSetup();
                else if (item.action === 'sync') { syncToGist(true); setTimeout(() => syncFromGist(true), 1500); }
            },
            onBack: () => Lampa.Controller.toggle('content')
        });
    }
    
    function showSectionsSettings() {
        const c = cfg();
        Lampa.Select.show({
            title: '📌 Закладки разделов',
            items: [
                { title: `📍 Положение кнопки: ${c.button_position === 'side' ? 'Боковое меню' : 'Верхняя панель'}`, action: 'toggle_pos' },
                { title: `📌 Сохранить текущий раздел`, action: 'save' },
                { title: `📋 Мои закладки (${getBookmarks().length})`, action: 'view' },
                { title: `🗑️ Очистить все`, action: 'clear' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'toggle_pos') {
                    c.button_position = c.button_position === 'side' ? 'top' : 'side';
                    saveCfg(c);
                    showSectionsSettings();
                } else if (item.action === 'save') { saveBookmark(); setTimeout(() => showSectionsSettings(), 1000); }
                else if (item.action === 'view') { renderBookmarks(); showSectionsSettings(); }
                else if (item.action === 'clear') { saveBookmarks([]); notify('Все закладки удалены'); showSectionsSettings(); }
                else if (item.action === 'back') showMainMenu();
            }
        });
    }
    
    function showFavoritesSettings() {
        const c = cfg();
        Lampa.Select.show({
            title: '⭐ Избранное',
            items: [
                { title: `🔄 Авто в Брошено: ${c.auto_abandoned ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto' },
                { title: `📅 Дней до Брошено: ${c.abandoned_days}`, action: 'set_days' },
                { title: `🗑️ Очистить всё`, action: 'clear' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'toggle_auto') { c.auto_abandoned = !c.auto_abandoned; saveCfg(c); showFavoritesSettings(); }
                else if (item.action === 'set_days') {
                    Lampa.Input.edit({ title: 'Дней без просмотра', value: String(c.abandoned_days), free: true, number: true }, (val) => {
                        if (val && !isNaN(val) && val > 0) { c.abandoned_days = parseInt(val); saveCfg(c); }
                        showFavoritesSettings();
                    });
                } else if (item.action === 'clear') { clearAllFavorites(); showFavoritesSettings(); }
                else if (item.action === 'back') showMainMenu();
            }
        });
    }
    
    function showTimelineSettings() {
        const c = cfg();
        Lampa.Select.show({
            title: '⏱️ Таймкоды',
            items: [
                { title: `✅ Автосохранение: ${c.auto_save ? 'Вкл' : 'Выкл'}`, action: 'toggle_save' },
                { title: `✅ Автосинхронизация: ${c.auto_sync ? 'Вкл' : 'Выкл'}`, action: 'toggle_sync' },
                { title: `⏱️ Интервал: ${c.sync_interval} сек`, action: 'set_interval' },
                { title: `📊 Стратегия: ${c.sync_strategy === 'max_time' ? 'По длительности' : 'По дате'}`, action: 'toggle_strategy' },
                { title: `🗑️ Очистить все`, action: 'clear' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'toggle_save') { c.auto_save = !c.auto_save; saveCfg(c); showTimelineSettings(); }
                else if (item.action === 'toggle_sync') { c.auto_sync = !c.auto_sync; saveCfg(c); showTimelineSettings(); }
                else if (item.action === 'set_interval') {
                    Lampa.Input.edit({ title: 'Интервал (сек)', value: String(c.sync_interval), free: true, number: true }, (val) => {
                        if (val && !isNaN(val) && val > 0) { c.sync_interval = parseInt(val); saveCfg(c); }
                        showTimelineSettings();
                    });
                } else if (item.action === 'toggle_strategy') { c.sync_strategy = c.sync_strategy === 'max_time' ? 'last_watch' : 'max_time'; saveCfg(c); showTimelineSettings(); }
                else if (item.action === 'clear') { saveTimeline({}); notify('Таймкоды очищены'); showTimelineSettings(); }
                else if (item.action === 'back') showMainMenu();
            }
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
                if (item.action === 'toggle_show') { c.show_continue = !c.show_continue; saveCfg(c); addContinueToMenu(); showContinueSettings(); }
                else if (item.action === 'set_min') {
                    Lampa.Input.edit({ title: 'Мин. прогресс (%)', value: String(c.continue_min_progress), free: true, number: true }, (val) => {
                        if (val && !isNaN(val) && val >= 0 && val <= 100) { c.continue_min_progress = parseInt(val); saveCfg(c); }
                        showContinueSettings();
                    });
                } else if (item.action === 'set_max') {
                    Lampa.Input.edit({ title: 'Макс. прогресс (%)', value: String(c.continue_max_progress), free: true, number: true }, (val) => {
                        if (val && !isNaN(val) && val >= 0 && val <= 100) { c.continue_max_progress = parseInt(val); saveCfg(c); }
                        showContinueSettings();
                    });
                } else if (item.action === 'back') showMainMenu();
            }
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
                { title: '📤 Экспорт', action: 'upload' },
                { title: '📥 Импорт', action: 'download' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'token') {
                    Lampa.Input.edit({ title: 'GitHub Token', value: c.gist_token, free: true }, (val) => {
                        if (val !== null) { c.gist_token = val || ''; saveCfg(c); notify('Токен сохранён'); }
                        showGistSetup();
                    });
                } else if (item.action === 'id') {
                    Lampa.Input.edit({ title: 'Gist ID', value: c.gist_id, free: true }, (val) => {
                        if (val !== null) { c.gist_id = val || ''; saveCfg(c); notify('Gist ID сохранён'); }
                        showGistSetup();
                    });
                } else if (item.action === 'upload') { syncToGist(true); setTimeout(() => showGistSetup(), 1500); }
                else if (item.action === 'download') { syncFromGist(true); setTimeout(() => showGistSetup(), 1500); }
                else if (item.action === 'back') showMainMenu();
            }
        });
    }

    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'nsl_sync',
            name: 'NSL Sync',
            icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12,2C6.5,2 2,6.5 2,12s4.5,10 10,10 10-4.5 10-10S17.5,2 12,2z M12,4c4.4,0 8,3.6 8,8s-3.6,8-8,8-8-3.6-8-8 3.6-8 8-8z M11,7v5l4,2.5 1-1.5-3-2V7z"/></svg>'
        });
        Lampa.SettingsApi.addParam({
            component: 'nsl_sync',
            param: { name: 'open_menu', type: 'button' },
            field: { name: '⚙️ Открыть меню настроек' },
            onChange: () => showMainMenu()
        });
    }

    // ======================
    // 11. ЗАПУСК
    // ======================

    function init() {
        if (!cfg().enabled) return;
        console.log('[NSL] Init...');
        setTimeout(() => {
            addBookmarkButton();
            addFavoritesToMenu();
            addHistoryToMenu();
            addContinueToMenu();
            renderBookmarks();
        }, 1000);
        addFavoriteButtonToCard();
        initPlayerHandler();
        initHistoryListener();
        initSettings();
        startAutoSync();
        if (cfg().sync_on_start) setTimeout(() => syncFromGist(false), 5000);
        
        window.NSL = { cfg, getFavorites, getTimeline, syncToGist, syncFromGist, addToFavorites, toggleFavorite };
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });
})();
