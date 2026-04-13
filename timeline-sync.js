(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let syncInProgress = false;
    let autoSyncTimer = null;
    let backgroundSyncTimer = null;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
            auto_sync_interval: 60,
            background_sync_interval: 60,
            button_position: 'head', // 'head' или 'menu'
            max_items: 500           // максимум таймкодов в хранилище
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function notify(text) {
        Lampa.Noty.show(text);
    }

    function formatTimeShort(seconds) {
        if (!seconds || seconds < 0) return '0 мин';
        var minutes = Math.floor(seconds / 60);
        if (minutes < 1) return '< 1 мин';
        return minutes + ' мин';
    }

    function getCurrentProfileId() {
        var c = cfg();
        if (c.manual_profile_id) return c.manual_profile_id;
        var profileId = Lampa.Storage.get('profile_id', '');
        if (profileId) return profileId;
        var accountUser = Lampa.Storage.get('account_user', {});
        if (accountUser.profile) return String(accountUser.profile);
        return '';
    }

    function getFileViewKey() {
        var profileId = getCurrentProfileId();
        return profileId ? 'file_view_' + profileId : 'file_view';
    }

    function getFileView() {
        return Lampa.Storage.get(getFileViewKey(), {});
    }

    function setFileView(data) {
        Lampa.Storage.set(getFileViewKey(), data, true);
        return data;
    }

    function getCorrectHash(movie) {
        return String(Lampa.Utils.hash(movie.original_title || movie.title || movie.name));
    }

    // Очистка старых таймкодов (оставляем максимум max_items самых свежих)
    function cleanOldTimecodes(data) {
        var maxItems = cfg().max_items;
        var items = [];
        
        for (var key in data) {
            items.push({
                key: key,
                updated: data[key].updated || 0,
                data: data[key]
            });
        }
        
        if (items.length <= maxItems) return data;
        
        // Сортируем по дате обновления (сначала новые)
        items.sort(function(a, b) { return b.updated - a.updated; });
        
        // Оставляем только maxItems
        var keepItems = items.slice(0, maxItems);
        var result = {};
        for (var i = 0; i < keepItems.length; i++) {
            result[keepItems[i].key] = keepItems[i].data;
        }
        
        console.log('[Sync] Очистка: было', items.length, 'стало', keepItems.length);
        return result;
    }

    // Объединение данных: берём по дате последнего обновления
    function mergeData(local, remote) {
        var result = {};
        
        // Копируем всё
        for (var key in local) { result[key] = local[key]; }
        for (var key in remote) { result[key] = remote[key]; }
        
        // При конфликте берём тот, у кого updated больше
        for (var key in remote) {
            if (local[key] && remote[key]) {
                if (remote[key].updated > local[key].updated) {
                    result[key] = remote[key];
                    console.log('[Sync] Обновлён (дата):', key);
                }
            }
        }
        
        return cleanOldTimecodes(result);
    }

    function getCurrentMovie() {
        try {
            var activity = Lampa.Activity.active();
            if (activity && activity.movie) return activity.movie;
        } catch(e) {}
        return null;
    }

    function getCurrentPlayTime() {
        try {
            var player = Lampa.Player.playdata();
            if (player && player.timeline && player.timeline.time) {
                return player.timeline.time;
            }
        } catch(e) {}
        return 0;
    }

    function saveCurrentProgress() {
        var movie = getCurrentMovie();
        if (!movie) return false;
        
        var currentTime = getCurrentPlayTime();
        if (currentTime === 0) return false;
        
        var player = Lampa.Player.playdata();
        var duration = player?.timeline?.duration || 0;
        var percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
        var hash = getCorrectHash(movie);
        
        var fileView = getFileView();
        fileView[hash] = {
            time: Math.floor(currentTime),
            percent: percent,
            duration: duration,
            updated: Date.now(),
            title: movie.title || movie.name,
            id: movie.id
        };
        
        setFileView(fileView);
        console.log('[Sync] 💾 Сохранён:', formatTimeShort(currentTime), 'для', movie.title);
        return true;
    }

    // Загрузить с Gist и объединить
    function loadFromGist(callback) {
        var c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (callback) callback(false);
            return;
        }
        
        $.ajax({
            url: 'https://api.github.com/gists/' + c.gist_id,
            headers: { 'Authorization': 'token ' + c.gist_token },
            success: function(data) {
                try {
                    var content = data.files['timeline.json']?.content;
                    if (content) {
                        var remote = JSON.parse(content);
                        var remoteData = remote.file_view || {};
                        var localData = getFileView();
                        var merged = mergeData(localData, remoteData);
                        
                        setFileView(merged);
                        console.log('[Sync] 📥 Загружено с Gist:', Object.keys(remoteData).length, 'таймкодов');
                        
                        // Обновляем UI
                        if (Lampa.Timeline && Lampa.Timeline.read) Lampa.Timeline.read(true);
                        if (Lampa.Layer && Lampa.Layer.update) Lampa.Layer.update();
                        
                        if (callback) callback(true);
                    } else {
                        if (callback) callback(false);
                    }
                } catch(e) {
                    console.error(e);
                    if (callback) callback(false);
                }
            },
            error: function() {
                if (callback) callback(false);
            }
        });
    }

    // Отправить на Gist
    function sendToGist(showNotify, callback) {
        var c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
        // Очищаем перед отправкой
        var cleanedData = cleanOldTimecodes(getFileView());
        setFileView(cleanedData);
        
        var data = {
            version: 5,
            profile_id: getCurrentProfileId(),
            device: c.device_name,
            updated: Date.now(),
            file_view: cleanedData
        };
        
        var count = Object.keys(data.file_view).length;
        syncInProgress = true;
        
        $.ajax({
            url: 'https://api.github.com/gists/' + c.gist_id,
            method: 'PATCH',
            headers: {
                'Authorization': 'token ' + c.gist_token,
                'Accept': 'application/vnd.github.v3+json'
            },
            data: JSON.stringify({
                description: 'Lampa Timeline Sync',
                public: false,
                files: { 'timeline.json': { content: JSON.stringify(data, null, 2) } }
            }),
            success: function() {
                if (showNotify) notify('✅ Отправлено ' + count + ' таймкодов');
                console.log('[Sync] 📤 Отправлено', count, 'таймкодов');
                syncInProgress = false;
                if (callback) callback(true);
            },
            error: function(xhr) {
                if (showNotify) notify('❌ Ошибка: ' + xhr.status);
                console.error('[Sync] Ошибка отправки:', xhr.status);
                syncInProgress = false;
                if (callback) callback(false);
            }
        });
    }

    // Полная синхронизация
    function fullSync() {
        if (syncInProgress) {
            notify('⏳ Синхронизация уже выполняется');
            return;
        }
        
        notify('🔄 Синхронизация...');
        
        loadFromGist(function() {
            saveCurrentProgress();
            setTimeout(function() {
                sendToGist(true, function() {
                    setTimeout(function() {
                        loadFromGist(function() {
                            notify('✅ Синхронизация завершена');
                        });
                    }, 500);
                });
            }, 500);
        });
    }

    // Автоотправка по таймеру
    function autoSyncTask() {
        if (!cfg().enabled) return;
        if (!Lampa.Player.opened()) return;
        if (getCurrentPlayTime() === 0) return;
        
        console.log('[Sync] ⏰ Автоотправка');
        saveCurrentProgress();
        sendToGist(false);
    }

    // Фоновая загрузка
    function backgroundSyncTask() {
        if (!cfg().enabled) return;
        if (syncInProgress) return;
        console.log('[Sync] 🔄 Фоновая загрузка');
        loadFromGist();
    }

    function startAutoSync() {
        if (autoSyncTimer) clearInterval(autoSyncTimer);
        var interval = cfg().auto_sync_interval;
        if (interval > 0) {
            autoSyncTimer = setInterval(autoSyncTask, interval * 1000);
            console.log('[Sync] Автоотправка запущена (', interval, 'сек)');
        }
    }

    function startBackgroundSync() {
        if (backgroundSyncTimer) clearInterval(backgroundSyncTimer);
        var interval = cfg().background_sync_interval;
        if (interval > 0) {
            backgroundSyncTimer = setInterval(backgroundSyncTask, interval * 1000);
            console.log('[Sync] Фоновая загрузка запущена (', interval, 'сек)');
        }
    }

    function addButton() {
        $('.tl-sync-button, .tl-sync-menu-item').remove();
        
        var svgIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" fill="currentColor"/></svg>';
        
        if (cfg().button_position === 'head') {
            var syncButton = $('<div class="tl-sync-button selector head__action" style="display: flex; align-items: center; justify-content: center;">' + svgIcon + '</div>');
            syncButton.on('hover:enter', fullSync);
            syncButton.on('click', fullSync);
            var headActions = $('.head__actions');
            if (headActions.length) headActions.prepend(syncButton);
            else $('.head__body').append(syncButton);
        } else {
            var menuList = $('.menu__list:eq(0)');
            if (menuList.length) {
                var menuItem = $('<li class="menu__item selector tl-sync-menu-item"><div class="menu__ico">' + svgIcon + '</div><div class="menu__text">Синхр.</div></li>');
                menuItem.on('hover:enter', fullSync);
                menuList.prepend(menuItem);
            }
        }
    }

    function init() {
        if (!cfg().enabled) return;
        console.log('[Sync] Инициализация');
        
        // Нормализация существующих данных
        var current = getFileView();
        var cleaned = cleanOldTimecodes(current);
        if (JSON.stringify(current) !== JSON.stringify(cleaned)) setFileView(cleaned);
        
        addButton();
        startAutoSync();
        startBackgroundSync();
        
        // События плеера
        Lampa.Listener.follow('player', function(e) {
            if (e.type === 'pause' || e.type === 'stop') {
                if (Lampa.Player.opened()) {
                    saveCurrentProgress();
                    sendToGist(false);
                }
            }
        });
        
        // Первая загрузка
        setTimeout(function() { loadFromGist(); }, 3000);
    }

    // Настройки
    Lampa.SettingsApi.addComponent({
        component: 'timeline_sync',
        name: 'Синхронизация таймкодов',
        icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/></svg>'
    });
    
    Lampa.SettingsApi.addParam({
        component: 'timeline_sync',
        param: { name: 'gist_setup', type: 'button' },
        field: { name: '⚙️ Настройки Gist' },
        onChange: function() {
            var c = cfg();
            var intervalOptions = [
                { title: 'Выключено', value: 0 },
                { title: '15 секунд', value: 15 },
                { title: '30 секунд', value: 30 },
                { title: '1 минута', value: 60 },
                { title: '2 минуты', value: 120 },
                { title: '5 минут', value: 300 },
                { title: '10 минут', value: 600 }
            ];
            
            var limitOptions = [
                { title: '100 записей', value: 100 },
                { title: '200 записей', value: 200 },
                { title: '300 записей', value: 300 },
                { title: '500 записей', value: 500 },
                { title: '1000 записей', value: 1000 }
            ];
            
            Lampa.Select.show({
                title: 'Синхронизация таймкодов',
                items: [
                    { title: '🔑 Токен: ' + (c.gist_token ? '✓' : '❌'), action: 'token' },
                    { title: '📄 Gist ID: ' + (c.gist_id ? c.gist_id.substring(0,8) + '…' : '❌'), action: 'id' },
                    { title: '📱 Устройство: ' + c.device_name, action: 'device' },
                    { title: '👤 Профиль: ' + (c.manual_profile_id || 'авто'), action: 'profile' },
                    { title: '──────────', separator: true },
                    { title: '📍 Кнопка: ' + (c.button_position === 'head' ? 'Верхняя панель' : 'Левое меню'), action: 'position' },
                    { title: '📦 Лимит записей: ' + c.max_items, action: 'limit' },
                    { title: '⏱ Отправка: ' + (intervalOptions.find(o => o.value === c.auto_sync_interval)?.title || '1 минута'), action: 'auto_sync' },
                    { title: '📥 Загрузка: ' + (intervalOptions.find(o => o.value === c.background_sync_interval)?.title || '1 минута'), action: 'bg_sync' },
                    { title: '──────────', separator: true },
                    { title: '🔄 Синхронизировать сейчас', action: 'force' },
                    { title: '❌ Отмена', action: 'cancel' }
                ],
                onSelect: function(item) {
                    if (item.action === 'token') {
                        Lampa.Input.edit({ title: 'GitHub Token', value: c.gist_token, free: true }, function(val) {
                            if (val !== null) { c.gist_token = val || ''; saveCfg(c); notify('Токен сохранён'); }
                            Lampa.Controller.toggle('settings_component');
                        });
                    } else if (item.action === 'id') {
                        Lampa.Input.edit({ title: 'Gist ID', value: c.gist_id, free: true }, function(val) {
                            if (val !== null) { c.gist_id = val || ''; saveCfg(c); notify('Gist ID сохранён'); }
                            Lampa.Controller.toggle('settings_component');
                        });
                    } else if (item.action === 'device') {
                        Lampa.Input.edit({ title: 'Имя устройства', value: c.device_name, free: true }, function(val) {
                            if (val !== null && val.trim()) { c.device_name = val.trim(); saveCfg(c); notify('Имя сохранено'); }
                            Lampa.Controller.toggle('settings_component');
                        });
                    } else if (item.action === 'profile') {
                        Lampa.Input.edit({ title: 'ID профиля', value: c.manual_profile_id, free: true }, function(val) {
                            if (val !== null) { c.manual_profile_id = val || ''; saveCfg(c); notify('Профиль сохранён'); }
                            Lampa.Controller.toggle('settings_component');
                        });
                    } else if (item.action === 'position') {
                        c.button_position = c.button_position === 'head' ? 'menu' : 'head';
                        saveCfg(c);
                        addButton();
                        notify('Кнопка перемещена');
                        Lampa.Controller.toggle('settings_component');
                    } else if (item.action === 'limit') {
                        Lampa.Select.show({
                            title: 'Максимум таймкодов',
                            items: limitOptions.map(function(opt) {
                                return { title: opt.title, value: opt.value, selected: c.max_items === opt.value };
                            }),
                            onSelect: function(opt) {
                                c.max_items = opt.value;
                                saveCfg(c);
                                notify('Лимит: ' + opt.title);
                                Lampa.Controller.toggle('settings_component');
                            },
                            onBack: function() { Lampa.Controller.toggle('settings_component'); }
                        });
                    } else if (item.action === 'auto_sync') {
                        Lampa.Select.show({
                            title: 'Интервал отправки',
                            items: intervalOptions.map(function(opt) {
                                return { title: opt.title, value: opt.value, selected: c.auto_sync_interval === opt.value };
                            }),
                            onSelect: function(opt) {
                                c.auto_sync_interval = opt.value;
                                saveCfg(c);
                                startAutoSync();
                                notify('Отправка: ' + opt.title);
                                Lampa.Controller.toggle('settings_component');
                            },
                            onBack: function() { Lampa.Controller.toggle('settings_component'); }
                        });
                    } else if (item.action === 'bg_sync') {
                        Lampa.Select.show({
                            title: 'Интервал загрузки',
                            items: intervalOptions.map(function(opt) {
                                return { title: opt.title, value: opt.value, selected: c.background_sync_interval === opt.value };
                            }),
                            onSelect: function(opt) {
                                c.background_sync_interval = opt.value;
                                saveCfg(c);
                                startBackgroundSync();
                                notify('Загрузка: ' + opt.title);
                                Lampa.Controller.toggle('settings_component');
                            },
                            onBack: function() { Lampa.Controller.toggle('settings_component'); }
                        });
                    } else if (item.action === 'force') {
                        fullSync();
                        setTimeout(function() { Lampa.Controller.toggle('settings_component'); }, 2000);
                    } else {
                        Lampa.Controller.toggle('settings_component');
                    }
                },
                onBack: function() { Lampa.Controller.toggle('settings_component'); }
            });
        }
    });
    
    Lampa.SettingsApi.addParam({
        component: 'timeline_sync',
        param: { name: 'sync_enabled', type: 'toggle', default: true },
        field: { name: 'Включить синхронизацию' },
        onChange: function(v) { var c = cfg(); c.enabled = v; saveCfg(c); if (v) init(); }
    });

    if (window.appready) init();
    else Lampa.Listener.follow('app', function(e) { if (e.type === 'ready') init(); });
})();
