(function () {
    'use strict';

    if (window.tl_sync_init) return;
    window.tl_sync_init = true;

    const CFG_KEY = 'timeline_sync_cfg';
    let lastSyncTime = 0;
    let syncInProgress = false;
    let pendingSync = false;
    let currentMovieId = null;
    let lastSavedTime = 0;

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

    // Функция для обновления таймкодов на всех карточках
    function updateAllCardsTimeline() {
        try {
            // Получаем все сохраненные таймкоды
            const fileView = getFileView();
            
            // Находим все карточки на странице
            const cards = document.querySelectorAll('.card');
            let updatedCount = 0;
            
            cards.forEach((card) => {
                // Ищем ID фильма в карточке
                const cardData = card.card_data;
                if (cardData && cardData.id) {
                    const tmdbId = String(cardData.id);
                    const saved = fileView[tmdbId];
                    
                    if (saved && saved.percent && saved.percent > 0) {
                        // Ищем или создаем элемент таймкода в карточке
                        let timelineElem = card.querySelector('.time-line');
                        
                        if (!timelineElem) {
                            // Создаем элемент таймкода
                            timelineElem = document.createElement('div');
                            timelineElem.className = 'time-line';
                            timelineElem.setAttribute('data-hash', tmdbId);
                            
                            const percentDiv = document.createElement('div');
                            percentDiv.style.width = saved.percent + '%';
                            timelineElem.appendChild(percentDiv);
                            
                            // Добавляем в карточку (обычно в .card__view или .card-watched__item)
                            const viewElem = card.querySelector('.card__view, .card-watched__item');
                            if (viewElem) {
                                viewElem.appendChild(timelineElem);
                                updatedCount++;
                            }
                        } else {
                            // Обновляем существующий
                            const percentDiv = timelineElem.querySelector('div');
                            if (percentDiv) {
                                percentDiv.style.width = saved.percent + '%';
                                updatedCount++;
                            }
                        }
                        
                        // Показываем таймкод
                        if (timelineElem) {
                            timelineElem.style.display = '';
                            timelineElem.classList.remove('hide');
                        }
                    }
                }
            });
            
            if (updatedCount > 0) {
                console.log(`[Sync] Обновлено таймкодов на карточках: ${updatedCount}`);
            }
            
            // Также обновляем через Lampa.Layer
            if (Lampa.Layer && Lampa.Layer.update) {
                Lampa.Layer.update();
            }
            
            // Триггерим событие для обновления видимых элементов
            const visibleElements = document.querySelectorAll('.layer--visible');
            visibleElements.forEach(el => {
                if (el.dispatchEvent) {
                    el.dispatchEvent(new Event('visible'));
                }
            });
            
        } catch(e) {
            console.error('[Sync] Ошибка обновления карточек:', e);
        }
    }

    // Обновление таймкодов для конкретного фильма
    function updateCardTimeline(movieId, percent) {
        try {
            const cards = document.querySelectorAll('.card');
            const tmdbId = String(movieId);
            
            cards.forEach((card) => {
                const cardData = card.card_data;
                if (cardData && String(cardData.id) === tmdbId) {
                    let timelineElem = card.querySelector('.time-line');
                    
                    if (!timelineElem) {
                        timelineElem = document.createElement('div');
                        timelineElem.className = 'time-line';
                        timelineElem.setAttribute('data-hash', tmdbId);
                        
                        const percentDiv = document.createElement('div');
                        percentDiv.style.width = percent + '%';
                        timelineElem.appendChild(percentDiv);
                        
                        const viewElem = card.querySelector('.card__view, .card-watched__item');
                        if (viewElem) {
                            viewElem.appendChild(timelineElem);
                        }
                    } else {
                        const percentDiv = timelineElem.querySelector('div');
                        if (percentDiv) {
                            percentDiv.style.width = percent + '%';
                        }
                        timelineElem.style.display = '';
                        timelineElem.classList.remove('hide');
                    }
                }
            });
        } catch(e) {
            console.error('[Sync] Ошибка обновления карточки:', e);
        }
    }

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
            console.log(`[Sync] 💾 Сохранён прогресс: ${formatTime(currentTime)} (${percent}%) для ${tmdbId}`);
            
            // Обновляем карточку на месте
            updateCardTimeline(tmdbId, percent);
            
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
                lastSyncTime = Date.now();
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
                            
                            // Обновляем все карточки после загрузки
                            setTimeout(() => {
                                updateAllCardsTimeline();
                            }, 500);
                            
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

    // Наблюдатель за появлением новых карточек
    function observeNewCards() {
        const observer = new MutationObserver((mutations) => {
            let hasNewCards = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            if (node.classList && node.classList.contains('card')) {
                                hasNewCards = true;
                            } else if (node.querySelectorAll) {
                                if (node.querySelectorAll('.card').length > 0) {
                                    hasNewCards = true;
                                }
                            }
                        }
                    });
                }
            });
            
            if (hasNewCards) {
                setTimeout(() => {
                    updateAllCardsTimeline();
                }, 100);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        return observer;
    }

    function initPlayerHandler() {
        let currentTime = 0;
        let saveInterval = null;
        
        Lampa.Listener.follow('player', (e) => {
            if (e.type === 'open' && e.movie) {
                currentMovieId = extractTmdbIdFromItem(e.movie);
                console.log(`[Sync] 🎬 Открыт фильм: ${currentMovieId}`);
                
                // Загружаем свежие таймкоды перед просмотром
                setTimeout(() => {
                    syncFromGist(false, (success) => {
                        if (success) {
                            const fileView = getFileView();
                            if (currentMovieId && fileView[currentMovieId] && fileView[currentMovieId].time) {
                                const savedTime = fileView[currentMovieId].time;
                                console.log(`[Sync] 🎯 Таймкод: ${formatTime(savedTime)}`);
                                
                                try {
                                    const player = Lampa.Player.playdata();
                                    if (player && player.timeline) {
                                        player.timeline.time = savedTime;
                                        player.timeline.percent = fileView[currentMovieId].percent;
                                        player.timeline.continued = false;
                                    }
                                } catch(err) {
                                    console.log('[Sync] Не удалось применить таймкод');
                                }
                                notify(`🎯 Таймкод: ${formatTime(savedTime)}`);
                            }
                        }
                    });
                }, 2000);
            }
            
            if (e.type === 'timeupdate' && e.time) {
                currentTime = e.time;
            }
            
            if (e.type === 'stop') {
                console.log('[Sync] ⏹️ Просмотр остановлен');
                if (currentTime > 0) {
                    saveCurrentProgress(currentTime);
                }
                if (cfg().sync_on_stop) {
                    syncToGist(false);
                }
            }
            
            if (e.type === 'pause') {
                console.log('[Sync] ⏸️ Просмотр на паузе');
                if (currentTime > 0) {
                    saveCurrentProgress(currentTime);
                }
                if (cfg().sync_on_stop) {
                    syncToGist(false);
                }
            }
        });
        
        // Интервал для сохранения прогресса
        saveInterval = setInterval(() => {
            if (currentTime > 0 && Lampa.Player.opened()) {
                saveCurrentProgress(currentTime);
            }
        }, 10000);
    }

    function startBackgroundSync() {
        setInterval(() => {
            if (!syncInProgress && cfg().enabled) {
                syncFromGist(false);
            }
        }, 60000);
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
                { title: '🔄 Отправить таймкоды', action: 'upload' },
                { title: '📥 Загрузить таймкоды', action: 'download' },
                { title: '🔄 Обновить карточки', action: 'refresh_cards' },
                { title: '🔄 Полная синхронизация', action: 'force' },
                { title: '──────────', separator: true },
                { title: '❌ Отмена', action: 'cancel' }
            ],
            onSelect: async (item) => {
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
                } else if (item.action === 'upload') {
                    syncToGist(true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'download') {
                    syncFromGist(true);
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'refresh_cards') {
                    updateAllCardsTimeline();
                    notify('🔄 Карточки обновлены');
                    setTimeout(() => showGistSetup(), 1000);
                } else if (item.action === 'force') {
                    notify('🔄 Полная синхронизация...');
                    syncToGist(true);
                    setTimeout(() => {
                        syncFromGist(true);
                        setTimeout(() => updateAllCardsTimeline(), 1000);
                    }, 1000);
                    setTimeout(() => showGistSetup(), 2500);
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
        Lampa.SettingsApi.addParam({
            component: 'timeline_sync',
            param: { name: 'sync_on_stop', type: 'toggle', default: true },
            field: { name: 'Синхронизировать при остановке' },
            onChange: v => { const c = cfg(); c.sync_on_stop = v; saveCfg(c); }
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
        startBackgroundSync();
        
        // Наблюдаем за появлением новых карточек
        observeNewCards();
        
        // Обновляем карточки при смене активности
        Lampa.Listener.follow('activity', (e) => {
            if (e.type === 'start') {
                setTimeout(() => {
                    updateAllCardsTimeline();
                }, 500);
            }
        });
        
        // Обновляем карточки при скролле (появляются новые)
        window.addEventListener('scroll', () => {
            clearTimeout(window.tl_scroll_timer);
            window.tl_scroll_timer = setTimeout(() => {
                updateAllCardsTimeline();
            }, 300);
        });
        
        // Первая синхронизация и обновление карточек
        setTimeout(() => {
            if (cfg().enabled) {
                syncFromGist(false, () => {
                    updateAllCardsTimeline();
                });
            }
        }, 3000);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => e.type === 'ready' && init());
})();
