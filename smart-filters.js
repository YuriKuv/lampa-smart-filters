(function() {
    'use strict';
    
    // Защита от повторной загрузки
    if (window.SmartFiltersLoaded) return;
    window.SmartFiltersLoaded = true;
    
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
    
    // --- Получение текущих параметров фильтра ---
    function getCurrentFilter() {
        try {
            var params = {};
            
            // Способ 1: через Lampa.Controller.filters
            if (Lampa.Controller && Lampa.Controller.filters && Lampa.Controller.filters.params) {
                var p = Lampa.Controller.filters.params;
                if (p.genres) params.genres = p.genres;
                if (p.year) params.year = p.year;
                if (p.countries) params.countries = p.countries;
                if (p.sort) params.sort = p.sort;
                if (p.rating) params.rating = p.rating;
            }
            
            // Способ 2: через DOM элементы фильтра
            if (Object.keys(params).length === 0) {
                params = getFilterFromDOM();
            }
            
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка получения фильтра:', e);
            return null;
        }
    }
    
    // --- Получение фильтра из DOM (запасной способ) ---
    function getFilterFromDOM() {
        var params = {};
        try {
            // Жанры
            var genresSelected = $('.filter__genres .filter__item.active');
            if (genresSelected.length) {
                params.genres = [];
                genresSelected.each(function() {
                    var genreId = $(this).data('id');
                    if (genreId) params.genres.push(genreId);
                });
            }
            
            // Год
            var yearInput = $('.filter__year input, .filter__year .input');
            if (yearInput.length && yearInput.val()) {
                params.year = yearInput.val();
            }
            
            // Страны
            var countriesSelected = $('.filter__countries .filter__item.active');
            if (countriesSelected.length) {
                params.countries = [];
                countriesSelected.each(function() {
                    var countryCode = $(this).data('code');
                    if (countryCode) params.countries.push(countryCode);
                });
            }
            
            // Сортировка
            var sortSelected = $('.filter__sort .filter__item.active');
            if (sortSelected.length) {
                params.sort = sortSelected.data('value') || sortSelected.text();
            }
        } catch(e) {}
        return params;
    }
    
    // --- Применение фильтра ---
    function applyFilter(params) {
        try {
            if (!params) return false;
            
            console.log('[SmartFilters] Применяем фильтр:', params);
            
            // Способ 1: через Lampa API
            if (Lampa.Controller && Lampa.Controller.filters) {
                if (typeof Lampa.Controller.filters.setParams === 'function') {
                    Lampa.Controller.filters.setParams(params);
                } else {
                    Lampa.Controller.filters.params = params;
                }
                
                if (Lampa.Controller.filters.update) Lampa.Controller.filters.update();
                if (Lampa.Controller.filters.reload) Lampa.Controller.filters.reload();
            }
            
            // Способ 2: через событие
            Lampa.Listener.send('filter', { type: 'set', params: params });
            
            Lampa.Noty.show('✓ Фильтр применён', 1500);
            return true;
        } catch(e) {
            console.error('[SmartFilters] Ошибка применения:', e);
            return false;
        }
    }
    
    // --- Сохранение текущего фильтра ---
    function saveCurrentFilter() {
        var currentParams = getCurrentFilter();
        
        if (!currentParams) {
            Lampa.Noty.show('✗ Сначала откройте фильтр и выберите параметры', 2000);
            return;
        }
        
        // Создаём диалог ввода имени
        var modalHtml = '<div class="modal">\
            <div class="modal__content" style="width: 300px;">\
                <div class="modal__header">\
                    <h3>Сохранить фильтр</h3>\
                    <div class="modal__close">✖</div>\
                </div>\
                <div class="modal__body">\
                    <input type="text" id="filter_name_input" placeholder="Название фильтра" style="width: 100%; padding: 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; color: #fff;">\
                </div>\
                <div class="modal__footer">\
                    <div class="button modal__cancel">Отмена</div>\
                    <div class="button button--green modal__save">Сохранить</div>\
                </div>\
            </div>\
        </div>';
        
        $('body').append(modalHtml);
        
        var modal = $('.modal');
        var input = $('#filter_name_input');
        
        modal.find('.modal__close, .modal__cancel').on('hover:enter', function() {
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
        // Удаляем старые пункты
        $('.menu__item[data-name^="smart_filter_"]').remove();
        
        // Находим пункт "Фильтр"
        var filterMenuItem = $('.menu__item[data-name="filter"]');
        
        // Добавляем сохранённые фильтры
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-name="smart_filter_' + filter.id + '">\
                <div class="menu__ico">\
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">\
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>\
                    </svg>\
                </div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
                <div class="menu__item-icon menu__item-icon--delete" data-id="' + filter.id + '">✖</div>\
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
    
    // --- Добавить кнопку в панель фильтра ---
    function addFilterButton() {
        var checkInterval = setInterval(function() {
            var filterPanel = $('.filter-panel .buttons, .filters-panel .buttons, .filter__buttons');
            
            if (filterPanel.length && !$('.smart-filter-save-btn').length) {
                var btn = $('<div class="button smart-filter-save-btn selector">\
                    <div class="button__icon">💾</div>\
                    <div class="button__text">Сохранить</div>\
                </div>');
                
                btn.on('hover:enter', function() {
                    saveCurrentFilter();
                });
                
                filterPanel.append(btn);
                clearInterval(checkInterval);
                console.log('[SmartFilters] Кнопка добавлена в панель фильтра');
            }
        }, 1000);
    }
    
    // --- Добавить пункт в главное меню ---
    function addMenuItem() {
        var filterMenuItem = $('.menu__item[data-name="filter"]');
        
        // Добавляем пункт "Smart Filters" после "Фильтр"
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
        smartMenuItem.on('hover:enter', function() {
            var submenu = $('<div class="menu__submenu" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 200px;">\
                <div class="menu__submenu-item selector" data-action="save">💾 Сохранить текущий фильтр</div>\
                <div class="menu__submenu-item selector" data-action="list">📋 Мои фильтры</div>\
                <div class="menu__submenu-item selector" data-action="clear">🗑️ Очистить все</div>\
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
    }
    
    // --- Инициализация ---
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMenuItem();
        addFilterButton();
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
