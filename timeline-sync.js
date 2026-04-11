(function() {
    'use strict';
    
    if (window.tl_simple_init) return;
    window.tl_simple_init = true;
    
    console.log('[TL] Простой плагин синхронизации загружен');
    
    const STORAGE_KEY = 'timeline_sync_config';
    let config = Lampa.Storage.get(STORAGE_KEY, {
        token: '',
        gist_id: '',
        profile_id: ''
    });
    
    function saveConfig() {
        Lampa.Storage.set(STORAGE_KEY, config, true);
    }
    
    function getProfileId() {
        if (config.profile_id) return config.profile_id;
        let id = Lampa.Storage.get('profile_id', '');
        if (!id) {
            const acc = Lampa.Storage.get('account_user', {});
            id = acc.profile || '';
        }
        return id;
    }
    
    // Сохранение прогресса при просмотре
    Lampa.Listener.follow('player', (e) => {
        if (e.type === 'timeupdate' && e.time && e.duration) {
            const percent = Math.floor((e.time / e.duration) * 100);
            
            // Сохраняем при изменении на 5%
            if (window._lastPercent !== percent && Math.abs(window._lastPercent - percent) >= 5) {
                window._lastPercent = percent;
                
                const activity = Lampa.Activity.active();
                const movie = activity?.movie;
                let tmdbId = movie?.tmdb_id || movie?.id;
                
                if (tmdbId && /^\d+$/.test(String(tmdbId))) {
                    // Сохраняем в стандартное хранилище
                    Lampa.Storage.set(`timeline_${tmdbId}`, {
                        percent: percent,
                        updated: Date.now()
                    }, true);
                    console.log(`[TL] Сохранён прогресс: ${tmdbId} = ${percent}%`);
                }
            }
        }
        
        if (e.type === 'stop' || e.type === 'pause') {
            // При паузе/остановке отправляем на сервер
            if (config.token && config.gist_id) {
                uploadToGist();
            }
        }
    });
    
    // При открытии плеера восстанавливаем прогресс
    Lampa.Listener.follow('player', (e) => {
        if (e.type === 'open' && e.movie) {
            const tmdbId = e.movie.tmdb_id || e.movie.id;
            if (tmdbId && /^\d+$/.test(String(tmdbId))) {
                setTimeout(() => {
                    const saved = Lampa.Storage.get(`timeline_${tmdbId}`, {});
                    if (saved.percent && saved.percent > 0 && saved.percent < 95) {
                        const player = Lampa.Player.current();
                        if (player && player.duration) {
                            const duration = player.duration();
                            const seekTime = (saved.percent / 100) * duration;
                            console.log(`[TL] Восстанавливаем прогресс: ${saved.percent}%`);
                            if (player.seek) player.seek(seekTime);
                        }
                    }
                }, 1000);
            }
        }
    });
    
    function uploadToGist() {
        const profileId = getProfileId();
        const allTimelines = {};
        
        // Собираем все таймкоды
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('timeline_')) {
                const tmdbId = key.replace('timeline_', '');
                const data = Lampa.Storage.get(key, {});
                if (data.percent) {
                    allTimelines[tmdbId] = data;
                }
            }
        }
        
        const data = {
            version: 1,
            profile_id: profileId,
            updated: Date.now(),
            timelines: allTimelines
        };
        
        console.log(`[TL] Отправка ${Object.keys(allTimelines).length} таймкодов`);
        
        $.ajax({
            url: `https://api.github.com/gists/${config.gist_id}`,
            method: 'PATCH',
            headers: {
                'Authorization': `token ${config.token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            data: JSON.stringify({
                description: 'Lampa Timeline Backup',
                files: { 'timeline.json': { content: JSON.stringify(data, null, 2) } }
            }),
            success: () => console.log('[TL] Отправлено успешно'),
            error: (xhr) => console.error('[TL] Ошибка:', xhr.status)
        });
    }
    
    function downloadFromGist() {
        console.log('[TL] Загрузка с Gist...');
        
        $.ajax({
            url: `https://api.github.com/gists/${config.gist_id}`,
            headers: {
                'Authorization': `token ${config.token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            success: (response) => {
                const content = response.files['timeline.json']?.content;
                if (content) {
                    const data = JSON.parse(content);
                    const timelines = data.timelines || {};
                    
                    console.log(`[TL] Загружено ${Object.keys(timelines).length} таймкодов`);
                    
                    let restored = 0;
                    for (const tmdbId in timelines) {
                        const tl = timelines[tmdbId];
                        const existing = Lampa.Storage.get(`timeline_${tmdbId}`, {});
                        
                        // Восстанавливаем если нет локального или локальный старше
                        if (!existing.percent || (tl.updated || 0) > (existing.updated || 0)) {
                            Lampa.Storage.set(`timeline_${tmdbId}`, tl, true);
                            restored++;
                            console.log(`[TL] Восстановлен ${tmdbId}: ${tl.percent}%`);
                        }
                    }
                    
                    console.log(`[TL] Восстановлено ${restored} таймкодов`);
                    Lampa.Noty.show(`📥 Загружено ${restored} таймкодов`);
                }
            },
            error: (xhr) => console.error('[TL] Ошибка:', xhr.status)
        });
    }
    
    // Меню настроек
    Lampa.SettingsApi.addComponent({
        component: 'timeline_simple',
        name: 'Синхронизация (простая)',
        icon: '<svg><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/></svg>'
    });
    
    Lampa.SettingsApi.addParam({
        component: 'timeline_simple',
        param: { name: 'setup', type: 'button' },
        field: { name: '⚙️ Настройки' },
        onChange: () => {
            Lampa.Select.show({
                title: 'Синхронизация таймкодов',
                items: [
                    { title: `Токен: ${config.token ? '✓' : '❌'}`, action: 'token' },
                    { title: `Gist ID: ${config.gist_id ? config.gist_id.substring(0,8)+'…' : '❌'}`, action: 'gist' },
                    { title: `Профиль: ${config.profile_id || 'авто'}`, action: 'profile' },
                    { title: '──────────', separator: true },
                    { title: '📥 Загрузить с Gist', action: 'download' },
                    { title: '📤 Отправить на Gist', action: 'upload' },
                    { title: '──────────', separator: true },
                    { title: '❌ Отмена', action: 'cancel' }
                ],
                onSelect: (item) => {
                    if (item.action === 'token') {
                        Lampa.Input.edit({ title: 'GitHub Token', value: config.token, free: true }, (val) => {
                            if (val !== null) { config.token = val || ''; saveConfig(); Lampa.Noty.show('Сохранено'); }
                            Lampa.Controller.toggle('settings');
                        });
                    } else if (item.action === 'gist') {
                        Lampa.Input.edit({ title: 'Gist ID', value: config.gist_id, free: true }, (val) => {
                            if (val !== null) { config.gist_id = val || ''; saveConfig(); Lampa.Noty.show('Сохранено'); }
                            Lampa.Controller.toggle('settings');
                        });
                    } else if (item.action === 'profile') {
                        Lampa.Input.edit({ title: 'ID профиля (пусто = авто)', value: config.profile_id, free: true }, (val) => {
                            if (val !== null) { config.profile_id = val || ''; saveConfig(); Lampa.Noty.show('Сохранено'); }
                            Lampa.Controller.toggle('settings');
                        });
                    } else if (item.action === 'download') {
                        downloadFromGist();
                        setTimeout(() => Lampa.Controller.toggle('settings'), 1000);
                    } else if (item.action === 'upload') {
                        uploadToGist();
                        setTimeout(() => Lampa.Controller.toggle('settings'), 1000);
                    }
                }
            });
        }
    });
    
    // Автоматическая загрузка при старте
    setTimeout(() => {
        if (config.token && config.gist_id) {
            downloadFromGist();
        }
    }, 5000);
})();
