(function () {
    'use strict';

    // ======================
    // 1. КОНФИГУРАЦИЯ И УТИЛИТЫ
    // ======================

    const PLUGIN_VERSION = '16';
    const STORAGE_PREFIX = 'nsl_';
    
    // Ключи хранилища
    const CFG_KEY = STORAGE_PREFIX + 'cfg';
    const SECTIONS_KEY = STORAGE_PREFIX + 'sections';
    const FAVORITES_KEY = STORAGE_PREFIX + 'favorites';
    const HISTORY_KEY = STORAGE_PREFIX + 'history';
    const TIMELINE_KEY = STORAGE_PREFIX + 'timeline';
    
    // Категории избранного
    const FAVORITE_CATEGORIES = ['favorite', 'watching', 'planned', 'watched', 'abandoned', 'collection'];
    const FAVORITE_CATEGORY_NAMES = {
        favorite: '⭐ Избранное',
        watching: '👁️ Смотрю',
        planned: '📋 Буду смотреть',
        watched: '✅ Просмотрено',
        abandoned: '❌ Брошено',
        collection: '📦 Коллекция'
    };
    
    // Типы контента для папок
    const MEDIA_TYPES = {
        movie: { name: 'Фильмы', icon: '🎬', filter: (item) => !item.original_name },
        tv: { name: 'Сериалы', icon: '📺', filter: (item) => item.original_name && !item.animation && !item.anime },
        cartoon: { name: 'Мультфильмы', icon: '🐭', filter: (item) => !item.original_name && item.animation },
        cartoon_series: { name: 'Мультсериалы', icon: '🐭📺', filter: (item) => item.original_name && item.animation && !item.anime },
        anime: { name: 'Аниме', icon: '🇯🇵', filter: (item) => item.anime }
    };
    
    let pluginInstance = null;
    
    // ======================
    // 2. ОСНОВНОЙ КЛАСС ПЛАГИНА
    // ======================
    
    class NSLSync {
        constructor() {
            if (pluginInstance) return pluginInstance;
            pluginInstance = this;
            
            this.config = null;
            this.profileId = null;
            this.syncInProgress = false;
            this.pendingSync = false;
            this.autoSyncInterval = null;
            this.playerInterval = null;
            this.currentMovieTime = 0;
            this.currentMovieKey = null;
            this.lastSavedProgress = 0;
            this.lastSyncTime = 0;
            
            // Модули данных
            this.sections = [];
            this.favorites = [];
            this.history = [];
            this.timeline = {};
            
            this.init();
        }
        
        // ======================
        // 2.1 Инициализация
        // ======================
        
        init() {
            if (window.nsl_sync_initialized) return;
            window.nsl_sync_initialized = true;
            
            this.loadConfig();
            this.loadProfileId();
            this.loadData();
            
            if (!this.config.enabled) {
                console.log('[NSL Sync] Плагин отключен в настройках');
                return;
            }
            
            console.log(`[NSL Sync] v${PLUGIN_VERSION} инициализация. Профиль: ${this.profileId || 'глобальный'}`);
            
            this.initPlayerHandler();
            this.initCardButton();
            this.initSidebar();
            this.initSettings();
            this.startBackgroundSync();
            
            // Загружаем данные с Gist при старте
            setTimeout(() => {
                if (this.config.auto_sync) {
                    this.syncFromGist(false);
                }
            }, 3000);
            
            // Подписываемся на события
            this.subscribeEvents();
            
            Lampa.Noty.show('✅ NSL Sync v' + PLUGIN_VERSION + ' загружен');
        }
        
        loadConfig() {
            this.config = Lampa.Storage.get(CFG_KEY, {
                enabled: true,
                
                // Закладки разделов
                sections_button_position: 'sidebar', // sidebar / top
                
                // Избранное
                auto_abandoned: false,
                abandoned_days: 30,
                
                // Таймкоды
                auto_save: true,
                auto_sync: true,
                sync_interval: 30,
                sync_strategy: 'max_time', // max_time / last_watch
                show_on_cards: true,
                progress_position: 'bottom', // bottom / center / top
                credits_threshold: 60,
                cleanup_older_days: 0,
                cleanup_completed: false,
                
                // Продолжить просмотр
                show_continue: true,
                continue_min_progress: 5,
                continue_max_progress: 95,
                
                // Gist
                gist_token: '',
                gist_id: '',
                device_name: this.getDeviceName(),
                manual_profile_id: ''
            });
        }
        
        saveConfig() {
            Lampa.Storage.set(CFG_KEY, this.config, true);
        }
        
        loadProfileId() {
            if (this.config.manual_profile_id) {
                this.profileId = this.config.manual_profile_id;
                return;
            }
            
            let profileId = Lampa.Storage.get('profile_id', '');
            if (profileId) {
                this.profileId = String(profileId);
                return;
            }
            
            const accountUser = Lampa.Storage.get('account_user', {});
            if (accountUser.profile) {
                this.profileId = String(accountUser.profile);
                return;
            }
            
            this.profileId = '';
        }
        
        getStorageKey(baseKey) {
            return this.profileId ? `${baseKey}_${this.profileId}` : baseKey;
        }
        
        loadData() {
            this.sections = Lampa.Storage.get(this.getStorageKey(SECTIONS_KEY), []);
            this.favorites = Lampa.Storage.get(this.getStorageKey(FAVORITES_KEY), []);
            this.history = Lampa.Storage.get(this.getStorageKey(HISTORY_KEY), []);
            this.timeline = Lampa.Storage.get(this.getStorageKey(TIMELINE_KEY), {});
        }
        
        saveSections() {
            Lampa.Storage.set(this.getStorageKey(SECTIONS_KEY), this.sections, true);
        }
        
        saveFavorites() {
            Lampa.Storage.set(this.getStorageKey(FAVORITES_KEY), this.favorites, true);
            Lampa.Listener.send('state:changed', { target: 'nsl_favorites', reason: 'update' });
        }
        
        saveHistory() {
            Lampa.Storage.set(this.getStorageKey(HISTORY_KEY), this.history, true);
            Lampa.Listener.send('state:changed', { target: 'nsl_history', reason: 'update' });
        }
        
        saveTimeline() {
            Lampa.Storage.set(this.getStorageKey(TIMELINE_KEY), this.timeline, true);
        }
        
        getDeviceName() {
            const platform = Lampa.Platform.get();
            const deviceMap = {
                'android': '📱 Android',
                'ios': '🍎 iOS',
                'webos': '📺 WebOS',
                'tizen': '📺 Tizen',
                'windows': '💻 Windows',
                'macos': '🍎 macOS',
                'linux': '🐧 Linux'
            };
            return deviceMap[platform] || platform || 'Unknown';
        }
        
        subscribeEvents() {
            // Обновление при смене профиля
            Lampa.Listener.follow('state:changed', (e) => {
                if (e.target === 'favorite' && e.reason === 'profile') {
                    setTimeout(() => {
                        this.loadProfileId();
                        this.loadData();
                        this.initSidebar();
                    }, 500);
                }
            });
            
            // Автоматическое добавление в историю при завершении просмотра
            Lampa.Player.listener.follow('destroy', () => {
                if (this.currentMovieKey && this.currentMovieTime > 0) {
                    const progress = this.timeline[this.currentMovieKey];
                    if (progress && progress.percent >= 90) {
                        this.addToHistoryFromCurrent();
                    }
                }
            });
        }
        
        // ======================
        // 3. ТАЙМКОДЫ / ПРОГРЕСС ПРОСМОТРА
        // ======================
        
        getCurrentMovieKey() {
            try {
                const activity = Lampa.Activity.active();
                if (!activity || !activity.movie) return null;
                
                const movie = activity.movie;
                const tmdbId = this.extractTmdbId(movie);
                if (!tmdbId) return null;
                
                // Для сериалов добавляем сезон и серию
                const playerData = Lampa.Player.playdata();
                if (playerData && (playerData.season || playerData.episode)) {
                    const season = playerData.season || 1;
                    const episode = playerData.episode || 1;
                    return `${tmdbId}_s${season}_e${episode}`;
                }
                
                // Для сериалов из URL
                const seriesInfo = this.getSeriesInfoFromUrl();
                if (seriesInfo) {
                    return `${tmdbId}_s${seriesInfo.season}_e${seriesInfo.episode}`;
                }
                
                return String(tmdbId);
            } catch (e) {
                return null;
            }
        }
        
        getSeriesInfoFromUrl() {
            try {
                const playerData = Lampa.Player.playdata();
                if (playerData && playerData.path) {
                    const url = playerData.path;
                    const patterns = [
                        /S(\d+)E(\d+)/i,
                        /S(\d+)[\s.]*E(\d+)/i,
                        /(\d+)x(\d+)/i
                    ];
                    for (const pattern of patterns) {
                        const match = url.match(pattern);
                        if (match && match[1] && match[2]) {
                            return { season: parseInt(match[1]), episode: parseInt(match[2]) };
                        }
                    }
                }
            } catch (e) {}
            return null;
        }
        
        extractTmdbId(item) {
            if (!item) return null;
            if (item.tmdb_id) return String(item.tmdb_id);
            if (item.id && /^\d{6,8}$/.test(String(item.id))) return String(item.id);
            if (item.movie_id && /^\d{6,8}$/.test(String(item.movie_id))) return String(item.movie_id);
            return null;
        }
        
        getMediaType(item) {
            if (!item) return 'movie';
            if (item.original_name) {
                if (item.anime) return 'anime';
                if (item.animation) return 'cartoon_series';
                return 'tv';
            }
            if (item.animation) return 'cartoon';
            return 'movie';
        }
        
        saveProgress(timeInSeconds, force = false) {
            if (!this.config.auto_save && !force) return false;
            
            const movieKey = this.getCurrentMovieKey();
            if (!movieKey) return false;
            
            const currentTime = Math.floor(timeInSeconds);
            const savedTime = this.timeline[movieKey]?.time || 0;
            
            if (force || Math.abs(currentTime - savedTime) >= 10) {
                const playerData = Lampa.Player.playdata();
                const duration = playerData?.timeline?.duration || 0;
                const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
                const tmdbId = this.extractTmdbId(Lampa.Activity.active()?.movie);
                
                this.timeline[movieKey] = {
                    time: currentTime,
                    percent: percent,
                    duration: duration,
                    updated: Date.now(),
                    tmdb_id: tmdbId,
                    source: Lampa.Storage.field('source') || 'tmdb'
                };
                
                this.saveTimeline();
                this.lastSavedProgress = currentTime;
                this.currentMovieTime = currentTime;
                
                console.log(`[NSL Sync] 💾 Сохранён прогресс: ${this.formatTime(currentTime)} (${percent}%) для ${movieKey}`);
                
                // Обновляем Timeline в Lampa
                if (Lampa.Timeline && Lampa.Timeline.update) {
                    Lampa.Timeline.update({
                        hash: movieKey,
                        percent: percent,
                        time: currentTime,
                        duration: duration
                    });
                }
                
                return true;
            }
            return false;
        }
        
        formatTime(seconds) {
            if (!seconds || seconds < 0) return '0:00';
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
        
        initPlayerHandler() {
            let wasPlayerOpen = false;
            let lastSyncToGist = 0;
            
            this.playerInterval = setInterval(() => {
                if (!this.config.enabled) return;
                
                const isPlayerOpen = Lampa.Player.opened();
                const currentTime = this.getCurrentPlayerTime();
                
                // Сохраняем прогресс при закрытии плеера
                if (wasPlayerOpen && !isPlayerOpen && this.currentMovieTime > 0) {
                    console.log(`[NSL Sync] 🛑 Плеер закрыт, сохранение на ${this.formatTime(this.currentMovieTime)}`);
                    this.saveProgress(this.currentMovieTime, true);
                    
                    if (this.config.sync_on_stop) {
                        this.syncToGist(false);
                    }
                }
                
                wasPlayerOpen = isPlayerOpen;
                
                if (isPlayerOpen && currentTime !== null && currentTime > 0) {
                    this.currentMovieTime = currentTime;
                    const movieKey = this.getCurrentMovieKey();
                    
                    if (movieKey && movieKey !== this.currentMovieKey) {
                        console.log(`[NSL Sync] 🎬 Новый ключ: ${movieKey}`);
                        this.currentMovieKey = movieKey;
                        this.lastSavedProgress = 0;
                    }
                    
                    if (this.config.auto_save && Math.floor(currentTime) - this.lastSavedProgress >= 10) {
                        if (this.saveProgress(currentTime)) {
                            const now = Date.now();
                            if (this.config.auto_sync && (now - lastSyncToGist) >= (this.config.sync_interval * 1000)) {
                                console.log(`[NSL Sync] 📤 Автоотправка по интервалу`);
                                this.syncToGist(false);
                                lastSyncToGist = now;
                            }
                        }
                    }
                }
            }, 1000);
            
            console.log('[NSL Sync] Обработчик плеера запущен');
        }
        
        getCurrentPlayerTime() {
            try {
                if (Lampa.Player.opened()) {
                    const playerData = Lampa.Player.playdata();
                    if (playerData && playerData.timeline && playerData.timeline.time) {
                        return playerData.timeline.time;
                    }
                }
            } catch (e) {}
            return null;
        }
        
        // Очистка старых таймкодов
        cleanupTimeline() {
            if (!this.config.cleanup_older_days && !this.config.cleanup_completed) return;
            
            const now = Date.now();
            const olderThan = this.config.cleanup_older_days * 24 * 60 * 60 * 1000;
            let changed = false;
            
            for (const key in this.timeline) {
                const record = this.timeline[key];
                
                // Удаляем старые
                if (olderThan > 0 && record.updated && (now - record.updated) > olderThan) {
                    delete this.timeline[key];
                    changed = true;
                    console.log(`[NSL Sync] 🗑️ Удалён старый таймкод: ${key}`);
                    continue;
                }
                
                // Удаляем завершённые (95%+)
                if (this.config.cleanup_completed && record.percent >= 95) {
                    delete this.timeline[key];
                    changed = true;
                    console.log(`[NSL Sync] 🗑️ Удалён завершённый таймкод: ${key}`);
                }
            }
            
            if (changed) {
                this.saveTimeline();
                this.notify('🧹 Таймкоды очищены');
            }
        }
        
        // ======================
        // 4. ИЗБРАННОЕ
        // ======================
        
        addToFavorites(card, category) {
            if (!card || !card.id) return false;
            
            const tmdbId = this.extractTmdbId(card);
            const mediaType = this.getMediaType(card);
            const existingIndex = this.favorites.findIndex(f => f.tmdb_id === tmdbId && f.category === category);
            
            const favoriteItem = {
                id: Lampa.Utils.uid(),
                card_id: card.id,
                tmdb_id: tmdbId,
                media_type: mediaType,
                category: category,
                data: this.cleanCardData(card),
                added: Date.now(),
                updated: Date.now()
            };
            
            if (existingIndex >= 0) {
                this.favorites[existingIndex] = favoriteItem;
            } else {
                this.favorites.push(favoriteItem);
            }
            
            this.saveFavorites();
            this.checkAutoAbandoned();
            
            return true;
        }
        
        removeFromFavorites(card, category) {
            const tmdbId = this.extractTmdbId(card);
            const index = this.favorites.findIndex(f => f.tmdb_id === tmdbId && f.category === category);
            
            if (index >= 0) {
                this.favorites.splice(index, 1);
                this.saveFavorites();
                return true;
            }
            return false;
        }
        
        toggleFavorite(card, category) {
            if (this.isInFavorites(card, category)) {
                this.removeFromFavorites(card, category);
                return false;
            } else {
                this.addToFavorites(card, category);
                return true;
            }
        }
        
        isInFavorites(card, category) {
            const tmdbId = this.extractTmdbId(card);
            return this.favorites.some(f => f.tmdb_id === tmdbId && f.category === category);
        }
        
        getFavoritesByCategory(category) {
            return this.favorites.filter(f => f.category === category);
        }
        
        getFavoritesByMediaType(category, mediaType) {
            return this.favorites.filter(f => f.category === category && f.media_type === mediaType);
        }
        
        checkAutoAbandoned() {
            if (!this.config.auto_abandoned) return;
            
            const now = Date.now();
            const abandonedAfter = this.config.abandoned_days * 24 * 60 * 60 * 1000;
            let changed = false;
            
            const watchingItems = this.favorites.filter(f => f.category === 'watching');
            
            for (const item of watchingItems) {
                const lastUpdate = item.updated || item.added;
                const timelineRecord = this.timeline[item.tmdb_id];
                const lastWatch = timelineRecord?.updated || 0;
                const lastActivity = Math.max(lastUpdate, lastWatch);
                
                if (lastActivity > 0 && (now - lastActivity) > abandonedAfter) {
                    item.category = 'abandoned';
                    item.updated = now;
                    changed = true;
                    console.log(`[NSL Sync] Автоматически перемещено в "Брошено": ${item.data?.title || item.tmdb_id}`);
                }
            }
            
            if (changed) {
                this.saveFavorites();
                this.notify('📦 Некоторые позиции перемещены в "Брошено"');
            }
        }
        
        cleanCardData(card) {
            const cleaned = {};
            const allowedFields = ['id', 'title', 'name', 'original_title', 'original_name', 
                'poster_path', 'backdrop_path', 'vote_average', 'release_date', 'first_air_date',
                'overview', 'genre_ids', 'source', 'animation', 'anime'];
            
            for (const field of allowedFields) {
                if (card[field] !== undefined) {
                    cleaned[field] = card[field];
                }
            }
            
            return cleaned;
        }
        
        // ======================
        // 5. ИСТОРИЯ ПРОСМОТРОВ
        // ======================
        
        addToHistory(card, progress) {
            if (!card || !card.id) return false;
            
            const tmdbId = this.extractTmdbId(card);
            const mediaType = this.getMediaType(card);
            
            // Проверяем, есть ли уже в истории
            const existingIndex = this.history.findIndex(h => h.tmdb_id === tmdbId);
            
            const historyItem = {
                id: Lampa.Utils.uid(),
                card_id: card.id,
                tmdb_id: tmdbId,
                media_type: mediaType,
                data: this.cleanCardData(card),
                watched_at: Date.now(),
                progress: progress || { percent: 100 }
            };
            
            if (existingIndex >= 0) {
                this.history[existingIndex] = historyItem;
            } else {
                this.history.unshift(historyItem); // новые в начало
            }
            
            // Ограничиваем историю 500 записями
            if (this.history.length > 500) {
                this.history = this.history.slice(0, 500);
            }
            
            this.saveHistory();
            return true;
        }
        
        addToHistoryFromCurrent() {
            try {
                const activity = Lampa.Activity.active();
                if (!activity || !activity.movie) return;
                
                const movie = activity.movie;
                const progress = this.timeline[this.currentMovieKey];
                
                this.addToHistory(movie, progress);
                console.log(`[NSL Sync] 📜 Добавлено в историю: ${movie.title || movie.name}`);
            } catch (e) {
                console.error('[NSL Sync] Ошибка добавления в историю:', e);
            }
        }
        
        clearHistory() {
            this.history = [];
            this.saveHistory();
            this.notify('🗑️ История очищена');
        }
        
        getHistoryByMediaType(mediaType) {
            if (mediaType === 'all') return [...this.history];
            return this.history.filter(h => h.media_type === mediaType);
        }
        
        // ======================
        // 6. ЗАКЛАДКИ РАЗДЕЛОВ
        // ======================
        
        addSection() {
            try {
                const activity = Lampa.Activity.active();
                if (!activity) {
                    this.notify('❌ Не удалось определить текущий раздел');
                    return;
                }
                
                const sectionData = this.extractCurrentSection(activity);
                if (!sectionData) {
                    this.notify('❌ Не удалось сохранить этот раздел');
                    return;
                }
                
                // Проверяем, нет ли уже такой закладки
                const existing = this.sections.find(s => s.key === sectionData.key);
                if (existing) {
                    this.notify('⚠️ Эта страница уже в закладках');
                    return;
                }
                
                sectionData.id = Lampa.Utils.uid();
                sectionData.created = Date.now();
                
                this.sections.push(sectionData);
                this.saveSections();
                
                this.notify(`📌 Добавлено: ${sectionData.name}`);
                this.initSidebar(); // Обновляем меню
                
            } catch (e) {
                console.error('[NSL Sync] Ошибка сохранения раздела:', e);
                this.notify('❌ Ошибка сохранения');
            }
        }
        
        extractCurrentSection(activity) {
            const movie = activity.movie;
            const params = activity.params || {};
            const router = Lampa.Router;
            
            let key = '';
            let name = '';
            let component = '';
            let url = '';
            let source = Lampa.Storage.field('source') || 'tmdb';
            let genres = '';
            let filter = '';
            
            // Определяем тип страницы
            if (movie) {
                // Страница карточки фильма/сериала
                key = `full_${movie.id}`;
                name = movie.title || movie.name || 'Карточка';
                component = 'full';
                url = String(movie.id);
            } else if (activity.component === 'category_full') {
                // Страница категории
                key = `category_${params.genres || params.url || 'all'}`;
                name = activity.title || params.title || 'Категория';
                component = 'category_full';
                url = params.url || 'movie';
                genres = params.genres || '';
                filter = params.filter || '';
            } else if (activity.component === 'favorite') {
                // Страница избранного
                key = `favorite_${params.type || 'all'}`;
                name = activity.title || 'Избранное';
                component = 'favorite';
                filter = params.type || '';
            } else if (activity.component === 'history') {
                // Страница истории
                key = 'history';
                name = 'История';
                component = 'history';
            } else if (activity.component === 'search') {
                // Страница поиска
                key = `search_${params.query || ''}`;
                name = `Поиск: ${params.query || ''}`;
                component = 'search';
                filter = params.query || '';
            } else {
                // Другие компоненты
                key = `${activity.component}_${JSON.stringify(params)}`;
                name = activity.title || activity.component || 'Раздел';
                component = activity.component;
            }
            
            return {
                key: this.hashString(key),
                name: name,
                url: url,
                component: component,
                source: source,
                genres: genres,
                filter: filter,
                params: params
            };
        }
        
        hashString(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            return Math.abs(hash).toString(36);
        }
        
        openSection(section) {
            try {
                const router = Lampa.Router;
                
                switch (section.component) {
                    case 'full':
                        router.call('full', { id: section.url, source: section.source });
                        break;
                    case 'category_full':
                        router.call('category_full', {
                            url: section.url,
                            genres: section.genres,
                            filter: section.filter,
                            title: section.name,
                            source: section.source
                        });
                        break;
                    case 'favorite':
                        router.call('favorite', {
                            type: section.filter || 'book',
                            title: section.name
                        });
                        break;
                    case 'history':
                        router.call('favorite', { type: 'history' });
                        break;
                    case 'search':
                        Lampa.Activity.push({
                            component: 'search',
                            input: section.filter
                        });
                        break;
                    default:
                        Lampa.Activity.push({
                            component: section.component,
                            ...section.params,
                            title: section.name
                        });
                }
            } catch (e) {
                console.error('[NSL Sync] Ошибка открытия раздела:', e);
                this.notify('❌ Не удалось открыть раздел');
            }
        }
        
        removeSection(sectionId) {
            const index = this.sections.findIndex(s => s.id === sectionId);
            if (index >= 0) {
                const name = this.sections[index].name;
                this.sections.splice(index, 1);
                this.saveSections();
                this.notify(`🗑️ Удалено: ${name}`);
                this.initSidebar();
            }
        }
        
        clearAllSections() {
            this.sections = [];
            this.saveSections();
            this.notify('🗑️ Все закладки разделов удалены');
            this.initSidebar();
        }
        
        // ======================
        // 7. ПРОДОЛЖИТЬ ПРОСМОТР
        // ======================
        
        getContinueWatching() {
            if (!this.config.show_continue) return [];
            
            const result = [];
            const minProgress = this.config.continue_min_progress;
            const maxProgress = this.config.continue_max_progress;
            
            for (const [key, timeline] of Object.entries(this.timeline)) {
                if (timeline.percent >= minProgress && timeline.percent <= maxProgress) {
                    // Ищем соответствующую запись в избранном или создаем временную
                    let cardData = null;
                    
                    // Сначала ищем в избранном
                    const favoriteItem = this.favorites.find(f => f.tmdb_id === timeline.tmdb_id);
                    if (favoriteItem) {
                        cardData = favoriteItem.data;
                    }
                    
                    result.push({
                        key: key,
                        tmdb_id: timeline.tmdb_id,
                        time: timeline.time,
                        percent: timeline.percent,
                        duration: timeline.duration,
                        updated: timeline.updated,
                        data: cardData,
                        isSeries: key.includes('_s')
                    });
                }
            }
            
            // Сортируем по дате обновления (сначала новые)
            result.sort((a, b) => (b.updated || 0) - (a.updated || 0));
            
            return result;
        }
        
        // ======================
        // 8. GITHUB GIST СИНХРОНИЗАЦИЯ
        // ======================
        
        getAllSyncData() {
            return {
                version: 16,
                profile_id: this.profileId,
                device: this.config.device_name,
                source: Lampa.Storage.field('source') || 'tmdb',
                updated: Date.now(),
                sections: this.sections,
                favorites: this.favorites,
                history: this.history,
                timeline: this.timeline
            };
        }
        
        applySyncData(data) {
            if (!data) return false;
            
            let changed = false;
            const strategy = this.config.sync_strategy;
            
            // Синхронизация таймкодов с учетом стратегии
            if (data.timeline && typeof data.timeline === 'object') {
                const remoteTimeline = data.timeline;
                const localTimeline = this.timeline;
                
                for (const key in remoteTimeline) {
                    const remote = remoteTimeline[key];
                    const local = localTimeline[key];
                    
                    if (!local) {
                        localTimeline[key] = remote;
                        changed = true;
                        continue;
                    }
                    
                    let shouldUseRemote = false;
                    
                    if (strategy === 'max_time') {
                        // По длительности просмотра
                        if (remote.time > local.time + 5) {
                            shouldUseRemote = true;
                        }
                    } else if (strategy === 'last_watch') {
                        // По дате с защитой от отката
                        const TIME_ROLLBACK_THRESHOLD = 300; // 5 минут
                        
                        // Если удаленная запись не намного меньше локальной И новее по дате
                        if (remote.time >= local.time - TIME_ROLLBACK_THRESHOLD && 
                            (remote.updated || 0) > (local.updated || 0)) {
                            shouldUseRemote = true;
                        }
                    }
                    
                    if (shouldUseRemote) {
                        localTimeline[key] = remote;
                        changed = true;
                        console.log(`[NSL Sync] 🔄 Обновлён таймкод ${key}: ${local.time} → ${remote.time}`);
                    }
                }
                
                if (changed) {
                    this.timeline = localTimeline;
                    this.saveTimeline();
                }
            }
            
            // Синхронизация избранного (мерж без дубликатов)
            if (data.favorites && Array.isArray(data.favorites)) {
                const remoteFavMap = new Map();
                for (const fav of data.favorites) {
                    const key = `${fav.tmdb_id}_${fav.category}`;
                    remoteFavMap.set(key, fav);
                }
                
                const localFavMap = new Map();
                for (const fav of this.favorites) {
                    const key = `${fav.tmdb_id}_${fav.category}`;
                    localFavMap.set(key, fav);
                }
                
                // Добавляем отсутствующие локально
                for (const [key, remoteFav] of remoteFavMap) {
                    if (!localFavMap.has(key)) {
                        this.favorites.push(remoteFav);
                        changed = true;
                    }
                }
                
                if (changed) this.saveFavorites();
            }
            
            // Синхронизация истории (мерж без дубликатов)
            if (data.history && Array.isArray(data.history)) {
                const remoteHistoryMap = new Map();
                for (const hist of data.history) {
                    remoteHistoryMap.set(hist.tmdb_id, hist);
                }
                
                const localHistoryMap = new Map();
                for (const hist of this.history) {
                    localHistoryMap.set(hist.tmdb_id, hist);
                }
                
                for (const [tmdbId, remoteHist] of remoteHistoryMap) {
                    if (!localHistoryMap.has(tmdbId)) {
                        this.history.push(remoteHist);
                        changed = true;
                    }
                }
                
                // Сортируем по дате
                if (changed) {
                    this.history.sort((a, b) => (b.watched_at || 0) - (a.watched_at || 0));
                    this.saveHistory();
                }
            }
            
            // Синхронизация закладок разделов
            if (data.sections && Array.isArray(data.sections)) {
                const remoteSectionMap = new Map();
                for (const section of data.sections) {
                    remoteSectionMap.set(section.key, section);
                }
                
                const localSectionMap = new Map();
                for (const section of this.sections) {
                    localSectionMap.set(section.key, section);
                }
                
                for (const [key, remoteSection] of remoteSectionMap) {
                    if (!localSectionMap.has(key)) {
                        this.sections.push(remoteSection);
                        changed = true;
                    }
                }
                
                if (changed) this.saveSections();
            }
            
            if (changed) {
                this.initSidebar();
                this.notify('✅ Данные синхронизированы');
            }
            
            return changed;
        }
        
        syncToGist(showNotify = true, callback = null) {
            if (!this.config.auto_sync && !showNotify) {
                if (callback) callback(false);
                return;
            }
            
            if (this.syncInProgress) {
                this.pendingSync = true;
                if (callback) callback(false);
                return;
            }
            
            if (!this.config.gist_token || !this.config.gist_id) {
                if (showNotify) this.notify('⚠️ Gist не настроен');
                if (callback) callback(false);
                return;
            }
            
            const data = this.getAllSyncData();
            this.syncInProgress = true;
            
            console.log(`[NSL Sync] 📤 Отправка данных на Gist...`);
            
            $.ajax({
                url: `https://api.github.com/gists/${this.config.gist_id}`,
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${this.config.gist_token}`,
                    'Accept': 'application/vnd.github.v3+json'
                },
                data: JSON.stringify({
                    description: 'NSL Sync Data',
                    public: false,
                    files: {
                        'nsl_sync.json': { content: JSON.stringify(data, null, 2) }
                    }
                }),
                success: () => {
                    if (showNotify) this.notify('✅ Данные отправлены');
                    this.lastSyncTime = Date.now();
                    console.log(`[NSL Sync] ✅ Отправлено успешно`);
                    this.syncInProgress = false;
                    
                    if (this.pendingSync) {
                        this.pendingSync = false;
                        setTimeout(() => this.syncToGist(false, callback), 1000);
                    } else if (callback) {
                        callback(true);
                    }
                },
                error: (xhr) => {
                    console.error('[NSL Sync] ❌ Ошибка отправки:', xhr.status);
                    if (showNotify) this.notify(`❌ Ошибка: ${xhr.status}`);
                    this.syncInProgress = false;
                    if (callback) callback(false);
                }
            });
        }
        
        syncFromGist(showNotify = true, callback = null) {
            if (!this.config.auto_sync && !showNotify) {
                if (callback) callback(false);
                return;
            }
            
            if (this.syncInProgress) {
                if (callback) callback(false);
                return;
            }
            
            if (!this.config.gist_token || !this.config.gist_id) {
                if (showNotify) this.notify('⚠️ Gist не настроен');
                if (callback) callback(false);
                return;
            }
            
            this.syncInProgress = true;
            console.log(`[NSL Sync] 📥 Загрузка с Gist...`);
            
            $.ajax({
                url: `https://api.github.com/gists/${this.config.gist_id}`,
                method: 'GET',
                headers: {
                    'Authorization': `token ${this.config.gist_token}`,
                    'Accept': 'application/vnd.github.v3+json'
                },
                success: (data) => {
                    try {
                        const content = data.files['nsl_sync.json']?.content;
                        if (content) {
                            const remote = JSON.parse(content);
                            console.log(`[NSL Sync] 📥 Данные загружены, версия: ${remote.version}`);
                            this.applySyncData(remote);
                            if (showNotify) this.notify('✅ Данные загружены');
                            if (callback) callback(true);
                        } else {
                            if (showNotify) this.notify('❌ Нет данных');
                            if (callback) callback(false);
                        }
                    } catch (e) {
                        console.error(e);
                        if (callback) callback(false);
                    }
                },
                error: (xhr) => {
                    console.error('[NSL Sync] ❌ Ошибка загрузки:', xhr.status);
                    if (showNotify) this.notify(`❌ Ошибка: ${xhr.status}`);
                    if (callback) callback(false);
                },
                complete: () => {
                    this.syncInProgress = false;
                }
            });
        }
        
        fullSync() {
            this.notify('🔄 Полная синхронизация...');
            this.syncToGist(true, () => {
                setTimeout(() => {
                    this.syncFromGist(true);
                }, 1000);
            });
        }
        
        exportToFile() {
            const data = this.getAllSyncData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nsl_sync_backup_${new Date().toISOString().slice(0, 19)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.notify('📁 Экспорт выполнен');
        }
        
        importFromFile(fileInput) {
            const file = fileInput.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    this.applySyncData(data);
                    this.notify('📁 Импорт выполнен');
                } catch (err) {
                    console.error(err);
                    this.notify('❌ Ошибка импорта');
                }
            };
            reader.readAsText(file);
        }
        
        importFromCUB() {
            // Импорт из существующих закладок CUB
            try {
                const cubFavorites = Lampa.Favorite.all();
                let imported = 0;
                
                for (const card of cubFavorites) {
                    if (!this.isInFavorites(card, 'favorite')) {
                        this.addToFavorites(card, 'favorite');
                        imported++;
                    }
                }
                
                this.notify(`📥 Импортировано ${imported} закладок из CUB`);
                this.syncToGist(false);
            } catch (e) {
                console.error('[NSL Sync] Ошибка импорта из CUB:', e);
                this.notify('❌ Ошибка импорта из CUB');
            }
        }
        
        // ======================
        // 9. UI КОМПОНЕНТЫ
        // ======================
        
        notify(text) {
            Lampa.Noty.show(text);
        }
        
        initSidebar() {
            // Добавляем пункты в боковое меню
            const menuItems = [];
            
            // Закладки разделов
            if (this.sections.length > 0) {
                menuItems.push({
                    title: '📌 Мои закладки',
                    icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z"/></svg>',
                    onSelect: () => this.showSectionsMenu()
                });
            }
            
            // Избранное
            menuItems.push({
                title: '⭐ Избранное',
                icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/></svg>',
                onSelect: () => this.showFavoritesMenu()
            });
            
            // История
            menuItems.push({
                title: '📜 История',
                icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M11.99,2C6.47,2 2,6.48 2,12C2,17.52 6.47,22 11.99,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 11.99,2M12,20C7.58,20 4,16.42 4,12C4,7.58 7.58,4 12,4C16.42,4 20,7.58 20,12C20,16.42 16.42,20 12,20M12.5,7H11V13L16.25,16.15L16.75,15.34L12.5,12.57V7Z"/></svg>',
                onSelect: () => this.showHistoryMenu()
            });
            
            // Продолжить просмотр
            if (this.config.show_continue) {
                const continueItems = this.getContinueWatching();
                if (continueItems.length > 0) {
                    menuItems.push({
                        title: `⏱️ Продолжить (${continueItems.length})`,
                        icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M10,16.5V7.5L16,12L10,16.5Z"/></svg>',
                        onSelect: () => this.showContinueMenu()
                    });
                }
            }
            
            // Добавляем в меню
            if (menuItems.length > 0) {
                this.addToSidebar(menuItems);
            }
        }
        
        addToSidebar(items) {
            // Используем существующий механизм добавления в боковое меню
            // Через Lampa.Menu или аналоги
            try {
                const menuContainer = $('.menu__body');
                if (!menuContainer.length) return;
                
                for (const item of items) {
                    const menuItem = $(`
                        <div class="menu__item selector">
                            <div class="menu__item-icon">${item.icon || ''}</div>
                            <div class="menu__item-title">${item.title}</div>
                        </div>
                    `);
                    
                    menuItem.on('hover:enter', () => {
                        if (item.onSelect) item.onSelect();
                    });
                    
                    menuContainer.append(menuItem);
                }
            } catch (e) {
                console.warn('[NSL Sync] Не удалось добавить пункты в меню:', e);
            }
        }
        
        showSectionsMenu() {
            if (this.sections.length === 0) {
                this.notify('📌 Нет сохранённых закладок');
                return;
            }
            
            const items = this.sections.map(section => ({
                title: section.name,
                onSelect: () => this.openSection(section),
                onLongPress: () => {
                    Lampa.Select.show({
                        title: `Удалить "${section.name}"?`,
                        items: [
                            { title: '✅ Да, удалить', action: 'delete' },
                            { title: '❌ Отмена', action: 'cancel' }
                        ],
                        onSelect: (opt) => {
                            if (opt.action === 'delete') {
                                this.removeSection(section.id);
                                this.showSectionsMenu();
                            }
                        }
                    });
                }
            }));
            
            items.push({ title: '──────────', separator: true });
            items.push({ title: '🗑️ Очистить все', onSelect: () => this.clearAllSections() });
            items.push({ title: '❌ Закрыть', onSelect: () => {} });
            
            Lampa.Select.show({
                title: '📌 Мои закладки',
                items: items,
                onBack: () => Lampa.Controller.toggle('menu')
            });
        }
        
        showFavoritesMenu() {
            const categories = [
                { id: 'favorite', name: '⭐ Избранное', icon: '⭐' },
                { id: 'watching', name: '👁️ Смотрю', icon: '👁️' },
                { id: 'planned', name: '📋 Буду смотреть', icon: '📋' },
                { id: 'watched', name: '✅ Просмотрено', icon: '✅' },
                { id: 'abandoned', name: '❌ Брошено', icon: '❌' },
                { id: 'collection', name: '📦 Коллекция', icon: '📦' }
            ];
            
            const items = categories.map(cat => {
                const count = this.getFavoritesByCategory(cat.id).length;
                return {
                    title: `${cat.icon} ${cat.name} (${count})`,
                    onSelect: () => this.showFavoritesByCategory(cat.id, cat.name)
                };
            });
            
            items.push({ title: '──────────', separator: true });
            items.push({ title: '🗑️ Очистить всё', onSelect: () => this.clearAllFavorites() });
            items.push({ title: '❌ Закрыть', onSelect: () => {} });
            
            Lampa.Select.show({
                title: '⭐ Избранное',
                items: items,
                onBack: () => Lampa.Controller.toggle('menu')
            });
        }
        
        showFavoritesByCategory(category, categoryName) {
            const items = this.getFavoritesByCategory(category);
            
            if (items.length === 0) {
                this.notify(`В "${categoryName}" ничего нет`);
                return;
            }
            
            // Группируем по типам контента
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
                        onSelect: () => this.showFavoritesList(typeItems, `${categoryName} - ${typeInfo.name}`)
                    });
                }
            }
            
            menuItems.push({ title: '──────────', separator: true });
            menuItems.push({ title: '◀ Назад', onSelect: () => this.showFavoritesMenu() });
            menuItems.push({ title: '❌ Закрыть', onSelect: () => {} });
            
            Lampa.Select.show({
                title: `${FAVORITE_CATEGORY_NAMES[category] || categoryName}`,
                items: menuItems,
                onBack: () => this.showFavoritesMenu()
            });
        }
        
        showFavoritesList(items, title) {
            const menuItems = items.map(item => ({
                title: item.data?.title || item.data?.name || 'Без названия',
                onSelect: () => {
                    Lampa.Router.call('full', {
                        id: item.card_id,
                        source: item.data?.source || 'tmdb'
                    });
                },
                onLongPress: () => {
                    Lampa.Select.show({
                        title: `Удалить из "${title}"?`,
                        items: [
                            { title: '✅ Да, удалить', action: 'delete' },
                            { title: '❌ Отмена', action: 'cancel' }
                        ],
                        onSelect: (opt) => {
                            if (opt.action === 'delete') {
                                this.removeFromFavorites(item.data, item.category);
                                this.showFavoritesByCategory(item.category, title.split(' - ')[0]);
                            }
                        }
                    });
                }
            }));
            
            menuItems.push({ title: '──────────', separator: true });
            menuItems.push({ title: '◀ Назад', onSelect: () => this.showFavoritesByCategory(items[0]?.category, title.split(' - ')[0]) });
            menuItems.push({ title: '❌ Закрыть', onSelect: () => {} });
            
            Lampa.Select.show({
                title: title,
                items: menuItems,
                onBack: () => this.showFavoritesByCategory(items[0]?.category, title.split(' - ')[0])
            });
        }
        
        clearAllFavorites() {
            Lampa.Select.show({
                title: '⚠️ Очистить всё избранное?',
                items: [
                    { title: '✅ Да, очистить всё', action: 'clear' },
                    { title: '❌ Отмена', action: 'cancel' }
                ],
                onSelect: (opt) => {
                    if (opt.action === 'clear') {
                        this.favorites = [];
                        this.saveFavorites();
                        this.notify('🗑️ Избранное очищено');
                        this.initSidebar();
                    }
                }
            });
        }
        
        showHistoryMenu() {
            const types = [
                { id: 'all', name: '📜 Вся история', icon: '📜' },
                { id: 'movie', name: '🎬 Фильмы', icon: '🎬' },
                { id: 'tv', name: '📺 Сериалы', icon: '📺' },
                { id: 'cartoon', name: '🐭 Мультфильмы', icon: '🐭' },
                { id: 'cartoon_series', name: '🐭📺 Мультсериалы', icon: '🐭📺' },
                { id: 'anime', name: '🇯🇵 Аниме', icon: '🇯🇵' }
            ];
            
            const items = types.map(type => {
                const count = this.getHistoryByMediaType(type.id).length;
                return {
                    title: `${type.icon} ${type.name} (${count})`,
                    onSelect: () => this.showHistoryList(type.id, type.name)
                };
            });
            
            items.push({ title: '──────────', separator: true });
            items.push({ title: '🗑️ Очистить историю', onSelect: () => this.clearHistory() });
            items.push({ title: '❌ Закрыть', onSelect: () => {} });
            
            Lampa.Select.show({
                title: '📜 История просмотров',
                items: items,
                onBack: () => Lampa.Controller.toggle('menu')
            });
        }
        
        showHistoryList(mediaType, title) {
            const items = this.getHistoryByMediaType(mediaType);
            
            if (items.length === 0) {
                this.notify(`В "${title}" ничего нет`);
                return;
            }
            
            const menuItems = items.slice(0, 50).map(item => ({
                title: item.data?.title || item.data?.name || 'Без названия',
                sub: new Date(item.watched_at).toLocaleDateString(),
                onSelect: () => {
                    Lampa.Router.call('full', {
                        id: item.card_id,
                        source: item.data?.source || 'tmdb'
                    });
                }
            }));
            
            menuItems.push({ title: '──────────', separator: true });
            menuItems.push({ title: '◀ Назад', onSelect: () => this.showHistoryMenu() });
            menuItems.push({ title: '❌ Закрыть', onSelect: () => {} });
            
            Lampa.Select.show({
                title: title,
                items: menuItems,
                onBack: () => this.showHistoryMenu()
            });
        }
        
        showContinueMenu() {
            const items = this.getContinueWatching();
            
            if (items.length === 0) {
                this.notify('⏱️ Нет фильмов/сериалов для продолжения');
                return;
            }
            
            const menuItems = items.map(item => {
                const title = item.data?.title || item.data?.name || item.tmdb_id || 'Без названия';
                return {
                    title: title,
                    sub: `${this.formatTime(item.time)} / ${this.formatTime(item.duration)} (${item.percent}%)`,
                    onSelect: () => {
                        Lampa.Router.call('full', {
                            id: item.tmdb_id,
                            source: 'tmdb'
                        });
                    }
                };
            });
            
            menuItems.push({ title: '──────────', separator: true });
            menuItems.push({ title: '❌ Закрыть', onSelect: () => {} });
            
            Lampa.Select.show({
                title: '⏱️ Продолжить просмотр',
                items: menuItems,
                onBack: () => Lampa.Controller.toggle('menu')
            });
        }
        
        initCardButton() {
            // Добавляем кнопку "В избранное" на карточку
            Lampa.Listener.follow('full', (e) => {
                if (e.type === 'complite') {
                    this.addFavoriteButtonToCard(e.object, e.data.movie);
                }
            });
        }
        
        addFavoriteButtonToCard(activity, movie) {
            if (!movie || !movie.id) return;
            
            // Ждём появления контейнера с кнопками
            setTimeout(() => {
                const buttonsContainer = activity.render().find('.full-start__buttons');
                if (!buttonsContainer.length) return;
                
                // Проверяем, не добавлена ли уже кнопка
                if (buttonsContainer.find('.nsl-favorite-button').length) return;
                
                const isFavorite = this.isInFavorites(movie, 'favorite');
                
                const button = $(`
                    <div class="full-start__button selector nsl-favorite-button ${isFavorite ? 'active' : ''}" style="order: -1;">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" 
                                  d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/>
                        </svg>
                        <span>В избранное</span>
                    </div>
                `);
                
                button.on('hover:enter', () => {
                    this.showFavoriteCategorySelector(movie, button);
                });
                
                buttonsContainer.prepend(button);
                
            }, 500);
        }
        
        showFavoriteCategorySelector(movie, buttonElement) {
            const categories = [
                { id: 'favorite', name: '⭐ Избранное', checked: this.isInFavorites(movie, 'favorite') },
                { id: 'watching', name: '👁️ Смотрю', checked: this.isInFavorites(movie, 'watching') },
                { id: 'planned', name: '📋 Буду смотреть', checked: this.isInFavorites(movie, 'planned') },
                { id: 'watched', name: '✅ Просмотрено', checked: this.isInFavorites(movie, 'watched') },
                { id: 'abandoned', name: '❌ Брошено', checked: this.isInFavorites(movie, 'abandoned') },
                { id: 'collection', name: '📦 Коллекция', checked: this.isInFavorites(movie, 'collection') }
            ];
            
            const items = categories.map(cat => ({
                title: cat.name,
                checkbox: true,
                checked: cat.checked,
                category: cat.id
            }));
            
            items.push({ title: '──────────', separator: true });
            items.push({ title: '❌ Закрыть', action: 'close' });
            
            Lampa.Select.show({
                title: '⭐ Добавить в избранное',
                items: items,
                onCheck: (item) => {
                    this.toggleFavorite(movie, item.category);
                    const isAnyFavorite = categories.some(c => 
                        c.id !== 'collection' && this.isInFavorites(movie, c.id)
                    );
                    const starPath = buttonElement.find('path');
                    if (starPath.length) {
                        starPath.attr('fill', isAnyFavorite ? 'currentColor' : 'none');
                    }
                    this.showFavoriteCategorySelector(movie, buttonElement);
                },
                onSelect: (item) => {
                    if (item.action === 'close') return;
                    this.toggleFavorite(movie, item.category);
                    const isAnyFavorite = categories.some(c => 
                        c.id !== 'collection' && this.isInFavorites(movie, c.id)
                    );
                    const starPath = buttonElement.find('path');
                    if (starPath.length) {
                        starPath.attr('fill', isAnyFavorite ? 'currentColor' : 'none');
                    }
                }
            });
        }
        
        // ======================
        // 10. НАСТРОЙКИ
        // ======================
        
        initSettings() {
            Lampa.SettingsApi.addComponent({
                component: 'nsl_sync',
                name: 'NSL Sync',
                icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12,2C6.5,2 2,6.5 2,12s4.5,10 10,10 10-4.5 10-10S17.5,2 12,2z M12,4c4.4,0 8,3.6 8,8s-3.6,8-8,8-8-3.6-8-8 3.6-8 8-8z M11,7v5l4,2.5 1-1.5-3-2V7z"/></svg>'
            });
            
            Lampa.SettingsApi.addParam({
                component: 'nsl_sync',
                param: { name: 'open_menu', type: 'button' },
                field: { name: '⚙️ Открыть меню настроек' },
                onChange: () => this.showMainMenu()
            });
        }
        
        showMainMenu() {
            const c = this.config;
            
            const items = [
                { title: `${c.enabled ? '✅' : '❌'} Плагин: ${c.enabled ? 'Включён' : 'Выключен'}`, action: 'toggle_enabled' },
                { title: '──────────', separator: true },
                { title: '📌 Закладки разделов', action: 'sections_menu' },
                { title: '──────────', separator: true },
                { title: '⭐ Избранное', action: 'favorites_menu' },
                { title: '──────────', separator: true },
                { title: '📜 История', action: 'history_menu' },
                { title: '──────────', separator: true },
                { title: '⏱️ Таймкоды', action: 'timeline_menu' },
                { title: '──────────', separator: true },
                { title: '⏱️ Продолжить просмотр', action: 'continue_menu' },
                { title: '──────────', separator: true },
                { title: '☁️ GitHub Gist', action: 'gist_menu' },
                { title: '──────────', separator: true },
                { title: '🔄 Синхронизировать сейчас', action: 'sync_now' },
                { title: '❌ Закрыть', action: 'cancel' }
            ];
            
            Lampa.Select.show({
                title: 'NSL Sync v' + PLUGIN_VERSION,
                items: items,
                onSelect: (item) => {
                    switch (item.action) {
                        case 'toggle_enabled':
                            c.enabled = !c.enabled;
                            this.saveConfig();
                            this.notify(`Плагин ${c.enabled ? 'включён' : 'выключен'}`);
                            if (!c.enabled) {
                                if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
                                if (this.playerInterval) clearInterval(this.playerInterval);
                            } else {
                                this.startBackgroundSync();
                                this.initPlayerHandler();
                            }
                            this.showMainMenu();
                            break;
                        case 'sections_menu':
                            this.showSectionsSettings();
                            break;
                        case 'favorites_menu':
                            this.showFavoritesSettings();
                            break;
                        case 'history_menu':
                            this.showHistorySettings();
                            break;
                        case 'timeline_menu':
                            this.showTimelineSettings();
                            break;
                        case 'continue_menu':
                            this.showContinueSettings();
                            break;
                        case 'gist_menu':
                            this.showGistSettings();
                            break;
                        case 'sync_now':
                            this.fullSync();
                            setTimeout(() => this.showMainMenu(), 2000);
                            break;
                    }
                }
            });
        }
        
        showSectionsSettings() {
            Lampa.Select.show({
                title: '📌 Закладки разделов',
                items: [
                    { title: `📍 Положение кнопки: ${this.config.sections_button_position === 'sidebar' ? 'Боковое меню' : 'Верхняя панель'}`, action: 'toggle_position' },
                    { title: `📌 Сохранить текущий раздел`, action: 'save_section' },
                    { title: `📋 Мои закладки (${this.sections.length})`, action: 'view_sections' },
                    { title: `🗑️ Очистить все`, action: 'clear_sections' },
                    { title: '◀ Назад', action: 'back' }
                ],
                onSelect: (item) => {
                    switch (item.action) {
                        case 'toggle_position':
                            this.config.sections_button_position = this.config.sections_button_position === 'sidebar' ? 'top' : 'sidebar';
                            this.saveConfig();
                            this.showSectionsSettings();
                            break;
                        case 'save_section':
                            this.addSection();
                            setTimeout(() => this.showSectionsSettings(), 1000);
                            break;
                        case 'view_sections':
                            this.showSectionsMenu();
                            setTimeout(() => this.showSectionsSettings(), 1000);
                            break;
                        case 'clear_sections':
                            this.clearAllSections();
                            this.showSectionsSettings();
                            break;
                        case 'back':
                            this.showMainMenu();
                            break;
                    }
                }
            });
        }
        
        showFavoritesSettings() {
            Lampa.Select.show({
                title: '⭐ Избранное',
                items: [
                    { title: `🔄 Авто в Брошено: ${this.config.auto_abandoned ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_abandoned' },
                    { title: `📅 Дней до Брошено: ${this.config.abandoned_days}`, action: 'set_abandoned_days' },
                    { title: `🗑️ Очистить всё`, action: 'clear_favorites' },
                    { title: '◀ Назад', action: 'back' }
                ],
                onSelect: (item) => {
                    switch (item.action) {
                        case 'toggle_auto_abandoned':
                            this.config.auto_abandoned = !this.config.auto_abandoned;
                            this.saveConfig();
                            this.showFavoritesSettings();
                            break;
                        case 'set_abandoned_days':
                            Lampa.Input.edit({ title: 'Дней без просмотра', value: String(this.config.abandoned_days), free: true, number: true }, (val) => {
                                if (val !== null && !isNaN(val) && val > 0) {
                                    this.config.abandoned_days = parseInt(val);
                                    this.saveConfig();
                                }
                                this.showFavoritesSettings();
                            });
                            break;
                        case 'clear_favorites':
                            this.clearAllFavorites();
                            this.showFavoritesSettings();
                            break;
                        case 'back':
                            this.showMainMenu();
                            break;
                    }
                }
            });
        }
        
        showHistorySettings() {
            Lampa.Select.show({
                title: '📜 История',
                items: [
                    { title: `🗑️ Очистить историю`, action: 'clear_history' },
                    { title: '◀ Назад', action: 'back' }
                ],
                onSelect: (item) => {
                    switch (item.action) {
                        case 'clear_history':
                            this.clearHistory();
                            this.showHistorySettings();
                            break;
                        case 'back':
                            this.showMainMenu();
                            break;
                    }
                }
            });
        }
        
        showTimelineSettings() {
            const strategyName = this.config.sync_strategy === 'max_time' ? 'По длительности' : 'По дате';
            
            Lampa.Select.show({
                title: '⏱️ Таймкоды',
                items: [
                    { title: `✅ Автосохранение: ${this.config.auto_save ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_save' },
                    { title: `✅ Автосинхронизация: ${this.config.auto_sync ? 'Вкл' : 'Выкл'}`, action: 'toggle_auto_sync' },
                    { title: `⏱️ Интервал: ${this.config.sync_interval} сек`, action: 'set_interval' },
                    { title: `📊 Стратегия: ${strategyName}`, action: 'toggle_strategy' },
                    { title: `🎬 Порог титров: ${this.config.credits_threshold} сек`, action: 'set_credits' },
                    { title: `🗑️ Удалять старше: ${this.config.cleanup_older_days || 'никогда'} дней`, action: 'set_cleanup_days' },
                    { title: `✅ Удалять завершённые: ${this.config.cleanup_completed ? 'Вкл' : 'Выкл'}`, action: 'toggle_cleanup_completed' },
                    { title: `🗑️ Очистить все таймкоды`, action: 'clear_timeline' },
                    { title: `🧹 Очистить старые сейчас`, action: 'cleanup_now' },
                    { title: '◀ Назад', action: 'back' }
                ],
                onSelect: (item) => {
                    switch (item.action) {
                        case 'toggle_auto_save':
                            this.config.auto_save = !this.config.auto_save;
                            this.saveConfig();
                            this.showTimelineSettings();
                            break;
                        case 'toggle_auto_sync':
                            this.config.auto_sync = !this.config.auto_sync;
                            this.saveConfig();
                            if (this.config.auto_sync) this.startBackgroundSync();
                            this.showTimelineSettings();
                            break;
                        case 'set_interval':
                            Lampa.Input.edit({ title: 'Интервал (сек)', value: String(this.config.sync_interval), free: true, number: true }, (val) => {
                                if (val !== null && !isNaN(val) && val > 0) {
                                    this.config.sync_interval = parseInt(val);
                                    this.saveConfig();
                                    this.startBackgroundSync();
                                }
                                this.showTimelineSettings();
                            });
                            break;
                        case 'toggle_strategy':
                            this.config.sync_strategy = this.config.sync_strategy === 'max_time' ? 'last_watch' : 'max_time';
                            this.saveConfig();
                            this.showTimelineSettings();
                            break;
                        case 'set_credits':
                            Lampa.Input.edit({ title: 'Порог титров (сек)', value: String(this.config.credits_threshold), free: true, number: true }, (val) => {
                                if (val !== null && !isNaN(val) && val > 0) {
                                    this.config.credits_threshold = parseInt(val);
                                    this.saveConfig();
                                }
                                this.showTimelineSettings();
                            });
                            break;
                        case 'set_cleanup_days':
                            Lampa.Input.edit({ title: 'Удалять старше (дней, 0 = откл)', value: String(this.config.cleanup_older_days), free: true, number: true }, (val) => {
                                if (val !== null && !isNaN(val)) {
                                    this.config.cleanup_older_days = parseInt(val);
                                    this.saveConfig();
                                }
                                this.showTimelineSettings();
                            });
                            break;
                        case 'toggle_cleanup_completed':
                            this.config.cleanup_completed = !this.config.cleanup_completed;
                            this.saveConfig();
                            this.showTimelineSettings();
                            break;
                        case 'clear_timeline':
                            Lampa.Select.show({
                                title: '⚠️ Очистить все таймкоды?',
                                items: [
                                    { title: '✅ Да, очистить', action: 'clear' },
                                    { title: '❌ Отмена', action: 'cancel' }
                                ],
                                onSelect: (opt) => {
                                    if (opt.action === 'clear') {
                                        this.timeline = {};
                                        this.saveTimeline();
                                        this.notify('🗑️ Таймкоды очищены');
                                    }
                                    this.showTimelineSettings();
                                }
                            });
                            break;
                        case 'cleanup_now':
                            this.cleanupTimeline();
                            this.showTimelineSettings();
                            break;
                        case 'back':
                            this.showMainMenu();
                            break;
                    }
                }
            });
        }
        
        showContinueSettings() {
            Lampa.Select.show({
                title: '⏱️ Продолжить просмотр',
                items: [
                    { title: `✅ Показывать: ${this.config.show_continue ? 'Вкл' : 'Выкл'}`, action: 'toggle_show' },
                    { title: `📊 Мин. прогресс: ${this.config.continue_min_progress}%`, action: 'set_min' },
                    { title: `📊 Макс. прогресс: ${this.config.continue_max_progress}%`, action: 'set_max' },
                    { title: '◀ Назад', action: 'back' }
                ],
                onSelect: (item) => {
                    switch (item.action) {
                        case 'toggle_show':
                            this.config.show_continue = !this.config.show_continue;
                            this.saveConfig();
                            this.initSidebar();
                            this.showContinueSettings();
                            break;
                        case 'set_min':
                            Lampa.Input.edit({ title: 'Мин. прогресс (%)', value: String(this.config.continue_min_progress), free: true, number: true }, (val) => {
                                if (val !== null && !isNaN(val) && val >= 0 && val <= 100) {
                                    this.config.continue_min_progress = parseInt(val);
                                    this.saveConfig();
                                }
                                this.showContinueSettings();
                            });
                            break;
                        case 'set_max':
                            Lampa.Input.edit({ title: 'Макс. прогресс (%)', value: String(this.config.continue_max_progress), free: true, number: true }, (val) => {
                                if (val !== null && !isNaN(val) && val >= 0 && val <= 100) {
                                    this.config.continue_max_progress = parseInt(val);
                                    this.saveConfig();
                                }
                                this.showContinueSettings();
                            });
                            break;
                        case 'back':
                            this.showMainMenu();
                            break;
                    }
                }
            });
        }
        
        showGistSettings() {
            Lampa.Select.show({
                title: '☁️ GitHub Gist',
                items: [
                    { title: `🔑 Токен: ${this.config.gist_token ? '✓ установлен' : '❌ не установлен'}`, action: 'set_token' },
                    { title: `📄 Gist ID: ${this.config.gist_id ? this.config.gist_id.substring(0, 8) + '…' : '❌ не установлен'}`, action: 'set_gist_id' },
                    { title: `📤 Экспорт данных`, action: 'export' },
                    { title: `📥 Импорт данных`, action: 'import' },
                    { title: `📥 Импорт из CUB`, action: 'import_cub' },
                    { title: '◀ Назад', action: 'back' }
                ],
                onSelect: (item) => {
                    switch (item.action) {
                        case 'set_token':
                            Lampa.Input.edit({ title: 'GitHub Token', value: this.config.gist_token, free: true }, (val) => {
                                if (val !== null) {
                                    this.config.gist_token = val || '';
                                    this.saveConfig();
                                }
                                this.showGistSettings();
                            });
                            break;
                        case 'set_gist_id':
                            Lampa.Input.edit({ title: 'Gist ID', value: this.config.gist_id, free: true }, (val) => {
                                if (val !== null) {
                                    this.config.gist_id = val || '';
                                    this.saveConfig();
                                }
                                this.showGistSettings();
                            });
                            break;
                        case 'export':
                            this.exportToFile();
                            setTimeout(() => this.showGistSettings(), 1000);
                            break;
                        case 'import':
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'application/json';
                            input.onchange = (e) => {
                                this.importFromFile(e.target);
                                setTimeout(() => this.showGistSettings(), 1000);
                            };
                            input.click();
                            break;
                        case 'import_cub':
                            this.importFromCUB();
                            setTimeout(() => this.showGistSettings(), 1000);
                            break;
                        case 'back':
                            this.showMainMenu();
                            break;
                    }
                }
            });
        }
        
        startBackgroundSync() {
            if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
            
            this.autoSyncInterval = setInterval(() => {
                if (!this.syncInProgress && this.config.auto_sync && this.config.enabled && !Lampa.Player.opened()) {
                    console.log(`[NSL Sync] 🔄 Фоновая синхронизация`);
                    this.syncFromGist(false);
                    this.syncToGist(false);
                }
            }, this.config.sync_interval * 1000);
        }
    }
    
    // ======================
    // 11. ЗАПУСК
    // ======================
    
    function waitForLampa() {
        if (window.Lampa && Lampa.Listener) {
            if (window.appready) {
                new NSLSync();
            } else {
                Lampa.Listener.follow('app', function(e) {
                    if (e.type === 'ready') {
                        new NSLSync();
                    }
                });
            }
        } else {
            setTimeout(waitForLampa, 100);
        }
    }
    
    waitForLampa();
    
})();
