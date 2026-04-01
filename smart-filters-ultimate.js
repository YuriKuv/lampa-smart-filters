(function() {
    'use strict';
    
    // Защита от повторной загрузки
    if (window.SmartFiltersUltimate) return;
    window.SmartFiltersUltimate = true;
    
    console.log('[SmartFilters] Универсальная версия загружена');
    
    // --- Хранилище ---
    const STORAGE_KEY = 'smart_filters_saved';
    let savedFilters = [];
    
    // --- Загрузка ---
    function loadFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        savedFilters = Array.isArray(data) ? data : [];
        console.log('[SmartFilters] Загружено фильтров:', savedFilters.length);
    }
    
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
    }
    
    // --- ПОЛУЧЕНИЕ ПАРАМЕТРОВ ФИЛЬТРА (универсальный способ) ---
    function getCurrentFilterParams() {
        try {
            var params = {};
            
            // Способ 1: Через Lampa API
            if (Lampa.Controller && Lampa.Controller.filters && Lampa.Controller.filters.params) {
                var p = Lampa.Controller.filters.params;
                if (p.genres) params.genres = p.genres;
                if (p.year) params.year = p.year;
                if (p.countries) params.countries = p.countries;
                if (p.sort) params.sort = p.sort;
                if (p.rating) params.rating = p.rating;
                console.log('[SmartFilters] Параметры через API:', params);
                if (Object.keys(params).length > 0) return params;
            }
            
            // Способ 2: Через активную активность
            var active = Lampa.Activity.active();
            if (active && active.params) {
                console.log('[SmartFilters] Параметры через Activity:', active.params);
                if (Object.keys(active.params).length > 0) return active.params;
            }
            
            // Способ 3: Через компонент фильтра
            var filterComp = Lampa.Component.find('filter');
            if (filterComp && filterComp.params) {
                console.log('[SmartFilters] Параметры через Component:', filterComp.params);
                return filterComp.params;
            }
            
            console.log('[SmartFilters] Не удалось получить параметры фильтра');
            return null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            return null;
        }
    }
    
    // --- ПРИМЕНЕНИЕ ФИЛЬТРА ---
    function applyFilter(params) {
        try {
            console.log('[SmartFilters] Применяем фильтр:', params);
            
            if (!params) return;
            
            // Способ 1: Через Lampa API
            if (Lampa.Controller && Lampa.Controller.filters) {
                if (Lampa.Controller.filters.setParams) {
                    Lampa.Controller.filters.setParams(params);
                }
                if (Lampa.Controller.filters.update) Lampa.Controller.filters.update();
                if (Lampa.Controller.filters.reload) Lampa.Controller.filters.reload();
            }
            
            // Способ 2: Отправить событие
            Lampa.Listener.send('filter', { type: 'set', params: params });
            
            // Способ 3: Обновить текущую активность
            var active = Lampa.Activity.active();
            if (active && active.reload) {
                active.reload();
            }
            
            Lampa.Noty.show('✓ Фильтр применён', 1500);
        } catch(e) {
            console.error('[SmartFilters] Ошибка применения:', e);
        }
    }
    
    // --- СОХРАНЕНИЕ ---
    function saveCurrentFilter() {
        var params = getCurrentFilterParams();
        
        if (!params) {
            Lampa.Noty.show('✗ Нет активных параметров фильтра', 2000);
            return;
        }
        
        var name = prompt('Введите название фильтра:', 'Мой фильтр');
        if (name && name.trim()) {
            savedFilters.push({
                id: Date.now(),
                name: name.trim(),
                params: params,
                date: new Date().toLocaleString()
            });
            saveFilters();
            Lampa.Noty.show('✓ Фильтр "' + name + '" сохранён', 2000);
        }
    }
    
    // --- ПОКАЗАТЬ СПИСОК ---
    function showFiltersList() {
        if (savedFilters.length === 0) {
            Lampa.Noty.show('Нет сохранённых фильтров', 2000);
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
    
    // --- ОЧИСТКА ---
    function clearAll() {
        if (confirm('Удалить все сохранённые фильтры?')) {
            savedFilters = [];
            saveFilters();
            Lampa.Noty.show('Все фильтры удалены', 2000);
        }
    }
    
    // --- ОБНОВЛЕНИЕ МЕНЮ ---
    function updateMenu() {
        // Удаляем все созданные пункты
        $('.menu__item[data-name^="smart_filter_saved_"]').remove();
        
        // Находим пункт "Фильтр"
        var filterItem = $('.menu__item[data-name="filter"]');
        
        // Добавляем сохранённые фильтры
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-name="smart_filter_saved_' + filter.id + '">\
                <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg></div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
            </li>');
            
            if (filterItem.length) {
                filterItem.after(item);
            } else {
                $('.menu__list').append(item);
            }
            
            item.on('hover:enter', function() {
                console.log('[SmartFilters] Выбран фильтр:', filter.name);
                applyFilter(filter.params);
            });
        });
    }
    
    // --- ДОБАВЛЕНИЕ ОСНОВНОГО ПУНКТА В МЕНЮ ---
    function addMainMenuItem() {
        // Удаляем старый
        $('.menu__item[data-name="smart_filters_root"]').remove();
        
        var filterItem = $('.menu__item[data-name="filter"]');
        
        var mainItem = $('<li class="menu__item selector" data-name="smart_filters_root">\
            <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/></svg></div>\
            <div class="menu__text">📁 Мои фильтры</div>\
        </li>');
        
        if (filterItem.length) {
            filterItem.after(mainItem);
        } else {
            $('.menu__list').append(mainItem);
        }
        
        mainItem.on('hover:enter', function() {
            // Показываем простой выбор
            Lampa.Select.show({
                title: 'Мои фильтры',
                items: [
                    { title: '💾 Сохранить текущий фильтр', action: 'save' },
                    { title: '📋 Показать сохранённые', action: 'list' },
                    { title: '🗑️ Очистить все', action: 'clear' }
                ],
                onSelect: function(item) {
                    if (item.action === 'save') saveCurrentFilter();
                    if (item.action === 'list') showFiltersList();
                    if (item.action === 'clear') clearAll();
                }
            });
        });
    }
    
    // --- ПОИСК И ДОБАВЛЕНИЕ КНОПКИ В ПАНЕЛЬ ФИЛЬТРА ---
    function addSaveButtonToFilter() {
        console.log('[SmartFilters] Поиск панели фильтра...');
        
        // Функция для добавления кнопки
        function tryAddButton() {
            // Все возможные селекторы для контейнера с кнопками
            var selectors = [
                '.filter-panel .buttons',
                '.filter .buttons', 
                '.filters-panel .buttons',
                '.filter__buttons',
                '.filter__actions',
                '.filter__footer .buttons',
                '.filter-panel__buttons',
                '.modal .buttons'
            ];
            
            for (var i = 0; i < selectors.length; i++) {
                var container = $(selectors[i]);
                if (container.length && !container.find('.smart-filter-save-btn').length) {
                    console.log('[SmartFilters] Найден контейнер:', selectors[i]);
                    
                    var btn = $('<div class="button smart-filter-save-btn selector" style="margin-left: 10px;">\
                        <div class="button__icon">💾</div>\
                        <div class="button__text">Сохранить</div>\
                    </div>');
                    
                    btn.on('hover:enter', function() {
                        saveCurrentFilter();
                    });
                    
                    container.append(btn);
                    console.log('[SmartFilters] Кнопка добавлена!');
                    return true;
                }
            }
            return false;
        }
        
        // Пробуем добавить сразу
        tryAddButton();
        
        // Проверяем каждые 2 секунды
        var interval = setInterval(function() {
            if (tryAddButton()) {
                clearInterval(interval);
            }
        }, 2000);
        
        // Следим за открытием фильтра
        Lampa.Listener.follow('filter', function(e) {
            if (e.type === 'open' || e.type === 'render') {
                setTimeout(tryAddButton, 300);
            }
        });
    }
    
    // --- НАСТРОЙКИ ---
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        
        Lampa.SettingsApi.addComponent({
            component: 'smart_filters_settings',
            name: 'Smart Filters',
            icon: '🔖'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'smart_filters_settings',
            param: { name: 'clear_all', type: 'button' },
            field: { name: 'Очистить все фильтры' },
            onChange: clearAll
        });
    }
    
    // --- ИНИЦИАЛИЗАЦИЯ ---
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenuItem();
        addSaveButtonToFilter();
        addSettings();
        updateMenu();
        console.log('[SmartFilters] Готов!');
    }
    
    // --- ЗАПУСК ---
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', init);
    }
    
})();
