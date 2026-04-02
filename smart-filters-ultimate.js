(function() {
    'use strict';
    
    if (window.SmartFiltersEasy) return;
    window.SmartFiltersEasy = true;
    
    console.log('[SmartFilters] Загрузка...');
    
    var STORAGE_KEY = 'smart_filters_list';
    var savedFilters = [];
    
    function loadFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        savedFilters = Array.isArray(data) ? data : [];
        updateMenu();
    }
    
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
    }
    
    // Получение параметров из панели фильтра
    function getCurrentFilter() {
        try {
            var params = {};
            
            // Тип
            var type = $('.selectbox-item:contains("Тип") .selectbox-item__subtitle');
            if (type.length && type.text() !== 'Не выбрано') params.type = type.text();
            
            // Рейтинг
            var rating = $('.selectbox-item:contains("Рейтинг") .selectbox-item__subtitle');
            if (rating.length && rating.text() !== 'Не выбрано') {
                var match = rating.text().match(/\d+/);
                if (match) params.rating = match[0];
            }
            
            // Жанр
            var genre = $('.selectbox-item:contains("Жанр") .selectbox-item__subtitle');
            if (genre.length && genre.text() !== 'Не выбрано') params.genre = genre.text();
            
            // Год
            var year = $('.selectbox-item:contains("Год") .selectbox-item__subtitle');
            if (year.length && year.text() !== 'Не выбрано' && year.text().match(/^\d{4}$/)) {
                params.year = year.text();
            }
            
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            return null;
        }
    }
    
    // Применение фильтра - просто открываем поиск
    function applyFilter(filter) {
        console.log('[SmartFilters] Открываем:', filter.name);
        
        var params = filter.params;
        
        // Формируем поисковый запрос
        var searchParts = [];
        if (params.genre) searchParts.push(params.genre);
        if (params.year) searchParts.push(params.year);
        if (params.rating) searchParts.push('рейтинг ' + params.rating);
        
        var searchQuery = searchParts.join(' ');
        
        // Открываем раздел поиска с нашими параметрами
        Lampa.Activity.push({
            url: '',
            title: filter.name,
            component: 'search',
            search_query: searchQuery,
            page: 1
        });
        
        Lampa.Noty.show('✓ Открыт фильтр "' + filter.name + '"', 1500);
    }
    
    // Сохранение фильтра
    function saveCurrentFilter() {
        var params = getCurrentFilter();
        if (!params) {
            Lampa.Noty.show('Выберите параметры в фильтре', 2000);
            return;
        }
        
        var name = prompt('Название фильтра:', 'Мой фильтр');
        if (name && name.trim()) {
            savedFilters.push({
                id: Date.now(),
                name: name.trim(),
                params: params,
                date: new Date().toLocaleString()
            });
            saveFilters();
            Lampa.Noty.show('Сохранено: ' + name, 2000);
        }
    }
    
    // Удаление
    function deleteFilter(id, name) {
        if (confirm('Удалить "' + name + '"?')) {
            savedFilters = savedFilters.filter(function(f) { return f.id !== id; });
            saveFilters();
            Lampa.Noty.show('Удалено', 1000);
        }
    }
    
    // Очистка всех
    function clearAll() {
        if (savedFilters.length === 0) return;
        if (confirm('Удалить ВСЕ фильтры?')) {
            savedFilters = [];
            saveFilters();
            Lampa.Noty.show('Все фильтры удалены', 1000);
        }
    }
    
    // Обновление меню
    function updateMenu() {
        $('.menu__item[data-easy-filter="true"]').remove();
        
        var filterItem = $('.menu__item[data-action="filter"]');
        if (!filterItem.length) return;
        
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-easy-filter="true">\
                <div class="menu__ico">\
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">\
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>\
                    </svg>\
                </div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
            </li>');
            
            filterItem.after(item);
            
            item.on('hover:enter', function() {
                applyFilter(filter);
            });
        });
    }
    
    // Основной пункт меню
    function addMainMenu() {
        $('.menu__item[data-easy-main="true"]').remove();
        
        var filterItem = $('.menu__item[data-action="filter"]');
        if (!filterItem.length) return;
        
        var mainItem = $('<li class="menu__item selector" data-easy-main="true">\
            <div class="menu__ico">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">\
                    <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/>\
                </svg>\
            </div>\
            <div class="menu__text">📁 Мои фильтры</div>\
        </li>');
        
        filterItem.after(mainItem);
        
        mainItem.on('hover:enter', function() {
            if (savedFilters.length === 0) {
                Lampa.Noty.show('Нет сохранённых фильтров', 2000);
                return;
            }
            
            var items = savedFilters.map(function(f) {
                return { title: f.name, subtitle: f.date, filter: f };
            });
            
            Lampa.Select.show({
                title: 'Мои фильтры',
                items: items,
                onSelect: function(item) {
                    applyFilter(item.filter);
                }
            });
        });
    }
    
    // Кнопка сохранения
    function addSaveButton() {
        var check = setInterval(function() {
            var panel = $('.selectbox__body');
            if (panel.length && !$('.easy-save-btn').length) {
                var btn = $('<div class="selectbox-item selector easy-save-btn" style="border-top:1px solid rgba(255,255,255,0.1);margin-top:0.5em;">\
                    <div class="selectbox-item__title">💾 Сохранить фильтр</div>\
                </div>');
                btn.on('hover:enter', saveCurrentFilter);
                panel.append(btn);
                clearInterval(check);
            }
        }, 1000);
    }
    
    // Настройки
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        
        Lampa.SettingsApi.addComponent({
            component: 'smart_filters',
            name: 'Smart Filters',
            icon: '🔖'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'clear', type: 'button' },
            field: { name: 'Очистить все фильтры' },
            onChange: clearAll
        });
    }
    
    // Запуск
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenu();
        addSaveButton();
        addSettings();
        Lampa.Noty.show('Smart Filters загружен', 1500);
    }
    
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', init);
    }
    
})();
