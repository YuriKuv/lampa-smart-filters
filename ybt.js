(function () {
    'use strict';

    if (window.bf_init) return;
    window.bf_init = true;

    const STORE = 'bf_items_v11';
    const CFG = 'bf_cfg_v11';

    let lock = false;

    // ========= SVG ICONS =========

    function iconPlus() {
        return `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>`;
    }

    function iconBookmark() {
        return `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M6 4h12v16l-6-4-6 4z"/>
        </svg>`;
    }

    // ========= CONFIG =========

    function cfg() {
        return Lampa.Storage.get(CFG, {
            enabled: true,
            button: 'side'
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

    // ========= LOGIC =========

    function isAllowed() {
        const act = Lampa.Activity.active();
        if (!act || !act.url) return false;

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
            notify('Здесь нельзя создать закладку');
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
                    <div class="menu__ico">${iconBookmark()}</div>
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
                    title: \`Удалить "\${item.name}"?\`,
                    items: [
                        { title: 'Нет', action: 'cancel' },
                        { title: 'Да', action: 'remove' }
                    ],
                    onSelect: (a) => {
                        if (a.action === 'remove') remove(item);
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
                    <div class="head__action-ico">${iconPlus()}</div>
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
                    <div class="menu__ico">${iconPlus()}</div>
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
                    }
                });
            }
        });
    }

    function init() {
        if (!cfg().enabled) return;

        setTimeout(addButton, 500);
        render();
        settings();
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());

})();
