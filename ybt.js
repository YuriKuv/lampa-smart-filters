(function () {
    'use strict';

    const STORE_KEY = 'bf_items';
    const CFG_KEY = 'bf_config';

    let lock = false;

    const defaults = {
        enabled: true,
        button_position: 'side' // side | top
    };

    function getCfg() {
        return Object.assign({}, defaults, Lampa.Storage.get(CFG_KEY, {}));
    }

    function setCfg(cfg) {
        Lampa.Storage.set(CFG_KEY, cfg);
    }

    function notify(t) {
        Lampa.Noty.show(t);
    }

    function getList() {
        return Lampa.Storage.get(STORE_KEY, []);
    }

    function setList(list) {
        Lampa.Storage.set(STORE_KEY, list);
    }

    function isAllowed() {
        const act = Lampa.Activity.active();
        if (!act) return false;

        // разрешаем только discover / фильтры / "ещё"
        return act.url && act.url.indexOf('discover') !== -1;
    }

    function normalize(act) {
        return {
            id: Date.now(),
            name: act.title,
            url: act.url,
            component: act.component,
            source: act.source,
            genres: act.genres,
            sort: act.sort
        };
    }

    function safeReturn() {
        setTimeout(() => {
            lock = false;
            Lampa.Controller.toggle('content');
        }, 300);
    }

    function save() {
        if (lock) return;
        lock = true;

        if (!isAllowed()) {
            notify('Недоступно в этом разделе');
            return safeReturn();
        }

        const act = Lampa.Activity.active();

        Lampa.Input.edit({
            title: 'Название закладки',
            value: act.title || 'Закладка'
        }, (val) => {
            if (!val) return safeReturn();

            const list = getList();

            list.push({
                ...normalize(act),
                name: val.trim()
            });

            setList(list);
            notify('Сохранено');
            render();

            safeReturn();
        }, safeReturn);
    }

    function open(item) {
        Lampa.Activity.push(item);
    }

    function confirmRemove(item) {
        Lampa.Modal.confirm({
            title: 'Удаление',
            text: `Удалить "${item.name}"?`,
            onConfirm: () => {
                const list = getList().filter(i => i.id !== item.id);
                setList(list);
                render();
                notify('Удалено');
            }
        });
    }

    function render() {
        $('.bf-item').remove();

        const list = getList();
        const root = $('.menu .menu__list').eq(0);

        list.forEach(item => {
            const el = $(`
                <li class="menu__item selector bf-item">
                    <div class="menu__text">${item.name}</div>
                </li>
            `);

            el.on('hover:enter', () => open(item));
            el.on('hover:long', () => confirmRemove(item));

            root.append(el);
        });
    }

    function addButton() {
        if ($('[data-bf-save]').length) return;

        const cfg = getCfg();

        const btn = $(`
            <li class="menu__item selector" data-bf-save>
                <div class="menu__text">Сохранить</div>
            </li>
        `);

        btn.on('hover:enter', save);

        if (cfg.button_position === 'top') {
            $('.menu .menu__list').eq(0).prepend(btn);
        } else {
            $('.menu .menu__list').eq(1).prepend(btn);
        }
    }

    function settings() {
        Lampa.SettingsApi.addComponent({
            component: 'bookmarks_filter',
            icon: 'bookmark',
            name: 'Мои закладки'
        });

        Lampa.SettingsApi.addParam({
            component: 'bookmarks_filter',
            field: {
                name: 'Включить',
                type: 'trigger',
                default: true
            },
            onChange: (v) => {
                const cfg = getCfg();
                cfg.enabled = v;
                setCfg(cfg);
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'bookmarks_filter',
            field: {
                name: 'Позиция кнопки',
                type: 'select',
                values: {
                    side: 'Боковая панель',
                    top: 'Верхняя панель'
                },
                default: 'side'
            },
            onChange: (v) => {
                const cfg = getCfg();
                cfg.button_position = v;
                setCfg(cfg);
                location.reload();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'bookmarks_filter',
            field: {
                name: 'Очистить все',
                type: 'button'
            },
            onChange: () => {
                Lampa.Modal.confirm({
                    title: 'Очистка',
                    text: 'Удалить все закладки?',
                    onConfirm: () => {
                        setList([]);
                        render();
                        notify('Очищено');
                    }
                });
            }
        });
    }

    function init() {
        const cfg = getCfg();
        if (!cfg.enabled) return;

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
