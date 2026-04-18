(function () {
    'use strict';

    if (window.nsl_sync_init) return;
    window.nsl_sync_init = true;

    // ============ КОНФИГУРАЦИЯ ============
    const CFG_KEY = 'nsl_sync_cfg';
    const SYNC_VERSION = 16;
    
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
    
    const FAVORITE_CATEGORIES = {
        'favorite':   { icon: '⭐', title: 'Избранное', color: '#FFD700' },
        'watching':   { icon: '👁️', title: 'Смотрю', color: '#2196F3' },
        'watchlist':  { icon: '📋', title: 'Буду смотреть', color: '#4CAF50' },
        'watched':    { icon: '✅', title: 'Просмотрено', color: '#9C27B0' },
        'dropped':    { icon: '❌', title: 'Брошено', color: '#F44336' },
        'collection': { icon: '📦', title: 'Коллекция', color: '#FF9800' }
    };
    
    const FAVORITE_FOLDERS = [
        { id: 'movies', icon: '🎬', title: 'Фильмы', mediaType: 'movie' },
        { id: 'tv', icon: '📺', title: 'Сериалы', mediaType: 'tv' },
        { id: 'cartoons', icon: '🐭', title: 'Мультфильмы', mediaType: 'cartoon' },
        { id: 'cartoons_tv', icon: '🐭📺', title: 'Мультсериалы', mediaType: 'cartoon_tv' },
        { id: 'anime', icon: '🇯🇵', title: 'Аниме', mediaType: 'anime' }
    ];
    
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
    let endCreditsDetected = false;
    let lastPosition = 0;

    // ============ УТИЛИТЫ ============
    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            auto_save: true,
            auto_sync: true,
            sync_interval: 30,
            always_show_timeline: true,
            timeline_position: 'bottom',
            sync_strategy: 'last_watch',
            cleanup_days: 30,
            cleanup_completed: true,
            end_credits_threshold: 180,
            sections_enabled: true,
            sections_button: 'side',
            favorites_enabled: true,
            auto_move_dropped: false,
            auto_move_dropped_days: 30,
            history_enabled: true,
            continue_watching: true,
            continue_min_progress: 5,
            continue_max_progress: 95,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform ? Lampa.Platform.get() : 'Unknown',
            manual_profile_id: '',
            cub_import_done: false,
            use_proxy: false,
            proxy_url: 'https://api.allorigins.win/raw?url='
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function notify(text, timeout) {
        timeout = timeout || 3000;
        if (Lampa.Noty && Lampa.Noty.show) {
            Lampa.Noty.show(text, timeout);
        }
    }

    function getCurrentProfileId() {
        var c = cfg();
        if (c.manual_profile_id) return c.manual_profile_id;
        var profileId = Lampa.Storage.get('profile_id', '');
        if (profileId) return profileId;
        var accountUser = Lampa.Storage.get('account_user', {});
        if (accountUser.profile) return String(accountUser.profile);
        return '';
    }

    function getStorageKey(baseKey) {
        var profileId = getCurrentProfileId();
        return profileId ? baseKey + '_' + profileId : baseKey;
    }

    function getSource() {
        return Lampa.Storage.field('source') || 'tmdb';
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
        
        var isTV = !!(card.name || card.first_air_date || card.original_name);
        var genres = card.genres || card.genre_ids || [];
        
        var hasAnimation = false;
        for (var i = 0; i < genres.length; i++) {
            var g = genres[i];
            var id = typeof g === 'object' ? g.id : g;
            if (id === 16) {
                hasAnimation = true;
                break;
            }
        }
        
        var isJapanese = (card.original_language === 'ja') || false;
        if (card.origin_country && card.origin_country.indexOf('JP') !== -1) isJapanese = true;
        
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
            var activity = Lampa.Activity.active();
            if (!activity || !activity.movie) return null;
            
            var card = activity.movie;
            var tmdbId = card.tmdb_id || card.id;
            if (!tmdbId) return null;
            
            var playerData = Lampa.Player.playdata();
            var season = null;
            var episode = null;
            
            if (playerData && playerData.timeline) {
                if (playerData.timeline.season !== undefined) {
                    season = playerData.timeline.season;
                    episode = playerData.timeline.episode;
                }
            }
            
            if (playerData && playerData.path && (season === null || episode === null)) {
                var url = playerData.path;
                var patterns = [/[Ss](\d+)[Ee](\d+)/, /(\d+)x(\d+)/];
                for (var p = 0; p < patterns.length; p++) {
                    var match = url.match(patterns[p]);
                    if (match && match[1] && match[2]) {
                        season = parseInt(match[1]);
                        episode = parseInt(match[2]);
                        break;
                    }
                }
            }
            
            if (season !== null && episode !== null) {
                return tmdbId + '_s' + season + '_e' + episode;
            }
            
            return String(tmdbId);
        } catch(e) {
            return null;
        }
    }
    
    function getCurrentMovieTmdbId() {
        try {
            var activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                var card = activity.movie;
                return card.tmdb_id || card.id;
            }
        } catch(e) {}
        return null;
    }

    function debounce(func, wait) {
        clearTimeout(uiUpdateTimer);
        uiUpdateTimer = setTimeout(func, wait);
    }

    // ============ ЗАЩИТА ТАЙМКОДОВ ============
    function protectFileView() {
        var originalSetItem = localStorage.setItem;
        var timelineKey = getStorageKey(STORAGE_KEYS.timeline);
        
        localStorage.setItem = function(key, value) {
            if (key === timelineKey) {
                try {
                    var newData = JSON.parse(value);
                    for (var id in protectedTimeline) {
                        if (protectedTimeline.hasOwnProperty(id) && protectedTimeline[id].time > 0) {
                            if (!newData[id] || (newData[id].time || 0) < protectedTimeline[id].time) {
                                newData[id] = JSON.parse(JSON.stringify(protectedTimeline[id]));
                            }
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
        var stored = Lampa.Storage.get(getStorageKey(STORAGE_KEYS.sections), []);
        sections = Array.isArray(stored) ? stored : [];
        return sections;
    }

    function saveSections() {
        if (!Array.isArray(sections)) sections = [];
        Lampa.Storage.set(getStorageKey(STORAGE_KEYS.sections), sections, true);
        renderSectionsMenu();
        if (cfg().auto_sync) syncFile('sections', sections);
    }

    function loadFavorites() {
        var stored = Lampa.Storage.get(getStorageKey(STORAGE_KEYS.favorites), []);
        favorites = Array.isArray(stored) ? stored : [];
        return favorites;
    }

    function saveFavorites() {
        if (!Array.isArray(favorites)) favorites = [];
        Lampa.Storage.set(getStorageKey(STORAGE_KEYS.favorites), favorites, true);
        if (cfg().auto_sync) syncFile('favorites', favorites);
    }

    function loadHistory() {
        var stored = Lampa.Storage.get(getStorageKey(STORAGE_KEYS.history), []);
        history = Array.isArray(stored) ? stored : [];
        return history;
    }

    function saveHistory() {
        if (!Array.isArray(history)) history = [];
        Lampa.Storage.set(getStorageKey(STORAGE_KEYS.history), history, true);
        if (cfg().auto_sync) syncFile('history', history);
    }

    function loadTimeline() {
        var key = getStorageKey(STORAGE_KEYS.timeline);
        var stored = Lampa.Storage.get(key, {});
        timeline = (stored && typeof stored === 'object') ? stored : {};
        protectedTimeline = JSON.parse(JSON.stringify(timeline));
        return timeline;
    }

    function saveTimeline() {
        var key = getStorageKey(STORAGE_KEYS.timeline);
        Lampa.Storage.set(key, timeline, true);
        protectedTimeline = JSON.parse(JSON.stringify(timeline));
        if (cfg().auto_sync) syncFile('timeline', timeline);
        forceUITimelineUpdate();
    }

    function cleanupOldRecords(showNotify) {
        showNotify = showNotify || false;
        var c = cfg();
        var now = Date.now();
        var cutoffDate = now - (c.cleanup_days * 86400000);
        var cleaned = 0;
        var completedCleaned = 0;
        var newTimeline = {};
        
        for (var key in timeline) {
            if (!timeline.hasOwnProperty(key)) continue;
            var record = timeline[key];
            var shouldDelete = false;
            
            var time = record.time || 0;
            var percent = record.percent || 0;
            var updated = record.updated || 0;
            
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
            
            if (!shouldDelete) {
                newTimeline[key] = record;
            }
        }
        
        var hasChanges = Object.keys(timeline).length !== Object.keys(newTimeline).length;
        if (hasChanges) {
            timeline = newTimeline;
            saveTimeline();
            if (showNotify) notify('🧹 Удалено: ' + cleaned + ' старых, ' + completedCleaned + ' завершённых');
        } else if (showNotify) {
            notify('🧹 Нет записей для очистки');
        }
    }

    // ============ ЗАКЛАДКИ РАЗДЕЛОВ ============
    function isSectionAllowed() {
        var act = Lampa.Activity.active();
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
        var key = makeSectionKey(act);
        for (var i = 0; i < sections.length; i++) {
            if (sections[i].key === key) return true;
        }
        return false;
    }

    function addSection() {
        var act = Lampa.Activity.active();
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
        }, function(val) {
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
        var newSections = [];
        for (var i = 0; i < sections.length; i++) {
            if (sections[i].id !== item.id) newSections.push(sections[i]);
        }
        sections = newSections;
        saveSections();
        notify('🗑️ Закладка удалена');
        renderSectionsMenu();
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
        
        var menuList = $('.menu .menu__list').eq(0);
        if (!menuList.length) return;
        
        menuList.append('<li class="menu__split nsl-split-sections"></li>');
        
        var maxItems = Math.min(sections.length, 10);
        for (var i = 0; i < maxItems; i++) {
            var item = sections[i];
            (function(section) {
                var el = $('<li class="menu__item selector nsl-section-item"><div class="menu__ico">📌</div><div class="menu__text">' + escapeHtml(section.name) + '</div></li>');
                el.on('hover:enter', function(e) { e.stopPropagation(); openSection(section); });
                el.on('hover:long', function(e) {
                    e.stopPropagation();
                    Lampa.Select.show({
                        title: 'Удалить "' + section.name + '"?',
                        items: [
                            { title: '✅ Да', action: 'remove' },
                            { title: '❌ Нет', action: 'cancel' }
                        ],
                        onSelect: function(a) { if (a.action === 'remove') removeSection(section); }
                    });
                });
                menuList.append(el);
            })(item);
        }
    }

    function addSectionButton() {
        if (!cfg().sections_enabled) return;
        
        var c = cfg();
        
        var doAdd = function() {
            if (c.sections_button === 'top') {
                if (Lampa.Head && Lampa.Head.addIcon) {
                    Lampa.Head.addIcon(
                        '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/></svg>',
                        addSection
                    );
                }
            } else {
                var menuLists = $('.menu .menu__list');
                if (!menuLists.length) {
                    setTimeout(doAdd, 500);
                    return;
                }
                var menuList = menuLists.eq(1);
                if (!menuList.length) menuList = menuLists.eq(0);
                if (!menuList.length || menuList.find('.nsl-section-add').length) return;
                
                var btn = $('<li class="menu__item selector nsl-section-add"><div class="menu__ico">📌</div><div class="menu__text">Добавить закладку</div></li>');
                btn.on('hover:enter', addSection);
                menuList.append(btn);
            }
        };
        
        setTimeout(doAdd, 1000);
        setTimeout(doAdd, 3000);
        setTimeout(doAdd, 5000);
    }
    
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // ============ ИЗБРАННОЕ ============
    function getFavoritesByFolder(folderId) {
        var folder = null;
        for (var i = 0; i < FAVORITE_FOLDERS.length; i++) {
            if (FAVORITE_FOLDERS[i].id === folderId) {
                folder = FAVORITE_FOLDERS[i];
                break;
            }
        }
        if (!folder) return [];
        
        var result = [];
        for (var j = 0; j < favorites.length; j++) {
            if (favorites[j].media_type === folder.mediaType) {
                result.push(favorites[j].data);
            }
        }
        return result;
    }

    function getFavoritesByCategory(category) {
        var result = [];
        for (var i = 0; i < favorites.length; i++) {
            if (favorites[i].category === category) {
                result.push(favorites[i].data);
            }
        }
        return result;
    }

    function isInFavorites(cardId, category) {
        for (var i = 0; i < favorites.length; i++) {
            if (favorites[i].card_id == cardId && favorites[i].category === category) return true;
        }
        return false;
    }

    function addToFavorites(card, category) {
        if (!card || !card.id) return false;
        
        var mediaType = detectMediaType(card);
        var existing = null;
        for (var i = 0; i < favorites.length; i++) {
            if (favorites[i].card_id == card.id && favorites[i].category === category) {
                existing = favorites[i];
                break;
            }
        }
        
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
        notify('✅ Добавлено в "' + FAVORITE_CATEGORIES[category].title + '"');
        return true;
    }

    function removeFromFavorites(cardId, category) {
        var newFavorites = [];
        for (var i = 0; i < favorites.length; i++) {
            if (!(favorites[i].card_id == cardId && favorites[i].category === category)) {
                newFavorites.push(favorites[i]);
            }
        }
        favorites = newFavorites;
        saveFavorites();
        notify('🗑️ Удалено из избранного');
    }

    function showFavoriteMenu(card) {
        var items = [];
        
        for (var cat in FAVORITE_CATEGORIES) {
            if (!FAVORITE_CATEGORIES.hasOwnProperty(cat)) continue;
            var info = FAVORITE_CATEGORIES[cat];
            var isAdded = isInFavorites(card.id, cat);
            
            items.push({
                title: info.icon + ' ' + info.title,
                checkbox: true,
                checked: isAdded,
                onSelect: (function(category, added) {
                    return function() {
                        if (added) {
                            removeFromFavorites(card.id, category);
                        } else {
                            addToFavorites(card, category);
                        }
                    };
                })(cat, isAdded)
            });
        }
        
        Lampa.Select.show({
            title: '⭐ Добавить в избранное',
            items: items,
            onBack: function() { Lampa.Controller.toggle('content'); }
        });
    }

    // ============ ИСТОРИЯ ============
    function addToHistory(card, progress) {
        progress = progress || {};
        if (!card || !card.id) return;
        
        var mediaType = detectMediaType(card);
        
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
        var filtered = [];
        
        if (filterId === 'all') {
            filtered = history.slice();
        } else {
            for (var i = 0; i < history.length; i++) {
                if (history[i].media_type === filterId) {
                    filtered.push(history[i]);
                }
            }
        }
        
        filtered.sort(function(a, b) { return b.watched_at - a.watched_at; });
        
        var result = [];
        for (var j = 0; j < filtered.length; j++) {
            result.push(filtered[j].data);
        }
        return result;
    }

    // ============ ПРОДОЛЖИТЬ ПРОСМОТР ============
    function getContinueWatching() {
        var c = cfg();
        if (!c.continue_watching) return [];
        
        var result = [];
        var added = {};
        
        for (var key in timeline) {
            if (!timeline.hasOwnProperty(key)) continue;
            var record = timeline[key];
            var percent = record.percent || 0;
            
            if (percent >= c.continue_min_progress && percent <= c.continue_max_progress) {
                var tmdbId = record.tmdb_id || key.split('_')[0];
                var favItem = null;
                
                for (var i = 0; i < favorites.length; i++) {
                    if (String(favorites[i].tmdb_id) === String(tmdbId)) {
                        favItem = favorites[i];
                        break;
                    }
                }
                
                if (favItem && !added[favItem.card_id]) {
                    var itemData = JSON.parse(JSON.stringify(favItem.data));
                    itemData.progress = percent;
                    result.push(itemData);
                    added[favItem.card_id] = true;
                }
            }
        }
        
        return result.slice(0, 20);
    }

    // ============ ТАЙМКОДЫ ============
    function injectTimelineStyles() {
        if (styleInjected) return;
        
        var c = cfg();
        var posStyles = '';
        switch(c.timeline_position) {
            case 'center':
                posStyles = 'bottom: auto; top: 50%; transform: translateY(-50%);';
                break;
            case 'top':
                posStyles = 'bottom: auto; top: 0.5em;';
                break;
            default:
                posStyles = 'bottom: 2.5em; top: auto;';
        }
        
        var style = document.createElement('style');
        style.id = 'nsl-timeline-styles';
        style.textContent = '.card .card-watched { display: block !important; opacity: 1 !important; visibility: visible !important; pointer-events: none; ' + posStyles + ' left: 0.8em !important; right: 0.8em !important; z-index: 5 !important; background-color: rgba(0, 0, 0, 0.7) !important; -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); font-size: 0.9em; padding: 0.2em 0.5em; border-radius: 0.3em; text-align: center; } .card:not(.focus) .card-watched { display: block !important; opacity: 0.8 !important; }';
        document.head.appendChild(style);
        styleInjected = true;
    }

    function removeTimelineStyles() {
        $('#nsl-timeline-styles').remove();
        styleInjected = false;
    }

    function forceUITimelineUpdate() {
        debounce(function() {
            if (Lampa.Timeline && Lampa.Timeline.read) {
                Lampa.Timeline.read(true);
            }
        }, 100);
    }

    function checkEndCredits(currentTime, duration) {
        var c = cfg();
        if (!duration || duration <= 0) return false;
        
        var remaining = duration - currentTime;
        var threshold = c.end_credits_threshold || 180;
        
        if (remaining <= threshold && remaining > 0 && !endCreditsDetected) {
            endCreditsDetected = true;
            if (currentTime > lastPosition + 30) return false;
            
            Lampa.Noty.show('🎬 Финальные титры. Отметить как просмотренное?', 5000, function() {
                var movieKey = getCurrentMovieKey();
                if (movieKey) {
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

    function saveCurrentProgress(timeInSeconds, force) {
        force = force || false;
        var c = cfg();
        if (!c.auto_save && !force) return false;
        
        var movieKey = getCurrentMovieKey();
        if (!movieKey) return false;
        
        var currentTime = Math.floor(timeInSeconds);
        var savedTime = timeline[movieKey] ? timeline[movieKey].time || 0 : 0;
        
        if (!force && Math.abs(currentTime - savedTime) < 10) return false;
        
        var duration = 0;
        var playerData = Lampa.Player.playdata();
        if (playerData && playerData.timeline && playerData.timeline.duration) {
            duration = playerData.timeline.duration;
        }
        if (duration === 0 && timeline[movieKey] && timeline[movieKey].duration > 0) {
            duration = timeline[movieKey].duration;
        }
        
        var percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
        
        timeline[movieKey] = {
            time: currentTime,
            percent: percent,
            duration: duration,
            updated: Date.now(),
            tmdb_id: getCurrentMovieTmdbId(),
            source: getSource()
        };
        
        saveTimeline();
        
        if (duration > 0) checkEndCredits(currentTime, duration);
        if (percent >= 90) {
            var activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                addToHistory(activity.movie, { time: currentTime, percent: percent, duration: duration });
            }
        }
        
        return true;
    }

    function initPlayerHandler() {
        var lastSyncToGist = 0;
        
        if (playerCheckInterval) clearInterval(playerCheckInterval);
        
        playerCheckInterval = setInterval(function() {
            var c = cfg();
            if (!c.enabled) return;
            
            if (Lampa.Player.opened()) {
                try {
                    var data = Lampa.Player.playdata();
                    if (data && data.timeline && data.timeline.time) {
                        if (c.auto_save) {
                            saveCurrentProgress(data.timeline.time);
                            var now = Date.now();
                            if (c.auto_sync && (now - lastSyncToGist) >= (c.sync_interval * 1000)) {
                                syncAll(false);
                                lastSyncToGist = now;
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
        var c = cfg();
        return (c.gist_token && c.gist_id) ? { token: c.gist_token, id: c.gist_id } : null;
    }
    
    function makeGistRequest(method, gistId, data, callback, errorCallback) {
        var c = cfg();
        var url = 'https://api.github.com/gists/' + gistId;
        
        $.ajax({
            url: url,
            method: method,
            headers: {
                'Authorization': 'token ' + c.gist_token,
                'Accept': 'application/vnd.github.v3+json'
            },
            data: data ? JSON.stringify(data) : null,
            success: callback,
            error: function(xhr) {
                if (errorCallback) errorCallback(xhr);
            }
        });
    }

    function syncFile(type, data, showNotify) {
        showNotify = showNotify || false;
        var gist = getGistAuth();
        if (!gist) return;
        
        var files = {};
        files[GIST_FILES[type]] = { content: JSON.stringify(data) };
        
        makeGistRequest('PATCH', gist.id, { files: files }, 
            function() { if (showNotify) notify('✅ ' + type + ' синхронизирован'); },
            function(xhr) { if (showNotify) notify('❌ Ошибка синхронизации ' + type); }
        );
    }

    function syncAll(showNotify) {
        showNotify = showNotify !== false;
        var gist = getGistAuth();
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
        
        makeGistRequest('GET', gist.id, null,
            function(response) {
                var hasChanges = false;
                var typeList = ['timeline', 'sections', 'favorites', 'history'];
                
                for (var t = 0; t < typeList.length; t++) {
                    var type = typeList[t];
                    try {
                        var file = response.files[GIST_FILES[type]];
                        if (file && file.content) {
                            var remoteData = JSON.parse(file.content);
                            var localData = type === 'timeline' ? timeline : 
                                           (type === 'sections' ? sections : 
                                           (type === 'favorites' ? favorites : history));
                            
                            if (type === 'timeline') {
                                var strategy = cfg().sync_strategy;
                                for (var key in remoteData) {
                                    if (!remoteData.hasOwnProperty(key)) continue;
                                    var remote = remoteData[key];
                                    var local = timeline[key];
                                    
                                    if (!local) {
                                        timeline[key] = remote;
                                        hasChanges = true;
                                    } else {
                                        var shouldUseRemote = false;
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
                                for (var r = 0; r < remoteData.length; r++) {
                                    var remote = remoteData[r];
                                    var existing = null;
                                    for (var l = 0; l < localData.length; l++) {
                                        if (localData[l].id === remote.id) {
                                            existing = localData[l];
                                            break;
                                        }
                                    }
                                    if (!existing) {
                                        localData.push(remote);
                                        hasChanges = true;
                                    } else {
                                        var remoteTime = remote.updated || remote.watched_at || 0;
                                        var localTime = existing.updated || existing.watched_at || 0;
                                        if (remoteTime > localTime) {
                                            for (var prop in remote) {
                                                if (remote.hasOwnProperty(prop)) {
                                                    existing[prop] = remote[prop];
                                                }
                                            }
                                            hasChanges = true;
                                        }
                                    }
                                }
                            }
                        }
                    } catch(e) {}
                }
                
                if (hasChanges) {
                    saveTimeline();
                    saveSections();
                    saveFavorites();
                    saveHistory();
                    renderSectionsMenu();
                }
                
                var files = {};
                files[GIST_FILES.timeline] = { content: JSON.stringify(timeline) };
                files[GIST_FILES.sections] = { content: JSON.stringify(sections) };
                files[GIST_FILES.favorites] = { content: JSON.stringify(favorites) };
                files[GIST_FILES.history] = { content: JSON.stringify(history) };
                
                makeGistRequest('PATCH', gist.id, { files: files },
                    function() {
                        if (showNotify) notify('✅ Синхронизация завершена');
                        syncInProgress = false;
                        if (pendingSync) {
                            pendingSync = false;
                            setTimeout(function() { syncAll(false); }, 1000);
                        }
                    },
                    function(xhr) {
                        if (showNotify) notify('❌ Ошибка отправки: ' + (xhr.status || 'unknown'));
                        syncInProgress = false;
                    }
                );
            },
            function(xhr) {
                if (showNotify) notify('❌ Ошибка загрузки: ' + (xhr.status || 'unknown'));
                syncInProgress = false;
            }
        );
    }

    // ============ ЭКСПОРТ/ИМПОРТ ============
    function exportData() {
        var data = {
            version: SYNC_VERSION,
            exported: new Date().toISOString(),
            timeline: timeline,
            sections: sections,
            favorites: favorites,
            history: history
        };
        
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'nsl_backup_' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        notify('📤 Данные экспортированы');
    }

    function importData() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;
            
            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    var data = JSON.parse(e.target.result);
                    if (data.timeline) { timeline = data.timeline; saveTimeline(); }
                    if (data.sections) { sections = data.sections; saveSections(); renderSectionsMenu(); }
                    if (data.favorites) { favorites = data.favorites; saveFavorites(); }
                    if (data.history) { history = data.history; saveHistory(); }
                    notify('📥 Данные импортированы');
                } catch(err) {
                    notify('❌ Ошибка импорта');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    function importFromCUB() {
        Lampa.Select.show({
            title: 'Импорт из CUB',
            items: [
                { title: '📥 Импортировать закладки и историю из CUB?', disabled: true },
                { title: '──────────', separator: true },
                { title: '✅ Да, импортировать', action: 'import' },
                { title: '❌ Нет', action: 'cancel' }
            ],
            onSelect: function(item) {
                if (item.action === 'import') {
                    notify('🔄 Импорт из CUB...');
                    try {
                        var cubFavorites = Lampa.Storage.get('favorite', {});
                        var imported = 0;
                        
                        if (cubFavorites && cubFavorites.book && cubFavorites.book.length) {
                            cubFavorites.book.forEach(function(card) {
                                if (card && card.id && !favorites.find(function(f) { return f.card_id == card.id; })) {
                                    favorites.push({
                                        id: generateId(),
                                        card_id: card.id,
                                        tmdb_id: card.id,
                                        media_type: detectMediaType(card),
                                        category: 'favorite',
                                        data: clearCard(card),
                                        added: Date.now(),
                                        updated: Date.now()
                                    });
                                    imported++;
                                }
                            });
                        }
                        
                        if (cubFavorites && cubFavorites.like && cubFavorites.like.length) {
                            cubFavorites.like.forEach(function(card) {
                                if (card && card.id && !favorites.find(function(f) { return f.card_id == card.id && f.category === 'favorite'; })) {
                                    favorites.push({
                                        id: generateId(),
                                        card_id: card.id,
                                        tmdb_id: card.id,
                                        media_type: detectMediaType(card),
                                        category: 'favorite',
                                        data: clearCard(card),
                                        added: Date.now(),
                                        updated: Date.now()
                                    });
                                    imported++;
                                }
                            });
                        }
                        
                        if (imported > 0) saveFavorites();
                        notify('✅ Импортировано ' + imported + ' закладок');
                    } catch(e) {
                        notify('❌ Ошибка импорта');
                    }
                    
                    var c = cfg();
                    c.cub_import_done = true;
                    saveCfg(c);
                }
                Lampa.Controller.toggle('content');
            }
        });
    }

    // ============ МЕНЮ НАСТРОЕК ============
    function getFullStats() {
        var stats = {
            sections: sections.length,
            favorites: favorites.length,
            history: history.length,
            timeline: Object.keys(timeline).length,
            timelineCompleted: 0
        };
        
        for (var key in timeline) {
            if (timeline[key].percent >= 95) stats.timelineCompleted++;
        }
        return stats;
    }
    
    function showMainMenu() {
        var c = cfg();
        var stats = getFullStats();
        
        var items = [
            { title: (c.enabled ? '[✓]' : '[ ]') + ' Плагин: ' + (c.enabled ? 'Включен' : 'Выключен'), action: 'toggle_enabled' },
            { title: '──────────', separator: true },
            { title: '📌 Закладки разделов (' + stats.sections + ')', action: 'submenu_sections' },
            { title: '⭐ Избранное (' + stats.favorites + ')', action: 'submenu_favorites' },
            { title: '📜 История (' + stats.history + ')', action: 'submenu_history' },
            { title: '⏱️ Таймкоды (' + stats.timeline + ')', action: 'submenu_timeline' },
            { title: '⏱️ Продолжить', action: 'submenu_continue' },
            { title: '☁️ GitHub Gist', action: 'submenu_gist' },
            { title: '──────────', separator: true },
            { title: '🔄 Синхронизировать сейчас', action: 'sync_now' },
            { title: '❌ Закрыть', action: 'cancel' }
        ];
        
        Lampa.Select.show({
            title: 'NSL Sync v' + SYNC_VERSION,
            items: items,
            onSelect: function(item) {
                var c = cfg();
                if (item.action === 'toggle_enabled') {
                    c.enabled = !c.enabled; saveCfg(c);
                    if (c.enabled) {
                        initPlayerHandler();
                        if (c.always_show_timeline) injectTimelineStyles();
                        addSectionButton();
                        renderSectionsMenu();
                        addMenuItems();
                        startBackgroundTasks();
                        startCardButtonObserver();
                    } else {
                        stopPlayerHandler();
                        removeTimelineStyles();
                        stopCardButtonObserver();
                        $('.nsl-section-add, .nsl-section-item, .nsl-menu-item, .nsl-fav-btn').remove();
                    }
                    notify('Плагин ' + (c.enabled ? 'включен' : 'выключен'));
                    showMainMenu();
                } else if (item.action === 'submenu_sections') showSectionsMenu();
                else if (item.action === 'submenu_favorites') showFavoritesMenu();
                else if (item.action === 'submenu_history') showHistoryMenu();
                else if (item.action === 'submenu_timeline') showTimelineMenu();
                else if (item.action === 'submenu_continue') showContinueMenu();
                else if (item.action === 'submenu_gist') showGistMenu();
                else if (item.action === 'sync_now') { Lampa.Controller.toggle('content'); syncAll(true); }
                else if (item.action === 'cancel') Lampa.Controller.toggle('content');
            }
        });
    }
    
    function showSectionsMenu() {
        var c = cfg();
        Lampa.Select.show({
            title: 'Закладки разделов',
            items: [
                { title: 'Положение кнопки: ' + (c.sections_button === 'side' ? 'Боковое меню' : 'Верхняя панель'), action: 'sections_button' },
                { title: '🗑️ Очистить все', action: 'clear_sections' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: function(item) {
                var c = cfg();
                if (item.action === 'sections_button') {
                    Lampa.Select.show({
                        title: 'Положение кнопки',
                        items: [
                            { title: '📱 Боковое меню', action: 'side' },
                            { title: '⬆️ Верхняя панель', action: 'top' }
                        ],
                        onSelect: function(s) { c.sections_button = s.action; saveCfg(c); $('.nsl-section-add').remove(); addSectionButton(); showSectionsMenu(); }
                    });
                } else if (item.action === 'clear_sections') { sections = []; saveSections(); renderSectionsMenu(); notify('✅ Закладки очищены'); showSectionsMenu(); }
                else if (item.action === 'back') showMainMenu();
            }
        });
    }
    
    function showFavoritesMenu() {
        var c = cfg();
        Lampa.Select.show({
            title: 'Избранное',
            items: [
                { title: '🔄 Авто в Брошено: ' + (c.auto_move_dropped ? 'Вкл' : 'Выкл'), action: 'toggle_auto_dropped' },
                { title: '📅 Дней до Брошено: ' + c.auto_move_dropped_days, action: 'set_dropped_days' },
                { title: '🗑️ Очистить всё', action: 'clear_favorites' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: function(item) {
                var c = cfg();
                if (item.action === 'toggle_auto_dropped') { c.auto_move_dropped = !c.auto_move_dropped; saveCfg(c); showFavoritesMenu(); }
                else if (item.action === 'set_dropped_days') {
                    Lampa.Input.edit({ title: 'Дней до Брошено', value: String(c.auto_move_dropped_days), free: true, number: true }, function(v) {
                        if (v && !isNaN(v) && v > 0) { c.auto_move_dropped_days = parseInt(v); saveCfg(c); }
                        showFavoritesMenu();
                    });
                } else if (item.action === 'clear_favorites') { favorites = []; saveFavorites(); notify('✅ Избранное очищено'); showFavoritesMenu(); }
                else if (item.action === 'back') showMainMenu();
            }
        });
    }
    
    function showHistoryMenu() {
        Lampa.Select.show({
            title: 'История',
            items: [
                { title: '🗑️ Очистить историю', action: 'clear_history' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: function(item) {
                if (item.action === 'clear_history') { history = []; saveHistory(); notify('✅ История очищена'); showHistoryMenu(); }
                else if (item.action === 'back') showMainMenu();
            }
        });
    }
    
    function showTimelineMenu() {
        var c = cfg();
        Lampa.Select.show({
            title: 'Таймкоды',
            items: [
                { title: (c.auto_save ? '[✓]' : '[ ]') + ' Автосохранение', action: 'toggle_auto_save' },
                { title: (c.auto_sync ? '[✓]' : '[ ]') + ' Автосинхронизация', action: 'toggle_auto_sync' },
                { title: 'Интервал: ' + c.sync_interval + ' сек', action: 'set_interval' },
                { title: '──────────', separator: true },
                { title: (c.always_show_timeline ? '[✓]' : '[ ]') + ' Показывать на карточках', action: 'toggle_timeline' },
                { title: 'Позиция: ' + (c.timeline_position === 'bottom' ? 'Снизу' : c.timeline_position === 'center' ? 'По центру' : 'Сверху'), action: 'timeline_position' },
                { title: 'Стратегия: ' + (c.sync_strategy === 'max_time' ? 'По длительности' : 'По дате'), action: 'toggle_strategy' },
                { title: '──────────', separator: true },
                { title: 'Удалять старше: ' + c.cleanup_days + ' дней', action: 'set_cleanup_days' },
                { title: (c.cleanup_completed ? '[✓]' : '[ ]') + ' Удалять завершённые', action: 'toggle_cleanup_completed' },
                { title: '🗑️ Очистить все', action: 'clear_timeline' },
                { title: '🧹 Очистить старые', action: 'cleanup_now' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: function(item) {
                var c = cfg();
                if (item.action === 'toggle_auto_save') { c.auto_save = !c.auto_save; saveCfg(c); showTimelineMenu(); }
                else if (item.action === 'toggle_auto_sync') { c.auto_sync = !c.auto_sync; saveCfg(c); showTimelineMenu(); }
                else if (item.action === 'set_interval') {
                    Lampa.Input.edit({ title: 'Интервал (сек)', value: String(c.sync_interval), free: true, number: true }, function(v) {
                        if (v && !isNaN(v) && v >= 10) { c.sync_interval = parseInt(v); saveCfg(c); }
                        showTimelineMenu();
                    });
                } else if (item.action === 'toggle_timeline') {
                    c.always_show_timeline = !c.always_show_timeline; saveCfg(c);
                    c.always_show_timeline ? injectTimelineStyles() : removeTimelineStyles();
                    showTimelineMenu();
                } else if (item.action === 'timeline_position') {
                    Lampa.Select.show({
                        title: 'Позиция',
                        items: [
                            { title: '⬇️ Снизу', action: 'bottom' },
                            { title: '📍 По центру', action: 'center' },
                            { title: '⬆️ Сверху', action: 'top' }
                        ],
                        onSelect: function(s) { c.timeline_position = s.action; saveCfg(c); if (c.always_show_timeline) { removeTimelineStyles(); injectTimelineStyles(); } showTimelineMenu(); }
                    });
                } else if (item.action === 'toggle_strategy') { c.sync_strategy = c.sync_strategy === 'max_time' ? 'last_watch' : 'max_time'; saveCfg(c); showTimelineMenu(); }
                else if (item.action === 'set_cleanup_days') {
                    Lampa.Input.edit({ title: 'Дней', value: String(c.cleanup_days), free: true, number: true }, function(v) {
                        if (v !== null && !isNaN(v) && v >= 0) { c.cleanup_days = parseInt(v); saveCfg(c); }
                        showTimelineMenu();
                    });
                } else if (item.action === 'toggle_cleanup_completed') { c.cleanup_completed = !c.cleanup_completed; saveCfg(c); showTimelineMenu(); }
                else if (item.action === 'clear_timeline') { timeline = {}; saveTimeline(); notify('✅ Таймкоды очищены'); showTimelineMenu(); }
                else if (item.action === 'cleanup_now') { cleanupOldRecords(true); showTimelineMenu(); }
                else if (item.action === 'back') showMainMenu();
            }
        });
    }
    
    function showContinueMenu() {
        var c = cfg();
        Lampa.Select.show({
            title: 'Продолжить просмотр',
            items: [
                { title: (c.continue_watching ? '[✓]' : '[ ]') + ' Показывать', action: 'toggle_continue' },
                { title: 'Мин. прогресс: ' + c.continue_min_progress + '%', action: 'set_min_progress' },
                { title: 'Макс. прогресс: ' + c.continue_max_progress + '%', action: 'set_max_progress' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: function(item) {
                var c = cfg();
                if (item.action === 'toggle_continue') { c.continue_watching = !c.continue_watching; saveCfg(c); addMenuItems(); showContinueMenu(); }
                else if (item.action === 'set_min_progress') {
                    Lampa.Input.edit({ title: 'Мин. прогресс %', value: String(c.continue_min_progress), free: true, number: true }, function(v) {
                        if (v && !isNaN(v) && v >= 0) { c.continue_min_progress = parseInt(v); saveCfg(c); }
                        showContinueMenu();
                    });
                } else if (item.action === 'set_max_progress') {
                    Lampa.Input.edit({ title: 'Макс. прогресс %', value: String(c.continue_max_progress), free: true, number: true }, function(v) {
                        if (v && !isNaN(v) && v <= 100) { c.continue_max_progress = parseInt(v); saveCfg(c); }
                        showContinueMenu();
                    });
                } else if (item.action === 'back') showMainMenu();
            }
        });
    }
    
    function showGistMenu() {
        var c = cfg();
        Lampa.Select.show({
            title: 'GitHub Gist',
            items: [
                { title: '🔑 Токен: ' + (c.gist_token ? '✓ Установлен' : '❌ Не установлен'), action: 'token' },
                { title: '📄 Gist ID: ' + (c.gist_id ? c.gist_id.substring(0, 8) + '…' : '❌ Не установлен'), action: 'id' },
                { title: '──────────', separator: true },
                { title: '📤 Экспорт данных', action: 'export' },
                { title: '📥 Импорт данных', action: 'import' },
                { title: '📥 Импорт из CUB', action: 'import_cub' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: function(item) {
                var c = cfg();
                if (item.action === 'token') {
                    Lampa.Input.edit({ title: 'GitHub Token', value: c.gist_token, free: true }, function(v) { if (v !== null) { c.gist_token = v || ''; saveCfg(c); } showGistMenu(); });
                } else if (item.action === 'id') {
                    Lampa.Input.edit({ title: 'Gist ID', value: c.gist_id, free: true }, function(v) { if (v !== null) { c.gist_id = v || ''; saveCfg(c); } showGistMenu(); });
                } else if (item.action === 'export') { exportData(); showGistMenu(); }
                else if (item.action === 'import') { importData(); setTimeout(showGistMenu, 500); }
                else if (item.action === 'import_cub') { importFromCUB(); }
                else if (item.action === 'back') showMainMenu();
            }
        });
    }

    // ============ БОКОВОЕ МЕНЮ ============
    function addMenuItems() {
        var doAdd = function() {
            $('.nsl-menu-item, .nsl-menu-split').remove();
            if (!cfg().enabled) return;
            
            var menuLists = $('.menu .menu__list');
            if (!menuLists.length) {
                setTimeout(doAdd, 500);
                return;
            }
            
            var menuList = menuLists.eq(0);
            if (!menuList.length) return;
            
            var itemsToAdd = [];
            
            if (cfg().sections_enabled && sections.length) {
                itemsToAdd.push({ action: 'sections', icon: '📌', title: 'Мои закладки (' + sections.length + ')' });
            }
            if (cfg().favorites_enabled) {
                itemsToAdd.push({ action: 'favorites', icon: '⭐', title: 'Избранное (' + favorites.length + ')' });
            }
            if (cfg().history_enabled) {
                itemsToAdd.push({ action: 'history', icon: '📜', title: 'История (' + history.length + ')' });
            }
            if (cfg().continue_watching) {
                itemsToAdd.push({ action: 'continue', icon: '⏱️', title: 'Продолжить' });
            }
            
            if (!itemsToAdd.length) return;
            
            if (menuList.find('.nsl-menu-split').length === 0) {
                menuList.append('<li class="menu__split nsl-menu-split"></li>');
            }
            
            for (var i = 0; i < itemsToAdd.length; i++) {
                var item = itemsToAdd[i];
                var el = $('<li class="menu__item selector nsl-menu-item"><div class="menu__ico">' + item.icon + '</div><div class="menu__text">' + item.title + '</div></li>');
                el.on('hover:enter', (function(action) {
                    return function(e) { 
                        e.stopPropagation(); 
                        handleMenuAction(action); 
                    };
                })(item.action));
                menuList.append(el);
            }
        };
        
        setTimeout(doAdd, 1000);
        setTimeout(doAdd, 3000);
        setTimeout(doAdd, 5000);
    }

    function handleMenuAction(action) {
        if (action === 'sections') {
            if (!sections.length) { notify('📌 Нет сохранённых закладок'); return; }
            if (sections.length === 1) { openSection(sections[0]); return; }
            var items = [];
            for (var i = 0; i < sections.length; i++) {
                (function(s) {
                    items.push({ title: s.name, onSelect: function() { openSection(s); } });
                })(sections[i]);
            }
            Lampa.Select.show({ title: 'Мои закладки', items: items, onBack: function() { Lampa.Controller.toggle('content'); } });
        } else if (action === 'favorites') {
            var items = [];
            for (var f = 0; f < FAVORITE_FOLDERS.length; f++) {
                var folder = FAVORITE_FOLDERS[f];
                var count = 0;
                for (var i = 0; i < favorites.length; i++) {
                    if (favorites[i].media_type === folder.mediaType) count++;
                }
                (function(folderId, folderTitle, folderIcon, cnt) {
                    items.push({ 
                        title: folderIcon + ' ' + folderTitle + ' (' + cnt + ')', 
                        onSelect: function() { 
                            Lampa.Activity.push({ url: '', title: folderTitle, component: 'category_full', source: 'nsl_favorites', folder: folderId, page: 1 }); 
                        } 
                    });
                })(folder.id, folder.title, folder.icon, count);
            }
            Lampa.Select.show({ title: 'Избранное', items: items, onBack: function() { Lampa.Controller.toggle('content'); } });
        } else if (action === 'history') {
            var items = [];
            for (var h = 0; h < HISTORY_FILTERS.length; h++) {
                var filter = HISTORY_FILTERS[h];
                var count = filter.id === 'all' ? history.length : 0;
                if (filter.id !== 'all') {
                    for (var i = 0; i < history.length; i++) {
                        if (history[i].media_type === filter.id) count++;
                    }
                }
                (function(filterId, filterTitle, filterIcon, cnt) {
                    items.push({ 
                        title: filterIcon + ' ' + filterTitle + ' (' + cnt + ')', 
                        onSelect: function() { 
                            Lampa.Activity.push({ url: '', title: filterTitle, component: 'category_full', source: 'nsl_history', filter: filterId, page: 1 }); 
                        } 
                    });
                })(filter.id, filter.title, filter.icon, count);
            }
            Lampa.Select.show({ title: 'История', items: items, onBack: function() { Lampa.Controller.toggle('content'); } });
        } else if (action === 'continue') {
            Lampa.Activity.push({ url: '', title: 'Продолжить просмотр', component: 'category_full', source: 'nsl_continue', page: 1 });
        }
    }

    // ============ КНОПКА НА КАРТОЧКЕ ============
    function startCardButtonObserver() {
        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite' && cfg().enabled) {
                setTimeout(function() {
                    var container = document.querySelector('.full-start-new__buttons');
                    if (container && !container.querySelector('.nsl-fav-btn')) {
                        var act = Lampa.Activity.active();
                        var movie = act && act.card;
                        
                        if (movie) {
                            var btn = document.createElement('div');
                            btn.className = 'full-start__button selector nsl-fav-btn';
                            btn.innerHTML = '<div class="full-start__button-icon">⭐</div><div class="full-start__button-text">В избранное</div>';
                            
                            (function(m) {
                                $(btn).on('hover:enter', function() { showFavoriteMenu(m); });
                            })(movie);
                            
                            container.insertBefore(btn, container.firstChild);
                        }
                    }
                }, 300);
            }
        });
    }
    
    function stopCardButtonObserver() {}

    // ============ РЕГИСТРАЦИЯ ИСТОЧНИКОВ ============
    function registerSources() {
        Lampa.Api.sources.nsl_favorites = {
            category: function(params, oncomplite) {
                var items = getFavoritesByFolder(params.folder || 'movies');
                if (!Array.isArray(items)) items = [];
                
                var page = params.page || 1;
                var limit = 20;
                var start = (page - 1) * limit;
                var end = start + limit;
                var paginated = items.slice(start, end);
                
                oncomplite({
                    results: paginated,
                    total_pages: Math.max(1, Math.ceil(items.length / limit)),
                    page: page
                });
            }
        };
        
        Lampa.Api.sources.nsl_history = {
            category: function(params, oncomplite) {
                var filter = params.filter || 'all';
                var items = getHistoryByFilter(filter);
                if (!Array.isArray(items)) items = [];
                
                var page = params.page || 1;
                var limit = 20;
                var start = (page - 1) * limit;
                var end = start + limit;
                var paginated = items.slice(start, end);
                
                oncomplite({
                    results: paginated,
                    total_pages: Math.max(1, Math.ceil(items.length / limit)),
                    page: page
                });
            }
        };
        
        Lampa.Api.sources.nsl_continue = {
            category: function(params, oncomplite) {
                var items = getContinueWatching();
                if (!Array.isArray(items)) items = [];
                
                var page = params.page || 1;
                var limit = 20;
                var start = (page - 1) * limit;
                var end = start + limit;
                var paginated = items.slice(start, end);
                
                oncomplite({
                    results: paginated,
                    total_pages: Math.max(1, Math.ceil(items.length / limit)),
                    page: page
                });
            }
        };
    }

    // ============ ФОНОВЫЕ ЗАДАЧИ ============
    function startBackgroundTasks() {
        var c = cfg();
        if (autoSyncInterval) clearInterval(autoSyncInterval);
        
        autoSyncInterval = setInterval(function() {
            if (!syncInProgress && c.auto_sync && c.enabled && !Lampa.Player.opened()) {
                syncAll(false);
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
            onChange: function() {
                Lampa.Controller.toggle('settings');
                setTimeout(showMainMenu, 100);
            }
        });
    }

    // ============ ИНИЦИАЛИЗАЦИЯ ============
    function init() {
        protectFileView();
        loadSections();
        loadFavorites();
        loadHistory();
        loadTimeline();
        
        registerSources();
        addSettings();
        
        var c = cfg();
        if (!c.enabled) {
            console.log('[NSL] Плагин выключен');
            return;
        }
        
        console.log('[NSL] 🚀 Запуск v' + SYNC_VERSION);
        
        setTimeout(function() {
            if (c.always_show_timeline) injectTimelineStyles();
            initPlayerHandler();
            addSectionButton();
            renderSectionsMenu();
            addMenuItems();
            startCardButtonObserver();
            startBackgroundTasks();
            
            if (c.auto_sync) setTimeout(function() { syncAll(false); }, 3000);
            if (!c.cub_import_done) setTimeout(importFromCUB, 2000);
            
            console.log('[NSL] ✅ Загружен');
            notify('🚀 NSL Sync v' + SYNC_VERSION + ' загружен');
        }, 500);
    }

    // Запуск
    if (window.Lampa && Lampa.Listener) {
        if (window.appready) init();
        else Lampa.Listener.follow('app', function(e) { if (e.type === 'ready') init(); });
    } else {
        setTimeout(function wait() {
            if (window.Lampa && Lampa.Listener) {
                if (window.appready) init();
                else Lampa.Listener.follow('app', function(e) { if (e.type === 'ready') init(); });
            } else setTimeout(wait, 100);
        }, 100);
    }
})();
