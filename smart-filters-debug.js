(function() {
    'use strict';
    
    if (window.SmartFiltersDebug) return;
    window.SmartFiltersDebug = true;
    
    console.log('[SmartFilters] Загрузка...');
    
    var STORAGE_KEY = 'smart_filters_list';
    var savedFilters = [];
    
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
    
    // Получение параметров - ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ
    function getCurrentFilter() {
        try {
            var params = {};
            
            // Тип
            var typeEl = $('.selectbox-item:contains("Тип") .selectbox-item__subtitle');
            if (typeEl.length && typeEl.text() !== 'Не выбрано') {
                params.type = typeEl.text();
                console.log('[SmartFilters] Найден тип:', params.type);
            }
            
            // Рейтинг
            var ratingEl = $('.selectbox-item:contains("Рейтинг") .selectbox-item__subtitle');
            if (ratingEl.length && ratingEl.text() !== 'Не выбрано') {
                var ratingText = ratingEl.text();
                var match = ratingText.match(/\d+/);
                if (match) {
                    params.rating = match[0];
                    console.log('[SmartFilters] Найден рейтинг:', params.rating);
                }
            }
            
            // Жанр
            var genreEl = $('.selectbox-item:contains("Жанр") .selectbox-item__subtitle');
            if (genreEl.length && genreEl.text() !== 'Не выбрано') {
                params.genre = genreEl.text();
                console.log('[SmartFilters] Найден жанр:', params.genre);
            }
            
            // Год
            var yearEl = $('.selectbox-item:contains("Год") .selectbox-item__subtitle');
            if (yearEl.length && yearEl.text() !== 'Не выбрано' && yearEl.text().match(/^\d{4}$/)) {
                params.year = yearEl.text();
                console.log('[SmartFilters] Найден год:', params.year);
            }
            
            console.log('[SmartFilters] ВСЕ СОХРАНЯЕМЫЕ ПАРАМЕТРЫ:', params);
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка при сборе:', e);
            return null;
        }
    }
    
    // Применение фильтра - через стандартный поиск TMDB
    function applyFilter(filter) {
        console.log('[SmartFilters] ОТКРЫВАЕМ ФИЛЬТР:', filter.name);
        console.log('[SmartFilters] ПАРАМЕТРЫ ФИЛЬТРА:', filter.params);
        
        var params = filter.params;
        
        // Формируем правильный URL для TMDB API
        var mediaType = 'movie';
        if (params.type === 'Сериалы') {
            mediaType = 'tv';
        }
        
        var apiUrl = 'https://tmdb.' + Lampa.Manifest.cub_domain + '/3/discover/' + mediaType;
        apiUrl += '?api_key=4ef0d7355d9ffb5151e987764708ce96';
        apiUrl += '&language=ru';
        apiUrl += '&sort_by=popularity.desc';
        
        // Карта жанров для преобразования
        var genreMap = {
            'Боевик': 28, 'Комедия': 35, 'Драма': 18, 'Ужасы': 27, 'Триллер': 53,
            'Фантастика': 878, 'Мелодрама': 10749, 'Детектив': 9648, 'Приключения': 12,
            'Криминал': 80, 'Мультфильм': 16, 'Фэнтези': 14, 'История': 36, 'Военный': 10752
        };
        
        if (params.genre && genreMap[params.genre]) {
            apiUrl += '&with_genres=' + genreMap[params.genre];
            console.log('[SmartFilters] Добавлен жанр:', params.genre, '-> ID:', genreMap[params.genre]);
        }
        
        if (params.year) {
            apiUrl += '&primary_release_year=' + params.year;
            console.log('[SmartFilters] Добавлен год:', params.year);
        }
        
        if (params.rating) {
            apiUrl += '&vote_average.gte=' + params.rating;
            console.log('[SmartFilters] Добавлен рейтинг:', params.rating);
        }
        
        apiUrl += '&page=1';
        
        console.log('[SmartFilters] ИТОГОВЫЙ URL:', apiUrl);
        
        // Открываем раздел с результатами
        Lampa.Activity.push({
            url: apiUrl,
            title: filter.name,
            component: 'catalog',
            source: 'tmdb',
            page: 1
        });
        
        Lampa.Noty.show('✓ Открыт фильтр "' + filter.name + '"', 1500);
    }
    
    // Сохранение
    function saveCurrentFilter() {
        var params = getCurrentFilter();
        if (!params) {
            Lampa.Noty.show('Сначала выберите параметры в фильтре', 2000);
            return;
        }
        
        var name = prompt('Название фильтра:', 'Мой фильтр');
        if (name && name.trim()) {
            var newFilter = {
                id: Date.now(),
                name: name.trim(),
                params: params,
                date: new Date().toLocaleString()
            };
            savedFilters.push(newFilter);
            saveFilters();
            Lampa.Noty.show('✓ Фильтр "' + name + '" сохранён', 2000);
            console.log('[SmartFilters] СОХРАНЁННЫЙ ФИЛЬТР:', newFilter);
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
        $('.menu__item[data-debug-filter="true"]').remove();
        
        var filterItem = $('.menu__item[data-action="filter"]');
        if (!filterItem.length) return;
        
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-debug-filter="true">\
                <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg></div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
            </li>');
            
            filterItem.after(item);
            item.on('hover:enter', function() { applyFilter(filter); });
        });
    }
    
    // Основной пункт меню
    function addMainMenu() {
        $('.menu__item[data-debug-main="true"]').remove();
        
        var filterItem = $('.menu__item[data-action="filter"]');
        if (!filterItem.length) return;
        
        var mainItem = $('<li class="menu__item selector" data-debug-main="true">\
            <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/></svg></div>\
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
                onSelect: function(item) { applyFilter(item.filter); }
            });
        });
    }
    
    // Кнопка сохранения
    function addSaveButton() {
        var check = setInterval(function() {
            var panel = $('.selectbox__body');
            if (panel.length && !$('.debug-save-btn').length) {
                var btn = $('<div class="selectbox-item selector debug-save-btn" style="border-top:1px solid rgba(255,255,255,0.1);margin-top:0.5em;">\
                    <div class="selectbox-item__title">💾 Сохранить фильтр</div>\
                </div>');
                btn.on('hover:enter', saveCurrentFilter);
                panel.append(btn);
                clearInterval(check);
                console.log('[SmartFilters] Кнопка сохранения добавлена');
            }
        }, 1000);
    }
    
    // Настройки
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        Lampa.SettingsApi.addComponent({ component: 'smart_filters', name: 'Smart Filters', icon: '🔖' });
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'clear', type: 'button' },
            field: { name: 'Очистить все фильтры' },
            onChange: clearAll
        });
    }
    
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenu();
        addSaveButton();
        addSettings();
        Lampa.Noty.show('Smart Filters загружен', 1500);
    }
    
    if (window.appready) init();
    else Lampa.Listener.follow('app', init);
    
})();
