(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let lastSyncTime = 0;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
            sync_on_stop: true,
            sync_interval: 60
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

    // Извлечение TMDB ID из разных источников
    function extractTmdbIdFromItem(item) {
        if (!item) return null;
        
        // Прямое поле tmdb_id
        if (item.tmdb_id) return String(item.tmdb_id);
        
        // Поле id (может быть как TMDB ID, так и CUB ID)
        if (item.id) {
            // Если id — число и оно похоже на TMDB ID (обычно 6-8 цифр)
            if (/^\d{6,8}$/.test(String(item.id))) {
                return String(item.id);
            }
        }
        
        // Поле movie_id
        if (item.movie_id && /^\d{6,8}$/.test(String(item.movie_id))) {
            return String(item.movie_id);
        }
        
        return null;
    }

    // Извлечение TMDB ID из ключа
    function extractTmdbIdFromKey(key, item) {
        // Если ключ — число, похожее на TMDB ID
        if (/^\d{6,8}$/.test(key)) return key;
        
        // Если ключ вида tmdb_12345
        if (key.startsWith('tmdb_')) return key.replace('tmdb_', '');
        
        // Если ключ вида cub_12345 — пытаемся найти TMDB ID в объекте
        if (key.startsWith('cub_') && item) {
            return extractTmdbIdFromItem(item);
        }
        
        return extractTmdbIdFromItem(item);
    }

    // Нормализация: все ключи заменяем на TMDB ID
    function normalizeKeys(data) {
        const result = {};
        for (const key in data) {
            const tmdbId = extractTmdbIdFromKey(key, data[key]);
            if (tmdbId) {
                if (!result[tmdbId] || (data[key].percent || 0) > (result[tmdbId].percent || 0)) {
                    result[tmdbId] = { ...data[key], tmdb_id: tmdbId };
                }
            } else {
                // Если не удалось извлечь TMDB ID, оставляем как есть
                result[key] = data[key];
            }
        }
        return result;
    }

    function getProgressData() {
        return {
            version: 4,
            profile_id: getCurrentProfileId(),
            device: cfg().device_name,
            source: Lampa.Storage.field('source') || 'tmdb',
            updated: Date.now(),
            file_view: normalizeKeys(getFileView())
        };
    }

    function mergeFileView(local, remote) {
        const result = { ...local };
        
        for (const key in remote) {
            const remotePercent = remote[key]?.percent || 0;
            const localPercent = local[key]?.percent || 0;
            const remoteTime = remote[key]?.time || 0;
            const localTime = local[key]?.time || 0;
            
            if (!local[key]) {
                result[key] = remote[key];
                console.log(`[Sync] ➕ Новый: ${key} (${remotePercent}%)`);
            } else if (remotePercent > localPercent || remoteTime > localTime) {
                result[key] = remote[key];
                console.log(`[Sync] 🔄 Обновлён: ${key} (${localPercent}% → ${remotePercent}%)`);
            }
        }
        return result;
    }

    function applyRemoteData(remote) {
        if (!remote?.file_view) return false;
        
        const localFileView = getFileView();
        const merged = mergeFileView(localFileView, remote.file_view);
        setFileView(merged);
        
        console.log(`[Sync] Итог: ${Object.keys(merged).length} таймкодов`);
        return true;
    }

    // Отслеживание текущего фильма для привязки к TMDB ID
    function syncCurrentMovie() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                const movie = activity.movie;
                const tmdbId = movie.tmdb_id || (movie.id && /^\d{6,8}$/.test(String(movie.id)) ? movie.id : null);
                if (tmdbId) {
                    console.log(`[Sync] Текущий фильм: TMDB ID ${tmdbId}, источник: ${Lampa.Storage.field('source') || 'tmdb'}`);
                }
            }
        } catch(e) {}
    }

    function syncToGist(showNotify = true) {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            return;
        }
        
        const data = getProgressData();
        const count = Object.keys(data.file_view).length;
        if (count === 0) return;
        
        console.log(`[Sync] Отправка ${count} таймкодов, источник: ${data.source}`);
        
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
                if (showNotify) notify('✅ Таймкоды синхронизированы');
                lastSyncTime = Date.now();
            },
            error: () => showNotify && notify('❌ Ошибка синхронизации')
        });
    }

    function syncFromGist(showNotify = true) {
        const c = cfg();
        if (!c.gist_token || !c.gist_id) {
            if (showNotify) notify('⚠️ Gist не настроен');
            return;
        }
        
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
                        console.log(`[Sync] Загружено ${Object.keys(remote.file_view || {}).length} таймкодов (источник: ${remote.source || 'unknown'})`);
                        applyRemoteData(remote);
                        if (showNotify) notify('📥 Таймкоды загружены');
                    }
                } catch(e) { console.error(e); }
            },
            error: () => showNotify && notify('❌ Ошибка загрузки')
        });
    }

    function hookPlayerEvents() {
        let playerTime = 0;
        const interval = (cfg().sync_interval || 60) * 1000;
        
        function throttledSync() {
            if (Date.now() - lastSyncTime < interval) return;
            lastSyncTime = Date.now();
            syncToGist(false);
        }
        
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'timeupdate' && e.time) {
                playerTime = e.time;
                if (Math.floor(playerTime) % 30 === 0) throttledSync();
            }
            if (e.type === 'stop' || e.type === 'pause') {
                syncCurrentMovie();
                throttledSync();
            }
        });
    }

    function showGistSetup() {
        const c = cfg();
        Lampa.Select.show({
            title: 'GitHub Gist',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓' : '❌'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0,8)+'…' : '❌'}`, action: 'id' },
                { title: `📱 Устройство: ${c.device_name}`, action: 'device' },
                { title: `👤 ID профиля: ${c.manual_profile_id || 'авто'}`, action: 'profile' },
                { title: '──────────', separator: true },
                { title: '🔄 Принудительная синхронизация', action: 'force' },
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
            param: { name: 'sync_interval', type: 'number', default: 60 },
            field: { name: 'Интервал синхронизации (сек)' },
            onChange: v => { const c = cfg(); c.sync_interval = Math.max(30, v || 60); saveCfg(c); }
        });
    }

    function init() {
        if (!cfg().enabled) return;
        
        const currentSource = Lampa.Storage.field('source') || 'tmdb';
        console.log(`[Sync] Профиль: ${getCurrentProfileId() || 'глобальный'}, источник: ${currentSource}`);
        
        const current = getFileView();
        const normalized = normalizeKeys(current);
        if (JSON.stringify(current) !== JSON.stringify(normalized)) {
            console.log('[Sync] Нормализация ключей в TMDB ID');
            setFileView(normalized);
        }
        
        hookPlayerEvents();
        addSettings();
        setTimeout(() => syncFromGist(false), 5000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
