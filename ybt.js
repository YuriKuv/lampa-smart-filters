(function () {
    'use strict';

    if (window.bf_init) return;
    window.bf_init = true;

    const STORE = 'bf_items_v2';
    const CFG = 'bf_cfg_v2';

    let lock = false;

    const defaults = {
        enabled: true,
        ui: 'simple',
        sync: 'local',
        button: 'side',
        sort: 'date'
    };

    function cfg() {
        return Object.assign({}, defaults, Lampa.Storage.get(CFG, {}));
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG, c);
    }

    function list() {
        return Lampa.Storage.get(STORE, []);
    }

    function saveList(l) {
        Lampa.Storage.set(STORE, l);
    }

    function notify(t) {
        Lampa.Noty.show(t);
    }

    function normalize(a) {
        return {
            id: Date.now(),
            name: a.title,
            url: a.url,
            component: a.component,
            source: a.source,
            created: Date.now()
        };
    }

    function exists(url) {
        return list().some(i => i.url === url);
    }

    function sorted(data) {
        const c = cfg();

        if (c.sort === 'name')
            return data.sort((a, b) => a.name.localeCompare(b.name));

        return data.sort((a, b) => b.created - a.created);
    }

    function isAllowed() {
        const act = Lampa.Activity.active();
        return act && act.url && act.url.indexOf('discover') !== -1;
    }

    function unlock() {
        setTimeout(() => {
            lock = false;
            Lampa.Controller.toggle('content');
        }, 300);
    }

    // ================= SAVE =================

    function save() {
        if (lock) return;
        lock = true;

        const act = Lampa.Activity.active();

        if (!isAllowed()) {
            notify('Недоступно в этом разделе');
            return unlock();
        }

        if (exists(act.url)) {
            notify('Уже есть');
            return unlock();
        }

        Lampa.Input.edit({
            title: 'Название закладки',
            value: act.title || 'Закладка'
        }, (val) => {
            if (!val) return unlock();

            const l = list();
            l.push({ ...normalize(act), name: val.trim() });

            saveList(l);
            render();

            notify('Сохранено');
            unlock();
        }, unlock);
    }

    // ================= REMOVE =================

    function removeConfirm(item) {
        Lampa.Modal.confirm({
            title: 'Удаление',
            text: `Удалить "${item.name}"?`,
            onConfirm: () => {
                const l = list().filter(i => i.id !== item.id);
                saveList(l);
                render();
                notify('Удалено');
            }
        });
    }

    function clearAll() {
        Lampa.Modal.confirm({
            title: 'Очистить',
            text: 'Удалить все закладки?',
            onConfirm: () => {
                saveList([]);
                render();
                notify('Очищено');
            }
        });
    }

    // ================= UI SIMPLE =================

    function render() {
        if (cfg().ui !== 'simple') return;

        $('.bf-item').remove();

        const root = $('.menu .menu__list').eq(0);
        if (!root.length) return;

        const l = sorted(list());

        l.forEach(i => {
            const el = $(`
                <li class="menu__item selector bf-item">
                    <div class="menu__text">${i.name}</div>
                </li>
            `);

            el.on('hover:enter', (e) => {
                e.stopPropagation();
                Lampa.Activity.push(i);
            });

            el.on('hover:long', (e) => {
                e.stopPropagation();
                removeConfirm(i);
            });

            root.append(el);
        });
    }

    // ================= UI ADVANCED =================

    function openManager() {
        const l = sorted(list());

        let html = `<div class="bf-manager">`;

        l.forEach(i => {
            html += `
                <div class="bf-row selector" data-id="${i.id}">
                    <div>${i.name}</div>
                </div>
            `;
        });

        html += `</div>`;

        const modal = $(html);

        modal.find('.bf-row').on('hover:enter', function (e) {
            e.stopPropagation();
            const id = $(this).data('id');
            const item = l.find(x => x.id === id);
            Lampa.Activity.push(item);
        });

        modal.find('.bf-row').on('hover:long', function (e) {
            e.stopPropagation();
            const id = $(this).data('id');
            const item = l.find(x => x.id === id);
            removeConfirm(item);
        });

        Lampa.Modal.open({
            title: 'Закладки',
            html: modal
        });
    }

    // ================= BUTTON =================

    function addButton() {
        if ($('[data-bf]').length) return;

        const btn = $(`
            <li class="menu__item selector bf-btn" data-bf>
                <div class="menu__text">Закладки</div>
            </li>
        `);

        btn.on('hover:enter', (e) => {
            e.stopPropagation();
            openManager();
        });

        const menu = $('.menu .menu__list');

        if (!menu.length) return;

        if (cfg().button === 'top')
            menu.eq(0).prepend(btn);
        else
            menu.eq(1).prepend(btn);
    }

    // ================= SETTINGS =================

    function settings() {
        Lampa.SettingsApi.addComponent({
            component: 'bf',
            name: 'Закладки+',
            icon: 'bookmark'
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            param: {
                name: 'bf_ui',
                type: 'select',
                values: {
                    simple: 'Простой',
                    advanced: 'Расширенный'
                },
                default: 'simple'
            },
            field: {
                name: 'Интерфейс'
            },
            onChange: v => {
                let c = cfg();
                c.ui = v;
                saveCfg(c);
                location.reload();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            param: {
                name: 'bf_sync',
                type: 'select',
                values: {
                    local: 'Локально',
                    gist: 'GitHub Gist',
                    firebase: 'Firebase'
                },
                default: 'local'
            },
            field: {
                name: 'Синхронизация'
            },
            onChange: v => {
                let c = cfg();
                c.sync = v;
                saveCfg(c);
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            param: {
                name: 'bf_sort',
                type: 'select',
                values: {
                    date: 'По дате',
                    name: 'По имени'
                },
                default: 'date'
            },
            field: {
                name: 'Сортировка'
            },
            onChange: v => {
                let c = cfg();
                c.sort = v;
                saveCfg(c);
                render();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            param: {
                name: 'bf_clear',
                type: 'button'
            },
            field: {
                name: 'Очистить закладки'
            },
            onChange: clearAll
        });
    }

    // ================= INIT =================

    function init() {
        if (!cfg().enabled) return;

        addButton();
        render();
        settings();
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') init();
        });
    }

})();
