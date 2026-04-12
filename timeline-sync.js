(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let lastSyncTime = 0;
    let syncInProgress = false;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
            sync_on_stop: true,
            sync_interval: 30
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
        return Lampa.Storage.get(getFileViewKey(), {});
    }

    function setFileView(data) {
        Lampa.Storage.set(getFileViewKey(), data, true);
        return data;
    }

    function extractTmdbIdFromItem(item) {
        if (!item) return null;
        if (item.tmdb_id) return String(item.tmdb_id);
        if (item.id && /^\d{6,8}$/.test(String(item.id))) {
            return String(item.id);
        }
        if (item.movie_id && /^\d{6,8}$/.test(String(item.movie_id))) {
            return String(item.movie_id);
        }
        return null;
    }

    function getProgressData() {
        return {
            version: 4,
            profile_id: getCurrentProfileId(),
            device: cfg().device_name,
            source: Lampa.Storage.field('source') || 'tmdb',
            updated: Date.now(),
            file_view: getFileView()
        };
    }

    function mergeFileView(local, remote) {
        const result = { ...local };
        let changed = false;
        
        for (const key in remote) {
            const remotePercent = remote[key]?.percent || 0;
            const localPercent = local[key]?.percent || 0;
            const remoteTime = remote[key]?.updated || 0;
            const localTime = local[key]?.updated || 0;
            
            if (!local[key]) {
                result[key] = remote[key];
                changed = true;
                console.log(`[Sync] ➕ Новый: ${key} (${remotePercent}%)`);
            } else if (remoteTime > localTime) {
                result[key] = remote[key];
                changed = true;
                console.log(`[Sync] 🔄 Обновлён: ${key} (${localPercent}% → ${remotePercent}%)`);
            }
        }
        return { merged: result, changed };
    }

    function applyRemoteData(remote) {
        if (!remote?.file_view) return false;
        
        const localFileView = getFileView();
        const { merged, changed } = mergeFileView(localFileView, remote.file_view);
        
        if (changed) {
            setFileView(merged);
            console.log(`[Sync] Итог: ${Object.keys(merged).length} таймкодов`);
            return true;
        }
        return false;
    }

    function syncToGist(showNotify = true, callback = null) {
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
        
        const data = getProgressData();
        const count = Object.keys(data.file_view).length;
        if (count === 0) {
            if (callback) callback(false);
            return;
        }
        
        syncInProgress = true;
        console.log(`[Sync] Отправка ${count} таймкодов...`);
        
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
                if (showNotify) notify('✅ Отправлено');
                lastSyncTime = Date.now();
                syncInProgress = false;
                if (callback) callback(true);
            },
            error: () => {
                if (showNotify) notify('❌ Ошибка');
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
        console.log(`[Sync] Загрузка с Gist...`);
        
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
                        const changed = applyRemoteData(remote);
                        if (showNotify && changed) notify('📥 Загружено');
                        else if (showNotify && !changed) notify('✅ Актуально');
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
            error: () => {
                if (showNotify) notify('❌ Ошибка');
                if (callback) callback(false);
            },
            complete: () => {
                syncInProgress = false;
            }
        });
    }

    function hookPlayerEvents() {
        let lastPercent = 0;
        
        function throttledSync() {
            const interval = (cfg().sync_interval || 30) * 1000;
            if (Date.now() - lastSyncTime >= interval && !syncInProgress) {
                syncToGist(false);
            }
        }
        
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'timeupdate' && e.time && e.duration) {
                const percent = Math.floor((e.time / e.duration) * 100);
                if (Math.abs(percent - lastPercent) >= 5) {
                    lastPercent = percent;
                    
                    const activity = Lampa.Activity.active();
                    const movie = activity?.movie;
                    let tmdbId = null;
                    
                    if (movie) {
                        tmdbId = movie.tmdb_id || (movie.id && /^\d+$/.test(movie.id) ? movie.id : null);
                    }
                    
                    if (tmdbId) {
                        const fileView = getFileView();
                        fileView[tmdbId] = {
                            percent: percent,
                            time: e.time,
                            updated: Date.now(),
                            device: cfg().device_name
                        };
                        setFileView(fileView);
                    }
                    
                    throttledSync();
                }
            }
            
            if (e.type === 'stop' || e.type === 'pause') {
                if (cfg().sync_on_stop && !syncInProgress) {
                    syncToGist(false);
                }
            }
        });
    }

    function showGistSetup() {
        const c = cfg();
        Lampa.Select.show({
            title: 'Синхронизация таймкодов',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓' : '❌'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0,8)+'…' : '❌'}`, action: 'id' },
                { title: `📱 Устройство: ${c.device_name}`, action: 'device' },
                { title: `👤 Профиль: ${c.manual_profile_id || 'авто'}`, action: 'profile' },
                { title: '──────────', separator: true },
                { title: '🔄 Синхронизировать', action: 'sync', accent: true },
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
                    Lampa.Input.edit({ title: 'ID профиля', value: c.manual_profile_id, free: true }, (val) => {
                        if (val !== null) { c.manual_profile_id = val || ''; saveCfg(c); notify('Профиль сохранён'); }
                        showGistSetup();
                    });
                } else if (item.action === 'sync') {
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
            param: { name: 'sync_enabled', type: 'toggle', default: true },
            field: { name: 'Включить синхронизацию' },
            onChange: v => { const c = cfg(); c.enabled = v; saveCfg(c); }
        });
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'sync_interval', type: 'number', default: 30 },
            field: { name: 'Интервал синхронизации (сек)' },
            onChange: v => { const c = cfg(); c.sync_interval = Math.max(15, v || 30); saveCfg(c); }
        });
    }

    function init() {
        if (!cfg().enabled) return;
        
        console.log(`[Sync] Профиль: ${getCurrentProfileId() || 'глобальный'}`);
        hookPlayerEvents();
        addSettings();
        
        setTimeout(() => syncFromGist(false), 5000);
        setInterval(() => { if (cfg().enabled) syncFromGist(false); }, 60000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
