(function() {
    'use strict';
    
    // Защита от повторной загрузки
    if (window.SmartFiltersFinal) return;
    window.SmartFiltersFinal = true;
    
    console.log('[SmartFilters] Плагин загружается...');
    
    // --- Хранилище ---
    const STORAGE_KEY = 'smart_filters_saved';
    let savedFilters = [];
    
    // --- Загрузка ---
    function loadFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        savedFilters = Array.isArray(data) ? data : [];
        console.log('[SmartFilters] Загружено фильтров:', savedFilters.length);
        updateMenu();
    }
    
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
    }
    
    // --- Получение текущих параметров фильтра из активного компонента ---
    function getCurrentFilterParams() {
        try {
            var params = {};
            
            // Получаем параметры из контроллера фильтров Lampa
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
            
            // Если не получили параметры через API, пробуем через DOM
            if (Object.keys(params).length === 0) {
                params = getFilterFromDOM();
            }
            
            console.log('[SmartFilters] Текущие параметры:', params);
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            return null;
        }
    }
    
    // --- Получение фильтра из DOM (запасной способ) ---
    function getFilterFromDOM() {
        var params = {};
        try {
            // Жанр
            var genreActive = $('.selectbox-item:contains("Жанр") .selectbox-item__subtitle');
            if (genreActive.length && genreActive.text() !== 'Не выбрано') {
                params.genres = [genreActive.text()];
            }
            
            // Год
            var yearActive = $('.selectbox-item:contains("Год") .selectbox-item__subtitle');
            if (yearActive.length && yearActive.text() !== 'Не выбрано') {
                params.year = yearActive.text();
            }
            
            // Страна (Язык оригинала)
            var countryActive = $('.selectbox-item:contains("Язык оригинала") .selectbox-item__subtitle');
            if (countryActive.length && countryActive.text() !== 'Не выбрано') {
                params.countries = [countryActive.text()];
            }
            
            // Рейтинг
            var ratingActive = $('.selectbox-item:contains("Рейтинг") .selectbox-item__subtitle');
            if (ratingActive.length && ratingActive.text() !== 'Не выбрано') {
                var rating = ratingActive.text();
                if (rating.includes('-')) {
                    var parts = rating.split('-');
                    params.ratingFrom = parts[0];
                    params.ratingTo = parts[1];
                } else {
                    params.ratingFrom = rating;
                }
            }
            
            // Тип
            var typeActive = $('.selectbox-item:contains("Тип") .selectbox-item__subtitle');
            if (typeActive.length && typeActive.text() !== 'Не выбрано') {
                params.type = typeActive.text() === 'Фильмы' ? 'movie' : 'tv';
            }
        } catch(e) {}
        return params;
    }
    
    // --- Применение фильтра ---
    function applyFilter(params) {
        try {
            console.log('[SmartFilters] Применяем фильтр:', params);
            
            if (!params) return false;
            
            // Отправляем событие для применения фильтра
            Lampa.Listener.send('filter', { type: 'set', params: params });
            
            // Устанавливаем параметры в контроллер
            if (Lampa.Controller && Lampa.Controller.filters) {
                if (typeof Lampa.Controller.filters.setParams === 'function') {
                    Lampa.Controller.filters.setParams(params);
                } else {
                    Lampa.Controller.filters.params = params;
                }
                
                // Обновляем интерфейс
                if (Lampa.Controller.filters.update) {
                    Lampa.Controller.filters.update();
                }
                
                // Перезагружаем контент
                if (Lampa.Controller.filters.reload) {
                    Lampa.Controller.filters.reload();
                }
            }
            
            // Также обновляем текущую активность
            var active = Lampa.Activity.active();
            if (active && active.reload) {
                active.reload();
            }
            
            Lampa.Noty.show('✓ Фильтр "' + (params.name || '') + '" применён', 1500);
            return true;
        } catch(e) {
            console.error('[SmartFilters] Ошибка применения:', e);
            return false;
        }
    }
    
    // --- Сохранение текущего фильтра ---
    function saveCurrentFilter() {
        var params = getCurrentFilterParams();
        
        if (!params) {
            Lampa.Noty.show('✗ Сначала выберите параметры в фильтре', 2000);
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
    
    // --- Показать список фильтров ---
    function showFiltersList() {
        if (savedFilters.length === 0) {
            Lampa.Noty.show('Нет сохранённых фильтров', 2000);
            return;
        }
        
        var items = savedFilters.map(function(f) {
            return { title: f.name, subtitle: 'Сохранён: ' + f.date, filter: f };
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
    function clearAll() {
        Lampa.Select.show({
            title: 'Удалить все фильтры?',
            items: [{ title: 'Да' }, { title: 'Нет' }],
            onSelect: function(item) {
                if (item.title === 'Да') {
                    savedFilters = [];
                    saveFilters();
                    Lampa.Noty.show('Все фильтры удалены', 2000);
                }
            }
        });
    }
    
    // --- Обновление меню ---
    function updateMenu() {
        // Удаляем все старые пункты (кроме основного)
        $('.menu__item[data-name^="smart_filter_saved_"]').remove();
        
        // Находим пункт "Фильтр"
        var filterItem = $('.menu__item[data-action="filter"]');
        
        // Добавляем сохранённые фильтры после "Фильтр"
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-name="smart_filter_saved_' + filter.id + '">\
                <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg></div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
                <div class="menu__item-icon menu__item-icon--delete" data-id="' + filter.id + '">✖</div>\
            </li>');
            
            if (filterItem.length) {
                filterItem.after(item);
            } else {
                $('.menu__list').append(item);
            }
            
            // Применение фильтра при нажатии
            item.on('hover:enter', function(e) {
                if ($(e.target).hasClass('menu__item-icon--delete')) return;
                applyFilter(filter.params);
            });
            
            // Удаление при нажатии на крестик
            item.find('.menu__item-icon--delete').on('hover:enter', function(e) {
                e.stopPropagation();
                savedFilters = savedFilters.filter(function(f) { return f.id !== filter.id; });
                saveFilters();
                Lampa.Noty.show('Фильтр "' + filter.name + '" удалён', 1000);
            });
        });
    }
    
    // --- Добавление основного пункта в меню ---
    function addMainMenuItem() {
        // Удаляем старый
        $('.menu__item[data-name="smart_filters_root"]').remove();
        
        var filterItem = $('.menu__item[data-action="filter"]');
        
        var mainItem = $('<li class="menu__item selector" data-name="smart_filters_root">\
            <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/></svg></div>\
            <div class="menu__text">📁 Мои фильтры</div>\
        </li>');
        
        if (filterItem.length) {
            filterItem.after(mainItem);
        } else {
            $('.menu__list').append(mainItem);
        }
        
        // Подменю
        mainItem.off('hover:enter').on('hover:enter', function() {
            $('.menu__submenu[data-parent="smart_filters_root"]').remove();
            
            var submenu = $('<div class="menu__submenu" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 180px;">\
                <div class="menu__submenu-item selector" data-action="save">💾 Сохранить текущий фильтр</div>\
                <div class="menu__submenu-item selector" data-action="list">📋 Мои фильтры</div>\
                <div class="menu__submenu-item selector" data-action="clear">🗑️ Очистить все</div>\
            </div>');
            
            $('body').append(submenu);
            
            submenu.find('[data-action="save"]').on('hover:enter', function() { saveCurrentFilter(); submenu.remove(); });
            submenu.find('[data-action="list"]').on('hover:enter', function() { showFiltersList(); submenu.remove(); });
            submenu.find('[data-action="clear"]').on('hover:enter', function() { clearAll(); submenu.remove(); });
        });
    }
    
    // --- Добавление кнопки в панель фильтра ---
    function addFilterButton() {
        // Функция для добавления кнопки
        function tryAddButton() {
            // Ищем контейнер для кнопок
            var buttonsContainer = $('.selectbox__footer, .filter-buttons, .selectbox .buttons');
            
            // Если не нашли, создаём свой
            if (!buttonsContainer.length) {
                var selectboxBody = $('.selectbox__body');
                if (selectboxBody.length && !$('.smart-filters-button-panel').length) {
                    var panel = $('<div class="smart-filters-button-panel" style="padding: 1em; display: flex; gap: 0.5em; justify-content: center; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 1em;">\
                        <div class="button smart-filter-save-btn selector" style="padding: 0.5em 1em; background: #4caf50; border-radius: 0.5em;">💾 Сохранить</div>\
                    </div>');
                    selectboxBody.after(panel);
                    buttonsContainer = panel;
                }
            }
            
            if (buttonsContainer.length && !buttonsContainer.find('.smart-filter-save-btn').length) {
                var btn = $('<div class="button smart-filter-save-btn selector" style="padding: 0.5em 1em; background: #4caf50; border-radius: 0.5em;">💾 Сохранить фильтр</div>');
                btn.on('hover:enter', function() {
                    saveCurrentFilter();
                });
                buttonsContainer.append(btn);
                console.log('[SmartFilters] Кнопка добавлена в панель фильтра');
                return true;
            }
            return false;
        }
        
        // Пробуем добавить сразу
        setTimeout(tryAddButton, 500);
        
        // Следим за открытием панели фильтра
        Lampa.Listener.follow('filter', function(e) {
            if (e.type === 'open' || e.type === 'show') {
                setTimeout(tryAddButton, 200);
            }
        });
        
        // Также проверяем каждые 2 секунды
        var interval = setInterval(function() {
            if (tryAddButton()) clearInterval(interval);
        }, 2000);
    }
    
    // --- Добавление настроек ---
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
            field: { name: 'Очистить все фильтры' },
            onChange: clearAll
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
        addFilterButton();
        addSettings();
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
