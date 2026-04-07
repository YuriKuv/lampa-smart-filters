(function () {
    'use strict';

    if (window.bf_init) return;
    window.bf_init = true;

    const STORE = 'bf_items_v12';
    const CFG = 'bf_cfg_v12';

    let lock = false;

    const ICON_ADD = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>`;
    const ICON_FLAG = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/></svg>`;

    // ========= CONFIG (FIXED) =========

    function cfg() {
        let c = Lampa.Storage.get(CFG, {}) || {};

        const def = {
            enabled: true,
            button: 'side',
            gist_id: '',
            gist_token: ''
        };

        c = Object.assign({}, def, c);

        if (!['side', 'top'].includes(c.button)) {
            c.button = 'side';
        }

        return c;
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

    // ========= MERGE =========

    function itemKey(i) {
        return [
            i.url,
            JSON.stringify(i.genres || {}),
            JSON.stringify(i.params || {})
        ].join('|');
    }

    function mergeLists(local, remote) {
        const map = {};

        [...local, ...remote].forEach(item => {
            const key = itemKey(item);
            if (!map[key] || map[key].created < item.created) {
                map[key] = item;
            }
        });

        return Object.values(map);
    }

    // ========= SYNC =========

    function syncPull(silent) {
        const c = cfg();
        if (!c.gist_id) return;

        $.get(`https://api.github.com/gists/${c.gist_id}`, (res) => {
            try {
                const file = res.files['bookmarks.json'];
                if (!file) return;

                const remote = JSON.parse(file.content);
                const merged = mergeLists(list(), remote);

                saveList(merged);
                render();

                if (!silent) notify('Синхронизация ↓');
            } catch {}
        });
    }

    function syncPush(silent) {
        const c = cfg();
        if (!c.gist_id || !c.gist_token) return;

        $.get(`https://api.github.com/gists/${c.gist_id}`, (res) => {
            try {
                const file = res.files['bookmarks.json'];
                const remote = file ? JSON.parse(file.content) : [];

                const merged = mergeLists(list(), remote);

                $.ajax({
                    url: `https://api.github.com/gists/${c.gist_id}`,
                    method: 'PATCH',
                    headers: {
                        Authorization: 'token ' + c.gist_token
                    },
                    data: JSON.stringify({
                        files: {
                            'bookmarks.json': {
                                content: JSON.stringify(merged, null, 2)
                            }
                        }
                    }),
                    success: () => {
                        saveList(merged);
                        render();
                        if (!silent) notify('Синхронизация ↑');
                    }
                });

            } catch {}
        });
    }

    // ========= LOGIC =========

    function isAllowed() {
        const a = Lampa.Activity.active();
        if (!a || !a.url) return false;

        if (['movie','tv','anime','catalog'].includes(a.url)) return false;

        if (a.params || a.genres) return true;

        if (a.url.includes('discover') && a.url.includes('?')) return true;

        return false;
    }

    function normalize(a) {
        return {
            id: Date.now(),
            name: a.title || 'Закладка',
            url: a.url,
            component: a.component || 'category_full',
            source: a.source || 'tmdb',
            genres: a.genres,
            params: a.params,
            page: a.page || 1,
            created: Date.now()
        };
    }

    function exists(url) {
        return list().some(i => i.url === url);
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
            notify('Недоступно');
            return unlock();
        }

        if (exists(act.url)) {
            notify('Уже есть');
            return unlock();
        }

        Lampa.Input.edit({
            title: 'Название',
            value: act.title || 'Закладка'
        }, (val) => {
            if (!val) return unlock();

            const l = list();
            l.push({ ...normalize(act), name: val.trim() });

            saveList(l);
            render();

            syncPush(true);

            notify('Сохранено');
            unlock();
        }, unlock);
    }

    function remove(item) {
        saveList(list().filter(i => i.id !== item.id));
        render();

        syncPush(true);

        notify('Удалено');
    }

    function open(item) {
        Lampa.Activity.push(item);
    }

    // ========= UI =========

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

            el.on('hover:enter', () => open(item));

            el.on('hover:long', () => {
                Lampa.Select.show({
                    title: `Удалить "${item.name}"?`,
                    items: [
                        { title: 'Нет', action: 'no' },
                        { title: 'Да', action: 'yes' }
                    ],
                    onSelect: (a) => {
                        if (a.action === 'yes') remove(item);
                    }
                });
            });

            root.append(el);
        });
    }

    function addButton() {
        if ($('[data-bf-save]').length) return;

        const c = cfg();

        if (c.button === 'top') {
            const head = $('.head__actions').first();

            const btn = $(`
                <div class="head__action selector" data-bf-save>
                    <div class="head__action-ico">${ICON_ADD}</div>
                </div>
            `);

            btn.on('hover:enter', save);
            head.prepend(btn);
        } else {
            const menu = $('.menu .menu__list');

            const btn = $(`
                <li class="menu__item selector" data-bf-save>
                    <div class="menu__ico">${ICON_ADD}</div>
                    <div class="menu__text">Добавить закладку</div>
                </li>
            `);

            btn.on('hover:enter', save);
            menu.eq(1).prepend(btn);
        }
    }

    // ========= SETTINGS =========

    function settings() {

        Lampa.SettingsApi.addComponent({
            component: 'bf',
            name: 'Закладки+',
            icon: ICON_FLAG
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            param: { name: 'bf_title_sync', type: 'title' },
            field: { name: 'Синхронизация' }
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            param: { name: 'bf_gist_id', type: 'input', default: '' },
            field: { name: 'Gist ID' },
            onChange: v => { let c = cfg(); c.gist_id = v; saveCfg(c); }
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            param: { name: 'bf_token', type: 'input', default: '' },
            field: { name: 'Token' },
            onChange: v => { let c = cfg(); c.gist_token = v; saveCfg(c); }
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
            field: { name: 'Позиция кнопки' },
            onChange: v => {
                let c = cfg();
                c.button = v;
                saveCfg(c);
                location.reload();
            }
        });
    }

    // ========= INIT =========

    function init() {
        setTimeout(addButton, 500);
        render();
        settings();

        // авто pull
        setTimeout(() => {
            syncPull(true);
        }, 1500);

        // периодический sync
        setInterval(() => {
            syncPull(true);
        }, 300000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());

})();
