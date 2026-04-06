(function () {
    'use strict';

    const STORE = 'bf_items_v2';
    const CFG = 'bf_cfg_v2';

    let lock = false;

    const defaults = {
        enabled: true,
        ui: 'simple', // simple | advanced
        sync: 'local', // local | gist | firebase
        button: 'side',
        sort: 'date' // date | name
    };

    // ================= CORE =================

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
        Sync.push(l);
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

    // ================= SAVE =================

    function save() {
        if (lock) return;
        lock = true;

        const act = Lampa.Activity.active();

        if (!act || !act.url || act.url.indexOf('discover') === -1) {
            notify('Недоступно');
            return unlock();
        }

        if (exists(act.url)) {
            notify('Уже есть');
            return unlock();
        }

        Lampa.Input.edit({
            title: 'Название',
            value: act.title
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

    function unlock() {
        setTimeout(() => {
            lock = false;
            Lampa.Controller.toggle('content');
        }, 300);
    }

    // ================= UI SIMPLE =================

    function render() {
        if (cfg().ui !== 'simple') return;

        $('.bf-item').remove();

        const root = $('.menu .menu__list').eq(0);
        const l = sorted(list());

        l.forEach(i => {
            const el = $(`
                <li class="menu__item selector bf-item">
                    <div class="menu__text">${i.name}</div>
                </li>
            `);

            el.on('hover:enter', () => Lampa.Activity.push(i));
            el.on('hover:long', () => removeConfirm(i));

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

        modal.find('.bf-row').on('hover:enter', function () {
            const id = $(this).data('id');
            const item = l.find(x => x.id === id);
            Lampa.Activity.push(item);
        });

        modal.find('.bf-row').on('hover:long', function () {
            const id = $(this).data('id');
            const item = l.find(x => x.id === id);
            removeConfirm(item);
        });

        Lampa.Modal.open({
            title: 'Закладки',
            html: modal
        });
    }

    // ================= REMOVE =================

    function removeConfirm(item) {
        Lampa.Modal.confirm({
            title: 'Удаление',
            text: item.name,
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
            text: 'Все закладки?',
            onConfirm: () => {
                saveList([]);
                render();
                notify('Очищено');
            }
        });
    }

    // ================= BUTTON =================

    function button() {
        if ($('[data-bf]').length) return;

        const btn = $(`
            <li class="menu__item selector" data-bf>
                <div class="menu__text">Закладки</div>
            </li>
        `);

        btn.on('hover:enter', () => {
            if (cfg().ui === 'advanced') openManager();
            else save();
        });

        if (cfg().button === 'top')
            $('.menu .menu__list').eq(0).prepend(btn);
        else
            $('.menu .menu__list').eq(1).prepend(btn);
    }

    // ================= SYNC =================

    const Sync = {
        push(data) {
            const c = cfg();

            if (c.sync === 'gist') {
                console.log('sync gist', data);
                // TODO: fetch POST
            }

            if (c.sync === 'firebase') {
                console.log('sync firebase');
            }
        }
    };

    // ================= SETTINGS =================

    function settings() {
        Lampa.SettingsApi.addComponent({
            component: 'bf',
            name: 'Закладки+',
            icon: 'bookmark'
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            field: { name: 'UI', type: 'select', values: { simple: 'Простой', advanced: 'Расширенный' } },
            onChange: v => { let c = cfg(); c.ui = v; saveCfg(c); location.reload(); }
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            field: { name: 'Синхронизация', type: 'select', values: { local: 'Локально', gist: 'GitHub Gist', firebase: 'Firebase' } },
            onChange: v => { let c = cfg(); c.sync = v; saveCfg(c); }
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            field: { name: 'Сортировка', type: 'select', values: { date: 'По дате', name: 'По имени' } },
            onChange: v => { let c = cfg(); c.sort = v; saveCfg(c); render(); }
        });

        Lampa.SettingsApi.addParam({
            component: 'bf',
            field: { name: 'Очистить', type: 'button' },
            onChange: clearAll
        });
    }

    // ================= INIT =================

    function init() {
        if (!cfg().enabled) return;

        button();
        render();
        settings();
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());

})();
