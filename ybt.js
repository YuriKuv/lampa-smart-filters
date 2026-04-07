(function () {
    'use strict';

    if (window.bf_init) return;
    window.bf_init = true;

    const STORE = 'bf_items_v10';
    const CFG = 'bf_cfg_v10';
    const GIST_CACHE = 'bf_gist_cache';

    let lock = false;
    let syncTimer = null;

    // ========= SVG (МОНОХРОМНЫЕ, В СТИЛЕ LAMPA) =========

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

    const ICON_SYNC = `
        <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
    `;

    const ICON_CLOUD = `
        <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h.71C7.37 7.69 9.48 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z"/>
        </svg>
    `;

    const ICON_CLOUD_UPLOAD = `
        <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
        </svg>
    `;

    const ICON_CLOUD_DOWNLOAD = `
        <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
        </svg>
    `;

    const ICON_SETTINGS = `
        <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.33-.02-.64-.06-.94l2.02-1.58c.18-.14.23-.38.12-.56l-1.89-3.28c-.12-.19-.36-.26-.56-.18l-2.38.96c-.5-.38-1.06-.68-1.66-.88L14.45 3.5c-.04-.2-.2-.34-.4-.34h-3.78c-.2 0-.36.14-.4.34l-.3 2.52c-.6.2-1.16.5-1.66.88l-2.38-.96c-.2-.08-.44-.01-.56.18l-1.89 3.28c-.12.19-.07.42.12.56l2.02 1.58c-.04.3-.06.61-.06.94 0 .33.02.64.06.94l-2.02 1.58c-.18.14-.23.38-.12.56l1.89 3.28c.12.19.36.26.56.18l2.38-.96c.5.38 1.06.68 1.66.88l.3 2.52c.04.2.2.34.4.34h3.78c.2 0 .36-.14.4-.34l.3-2.52c.6-.2 1.16-.5 1.66-.88l2.38.96c.2.08.44.01.56-.18l1.89-3.28c.12-.19.07-.42-.12-.56l-2.02-1.58zM12 15c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
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
            gist_token: '',
            gist_id: '',
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

    // ========= GITHUB GIST SYNC =========

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
            if (c.sync_on_add && c.gist_token && c.gist_id) {
                syncToGist(false);
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
        if (c.sync_on_remove && c.gist_token && c.gist_id) {
            syncToGist(false);
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

    // ========= НАСТРОЙКИ GITHUB =========

    function showGistSetup() {
        const c = cfg();
        
        Lampa.Select.show({
            title: 'GitHub Gist Синхронизация',
            items: [
                { title: `Токен: ${c.gist_token ? '✓ Установлен' : '✗ Не установлен'}`, action: 'token' },
                { title: `Gist ID: ${c.gist_id ? c.gist_id.substring(0, 8) + '…' : '✗ Не установлен'}`, action: 'id' },
                { title: '──────────', separator: true },
                { title: 'Выгрузить в Gist', action: 'upload' },
                { title: 'Загрузить из Gist', action: 'download' },
                { title: '──────────', separator: true },
                { title: 'События синхронизации →', action: 'events' },
                { title: '──────────', separator: true },
                { title: 'Отмена', action: 'cancel' }
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
            title: 'События синхронизации',
            items: [
                { title: `При запуске Lampa: ${c.sync_on_start ? '✅ Вкл' : '❌ Выкл'}`, action: 'sync_on_start' },
                { title: `При закрытии Lampa: ${c.sync_on_close ? '✅ Вкл' : '❌ Выкл'}`, action: 'sync_on_close' },
                { title: `При добавлении закладки: ${c.sync_on_add ? '✅ Вкл' : '❌ Выкл'}`, action: 'sync_on_add' },
                { title: `При удалении закладки: ${c.sync_on_remove ? '✅ Вкл' : '❌ Выкл'}`, action: 'sync_on_remove' },
                { title: `При редактировании: ${c.sync_on_edit ? '✅ Вкл' : '❌ Выкл'}`, action: 'sync_on_edit' },
                { title: '──────────', separator: true },
                { title: `Автосинхронизация: ${c.sync_auto_interval ? '✅ Вкл' : '❌ Выкл'}`, action: 'sync_auto_interval' },
                { title: `Интервал: ${c.sync_interval_minutes || 60} минут`, action: 'interval' },
                { title: '──────────', separator: true },
                { title: 'Назад', action: 'back' }
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
                    showGistSetup();
                }
            },
            onBack: () => {
                showGistSetup();
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
                name: 'bf_gist',
                type: 'button'
            },
            field: {
                name: 'GitHub Gist синхронизация',
                description: 'Облачное резервное копирование закладок'
            },
            onChange: () => {
                showGistSetup();
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
        if (c.sync_on_close && c.gist_token && c.gist_id) {
            syncToGist(false);
        }
    }

    function onAppStart() {
        const c = cfg();
        if (c.sync_on_start && c.gist_token && c.gist_id) {
            setTimeout(() => {
                syncFromGist(false);
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
