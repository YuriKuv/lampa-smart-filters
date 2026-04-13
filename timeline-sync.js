(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: ''
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
        // Используем тот же метод, что и Lampa для генерации хеша
        return String(Lampa.Utils.hash(movie.original_title || movie.title || movie.name));
    }

    function getCurrentMovie() {
        try {
            var activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                return activity.movie;
            }
        } catch(e) {}
        return null;
    }

    function saveCurrentProgress() {
        var movie = getCurrentMovie();
        if (!movie) {
            notify('❌ Нет активного фильма');
            return false;
        }
        
        var player = Lampa.Player.playdata();
        if (!player || !player.timeline || !player.timeline.time) {
            notify('❌ Нет данных о времени просмотра');
            return false;
        }
        
        var currentTime = Math.floor(player.timeline.time);
        var duration = player.timeline.duration || 0;
        var percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
        var hash = getCorrectHash(movie);
        
        var fileView = getFileView();
        fileView[hash] = {
            time: currentTime,
            percent: percent,
            duration: duration,
            updated: Date.now(),
            title: movie.title || movie.name,
            id: movie.id
        };
        setFileView(fileView);
        
        console.log('💾 Сохранён прогресс:', formatTimeShort(currentTime), '(', percent, '%) для', movie.title);
        return true;
    }

    function syncToGist(showNotify, callback) {
        if (window.syncInProgress) {
            if (callback) callback(false);
            return;
        }
        
        var c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
        var data = {
            version: 5,
            profile_id: getCurrentProfileId(),
            device: c.device_name,
            updated: Date.now(),
            file_view: getFileView()
        };
        
        window.syncInProgress = true;
        console.log('📤 Отправка таймкодов...');
        
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
                if (showNotify) notify('✅ Таймкоды отправлены');
                console.log('✅ Отправлено успешно');
                window.syncInProgress = false;
                if (callback) callback(true);
            },
            error: function(xhr) {
                console.error('❌ Ошибка отправки:', xhr.status);
                if (showNotify) notify('❌ Ошибка: ' + xhr.status);
                window.syncInProgress = false;
                if (callback) callback(false);
            }
        });
    }

    function syncFromGist(showNotify, callback) {
        if (window.syncInProgress) {
            if (callback) callback(false);
            return;
        }
        
        var c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            if (callback) callback(false);
            return;
        }
        
        window.syncInProgress = true;
        console.log('📥 Загрузка с Gist...');
        
        $.ajax({
            url: 'https://api.github.com/gists/' + c.gist_id,
            method: 'GET',
            headers: {
                'Authorization': 'token ' + c.gist_token,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: function(data) {
                try {
                    var content = data.files['timeline.json']?.content;
                    if (content) {
                        var remote = JSON.parse(content);
                        var count = Object.keys(remote.file_view || {}).length;
                        console.log('📥 Загружено', count, 'таймкодов');
                        
                        setFileView(remote.file_view || {});
                        
                        if (Lampa.Timeline && Lampa.Timeline.read) {
                            Lampa.Timeline.read(true);
                        }
                        
                        if (showNotify) notify('📥 Загружено ' + count + ' таймкодов');
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
            error: function(xhr) {
                console.error('❌ Ошибка загрузки:', xhr.status);
                if (showNotify) notify('❌ Ошибка: ' + xhr.status);
                if (callback) callback(false);
            },
            complete: function() {
                window.syncInProgress = false;
            }
        });
    }

    function fullSync() {
        notify('🔄 Синхронизация...');
        saveCurrentProgress();
        syncToGist(true, function() {
            setTimeout(function() {
                syncFromGist(true);
            }, 500);
        });
    }

    function addHeadButton() {
        var svgIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" fill="currentColor"/></svg>';
        
        $('.tl-sync-button').remove();
        var syncButton = $('<div class="tl-sync-button selector head__action" style="display: flex; align-items: center; justify-content: center;">' + svgIcon + '</div>');
        syncButton.on('hover:enter', fullSync);
        syncButton.on('click', fullSync);
        
        var headActions = $('.head__actions');
        if (headActions.length) {
            headActions.prepend(syncButton);
        } else {
            $('.head__body').append(syncButton);
        }
    }

    function init() {
        if (!cfg().enabled) return;
        console.log('[Sync] Инициализация');
        addHeadButton();
        
        // Сохранение прогресса при паузе/остановке
        Lampa.Listener.follow('player', function(e) {
            if (e.type === 'pause' || e.type === 'stop') {
                console.log('[Sync]', e.type === 'stop' ? 'Остановка' : 'Пауза', '- сохраняем');
                saveCurrentProgress();
                syncToGist(false);
            }
        });
        
        // Загружаем таймкоды при старте
        setTimeout(function() {
            syncFromGist(false);
        }, 3000);
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
            Lampa.Select.show({
                title: 'Синхронизация таймкодов',
                items: [
                    { title: '🔑 Токен: ' + (c.gist_token ? '✓' : '❌'), action: 'token' },
                    { title: '📄 Gist ID: ' + (c.gist_id ? c.gist_id.substring(0,8) + '…' : '❌'), action: 'id' },
                    { title: '📱 Устройство: ' + c.device_name, action: 'device' },
                    { title: '👤 Профиль: ' + (c.manual_profile_id || 'авто'), action: 'profile' },
                    { title: '──────────', separator: true },
                    { title: '🔄 Полная синхронизация', action: 'force' },
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
