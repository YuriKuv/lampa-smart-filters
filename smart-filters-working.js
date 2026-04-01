(function() {
    'use strict';
    
    // Защита от повторной инициализации
    if (window.SmartFiltersWorking) return;
    window.SmartFiltersWorking = true;
    
    console.log('[SmartFilters] Плагин загружается...');
    
    // --- Конфигурация ---
    const PLUGIN_NAME = 'Smart Filters';
    const STORAGE_KEY = 'smart_filters_data';
    
    // --- Данные ---
    let categories = [];
    
    // --- Функции работы с данными ---
    function loadData() {
        var saved = Lampa.Storage.get(STORAGE_KEY);
        if (saved && saved.categories) {
            categories = saved.categories;
        } else {
            categories = [
                { id: '1', name: 'Избранное', filters: [] },
                { id: '2', name: 'Смотреть позже', filters: [] },
                { id: '3', name: 'Любимые жанры', filters: [] }
            ];
            saveData();
        }
        console.log('[SmartFilters] Загружено категорий:', categories.length);
    }
    
    function saveData() {
        Lampa.Storage.set(STORAGE_KEY, { categories: categories });
    }
    
    // --- Получение текущего фильтра ---
    function getCurrentFilter() {
        try {
            var params = {};
            if (Lampa.Controller && Lampa.Controller.filters && Lampa.Controller.filters.params) {
                var p = Lampa.Controller.filters.params;
                if (p.genres) params.genres = p.genres;
                if (p.year) params.year = p.year;
                if (p.countries) params.countries = p.countries;
                if (p.sort) params.sort = p.sort;
                if (p.rating) params.rating = p.rating;
            }
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка получения фильтра:', e);
            return null;
        }
    }
    
    // --- Применение фильтра ---
    function applyFilter(params) {
        try {
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
    
    // --- Сохранение фильтра ---
    function saveFilter(categoryId, filterName) {
        var currentFilter = getCurrentFilter();
        if (!currentFilter) {
            if (Lampa.Notify) Lampa.Notify.show('✗ Нет активных параметров фильтра', 2000);
            return false;
        }
        
        var category = categories.find(c => c.id === categoryId);
        if (category) {
            category.filters.push({
                id: Date.now().toString(),
                name: filterName,
                params: currentFilter,
                date: Date.now()
            });
            saveData();
            if (Lampa.Notify) Lampa.Notify.show('✓ Фильтр "' + filterName + '" сохранён', 2000);
            return true;
        }
        return false;
    }
    
    // --- Диалог сохранения ---
    function showSaveDialog() {
        if (categories.length === 0) {
            if (confirm('Нет категорий. Создать "Избранное"?')) {
                categories.push({ id: Date.now().toString(), name: 'Избранное', filters: [] });
                saveData();
            } else {
                return;
            }
        }
        
        var message = '📁 Выберите категорию:\n\n';
        categories.forEach((cat, i) => {
            message += (i + 1) + '. ' + cat.name + ' (' + cat.filters.length + ')\n';
        });
        message += '\nВведите номер:';
        
        var choice = prompt(message);
        if (choice && !isNaN(choice) && choice > 0 && choice <= categories.length) {
            var filterName = prompt('✏️ Введите название фильтра:', 'Мой фильтр');
            if (filterName && filterName.trim()) {
                saveFilter(categories[choice - 1].id, filterName.trim());
            }
        }
    }
    
    // --- Показать список фильтров ---
    function showFiltersList() {
        var allFilters = [];
        categories.forEach(cat => {
            cat.filters.forEach(f => {
                allFilters.push({ category: cat.name, filter: f });
            });
        });
        
        if (allFilters.length === 0) {
            if (Lampa.Notify) Lampa.Notify.show('📭 Нет сохранённых фильтров', 2000);
            return;
        }
        
        var message = '📋 Сохранённые фильтры:\n\n';
        allFilters.forEach((item, i) => {
            message += (i + 1) + '. [' + item.category + '] ' + item.filter.name + '\n';
        });
        message += '\nВведите номер для применения:';
        
        var choice = prompt(message);
        if (choice && !isNaN(choice) && choice > 0 && choice <= allFilters.length) {
            applyFilter(allFilters[choice - 1].filter.params);
        }
    }
    
    // --- Добавление пункта в меню (как в kinopoisk.js) ---
    function addMenuItem() {
        console.log('[SmartFilters] Добавление пункта меню...');
        
        // Удаляем старые, чтобы не было дублей
        $('.menu__item[data-name="smart_filters_menu"]').remove();
        
        // Создаём элемент как в примере
        var button = $('<li class="menu__item selector" data-name="smart_filters_menu">\n\
            <div class="menu__ico">\n\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">\n\
                    <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/>\n\
                    <path d="M8 4h2v16H8V4zM14 4h2v16h-2V4z"/>\n\
                </svg>\n\
            </div>\n\
            <div class="menu__text">' + PLUGIN_NAME + '</div>\n\
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
            console.log('[SmartFilters] Нажатие на пункт меню');
            
            // Показываем подменю
            var submenuHtml = '<div class="menu__submenu" data-parent="smart_filters_menu" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 200px; z-index: 1000;">';
            submenuHtml += '<div class="menu__submenu-item selector" data-action="save" style="padding: 12px 16px; cursor: pointer;">💾 Сохранить текущий фильтр</div>';
            submenuHtml += '<div class="menu__submenu-item selector" data-action="list" style="padding: 12px 16px; cursor: pointer;">📋 Мои фильтры</div>';
            submenuHtml += '</div>';
            
            $('body').append(submenuHtml);
            
            // Обработчики подменю
            $('[data-action="save"]').on('hover:enter', function() {
                showSaveDialog();
                $('.menu__submenu[data-parent="smart_filters_menu"]').remove();
            });
            
            $('[data-action="list"]').on('hover:enter', function() {
                showFiltersList();
                $('.menu__submenu[data-parent="smart_filters_menu"]').remove();
            });
        });
        
        console.log('[SmartFilters] Пункт меню добавлен');
    }
    
    // --- Добавление кнопки в панель фильтров ---
    function addFilterButton() {
        console.log('[SmartFilters] Добавление кнопки в фильтр...');
        
        // Проверяем каждую секунду, пока не найдём панель фильтров
        var interval = setInterval(function() {
            var filterPanel = $('.filter-panel .buttons, .filters-panel .buttons');
            if (filterPanel.length && !$('.smart-filters-btn').length) {
                var btnHtml = '<div class="button smart-filters-btn selector" style="margin-left: 10px;">\n\
                    <div class="button__icon">💾</div>\n\
                    <div class="button__text">Сохранить фильтр</div>\n\
                </div>';
                filterPanel.append(btnHtml);
                
                $('.smart-filters-btn').on('hover:enter', function() {
                    showSaveDialog();
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
                param: {
                    name: 'clear_cache',
                    type: 'button'
                },
                field: {
                    name: 'Очистить все сохранённые фильтры',
                },
                onChange: function() {
                    if (confirm('Удалить все сохранённые фильтры?')) {
                        categories = [];
                        saveData();
                        Lampa.Notify.show('Все фильтры удалены', 2000);
                    }
                }
            });
            
            console.log('[SmartFilters] Раздел настроек добавлен');
        } catch(e) {
            console.error('[SmartFilters] Ошибка добавления настроек:', e);
        }
    }
    
    // --- Инициализация плагина (как в kinopoisk.js) ---
    function initPlugin() {
        console.log('[SmartFilters] Инициализация...');
        
        loadData();
        addMenuItem();
        addFilterButton();
        addSettings();
        
        console.log('[SmartFilters] Готов к работе!');
        if (Lampa.Notify) Lampa.Notify.show(PLUGIN_NAME + ' загружен', 2000);
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
