(function() {
    'use strict';
    
    console.log('[SmartFilters] Full plugin loading...');
    
    // Конфигурация
    const PLUGIN_NAME = 'Smart Filters';
    const STORAGE_KEY = 'smart_filters_data';
    
    // Данные плагина
    let categories = [];
    
    // Загрузка сохранённых данных
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
        console.log('[SmartFilters] Loaded', categories.length, 'categories');
    }
    
    // Сохранение данных
    function saveData() {
        Lampa.Storage.set(STORAGE_KEY, { categories: categories });
    }
    
    // Получение текущих параметров фильтра
    function getCurrentFilter() {
        try {
            var params = {};
            if (Lampa.Controller && Lampa.Controller.filters && Lampa.Controller.filters.params) {
                var p = Lampa.Controller.filters.params;
                if (p.genres) params.genres = p.genres;
                if (p.year) params.year = p.year;
                if (p.countries) params.countries = p.countries;
                if (p.sort) params.sort = p.sort;
            }
            return params;
        } catch(e) {
            return null;
        }
    }
    
    // Применение фильтра
    function applyFilter(params) {
        try {
            if (Lampa.Controller && Lampa.Controller.filters) {
                Lampa.Controller.filters.setParams(params);
                if (Lampa.Controller.filters.update) Lampa.Controller.filters.update();
                if (Lampa.Controller.filters.reload) Lampa.Controller.filters.reload();
            }
            if (Lampa.Notify) Lampa.Notify.show('Фильтр применён', 1500);
        } catch(e) {
            console.error('[SmartFilters] Apply error:', e);
        }
    }
    
    // Сохранение фильтра
    function saveFilter(categoryId, filterName) {
        var currentFilter = getCurrentFilter();
        if (!currentFilter || Object.keys(currentFilter).length === 0) {
            if (Lampa.Notify) Lampa.Notify.show('Нет активных параметров фильтра', 2000);
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
            if (Lampa.Notify) Lampa.Notify.show('Фильтр "' + filterName + '" сохранён', 2000);
            return true;
        }
        return false;
    }
    
    // Показать меню выбора категории
    function showSaveDialog() {
        if (categories.length === 0) {
            if (confirm('Нет категорий. Создать "Избранное"?')) {
                categories.push({ id: Date.now().toString(), name: 'Избранное', filters: [] });
                saveData();
            } else {
                return;
            }
        }
        
        var message = 'Выберите категорию:\n\n';
        categories.forEach((cat, i) => {
            message += (i + 1) + '. ' + cat.name + '\n';
        });
        message += '\nВведите номер:';
        
        var choice = prompt(message);
        if (choice && !isNaN(choice) && choice > 0 && choice <= categories.length) {
            var filterName = prompt('Введите название фильтра:', 'Мой фильтр');
            if (filterName && filterName.trim()) {
                saveFilter(categories[choice - 1].id, filterName.trim());
            }
        }
    }
    
    // Показать список сохранённых фильтров
    function showFiltersList() {
        if (categories.length === 0) {
            if (Lampa.Notify) Lampa.Notify.show('Нет сохранённых фильтров', 2000);
            return;
        }
        
        var message = 'Сохранённые фильтры:\n\n';
        categories.forEach(cat => {
            if (cat.filters.length > 0) {
                message += '📁 ' + cat.name + ':\n';
                cat.filters.forEach((f, i) => {
                    message += '   ' + (i + 1) + '. ' + f.name + '\n';
                });
                message += '\n';
            }
        });
        
        if (message === 'Сохранённые фильтры:\n\n') {
            message += 'Нет сохранённых фильтров';
        }
        
        message += '\nВведите номер фильтра для применения (например: 1-1):';
        
        var input = prompt(message);
        if (input) {
            var parts = input.split('-');
            if (parts.length === 2) {
                var catIndex = parseInt(parts[0]) - 1;
                var filterIndex = parseInt(parts[1]) - 1;
                if (categories[catIndex] && categories[catIndex].filters[filterIndex]) {
                    applyFilter(categories[catIndex].filters[filterIndex].params);
                }
            }
        }
    }
    
    // Добавление пункта в меню
    function addToMenu() {
        console.log('[SmartFilters] Adding to menu...');
        
        if ($('.menu__item[data-name="smart_filters_root"]').length) {
            console.log('[SmartFilters] Menu already exists');
            return;
        }
        
        var menuHtml = '<div class="menu__item" data-name="smart_filters_root"><div class="menu__item-text">🎯 ' + PLUGIN_NAME + '</div></div>';
        var settingsItem = $('.menu__item[data-name="settings"]');
        
        if (settingsItem.length) {
            settingsItem.before(menuHtml);
        } else {
            $('.menu__list').append(menuHtml);
        }
        
        // Подменю
        $(document).off('hover:enter', '.menu__item[data-name="smart_filters_root"]');
        $(document).on('hover:enter', '.menu__item[data-name="smart_filters_root"]', function() {
            var submenuHtml = '<div class="menu__submenu" data-parent="smart_filters_root" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 200px;">';
            submenuHtml += '<div class="menu__submenu-item" data-action="save" style="padding: 10px 15px; cursor: pointer;">💾 Сохранить текущий фильтр</div>';
            submenuHtml += '<div class="menu__submenu-item" data-action="list" style="padding: 10px 15px; cursor: pointer;">📋 Мои фильтры</div>';
            submenuHtml += '</div>';
            
            $('body').append(submenuHtml);
            
            $('[data-action="save"]').off('hover:enter').on('hover:enter', function() {
                showSaveDialog();
                $('.menu__submenu[data-parent="smart_filters_root"]').remove();
            });
            
            $('[data-action="list"]').off('hover:enter').on('hover:enter', function() {
                showFiltersList();
                $('.menu__submenu[data-parent="smart_filters_root"]').remove();
            });
        });
        
        console.log('[SmartFilters] Menu added successfully');
    }
    
    // Добавление кнопки в фильтр
    function addFilterButton() {
        console.log('[SmartFilters] Adding filter button...');
        
        if ($('.smart-filters-btn').length) return;
        
        var checkExist = setInterval(function() {
            var filterPanel = $('.filter-panel .buttons, .filters-panel .buttons');
            if (filterPanel.length && !$('.smart-filters-btn').length) {
                var btnHtml = '<div class="button smart-filters-btn" style="margin-left: 10px;"><div class="button__icon">💾</div><div class="button__text">Сохранить</div></div>';
                filterPanel.append(btnHtml);
                
                $('.smart-filters-btn').off('hover:enter').on('hover:enter', function() {
                    showSaveDialog();
                });
                
                clearInterval(checkExist);
                console.log('[SmartFilters] Filter button added');
            }
        }, 1000);
    }
    
    // Инициализация
    function init() {
        console.log('[SmartFilters] Initializing...');
        try {
            loadData();
            addToMenu();
            addFilterButton();
            console.log('[SmartFilters] Ready!');
            if (Lampa.Notify) Lampa.Notify.show(PLUGIN_NAME + ' загружен', 2000);
        } catch(e) {
            console.error('[SmartFilters] Init error:', e);
        }
    }
    
    // Запуск
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', init);
    }
    
})();
