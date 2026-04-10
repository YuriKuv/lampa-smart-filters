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
            manual_profile_id: '',
            sync_on_stop: true,
            sync_interval: 300
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function notify(text) {
        Lampa.Noty.show(text);
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
        const key = getFileViewKey();
        return Lampa.Storage.get(key, {});
    }

    function setFileView(data) {
        const key = getFileViewKey();
        Lampa.Storage.set(key, data, true);
        return data;
    }

    // Нормализация ключа — используем TMDB ID вместо хеша
    function normalizeKey(hash, item) {
        // Пытаемся извлечь TMDB ID из разных источников
        if (item && item.tmdb_id) return `tmdb_${item.tmdb_id}`;
        if (item && item.id) return `tmdb_${item.id}`;
        
        // Если есть информация о фильме в самом хеше — пробуем извлечь
        const match = hash.match(/(\d+)/);
        if (match) return `tmdb_${match[1]}`;
        
        return hash;
    }

    // Конвертация старого формата в новый
    function convertToStableFormat(oldFileView) {
        const newFileView = {};
        
        for (const hash in oldFileView) {
            const item = oldFileView[hash];
            const stableKey = normalizeKey(hash, item);
            
            if (!newFileView[stableKey] || (item.time || 0) > (newFileView[stableKey]?.time || 0)) {
                newFileView[stableKey] = item;
            }
        }
        
        return newFileView;
    }

    function getProgressData() {
        let fileView = getFileView();
        
        // Конвертируем в стабильный формат, если ещё не сконвертировано
        if (!Lampa.Storage.get('timeline_converted', false)) {
            fileView = convertToStableFormat(fileView);
            setFileView(fileView);
            Lampa.Storage.set('timeline_converted', true);
            console.log('[TimelineSync] Данные сконвертированы в стабильный формат');
        }
        
        return {
            version: 3,
            profile_id: getCurrentProfileId(),
            device: cfg().device_name,
            updated: Date.now(),
            file_view: fileView
        };
    }

    function mergeFileView(local, remote) {
        const result = { ...local };
        
        for (const key in remote) {
            const remoteTime = remote[key]?.time || 0;
            const localTime = local[key]?.time || 0;
            
            if (!local[key]) {
                result[key] = remote[key];
                console.log(`[TimelineSync] Новый таймкод: ${key}`);
            } else if (remoteTime > localTime) {
                result[key] = remote[key];
                console.log(`[TimelineSync] Обновлён ${key}: ${localTime} -> ${remoteTime}`);
            }
        }
        
        return result;
    }

    function applyRemoteData(remote) {
        if (!remote || !remote.file_view) return false;
        
        const localFileView = getFileView();
        const mergedFileView = mergeFileView(localFileView, remote.file_view);
        setFileView(mergedFileView);
        
        console.log(`[TimelineSync] После слияния: ${Object.keys(mergedFileView).length} таймкодов`);
        return true;
    }

    // ========= GITHUB GIST =========

    function syncToGist(showNotify = true) {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ GitHub Gist не настроен');
            return;
        }
        
        const data = getProgressData();
        const count = Object.keys(data.file_view).length;
        
        console.log(`[TimelineSync] Отправка ${count} таймкодов`);
        
        const payload = {
            description: 'Lampa Timeline Sync',
            public: false,
            files: {
                'timeline.json': {
                    content: JSON.stringify(data, null, 2)
                }
            }
        };
        
        $.ajax({
            url: `https://api.github.com/gists/${c.gist_id}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${c.gist_token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            data: JSON.stringify(payload),
            success: function() {
                if (showNotify) notify('✅ Таймкоды синхронизированы');
            },
            error: function(xhr) {
                console.error('[TimelineSync] Error:', xhr);
                if (showNotify) notify('❌ Ошибка синхронизации');
            }
        });
    }

    function syncFromGist(showNotify = true) {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ GitHub Gist не настроен');
            return;
        }
        
        $.ajax({
            url: `https://api.github.com/gists/${c.gist_id}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${c.gist_token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: function(data) {
                try {
                    const content = data.files['timeline.json']?.content;
                    if (!content) return;
                    
                    const remote = JSON.parse(content);
                    applyRemoteData(remote);
                    
                    if (showNotify) {
                        const count = Object.keys(remote.file_view || {}).length;
                        notify(`📥 Загружено ${count} таймкодов`);
                    }
                } catch(e) {
                    console.error('[TimelineSync] Parse error:', e);
                }
            },
            error: function(xhr) {
                console.error('[TimelineSync] Error:', xhr);
                if (showNotify && xhr.status !== 404) {
                    notify('❌ Ошибка загрузки');
                }
            }
        });
    }

    // ========= СОБЫТИЯ =========

    function hookPlayerEvents() {
        let lastSyncTime = 0;
        const minInterval = (cfg().sync_interval || 300) * 1000;
        
        function throttledSync() {
            const now = Date.now();
            if (now - lastSyncTime < minInterval) return;
            lastSyncTime = now;
            syncToGist(false);
        }
        
        Lampa.Listener.follow('player', function(e) {
            if ((e.type === 'stop' || e.type === 'pause') && cfg().sync_on_stop) {
                throttledSync();
            }
        });
    }

    // ========= НАСТРОЙКИ =========

    function showGistSetup() {
        const c = cfg();
        
        Lampa.Select.show({
            title: 'GitHub Gist Синхронизация',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓ Установлен' : '❌ Не установлен'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0, 8) + '…' : '❌ Не установлен'}`, action: 'id' },
                { title: `📱 Устройство: ${c.device_name}`, action: 'device' },
                { title: `👤 ID профиля: ${c.manual_profile_id || 'авто'}`, action: 'profile' },
                { title: '──────────', separator: true },
                { title: '🔄 Принудительная синхронизация', action: 'force' },
                { title: '──────────', separator: true },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: (item) => {
                if (item.action === 'token') {
                    Lampa.Input.edit({
                        title: 'GitHub Token',
                        value: c.gist_token,
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.gist_token = val || '';
                            saveCfg(c);
                            notify('Токен сохранён');
                        }
                        showGistSetup();
                    });
                } else if (item.action === 'id') {
                    Lampa.Input.edit({
                        title: 'Gist ID',
                        value: c.gist_id,
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.gist_id = val || '';
                            saveCfg(c);
                            notify('Gist ID сохранён');
                        }
                        showGistSetup();
                    });
                } else if (item.action === 'device') {
                    Lampa.Input.edit({
                        title: 'Имя устройства',
                        value: c.device_name,
                        free: true
                    }, (val) => {
                        if (val !== null && val.trim()) {
                            c.device_name = val.trim();
                            saveCfg(c);
                            notify('Имя сохранено');
                        }
                        showGistSetup();
                    });
                } else if (item.action === 'profile') {
                    Lampa.Input.edit({
                        title: 'ID профиля',
                        value: c.manual_profile_id || '',
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.manual_profile_id = val || '';
                            saveCfg(c);
                            notify(`Профиль ${c.manual_profile_id || 'авто'} сохранён`);
                        }
                        showGistSetup();
                    });
                } else if (item.action === 'force') {
                    syncToGist(true);
                    setTimeout(() => syncFromGist(true), 1000);
                    setTimeout(() => showGistSetup(), 2000);
                }
            },
            onBack: () => {
                Lampa.Controller.toggle('content');
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
            field: { name: 'GitHub Gist' },
            onChange: () => showGistSetup()
        });

        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'sync_interval', type: 'number', default: 300 },
            field: { name: 'Интервал синхронизации (сек)' },
            onChange: v => {
                const c = cfg();
                c.sync_interval = Math.max(60, v || 300);
                saveCfg(c);
            }
        });
    }

    // ========= ЗАПУСК =========

    function init() {
        if (!cfg().enabled) return;
        
        console.log(`[TimelineSync] Профиль: ${getCurrentProfileId() || 'глобальный'}`);
        
        // При первом запуске конвертируем данные
        const fileView = getFileView();
        if (Object.keys(fileView).length > 0 && !Lampa.Storage.get('timeline_converted', false)) {
            console.log('[TimelineSync] Конвертация данных в стабильный формат...');
            const converted = convertToStableFormat(fileView);
            setFileView(converted);
            Lampa.Storage.set('timeline_converted', true);
        }
        
        hookPlayerEvents();
        addSettings();
        
        setTimeout(() => syncFromGist(false), 5000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());

})();
