(function () {
'use strict';

if (window.bf_init) return;
window.bf_init = true;

const STORE = 'bf_items_v11';
const CFG = 'bf_cfg_v11';

let lock = false;

// ========= SAFE SELECT =========

function openSelect(config) {
    Lampa.Select.close();
    setTimeout(() => {
        Lampa.Select.show(config);
    }, 50);
}

// ========= SVG =========

const ICON_ADD = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>`;
const ICON_FLAG = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/></svg>`;

// ========= CONFIG =========

function cfg() {
    return Lampa.Storage.get(CFG, {
        enabled: true,
        button: 'side',
        sync_method: 'none',
        gist_token: '',
        gist_id: '',
        webdav_enabled: false
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

// ========= LOGIC =========

function isAllowed() {
    const act = Lampa.Activity.active();
    if (!act) return false;

    if (act.component === 'actor' || act.component === 'person') return true;

    if (!act.url) return false;

    if (['movie','tv','anime','catalog'].includes(act.url)) return false;

    if (act.params || act.genres || act.sort) return true;

    if (act.url.includes('discover') && act.url.includes('?')) return true;

    return false;
}

function normalize(a) {
    return {
        id: Date.now(),
        key: makeKey(a),
        name: a.title || a.name || 'Закладка',
        url: a.url,
        component: a.component,
        source: a.source,
        id_person: a.id,
        job: a.job,
        genres: a.genres,
        params: a.params,
        page: a.page || 1
    };
}

// ========= SAVE =========

function save() {
    if (lock) return;
    lock = true;

    const act = Lampa.Activity.active();

    if (!isAllowed()) {
        notify('Нельзя создать');
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

        notify('Сохранено');
        unlock();
    }, unlock);
}

function unlock() {
    setTimeout(() => {
        lock = false;
        Lampa.Controller.toggle('content');
    }, 200);
}

// ========= REMOVE =========

function remove(item) {
    saveList(list().filter(i => i.id !== item.id));
    render();
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

        el.on('hover:enter', () => open(item));

        el.on('hover:long', () => {
            openSelect({
                title: `Удалить "${item.name}"?`,
                items: [
                    { title: 'Нет' },
                    { title: 'Да', action: 'remove' }
                ],
                onSelect: a => {
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

        const btn = $(`<div class="head__action selector" data-bf-save>
            <div class="head__action-ico">${ICON_ADD}</div>
        </div>`);

        btn.on('hover:enter', save);
        head.prepend(btn);
    } else {
        const menu = $('.menu .menu__list');

        const btn = $(`<li class="menu__item selector" data-bf-save>
            <div class="menu__ico">${ICON_ADD}</div>
            <div class="menu__text">Добавить закладку</div>
        </li>`);

        btn.on('hover:enter', save);
        menu.eq(1).prepend(btn);
    }
}

// ========= SYNC MENU =========

function showSync() {
    openSelect({
        title: 'Синхронизация',
        items: [
            { title: 'GitHub Gist', action: 'gist' },
            { title: 'WebDAV (Яндекс)', action: 'webdav' }
        ],
        onSelect: (a) => {
            notify('Настройка: ' + a.title);
        }
    });
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
        param: { name: 'bf_sync_btn', type: 'button' },
        field: { name: '☁️ Синхронизация' },
        onChange: showSync
    });
}

// ========= INIT =========

function init() {
    settings(); // 🔥 важно раньше

    setTimeout(addButton, 500);
    render();
}

if (window.appready) init();
else Lampa.Listener.follow('app', e => e.type === 'ready' && init());

})();
