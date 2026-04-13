(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let syncInProgress = false;
    let pendingSync = false;
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
            button_position: 'head',
            sync_strategy: 'newest',
            auto_sync_interval: 15,
            background_sync_interval: 15
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

    function formatTimeShort(seconds) {
        if (!seconds || seconds < 0) return '0 мин';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 1) return '< 1 мин';
        return `${minutes} мин`;
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

    function extractTmdbIdFromKey(key, item) {
        if (/^\d{6,8}$/.test(key)) return key;
        if (key.startsWith('tmdb_')) return key.replace('tmdb_', '');
        if (key.startsWith('cub_') && item) {
            return extractTmdbIdFromItem(item);
        }
        return extractTmdbIdFromItem(item);
    }

    function normalizeKeys(data) {
        const result = {};
        for (const key in data) {
            const tmdbId = extractTmdbIdFromKey(key, data[key]);
            if (tmdbId) {
                if (!result[tmdbId] || (data[key].time || 0) > (result[tmdbId].time || 0)) {
                    result[tmdbId] = { ...data[key], tmdb_id: tmdbId };
                }
            } else {
                result[key] = data[key];
            }
        }
        return result;
    }

    function getProgressData() {
        return {
            version: 5,
            profile_id: getCurrentProfileId(),
            device: cfg().device_name,
            source: Lampa.Storage.field('source') || 'tmdb',
            updated: Date.now(),
            file_view: normalizeKeys(getFileView())
        };
    }

    // Исправленная функция слияния - принудительно обновляет по дате
    function mergeFileView(local, remote) {
        const result = { ...local };
        let changed = false;
        const strategy = cfg().sync_strategy;
        const now = Date.now();
        
        for (const key in remote) {
            const remoteItem = remote[key];
            const localItem = local[key];
            
            const remoteTime = remoteItem?.time || 0;
            const localTime = localItem?.time || 0;
            const remotePercent = remoteItem?.percent || 0;
            const localPercent = localItem?.percent || 0;
            const remoteUpdated = remoteItem?.updated || 0;
            const localUpdated = localItem?.updated || 0;
            
            let shouldUseRemote = false;
            let reason = '';
            
            if (!localItem) {
                shouldUseRemote = true;
                reason = 'новый таймкод';
            } else {
                switch (strategy) {
                    case 'max_time':
                        if (remoteTime > localTime + 5) {
                            shouldUseRemote = true;
                            reason = `время (${formatTime(localTime)} → ${formatTime(remoteTime)})`;
                        }
                        break;
                    case 'max_percent':
                        if (remotePercent > localPercent + 3) {
                            shouldUseRemote = true;
                            reason = `процент (${localPercent}% → ${remotePercent}%)`;
                        }
                        break;
                    case 'newest':
                        // Для стратегии по дате - всегда берём тот, у которого updated больше
                        if (remoteUpdated > localUpdated) {
                            shouldUseRemote = true;
                            reason = `дата (${new Date(localUpdated).toLocaleString()} → ${new Date(remoteUpdated).toLocaleString()})`;
                        }
                        break;
                }
            }
            
            if (shouldUseRemote) {
                result[key] = { 
                    ...remoteItem, 
                    updated: remoteUpdated || now
                };
                changed = true;
                console.log(`[Sync] 🔄 ОБНОВЛЁН (${reason}) для ${key}`);
                console.log(`   Локальный:  время=${formatTime(localTime)} (${localPercent}%), обновлён=${new Date(localUpdated).toLocaleString()}`);
                console.log(`   Удалённый:  время=${formatTime(remoteTime)} (${remotePercent}%), обновлён=${new Date(remoteUpdated).toLocaleString()}`);
            }
        }
        
        // Также проверяем, нет ли в локальных данных таймкодов без updated
        for (const key in result) {
            if (!result[key].updated) {
                result[key].updated = now;
                changed = true;
                console.log(`[Sync] 🔧 Добавлена дата для ${key}`);
            }
        }
        
        return { merged: result, changed };
    }

    // Принудительное обновление карточек
    function refreshUI() {
        try {
            if (Lampa.Timeline && Lampa.Timeline.read) {
                Lampa.Timeline.read(true);
            }
            const activity = Lampa.Activity.active();
            if (activity && activity.activity && activity.activity.refresh) {
                activity.activity.refresh();
            }
            Lampa.Listener.send('state:changed', {
                target: 'timeline',
                reason: 'refresh'
            });
            console.log('[Sync] UI обновлён');
        } catch(e) {
            console.error('[Sync] Ошибка обновления UI:', e);
        }
    }

    function getCurrentMovieTmdbId() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                const movie = activity.movie;
                const tmdbId = extractTmdbIdFromItem(movie);
                if (tmdbId) return tmdbId;
            }
            return null;
        } catch(e) {
            return null;
        }
    }

    function getCurrentPlayTime() {
        try {
            const player = Lampa.Player.playdata();
            if (player && player.timeline && player.timeline.time) {
                return player.timeline.time;
            }
        } catch(e) {}
        return 0;
    }

    function saveCurrentProgress(timeInSeconds, tmdbId) {
        if (!tmdbId) tmdbId = getCurrentMovieTmdbId();
        if (!tmdbId) return false;
        
        const fileView = getFileView();
        const currentTime = Math.floor(timeInSeconds);
        const savedTime = fileView[tmdbId]?.time || 0;
        const now = Date.now();
        
        if (Math.abs(currentTime - savedTime) >= 10) {
            const duration = Lampa.Player.playdata()?.timeline?.duration || 0;
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            
            fileView[tmdbId] = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: now
            };
            setFileView(fileView);
            console.log(`[Sync] 💾 СОХРАНЕНО: ${formatTime(currentTime)} (${percent}%) для ${tmdbId}`);
            
            if (Lampa.Timeline && Lampa.Timeline.update) {
                Lampa.Timeline.update({
                    hash: tmdbId,
                    percent: percent,
                    time: currentTime,
                    duration: duration
                });
            }
            return true;
        }
        return false;
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
        if (count === 0) {
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
                } else if (callback) {
                    callback(true);
                }
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
                        const count = Object.keys(remote.file_view || {}).length;
                        console.log(`[Sync] 📥 Загружено ${count} таймкодов`);
                        
                        const localFileView = getFileView();
                        const { merged, changed } = mergeFileView(localFileView, remote.file_view);
                        
                        if (changed) {
                            setFileView(merged);
                            console.log(`[Sync] Итог: ${Object.keys(merged).length} таймкодов`);
                            
                            // Обновляем UI после загрузки
                            refreshUI();
                            
                            if (showNotify) notify(`📥 Загружено ${count} таймкодов`);
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
        syncToGist(true, () => {
            setTimeout(() => {
                syncFromGist(true);
            }, 500);
        });
    }

    function autoSyncTask() {
        if (!cfg().enabled) return;
        if (!Lampa.Player.opened()) return;
        
        const currentTime = getCurrentPlayTime();
        if (currentTime === 0) return;
        
        const tmdbId = getCurrentMovieTmdbId();
        if (!tmdbId) return;
        
        console.log(`[Sync] ⏰ Автоотправка: ${formatTime(currentTime)}`);
        saveCurrentProgress(currentTime, tmdbId);
        syncToGist(false);
    }

    function backgroundSyncTask() {
        if (!cfg().enabled) return;
        console.log('[Sync] 🔄 Фоновая загрузка');
        syncFromGist(false);
    }

    function startAutoSync() {
        if (autoSyncTimer) {
            clearInterval(autoSyncTimer);
            autoSyncTimer = null;
        }
        
        const interval = cfg().auto_sync_interval;
        if (interval > 0) {
            autoSyncTimer = setInterval(autoSyncTask, interval * 1000);
            console.log(`[Sync] Автоотправка запущена (интервал: ${interval} сек)`);
        }
    }

    function startBackgroundSync() {
        if (backgroundSyncTimer) {
            clearInterval(backgroundSyncTimer);
            backgroundSyncTimer = null;
        }
        
        const interval = cfg().background_sync_interval;
        if (interval > 0) {
            backgroundSyncTimer = setInterval(backgroundSyncTask, interval * 1000);
            console.log(`[Sync] Фоновая загрузка запущена (интервал: ${interval} сек)`);
        }
    }

    function addHeadButton() {
        const svgIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" fill="currentColor"/></svg>';
        
        $('.tl-sync-button').remove();
        
        const syncButton = $(`<div class="tl-sync-button selector head__action" style="display: flex; align-items: center; justify-content: center;">${svgIcon}</div>`);
        syncButton.on('hover:enter', fullSync);
        syncButton.on('click', fullSync);
        
        const headActions = $('.head__actions');
        if (headActions.length) {
            headActions.prepend(syncButton);
        } else {
            $('.head__body').append(syncButton);
        }
    }

    function initPlayerHandler() {
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'open' && e.movie) {
                const tmdbId = extractTmdbIdFromItem(e.movie);
                console.log(`[Sync] 🎬 Открыт фильм: ${tmdbId}`);
                
                setTimeout(() => {
                    syncFromGist(false, (success) => {
                        if (success) {
                            const fileView = getFileView();
                            if (tmdbId && fileView[tmdbId]?.time) {
                                const savedTime = fileView[tmdbId].time;
                                console.log(`[Sync] 🎯 Загружен таймкод: ${formatTime(savedTime)}`);
                                notify(`🎯 Таймкод: ${formatTimeShort(savedTime)}`);
                                refreshUI();
                            }
                        }
                    });
                }, 2000);
            }
            
            if (e.type === 'stop' || e.type === 'pause') {
                const currentTime = getCurrentPlayTime();
                if (currentTime > 0) {
                    console.log(`[Sync] ${e.type === 'stop' ? '⏹️ Остановка' : '⏸️ Пауза'} - сохраняем`);
                    saveCurrentProgress(currentTime, null);
                    syncToGist(false);
                }
            }
        });
        
        setInterval(() => {
            if (Lampa.Player.opened()) {
                const currentTime = getCurrentPlayTime();
                if (currentTime > 0) {
                    saveCurrentProgress(currentTime, null);
                }
            }
        }, 10000);
    }

    function showGistSetup() {
        const c = cfg();
        const strategyNames = {
            'max_time': '⏱ По времени просмотра',
            'max_percent': '📊 По проценту просмотра',
            'newest': '🕐 По дате обновления'
        };
        
        const autoSyncOptions = [
            { title: 'Выключено', value: 0 },
            { title: '15 секунд', value: 15 },
            { title: '30 секунд', value: 30 },
            { title: '1 минута', value: 60 },
            { title: '2 минуты', value: 120 },
            { title: '5 минут', value: 300 }
        ];
        
        const backgroundSyncOptions = [
            { title: 'Выключено', value: 0 },
            { title: '15 секунд', value: 15 },
            { title: '30 секунд', value: 30 },
            { title: '1 минута', value: 60 },
            { title: '2 минуты', value: 120 },
            { title: '5 минут', value: 300 },
            { title: '10 минут', value: 600 }
        ];
        
        const currentAutoSync = autoSyncOptions.find(o => o.value === c.auto_sync_interval) || autoSyncOptions[0];
        const currentBackgroundSync = backgroundSyncOptions.find(o => o.value === c.background_sync_interval) || backgroundSyncOptions[0];
        
        Lampa.Select.show({
            title: 'Синхронизация таймкодов',
            items: [
                { title: `🔑 Токен: ${c.gist_token ? '✓' : '❌'}`, action: 'token' },
                { title: `📄 Gist ID: ${c.gist_id ? c.gist_id.substring(0,8)+'…' : '❌'}`, action: 'id' },
                { title: `📱 Устройство: ${c.device_name}`, action: 'device' },
                { title: `👤 Профиль: ${c.manual_profile_id || 'авто'}`, action: 'profile' },
                { title: '──────────', separator: true },
                { title: `🔄 Стратегия: ${strategyNames[c.sync_strategy]}`, action: 'strategy' },
                { title: `📤 Отправка: ${currentAutoSync.title}`, action: 'auto_sync' },
                { title: `📥 Загрузка: ${currentBackgroundSync.title}`, action: 'background_sync' },
                { title: '──────────', separator: true },
                { title: '📤 Отправить сейчас', action: 'upload' },
                { title: '📥 Загрузить сейчас', action: 'download' },
                { title: '🔄 Полная синхр.', action: 'force' },
                { title: '🔄 Обновить UI', action: 'refresh' },
                { title: '──────────', separator: true },
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
                } else if (item.action === 'strategy') {
                    Lampa.Select.show({
                        title: 'Стратегия синхронизации',
                        items: [
                            { title: '⏱ По максимальному времени', value: 'max_time', desc: 'Берётся наибольшее время просмотра' },
                            { title: '📊 По максимальному проценту', value: 'max_percent', desc: 'Берётся наибольший процент' },
                            { title: '🕐 По дате обновления', value: 'newest', desc: 'Берётся самый свежий таймкод (рекомендуется)' }
                        ].map(opt => ({
                            title: opt.title,
                            subtitle: opt.desc,
                            value: opt.value,
                            selected: c.sync_strategy === opt.value
                        })),
                        onSelect: (opt) => {
                            c.sync_strategy = opt.value;
                            saveCfg(c);
                            notify(`Стратегия: ${opt.title}`);
                            showGistSetup();
                        },
                        onBack: () => showGistSetup()
                    });
                } else if (item.action === 'auto_sync') {
                    Lampa.Select.show({
                        title: 'Отправка во время просмотра',
                        items: autoSyncOptions.map(opt => ({
                            title: opt.title,
                            value: opt.value,
                            selected: c.auto_sync_interval === opt.value
                        })),
                        onSelect: (opt) => {
                            c.auto_sync_interval = opt.value;
                            saveCfg(c);
                            notify(`Отправка: ${opt.title}`);
                            startAutoSync();
                            showGistSetup();
                        },
                        onBack: () => showGistSetup()
                    });
                } else if (item.action === 'background_sync') {
                    Lampa.Select.show({
                        title: 'Фоновая загрузка с Gist',
                        items: backgroundSyncOptions.map(opt => ({
                            title: opt.title,
                            value: opt.value,
                            selected: c.background_sync_interval === opt.value
                        })),
                        onSelect: (opt) => {
                            c.background_sync_interval = opt.value;
                            saveCfg(c);
                            notify(`Фоновая загрузка: ${opt.title}`);
                            startBackgroundSync();
                            showGistSetup();
                        },
                        onBack: () => showGistSetup()
                    });
                } else if (item.action === 'upload') {
                    syncToGist(true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'download') {
                    syncFromGist(true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'force') {
                    fullSync();
                    setTimeout(() => showGistSetup(), 2000);
                } else if (item.action === 'refresh') {
                    refreshUI();
                    notify('🔄 UI обновлён');
                    setTimeout(() => showGistSetup(), 1000);
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
            field: { name: '⚙️ Настройки Gist' },
            onChange: () => showGistSetup()
        });
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'sync_enabled', type: 'toggle', default: true },
            field: { name: 'Включить синхронизацию' },
            onChange: v => { const c = cfg(); c.enabled = v; saveCfg(c); }
        });
    }

    function init() {
        if (!cfg().enabled) return;
        
        console.log(`[Sync] Инициализация. Стратегия: ${cfg().sync_strategy === 'newest' ? 'по дате' : cfg().sync_strategy === 'max_time' ? 'по времени' : 'по проценту'}`);
        console.log(`[Sync] Отправка: ${cfg().auto_sync_interval > 0 ? cfg().auto_sync_interval + ' сек' : 'выключена'}`);
        console.log(`[Sync] Загрузка: ${cfg().background_sync_interval > 0 ? cfg().background_sync_interval + ' сек' : 'выключена'}`);
        
        const current = getFileView();
        const normalized = normalizeKeys(current);
        if (JSON.stringify(current) !== JSON.stringify(normalized)) {
            console.log('[Sync] Нормализация ключей');
            setFileView(normalized);
        }
        
        initPlayerHandler();
        addSettings();
        addHeadButton();
        startAutoSync();
        startBackgroundSync();
        
        setTimeout(() => {
            if (cfg().enabled) {
                syncFromGist(false);
            }
        }, 3000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
