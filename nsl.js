(function () {
    'use strict';

    if (window.nsl_sync_initialized) return;
    window.nsl_sync_initialized = true;

    // ======================
    // 1. КОНФИГУРАЦИЯ
    // ======================

    const STORAGE_PREFIX = 'nsl_';
    const CFG_KEY = STORAGE_PREFIX + 'cfg';
    const SECTIONS_KEY = STORAGE_PREFIX + 'sections';
    const FAVORITES_KEY = STORAGE_PREFIX + 'favorites';
    const HISTORY_KEY = STORAGE_PREFIX + 'history';
    const TIMELINE_KEY = STORAGE_PREFIX + 'timeline';
    
    // Иконки
    const ICON_BOOKMARK = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z"/></svg>`;
    const ICON_ADD = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>`;
    const ICON_STAR = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/></svg>`;
    const ICON_HISTORY = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M11.99,2C6.47,2 2,6.48 2,12C2,17.52 6.47,22 11.99,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 11.99,2M12,20C7.58,20 4,16.42 4,12C4,7.58 7.58,4 12,4C16.42,4 20,7.58 20,12C20,16.42 16.42,20 12,20M12.5,7H11V13L16.25,16.15L16.75,15.34L12.5,12.57V7Z"/></svg>`;
    const ICON_CONTINUE = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M10,16.5V7.5L16,12L10,16.5Z"/></svg>`;
    const ICON_SETTINGS = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12,2C6.5,2 2,6.5 2,12s4.5,10 10,10 10-4.5 10-10S17.5,2 12,2z M12,4c4.4,0 8,3.6 8,8s-3.6,8-8,8-8-3.6-8-8 3.6-8 8-8z M11,7v5l4,2.5 1-1.5-3-2V7z"/></svg>`;
    
    let plugin = null;
    
    // ======================
    // 2. ОСНОВНОЙ КЛАСС
    // ======================
    
    class NSLSync {
        constructor() {
            if (plugin) return plugin;
            plugin = this;
            
            this.config = null;
            this.profileId = null;
            this.sections = [];
            this.favorites = [];
            this.history = [];
            this.timeline = {};
            
            this.syncInProgress = false;
            this.playerInterval = null;
            this.currentMovieTime = 0;
            this.currentMovieKey = null;
            
            this.init();
        }
        
        // ========== ИНИЦИАЛИЗАЦИЯ ==========
        
        init() {
            this.loadConfig();
            this.loadProfileId();
            this.loadData();
            
            if (!this.config.enabled) {
                console.log('[NSL Sync] Плагин отключен');
                return;
            }
            
            console.log(`[NSL Sync] Инициализация. Профиль: ${this.profileId || 'глобальный'}`);
            
            // Добавляем пункты в боковое меню
            this.addToSidebar();
            
            // Добавляем кнопку на карточку
            this.initCardButton();
            
            // Настройки
            this.initSettings();
            
            // Обработчик плеера
            this.initPlayerHandler();
            
            // Автосинхронизация
            if (this.config.auto_sync) {
                this.startAutoSync();
            }
        }
        
        loadConfig() {
            this.config = Lampa.Storage.get(CFG_KEY, {
                enabled: true,
                auto_save: true,
                auto_sync: true,
                sync_interval: 60,
                sync_strategy: 'max_time',
                show_continue: true,
                continue_min_progress: 5,
                continue_max_progress: 95,
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
        }
        
        saveHistory() {
            Lampa.Storage.set(this.getStorageKey(HISTORY_KEY), this.history, true);
        }
        
        saveTimeline() {
            Lampa.Storage.set(this.getStorageKey(TIMELINE_KEY), this.timeline, true);
        }
        
        getDeviceName() {
            const platform = Lampa.Platform.get();
            const map = {
                'android': '📱 Android', 'ios': '🍎 iOS', 'webos': '📺 WebOS',
                'tizen': '📺 Tizen', 'windows': '💻 Windows', 'macos': '🍎 macOS'
            };
            return map[platform] || platform || 'Unknown';
        }
        
        notify(text) {
            Lampa.Noty.show(text);
        }
        
        // ========== БОКОВОЕ МЕНЮ ==========
        
        addToSidebar() {
            // Ждём загрузки меню
            setTimeout(() => {
                const menuList = $('.menu .menu__list');
                if (!menuList.length) {
                    setTimeout(() => this.addToSidebar(), 500);
                    return;
                }
                
                // Удаляем старые пункты, если есть
                $('.nsl-menu-item').remove();
                
                // Пункт "Избранное"
                const favItem = $(`
                    <li class="menu__item selector nsl-menu-item">
                        <div class="menu__ico">${ICON_STAR}</div>
                        <div class="menu__text">⭐ Избранное</div>
                    </li>
                `);
                favItem.on('hover:enter', () => this.showFavoritesMenu());
                menuList.eq(0).append(favItem);
                
                // Пункт "История"
                const histItem = $(`
                    <li class="menu__item selector nsl-menu-item">
                        <div class="menu__ico">${ICON_HISTORY}</div>
                        <div class="menu__text">📜 История</div>
                    </li>
                `);
                histItem.on('hover:enter', () => this.showHistoryMenu());
                menuList.eq(0).append(histItem);
                
                // Пункт "Продолжить" (если есть)
                if (this.config.show_continue) {
                    const continueItem = $(`
                        <li class="menu__item selector nsl-menu-item">
                            <div class="menu__ico">${ICON_CONTINUE}</div>
                            <div class="menu__text">⏱️ Продолжить</div>
                        </li>
                    `);
                    continueItem.on('hover:enter', () => this.showContinueMenu());
                    menuList.eq(0).append(continueItem);
                }
                
                // Пункт "Настройки NSL Sync"
                const settingsItem = $(`
                    <li class="menu__item selector nsl-menu-item">
                        <div class="menu__ico">${ICON_SETTINGS}</div>
                        <div class="menu__text">⚙️ NSL Sync</div>
                    </li>
                `);
                settingsItem.on('hover:enter', () => this.showMainMenu());
                menuList.eq(0).append(settingsItem);
                
                console.log('[NSL Sync] Пункты меню добавлены');
            }, 1000);
        }
        
        // ========== МЕНЮ ИЗБРАННОГО ==========
        
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
                const count = this.favorites.filter(f => f.category === cat.id).length;
                return {
                    title: `${cat.icon} ${cat.name} (${count})`,
                    category: cat.id,
                    name: cat.name
                };
            });
            
            items.push({ title: '──────────', separator: true });
            items.push({ title: '❌ Закрыть' });
            
            Lampa.Select.show({
                title: '⭐ Избранное',
                items: items,
                onSelect: (item) => {
                    if (item.category) {
                        this.showFavoritesByCategory(item.category, item.name);
                    }
                },
                onBack: () => {
                    Lampa.Controller.toggle('content');
                }
            });
        }
        
        showFavoritesByCategory(category, categoryName) {
            const items = this.favorites.filter(f => f.category === category);
            
            if (items.length === 0) {
                this.notify(`В "${categoryName}" ничего нет`);
                return;
            }
            
            // Группировка по типу
            const groups = {
                movie: { name: '🎬 Фильмы', items: [] },
                tv: { name: '📺 Сериалы', items: [] },
                cartoon: { name: '🐭 Мультфильмы', items: [] },
                cartoon_series: { name: '🐭📺 Мультсериалы', items: [] },
                anime: { name: '🇯🇵 Аниме', items: [] }
            };
            
            for (const item of items) {
                const type = item.media_type || 'movie';
                if (groups[type]) groups[type].items.push(item);
            }
            
            const menuItems = [];
            for (const [type, group] of Object.entries(groups)) {
                if (group.items.length > 0) {
                    menuItems.push({
                        title: `${group.name} (${group.items.length})`,
                        type: type,
                        items: group.items
                    });
                }
            }
            
            if (menuItems.length === 1) {
                // Показываем сразу список
                this.showFavoritesList(menuItems[0].items, categoryName);
            } else {
                menuItems.push({ title: '──────────', separator: true });
                menuItems.push({ title: '◀ Назад' });
                
                Lampa.Select.show({
                    title: categoryName,
                    items: menuItems,
                    onSelect: (item) => {
                        if (item.items) {
                            this.showFavoritesList(item.items, `${categoryName} - ${item.title.split(' ')[0]}`);
                        }
                    },
                    onBack: () => this.showFavoritesMenu()
                });
            }
        }
        
        showFavoritesList(items, title) {
            const menuItems = items.map(item => ({
                title: item.data?.title || item.data?.name || 'Без названия',
                item: item
            }));
            
            menuItems.push({ title: '──────────', separator: true });
            menuItems.push({ title: '◀ Назад' });
            
            Lampa.Select.show({
                title: title,
                items: menuItems,
                onSelect: (item) => {
                    if (item.item) {
                        Lampa.Router.call('full', {
                            id: item.item.card_id,
                            source: item.item.data?.source || 'tmdb'
                        });
                    }
                },
                onLongPress: (item) => {
                    if (item.item) {
                        Lampa.Select.show({
                            title: `Удалить "${item.item.data?.title || item.item.data?.name}"?`,
                            items: [
                                { title: '❌ Отмена' },
                                { title: '✅ Да, удалить', action: 'delete' }
                            ],
                            onSelect: (opt) => {
                                if (opt.action === 'delete') {
                                    const index = this.favorites.findIndex(f => f.id === item.item.id);
                                    if (index >= 0) {
                                        this.favorites.splice(index, 1);
                                        this.saveFavorites();
                                        this.notify('Удалено');
                                        this.showFavoritesByCategory(item.item.category, title.split(' - ')[0]);
                                    }
                                }
                            }
                        });
                    }
                },
                onBack: () => this.showFavoritesByCategory(items[0]?.category, title.split(' - ')[0])
            });
        }
        
        // ========== ИСТОРИЯ ==========
        
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
                return { title: `${type.icon} ${type.name} (${count})`, type: type.id, name: type.name };
            });
            
            items.push({ title: '──────────', separator: true });
            items.push({ title: '🗑️ Очистить историю', action: 'clear' });
            items.push({ title: '❌ Закрыть' });
            
            Lampa.Select.show({
                title: '📜 История просмотров',
                items: items,
                onSelect: (item) => {
                    if (item.action === 'clear') {
                        this.clearHistoryConfirm();
                    } else if (item.type) {
                        this.showHistoryList(item.type, item.name);
                    }
                },
                onBack: () => {
                    Lampa.Controller.toggle('content');
                }
            });
        }
        
        getHistoryByMediaType(mediaType) {
            if (mediaType === 'all') return [...this.history];
            return this.history.filter(h => h.media_type === mediaType);
        }
        
        showHistoryList(mediaType, title) {
            const items = this.getHistoryByMediaType(mediaType).slice(0, 50);
            
            if (items.length === 0) {
                this.notify(`В "${title}" ничего нет`);
                return;
            }
            
            const menuItems = items.map(item => ({
                title: item.data?.title || item.data?.name || 'Без названия',
                sub: new Date(item.watched_at).toLocaleDateString(),
                item: item
            }));
            
            menuItems.push({ title: '──────────', separator: true });
            menuItems.push({ title: '◀ Назад' });
            
            Lampa.Select.show({
                title: title,
                items: menuItems,
                onSelect: (item) => {
                    if (item.item) {
                        Lampa.Router.call('full', {
                            id: item.item.card_id,
                            source: item.item.data?.source || 'tmdb'
                        });
                    }
                },
                onBack: () => this.showHistoryMenu()
            });
        }
        
        clearHistoryConfirm() {
            Lampa.Select.show({
                title: '⚠️ Очистить всю историю?',
                items: [
                    { title: '❌ Отмена' },
                    { title: '✅ Да, очистить', action: 'clear' }
                ],
                onSelect: (item) => {
                    if (item.action === 'clear') {
                        this.history = [];
                        this.saveHistory();
                        this.notify('📜 История очищена');
                    }
                }
            });
        }
        
        // ========== ПРОДОЛЖИТЬ ПРОСМОТР ==========
        
        getContinueWatching() {
            if (!this.config.show_continue) return [];
            
            const result = [];
            const minProgress = this.config.continue_min_progress;
            const maxProgress = this.config.continue_max_progress;
            
            for (const [key, timeline] of Object.entries(this.timeline)) {
                if (timeline.percent >= minProgress && timeline.percent <= maxProgress && timeline.percent < 95) {
                    const favorite = this.favorites.find(f => f.tmdb_id === timeline.tmdb_id);
                    result.push({
                        key: key,
                        tmdb_id: timeline.tmdb_id,
                        time: timeline.time,
                        percent: timeline.percent,
                        duration: timeline.duration,
                        data: favorite?.data,
                        isSeries: key.includes('_s')
                    });
                }
            }
            
            result.sort((a, b) => (b.updated || 0) - (a.updated || 0));
            return result.slice(0, 20);
        }
        
        showContinueMenu() {
            const items = this.getContinueWatching();
            
            if (items.length === 0) {
                this.notify('⏱️ Нет фильмов/сериалов для продолжения');
                return;
            }
            
            const menuItems = items.map(item => ({
                title: item.data?.title || item.data?.name || item.tmdb_id || 'Без названия',
                sub: `${this.formatTime(item.time)} / ${this.formatTime(item.duration)} (${item.percent}%)`,
                item: item
            }));
            
            menuItems.push({ title: '──────────', separator: true });
            menuItems.push({ title: '❌ Закрыть' });
            
            Lampa.Select.show({
                title: '⏱️ Продолжить просмотр',
                items: menuItems,
                onSelect: (item) => {
                    if (item.item) {
                        Lampa.Router.call('full', {
                            id: item.item.tmdb_id,
                            source: 'tmdb'
                        });
                    }
                },
                onBack: () => {
                    Lampa.Controller.toggle('content');
                }
            });
        }
        
        // ========== КНОПКА НА КАРТОЧКЕ ==========
        
        initCardButton() {
            Lampa.Listener.follow('full', (e) => {
                if (e.type === 'complite') {
                    this.addFavoriteButton(e.object, e.data.movie);
                }
            });
        }
        
        addFavoriteButton(activity, movie) {
            if (!movie || !movie.id) return;
            
            setTimeout(() => {
                const container = activity.render().find('.full-start__buttons');
                if (!container.length) return;
                if (container.find('.nsl-fav-btn').length) return;
                
                const isFav = this.favorites.some(f => f.tmdb_id === String(movie.id) && f.category === 'favorite');
                
                const btn = $(`
                    <div class="full-start__button selector nsl-fav-btn" style="order: -1;">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" 
                                  d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/>
                        </svg>
                        <span>В избранное</span>
                    </div>
                `);
                
                btn.on('hover:enter', () => {
                    this.showCategorySelector(movie, btn);
                });
                
                container.prepend(btn);
            }, 500);
        }
        
        showCategorySelector(movie, btn) {
            const categories = [
                { id: 'favorite', name: '⭐ Избранное' },
                { id: 'watching', name: '👁️ Смотрю' },
                { id: 'planned', name: '📋 Буду смотреть' },
                { id: 'watched', name: '✅ Просмотрено' },
                { id: 'abandoned', name: '❌ Брошено' },
                { id: 'collection', name: '📦 Коллекция' }
            ];
            
            const items = categories.map(cat => {
                const isChecked = this.favorites.some(f => f.tmdb_id === String(movie.id) && f.category === cat.id);
                return { title: cat.name, checkbox: true, checked: isChecked, category: cat.id };
            });
            
            items.push({ title: '──────────', separator: true });
            items.push({ title: '❌ Закрыть' });
            
            Lampa.Select.show({
                title: '⭐ Добавить в избранное',
                items: items,
                onCheck: (item) => {
                    if (item.category) {
                        this.toggleFavoriteCategory(movie, item.category, btn);
                    }
                },
                onSelect: (item) => {
                    if (item.category) {
                        this.toggleFavoriteCategory(movie, item.category, btn);
                    }
                }
            });
        }
        
        toggleFavoriteCategory(movie, category, btn) {
            const tmdbId = String(movie.id);
            const exists = this.favorites.find(f => f.tmdb_id === tmdbId && f.category === category);
            
            if (exists) {
                const index = this.favorites.findIndex(f => f.id === exists.id);
                if (index >= 0) this.favorites.splice(index, 1);
            } else {
                this.favorites.push({
                    id: Date.now() + Math.random(),
                    card_id: movie.id,
                    tmdb_id: tmdbId,
                    media_type: movie.original_name ? 'tv' : 'movie',
                    category: category,
                    data: this.cleanCardData(movie),
                    added: Date.now(),
                    updated: Date.now()
                });
            }
            
            this.saveFavorites();
            
            // Обновляем иконку звезды
            const isAnyFav = this.favorites.some(f => f.tmdb_id === tmdbId && ['favorite', 'watching', 'planned'].includes(f.category));
            const starPath = btn.find('path');
            if (starPath.length) {
                starPath.attr('fill', isAnyFav ? 'currentColor' : 'none');
            }
            
            this.notify(exists ? 'Удалено' : 'Добавлено');
        }
        
        cleanCardData(card) {
            const cleaned = {};
            const allowed = ['id', 'title', 'name', 'original_title', 'original_name', 
                'poster_path', 'backdrop_path', 'vote_average', 'release_date', 'first_air_date', 'overview', 'source'];
            for (const field of allowed) {
                if (card[field] !== undefined) cleaned[field] = card[field];
            }
            return cleaned;
        }
        
        // ========== ТАЙМКОДЫ ==========
        
        getCurrentMovieKey() {
            try {
                const activity = Lampa.Activity.active();
                if (!activity || !activity.movie) return null;
                const tmdbId = String(activity.movie.id);
                if (!tmdbId) return null;
                
                const playerData = Lampa.Player.playdata();
                if (playerData && (playerData.season || playerData.episode)) {
                    return `${tmdbId}_s${playerData.season || 1}_e${playerData.episode || 1}`;
                }
                return tmdbId;
            } catch (e) {
                return null;
            }
        }
        
        formatTime(seconds) {
            if (!seconds || seconds < 0) return '0:00';
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
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
                const activity = Lampa.Activity.active();
                const tmdbId = activity?.movie?.id ? String(activity.movie.id) : null;
                
                this.timeline[movieKey] = {
                    time: currentTime,
                    percent: percent,
                    duration: duration,
                    updated: Date.now(),
                    tmdb_id: tmdbId
                };
                
                this.saveTimeline();
                this.currentMovieTime = currentTime;
                console.log(`[NSL Sync] 💾 Сохранён прогресс: ${this.formatTime(currentTime)} (${percent}%)`);
                return true;
            }
            return false;
        }
        
        initPlayerHandler() {
            let wasPlayerOpen = false;
            let lastSaved = 0;
            
            this.playerInterval = setInterval(() => {
                if (!this.config.enabled) return;
                
                const isOpen = Lampa.Player.opened();
                let currentTime = null;
                
                try {
                    if (isOpen) {
                        const pd = Lampa.Player.playdata();
                        if (pd && pd.timeline && pd.timeline.time) currentTime = pd.timeline.time;
                    }
                } catch (e) {}
                
                if (wasPlayerOpen && !isOpen && this.currentMovieTime > 0) {
                    this.saveProgress(this.currentMovieTime, true);
                    if (this.config.auto_sync) this.syncToGist(false);
                }
                
                wasPlayerOpen = isOpen;
                
                if (isOpen && currentTime !== null && currentTime > 0) {
                    this.currentMovieTime = currentTime;
                    if (this.config.auto_save && Math.floor(currentTime) - lastSaved >= 10) {
                        if (this.saveProgress(currentTime)) lastSaved = Math.floor(currentTime);
                    }
                }
            }, 1000);
        }
        
        // ========== GITHUB СИНХРОНИЗАЦИЯ ==========
        
        getAllData() {
            return {
                version: 2,
                profile_id: this.profileId,
                device: this.config.device_name,
                updated: Date.now(),
                sections: this.sections,
                favorites: this.favorites,
                history: this.history,
                timeline: this.timeline
            };
        }
        
        syncToGist(showNotify = true) {
            if (!this.config.gist_token || !this.config.gist_id) {
                if (showNotify) this.notify('⚠️ GitHub Gist не настроен');
                return;
            }
            if (this.syncInProgress) return;
            
            this.syncInProgress = true;
            const data = this.getAllData();
            
            $.ajax({
                url: `https://api.github.com/gists/${this.config.gist_id}`,
                method: 'PATCH',
                headers: { 'Authorization': `token ${this.config.gist_token}`, 'Accept': 'application/vnd.github.v3+json' },
                data: JSON.stringify({
                    description: 'NSL Sync Data',
                    public: false,
                    files: { 'nsl_sync.json': { content: JSON.stringify(data, null, 2) } }
                }),
                success: () => {
                    if (showNotify) this.notify('✅ Данные отправлены');
                    this.syncInProgress = false;
                },
                error: (xhr) => {
                    console.error('[NSL Sync] Ошибка:', xhr.status);
                    if (showNotify) this.notify(`❌ Ошибка: ${xhr.status}`);
                    this.syncInProgress = false;
                }
            });
        }
        
        syncFromGist(showNotify = true) {
            if (!this.config.gist_token || !this.config.gist_id) {
                if (showNotify) this.notify('⚠️ GitHub Gist не настроен');
                return;
            }
            if (this.syncInProgress) return;
            
            this.syncInProgress = true;
            
            $.ajax({
                url: `https://api.github.com/gists/${this.config.gist_id}`,
                method: 'GET',
                headers: { 'Authorization': `token ${this.config.gist_token}`, 'Accept': 'application/vnd.github.v3+json' },
                success: (data) => {
                    try {
                        const content = data.files['nsl_sync.json']?.content;
                        if (content) {
                            const remote = JSON.parse(content);
                            this.applyRemoteData(remote);
                            if (showNotify) this.notify('✅ Данные загружены');
                        } else if (showNotify) {
                            this.notify('❌ Нет данных');
                        }
                    } catch (e) { console.error(e); }
                    this.syncInProgress = false;
                },
                error: (xhr) => {
                    console.error('[NSL Sync] Ошибка:', xhr.status);
                    if (showNotify) this.notify(`❌ Ошибка: ${xhr.status}`);
                    this.syncInProgress = false;
                }
            });
        }
        
        applyRemoteData(remote) {
            if (!remote) return;
            
            // Таймкоды слияние
            if (remote.timeline) {
                for (const [key, val] of Object.entries(remote.timeline)) {
                    const local = this.timeline[key];
                    if (!local || (this.config.sync_strategy === 'max_time' && val.time > local.time) ||
                        (this.config.sync_strategy === 'last_watch' && (val.updated || 0) > (local.updated || 0))) {
                        this.timeline[key] = val;
                    }
                }
                this.saveTimeline();
            }
            
            // Избранное слияние
            if (remote.favorites) {
                for (const fav of remote.favorites) {
                    if (!this.favorites.some(f => f.tmdb_id === fav.tmdb_id && f.category === fav.category)) {
                        this.favorites.push(fav);
                    }
                }
                this.saveFavorites();
            }
            
            // История слияние
            if (remote.history) {
                for (const hist of remote.history) {
                    if (!this.history.some(h => h.tmdb_id === hist.tmdb_id)) {
                        this.history.push(hist);
                    }
                }
                this.history.sort((a, b) => (b.watched_at || 0) - (a.watched_at || 0));
                this.saveHistory();
            }
        }
        
        startAutoSync() {
            setInterval(() => {
                if (!this.syncInProgress && this.config.auto_sync && !Lampa.Player.opened()) {
                    this.syncFromGist(false);
                    this.syncToGist(false);
                }
            }, this.config.sync_interval * 1000);
        }
        
        // ========== НАСТРОЙКИ ==========
        
        initSettings() {
            Lampa.SettingsApi.addComponent({
                component: 'nsl_sync',
                name: 'NSL Sync',
                icon: ICON_SETTINGS
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
                { title: '⏱️ Таймкоды', action: 'timeline' },
                { title: '──────────', separator: true },
                { title: '☁️ GitHub Gist', action: 'gist' },
                { title: '──────────', separator: true },
                { title: '🔄 Синхронизировать сейчас', action: 'sync_now' },
                { title: '❌ Закрыть', action: 'close' }
            ];
            
            Lampa.Select.show({
                title: 'NSL Sync',
                items: items,
                onSelect: (item) => {
                    if (item.action === 'toggle_enabled') {
                        c.enabled = !c.enabled;
                        this.saveConfig();
                        this.notify(`Плагин ${c.enabled ? 'включён' : 'выключен'}`);
                        this.showMainMenu();
                    } else if (item.action === 'timeline') {
                        this.showTimelineSettings();
                    } else if (item.action === 'gist') {
                        this.showGistSettings();
                    } else if (item.action === 'sync_now') {
                        this.notify('🔄 Синхронизация...');
                        this.syncToGist(true);
                        setTimeout(() => this.syncFromGist(true), 1000);
                        setTimeout(() => this.showMainMenu(), 2000);
                    }
                },
                onBack: () => {
                    Lampa.Controller.toggle('content');
                }
            });
        }
        
        showTimelineSettings() {
            const items = [
                { title: `✅ Автосохранение: ${this.config.auto_save ? 'Вкл' : 'Выкл'}`, action: 'toggle_save' },
                { title: `✅ Автосинхронизация: ${this.config.auto_sync ? 'Вкл' : 'Выкл'}`, action: 'toggle_sync' },
                { title: `⏱️ Интервал: ${this.config.sync_interval} сек`, action: 'interval' },
                { title: `📊 Стратегия: ${this.config.sync_strategy === 'max_time' ? 'По длительности' : 'По дате'}`, action: 'strategy' },
                { title: '──────────', separator: true },
                { title: '⏱️ Продолжить просмотр', action: 'continue' },
                { title: '──────────', separator: true },
                { title: '🗑️ Очистить все таймкоды', action: 'clear' },
                { title: '◀ Назад', action: 'back' }
            ];
            
            Lampa.Select.show({
                title: '⏱️ Таймкоды',
                items: items,
                onSelect: (item) => {
                    if (item.action === 'toggle_save') {
                        this.config.auto_save = !this.config.auto_save;
                        this.saveConfig();
                        this.showTimelineSettings();
                    } else if (item.action === 'toggle_sync') {
                        this.config.auto_sync = !this.config.auto_sync;
                        this.saveConfig();
                        this.showTimelineSettings();
                    } else if (item.action === 'interval') {
                        Lampa.Input.edit({ title: 'Интервал (сек)', value: String(this.config.sync_interval), free: true, number: true }, (val) => {
                            if (val && !isNaN(val) && val > 0) {
                                this.config.sync_interval = parseInt(val);
                                this.saveConfig();
                            }
                            this.showTimelineSettings();
                        });
                    } else if (item.action === 'strategy') {
                        this.config.sync_strategy = this.config.sync_strategy === 'max_time' ? 'last_watch' : 'max_time';
                        this.saveConfig();
                        this.showTimelineSettings();
                    } else if (item.action === 'continue') {
                        this.showContinueSettings();
                    } else if (item.action === 'clear') {
                        this.timeline = {};
                        this.saveTimeline();
                        this.notify('🗑️ Таймкоды очищены');
                        this.showTimelineSettings();
                    } else if (item.action === 'back') {
                        this.showMainMenu();
                    }
                },
                onBack: () => this.showMainMenu()
            });
        }
        
        showContinueSettings() {
            const items = [
                { title: `✅ Показывать: ${this.config.show_continue ? 'Вкл' : 'Выкл'}`, action: 'toggle_show' },
                { title: `📊 Мин. прогресс: ${this.config.continue_min_progress}%`, action: 'min' },
                { title: `📊 Макс. прогресс: ${this.config.continue_max_progress}%`, action: 'max' },
                { title: '◀ Назад', action: 'back' }
            ];
            
            Lampa.Select.show({
                title: '⏱️ Продолжить просмотр',
                items: items,
                onSelect: (item) => {
                    if (item.action === 'toggle_show') {
                        this.config.show_continue = !this.config.show_continue;
                        this.saveConfig();
                        this.addToSidebar();
                        this.showContinueSettings();
                    } else if (item.action === 'min') {
                        Lampa.Input.edit({ title: 'Мин. прогресс (%)', value: String(this.config.continue_min_progress), free: true, number: true }, (val) => {
                            if (val && !isNaN(val) && val >= 0 && val <= 100) {
                                this.config.continue_min_progress = parseInt(val);
                                this.saveConfig();
                            }
                            this.showContinueSettings();
                        });
                    } else if (item.action === 'max') {
                        Lampa.Input.edit({ title: 'Макс. прогресс (%)', value: String(this.config.continue_max_progress), free: true, number: true }, (val) => {
                            if (val && !isNaN(val) && val >= 0 && val <= 100) {
                                this.config.continue_max_progress = parseInt(val);
                                this.saveConfig();
                            }
                            this.showContinueSettings();
                        });
                    } else if (item.action === 'back') {
                        this.showTimelineSettings();
                    }
                },
                onBack: () => this.showTimelineSettings()
            });
        }
        
        showGistSettings() {
            const items = [
                { title: `🔑 Токен: ${this.config.gist_token ? '✓ установлен' : '❌ не установлен'}`, action: 'token' },
                { title: `📄 Gist ID: ${this.config.gist_id ? this.config.gist_id.substring(0, 8) + '…' : '❌ не установлен'}`, action: 'id' },
                { title: '──────────', separator: true },
                { title: '📤 Экспорт в Gist', action: 'upload' },
                { title: '📥 Импорт из Gist', action: 'download' },
                { title: '──────────', separator: true },
                { title: '📁 Экспорт в файл', action: 'export' },
                { title: '📁 Импорт из файла', action: 'import' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ];
            
            Lampa.Select.show({
                title: '☁️ GitHub Gist',
                items: items,
                onSelect: (item) => {
                    if (item.action === 'token') {
                        Lampa.Input.edit({ title: 'GitHub Token', value: this.config.gist_token, free: true }, (val) => {
                            if (val !== null) {
                                this.config.gist_token = val || '';
                                this.saveConfig();
                            }
                            this.showGistSettings();
                        });
                    } else if (item.action === 'id') {
                        Lampa.Input.edit({ title: 'Gist ID', value: this.config.gist_id, free: true }, (val) => {
                            if (val !== null) {
                                this.config.gist_id = val || '';
                                this.saveConfig();
                            }
                            this.showGistSettings();
                        });
                    } else if (item.action === 'upload') {
                        this.syncToGist(true);
                        setTimeout(() => this.showGistSettings(), 1500);
                    } else if (item.action === 'download') {
                        this.syncFromGist(true);
                        setTimeout(() => this.showGistSettings(), 1500);
                    } else if (item.action === 'export') {
                        const data = this.getAllData();
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `nsl_sync_${new Date().toISOString().slice(0, 19)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        this.notify('📁 Экспорт выполнен');
                        this.showGistSettings();
                    } else if (item.action === 'import') {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'application/json';
                        input.onchange = (e) => {
                            const file = e.target.files[0];
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                    try {
                                        const data = JSON.parse(ev.target.result);
                                        this.applyRemoteData(data);
                                        this.notify('📁 Импорт выполнен');
                                    } catch (err) {
                                        this.notify('❌ Ошибка импорта');
                                    }
                                    this.showGistSettings();
                                };
                                reader.readAsText(file);
                            }
                        };
                        input.click();
                    } else if (item.action === 'back') {
                        this.showMainMenu();
                    }
                },
                onBack: () => this.showMainMenu()
            });
        }
    }
    
    // ========== ЗАПУСК ==========
    
    function waitForLampa() {
        if (window.Lampa && Lampa.Listener) {
            if (window.appready) {
                new NSLSync();
            } else {
                Lampa.Listener.follow('app', (e) => {
                    if (e.type === 'ready') new NSLSync();
                });
            }
        } else {
            setTimeout(waitForLampa, 100);
        }
    }
    
    waitForLampa();
    
})();
