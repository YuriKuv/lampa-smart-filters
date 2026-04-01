(function() {
    'use strict';
    
    // Защита от повторной инициализации
    if (window.SmartFiltersV2) return;
    window.SmartFiltersV2 = true;
    
    console.log('[SmartFilters] Плагин загружается...');
    
    // --- Конфигурация ---
    const PLUGIN_NAME = 'Smart Filters';
    const STORAGE_KEY = 'smart_filters_saved';
    
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
    }
    
    // --- Получение текущих параметров фильтра ---
    function getCurrentFilterParams() {
        try {
            var params = {};
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
    
    // --- Применение сохранённого фильтра ---
    function applyFilter(params) {
        try {
            if (!params) return false;
            
            if (Lampa.Controller && Lampa.Controller.filters) {
                if (typeof Lampa.Controller.filters.setParams === 'function') {
                    Lampa.Controller.filters.setParams(params);
                } else {
                    Lampa.Controller.filters.params = params;
                }
                if (Lampa.Controller.filters.update) Lampa.Controller.filters.update();
                if (Lampa.Controller.filters.reload) Lampa.Controller.filters.reload();
            }
            
            if (Lampa.Notify) Lampa.Notify.show('✓ Фильтр применён', 1500);
            return true;
        } catch(e) {
            console.error('[SmartFilters] Ошибка применения:', e);
            return false;
        }
    }
    
    // --- Сохранение текущего фильтра ---
    function saveCurrentFilter() {
        var currentFilter = getCurrentFilterParams();
        if (!currentFilter) {
            if (Lampa.Notify) Lampa.Notify.show('✗ Нет активных параметров фильтра', 2000);
            return;
        }
        
        var name = prompt('Введите название фильтра:', 'Мой фильтр');
        if (!name || !name.trim()) return;
        
        savedFilters.push({
            id: Date.now().toString(),
            name: name.trim(),
            params: currentFilter,
            date: new Date().toLocaleString()
        });
        saveFilters();
        
        if (Lampa.Notify) Lampa.Notify.show('✓ Фильтр "' + name + '" сохранён', 2000);
        console.log('[SmartFilters] Фильтр сохранён:', name);
    }
    
    // --- Показать список фильтров ---
    function showFiltersList() {
        if (savedFilters.length === 0) {
            if (Lampa.Notify) Lampa.Notify.show('📭 Нет сохранённых фильтров', 2000);
            return;
        }
        
        var message = '📋 Сохранённые фильтры:\n\n';
        for (var i = 0; i < savedFilters.length; i++) {
            message += (i + 1) + '. ' + savedFilters[i].name + '\n';
            message += '   (сохранён: ' + savedFilters[i].date + ')\n\n';
        }
        message += 'Введите номер для применения:';
        
        var choice = prompt(message);
        if (choice && !isNaN(choice) && choice > 0 && choice <= savedFilters.length) {
            applyFilter(savedFilters[choice - 1].params);
        }
    }
    
    // --- Удалить все фильтры ---
    function clearAllFilters() {
        if (confirm('Удалить все сохранённые фильтры?')) {
            savedFilters = [];
            saveFilters();
            if (Lampa.Notify) Lampa.Notify.show('✓ Все фильтры удалены', 2000);
        }
    }
    
    // --- Добавление пункта в левое меню (как в kinopoisk.js) ---
    function addMenuItem() {
        console.log('[SmartFilters] Добавление пункта в меню...');
        
        // Удаляем старый, если есть
        $('.menu__item[data-name="smart_filters_menu"]').remove();
        
        // Создаём пункт меню
        var button = $('<li class="menu__item selector" data-name="smart_filters_menu">\
            <div class="menu__ico">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">\
                    <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/>\
                </svg>\
            </div>\
            <div class="menu__text">' + PLUGIN_NAME + '</div>\
        </li>');
        
        // Добавляем перед настройками
        var settingsItem = $('.menu .menu__list .menu__item[data-name="settings"]');
        if (settingsItem.length) {
            settingsItem.before(button);
        } else {
            $('.menu .menu__list').eq(0).append(button);
        }
        
        // Обработчик нажатия
        button.on('hover:enter', function() {
            console.log('[SmartFilters] Открываем меню');
            
            // Удаляем старое подменю
            $('.menu__submenu[data-parent="smart_filters_menu"]').remove();
            
            // Создаём подменю
            var submenuHtml = '<div class="menu__submenu" data-parent="smart_filters_menu" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 200px; z-index: 1000;">';
            submenuHtml += '<div class="menu__submenu-item selector" data-action="save" style="padding: 12px 16px; cursor: pointer;">💾 Сохранить текущий фильтр</div>';
            submenuHtml += '<div class="menu__submenu-item selector" data-action="list" style="padding: 12px 16px; cursor: pointer;">📋 Мои фильтры</div>';
            submenuHtml += '<div class="menu__submenu-item selector" data-action="clear" style="padding: 12px 16px; cursor: pointer;">🗑️ Очистить все</div>';
            submenuHtml += '</div>';
            
            $('body').append(submenuHtml);
            
            // Обработчики подменю
            $('[data-action="save"]').off('hover:enter').on('hover:enter', function() {
                saveCurrentFilter();
                $('.menu__submenu[data-parent="smart_filters_menu"]').remove();
            });
            
            $('[data-action="list"]').off('hover:enter').on('hover:enter', function() {
                showFiltersList();
                $('.menu__submenu[data-parent="smart_filters_menu"]').remove();
            });
            
            $('[data-action="clear"]').off('hover:enter').on('hover:enter', function() {
                clearAllFilters();
                $('.menu__submenu[data-parent="smart_filters_menu"]').remove();
            });
        });
        
        console.log('[SmartFilters] Пункт меню добавлен');
    }
    
    // --- Добавление кнопки в интерфейс фильтра ---
    function addFilterButton() {
        console.log('[SmartFilters] Добавление кнопки в фильтр...');
        
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
            if (typeof Lampa.SettingsApi === 'undefined') {
                console.log('[SmartFilters] SettingsApi не доступен');
                return;
            }
            
            Lampa.SettingsApi.addComponent({
                component: 'smart_filters_settings',
                name: PLUGIN_NAME,
                icon: '🔖'
            });
            
            Lampa.SettingsApi.addParam({
                component: 'smart_filters_settings',
                param: {
                    name: 'clear_all',
                    type: 'button'
                },
                field: {
                    name: 'Очистить все сохранённые фильтры',
                    description: 'Удалить все сохранённые фильтры'
                },
                onChange: function() {
                    clearAllFilters();
                }
            });
            
            // Показываем количество сохранённых фильтров
            Lampa.SettingsApi.addParam({
                component: 'smart_filters_settings',
                param: {
                    name: 'count_info',
                    type: 'info'
                },
                field: {
                    name: 'Сохранённых фильтров',
                    value: function() { return savedFilters.length + ' шт.'; }
                }
            });
            
            console.log('[SmartFilters] Раздел настроек добавлен');
        } catch(e) {
            console.error('[SmartFilters] Ошибка добавления настроек:', e);
        }
    }
    
    // --- Обновление настроек при изменении фильтров ---
    function updateSettingsInfo() {
        var countEl = $('.settings-param[data-name="count_info"] .settings-param__value');
        if (countEl.length) {
            countEl.text(savedFilters.length + ' шт.');
        }
    }
    
    // --- Инициализация плагина ---
    function initPlugin() {
        console.log('[SmartFilters] Инициализация...');
        
        try {
            loadSavedFilters();
            addMenuItem();
            addFilterButton();
            addSettings();
            
            console.log('[SmartFilters] Готов к работе!');
            if (Lampa.Notify) Lampa.Notify.show(PLUGIN_NAME + ' загружен', 2000);
        } catch(e) {
            console.error('[SmartFilters] Ошибка инициализации:', e);
        }
    }
    
    // --- Запуск (как в kinopoisk.js) ---
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
