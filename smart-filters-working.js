(function() {
    'use strict';
    
    // Защита от повторной загрузки
    if (window.SmartFiltersWorking) return;
    window.SmartFiltersWorking = true;
    
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
    
    // --- Получение параметров фильтра (рабочий способ из того, что работало) ---
    function getCurrentFilterParams() {
        try {
            var params = {};
            
            // Получаем параметры из DOM панели фильтра
            var typeEl = $('.selectbox-item:contains("Тип") .selectbox-item__subtitle');
            if (typeEl.length && typeEl.text() !== 'Не выбрано') {
                params.type = typeEl.text();
            }
            
            var ratingEl = $('.selectbox-item:contains("Рейтинг") .selectbox-item__subtitle');
            if (ratingEl.length && ratingEl.text() !== 'Не выбрано') {
                params.rating = ratingEl.text();
            }
            
            var genreEl = $('.selectbox-item:contains("Жанр") .selectbox-item__subtitle');
            if (genreEl.length && genreEl.text() !== 'Не выбрано') {
                params.genre = genreEl.text();
            }
            
            var countryEl = $('.selectbox-item:contains("Язык оригинала") .selectbox-item__subtitle');
            if (countryEl.length && countryEl.text() !== 'Не выбрано') {
                params.country = countryEl.text();
            }
            
            var yearEl = $('.selectbox-item:contains("Год") .selectbox-item__subtitle');
            if (yearEl.length && yearEl.text() !== 'Не выбрано') {
                params.year = yearEl.text();
            }
            
            console.log('[SmartFilters] Получены параметры:', params);
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            return null;
        }
    }
    
    // --- ПРИМЕНЕНИЕ ФИЛЬТРА (исправленная версия) ---
    function applyFilter(params) {
        try {
            console.log('[SmartFilters] Применяем фильтр:', params);
            
            if (!params) return false;
            
            // Способ 1: Через клик по элементам фильтра
            if (params.genre && params.genre !== 'Не выбрано') {
                var genreItems = $('.selectbox-item:contains("Жанр")');
                if (genreItems.length) {
                    // Открываем выбор жанра
                    genreItems.trigger('hover:enter');
                    setTimeout(function() {
                        // Ищем нужный жанр и кликаем
                        var targetGenre = $('.selectbox-item:contains("' + params.genre + '")').not(':contains("Жанр")');
                        if (targetGenre.length) {
                            targetGenre.trigger('hover:enter');
                        }
                        // Возвращаемся к фильтру
                        setTimeout(function() {
                            $('.selectbox__back, .head-backward').trigger('hover:enter');
                        }, 100);
                    }, 100);
                }
            }
            
            // Способ 2: Отправляем событие
            Lampa.Listener.send('filter', { type: 'set', params: params });
            
            // Способ 3: Обновляем текущую активность
            setTimeout(function() {
                var active = Lampa.Activity.active();
                if (active && active.reload) {
                    active.reload();
                }
            }, 500);
            
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
            Lampa.Noty.show('✗ Сначала откройте фильтр и выберите параметры', 2000);
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
    
    // --- Очистка ---
    function clearAll() {
        if (confirm('Удалить все сохранённые фильтры?')) {
            savedFilters = [];
            saveFilters();
            Lampa.Noty.show('Все фильтры удалены', 2000);
        }
    }
    
    // --- Обновление меню ---
    function updateMenu() {
        // Удаляем старые пункты (кроме основного)
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
                console.log('[SmartFilters] Выбран фильтр:', filter.name);
                applyFilter(filter.params);
            });
            
            // Удаление
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
    
    // --- Добавление кнопки в панель фильтра (простой способ) ---
    function addFilterButton() {
        // Просто добавляем кнопку в конец панели фильтра
        var checkInterval = setInterval(function() {
            var selectboxBody = $('.selectbox__body');
            if (selectboxBody.length && !$('.smart-filter-save-btn').length) {
                var btn = $('<div class="selectbox-item selector smart-filter-save-btn" style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 0.5em;">\
                    <div class="selectbox-item__title">💾 Сохранить этот фильтр</div>\
                </div>');
                btn.on('hover:enter', function() {
                    saveCurrentFilter();
                });
                selectboxBody.append(btn);
                clearInterval(checkInterval);
                console.log('[SmartFilters] Кнопка сохранения добавлена');
            }
        }, 500);
    }
    
    // --- Инициализация ---
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenuItem();
        addFilterButton();
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
