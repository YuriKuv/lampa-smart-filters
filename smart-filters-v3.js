(function() {
    'use strict';
    
    // Защита от повторной загрузки
    if (window.SmartFiltersV3) return;
    window.SmartFiltersV3 = true;
    
    console.log('[SmartFilters] Плагин загружается...');
    
    // --- Хранилище фильтров ---
    const STORAGE_KEY = 'smart_filters_list';
    let savedFilters = [];
    
    // --- Загрузка сохранённых фильтров ---
    function loadFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        if (data && Array.isArray(data)) {
            savedFilters = data;
        } else {
            savedFilters = [];
        }
        console.log('[SmartFilters] Загружено фильтров:', savedFilters.length);
    }
    
    // --- Сохранение фильтров ---
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
    }
    
    // --- Получение текущих параметров фильтра из панели ---
    function getCurrentFilterFromPanel() {
        try {
            var params = {};
            
            // Получаем тип контента (Фильмы/Сериалы)
            var typeActive = $('.filter__type .filter__item.active, .filter__type .active');
            if (typeActive.length) {
                var typeText = typeActive.text().trim();
                if (typeText === 'Фильмы') params.type = 'movie';
                if (typeText === 'Сериалы') params.type = 'tv';
            }
            
            // Получаем жанр
            var genreActive = $('.filter__genres .filter__item.active, .filter__genre .filter__item.active, [data-type="genre"] .active');
            if (genreActive.length) {
                var genreId = genreActive.data('id') || genreActive.data('value');
                if (genreId) params.genres = [genreId];
            }
            
            // Получаем страну (Язык оригинала)
            var countryActive = $('.filter__countries .filter__item.active, .filter__country .filter__item.active, [data-type="country"] .active');
            if (countryActive.length) {
                var countryCode = countryActive.data('code') || countryActive.data('value');
                if (countryCode) params.countries = [countryCode];
            }
            
            // Получаем год
            var yearInput = $('.filter__year input, .filter__year .input, input[placeholder="Год"]');
            if (yearInput.length && yearInput.val()) {
                params.year = yearInput.val();
            }
            
            // Получаем рейтинг
            var ratingValue = $('.filter__rating .active, .filter__rating input');
            if (ratingValue.length && ratingValue.val()) {
                params.rating = ratingValue.val();
            }
            
            // Получаем сортировку
            var sortActive = $('.filter__sort .filter__item.active');
            if (sortActive.length) {
                params.sort = sortActive.data('value') || sortActive.text();
            }
            
            console.log('[SmartFilters] Получены параметры фильтра:', params);
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка получения фильтра:', e);
            return null;
        }
    }
    
    // --- Применение фильтра ---
    function applyFilter(params) {
        try {
            if (!params) return false;
            
            console.log('[SmartFilters] Применяем фильтр:', params);
            
            // Отправляем событие для применения фильтра
            Lampa.Listener.send('filter', { type: 'set', params: params });
            
            // Также пробуем через Controller
            if (Lampa.Controller && Lampa.Controller.filters) {
                if (typeof Lampa.Controller.filters.setParams === 'function') {
                    Lampa.Controller.filters.setParams(params);
                }
                if (Lampa.Controller.filters.update) Lampa.Controller.filters.update();
                if (Lampa.Controller.filters.reload) Lampa.Controller.filters.reload();
            }
            
            Lampa.Noty.show('✓ Фильтр применён', 1500);
            return true;
        } catch(e) {
            console.error('[SmartFilters] Ошибка применения:', e);
            return false;
        }
    }
    
    // --- Сохранение текущего фильтра ---
    function saveCurrentFilter() {
        var currentParams = getCurrentFilterFromPanel();
        
        if (!currentParams) {
            Lampa.Noty.show('✗ Сначала выберите параметры фильтра', 2000);
            return;
        }
        
        // Создаём диалог ввода имени
        var modalHtml = '<div class="modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center;">\
            <div class="modal__content" style="background: #1a1a1a; border-radius: 12px; width: 300px;">\
                <div class="modal__header" style="padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.1);">\
                    <h3 style="margin: 0;">Сохранить фильтр</h3>\
                </div>\
                <div class="modal__body" style="padding: 16px;">\
                    <input type="text" id="filter_name_input" placeholder="Название фильтра" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; color: #fff; font-size: 14px;">\
                </div>\
                <div class="modal__footer" style="padding: 16px; display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.1);">\
                    <div class="button modal__cancel" style="padding: 8px 16px; background: rgba(255,255,255,0.1); border-radius: 6px; cursor: pointer;">Отмена</div>\
                    <div class="button button--green modal__save" style="padding: 8px 16px; background: #4caf50; border-radius: 6px; cursor: pointer;">Сохранить</div>\
                </div>\
            </div>\
        </div>';
        
        $('body').append(modalHtml);
        
        var modal = $('.modal');
        var input = $('#filter_name_input');
        
        modal.find('.modal__cancel').on('hover:enter', function() {
            modal.remove();
        });
        
        modal.find('.modal__save').on('hover:enter', function() {
            var name = input.val().trim();
            if (name) {
                savedFilters.push({
                    id: Date.now(),
                    name: name,
                    params: currentParams,
                    date: new Date().toLocaleString()
                });
                saveFilters();
                Lampa.Noty.show('✓ Фильтр "' + name + '" сохранён', 2000);
                modal.remove();
            } else {
                Lampa.Noty.show('Введите название', 1000);
            }
        });
        
        input.focus();
    }
    
    // --- Показать список фильтров ---
    function showFiltersList() {
        if (savedFilters.length === 0) {
            Lampa.Noty.show('📭 Нет сохранённых фильтров', 2000);
            return;
        }
        
        var items = savedFilters.map(function(filter, index) {
            return {
                title: filter.name,
                subtitle: 'Сохранён: ' + filter.date,
                filter: filter
            };
        });
        
        Lampa.Select.show({
            title: 'Мои фильтры',
            items: items,
            onSelect: function(item) {
                applyFilter(item.filter.params);
            }
        });
    }
    
    // --- Удалить все фильтры ---
    function clearAllFilters() {
        Lampa.Select.show({
            title: 'Удалить все фильтры?',
            items: [
                { title: 'Да', confirm: true },
                { title: 'Нет' }
            ],
            onSelect: function(item) {
                if (item.confirm) {
                    savedFilters = [];
                    saveFilters();
                    Lampa.Noty.show('✓ Все фильтры удалены', 2000);
                }
            }
        });
    }
    
    // --- Обновить меню ---
    function updateMenu() {
        // Удаляем старые пункты (кроме основного)
        $('.menu__item[data-name^="smart_filter_saved_"]').remove();
        
        // Находим пункт "Фильтр"
        var filterMenuItem = $('.menu__item[data-name="filter"]');
        
        // Добавляем сохранённые фильтры после "Фильтр"
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-name="smart_filter_saved_' + filter.id + '">\
                <div class="menu__ico">\
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">\
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>\
                    </svg>\
                </div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
                <div class="menu__item-icon menu__item-icon--delete" data-id="' + filter.id + '" style="margin-left: auto; padding: 0 8px;">✖</div>\
            </li>');
            
            if (filterMenuItem.length) {
                filterMenuItem.after(item);
            } else {
                $('.menu__list').append(item);
            }
            
            // Применение фильтра
            item.on('hover:enter', function(e) {
                if ($(e.target).hasClass('menu__item-icon--delete')) return;
                applyFilter(filter.params);
            });
            
            // Удаление
            item.find('.menu__item-icon--delete').on('hover:enter', function(e) {
                e.stopPropagation();
                savedFilters = savedFilters.filter(function(f) { return f.id !== filter.id; });
                saveFilters();
                Lampa.Noty.show('Фильтр удалён', 1000);
            });
        });
    }
    
    // --- Добавить кнопку в панель фильтрации (справа) ---
    function addSaveButtonToFilterPanel() {
        console.log('[SmartFilters] Поиск панели фильтрации...');
        
        // Ищем панель фильтрации по разным селекторам
        var selectors = [
            '.filter-panel .buttons',
            '.filters-panel .buttons',
            '.filter__buttons',
            '.filter .buttons',
            '.filter__actions'
        ];
        
        var checkInterval = setInterval(function() {
            var filterPanel = null;
            
            // Ищем панель
            for (var i = 0; i < selectors.length; i++) {
                var panel = $(selectors[i]);
                if (panel.length) {
                    filterPanel = panel;
                    break;
                }
            }
            
            // Если нашли панель и кнопки ещё нет
            if (filterPanel && filterPanel.length && !$('.smart-filter-save-btn').length) {
                console.log('[SmartFilters] Найдена панель фильтрации, добавляем кнопку');
                
                var btn = $('<div class="button smart-filter-save-btn selector" style="margin-left: 10px;">\
                    <div class="button__icon">💾</div>\
                    <div class="button__text">Сохранить фильтр</div>\
                </div>');
                
                btn.on('hover:enter', function() {
                    saveCurrentFilter();
                });
                
                filterPanel.append(btn);
                clearInterval(checkInterval);
            }
        }, 500);
        
        // Также пробуем добавить при открытии панели фильтрации
        Lampa.Listener.follow('filter', function(e) {
            if (e.type === 'open' || e.type === 'show') {
                setTimeout(function() {
                    var filterPanel = $('.filter-panel .buttons, .filters-panel .buttons, .filter__buttons');
                    if (filterPanel.length && !$('.smart-filter-save-btn').length) {
                        var btn = $('<div class="button smart-filter-save-btn selector">\
                            <div class="button__icon">💾</div>\
                            <div class="button__text">Сохранить фильтр</div>\
                        </div>');
                        btn.on('hover:enter', function() { saveCurrentFilter(); });
                        filterPanel.append(btn);
                    }
                }, 100);
            }
        });
    }
    
    // --- Добавить пункт в главное меню ---
    function addMainMenuItem() {
        // Удаляем старый
        $('.menu__item[data-name="smart_filters_root"]').remove();
        
        var filterMenuItem = $('.menu__item[data-name="filter"]');
        
        // Добавляем пункт "Мои фильтры" после "Фильтр"
        var smartMenuItem = $('<li class="menu__item selector" data-name="smart_filters_root">\
            <div class="menu__ico">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">\
                    <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/>\
                </svg>\
            </div>\
            <div class="menu__text">📁 Мои фильтры</div>\
        </li>');
        
        if (filterMenuItem.length) {
            filterMenuItem.after(smartMenuItem);
        } else {
            $('.menu__list').append(smartMenuItem);
        }
        
        // Подменю
        smartMenuItem.off('hover:enter').on('hover:enter', function() {
            // Удаляем старое подменю
            $('.menu__submenu[data-parent="smart_filters_root"]').remove();
            
            var submenu = $('<div class="menu__submenu" data-parent="smart_filters_root" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 200px; z-index: 1000;">\
                <div class="menu__submenu-item selector" data-action="save" style="padding: 12px 16px; cursor: pointer;">💾 Сохранить текущий фильтр</div>\
                <div class="menu__submenu-item selector" data-action="list" style="padding: 12px 16px; cursor: pointer;">📋 Мои фильтры</div>\
                <div class="menu__submenu-item selector" data-action="clear" style="padding: 12px 16px; cursor: pointer;">🗑️ Очистить все</div>\
            </div>');
            
            $('body').append(submenu);
            
            submenu.find('[data-action="save"]').on('hover:enter', function() {
                saveCurrentFilter();
                submenu.remove();
            });
            
            submenu.find('[data-action="list"]').on('hover:enter', function() {
                showFiltersList();
                submenu.remove();
            });
            
            submenu.find('[data-action="clear"]').on('hover:enter', function() {
                clearAllFilters();
                submenu.remove();
            });
        });
    }
    
    // --- Добавить настройки ---
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        
        Lampa.SettingsApi.addComponent({
            component: 'smart_filters',
            name: 'Smart Filters',
            icon: '🔖'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'clear_all', type: 'button' },
            field: { name: 'Очистить все сохранённые фильтры' },
            onChange: clearAllFilters
        });
        
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'count_info', type: 'info' },
            field: {
                name: 'Сохранённых фильтров',
                value: function() { return savedFilters.length + ' шт.'; }
            }
        });
    }
    
    // --- Инициализация ---
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenuItem();
        addSaveButtonToFilterPanel();
        addSettings();
        updateMenu();
        console.log('[SmartFilters] Готов!');
        Lampa.Noty.show('Smart Filters загружен', 2000);
    }
    
    // --- Запуск ---
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', init);
    }
    
})();
