(function() {
    'use strict';
    
    // Защита от повторной инициализации
    if (window.SmartFiltersFinal) return;
    window.SmartFiltersFinal = true;
    
    console.log('[SmartFilters] Плагин загружается...');
    
    // --- Конфигурация ---
    const PLUGIN_NAME = 'Smart Filters';
    const STORAGE_KEY = 'smart_filters_saved_filters';
    
    // --- Данные ---
    let savedFilters = [];
    
    // --- Загрузка/сохранение ---
    function loadSavedFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        if (data && Array.isArray(data)) {
            savedFilters = data;
        } else {
            savedFilters = [];
        }
        console.log('[SmartFilters] Загружено фильтров:', savedFilters.length);
    }
    
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenuItems();
    }
    
    // --- Получение текущих параметров фильтра из активного компонента ---
    function getCurrentFilterParams() {
        try {
            var params = {};
            // Пытаемся получить параметры из активного фильтра
            if (Lampa.Controller && Lampa.Controller.filters && Lampa.Controller.filters.params) {
                var p = Lampa.Controller.filters.params;
                if (p.genres && p.genres.length) params.genres = p.genres;
                if (p.year) params.year = p.year;
                if (p.yearFrom) params.yearFrom = p.yearFrom;
                if (p.yearTo) params.yearTo = p.yearTo;
                if (p.countries && p.countries.length) params.countries = p.countries;
                if (p.sort) params.sort = p.sort;
                if (p.ratingFrom) params.ratingFrom = p.ratingFrom;
                if (p.ratingTo) params.ratingTo = p.ratingTo;
                if (p.keyword) params.keyword = p.keyword;
            }
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка получения фильтра:', e);
            return null;
        }
    }
    
    // --- Применение фильтра и переход в раздел ---
    function applyFilterAndNavigate(filterName, filterParams) {
        console.log('[SmartFilters] Применяем фильтр:', filterName);
        
        // Определяем текущий раздел (фильмы или сериалы)
        var currentActivity = Lampa.Activity.active();
        var targetComponent = 'catalog';
        var targetUrl = '';
        
        // Если мы в разделе фильмов или сериалов, используем его
        if (currentActivity) {
            var component = currentActivity.component;
            if (component === 'catalog' || component === 'movie' || component === 'tv' || component === 'serial') {
                targetComponent = component;
                targetUrl = currentActivity.url || '';
            }
        }
        
        // Если не определили, по умолчанию открываем фильмы
        if (!targetUrl) {
            targetUrl = 'https://tmdb.' + Lampa.Manifest.cub_domain + '/3/discover/movie?api_key=4ef0d7355d9ffb5151e987764708ce96&language=ru';
        }
        
        // Сохраняем параметры фильтра во временное хранилище
        Lampa.Storage.set('smart_filters_temp_params', filterParams);
        
        // Переходим в раздел
        Lampa.Activity.push({
            url: targetUrl,
            title: filterName,
            component: targetComponent,
            page: 1
        });
        
        // После перехода применяем фильтр
        setTimeout(function() {
            if (Lampa.Controller && Lampa.Controller.filters) {
                Lampa.Controller.filters.setParams(filterParams);
                if (Lampa.Controller.filters.update) Lampa.Controller.filters.update();
                if (Lampa.Controller.filters.reload) Lampa.Controller.filters.reload();
            }
            if (Lampa.Notify) Lampa.Notify.show('✓ Фильтр "' + filterName + '" применён', 1500);
        }, 500);
    }
    
    // --- Открыть стандартный интерфейс фильтрации ---
    function openFilterInterface() {
        console.log('[SmartFilters] Открываем интерфейс фильтрации');
        
        // Получаем текущий активный раздел
        var currentActivity = Lampa.Activity.active();
        if (currentActivity && currentActivity.component === 'catalog') {
            // Если уже в каталоге, открываем фильтр
            if (Lampa.Controller && Lampa.Controller.filters) {
                Lampa.Controller.toggle('filter');
            }
        } else {
            // Иначе переходим в каталог фильмов и открываем фильтр
            Lampa.Activity.push({
                url: 'https://tmdb.' + Lampa.Manifest.cub_domain + '/3/discover/movie?api_key=4ef0d7355d9ffb5151e987764708ce96&language=ru',
                title: 'Фильмы',
                component: 'catalog',
                page: 1
            });
            setTimeout(function() {
                if (Lampa.Controller && Lampa.Controller.filters) {
                    Lampa.Controller.toggle('filter');
                }
            }, 500);
        }
    }
    
    // --- Сохранить текущий фильтр ---
    function saveCurrentFilter() {
        var currentParams = getCurrentFilterParams();
        
        if (!currentParams) {
            if (Lampa.Notify) Lampa.Notify.show('✗ Сначала откройте фильтр и примените параметры', 2000);
            return;
        }
        
        var name = prompt('Введите название фильтра:', 'Мой фильтр');
        if (!name || !name.trim()) return;
        
        savedFilters.push({
            id: Date.now().toString(),
            name: name.trim(),
            params: currentParams,
            date: new Date().toLocaleString()
        });
        saveFilters();
        
        if (Lampa.Notify) Lampa.Notify.show('✓ Фильтр "' + name + '" сохранён', 2000);
    }
    
    // --- Создать новый фильтр (открыть фильтр, потом сохранить) ---
    function createNewFilter() {
        // Открываем интерфейс фильтрации
        openFilterInterface();
        
        // Показываем подсказку
        setTimeout(function() {
            if (Lampa.Notify) {
                Lampa.Notify.show('Настройте фильтр, затем нажмите "Сохранить фильтр"', 3000);
            }
        }, 1000);
    }
    
    // --- Обновить пункты меню ---
    function updateMenuItems() {
        // Удаляем все пункты, созданные плагином
        $('.menu__item[data-name^="smart_filter_"]').remove();
        
        // Добавляем основной пункт меню
        addMainMenuItem();
        
        // Добавляем пункты для каждого сохранённого фильтра
        savedFilters.forEach(function(filter) {
            addFilterMenuItem(filter);
        });
    }
    
    // --- Добавить основной пункт меню ---
    function addMainMenuItem() {
        // Удаляем старый
        $('.menu__item[data-name="smart_filters_main"]').remove();
        
        var button = $('<li class="menu__item selector" data-name="smart_filters_main">\
            <div class="menu__ico">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">\
                    <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/>\
                </svg>\
            </div>\
            <div class="menu__text">' + PLUGIN_NAME + '</div>\
        </li>');
        
        var settingsItem = $('.menu .menu__list .menu__item[data-name="settings"]');
        if (settingsItem.length) {
            settingsItem.before(button);
        } else {
            $('.menu .menu__list').eq(0).append(button);
        }
        
        // Обработчик основного пункта
        button.off('hover:enter').on('hover:enter', function() {
            showMainSubmenu();
        });
    }
    
    // --- Добавить пункт для сохранённого фильтра ---
    function addFilterMenuItem(filter) {
        var menuName = 'smart_filter_' + filter.id;
        
        var button = $('<li class="menu__item selector" data-name="' + menuName + '">\
            <div class="menu__ico">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">\
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>\
                </svg>\
            </div>\
            <div class="menu__text">🔖 ' + filter.name + '</div>\
        </li>');
        
        // Добавляем перед основным пунктом
        var mainItem = $('.menu__item[data-name="smart_filters_main"]');
        if (mainItem.length) {
            mainItem.before(button);
        } else {
            var settingsItem = $('.menu .menu__list .menu__item[data-name="settings"]');
            if (settingsItem.length) {
                settingsItem.before(button);
            } else {
                $('.menu .menu__list').eq(0).append(button);
            }
        }
        
        // Обработчик для применения фильтра
        button.off('hover:enter').on('hover:enter', function() {
            console.log('[SmartFilters] Применяем фильтр:', filter.name);
            applyFilterAndNavigate(filter.name, filter.params);
        });
        
        // Удаление при долгом нажатии
        button.on('contextmenu', function(e) {
            e.preventDefault();
            if (confirm('Удалить фильтр "' + filter.name + '"?')) {
                savedFilters = savedFilters.filter(function(f) { return f.id !== filter.id; });
                saveFilters();
                if (Lampa.Notify) Lampa.Notify.show('✓ Фильтр удалён', 2000);
            }
            return false;
        });
    }
    
    // --- Показать подменю основного пункта ---
    function showMainSubmenu() {
        $('.menu__submenu[data-parent="smart_filters_main"]').remove();
        
        var submenuHtml = '<div class="menu__submenu" data-parent="smart_filters_main" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 220px; z-index: 1000;">';
        submenuHtml += '<div class="menu__submenu-item selector" data-action="save_current" style="padding: 12px 16px; cursor: pointer;">💾 Сохранить текущий фильтр</div>';
        submenuHtml += '<div class="menu__submenu-item selector" data-action="create_new" style="padding: 12px 16px; cursor: pointer;">✨ Создать новый фильтр</div>';
        submenuHtml += '<div class="menu__submenu-item selector" data-action="clear_all" style="padding: 12px 16px; cursor: pointer;">🗑️ Очистить все фильтры</div>';
        submenuHtml += '</div>';
        
        $('body').append(submenuHtml);
        
        $('[data-action="save_current"]').off('hover:enter').on('hover:enter', function() {
            saveCurrentFilter();
            $('.menu__submenu[data-parent="smart_filters_main"]').remove();
        });
        
        $('[data-action="create_new"]').off('hover:enter').on('hover:enter', function() {
            createNewFilter();
            $('.menu__submenu[data-parent="smart_filters_main"]').remove();
        });
        
        $('[data-action="clear_all"]').off('hover:enter').on('hover:enter', function() {
            if (confirm('Удалить ВСЕ сохранённые фильтры?')) {
                savedFilters = [];
                saveFilters();
                if (Lampa.Notify) Lampa.Notify.show('✓ Все фильтры удалены', 2000);
            }
            $('.menu__submenu[data-parent="smart_filters_main"]').remove();
        });
    }
    
    // --- Добавление кнопки в интерфейс фильтра ---
    function addFilterButton() {
        var interval = setInterval(function() {
            var filterPanel = $('.filter-panel .buttons, .filters-panel .buttons');
            if (filterPanel.length && !$('.smart-filters-save-btn').length) {
                var btnHtml = '<div class="button smart-filters-save-btn selector" style="margin-left: 10px;">\
                    <div class="button__icon">💾</div>\
                    <div class="button__text">Сохранить фильтр</div>\
                </div>';
                filterPanel.append(btnHtml);
                
                $('.smart-filters-save-btn').off('hover:enter').on('hover:enter', function() {
                    saveCurrentFilter();
                });
                
                clearInterval(interval);
                console.log('[SmartFilters] Кнопка сохранения добавлена');
            }
        }, 1000);
    }
    
    // --- Добавление раздела в настройки ---
    function addSettings() {
        try {
            if (typeof Lampa.SettingsApi === 'undefined') return;
            
            Lampa.SettingsApi.addComponent({
                component: 'smart_filters_settings',
                name: PLUGIN_NAME,
                icon: '🔖'
            });
            
            Lampa.SettingsApi.addParam({
                component: 'smart_filters_settings',
                param: { name: 'clear_all', type: 'button' },
                field: { name: 'Очистить все сохранённые фильтры' },
                onChange: function() {
                    if (confirm('Удалить ВСЕ сохранённые фильтры?')) {
                        savedFilters = [];
                        saveFilters();
                        if (Lampa.Notify) Lampa.Notify.show('✓ Все фильтры удалены', 2000);
                    }
                }
            });
            
            Lampa.SettingsApi.addParam({
                component: 'smart_filters_settings',
                param: { name: 'count_info', type: 'info' },
                field: {
                    name: 'Сохранённых фильтров',
                    value: function() { return savedFilters.length + ' шт.'; }
                }
            });
            
        } catch(e) {
            console.error('[SmartFilters] Ошибка добавления настроек:', e);
        }
    }
    
    // --- Инициализация ---
    function initPlugin() {
        console.log('[SmartFilters] Инициализация...');
        
        try {
            loadSavedFilters();
            addMainMenuItem();
            updateMenuItems();
            addFilterButton();
            addSettings();
            
            console.log('[SmartFilters] Готов к работе!');
            if (Lampa.Notify) Lampa.Notify.show(PLUGIN_NAME + ' загружен', 2000);
        } catch(e) {
            console.error('[SmartFilters] Ошибка инициализации:', e);
        }
    }
    
    // --- Запуск ---
    if (window.appready) {
        initPlugin();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                initPlugin();
            }
        });
    }
    
    console.log('[SmartFilters] Плагин загружен');
})();
