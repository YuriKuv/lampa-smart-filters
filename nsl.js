(function () {
    'use strict';

    if (window.nsl_sync_init) return;
    window.nsl_sync_init = true;

    // ============ КОНФИГУРАЦИЯ ============
    const CFG_KEY = 'nsl_sync_cfg';
    const SYNC_VERSION = 12;
    
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
    
    // Категории избранного (маппинг из CUB)
    const FAVORITE_CATEGORIES = {
        'favorite':   { icon: '⭐', title: 'Избранное', color: '#FFD700', cubTypes: ['book', 'like'] },
        'watching':   { icon: '👁️', title: 'Смотрю', color: '#2196F3', cubTypes: ['look'] },
        'watchlist':  { icon: '📋', title: 'Буду смотреть', color: '#4CAF50', cubTypes: ['scheduled'] },
        'watched':    { icon: '✅', title: 'Просмотрено', color: '#9C27B0', cubTypes: ['viewed', 'history'] },
        'dropped':    { icon: '❌', title: 'Брошено', color: '#F44336', cubTypes: ['thrown'] },
        'collection': { icon: '📦', title: 'Коллекция', color: '#FF9800', cubTypes: [] }
    };
    
    // Папки избранного
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
    let protectedTimeline = {};
    
    let syncInProgress = false;
    let pendingSync = false;
    let playerCheckInterval = null;
    let autoSyncInterval = null;
    let uiUpdateTimer = null;
    let styleInjected = false;
    let currentMovieTime = 0;
    let lastSavedProgress = 0;
    let lastPosition = 0;
    let endCreditsDetected = false;
    let isV3 = false;

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
            end_credits_threshold: 180,
            // Закладки разделов
            sections_enabled: true,
            sections_button: 'side',
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

    function formatTimeLong(seconds) {
        if (!seconds || seconds < 0) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
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
        
        const isJapanese = (card.original_language === 'ja') || 
                          (card.origin_country || []).includes('JP');
        
        if (isJapanese && hasAnimation) return 'anime';
        if (hasAnimation) return isTV ? 'cartoon_tv' : 'cartoon';
        if (isTV) return 'tv';
        return 'movie';
    }

    function generateId() {
        return 'nsl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Исправлено: используем Lampa.Utils.hash для совместимости с таймлайном Lampa
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
                        const season = match[1];
                        const episode = match[2];
                        // Формируем ключ как в Lampa.Timeline
                        const hashString = [season, season > 10 ? ':' : '', episode, card.original_name || card.title].join('');
                        return Lampa.Utils.hash(hashString);
                    }
                }
            }
            
            // Для фильма используем оригинальное название
            return Lampa.Utils.hash(card.original_title || card.title);
        } catch(e) {
            console.warn('[NSL] getCurrentMovieKey error:', e);
            return null;
        }
    }

    function debounce(func, wait) {
        clearTimeout(uiUpdateTimer);
        uiUpdateTimer = setTimeout(func, wait);
    }

    // ============ ЗАЩИТА ТАЙМКОДОВ ============
    function protectFileView() {
        const originalSetItem = localStorage.setItem;
        const timelineKey = getStorageKey(STORAGE_KEYS.timeline);
        
        localStorage.setItem = function(key, value) {
            if (key === timelineKey) {
                try {
                    const newData = JSON.parse(value);
                    
                    for (const id in newData) {
                        const newRecord = newData[id];
                        const protectedRecord = protectedTimeline[id];
                        
                        if (protectedRecord && protectedRecord.time > 0) {
                            const newTime = newRecord.time || 0;
                            const protectedTime = protectedRecord.time || 0;
                            
                            if (newTime < protectedTime) {
                                newData[id] = { ...protectedRecord };
                            }
                        }
                    }
                    
                    for (const id in protectedTimeline) {
                        if (!newData[id] && protectedTimeline[id].time > 0) {
                            newData[id] = { ...protectedTimeline[id] };
                        }
                    }
                    
                    value = JSON.stringify(newData);
                } catch(e) {}
            }
            return originalSetItem.call(this, key, value);
        };
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
        const key = getStorageKey(STORAGE_KEYS.timeline);
        timeline = Lampa.Storage.get(key, {});
        protectedTimeline = { ...timeline };
        return timeline;
    }

    function saveTimeline() {
        const key = getStorageKey(STORAGE_KEYS.timeline);
        Lampa.Storage.set(key, timeline, true);
        protectedTimeline = { ...timeline };
        if (cfg().auto_sync) syncFile('timeline', timeline);
        
        // Обновляем таймлайн Lampa, чтобы прогресс отобразился на карточках
        if (Lampa.Timeline && Lampa.Timeline.read) {
            Lampa.Timeline.read(true);
        }
    }

    // ============ ОЧИСТКА СТАРЫХ ТАЙМКОДОВ ============
    function cleanupOldRecords(showNotify = false) {
        const c = cfg();
        const now = Date.now();
        const cutoffDate = now - (c.cleanup_days * 86400000);
        let cleaned = 0;
        let completedCleaned = 0;
        
        for (const key in timeline) {
            const record = timeline[key];
            let shouldDelete = false;
            
            const time = record.time || 0;
            const percent = Number(record.percent) || 0;
            const updated = record.updated || 0;
            
            if (time === 0 && percent === 0) {
                shouldDelete = true;
                cleaned++;
            } else if (c.cleanup_days > 0 && updated > 0 && updated < cutoffDate) {
                shouldDelete = true;
                cleaned++;
            } else if (c.cleanup_completed && percent >= 95) {
                shouldDelete = true;
                completedCleaned++;
            }
            
            if (shouldDelete) {
                delete timeline[key];
            }
        }
        
        if (cleaned > 0 || completedCleaned > 0) {
            saveTimeline();
            
            if (showNotify) {
                notify(`🧹 Удалено: ${cleaned} старых, ${completedCleaned} завершённых`);
            }
        } else if (showNotify) {
            notify('🧹 Нет записей для очистки');
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
                    .filter(h => h.card_id == item.card_id)
                    .sort((a, b) => b.watched_at - a.watched_at)[0];
                
                if (!lastWatched || lastWatched.watched_at < cutoff) {
                    item.category = 'dropped';
                    item.updated = now;
                    changed = true;
                }
            }
        });
        
        if (changed) saveFavorites();
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
        
        const menuList = $('.menu .menu__list').eq(0);
        if (!menuList.length) return;
        
        menuList.append('<li class="menu__split nsl-split-sections"></li>');
        
        sections.slice(0, 10).forEach(item => {
            const el = $(`<li class="menu__item selector nsl-section-item"><div class="menu__ico">📌</div><div class="menu__text">${item.name}</div></li>`);
            el.on('hover:enter', (e) => { e.stopPropagation(); openSection(item); });
            el.on('hover:long', (e) => {
                e.stopPropagation();
                Lampa.Select.show({
                    title: `Удалить "${item.name}"?`,
                    items: [
                        { title: '✅ Да', action: 'remove' },
                        { title: '❌ Нет', action: 'cancel' }
                    ],
                    onSelect: (a) => { if (a.action === 'remove') removeSection(item); }
                });
            });
            menuList.append(el);
        });
    }

    function addSectionButton() {
        if (!cfg().sections_enabled) return;
        
        const c = cfg();
        
        setTimeout(() => {
            if (c.sections_button === 'top') {
                if (!Lampa.Head) return;
                Lampa.Head.addIcon(
                    '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/></svg>',
                    addSection
                );
            } else {
                const menuList = $('.menu .menu__list').eq(1);
                if (!menuList.length || $('.nsl-section-add').length) return;
                
                const btn = $(`<li class="menu__item selector nsl-section-add"><div class="menu__ico">📌</div><div class="menu__text">Добавить закладку</div></li>`);
                btn.on('hover:enter', addSection);
                menuList.prepend(btn);
            }
        }, 2000);
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
    // Исправлено: используем Lampa.Timeline для получения прогресса
    function getContinueWatching() {
        const c = cfg();
        if (!c.continue_watching) return [];
        
        const result = [];
        const added = new Set();
        
        // Используем избранное как базу для списка "продолжить"
        favorites.forEach(fav => {
            if (added.has(fav.card_id)) return;
            
            let progress = null;
            let hash = null;
            
            // Пытаемся получить прогресс через Lampa.Timeline
            if (fav.data.original_name) {
                // Для сериалов нужно проверять последний эпизод
                // Упрощенно: проверяем прогресс по первому сезону и эпизоду
                // В реальности нужно хранить последний просмотренный эпизод
                hash = Lampa.Utils.hash([1, ':', 1, fav.data.original_name].join(''));
            } else {
                hash = Lampa.Utils.hash(fav.data.original_title || fav.data.title);
            }
            
            if (hash) {
                const view = Lampa.Timeline.view(hash);
                if (view && view.percent) {
                    progress = view.percent;
                }
            }
            
            // Также проверяем нашу собственную timeline на случай, если Lampa еще не обновилась
            if (!progress) {
                const tmdbId = fav.tmdb_id;
                for (const key in timeline) {
                    if (timeline[key].tmdb_id == tmdbId) {
                        progress = timeline[key].percent;
                        break;
                    }
                }
            }
            
            if (progress && progress >= c.continue_min_progress && progress <= c.continue_max_progress) {
                result.push({ ...fav.data, progress: progress });
                added.add(fav.card_id);
            }
        });
        
        return result.slice(0, 20);
    }

    // ============ ТАЙМКОДЫ ============
    // Исправлено: убраны собственные стили, используется стандартный Timeline Lampa
    function forceUITimelineUpdate() {
        debounce(() => {
            if (Lampa.Timeline && Lampa.Timeline.read) {
                Lampa.Timeline.read(true);
            }
        }, 100);
    }

    function checkEndCredits(currentTime, duration) {
        const c = cfg();
        if (!duration || duration <= 0) return false;
        
        const remaining = duration - currentTime;
        const threshold = c.end_credits_threshold || 180;
        
        if (remaining <= threshold && remaining > 0 && !endCreditsDetected) {
            endCreditsDetected = true;
            if (currentTime > lastPosition + 30) return false;
            
            Lampa.Noty.show('🎬 Финальные титры. Отметить как просмотренное?', 5000, function() {
                const movieKey = getCurrentMovieKey();
                if (movieKey) {
                    // Обновляем через Lampa.Timeline для совместимости
                    const view = Lampa.Timeline.view(movieKey);
                    if (view && view.handler) {
                        view.handler(100, duration, duration);
                    }
                    // Также сохраняем в нашу timeline
                    timeline[movieKey] = {
                        time: duration,
                        percent: 100,
                        duration: duration,
                        updated: Date.now()
                    };
                    saveTimeline();
                    notify('✅ Отмечено как просмотренное');
                }
            });
            
            return true;
        }
        
        lastPosition = currentTime;
        return false;
    }

    function saveCurrentProgress(timeInSeconds, force = false) {
        const c = cfg();
        if (!c.auto_save && !force) return false;
        
        const movieKey = getCurrentMovieKey();
        if (!movieKey) return false;
        
        const currentTime = Math.floor(timeInSeconds);
        const savedTime = timeline[movieKey]?.time || 0;
        
        if (!force && Math.abs(currentTime - savedTime) < 10) return false;
        
        let duration = Lampa.Player.playdata()?.timeline?.duration || 0;
        if (duration === 0 && timeline[movieKey]?.duration > 0) {
            duration = timeline[movieKey].duration;
        }
        
        const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
        
        // Сохраняем в нашу timeline
        timeline[movieKey] = {
            time: currentTime,
            percent: percent,
            duration: duration,
            updated: Date.now(),
            tmdb_id: getCurrentMovieTmdbId(),
            source: getSource()
        };
        
        saveTimeline();
        
        // Также обновляем через Lampa.Timeline для отображения на карточках
        const view = Lampa.Timeline.view(movieKey);
        if (view && view.handler) {
            view.handler(percent, currentTime, duration);
        }
        
        if (duration > 0) checkEndCredits(currentTime, duration);
        if (percent >= 90) {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                addToHistory(activity.movie, { time: currentTime, percent, duration });
            }
        }
        
        return true;
    }

    function getCurrentMovieTmdbId() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                const card = activity.movie;
                return card.tmdb_id || card.id;
            }
        } catch(e) {}
        return null;
    }

    function initPlayerHandler() {
        let lastSyncToGist = 0;
        
        playerCheckInterval = setInterval(() => {
            const c = cfg();
            if (!c.enabled) return;
            
            if (Lampa.Player.opened()) {
                try {
                    const data = Lampa.Player.playdata();
                    if (data && data.timeline && data.timeline.time) {
                        currentMovieTime = data.timeline.time;
                        
                        if (c.auto_save) {
                            const saved = saveCurrentProgress(currentMovieTime);
                            if (saved) {
                                const now = Date.now();
                                if (c.auto_sync && (now - lastSyncToGist) >= (c.sync_interval * 1000)) {
                                    syncAll(false);
                                    lastSyncToGist = now;
                                }
                            }
                        }
                    }
                } catch(e) {}
            } else {
                endCreditsDetected = false;
            }
        }, 10000);
    }

    function stopPlayerHandler() {
        if (playerCheckInterval) {
            clearInterval(playerCheckInterval);
            playerCheckInterval = null;
        }
    }

    // ============ СИНХРОНИЗАЦИЯ С GIST ============
    function getGistAuth() {
        const c = cfg();
        return (c.gist_token && c.gist_id) ? { token: c.gist_token, id: c.gist_id } : null;
    }

    function syncFile(type, data, showNotify = false) {
        const gist = getGistAuth();
        if (!gist) return;
        
        const files = {};
        files[GIST_FILES[type]] = { content: JSON.stringify(data) };
        
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${gist.token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            data: JSON.stringify({ files }),
            success: () => {
                if (showNotify) notify(`✅ ${type} синхронизирован`);
            },
            error: (xhr) => {
                console.error('[NSL] ${type} sync error:', xhr);
                if (showNotify) notify(`❌ Ошибка синхронизации ${type}`);
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
        
        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${gist.token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: function(response) {
                let hasChanges = false;
                
                ['timeline', 'sections', 'favorites', 'history'].forEach(type => {
                    try {
                        const file = response.files[GIST_FILES[type]];
                        if (file && file.content) {
                            const remoteData = JSON.parse(file.content);
                            
                            if (type === 'timeline') {
                                const strategy = cfg().sync_strategy;
                                for (const key in remoteData) {
                                    const remote = remoteData[key];
                                    const local = timeline[key];
                                    
                                    if (!local) {
                                        timeline[key] = remote;
                                        hasChanges = true;
                                    } else {
                                        let shouldUseRemote = false;
                                        
                                        if (strategy === 'max_time') {
                                            shouldUseRemote = (remote.time || 0) > (local.time || 0);
                                        } else {
                                            shouldUseRemote = (remote.updated || 0) > (local.updated || 0);
                                        }
                                        
                                        if (shouldUseRemote) {
                                            timeline[key] = remote;
                                            hasChanges = true;
                                        }
                                    }
                                }
                            } else {
                                const localData = type === 'sections' ? sections : 
                                                 (type === 'favorites' ? favorites : history);
                                
                                remoteData.forEach(remote => {
                                    const existing = localData.find(l => l.id === remote.id);
                                    if (!existing) {
                                        localData.push(remote);
                                        hasChanges = true;
                                    } else if ((remote.updated || remote.watched_at || 0) > (existing.updated || existing.watched_at || 0)) {
                                        Object.assign(existing, remote);
                                        hasChanges = true;
                                    }
                                });
                            }
                        }
                    } catch(e) {
                        console.warn('[NSL] Error parsing ${type}:', e);
                    }
                });
                
                if (hasChanges) {
                    saveTimeline();
                    saveSections();
                    saveFavorites();
                    saveHistory();
                    renderSectionsMenu();
                }
                
                const files = {};
                files[GIST_FILES.timeline] = { content: JSON.stringify(timeline) };
                files[GIST_FILES.sections] = { content: JSON.stringify(sections) };
                files[GIST_FILES.favorites] = { content: JSON.stringify(favorites) };
                files[GIST_FILES.history] = { content: JSON.stringify(history) };
                
                $.ajax({
                    url: `https://api.github.com/gists/${gist.id}`,
                    method: 'PATCH',
                    headers: {
                        'Authorization': `token ${gist.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    data: JSON.stringify({ files }),
                    success: function() {
                        if (showNotify) notify('✅ Синхронизация завершена');
                        syncInProgress = false;
                        if (pendingSync) {
                            pendingSync = false;
                            setTimeout(() => syncAll(false), 1000);
                        }
                    },
                    error: function(xhr) {
                        if (showNotify) notify('❌ Ошибка отправки: ' + xhr.status);
                        syncInProgress = false;
                    }
                });
            },
            error: function(xhr) {
                if (showNotify) notify('❌ Ошибка загрузки: ' + xhr.status);
                syncInProgress = false;
            }
        });
    }

    // ============ ЭКСПОРТ/ИМПОРТ ============
    function exportData() {
        const data = {
            version: SYNC_VERSION,
            exported: new Date().toISOString(),
            timeline: timeline,
            sections: sections,
            favorites: favorites,
            history: history
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nsl_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        notify('📤 Данные экспортированы');
    }

    function importData() {
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
                        timeline = data.timeline;
                        saveTimeline();
                    }
                    if (data.sections) {
                        sections = data.sections;
                        saveSections();
                    }
                    if (data.favorites) {
                        favorites = data.favorites;
                        saveFavorites();
                    }
                    if (data.history) {
                        history = data.history;
                        saveHistory();
                    }
                    
                    renderSectionsMenu();
                    forceUITimelineUpdate();
                    notify('📥 Данные импортированы');
                } catch(err) {
                    console.error('[NSL] Import error:', err);
                    notify('❌ Ошибка импорта');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // ============ ИМПОРТ ИЗ CUB (ИСПРАВЛЕН) ============
    function importFromCUB() {
        const c = cfg();
        if (c.cub_import_done) return;
        
        notify('🔄 Импорт из CUB...');
        
        try {
            // Получаем данные избранного из Lampa.Favorite
            const cubFavorites = Lampa.Storage.get('favorite', {});
            let imported = 0;
            
            // Маппинг типов CUB в категории NSL
            const typeMapping = {
                'book': 'favorite',
                'like': 'favorite',
                'wath': 'watchlist',
                'history': 'watched',
                'look': 'watching',
                'viewed': 'watched',
                'scheduled': 'watchlist',
                'continued': 'watching',
                'thrown': 'dropped'
            };
            
            // Обрабатываем все типы из CUB
            for (const cubType in cubFavorites) {
                const items = cubFavorites[cubType];
                if (!items || !Array.isArray(items)) continue;
                
                const targetCategory = typeMapping[cubType];
                if (!targetCategory) continue;
                
                items.forEach(card => {
                    if (!card || !card.id) return;
                    
                    // Проверяем, нет ли уже такой карточки в избранном
                    const exists = favorites.some(f => f.card_id == card.id && f.category === targetCategory);
                    if (!exists) {
                        favorites.push({
                            id: generateId(),
                            card_id: card.id,
                            tmdb_id: card.tmdb_id || card.id,
                            media_type: detectMediaType(card),
                            category: targetCategory,
                            data: clearCard(card),
                            added: Date.now(),
                            updated: Date.now()
                        });
                        imported++;
                    }
                });
            }
            
            if (imported > 0) {
                saveFavorites();
                notify(`✅ Импортировано ${imported} закладок из CUB`);
            } else {
                notify('ℹ️ Новых закладок из CUB не найдено');
            }
            
            c.cub_import_done = true;
            saveCfg(c);
        } catch(e) {
            console.error('[NSL] Import from CUB error:', e);
            notify('❌ Ошибка импорта из CUB');
        }
    }

    // ============ МЕНЮ НАСТРОЕК (С ПОДМЕНЮ) ============
    function getFullStats() {
        const stats = {
            sections: sections.length,
            favorites: favorites.length,
            history: history.length,
            timeline: Object.keys(timeline).length,
            timelineCompleted: Object.values(timeline).filter(r => r.percent >= 95).length,
            favoritesByFolder: {},
            favoritesByCategory: {},
            historyByFilter: {}
        };
        
        FAVORITE_FOLDERS.forEach(f => {
            stats.favoritesByFolder[f.id] = favorites.filter(fv => fv.media_type === f.mediaType).length;
        });
        
        Object.keys(FAVORITE_CATEGORIES).forEach(cat => {
            stats.favoritesByCategory[cat] = favorites.filter(f => f.category === cat).length;
        });
        
        HISTORY_FILTERS.forEach(f => {
            if (f.id === 'all') {
                stats.historyByFilter[f.id] = history.length;
            } else {
                stats.historyByFilter[f.id] = history.filter(h => h.media_type === f.id).length;
            }
        });
        
        return stats;
    }

    // Главное меню
    function showMainMenu() {
        const c = cfg();
        const stats = getFullStats();
        
        const items = [
            { title: (c.enabled ? '✅' : '❌') + ' Плагин: ' + (c.enabled ? 'Вкл' : 'Выкл'), action: 'toggle_enabled' },
            { title: '──────────', separator: true },
            { title: '📌 Закладки разделов →', action: 'sections_menu' },
            { title: '⭐ Избранное →', action: 'favorites_menu' },
            { title: '📜 История →', action: 'history_menu' },
            { title: '⏱️ Таймкоды →', action: 'timeline_menu' },
            { title: '⏱️ Продолжить просмотр →', action: 'continue_menu' },
            { title: '──────────', separator: true },
            { title: '☁️ GitHub Gist →', action: 'gist_menu' },
            { title: '──────────', separator: true },
            { title: '🔄 Синхронизировать сейчас', action: 'sync_now' },
            { title: '❌ Закрыть', action: 'cancel' }
        ];
        
        Lampa.Select.show({
            title: 'NSL Sync v' + SYNC_VERSION,
            items: items,
            onSelect: (item) => {
                if (item.action === 'toggle_enabled') {
                    const c = cfg();
                    c.enabled = !c.enabled; saveCfg(c);
                    if (c.enabled) {
                        initPlayerHandler();
                        addSectionButton();
                        renderSectionsMenu();
                        addMenuItems();
                        startBackgroundTasks();
                    } else {
                        stopPlayerHandler();
                        $('.nsl-section-add, .nsl-section-item, .nsl-menu-item, .nsl-split-sections, .nsl-menu-split').remove();
                    }
                    notify('Плагин ' + (c.enabled ? 'включён' : 'выключен'));
                    showMainMenu();
                } else if (item.action === 'sections_menu') {
                    showSectionsMenu();
                } else if (item.action === 'favorites_menu') {
                    showFavoritesMenu();
                } else if (item.action === 'history_menu') {
                    showHistoryMenu();
                } else if (item.action === 'timeline_menu') {
                    showTimelineMenu();
                } else if (item.action === 'continue_menu') {
                    showContinueMenu();
                } else if (item.action === 'gist_menu') {
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

    // Подменю: Закладки разделов
    function showSectionsMenu() {
        const stats = getFullStats();
        
        Lampa.Select.show({
            title: '📌 Закладки разделов',
            items: [
                { title: `Всего: ${stats.sections}`, disabled: true },
                { title: `Положение кнопки: ${cfg().sections_button === 'side' ? 'Боковое меню' : 'Верхняя панель'}`, action: 'sections_button' },
                { title: '──────────', separator: true },
                { title: '🗑️ Очистить все', action: 'clear_sections' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                const c = cfg();
                if (item.action === 'sections_button') {
                    Lampa.Select.show({
                        title: 'Положение кнопки',
                        items: [
                            { title: '📱 Боковое меню', action: 'side' },
                            { title: '⬆️ Верхняя панель', action: 'top' }
                        ],
                        onSelect: (s) => { c.sections_button = s.action; saveCfg(c); $('.nsl-section-add').remove(); addSectionButton(); showSectionsMenu(); },
                        onBack: showSectionsMenu
                    });
                } else if (item.action === 'clear_sections') {
                    sections = []; saveSections(); renderSectionsMenu(); notify('✅ Закладки очищены'); showSectionsMenu();
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: showMainMenu
        });
    }

    // Подменю: Избранное
    function showFavoritesMenu() {
        const stats = getFullStats();
        const c = cfg();
        
        const items = [
            { title: `Всего: ${stats.favorites}`, disabled: true },
            { title: '──────────', separator: true },
            { title: '📁 Папки:', disabled: true }
        ];
        
        FAVORITE_FOLDERS.forEach(f => {
            items.push({ title: `   ${f.icon} ${f.title}: ${stats.favoritesByFolder[f.id] || 0}`, disabled: true });
        });
        
        items.push(
            { title: '──────────', separator: true },
            { title: '🏷️ Категории:', disabled: true }
        );
        
        Object.keys(FAVORITE_CATEGORIES).forEach(cat => {
            items.push({ title: `   ${FAVORITE_CATEGORIES[cat].icon} ${FAVORITE_CATEGORIES[cat].title}: ${stats.favoritesByCategory[cat] || 0}`, disabled: true });
        });
        
        items.push(
            { title: '──────────', separator: true },
            { title: `🔄 Авто в Брошено: ${c.auto_move_dropped ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_dropped' },
            { title: `📅 Дней до Брошено: ${c.auto_move_dropped_days}`, action: 'set_dropped_days' },
            { title: '──────────', separator: true },
            { title: '🗑️ Очистить всё', action: 'clear_favorites' },
            { title: '◀ Назад', action: 'back' }
        );
        
        Lampa.Select.show({
            title: '⭐ Избранное',
            items: items,
            onSelect: (item) => {
                const c = cfg();
                if (item.action === 'toggle_auto_dropped') {
                    c.auto_move_dropped = !c.auto_move_dropped; saveCfg(c); notify('Авто в Брошено ' + (c.auto_move_dropped ? 'включено' : 'выключено')); showFavoritesMenu();
                } else if (item.action === 'set_dropped_days') {
                    Lampa.Input.edit({ title: 'Дней до Брошено', value: String(c.auto_move_dropped_days), free: true, number: true }, (v) => { if (v && !isNaN(v) && v > 0) { c.auto_move_dropped_days = parseInt(v); saveCfg(c); } showFavoritesMenu(); });
                } else if (item.action === 'clear_favorites') {
                    favorites = []; saveFavorites(); notify('✅ Избранное очищено'); showFavoritesMenu();
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: showMainMenu
        });
    }

    // Подменю: История
    function showHistoryMenu() {
        const stats = getFullStats();
        
        const items = [
            { title: `Всего: ${stats.history}`, disabled: true }
        ];
        
        HISTORY_FILTERS.forEach(f => {
            items.push({ title: `   ${f.icon} ${f.title}: ${stats.historyByFilter[f.id] || 0}`, disabled: true });
        });
        
        items.push(
            { title: '──────────', separator: true },
            { title: '🗑️ Очистить историю', action: 'clear_history' },
            { title: '◀ Назад', action: 'back' }
        );
        
        Lampa.Select.show({
            title: '📜 История просмотров',
            items: items,
            onSelect: (item) => {
                if (item.action === 'clear_history') {
                    history = []; saveHistory(); notify('✅ История очищена'); showHistoryMenu();
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: showMainMenu
        });
    }

    // Подменю: Таймкоды
    function showTimelineMenu() {
        const stats = getFullStats();
        const c = cfg();
        
        Lampa.Select.show({
            title: '⏱️ Таймкоды',
            items: [
                { title: `Всего: ${stats.timeline} (завершено: ${stats.timelineCompleted})`, disabled: true },
                { title: '──────────', separator: true },
                { title: `${c.auto_save ? '✅' : '❌'} Автосохранение: ${c.auto_save ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_save' },
                { title: `${c.auto_sync ? '✅' : '❌'} Автосинхронизация: ${c.auto_sync ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_sync' },
                { title: `⏱️ Интервал: ${c.sync_interval} сек`, action: 'set_interval' },
                { title: '──────────', separator: true },
                { title: '📊 Стратегия: ' + (c.sync_strategy === 'max_time' ? 'По длительности' : 'По дате'), action: 'toggle_strategy' },
                { title: `🎬 Порог титров: ${c.end_credits_threshold} сек`, action: 'set_threshold' },
                { title: '──────────', separator: true },
                { title: `🗑️ Удалять старше: ${c.cleanup_days} дней`, action: 'set_cleanup_days' },
                { title: `${c.cleanup_completed ? '✅' : '❌'} Удалять завершённые`, action: 'toggle_cleanup_completed' },
                { title: '──────────', separator: true },
                { title: '🗑️ Очистить все', action: 'clear_timeline' },
                { title: '🧹 Очистить старые сейчас', action: 'cleanup_now' },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                const c = cfg();
                if (item.action === 'toggle_auto_save') {
                    c.auto_save = !c.auto_save; saveCfg(c); notify('Автосохранение ' + (c.auto_save ? 'включено' : 'выключено')); showTimelineMenu();
                } else if (item.action === 'toggle_auto_sync') {
                    c.auto_sync = !c.auto_sync; saveCfg(c); notify('Автосинхронизация ' + (c.auto_sync ? 'включена' : 'выключена')); showTimelineMenu();
                } else if (item.action === 'set_interval') {
                    Lampa.Input.edit({ title: 'Интервал (сек)', value: String(c.sync_interval), free: true, number: true }, (v) => { if (v && !isNaN(v) && v >= 10) { c.sync_interval = parseInt(v); saveCfg(c); } showTimelineMenu(); });
                } else if (item.action === 'toggle_strategy') {
                    c.sync_strategy = c.sync_strategy === 'max_time' ? 'last_watch' : 'max_time'; saveCfg(c);
                    notify('Стратегия: ' + (c.sync_strategy === 'max_time' ? 'По длительности' : 'По дате')); showTimelineMenu();
                } else if (item.action === 'set_threshold') {
                    Lampa.Input.edit({ title: 'Порог титров (сек)', value: String(c.end_credits_threshold), free: true, number: true }, (v) => { if (v && !isNaN(v) && v > 0) { c.end_credits_threshold = parseInt(v); saveCfg(c); } showTimelineMenu(); });
                } else if (item.action === 'set_cleanup_days') {
                    Lampa.Input.edit({ title: 'Удалять старше (дней)', value: String(c.cleanup_days), free: true, number: true }, (v) => { if (v !== null && !isNaN(v) && v >= 0) { c.cleanup_days = parseInt(v); saveCfg(c); } showTimelineMenu(); });
                } else if (item.action === 'toggle_cleanup_completed') {
                    c.cleanup_completed = !c.cleanup_completed; saveCfg(c); notify('Удаление завершённых ' + (c.cleanup_completed ? 'включено' : 'выключено')); showTimelineMenu();
                } else if (item.action === 'clear_timeline') {
                    timeline = {}; saveTimeline(); notify('✅ Таймкоды очищены'); showTimelineMenu();
                } else if (item.action === 'cleanup_now') {
                    cleanupOldRecords(true); showTimelineMenu();
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: showMainMenu
        });
    }

    // Подменю: Продолжить просмотр
    function showContinueMenu() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '⏱️ Продолжить просмотр',
            items: [
                { title: `${c.continue_watching ? '✅' : '❌'} Показывать: ${c.continue_watching ? 'Вкл' : 'Выкл'}`, action: 'toggle_continue' },
                { title: `📊 Мин. прогресс: ${c.continue_min_progress}%`, action: 'set_min_progress' },
                { title: `📊 Макс. прогресс: ${c.continue_max_progress}%`, action: 'set_max_progress' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                const c = cfg();
                if (item.action === 'toggle_continue') {
                    c.continue_watching = !c.continue_watching; saveCfg(c); addMenuItems(); notify('Продолжить просмотр ' + (c.continue_watching ? 'включено' : 'выключено')); showContinueMenu();
                } else if (item.action === 'set_min_progress') {
                    Lampa.Input.edit({ title: 'Мин. прогресс %', value: String(c.continue_min_progress), free: true, number: true }, (v) => { if (v && !isNaN(v) && v >= 0) { c.continue_min_progress = parseInt(v); saveCfg(c); } showContinueMenu(); });
                } else if (item.action === 'set_max_progress') {
                    Lampa.Input.edit({ title: 'Макс. прогресс %', value: String(c.continue_max_progress), free: true, number: true }, (v) => { if (v && !isNaN(v) && v <= 100) { c.continue_max_progress = parseInt(v); saveCfg(c); } showContinueMenu(); });
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: showMainMenu
        });
    }

    // Подменю: GitHub Gist
    function showGistMenu() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '☁️ GitHub Gist',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓ Установлен' : '❌ Не установлен'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0, 8) + '…' : '❌ Не установлен'}`, action: 'id' },
                { title: '──────────', separator: true },
                { title: '📤 Выгрузить в Gist', action: 'upload' },
                { title: '📥 Загрузить из Gist', action: 'download' },
                { title: '──────────', separator: true },
                { title: '📤 Экспорт в файл', action: 'export' },
                { title: '📥 Импорт из файла', action: 'import' },
                { title: '📥 Импорт из CUB', action: 'import_cub' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                const c = cfg();
                
                if (item.action === 'token') {
                    Lampa.Input.edit({ title: 'GitHub Token', value: c.gist_token, free: true }, (v) => { if (v !== null) { c.gist_token = v || ''; saveCfg(c); } showGistMenu(); });
                } else if (item.action === 'id') {
                    Lampa.Input.edit({ title: 'Gist ID', value: c.gist_id, free: true }, (v) => { if (v !== null) { c.gist_id = v || ''; saveCfg(c); } showGistMenu(); });
                } else if (item.action === 'upload') {
                    syncAll(true);
                    setTimeout(() => showGistMenu(), 1500);
                } else if (item.action === 'download') {
                    syncAll(true);
                    setTimeout(() => showGistMenu(), 1500);
                } else if (item.action === 'export') {
                    exportData(); setTimeout(() => showGistMenu(), 500);
                } else if (item.action === 'import') {
                    importData(); setTimeout(() => showGistMenu(), 500);
                } else if (item.action === 'import_cub') {
                    importFromCUB(); setTimeout(() => showGistMenu(), 1500);
                } else if (item.action === 'back') {
                    showMainMenu();
                }
            },
            onBack: showMainMenu
        });
    }

    // ============ БОКОВОЕ МЕНЮ ============
    function addMenuItems() {
        setTimeout(() => {
            $('.nsl-menu-item, .nsl-menu-split').remove();
            if (!cfg().enabled) return;

            const menuList = $('.menu .menu__list').eq(0);
            if (!menuList.length) {
                console.warn('[NSL] Menu list not found');
                return;
            }

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
        }, 2000);
    }

    function handleMenuAction(action) {
        if (action === 'sections') {
            if (sections.length === 0) { notify('📌 Нет сохранённых закладок'); return; }
            if (sections.length === 1) { openSection(sections[0]); return; }
            const items = sections.map(s => ({ title: s.name, onSelect: () => openSection(s) }));
            Lampa.Select.show({ title: 'Мои закладки', items, onBack: () => Lampa.Controller.toggle('content') });
        } else if (action === 'favorites') {
            const items = FAVORITE_FOLDERS.map(f => ({ 
                title: `${f.icon} ${f.title} (${favorites.filter(fv => fv.media_type === f.mediaType).length})`, 
                onSelect: () => Lampa.Activity.push({ url: '', title: f.title, component: 'category', source: 'nsl_favorites', folder: f.id, page: 1 }) 
            }));
            Lampa.Select.show({ title: 'Моё избранное', items, onBack: () => Lampa.Controller.toggle('content') });
        } else if (action === 'history') {
            const items = HISTORY_FILTERS.map(f => ({ 
                title: `${f.icon} ${f.title} (${f.id === 'all' ? history.length : history.filter(h => h.media_type === f.id).length})`, 
                onSelect: () => Lampa.Activity.push({ url: '', title: f.title, component: 'category', source: 'nsl_history', filter: f.id, page: 1 }) 
            }));
            Lampa.Select.show({ title: 'Моя история', items, onBack: () => Lampa.Controller.toggle('content') });
        } else if (action === 'collection') {
            Lampa.Activity.push({ url: '', title: 'Коллекция', component: 'category', source: 'nsl_favorites', category: 'collection', page: 1 });
        } else if (action === 'continue') {
            Lampa.Activity.push({ url: '', title: 'Продолжить просмотр', component: 'category', source: 'nsl_continue', page: 1 });
        }
    }

    // ============ КНОПКА НА КАРТОЧКЕ ============
    function addCardButton() {
        Lampa.Listener.follow('full', (e) => {
            if (e.type !== 'complite' || !cfg().favorites_enabled) return;

            const container = $(e.body).find('.full-start-new__buttons');
            if (!container.length) return;
            
            // Проверяем, нет ли уже кнопки
            if (container.find('.nsl-fav-btn').length) return;

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

    // ============ ФОНОВЫЕ ЗАДАЧИ ============
    function startBackgroundTasks() {
        const c = cfg();
        
        autoSyncInterval = setInterval(() => {
            if (!syncInProgress && c.auto_sync && c.enabled && !Lampa.Player.opened()) {
                syncAll(false);
                checkAutoMoveToDropped();
                cleanupOldRecords(false);
            }
        }, c.sync_interval * 1000);
    }

    // ============ НАСТРОЙКИ ============
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        
        Lampa.SettingsApi.addComponent({
            component: 'nsl_sync',
            name: 'NSL Sync v' + SYNC_VERSION,
            icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'nsl_sync',
            param: { name: 'open', type: 'button' },
            field: { name: 'Открыть меню' },
            onChange: () => {
                Lampa.Controller.toggle('settings');
                setTimeout(showMainMenu, 100);
            }
        });
    }

    // ============ ИНИЦИАЛИЗАЦИЯ ============
    function init() {
        isV3 = Lampa.Manifest && Lampa.Manifest.app_digital >= 300;
        
        protectFileView();
        loadSections();
        loadFavorites();
        loadHistory();
        loadTimeline();
        
        registerSources();
        addSettings();
        
        const c = cfg();
        if (!c.enabled) {
            console.log('[NSL] Плагин выключен');
            return;
        }
        
        console.log('[NSL] 🚀 Запуск v' + SYNC_VERSION);
        
        setTimeout(() => {
            initPlayerHandler();
            addSectionButton();
            renderSectionsMenu();
            addMenuItems();
            addCardButton();
            startBackgroundTasks();
            
            if (c.auto_sync) setTimeout(() => syncAll(false), 3000);
            if (!c.cub_import_done) setTimeout(importFromCUB, 2000);
            
            console.log('[NSL] ✅ v' + SYNC_VERSION + ' загружен');
            notify('🚀 NSL Sync v' + SYNC_VERSION + ' загружен');
        }, 500);
    }

    // Запуск
    if (window.Lampa && Lampa.Listener) {
        if (window.appready) init();
        else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') init(); });
    } else {
        setTimeout(function wait() {
            if (window.Lampa && Lampa.Listener) {
                if (window.appready) init();
                else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') init(); });
            } else setTimeout(wait, 100);
        }, 100);
    }
})();
