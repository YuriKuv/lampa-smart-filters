(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let lastSyncTime = 0;
    let syncInProgress = false;
    let pendingSync = false;
    let currentMovieId = null;
    let autoSyncTimer = null;
    let backgroundSyncTimer = null;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
            sync_on_stop: true,
            auto_sync_interval: 60,
            background_sync_interval: 60,
            button_position: 'head',
            cleanup_count: 500
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function notify(text) {
        Lampa.Noty.show(text);
    }

    function formatTime(seconds) {
        if (!seconds || seconds < 0) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    function getCurrentProfileId() {
        const c = cfg();
        if (c.manual_profile_id) return c.manual_profile_id;
        let profileId = Lampa.Storage.get('profile_id', '');
        if (profileId) return profileId;
        const accountUser = Lampa.Storage.get('account_user', {});
        if (accountUser.profile) return String(accountUser.profile);
        return '';
    }

    function getFileViewKey() {
        const profileId = getCurrentProfileId();
        return profileId ? `file_view_${profileId}` : 'file_view';
    }

    function getFileView() {
        return Lampa.Storage.get(getFileViewKey(), {});
    }

    function setFileView(data) {
        const items = [];
        for (const key in data) {
            items.push({ key: key, updated: data[key].updated || 0, data: data[key] });
        }
        items.sort((a, b) => b.updated - a.updated);
        const maxItems = cfg().cleanup_count;
        if (items.length > maxItems) {
            items.length = maxItems;
        }
        const cleaned = {};
        for (const item of items) {
            cleaned[item.key] = item.data;
        }
        Lampa.Storage.set(getFileViewKey(), cleaned, true);
        return cleaned;
    }

    function getCorrectHash(movie) {
        return String(Lampa.Utils.hash(movie.original_title || movie.title || movie.name));
    }

    function getCurrentMovieHash() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                return getCorrectHash(activity.movie);
            }
            return currentMovieId;
        } catch(e) {
            return null;
        }
    }

    function saveCurrentProgress(timeInSeconds) {
        const activity = Lampa.Activity.active();
        if (!activity || !activity.movie) return false;
        
        const movie = activity.movie;
        const hash = getCorrectHash(movie);
        const currentTime = Math.floor(timeInSeconds);
        
        const fileView = getFileView();
        const savedTime = fileView[hash]?.time || 0;
        
        if (Math.abs(currentTime - savedTime) >= 10) {
            const duration = Lampa.Player.playdata()?.timeline?.duration || 0;
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            
            fileView[hash] = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: Date.now(),
                title: movie.title || movie.name,
                id: movie.id
            };
            setFileView(fileView);
            console.log(`[Sync] 💾 Сохранён: ${formatTime(currentTime)} для ${movie.title}`);
            
            if (Lampa.Timeline && Lampa.Timeline.update) {
                Lampa.Timeline.update({ hash: hash, percent: percent, time: currentTime, duration: duration });
            }
            return true;
        }
        return false;
    }

    function getProgressData() {
        return {
            version: 5,
            profile_id: getCurrentProfileId(),
            device: cfg().device_name,
            updated: Date.now(),
            file_view: getFileView()
        };
    }

    function syncToGist(showNotify = true, callback = null) {
        if (syncInProgress) {
            pendingSync = true;
            if (callback) callback(false);
            return;
        }
        
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
        const data = getProgressData();
        const count = Object.keys(data.file_view).length;
        if (count === 0 && showNotify) {
            notify('⚠️ Нет таймкодов для отправки');
            if (callback) callback(false);
            return;
        }
        
        syncInProgress = true;
        console.log(`[Sync] 📤 Отправка ${count} таймкодов...`);
        
        $.ajax({
            url: `https://api.github.com/gists/${c.gist_id}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${c.gist_token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            data: JSON.stringify({
                description: 'Lampa Timeline Sync',
                public: false,
                files: { 'timeline.json': { content: JSON.stringify(data, null, 2) } }
            }),
            success: () => {
                if (showNotify) notify('✅ Таймкоды отправлены');
                console.log(`[Sync] ✅ Отправлено успешно`);
                syncInProgress = false;
                if (pendingSync) {
                    pendingSync = false;
                    setTimeout(() => syncToGist(false, callback), 1000);
                } else if (callback) callback(true);
            },
            error: (xhr) => {
                console.error('[Sync] ❌ Ошибка отправки:', xhr.status);
                if (showNotify) notify(`❌ Ошибка: ${xhr.status}`);
                syncInProgress = false;
                if (callback) callback(false);
            }
        });
    }

    function syncFromGist(showNotify = true, callback = null) {
        if (syncInProgress) {
            if (callback) callback(false);
            return;
        }
        
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
        syncInProgress = true;
        console.log(`[Sync] 📥 Загрузка с Gist...`);
        
        $.ajax({
            url: `https://api.github.com/gists/${c.gist_id}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${c.gist_token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: (data) => {
                try {
                    const content = data.files['timeline.json']?.content;
                    if (content) {
                        const remote = JSON.parse(content);
                        const remoteData = remote.file_view || {};
                        const localData = getFileView();
                        
                        let changed = false;
                        for (const key in remoteData) {
                            if (!localData[key] || remoteData[key].updated > localData[key].updated) {
                                localData[key] = remoteData[key];
                                changed = true;
                                console.log(`[Sync] 🔄 Обновлён: ${key}`);
                            }
                        }
                        
                        if (changed) {
                            setFileView(localData);
                            if (Lampa.Timeline && Lampa.Timeline.read) Lampa.Timeline.read(true);
                            if (Lampa.Layer && Lampa.Layer.update) Lampa.Layer.update();
                            if (showNotify) notify(`📥 Загружено ${Object.keys(remoteData).length} таймкодов`);
                        } else if (showNotify) {
                            notify('✅ Данные актуальны');
                        }
                        if (callback) callback(true);
                    } else {
                        if (showNotify) notify('❌ Нет данных');
                        if (callback) callback(false);
                    }
                } catch(e) { 
                    console.error(e);
                    if (callback) callback(false);
                }
            },
            error: (xhr) => {
                console.error('[Sync] ❌ Ошибка загрузки:', xhr.status);
                if (showNotify) notify(`❌ Ошибка: ${xhr.status}`);
                if (callback) callback(false);
            },
            complete: () => {
                syncInProgress = false;
            }
        });
    }

    function fullSync() {
        notify('🔄 Синхронизация...');
        if (Lampa.Player.opened()) {
            const time = Lampa.Player.playdata()?.timeline?.time;
            if (time > 0) saveCurrentProgress(time);
        }
        syncToGist(true, () => {
            setTimeout(() => syncFromGist(true), 500);
        });
    }

    function addButton() {
        $('.tl-sync-button, .tl-sync-menu-item').remove();
        
        const svgIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" fill="currentColor"/></svg>';
        
        if (cfg().button_position === 'head') {
            const btn = $('<div class="tl-sync-button selector head__action" style="display: flex; align-items: center; justify-content: center;">' + svgIcon + '</div>');
            btn.on('hover:enter', fullSync).on('click', fullSync);
            const actions = $('.head__actions');
            if (actions.length) actions.prepend(btn);
            else $('.head__body').append(btn);
        } else {
            const menu = $('.menu__list:eq(0)');
            if (menu.length) {
                const item = $('<li class="menu__item selector tl-sync-menu-item"><div class="menu__ico">' + svgIcon + '</div><div class="menu__text">Синхр.</div></li>');
                item.on('hover:enter', fullSync);
                menu.prepend(item);
            }
        }
    }

    function startAutoSync() {
        if (autoSyncTimer) clearInterval(autoSyncTimer);
        const interval = cfg().auto_sync_interval;
        if (interval > 0) {
            autoSyncTimer = setInterval(() => {
                if (cfg().enabled && Lampa.Player.opened()) {
                    const time = Lampa.Player.playdata()?.timeline?.time;
                    if (time > 0) {
                        saveCurrentProgress(time);
                        syncToGist(false);
                    }
                }
            }, interval * 1000);
            console.log(`[Sync] Автоотправка запущена (${interval} сек)`);
        }
    }

    function startBackgroundSync() {
        if (backgroundSyncTimer) clearInterval(backgroundSyncTimer);
        const interval = cfg().background_sync_interval;
        if (interval > 0) {
            backgroundSyncTimer = setInterval(() => {
                if (cfg().enabled && !syncInProgress) syncFromGist(false);
            }, interval * 1000);
            console.log(`[Sync] Фоновая загрузка запущена (${interval} сек)`);
        }
    }

    function initPlayerHandler() {
        let currentTime = 0;
        
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'open' && e.movie) {
                currentMovieId = getCorrectHash(e.movie);
                console.log(`[Sync] 🎬 Открыт: ${e.movie.title}`);
                setTimeout(() => syncFromGist(false), 2000);
            }
            if (e.type === 'timeupdate' && e.time) currentTime = e.time;
            if (e.type === 'stop' || e.type === 'pause') {
                if (currentTime > 0) saveCurrentProgress(currentTime);
                if (cfg().sync_on_stop) syncToGist(false);
            }
        });
        
        setInterval(() => {
            if (currentTime > 0 && Lampa.Player.opened()) saveCurrentProgress(currentTime);
        }, 10000);
    }

    function showGistSetup() {
        const c = cfg();
        const intervalOptions = [
            { title: 'Выключено', value: 0 },
            { title: '15 секунд', value: 15 },
            { title: '30 секунд', value: 30 },
            { title: '1 минута', value: 60 },
            { title: '2 минуты', value: 120 },
            { title: '5 минут', value: 300 }
        ];
        
        Lampa.Select.show({
            title: 'Синхронизация таймкодов',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓' : '❌'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0,8)+'…' : '❌'}`, action: 'id' },
                { title: `📱 Устройство: ${c.device_name}`, action: 'device' },
                { title: `👤 Профиль: ${c.manual_profile_id || 'авто'}`, action: 'profile' },
                { title: '──────────', separator: true },
                { title: `📍 Кнопка: ${c.button_position === 'head' ? 'Верхняя панель' : 'Левое меню'}`, action: 'position' },
                { title: `📦 Лимит записей: ${c.cleanup_count}`, action: 'cleanup' },
                { title: `⏱ Отправка: ${intervalOptions.find(o => o.value === c.auto_sync_interval)?.title || '1 минута'}`, action: 'auto_sync' },
                { title: `📥 Загрузка: ${intervalOptions.find(o => o.value === c.background_sync_interval)?.title || '1 минута'}`, action: 'bg_sync' },
                { title: '──────────', separator: true },
                { title: '🔄 Синхронизировать сейчас', action: 'force' },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: (item) => {
                if (item.action === 'token') {
                    Lampa.Input.edit({ title: 'GitHub Token', value: c.gist_token, free: true }, (val) => {
                        if (val !== null) { c.gist_token = val || ''; saveCfg(c); notify('Токен сохранён'); }
                        showGistSetup();
                    });
                } else if (item.action === 'id') {
                    Lampa.Input.edit({ title: 'Gist ID', value: c.gist_id, free: true }, (val) => {
                        if (val !== null) { c.gist_id = val || ''; saveCfg(c); notify('Gist ID сохранён'); }
                        showGistSetup();
                    });
                } else if (item.action === 'device') {
                    Lampa.Input.edit({ title: 'Имя устройства', value: c.device_name, free: true }, (val) => {
                        if (val !== null && val.trim()) { c.device_name = val.trim(); saveCfg(c); notify('Имя сохранено'); }
                        showGistSetup();
                    });
                } else if (item.action === 'profile') {
                    Lampa.Input.edit({ title: 'ID профиля (пусто = авто)', value: c.manual_profile_id, free: true }, (val) => {
                        if (val !== null) { c.manual_profile_id = val || ''; saveCfg(c); notify('Профиль сохранён'); }
                        showGistSetup();
                    });
                } else if (item.action === 'position') {
                    c.button_position = c.button_position === 'head' ? 'menu' : 'head';
                    saveCfg(c);
                    addButton();
                    notify('Кнопка перемещена');
                    showGistSetup();
                } else if (item.action === 'cleanup') {
                    Lampa.Input.edit({ title: 'Максимум записей (100-2000)', value: String(c.cleanup_count), free: true, nomic: true }, (val) => {
                        const num = parseInt(val);
                        if (!isNaN(num) && num >= 100 && num <= 2000) {
                            c.cleanup_count = num;
                            saveCfg(c);
                            setFileView(getFileView());
                            notify('Лимит записей: ' + num);
                        } else {
                            notify('Введите число от 100 до 2000');
                        }
                        showGistSetup();
                    });
                } else if (item.action === 'auto_sync') {
                    Lampa.Select.show({
                        title: 'Интервал отправки',
                        items: intervalOptions.map(opt => ({ title: opt.title, value: opt.value, selected: c.auto_sync_interval === opt.value })),
                        onSelect: (opt) => {
                            c.auto_sync_interval = opt.value;
                            saveCfg(c);
                            startAutoSync();
                            notify(`Отправка: ${opt.title}`);
                            showGistSetup();
                        },
                        onBack: () => showGistSetup()
                    });
                } else if (item.action === 'bg_sync') {
                    Lampa.Select.show({
                        title: 'Интервал загрузки',
                        items: intervalOptions.map(opt => ({ title: opt.title, value: opt.value, selected: c.background_sync_interval === opt.value })),
                        onSelect: (opt) => {
                            c.background_sync_interval = opt.value;
                            saveCfg(c);
                            startBackgroundSync();
                            notify(`Загрузка: ${opt.title}`);
                            showGistSetup();
                        },
                        onBack: () => showGistSetup()
                    });
                } else if (item.action === 'force') {
                    fullSync();
                    setTimeout(() => showGistSetup(), 2000);
                } else {
                    Lampa.Controller.toggle('settings_component');
                }
            },
            onBack: () => {
                Lampa.Controller.toggle('settings_component');
            }
        });
    }

    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'timeline_sync',
            name: 'Синхронизация таймкодов',
            icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/></svg>'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'gist_setup', type: 'button' },
            field: { name: '⚙️ Настройки Gist' },
            onChange: () => showGistSetup()
        });
        
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'sync_enabled', type: 'toggle', default: true },
            field: { name: 'Включить синхронизацию' },
            onChange: (v) => { 
                const c = cfg(); 
                c.enabled = v; 
                saveCfg(c); 
            }
        });
        
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'sync_on_stop', type: 'toggle', default: true },
            field: { name: 'Синхронизировать при остановке' },
            onChange: (v) => { 
                const c = cfg(); 
                c.sync_on_stop = v; 
                saveCfg(c); 
            }
        });
    }

    function init() {
        if (!cfg().enabled) return;
        
        console.log(`[Sync] Инициализация. Профиль: ${getCurrentProfileId() || 'глобальный'}`);
        
        addButton();
        initPlayerHandler();
        addSettings();
        startAutoSync();
        startBackgroundSync();
        
        setTimeout(() => {
            syncFromGist(false);
        }, 3000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') init(); });
})();
