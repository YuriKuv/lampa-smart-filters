(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const STORAGE_KEYS = {
        FILE_VIEW: 'file_view',
        TIMETABLE: 'timetable',
        PROGRESS: 'progress_data'
    };
    
    const CFG_KEY = 'timeline_sync_cfg';
    const SYNC_LOCK_KEY = 'timeline_sync_locking';
    
    let syncTimer = null;
    let isSyncing = false;

    // ========= CONFIG =========

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            webdav_url: '',
            webdav_login: '',
            webdav_password: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            sync_on_pause: true,
            sync_on_stop: true,
            sync_interval: 300, // секунд (5 минут)
            merge_strategy: 'newest',
            auto_restore: true
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function notify(text) {
        Lampa.Noty.show(text);
    }

    // ========= ОСНОВНЫЕ ФУНКЦИИ =========

    function getFileView() {
        return Lampa.Storage.get(STORAGE_KEYS.FILE_VIEW, {});
    }

    function getTimetable() {
        return Lampa.Storage.get(STORAGE_KEYS.TIMETABLE, []);
    }

    function getProgressData() {
        // Собираем все данные для синхронизации
        return {
            version: 2,
            device: cfg().device_name,
            updated: Date.now(),
            file_view: getFileView(),
            timetable: getTimetable()
        };
    }

    // ========= MERGE STRATEGY =========

    function mergeFileView(local, remote) {
        const strategy = cfg().merge_strategy;
        const result = { ...local };
        
        for (const hash in remote) {
            if (!local[hash]) {
                result[hash] = remote[hash];
                continue;
            }
            
            const localTime = local[hash]?.time || 0;
            const remoteTime = remote[hash]?.time || 0;
            const localUpdated = local[hash]?.updated || 0;
            const remoteUpdated = remote[hash]?.updated || 0;
            
            if (strategy === 'newest') {
                // Выбираем более поздний по времени
                result[hash] = remoteUpdated > localUpdated ? remote[hash] : local[hash];
            } else if (strategy === 'further') {
                // Выбираем тот, где дальше прогресс
                result[hash] = remoteTime > localTime ? remote[hash] : local[hash];
            } else if (strategy === 'remote') {
                result[hash] = remote[hash];
            } else {
                result[hash] = local[hash];
            }
        }
        
        return result;
    }

    function mergeTimetable(local, remote) {
        const result = [...local];
        const localIds = new Set(local.map(item => item.id));
        
        for (const item of remote) {
            if (!localIds.has(item.id)) {
                result.push(item);
            }
        }
        
        // Сортируем по времени просмотра (новые сверху)
        result.sort((a, b) => (b.last_watch || 0) - (a.last_watch || 0));
        
        // Ограничиваем количество (не более 100)
        return result.slice(0, 100);
    }

    function applyRemoteData(remote) {
        if (!remote || !remote.file_view) return false;
        
        // Объединяем file_view
        const mergedFileView = mergeFileView(getFileView(), remote.file_view);
        Lampa.Storage.set(STORAGE_KEYS.FILE_VIEW, mergedFileView);
        
        // Объединяем timetable
        const mergedTimetable = mergeTimetable(getTimetable(), remote.timetable || []);
        Lampa.Storage.set(STORAGE_KEYS.TIMETABLE, mergedTimetable);
        
        // Триггерим обновление интерфейса Lampa
        try {
            Lampa.Storage.listener.send('file_view', { type: 'set', value: mergedFileView });
            Lampa.Storage.listener.send('timetable', { type: 'set', value: mergedTimetable });
        } catch(e) {
            console.log('[TimelineSync] Cannot trigger event');
        }
        
        return true;
    }

    // ========= WEBAVD (Яндекс.Диск) =========

    function getWebDavUrl() {
        const c = cfg();
        if (!c.webdav_url) return null;
        
        // Нормализуем URL
        let url = c.webdav_url;
        if (!url.endsWith('/')) url += '/';
        return url + 'lampa_timeline.json';
    }

    function getAuth() {
        const c = cfg();
        if (!c.webdav_login || !c.webdav_password) return null;
        return btoa(`${c.webdav_login}:${c.webdav_password}`);
    }

    function syncToWebDav(showNotify = true) {
        if (isSyncing) return;
        isSyncing = true;
        
        const url = getWebDavUrl();
        const auth = getAuth();
        
        if (!url || !auth) {
            if (showNotify) notify('⚠️ WebDAV не настроен');
            isSyncing = false;
            return;
        }
        
        const data = getProgressData();
        const jsonData = JSON.stringify(data, null, 2);
        
        $.ajax({
            url: url,
            method: 'PUT',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            data: jsonData,
            success: function() {
                if (showNotify) notify('✅ Таймкоды синхронизированы');
                Lampa.Storage.set(SYNC_LOCK_KEY + '_last_sync', Date.now());
            },
            error: function(xhr) {
                console.error('[TimelineSync] Upload error:', xhr);
                if (showNotify && xhr.status !== 404) {
                    notify('❌ Ошибка синхронизации');
                }
            },
            complete: function() {
                isSyncing = false;
            }
        });
    }

    function syncFromWebDav(showNotify = true) {
        if (isSyncing) return;
        isSyncing = true;
        
        const url = getWebDavUrl();
        const auth = getAuth();
        
        if (!url || !auth) {
            if (showNotify) notify('⚠️ WebDAV не настроен');
            isSyncing = false;
            return;
        }
        
        $.ajax({
            url: url,
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            },
            success: function(data) {
                if (data && data.file_view) {
                    applyRemoteData(data);
                    if (showNotify) {
                        const count = Object.keys(data.file_view).length;
                        notify(`📥 Загружено ${count} таймкодов`);
                    }
                } else if (showNotify) {
                    notify('⚠️ Нет данных для синхронизации');
                }
            },
            error: function(xhr) {
                if (xhr.status === 404) {
                    if (showNotify) notify('📭 Файл синхронизации ещё не создан');
                } else {
                    console.error('[TimelineSync] Download error:', xhr);
                    if (showNotify) notify('❌ Ошибка загрузки');
                }
            },
            complete: function() {
                isSyncing = false;
            }
        });
    }

    // ========= ПЕРЕХВАТ СОБЫТИЙ ПЛЕЕРА =========

    function hookPlayerEvents() {
        let lastSyncTime = 0;
        const minInterval = (cfg().sync_interval || 300) * 1000;
        
        // Функция синхронизации с защитой от частых вызовов
        function throttledSync() {
            const now = Date.now();
            if (now - lastSyncTime < minInterval) return;
            lastSyncTime = now;
            syncToWebDav(false);
        }
        
        // При паузе
        Lampa.Listener.follow('player', function(e) {
            if (e.type === 'pause' && cfg().sync_on_pause) {
                throttledSync();
            }
            if (e.type === 'stop' && cfg().sync_on_stop) {
                throttledSync();
            }
        });
        
        // Периодическая синхронизация во время воспроизведения
        let playInterval = null;
        Lampa.Listener.follow('player', function(e) {
            if (e.type === 'play') {
                if (playInterval) clearInterval(playInterval);
                playInterval = setInterval(() => {
                    if (cfg().sync_on_pause) throttledSync();
                }, minInterval);
            } else if (e.type === 'stop') {
                if (playInterval) {
                    clearInterval(playInterval);
                    playInterval = null;
                }
            }
        });
    }

    // ========= НАСТРОЙКИ =========

    function showWebDavSetup() {
        const c = cfg();
        
        Lampa.Select.show({
            title: 'WebDAV (Яндекс.Диск)',
            items: [
                { title: `🔗 URL: ${c.webdav_url ? '✓ Установлен' : '❌ Не установлен'}`, action: 'url' },
                { title: `👤 Логин: ${c.webdav_login ? '✓ Установлен' : '❌ Не установлен'}`, action: 'login' },
                { title: `🔑 Пароль: ${c.webdav_password ? '✓ Установлен' : '❌ Не установлен'}`, action: 'password' },
                { title: `📱 Устройство: ${c.device_name}`, action: 'device' },
                { title: '──────────', separator: true },
                { title: '🔄 Принудительная синхронизация', action: 'force' },
                { title: '──────────', separator: true },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: (item) => {
                if (item.action === 'url') {
                    Lampa.Input.edit({
                        title: 'WebDAV URL',
                        value: c.webdav_url,
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.webdav_url = val || '';
                            saveCfg(c);
                            notify('URL сохранён');
                        }
                        showWebDavSetup();
                    });
                } else if (item.action === 'login') {
                    Lampa.Input.edit({
                        title: 'Логин (Яндекс ID)',
                        value: c.webdav_login,
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.webdav_login = val || '';
                            saveCfg(c);
                            notify('Логин сохранён');
                        }
                        showWebDavSetup();
                    });
                } else if (item.action === 'password') {
                    Lampa.Input.edit({
                        title: 'Пароль приложения',
                        value: c.webdav_password,
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.webdav_password = val || '';
                            saveCfg(c);
                            notify('Пароль сохранён');
                        }
                        showWebDavSetup();
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
                            notify('Имя устройства сохранено');
                        }
                        showWebDavSetup();
                    });
                } else if (item.action === 'force') {
                    syncToWebDav(true);
                    setTimeout(() => syncFromWebDav(true), 500);
                    setTimeout(() => showWebDavSetup(), 2000);
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
            icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.5-13h-1v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'webdav_setup', type: 'button' },
            field: { name: 'Настройка WebDAV (Яндекс.Диск)' },
            onChange: () => showWebDavSetup()
        });

        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: {
                name: 'merge_strategy',
                type: 'select',
                values: {
                    'newest': 'По времени обновления',
                    'further': 'По дальше просмотра',
                    'remote': 'Только облачный',
                    'local': 'Только локальный'
                },
                default: 'newest'
            },
            field: { name: 'Стратегия слияния', description: 'Как разрешать конфликты' },
            onChange: v => {
                const c = cfg();
                c.merge_strategy = v;
                saveCfg(c);
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'sync_interval', type: 'number', default: 300 },
            field: { name: 'Интервал синхронизации (секунд)', description: 'Минимум 30 секунд' },
            onChange: v => {
                const c = cfg();
                c.sync_interval = Math.max(30, v || 300);
                saveCfg(c);
            }
        });
    }

    // ========= ЗАПУСК =========

    function init() {
        if (!cfg().enabled) return;
        
        hookPlayerEvents();
        addSettings();
        
        // Первоначальная загрузка
        setTimeout(() => {
            syncFromWebDav(false);
        }, 5000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());

})();
