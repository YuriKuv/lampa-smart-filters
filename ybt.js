(function () {
    'use strict';

    console.log('[SaveFilter FIX] старт');

    const KEY = 'saved_filters_list';
    let lock = false;

    function msg(text) {
        try {
            Lampa.Noty.show(text);
        } catch (e) {
            console.log(text);
        }
    }

    function safeUnlock() {
        setTimeout(() => {
            lock = false;
            try {
                Lampa.Controller.toggle('content');
            } catch (e) {}
        }, 300);
    }

    function getActivity() {
        try {
            return Lampa.Activity.active();
        } catch (e) {
            return null;
        }
    }

    function normalize(activity) {
        if (!activity) return '';

        if (activity.url?.includes('discover'))
            return activity.url;

        if (activity.genres)
            return `discover/${activity.url || 'movie'}?with_genres=${activity.genres}`;

        if (activity.sort)
            return `discover/${activity.url || 'movie'}?sort_by=${activity.sort}`;

        return activity.url || '';
    }

    function save() {
        if (lock) return;
        lock = true;

        const act = getActivity();

        if (!act) {
            msg('Ошибка: нет активности');
            return safeUnlock();
        }

        Lampa.Input.edit({
            title: 'Название закладки',
            value: act.title || 'Закладка',
            free: true,
            nosave: true
        }, (value) => {
            try {
                if (!value) return safeUnlock();

                const list = Lampa.Storage.get(KEY, []);

                const item = {
                    id: Date.now(),
                    name: value.trim(),
                    url: normalize(act),
                    component: act.component || 'category',
                    source: act.source || 'tmdb',
                    genres: act.genres,
                    sort: act.sort
                };

                list.push(item);
                Lampa.Storage.set(KEY, list);

                render();

                msg('Сохранено');
            } catch (e) {
                console.error(e);
                msg('Ошибка сохранения');
            }

            safeUnlock();
        }, () => {
            safeUnlock();
        });
    }

    function open(item) {
        try {
            Lampa.Activity.push({
                url: item.url,
                title: item.name,
                component: item.component,
                source: item.source,
                genres: item.genres,
                sort: item.sort
            });
        } catch (e) {
            msg('Ошибка открытия');
        }
    }

    function remove(id) {
        const list = Lampa.Storage.get(KEY, []);
        const updated = list.filter(i => i.id !== id);

        Lampa.Storage.set(KEY, updated);
        render();
        msg('Удалено');
    }

    function render() {
        $('.my-bookmark').remove();

        const list = Lampa.Storage.get(KEY, []);
        const root = $('.menu .menu__list').eq(0);

        if (!root.length) return;

        list.forEach(item => {
            const el = $(`
                <li class="menu__item selector my-bookmark">
                    <div class="menu__text">${item.name}</div>
                </li>
            `);

            el.on('hover:enter', () => open(item));
            el.on('hover:long', () => remove(item.id));

            root.append(el);
        });
    }

    function addButton() {
        if ($('[data-save-filter]').length) return;

        const btn = $(`
            <li class="menu__item selector" data-save-filter>
                <div class="menu__text">⭐ Сохранить</div>
            </li>
        `);

        btn.on('hover:enter', save);

        $('.menu .menu__list').eq(1).prepend(btn);
    }

    function init() {
        console.log('[SaveFilter FIX] init');

        addButton();
        render();
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') init();
        });
    }

})();
