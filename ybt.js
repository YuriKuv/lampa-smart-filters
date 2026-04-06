(function () {
    'use strict';

    if (window.bf_init) return;
    window.bf_init = true;

    const STORE = 'bf_items_v3';
    const CFG = 'bf_cfg_v3';

    let lock = false;

    function cfg() {
        return Lampa.Storage.get(CFG, {
            enabled: true,
            sort: 'date'
        });
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

    function isAllowed() {
        const act = Lampa.Activity.active();
        return act && act.url && act.url.indexOf('discover') !== -1;
    }

    function normalize(a) {
        return {
            id: Date.now(),
            name: a.title || 'Закладка',
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

            notify('Сохранено');
            unlock();
        }, unlock);
    }

    // ========= REMOVE =========

    function remove(item) {
        const l = list().filter(i => i.id !== item.id);
        saveList(l);
        render();
        notify('Удалено');
    }

    // ========= RENDER =========

    function render() {
        $('.bf-item').remove();

        const root = $('.menu .menu__list').eq(0);
        if (!root.length) return;

        const l = sorted(list());

        l.forEach(item => {
            const el = $(`
                <li class="menu__item selector bf-item">
                    <div class="menu__text">${item.name}</div>
                </li>
            `);

            let pressTime = 0;

            el.on('hover:enter', (e) => {
                e.stopPropagation();

                const now = Date.now();

                // двойное нажатие = удалить
                if (now - pressTime < 400) {
                    remove(item);
                    return;
                }

                pressTime = now;

                Lampa.Activity.push(item);
            });

            root.append(el);
        });
    }

    // ========= BUTTON =========

    function addButton() {
        if ($('[data-bf-save]').length) return;

        const btn = $(`
            <li class="menu__item selector" data-bf-save>
                <div class="menu__text">Добавить закладку</div>
            </li>
        `);

        btn.on('hover:enter', (e) => {
            e.stopPropagation();
            save();
        });

        $('.menu .menu__list').eq(1).prepend(btn);
    }

    // ========= SETTINGS =========

    function settings() {
        Lampa.SettingsApi.addComponent({
            component: 'bf',
            name: 'Закладки+',
            icon: 'bookmark'
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
                const c = cfg();
                c.sort = v;
                Lampa.Storage.set(CFG, c);
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
                name: 'Очистить все закладки'
            },
            onChange: () => {
                saveList([]);
                render();
                notify('Очищено');
            }
        });
    }

    // ========= INIT =========

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
