(function () {
    'use strict';

    if (window.nsl_init) return;
    window.nsl_init = true;

    // ======================
    // 1. КОНФИГУРАЦИЯ (как в ybt.js)
    // ======================
    
    const STORE_BOOKMARKS = 'nsl_bookmarks_v1';
    const STORE_FAVORITES = 'nsl_favorites_v1';
    const STORE_HISTORY = 'nsl_history_v1';
    const STORE_TIMELINE = 'nsl_timeline_v1';
    const CFG = 'nsl_cfg_v1';
    const GIST_CACHE = 'nsl_gist_cache';

    // ========= CONFIG =========
    function cfg() {
        return Lampa.Storage.get(CFG, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            sync_on_start: true,
            sync_on_close: false,
            sync_on_add: true,
            sync_on_remove: true,
            sync_auto_interval: true,
            sync_interval_minutes: 60
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG, c, true);
    }

    // ========= STORAGE =========
    function getBookmarks() {
        return Lampa.Storage.get(STORE_BOOKMARKS, []) || [];
    }
    
    function saveBookmarks(l) {
        Lampa.Storage.set(STORE_BOOKMARKS, l, true);
    }
    
    function getFavorites() {
        return Lampa.Storage.get(STORE_FAVORITES, []) || [];
    }
    
    function saveFavorites(l) {
        Lampa.Storage.set(STORE_FAVORITES, l, true);
    }
    
    function getHistory() {
        return Lampa.Storage.get(STORE_HISTORY, []) || [];
    }
    
    function saveHistory(l) {
        Lampa.Storage.set(STORE_HISTORY, l, true);
    }
    
    function getTimeline() {
        return Lampa.Storage.get(STORE_TIMELINE, {}) || {};
    }
    
    function saveTimeline(t) {
        Lampa.Storage.set(STORE_TIMELINE, t, true);
    }

    function notify(t) {
        Lampa.Noty.show(t);
    }

    // ======================
    // 2. ЗАКЛАДКИ (полностью из ybt.js)
    // ======================
    
    const ICON_FLAG = `
        <svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/>
        </svg>
    `;
    
    const ICON_ADD = `
        <svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z"/>
        </svg>
    `;

    function makeKey(a) {
        return [
            a.url || '',
            a.component || '',
            a.source || '',
            a.id || '',
            a.job || '',
            JSON.stringify(a.genres || ''),
            JSON.stringify(a.params || '')
        ].join('|');
    }

    function bookmarkExists(act) {
        const key = makeKey(act);
        return getBookmarks().some(i => i.key === key);
    }

    function isAllowedForBookmark() {
        const act = Lampa.Activity.active();
        if (!act) return false;

        // Персоны
        if (act.component === 'actor' || act.component === 'person')
            return true;

        if (!act.url) return false;

        // Базовые разделы
        if (['movie', 'tv', 'anime', 'catalog'].includes(act.url))
            return false;

        // Фильтры и поиск
        if (act.params || act.genres || act.sort || act.filter)
            return true;

        // discover
        if (act.url.indexOf('discover') !== -1 && act.url.indexOf('?') !== -1)
            return true;

        return false;
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
    
    function unlock() {
        setTimeout(() => {
            lock = false;
            Lampa.Controller.toggle('content');
        }, 200);
    }

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
            renderBookmarks();

            const c = cfg();
            if (c.sync_on_add && c.gist_token && c.gist_id) {
                syncToGist(false);
            }

            notify('Сохранено');
            unlock();
        }, unlock);
    }

    function removeBookmark(item) {
        const l = getBookmarks().filter(i => i.id !== item.id);
        saveBookmarks(l);
        renderBookmarks();

        const c = cfg();
        if (c.sync_on_remove && c.gist_token && c.gist_id) {
            syncToGist(false);
        }

        setTimeout(() => {
            Lampa.Controller.toggle('content');
        }, 100);

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

        // Ищем контейнер меню - правильный селектор
        const menuList = $('.menu__list').first();
        if (!menuList.length) return;

        const bookmarks = getBookmarks();
        
        bookmarks.forEach(item => {
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
                    onSelect: (a) => {
                        if (a.action === 'remove') removeBookmark(item);
                    },
                    onBack: () => {
                        Lampa.Controller.toggle('content');
                    }
                });
            });

            menuList.append(el);
        });
    }

    function addBookmarkButton() {
        if ($('[data-nsl-save]').length) return;

        // Кнопка в боковом меню
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
    }

    // ======================
    // 3. ИЗБРАННОЕ (как штатное меню Lampa)
    // ======================
    
    const ICON_FAVORITE = `
        <svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/>
        </svg>
    `;

    function showFavorites() {
        // Открываем штатное избранное Lampa
        Lampa.Activity.push({
            component: 'favorite',
            type: 'book',
            title: '⭐ Избранное'
        });
    }

    function addFavoritesToMenu() {
        const menuList = $('.menu__list').eq(1);
        if (!menuList.length) return;
        
        if ($('.nsl-favorites-item').length) return;
        
        const el = $(`
            <li class="menu__item selector nsl-favorites-item">
                <div class="menu__ico">${ICON_FAVORITE}</div>
                <div class="menu__text">⭐ Избранное</div>
            </li>
        `);

        el.on('hover:enter', (e) => {
            e.stopPropagation();
            showFavorites();
        });

        menuList.append(el);
    }

    // ======================
    // 4. ИСТОРИЯ (как штатное меню Lampa)
    // ======================
    
    const ICON_HISTORY = `
        <svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M11.99,2C6.47,2 2,6.48 2,12C2,17.52 6.47,22 11.99,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 11.99,2M12,20C7.58,20 4,16.42 4,12C4,7.58 7.58,4 12,4C16.42,4 20,7.58 20,12C20,16.42 16.42,20 12,20M12.5,7H11V13L16.25,16.15L16.75,15.34L12.5,12.57V7Z"/>
        </svg>
    `;

    function showHistory() {
        // Открываем штатную историю Lampa
        Lampa.Activity.push({
            component: 'favorite',
            type: 'history',
            title: '📜 История'
        });
    }

    function addHistoryToMenu() {
        const menuList = $('.menu__list').eq(1);
        if (!menuList.length) return;
        
        if ($('.nsl-history-item').length) return;
        
        const el = $(`
            <li class="menu__item selector nsl-history-item">
                <div class="menu__ico">${ICON_HISTORY}</div>
                <div class="menu__text">📜 История</div>
            </li>
        `);

        el.on('hover:enter', (e) => {
            e.stopPropagation();
            showHistory();
        });

        menuList.append(el);
    }

    // ======================
    // 5. GITHUB GIST СИНХРОНИЗАЦИЯ (из ybt.js)
    // ======================

    function getGistData() {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) return null;
        return { token: c.gist_token, id: c.gist_id };
    }

    function getAllSyncData() {
        return {
            version: 2,
            updated: new Date().toISOString(),
            bookmarks: getBookmarks(),
            favorites: getFavorites(),
            history: getHistory(),
            timeline: getTimeline()
        };
    }

    function syncToGist(showNotify = true) {
        const gist = getGistData();
        if (!gist) {
            if (showNotify) notify('⚠️ GitHub Gist не настроен');
            return false;
        }

        const data = {
            description: 'NSL Sync Data',
            public: false,
            files: {
                'nsl_sync.json': {
                    content: JSON.stringify(getAllSyncData(), null, 2)
                }
            }
        };

        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${gist.token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            data: JSON.stringify(data),
            success: function() {
                if (showNotify) notify('✅ Данные синхронизированы');
                Lampa.Storage.set(GIST_CACHE + '_last_sync', Date.now());
            },
            error: function(xhr) {
                console.error('[NSL] Sync error:', xhr);
                if (showNotify) notify('❌ Ошибка: ' + (xhr.responseJSON?.message || 'Unknown'));
            }
        });
    }

    function syncFromGist(showNotify = true) {
        const gist = getGistData();
        if (!gist) {
            if (showNotify) notify('⚠️ GitHub Gist не настроен');
            return false;
        }

        $.ajax({
            url: `https://api.github.com/gists/${gist.id}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${gist.token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: function(data) {
                try {
                    const content = data.files['nsl_sync.json']?.content;
                    if (!content) {
                        if (showNotify) notify('⚠️ Файл nsl_sync.json не найден');
                        return;
                    }

                    const remote = JSON.parse(content);
                    
                    if (remote.bookmarks) {
                        const merged = [...remote.bookmarks];
                        getBookmarks().forEach(local => {
                            if (!merged.some(m => m.key === local.key)) {
                                merged.push(local);
                            }
                        });
                        merged.sort((a, b) => (b.created || 0) - (a.created || 0));
                        saveBookmarks(merged);
                        renderBookmarks();
                    }

                    if (showNotify) notify(`📥 Загружено ${remote.bookmarks?.length || 0} закладок`);
                } catch(e) {
                    console.error('[NSL] Parse error:', e);
                    if (showNotify) notify('❌ Ошибка чтения данных');
                }
            },
            error: function(xhr) {
                console.error('[NSL] Error:', xhr);
                if (showNotify) notify('❌ Ошибка загрузки: ' + (xhr.responseJSON?.message || 'Unknown'));
            }
        });
    }

    function checkAutoSync() {
        const c = cfg();
        if (!c.sync_auto_interval) return;
        
        const lastSync = Lampa.Storage.get(GIST_CACHE + '_last_sync', 0);
        const now = Date.now();
        const interval = (c.sync_interval_minutes || 60) * 60 * 1000;
        
        if (now - lastSync > interval) {
            syncFromGist(false);
        }
    }

    let syncTimer = null;
    
    function startAutoSync() {
        if (syncTimer) clearInterval(syncTimer);
        syncTimer = setInterval(() => checkAutoSync(), 5 * 60 * 1000);
    }

    // ======================
    // 6. НАСТРОЙКИ (прямо в SettingsApi, без лишнего шага)
    // ======================

    function showGistSetup() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '☁️ GitHub Gist Синхронизация',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓ Установлен' : '❌ Не установлен'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0, 8) + '…' : '❌ Не установлен'}`, action: 'id' },
                { title: '──────────', separator: true },
                { title: '📤 Выгрузить в Gist', action: 'upload' },
                { title: '📥 Загрузить из Gist', action: 'download' },
                { title: '──────────', separator: true },
                { title: '⚙️ События синхронизации →', action: 'events' },
                { title: '──────────', separator: true },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: (item) => {
                if (item.action === 'token') {
                    Lampa.Input.edit({
                        title: 'GitHub Personal Access Token',
                        value: c.gist_token,
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.gist_token = val || '';
                            saveCfg(c);
                            notify('Токен сохранён');
                        }
                        showGistSetup();
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
                            notify('Gist ID сохранён');
                        }
                        showGistSetup();
                    });
                } else if (item.action === 'upload') {
                    syncToGist(true);
                    setTimeout(() => showGistSetup(), 1500);
                } else if (item.action === 'download') {
                    syncFromGist(true);
                    setTimeout(() => showGistSetup(), 1500);
                } else if (item.action === 'events') {
                    showSyncEventsSetup();
                }
            },
            onBack: () => {
                Lampa.Controller.toggle('content');
            }
        });
    }

    function showSyncEventsSetup() {
        const c = cfg();
        
        Lampa.Select.show({
            title: '⚙️ События синхронизации',
            items: [
                { title: `🔄 При запуске: ${c.sync_on_start ? '✅ Вкл' : '❌ Выкл'}`, action: 'sync_on_start' },
                { title: `🔄 При закрытии: ${c.sync_on_close ? '✅ Вкл' : '❌ Выкл'}`, action: 'sync_on_close' },
                { title: `➕ При добавлении: ${c.sync_on_add ? '✅ Вкл' : '❌ Выкл'}`, action: 'sync_on_add' },
                { title: `🗑 При удалении: ${c.sync_on_remove ? '✅ Вкл' : '❌ Выкл'}`, action: 'sync_on_remove' },
                { title: '──────────', separator: true },
                { title: `⏱ Автосинхронизация: ${c.sync_auto_interval ? '✅ Вкл' : '❌ Выкл'}`, action: 'sync_auto_interval' },
                { title: `🕐 Интервал: ${c.sync_interval_minutes || 60} минут`, action: 'interval' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'sync_on_start') {
                    c.sync_on_start = !c.sync_on_start;
                    saveCfg(c);
                    showSyncEventsSetup();
                } else if (item.action === 'sync_on_close') {
                    c.sync_on_close = !c.sync_on_close;
                    saveCfg(c);
                    showSyncEventsSetup();
                } else if (item.action === 'sync_on_add') {
                    c.sync_on_add = !c.sync_on_add;
                    saveCfg(c);
                    showSyncEventsSetup();
                } else if (item.action === 'sync_on_remove') {
                    c.sync_on_remove = !c.sync_on_remove;
                    saveCfg(c);
                    showSyncEventsSetup();
                } else if (item.action === 'sync_auto_interval') {
                    c.sync_auto_interval = !c.sync_auto_interval;
                    saveCfg(c);
                    if (c.sync_auto_interval) startAutoSync();
                    showSyncEventsSetup();
                } else if (item.action === 'interval') {
                    Lampa.Input.edit({
                        title: 'Интервал (минуты)',
                        value: String(c.sync_interval_minutes || 60),
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            const minutes = parseInt(val);
                            if (!isNaN(minutes) && minutes >= 5) {
                                c.sync_interval_minutes = minutes;
                                saveCfg(c);
                            }
                        }
                        showSyncEventsSetup();
                    });
                } else if (item.action === 'back') {
                    showGistSetup();
                }
            },
            onBack: () => {
                showGistSetup();
            }
        });
    }

    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'nsl_sync',
            name: 'NSL Sync',
            icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12,2C6.5,2 2,6.5 2,12s4.5,10 10,10 10-4.5 10-10S17.5,2 12,2z M12,4c4.4,0 8,3.6 8,8s-3.6,8-8,8-8-3.6-8-8 3.6-8 8-8z M11,7v5l4,2.5 1-1.5-3-2V7z"/></svg>'
        });

        // Кнопка добавления закладки
        Lampa.SettingsApi.addParam({
            component: 'nsl_sync',
            param: {
                name: 'nsl_button_position',
                type: 'select',
                values: {
                    side: 'Боковое меню',
                    top: 'Верхняя панель'
                },
                default: 'side'
            },
            field: {
                name: '📌 Кнопка добавления закладки'
            },
            onChange: v => {
                const c = cfg();
                c.button_position = v;
                saveCfg(c);
                notify('Настройка применится после перезагрузки');
            }
        });

        // GitHub синхронизация
        Lampa.SettingsApi.addParam({
            component: 'nsl_sync',
            param: { name: 'nsl_gist', type: 'button' },
            field: { name: '☁️ GitHub Gist синхронизация', description: 'Облачное резервное копирование' },
            onChange: () => showGistSetup()
        });

        // Очистка закладок
        Lampa.SettingsApi.addParam({
            component: 'nsl_sync',
            param: { name: 'nsl_clear', type: 'button' },
            field: { name: '🗑️ Очистить все закладки' },
            onChange: () => {
                Lampa.Select.show({
                    title: 'Удалить все закладки?',
                    items: [
                        { title: 'Нет', action: 'cancel' },
                        { title: 'Да', action: 'clear' }
                    ],
                    onSelect: (a) => {
                        if (a.action === 'clear') {
                            saveBookmarks([]);
                            renderBookmarks();
                            notify('Очищено');
                        }
                    }
                });
            }
        });
    }

    // ======================
    // 7. ИНИЦИАЛИЗАЦИЯ
    // ======================

    function onAppClose() {
        const c = cfg();
        if (c.sync_on_close && c.gist_token && c.gist_id) {
            syncToGist(false);
        }
    }

    function onAppStart() {
        const c = cfg();
        if (c.sync_on_start && c.gist_token && c.gist_id) {
            setTimeout(() => syncFromGist(false), 3000);
        }
    }

    function init() {
        if (!cfg().enabled) return;

        // Добавляем кнопки в меню
        setTimeout(() => {
            addBookmarkButton();
            addFavoritesToMenu();
            addHistoryToMenu();
            renderBookmarks();
        }, 500);

        // Настройки
        initSettings();
        
        // Автосинхронизация
        startAutoSync();
        onAppStart();
        
        // Закрытие
        window.addEventListener('beforeunload', onAppClose);
        
        console.log('[NSL Sync] Инициализация завершена');
    }

    // Запуск
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', e => {
            if (e.type === 'ready') init();
        });
    }

})();
