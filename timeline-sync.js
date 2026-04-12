(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let syncInProgress = false;
    let currentMovieId = null;
    let lastCurrentTime = 0;

    function cfg() {
        return Lampa.Storage.get(CFG_KEY, {
            enabled: true,
            gist_token: '',
            gist_id: '',
            device_name: Lampa.Platform.get() || 'Unknown',
            manual_profile_id: '',
            button_position: 'player' // 'player' - в плеере, 'head' - верхняя панель
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

    function mergeFileView(local, remote) {
        const result = { ...local };
        let changed = false;
        
        for (const key in remote) {
            const remoteTime = remote[key]?.time || 0;
            const localTime = local[key]?.time || 0;
            
            if (!local[key]) {
                result[key] = remote[key];
                changed = true;
                console.log(`[Sync] ➕ Новый: ${key} (${formatTime(remoteTime)})`);
            } else if (remoteTime > localTime + 5) {
                result[key] = remote[key];
                changed = true;
                console.log(`[Sync] 🔄 Обновлён: ${key} (${formatTime(localTime)} → ${formatTime(remoteTime)})`);
            }
        }
        return { merged: result, changed };
    }

    function getCurrentMovieTmdbId() {
        try {
            const activity = Lampa.Activity.active();
            if (activity && activity.movie) {
                const movie = activity.movie;
                const tmdbId = extractTmdbIdFromItem(movie);
                if (tmdbId) return tmdbId;
            }
            return currentMovieId;
        } catch(e) {
            return null;
        }
    }

    // Сохранить текущий прогресс в локальное хранилище
    function saveCurrentProgress(timeInSeconds) {
        const tmdbId = getCurrentMovieTmdbId();
        if (!tmdbId) return false;
        
        const fileView = getFileView();
        const currentTime = Math.floor(timeInSeconds);
        const savedTime = fileView[tmdbId]?.time || 0;
        
        if (Math.abs(currentTime - savedTime) >= 10) {
            const duration = Lampa.Player.playdata()?.timeline?.duration || 0;
            const percent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
            
            fileView[tmdbId] = {
                time: currentTime,
                percent: percent,
                duration: duration,
                updated: Date.now()
            };
            setFileView(fileView);
            console.log(`[Sync] 💾 Сохранён прогресс: ${formatTime(currentTime)} для ${tmdbId}`);
            
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

    // Отправить текущий таймкод на Gist
    function sendCurrentTimecode() {
        if (syncInProgress) {
            notify('⏳ Синхронизация уже выполняется...');
            return;
        }
        
        const tmdbId = getCurrentMovieTmdbId();
        if (!tmdbId) {
            notify('❌ Нет активного просмотра');
            return;
        }
        
        const player = Lampa.Player.playdata();
        if (!player || !player.timeline) {
            notify('❌ Плеер не активен');
            return;
        }
        
        const currentTime = player.timeline.time || lastCurrentTime || 0;
        if (currentTime === 0) {
            notify('❌ Нет данных о времени просмотра');
            return;
        }
        
        // Сохраняем прогресс
        saveCurrentProgress(currentTime);
        
        // Отправляем на Gist
        syncInProgress = true;
        notify(`📤 Отправка таймкода: ${formatTimeShort(currentTime)}...`);
        
        const data = getProgressData();
        
        $.ajax({
            url: `https://api.github.com/gists/${cfg().gist_id}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${cfg().gist_token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            data: JSON.stringify({
                description: 'Lampa Timeline Sync',
                public: false,
                files: { 'timeline.json': { content: JSON.stringify(data, null, 2) } }
            }),
            success: () => {
                notify(`✅ Таймкод отправлен: ${formatTimeShort(currentTime)}`);
                console.log(`[Sync] ✅ Отправлено: ${formatTime(currentTime)} для ${tmdbId}`);
                syncInProgress = false;
            },
            error: (xhr) => {
                notify(`❌ Ошибка: ${xhr.status}`);
                console.error('[Sync] ❌ Ошибка отправки:', xhr.status);
                syncInProgress = false;
            }
        });
    }

    // Загрузить таймкоды с Gist
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
                            
                            if (Lampa.Timeline && Lampa.Timeline.read) {
                                Lampa.Timeline.read(true);
                            }
                            
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

    // Полная синхронизация (отправить + загрузить)
    function fullSync() {
        sendCurrentTimecode();
        setTimeout(() => {
            syncFromGist(true);
        }, 1000);
    }

    // Добавить кнопку в плеер
    function addPlayerButton() {
        // Ждём появления панели плеера
        const checkInterval = setInterval(() => {
            const panel = $('.player-panel__right');
            if (panel.length && !$('.tl-player-sync').length) {
                clearInterval(checkInterval);
                
                const svgIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" fill="currentColor"/></svg>';
                
                const syncBtn = $(`<div class="player-panel__sync button selector tl-player-sync" title="Отправить таймкод">${svgIcon}</div>`);
                syncBtn.on('click', sendCurrentTimecode);
                syncBtn.on('hover:enter', sendCurrentTimecode);
                
                // Добавляем перед кнопкой настроек
                const settingsBtn = panel.find('.player-panel__settings');
                if (settingsBtn.length) {
                    settingsBtn.before(syncBtn);
                } else {
                    panel.append(syncBtn);
                }
                
                console.log('[Sync] Кнопка добавлена в плеер');
            }
        }, 1000);
    }

    // Добавить кнопку в верхнюю панель
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
        
        console.log('[Sync] Кнопка добавлена в верхнюю панель');
    }

    // Добавить кнопку в меню
    function addMenuButton() {
        const svgIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" fill="currentColor"/></svg>';
        
        $('.tl-sync-menu-item').remove();
        
        const menuList = $('.menu__list:eq(0)');
        if (menuList.length) {
            const menuItem = $(`<li class="menu__item selector tl-sync-menu-item"><div class="menu__ico">${svgIcon}</div><div class="menu__text">Синхр.</div></li>`);
            menuItem.on('hover:enter', fullSync);
            menuList.prepend(menuItem);
            console.log('[Sync] Кнопка добавлена в меню');
        }
    }

    function initPlayerHandler() {
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'open' && e.movie) {
                currentMovieId = extractTmdbIdFromItem(e.movie);
                console.log(`[Sync] 🎬 Открыт фильм: ${currentMovieId}`);
                lastCurrentTime = 0;
                
                // Добавляем кнопку в плеер при открытии
                setTimeout(() => {
                    if (cfg().button_position === 'player') {
                        addPlayerButton();
                    }
                }, 1000);
                
                // Загружаем таймкод
                setTimeout(() => {
                    syncFromGist(false, (success) => {
                        if (success) {
                            const fileView = getFileView();
                            if (currentMovieId && fileView[currentMovieId] && fileView[currentMovieId].time) {
                                const savedTime = fileView[currentMovieId].time;
                                console.log(`[Sync] 🎯 Таймкод: ${formatTime(savedTime)}`);
                                notify(`🎯 Таймкод: ${formatTimeShort(savedTime)}`);
                            }
                        }
                    });
                }, 2000);
            }
            
            if (e.type === 'timeupdate' && e.time) {
                lastCurrentTime = e.time;
            }
            
            if (e.type === 'stop') {
                console.log('[Sync] ⏹️ Плеер остановлен');
                if (lastCurrentTime > 0) {
                    saveCurrentProgress(lastCurrentTime);
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
                { title: `📍 Кнопка: ${c.button_position === 'player' ? 'В плеере' : c.button_position === 'head' ? 'Верхняя панель' : 'Левое меню'}`, action: 'position' },
                { title: '──────────', separator: true },
                { title: '📤 Отправить таймкод', action: 'send' },
                { title: '📥 Загрузить таймкоды', action: 'download' },
                { title: '🔄 Полная синхронизация', action: 'force' },
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
                } else if (item.action === 'position') {
                    const positions = ['player', 'head', 'menu'];
                    const currentIdx = positions.indexOf(c.button_position);
                    const newPos = positions[(currentIdx + 1) % positions.length];
                    c.button_position = newPos;
                    saveCfg(c);
                    notify(`Кнопка перемещена в ${newPos === 'player' ? 'плеер' : newPos === 'head' ? 'верхнюю панель' : 'меню'}`);
                    showGistSetup();
                } else if (item.action === 'send') {
                    sendCurrentTimecode();
                    setTimeout(() => showGistSetup(), 1500);
                } else if (item.action === 'download') {
                    syncFromGist(true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'force') {
                    fullSync();
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
        
        console.log(`[Sync] Инициализация. Профиль: ${getCurrentProfileId() || 'глобальный'}`);
        
        const current = getFileView();
        const normalized = normalizeKeys(current);
        if (JSON.stringify(current) !== JSON.stringify(normalized)) {
            console.log('[Sync] Нормализация ключей');
            setFileView(normalized);
        }
        
        initPlayerHandler();
        addSettings();
        
        // Добавляем кнопку в зависимости от настройки
        const buttonPos = cfg().button_position;
        if (buttonPos === 'head') {
            addHeadButton();
        } else if (buttonPos === 'menu') {
            addMenuButton();
        }
        // Кнопка в плеере добавляется при открытии плеера
        
        setTimeout(() => {
            if (cfg().enabled) {
                syncFromGist(false);
            }
        }, 3000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
