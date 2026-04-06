(function () {
    'use strict';

    if (window.bf_init) return;
    window.bf_init = true;

    const STORE = 'bf_items_v12';
    const CFG = 'bf_cfg_v12';

    let lock = false;

    // ========= SVG =========

    function iconPlus() {
        return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    }

    function iconBookmark() {
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h12v16l-6-4-6 4z"/></svg>';
    }

    function cfg() {
        return Lampa.Storage.get(CFG, {
            enabled: true,
            button: 'side'
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG, c, true);
    }

    function list() {
        return Lampa.Storage.get(STORE, []) || [];
    }

    function saveList(l) {
        Lampa.Storage.set(STORE, l, true);
    }

    function notify(t) {
        Lampa.Noty.show(t);
    }

    function isAllowed() {
        var act = Lampa.Activity.active();
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
        var l = list();
        for (var i = 0; i < l.length; i++) {
            if (l[i].url === url) return true;
        }
        return false;
    }

    function unlock() {
        setTimeout(function () {
            lock = false;
            Lampa.Controller.toggle('content');
        }, 200);
    }

    function save() {
        if (lock) return;
        lock = true;

        var act = Lampa.Activity.active();

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
        }, function (val) {
            if (!val) return unlock();

            var l = list();
            var item = normalize(act);
            item.name = val.trim();

            l.push(item);
            saveList(l);
            render();

            notify('Сохранено');
            unlock();
        }, unlock);
    }

    function remove(item) {
        var l = list().filter(function (i) {
            return i.id !== item.id;
        });

        saveList(l);
        render();

        setTimeout(function () {
            Lampa.Controller.toggle('content');
        }, 100);

        notify('Удалено');
    }

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

    function render() {
        $('.bf-item').remove();

        var root = $('.menu .menu__list').eq(0);
        if (!root.length) return;

        list().forEach(function (item) {

            var el = $('<li class="menu__item selector bf-item"></li>');

            var ico = $('<div class="menu__ico"></div>');
            ico.html(iconBookmark());

            var text = $('<div class="menu__text"></div>');
            text.text(item.name);

            el.append(ico);
            el.append(text);

            el.on('hover:enter', function (e) {
                e.stopPropagation();
                open(item);
            });

            el.on('hover:long', function (e) {
                e.stopPropagation();

                Lampa.Select.show({
                    title: 'Удалить "' + item.name + '"?',
                    items: [
                        { title: 'Нет', action: 'cancel' },
                        { title: 'Да', action: 'remove' }
                    ],
                    onSelect: function (a) {
                        if (a.action === 'remove') remove(item);
                    }
                });
            });

            root.append(el);
        });
    }

    function addButton() {
        if ($('[data-bf-save]').length) return;

        var c = cfg();

        if (c.button === 'top') {
            var head = $('.head__actions, .head__buttons').first();
            if (!head.length) return;

            var btn = $('<div class="head__action selector" data-bf-save></div>');
            var ico = $('<div class="head__action-ico"></div>');
            ico.html(iconPlus());

            btn.append(ico);

            btn.on('hover:enter', function (e) {
                e.stopPropagation();
                save();
            });

            head.prepend(btn);
        } else {
            var menu = $('.menu .menu__list');
            if (!menu.length) return;

            var btn = $('<li class="menu__item selector" data-bf-save></li>');

            var ico = $('<div class="menu__ico"></div>');
            ico.html(iconPlus());

            var text = $('<div class="menu__text">Добавить закладку</div>');

            btn.append(ico);
            btn.append(text);

            btn.on('hover:enter', function (e) {
                e.stopPropagation();
                save();
            });

            menu.eq(1).prepend(btn);
        }
    }

    function settings() {
        Lampa.SettingsApi.addComponent({
            component: 'bf',
            name: 'Закладки+',
            icon: 'bookmark'
        });
    }

    function init() {
        if (!cfg().enabled) return;

        setTimeout(addButton, 500);
        render();
        settings();
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') init();
    });

})();
