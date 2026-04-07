(function () {
    'use strict';

    if (window.bf_init) return;
    window.bf_init = true;

    const STORE = 'bf_items_v10';
    const CFG = 'bf_cfg_v10';
    const GIST_CACHE = 'bf_gist_cache';
    const WEBDAV_CACHE = 'bf_webdav_cache';

    let lock = false;
    let syncTimer = null;

    // ========= SVG =========

    const ICON_ADD = `
        <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z"/>
        </svg>
    `;

    const ICON_FLAG = `
        <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/>
        </svg>
    `;

    // ========= CSS =========

    function injectStyles() {
        if ($('#bf-style').length) return;

        $('head').append(`
            <style id="bf-style">
                .bf-item .menu__text {
                    line-height: 1.35 !important;
                    white-space: normal;
                }
                .bf-sync-status {
                    font-size: 0.8em;
                    opacity: 0.7;
                    margin-left: 5px;
                }
            </style>
        `);
    }

    // ========= CONFIG =========

    function cfg() {
        return Lampa.Storage.get(CFG, {
            enabled: true,
            button: 'side',
            // GitHub
            gist_token: '',
            gist_id: '',
            // WebDAV
            webdav_enabled: false,
            webdav_url: 'https://webdav.yandex.ru',
            webdav_login: '',
            webdav_password: '',
            webdav_path: '/lampa_bookmarks.json',
            // Общие настройки синхронизации
            sync_method: 'none',
            sync_on_start: true,
            sync_on_close: false,
            sync_on_add: true,
            sync_on_remove: true,
            sync_on_edit: false,
            sync_auto_interval: true,
            sync_interval_minutes: 60
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG, c, true);
    }

    // ========= STORAGE =========

    function list() {
        return Lampa.Storage.get(STORE, []) || [];
    }

    function saveList(l) {
        Lampa.Storage.set(STORE, l, true);
    }

    function notify(t) {
        Lampa.Noty.show(t);
    }

    // ========= KEY =========

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

    function exists(act) {
        const key = makeKey(act);
        return list().some(i => i.key === key);
    }

    // ========= WEBDAV СИНХРОНИЗАЦИЯ =========

    function getWebDAVData() {
        const c = cfg();
        if (!c.webdav_enabled) return null;
        if (!c.webdav_login || !c.webdav_password) return null;
        return {
            url: c.webdav_url,
            login: c.webdav_login,
            password: c.webdav_password,
            path: c.webdav_path || '/lampa_bookmarks.json'
        };
    }

    function syncToWebDAV(showNotify = true) {
        const webdav = getWebDAVData();
        if (!webdav) {
            if (showNotify) notify('WebDAV не настроен');
            return false;
        }

        const data = JSON.stringify({
            version: 2,
            updated: new Date().toISOString(),
            bookmarks: list()
        }, null, 2);

        const fullUrl = webdav.url.replace(/\/$/, '') + webdav.path;
        const auth = btoa(webdav.login + ':' + webdav.password);

        $.ajax({
            url: fullUrl,
            method: 'PUT',
            headers: {
                'Authorization': 'Basic ' + auth,
                'Content-Type': 'application/json'
            },
            data: data,
            success: function() {
                if (showNotify) notify('Закладки синхронизированы с Яндекс Диск');
                Lampa.Storage.set(WEBDAV_CACHE + '_last_sync', Date.now());
            },
            error: function(xhr) {
                console.error('[WebDAV] Error:', xhr);
                if (showNotify) notify('Ошибка синхронизации: ' + (xhr.status === 401 ? 'Неверный логин/пароль' : 'Ошибка соединения'));
            }
        });
    }

    function syncFromWebDAV(showNotify = true) {
        const webdav = getWebDAVData();
        if (!webdav) {
            if (showNotify) notify('WebDAV не настроен');
            return false;
        }

        const fullUrl = webdav.url.replace(/\/$/, '') + webdav.path;
        const auth = btoa(webdav.login + ':' + webdav.password);

        $.ajax({
            url: fullUrl,
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + auth,
                'Accept': 'application/json'
            },
            success: function(data) {
                try {
                    let remote;
                    if (typeof data === 'string') {
                        remote = JSON.parse(data);
                    } else {
                        remote = data;
                    }

                    const remoteList = remote.bookmarks || [];
                    const localList = list();

                    const merged = [...remoteList];
                    localList.forEach(local => {
                        if (!merged.some(m => m.key === local.key)) {
                            merged.push(local);
                        }
                    });

                    merged.sort((a, b) => (b.created || b.id) - (a.created || a.id));

                    saveList(merged);
                    render();

                    if (showNotify) notify(`Загружено ${remoteList.length} закладок из Яндекс Диск`);
                } catch(e) {
                    console.error('[WebDAV] Parse error:', e);
                    if (showNotify) notify('Ошибка чтения данных');
                }
            },
            error: function(xhr) {
                console.error('[WebDAV] Error:', xhr);
                if (xhr.status === 404) {
                    if (showNotify) notify('Файл не найден, будет создан при первой синхронизации');
                    syncToWebDAV(false);
                } else if (showNotify) {
                    notify('Ошибка загрузки: ' + (xhr.status === 401 ? 'Неверный логин/пароль' : 'Ошибка соединения'));
                }
            }
        });
    }

    // ========= GITHUB GIST СИНХРОНИЗАЦИЯ =========

    function getGistData() {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) return null;
        return { token: c.gist_token, id: c.gist_id };
    }

    function syncToGist(showNotify = true) {
        const gist = getGistData();
        if (!gist) {
            if (showNotify) notify('GitHub Gist не настроен');
            return false;
        }

        const data = {
            description: 'Lampa Bookmarks Backup',
            public: false,
            files: {
                'bookmarks.json': {
                    content: JSON.stringify({
                        version: 2,
                        updated: new Date().toISOString(),
                        bookmarks: list()
                    }, null, 2)
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
                if (showNotify) notify('Закладки синхронизированы с GitHub');
                Lampa.Storage.set(GIST_CACHE + '_last_sync', Date.now());
            },
            error: function(xhr) {
                console.error('[Sync] Error:', xhr);
                if (showNotify) notify('Ошибка синхронизации: ' + (xhr.responseJSON?.message || 'Unknown error'));
            }
        });
    }

    function syncFromGist(showNotify = true) {
        const gist = getGistData();
        if (!gist) {
            if (showNotify) notify('GitHub Gist не настроен');
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
                    const content = data.files['bookmarks.json']?.content;
                    if (!content) {
                        if (showNotify) notify('Файл bookmarks.json не найден в Gist');
                        return;
                    }

                    const remote = JSON.parse(content);
                    const localList = list();
                    const remoteList = remote.bookmarks || [];

                    const merged = [...remoteList];
                    localList.forEach(local => {
                        if (!merged.some(m => m.key === local.key)) {
                            merged.push(local);
                        }
                    });

                    merged.sort((a, b) => (b.created || b.id) - (a.created || a.id));

                    saveList(merged);
                    render();

                    if (showNotify) notify(`Загружено ${remoteList.length} закладок из GitHub`);
                } catch(e) {
                    console.error('[Sync] Parse error:', e);
                    if (showNotify) notify('Ошибка чтения данных из Gist');
                }
            },
            error: function(xhr) {
                console.error('[Sync] Error:', xhr);
                if (showNotify) notify('Ошибка загрузки из GitHub: ' + (xhr.responseJSON?.message || 'Unknown error'));
            }
        });
    }

    // ========= ОСНОВНАЯ ФУНКЦИЯ СИНХРОНИЗАЦИИ =========

    function syncToCloud(showNotify = true) {
        const c = cfg();
        const method = c.sync_method;
        
        if (method === 'webdav') {
            syncToWebDAV(showNotify);
        } else if (method === 'gist') {
            syncToGist(showNotify);
        }
    }

    function syncFromCloud(showNotify = true) {
        const c = cfg();
        const method = c.sync_method;
        
        if (method === 'webdav') {
            syncFromWebDAV(showNotify);
        } else if (method === 'gist') {
            syncFromGist(showNotify);
        }
    }

    function checkAutoSync() {
        const c = cfg();
        if (!c.sync_auto_interval || c.sync_method === 'none') return;
        
        const lastSync = Lampa.Storage.get(
            c.sync_method === 'webdav' ? WEBDAV_CACHE + '_last_sync' : GIST_CACHE + '_last_sync', 
            0
        );
        const now = Date.now();
        const interval = (c.sync_interval_minutes || 60) * 60 * 1000;
        
        if (now - lastSync > interval) {
            syncFromCloud(false);
        }
    }

    function startAutoSync() {
        if (syncTimer) clearInterval(syncTimer);
        syncTimer = setInterval(() => checkAutoSync(), 5 * 60 * 1000);
    }

    // ========= LOGIC =========

    function isAllowed() {
        const act = Lampa.Activity.active();
        if (!act) return false;

        if (act.component === 'actor' || act.component === 'person')
            return true;

        if (!act.url) return false;

        if (
            act.url === 'movie' ||
            act.url === 'tv' ||
            act.url === 'anime' ||
            act.url === 'catalog'
        ) return false;

        if (act.params || act.genres || act.sort || act.filter)
            return true;

        if (act.url.indexOf('discover') !== -1 && act.url.indexOf('?') !== -1)
            return true;

        return false;
    }

    function normalize(a) {
        const key = makeKey(a);

        return {
            id: Date.now(),
            key: key,
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

    function unlock() {
        setTimeout(() => {
            lock = false;
            Lampa.Controller.toggle('content');
        }, 200);
    }

    // ========= SAVE =========

    function save() {
        if (lock) return;
        lock = true;

        const act = Lampa.Activity.active();

        if (!isAllowed()) {
            notify('Здесь нельзя создать закладку');
            return unlock();
        }

        if (exists(act)) {
            notify('Уже есть');
            return unlock();
        }

        Lampa.Input.edit({
            title: 'Название',
            value: act.title || act.name || 'Закладка'
        }, (val) => {
            if (!val) return unlock();

            const l = list();
            l.push({ ...normalize(act), name: val.trim() });

            saveList(l);
            render();

            const c = cfg();
            if (c.sync_on_add && c.sync_method !== 'none') {
                syncToCloud(false);
            }

            notify('Сохранено');
            unlock();
        }, unlock);
    }

    // ========= REMOVE =========

    function remove(item) {
        const l = list().filter(i => i.id !== item.id);
        saveList(l);
        render();

        const c = cfg();
        if (c.sync_on_remove && c.sync_method !== 'none') {
            syncToCloud(false);
        }

        setTimeout(() => {
            Lampa.Controller.toggle('content');
        }, 100);

        notify('Удалено');
    }

    // ========= OPEN =========

    function open(item) {
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

    // ========= RENDER =========

    function render() {
        $('.bf-item').remove();

        const root = $('.menu .menu__list').eq(0);
        if (!root.length) return;

        list().forEach(item => {
            const el = $(`
                <li class="menu__item selector bf-item">
                    <div class="menu__ico">${ICON_FLAG}</div>
                    <div class="menu__text">${item.name}</div>
                </li>
            `);

            el.on('hover:enter', (e) => {
                e.stopPropagation();
                open(item);
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
                        if (a.action === 'remove') remove(item);
                    },
                    onBack: () => {
                        Lampa.Controller.toggle('content');
                    }
                });
            });

            root.append(el);
        });
    }

    // ========= BUTTON =========

    function addButton() {
        if ($('[data-bf-save]').length) return;

        const c = cfg();

        if (c.button === 'top') {
            const head = $('.head__actions, .head__buttons').first();
            if (!head.length) return;

            const btn = $(`
                <div class="head__action selector" data-bf-save>
                    <div class="head__action-ico">${ICON_ADD}</div>
                </div>
            `);

            btn.on('hover:enter', (e) => {
                e.stopPropagation();
                save();
            });

            head.prepend(btn);
        } else {
            const menu = $('.menu .menu__list');
            if (!menu.length) return;

            const btn = $(`
                <li class="menu__item selector" data-bf-save>
                    <div class="menu__ico">${ICON_ADD}</div>
                    <div class="menu__text">Добавить закладку</div>
                </li>
            `);

            btn.on('hover:enter', (e) => {
                e.stopPropagation();
                save();
            });

            menu.eq(1).prepend(btn);
        }
    }

    // ========= НАСТРОЙКИ WEBDAV =========

    function showWebDAVSetup() {
        const c = cfg();
        
        Lampa.Select.show({
            title: 'Яндекс Диск (WebDAV)',
            items: [
                { title: `Сервер: ${c.webdav_url || 'https://webdav.yandex.ru'}`, action: 'url' },
                { title: `Логин: ${c.webdav_login ? c.webdav_login : 'Не указан'}`, action: 'login' },
                { title: `Пароль: ${c.webdav_password ? '••••••••' : 'Не указан'}`, action: 'password' },
                { title: `Путь: ${c.webdav_path || '/lampa_bookmarks.json'}`, action: 'path' },
                { title: `Статус: ${c.webdav_enabled ? '✓ Включена' : '✗ Выключена'}`, action: 'toggle' },
                { title: '──────────', separator: true },
                { title: '📤 Выгрузить в Яндекс Диск', action: 'upload' },
                { title: '📥 Загрузить из Яндекс Диск', action: 'download' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: (item) => {
                if (item.action === 'url') {
                    Lampa.Input.edit({
                        title: 'WebDAV сервер',
                        value: c.webdav_url || 'https://webdav.yandex.ru',
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.webdav_url = val || 'https://webdav.yandex.ru';
                            saveCfg(c);
                            notify('Сервер сохранён');
                        }
                        showWebDAVSetup();
                    });
                } else if (item.action === 'login') {
                    Lampa.Input.edit({
                        title: 'Логин (Яндекс ID)',
                        value: c.webdav_login,
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.webdav_login = val || '';
                            saveCfg(c);
                            notify('Логин сохранён');
                        }
                        showWebDAVSetup();
                    });
                } else if (item.action === 'password') {
                    Lampa.Input.edit({
                        title: 'Пароль',
                        value: c.webdav_password,
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.webdav_password = val || '';
                            saveCfg(c);
                            notify('Пароль сохранён');
                        }
                        showWebDAVSetup();
                    });
                } else if (item.action === 'path') {
                    Lampa.Input.edit({
                        title: 'Путь к файлу',
                        value: c.webdav_path || '/lampa_bookmarks.json',
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.webdav_path = val || '/lampa_bookmarks.json';
                            saveCfg(c);
                            notify('Путь сохранён');
                        }
                        showWebDAVSetup();
                    });
                } else if (item.action === 'toggle') {
                    c.webdav_enabled = !c.webdav_enabled;
                    saveCfg(c);
                    notify(`WebDAV синхронизация ${c.webdav_enabled ? 'включена' : 'выключена'}`);
                    showWebDAVSetup();
                } else if (item.action === 'upload') {
                    syncToWebDAV(true);
                    setTimeout(() => showWebDAVSetup(), 1500);
                } else if (item.action === 'download') {
                    syncFromWebDAV(true);
                    setTimeout(() => showWebDAVSetup(), 1500);
                } else if (item.action === 'back') {
                    showSyncSetup();
                }
            },
            onBack: () => {
                showSyncSetup();
            }
        });
    }

    // ========= НАСТРОЙКИ GITHUB =========

    function showGistSetup() {
        const c = cfg();
        
        Lampa.Select.show({
            title: 'GitHub Gist синхронизация',
            items: [
                { title: `Токен: ${c.gist_token ? '✓ Установлен' : '✗ Не установлен'}`, action: 'token' },
                { title: `Gist ID: ${c.gist_id ? c.gist_id.substring(0, 8) + '…' : '✗ Не установлен'}`, action: 'id' },
                { title: '──────────', separator: true },
                { title: '📤 Выгрузить в Gist', action: 'upload' },
                { title: '📥 Загрузить из Gist', action: 'download' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' },
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
                } else if (item.action === 'back') {
                    showSyncSetup();
                }
            },
            onBack: () => {
                showSyncSetup();
            }
        });
    }

    // ========= НАСТРОЙКИ СИНХРОНИЗАЦИИ =========

    function showSyncSetup() {
        const c = cfg();
        
        Lampa.Select.show({
            title: 'Синхронизация',
            items: [
                { title: `Метод: ${c.sync_method === 'webdav' ? 'Яндекс Диск' : c.sync_method === 'gist' ? 'GitHub Gist' : 'Отключена'}`, action: 'method' },
                { title: `Статус: ${c.sync_method !== 'none' && ((c.sync_method === 'webdav' && c.webdav_enabled) || (c.sync_method === 'gist' && c.gist_token && c.gist_id)) ? '✓ Готов' : '✗ Не настроен'}`, action: 'status' },
                { title: '──────────', separator: true },
                { title: '⚙️ События синхронизации →', action: 'events' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: (item) => {
                if (item.action === 'method') {
                    Lampa.Select.show({
                        title: 'Выберите метод синхронизации',
                        items: [
                            { title: 'Отключена', action: 'none' },
                            { title: 'Яндекс Диск (WebDAV)', action: 'webdav' },
                            { title: 'GitHub Gist', action: 'gist' }
                        ],
                        onSelect: (method) => {
                            c.sync_method = method.action;
                            saveCfg(c);
                            notify(`Метод синхронизации: ${method.title}`);
                            showSyncSetup();
                        }
                    });
                } else if (item.action === 'status') {
                    if (c.sync_method === 'webdav') {
                        showWebDAVSetup();
                    } else if (c.sync_method === 'gist') {
                        showGistSetup();
                    } else {
                        notify('Синхронизация отключена');
                        showSyncSetup();
                    }
                } else if (item.action === 'events') {
                    showSyncEventsSetup();
                } else if (item.action === 'back') {
                    showFullSettings();
                }
            },
            onBack: () => {
                showFullSettings();
            }
        });
    }

    function showSyncEventsSetup() {
        const c = cfg();
        
        Lampa.Select.show({
            title: 'События синхронизации',
            items: [
                { title: `При запуске Lampa: ${c.sync_on_start ? '✓ Вкл' : '✗ Выкл'}`, action: 'sync_on_start' },
                { title: `При закрытии Lampa: ${c.sync_on_close ? '✓ Вкл' : '✗ Выкл'}`, action: 'sync_on_close' },
                { title: `При добавлении закладки: ${c.sync_on_add ? '✓ Вкл' : '✗ Выкл'}`, action: 'sync_on_add' },
                { title: `При удалении закладки: ${c.sync_on_remove ? '✓ Вкл' : '✗ Выкл'}`, action: 'sync_on_remove' },
                { title: `При редактировании: ${c.sync_on_edit ? '✓ Вкл' : '✗ Выкл'}`, action: 'sync_on_edit' },
                { title: '──────────', separator: true },
                { title: `Автосинхронизация: ${c.sync_auto_interval ? '✓ Вкл' : '✗ Выкл'}`, action: 'sync_auto_interval' },
                { title: `Интервал: ${c.sync_interval_minutes || 60} минут`, action: 'interval' },
                { title: '──────────', separator: true },
                { title: '◀ Назад', action: 'back' }
            ],
            onSelect: (item) => {
                if (item.action === 'sync_on_start') {
                    c.sync_on_start = !c.sync_on_start;
                    saveCfg(c);
                    notify(`Синхронизация при запуске ${c.sync_on_start ? 'включена' : 'выключена'}`);
                    showSyncEventsSetup();
                } else if (item.action === 'sync_on_close') {
                    c.sync_on_close = !c.sync_on_close;
                    saveCfg(c);
                    notify(`Синхронизация при закрытии ${c.sync_on_close ? 'включена' : 'выключена'}`);
                    showSyncEventsSetup();
                } else if (item.action === 'sync_on_add') {
                    c.sync_on_add = !c.sync_on_add;
                    saveCfg(c);
                    notify(`Синхронизация при добавлении ${c.sync_on_add ? 'включена' : 'выключена'}`);
                    showSyncEventsSetup();
                } else if (item.action === 'sync_on_remove') {
                    c.sync_on_remove = !c.sync_on_remove;
                    saveCfg(c);
                    notify(`Синхронизация при удалении ${c.sync_on_remove ? 'включена' : 'выключена'}`);
                    showSyncEventsSetup();
                } else if (item.action === 'sync_on_edit') {
                    c.sync_on_edit = !c.sync_on_edit;
                    saveCfg(c);
                    notify(`Синхронизация при редактировании ${c.sync_on_edit ? 'включена' : 'выключена'}`);
                    showSyncEventsSetup();
                } else if (item.action === 'sync_auto_interval') {
                    c.sync_auto_interval = !c.sync_auto_interval;
                    saveCfg(c);
                    if (c.sync_auto_interval) startAutoSync();
                    notify(`Автосинхронизация ${c.sync_auto_interval ? 'включена' : 'выключена'}`);
                    showSyncEventsSetup();
                } else if (item.action === 'interval') {
                    Lampa.Input.edit({
                        title: 'Интервал автосинхронизации (минуты)',
                        value: String(c.sync_interval_minutes || 60),
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            const minutes = parseInt(val);
                            if (!isNaN(minutes) && minutes >= 5) {
                                c.sync_interval_minutes = minutes;
                                saveCfg(c);
                                notify(`Интервал установлен: ${minutes} минут`);
                            } else {
                                notify('Минимальный интервал 5 минут');
                            }
                        }
                        showSyncEventsSetup();
                    });
                } else if (item.action === 'back') {
                    showSyncSetup();
                }
            },
            onBack: () => {
                showSyncSetup();
            }
        });
    }

    function showFullSettings() {
        Lampa.Select.show({
            title: 'Закладки+',
            items: [
                { title: '☁️ Синхронизация →', action: 'sync' },
                { title: '──────────', separator: true },
                { title: '❌ Закрыть', action: 'cancel' }
            ],
            onSelect: (item) => {
                if (item.action === 'sync') {
                    showSyncSetup();
                }
            },
            onBack: () => {
                Lampa.Controller.toggle('content');
            }
        });
    }

    // ========= НАСТРОЙКИ =========

    function settings() {
        Lampa.SettingsApi.addComponent({
            component: 'bf',
            name: 'Закладки+',
            icon: ICON_FLAG
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            param: {
                name: 'bf_button',
                type: 'select',
                values: {
                    side: 'Боковое меню',
                    top: 'Верхняя панель'
                },
                default: 'side'
            },
            field: {
                name: 'Кнопка добавления'
            },
            onChange: v => {
                const c = cfg();
                c.button = v;
                saveCfg(c);
                location.reload();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            param: {
                name: 'bf_sync_settings',
                type: 'button'
            },
            field: {
                name: '☁️ Синхронизация',
                description: 'Настройка Яндекс Диск / GitHub Gist'
            },
            onChange: () => {
                showFullSettings();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            param: {
                name: 'bf_clear',
                type: 'button'
            },
            field: {
                name: 'Очистить все закладки'
            },
            onChange: () => {
                Lampa.Select.show({
                    title: 'Удалить все закладки?',
                    items: [
                        { title: 'Нет', action: 'cancel' },
                        { title: 'Да', action: 'clear' }
                    ],
                    onSelect: (a) => {
                        if (a.action === 'clear') {
                            saveList([]);
                            render();
                            notify('Очищено');
                        }
                    },
                    onBack: () => {
                        Lampa.Controller.toggle('content');
                    }
                });
            }
        });
    }

    // ========= ОБРАБОТЧИКИ СОБЫТИЙ =========

    function onAppClose() {
        const c = cfg();
        if (c.sync_on_close && c.sync_method !== 'none') {
            syncToCloud(false);
        }
    }

    function onAppStart() {
        const c = cfg();
        if (c.sync_on_start && c.sync_method !== 'none') {
            setTimeout(() => {
                syncFromCloud(false);
            }, 3000);
        }
    }

    // ========= INIT =========

    function init() {
        if (!cfg().enabled) return;

        injectStyles();

        setTimeout(() => {
            addButton();
        }, 500);

        render();
        settings();
        
        startAutoSync();
        onAppStart();
        
        window.addEventListener('beforeunload', onAppClose);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());

})();
