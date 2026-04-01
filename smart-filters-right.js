(function() {
    'use strict';
    
    // Защита от повторной инициализации
    if (window.SmartFiltersRight) return;
    window.SmartFiltersRight = true;
    
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
        updateMenuItems();
    }
    
    // --- Получение текущих параметров фильтра из панели справа ---
    function getCurrentFilterParams() {
        try {
            var params = {};
            
            // Получаем параметры из стандартного компонента фильтра Lampa
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
            
            // Применяем параметры к стандартному фильтру Lampa
            if (Lampa.Controller && Lampa.Controller.filters) {
                Lampa.Controller.filters.setParams(params);
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
        var currentParams = getCurrentFilterParams();
        
        if (!currentParams) {
            if (Lampa.Notify) Lampa.Notify.show('✗ Сначала настройте фильтр', 2000);
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
    
    // --- Показать список фильтров ---
    function showFiltersList() {
        if (savedFilters.length === 0) {
            if (Lampa.Notify) Lampa.Notify.show('📭 Нет сохранённых фильтров', 2000);
            return;
        }
        
        var message = '📋 Сохранённые фильтры:\n\n';
        for (var i = 0; i < savedFilters.length; i++) {
            message += (i + 1) + '. ' + savedFilters[i].name + '\n';
        }
        message += '\nВведите номер для применения:';
        
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
    
    // --- Обновить пункты в левом меню ---
    function updateMenuItems() {
        // Удаляем старые пункты
        $('.menu__item[data-name^="smart_filter_saved_"]').remove();
        
        // Находим пункт "Фильтр" в меню
        var filterMenuItem = $('.menu__item[data-name="filter"]');
        
        // Добавляем пункты для сохранённых фильтров после пункта "Фильтр"
        savedFilters.forEach(function(filter) {
            var button = $('<li class="menu__item selector" data-name="smart_filter_saved_' + filter.id + '">\
                <div class="menu__ico">\
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">\
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>\
                    </svg>\
                </div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
            </li>');
            
            if (filterMenuItem.length) {
                filterMenuItem.after(button);
            } else {
                $('.menu .menu__list').eq(0).append(button);
            }
            
            // Применение фильтра при нажатии
            button.off('hover:enter').on('hover:enter', function() {
                applyFilter(filter.params);
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
        });
    }
    
    // --- Добавление кнопки "Сохранить" в панель фильтра (справа) ---
    function addSaveButtonToFilterPanel() {
        console.log('[SmartFilters] Добавляем кнопку в панель фильтра...');
        
        // Ждём появления панели фильтра
        var interval = setInterval(function() {
            // Ищем панель фильтра, которая появляется справа
            var filterPanel = $('.filter-panel .buttons, .filters-panel .buttons, .filter__buttons');
            
            if (filterPanel.length && !$('.smart-filters-save-btn').length) {
                var btnHtml = '<div class="button smart-filters-save-btn selector" style="margin-left: 10px;">\
                    <div class="button__icon">💾</div>\
                    <div class="button__text">Сохранить фильтр</div>\
                </div>';
                filterPanel.append(btnHtml);
                
                $('.smart-filters-save-btn').off('hover:enter').on('hover:enter', function() {
                    saveCurrentFilter();
                });
                
                console.log('[SmartFilters] Кнопка сохранения добавлена в панель фильтра');
                clearInterval(interval);
            }
        }, 500);
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
                    clearAllFilters();
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
            addSaveButtonToFilterPanel();
            updateMenuItems();
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
