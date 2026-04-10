(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let syncTimer = null;

    // ========= CONFIG =========

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
            sync_on_stop: true,
            sync_interval: 300,
            merge_strategy: 'newest'
        }) || {};
    }

    function saveCfg(c) {
        Lampa.Storage.set(CFG_KEY, c, true);
    }

    function notify(text) {
        Lampa.Noty.show(text);
    }

    // ========= ПОЛУЧЕНИЕ ПРОФИЛЯ =========

    function getCurrentProfileId() {
        const c = cfg();
        if (c.manual_profile_id) return c.manual_profile_id;
        
        let profileId = Lampa.Storage.get('profile_id', '');
        if (profileId) return profileId;
        
        const accountUser = Lampa.Storage.get('account_user', {});
        if (accountUser.profile) return String(accountUser.profile);
        
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('file_view_')) {
                    const match = key.match(/^file_view_(\d+)$/);
                    if (match) return match[1];
                }
            }
        } catch(e) {}
        
        return '';
    }

    function getFileViewKey() {
        const profileId = getCurrentProfileId();
        return profileId ? `file_view_${profileId}` : 'file_view';
    }

    function getTimetableKey() {
        const profileId = getCurrentProfileId();
        return profileId ? `timetable_${profileId}` : 'timetable';
    }

    function getFileView() {
        const key = getFileViewKey();
        return Lampa.Storage.get(key, {});
    }

    function getTimetable() {
        const key = getTimetableKey();
        return Lampa.Storage.get(key, []);
    }

    function setFileView(data) {
        const key = getFileViewKey();
        Lampa.Storage.set(key, data, true);
        return data;
    }

    function setTimetable(data) {
        const key = getTimetableKey();
        Lampa.Storage.set(key, data, true);
        return data;
    }

    function getProgressData() {
        const profileId = getCurrentProfileId();
        return {
            version: 2,
            profile_id: profileId,
            device: cfg().device_name,
            updated: Date.now(),
            file_view: getFileView(),
            timetable: getTimetable()
        };
    }

    // ========= MERGE STRATEGY (ОБНОВЛЁННАЯ) =========

    function mergeFileView(local, remote) {
        const strategy = cfg().merge_strategy;
        const result = { ...local };
        
        for (const hash in remote) {
            const remoteTime = remote[hash]?.time || 0;
            const localTime = local[hash]?.time || 0;
            const remoteUpdated = remote[hash]?.updated || 0;
            const localUpdated = local[hash]?.updated || 0;
            
            if (!local[hash]) {
                result[hash] = remote[hash];
                continue;
            }
            
            if (strategy === 'newest') {
                if (remoteUpdated > localUpdated) {
                    result[hash] = remote[hash];
                }
            } else if (strategy === 'further') {
                if (remoteTime > localTime) {
                    result[hash] = remote[hash];
                }
            } else if (strategy === 'remote') {
                result[hash] = remote[hash];
            }
        }
        
        return result;
    }

    function mergeTimetable(local, remote) {
        const result = [...local];
        
        for (let i = 0; i < remote.length; i++) {
            const remoteItem = remote[i];
            const remoteKey = `${remoteItem.id}_${remoteItem.type || 'movie'}_${remoteItem.season || 0}`;
            
            let found = false;
            for (let j = 0; j < result.length; j++) {
                const localItem = result[j];
                const localKey = `${localItem.id}_${localItem.type || 'movie'}_${localItem.season || 0}`;
                
                if (remoteKey === localKey) {
                    const remoteTime = remoteItem.scaned_time || 0;
                    const localTime = localItem.scaned_time || 0;
                    if (remoteTime > localTime) {
                        result[j] = remoteItem;
                    }
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                result.push(remoteItem);
            }
        }
        
        result.sort((a, b) => (b.scaned_time || 0) - (a.scaned_time || 0));
        return result.slice(0, 100);
    }

    function applyRemoteData(remote) {
        if (!remote || !remote.file_view) return false;
        
        const mergedFileView = mergeFileView(getFileView(), remote.file_view);
        setFileView(mergedFileView);
        
        const mergedTimetable = mergeTimetable(getTimetable(), remote.timetable || []);
        setTimetable(mergedTimetable);
        
        console.log(`[TimelineSync] После слияния: file_view=${Object.keys(mergedFileView).length}, timetable=${mergedTimetable.length}`);
        
        return true;
    }

    // ========= GITHUB GIST СИНХРОНИЗАЦИЯ =========

    function syncToGist(showNotify = true) {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ GitHub Gist не настроен');
            return;
        }
        
        const data = getProgressData();
        const fileViewCount = Object.keys(data.file_view).length;
        
        console.log(`[TimelineSync] Отправка: file_view=${fileViewCount}, timetable=${data.timetable.length}, профиль=${data.profile_id}`);
        
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
                Lampa.Storage.set('timeline_last_sync', Date.now());
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

    // ========= ПЕРЕХВАТ СОБЫТИЙ ПЛЕЕРА =========

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
                        title: 'GitHub Personal Access Token',
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
                            notify('Имя устройства сохранено');
                        }
                        showGistSetup();
                    });
                } else if (item.action === 'profile') {
                    Lampa.Input.edit({
                        title: 'ID профиля (оставьте пустым для авто)',
                        value: c.manual_profile_id || '',
                        free: true
                    }, (val) => {
                        if (val !== null) {
                            c.manual_profile_id = val || '';
                            saveCfg(c);
                            notify(`ID профиля ${c.manual_profile_id || 'авто'} сохранён`);
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
            icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm.5 13h-1v-6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'gist_setup', type: 'button' },
            field: { name: 'Настройка GitHub Gist' },
            onChange: () => showGistSetup()
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
            field: { name: 'Интервал синхронизации (секунд)', description: 'Рекомендуется 60-300 секунд' },
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
        
        const profileId = getCurrentProfileId();
        console.log(`[TimelineSync] Инициализация. Профиль: ${profileId || 'глобальный'}`);
        console.log(`[TimelineSync] Ключ file_view: ${getFileViewKey()}`);
        console.log(`[TimelineSync] Стратегия слияния: ${cfg().merge_strategy}`);
        
        hookPlayerEvents();
        addSettings();
        
        setTimeout(() => {
            syncFromGist(false);
        }, 5000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());

})();
