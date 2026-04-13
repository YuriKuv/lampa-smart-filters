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
            button_position: 'head',
            cleanup_type: 'count',
            cleanup_count: 500,
            cleanup_days: 30
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

    function cleanOldTimecodes(data) {
        var c = cfg();
        var items = [];
        var now = Date.now();
        
        for (var key in data) {
            items.push({
                key: key,
                updated: data[key].updated || 0,
                data: data[key]
            });
        }
        
        if (items.length === 0) return data;
        
        items.sort(function(a, b) { return b.updated - a.updated; });
        
        if (c.cleanup_type === 'days' && c.cleanup_days > 0) {
            var cutoffTime = now - (c.cleanup_days * 24 * 60 * 60 * 1000);
            items = items.filter(function(item) { return item.updated > cutoffTime; });
        }
        
        var maxItems = c.cleanup_count;
        if (maxItems > 0 && items.length > maxItems) {
            items = items.slice(0, maxItems);
        }
        
        var result = {};
        for (var i = 0; i < items.length; i++) {
            result[items[i].key] = items[i].data;
        }
        return result;
    }

    function mergeData(local, remote) {
        var result = {};
        for (var key in local) { result[key] = local[key]; }
        for (var key in remote) { result[key] = remote[key]; }
        for (var key in remote) {
            if (local[key] && remote[key] && remote[key].updated > local[key].updated) {
                result[key] = remote[key];
                console.log('[Sync] Обновлён (дата):', key);
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

    function sendToGist(showNotify, callback) {
        var c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
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

    function autoSyncTask() {
        if (!cfg().enabled) return;
        if (!Lampa.Player.opened()) return;
        if (getCurrentPlayTime() === 0) return;
        console.log('[Sync] ⏰ Автоотправка');
        saveCurrentProgress();
        sendToGist(false);
    }

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

    function showSettings() {
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
        
        Lampa.Select.show({
            title: 'Синхронизация таймкодов',
            items: [
                { title: '🔑 Токен: ' + (c.gist_token ? '✓' : '❌'), action: 'token' },
                { title: '📄 Gist ID: ' + (c.gist_id ? c.gist_id.substring(0,8) + '…' : '❌'), action: 'id' },
                { title: '📱 Устройство: ' + c.device_name, action: 'device' },
                { title: '👤 Профиль: ' + (c.manual_profile_id || 'авто'), action: 'profile' },
                { title: '──────────', separator: true },
                { title: '📍 Кнопка: ' + (c.button_position === 'head' ? 'Верхняя панель' : 'Левое меню'), action: 'position' },
                { title: '──────────', separator: true },
                { title: '🧹 Очистка: ' + (c.cleanup_type === 'count' ? 'По количеству' : 'По времени'), action: 'cleanup_type' },
                { title: '   📦 Лимит записей: ' + c.cleanup_count, action: 'cleanup_count' },
                { title: '   📅 Старше дней: ' + c.cleanup_days, action: 'cleanup_days' },
                { title: '──────────', separator: true },
                { title: '⏱ Отправка: ' + (intervalOptions.find(function(o) { return o.value === c.auto_sync_interval; })?.title || '1 минута'), action: 'auto_sync' },
                { title: '📥 Загрузка: ' + (intervalOptions.find(function(o) { return o.value === c.background_sync_interval; })?.title || '1 минута'), action: 'bg_sync' },
                { title: '──────────', separator: true },
                { title: '🔄 Синхронизировать сейчас', action: 'force' },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: function(item) {
                if (item.action === 'token') {
                    Lampa.Input.edit({ title: 'GitHub Token', value: c.gist_token, free: true }, function(val) {
                        if (val !== null) { c.gist_token = val || ''; saveCfg(c); notify('Токен сохранён'); }
                        showSettings();
                    });
                } else if (item.action === 'id') {
                    Lampa.Input.edit({ title: 'Gist ID', value: c.gist_id, free: true }, function(val) {
                        if (val !== null) { c.gist_id = val || ''; saveCfg(c); notify('Gist ID сохранён'); }
                        showSettings();
                    });
                } else if (item.action === 'device') {
                    Lampa.Input.edit({ title: 'Имя устройства', value: c.device_name, free: true }, function(val) {
                        if (val !== null && val.trim()) { c.device_name = val.trim(); saveCfg(c); notify('Имя сохранено'); }
                        showSettings();
                    });
                } else if (item.action === 'profile') {
                    Lampa.Input.edit({ title: 'ID профиля (0 = авто)', value: c.manual_profile_id, free: true }, function(val) {
                        if (val !== null) { c.manual_profile_id = val || ''; saveCfg(c); notify('Профиль сохранён'); }
                        showSettings();
                    });
                } else if (item.action === 'position') {
                    c.button_position = c.button_position === 'head' ? 'menu' : 'head';
                    saveCfg(c);
                    addButton();
                    notify('Кнопка перемещена');
                    showSettings();
                } else if (item.action === 'cleanup_type') {
                    Lampa.Select.show({
                        title: 'Тип очистки',
                        items: [
                            { title: 'По количеству записей', value: 'count', selected: c.cleanup_type === 'count' },
                            { title: 'По времени (дни)', value: 'days', selected: c.cleanup_type === 'days' }
                        ],
                        onSelect: function(opt) {
                            c.cleanup_type = opt.value;
                            saveCfg(c);
                            notify('Тип очистки: ' + (opt.value === 'count' ? 'По количеству' : 'По времени'));
                            showSettings();
                        },
                        onBack: function() { showSettings(); }
                    });
                } else if (item.action === 'cleanup_count') {
                    Lampa.Input.edit({ title: 'Максимум записей (1-2000)', value: String(c.cleanup_count), free: true, nomic: true }, function(val) {
                        var num = parseInt(val);
                        if (!isNaN(num) && num >= 1 && num <= 2000) {
                            c.cleanup_count = num;
                            saveCfg(c);
                            notify('Лимит записей: ' + num);
                        } else {
                            notify('Введите число от 1 до 2000');
                        }
                        showSettings();
                    });
                } else if (item.action === 'cleanup_days') {
                    Lampa.Input.edit({ title: 'Удалять старше N дней (1-365)', value: String(c.cleanup_days), free: true, nomic: true }, function(val) {
                        var num = parseInt(val);
                        if (!isNaN(num) && num >= 1 && num <= 365) {
                            c.cleanup_days = num;
                            saveCfg(c);
                            notify('Удалять старше ' + num + ' дней');
                        } else {
                            notify('Введите число от 1 до 365');
                        }
                        showSettings();
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
                            showSettings();
                        },
                        onBack: function() { showSettings(); }
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
                            showSettings();
                        },
                        onBack: function() { showSettings(); }
                    });
                } else if (item.action === 'force') {
                    fullSync();
                    setTimeout(function() { showSettings(); }, 2000);
                } else {
                    Lampa.Controller.toggle('settings_component');
                }
            },
            onBack: function() {
                Lampa.Controller.toggle('settings_component');
            }
        });
    }

    function init() {
        if (!cfg().enabled) return;
        console.log('[Sync] Инициализация');
        
        var current = getFileView();
        var cleaned = cleanOldTimecodes(current);
        if (JSON.stringify(current) !== JSON.stringify(cleaned)) setFileView(cleaned);
        
        addButton();
        startAutoSync();
        startBackgroundSync();
        
        Lampa.Listener.follow('player', function(e) {
            if (e.type === 'pause' || e.type === 'stop') {
                if (Lampa.Player.opened()) {
                    saveCurrentProgress();
                    sendToGist(false);
                }
            }
        });
        
        setTimeout(function() { loadFromGist(); }, 3000);
    }

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
            showSettings();
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
