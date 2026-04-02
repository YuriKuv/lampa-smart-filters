(function() {
    'use strict';
    
    if (window.SmartFiltersFinal) return;
    window.SmartFiltersFinal = true;
    
    console.log('[SmartFilters] Загрузка...');
    
    // --- Хранилище ---
    const STORAGE_KEY = 'smart_filters_saved';
    let savedFilters = [];
    
    // --- Карта жанров ---
    const genreMap = {
        'Боевик': 28, 'Вестерн': 37, 'Военный': 10752, 'Детектив': 9648,
        'Детский': 10751, 'Документальный': 99, 'Драма': 18, 'История': 36,
        'Комедия': 35, 'Криминал': 80, 'Мелодрама': 10749, 'Мультфильм': 16,
        'Музыка': 10402, 'Мюзикл': 10402, 'Приключения': 12, 'Семейный': 10751,
        'Триллер': 53, 'Ужасы': 27, 'Фантастика': 878, 'Фэнтези': 14
    };
    
    // --- Загрузка ---
    function loadFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        savedFilters = Array.isArray(data) ? data : [];
        console.log('[SmartFilters] Загружено:', savedFilters.length);
        updateMenu();
    }
    
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
    }
    
    // --- Получение параметров из панели фильтра ---
    function getCurrentFilterParams() {
        try {
            var params = {};
            
            var typeEl = $('.selectbox-item:contains("Тип") .selectbox-item__subtitle');
            if (typeEl.length && typeEl.text() !== 'Не выбрано') {
                params.type = typeEl.text();
            }
            
            var ratingEl = $('.selectbox-item:contains("Рейтинг") .selectbox-item__subtitle');
            if (ratingEl.length && ratingEl.text() !== 'Не выбрано') {
                var match = ratingEl.text().match(/\d+/);
                if (match) params.rating = match[0];
            }
            
            var genreEl = $('.selectbox-item:contains("Жанр") .selectbox-item__subtitle');
            if (genreEl.length && genreEl.text() !== 'Не выбрано') {
                params.genre = genreEl.text();
            }
            
            var yearEl = $('.selectbox-item:contains("Год") .selectbox-item__subtitle');
            if (yearEl.length && yearEl.text() !== 'Не выбрано') {
                var yearMatch = yearEl.text().match(/\d{4}/);
                if (yearMatch) params.year = yearMatch[0];
            }
            
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            return null;
        }
    }
    
    // --- ПРИМЕНЕНИЕ ФИЛЬТРА (через category_full, как в плагинах) ---
    function applyFilter(filter) {
        console.log('[SmartFilters] Открываем:', filter.name);
        console.log('[SmartFilters] Параметры:', filter.params);
        
        var params = filter.params;
        
        // Формируем URL параметры для category_full
        var urlParams = [];
        
        // Тип контента
        var mediaType = 'movie';
        if (params.type === 'Сериалы') mediaType = 'tv';
        
        // Жанр
        if (params.genre && genreMap[params.genre]) {
            urlParams.push('with_genres=' + genreMap[params.genre]);
        }
        
        // Год
        if (params.year) {
            if (mediaType === 'movie') {
                urlParams.push('primary_release_year=' + params.year);
            } else {
                urlParams.push('first_air_date_year=' + params.year);
            }
        }
        
        // Рейтинг
        if (params.rating) {
            urlParams.push('vote_average.gte=' + params.rating);
        }
        
        // Сортировка
        urlParams.push('sort_by=popularity.desc');
        urlParams.push('language=ru');
        
        var queryString = urlParams.join('&');
        var fullUrl = 'discover/' + mediaType + '?' + queryString;
        
        console.log('[SmartFilters] URL для category_full:', fullUrl);
        
        // Используем стандартный компонент category_full (как в примерах плагинов)
        Lampa.Activity.push({
            url: fullUrl,
            title: filter.name,
            component: 'category_full',
            source: 'tmdb',
            page: 1
        });
        
        Lampa.Noty.show('✓ Открыт фильтр "' + filter.name + '"', 1500);
    }
    
    // --- Сохранение ---
    function saveCurrentFilter() {
        var params = getCurrentFilterParams();
        
        if (!params) {
            Lampa.Noty.show('Сначала выберите параметры в фильтре', 2000);
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
    
    // --- Удаление ---
    function deleteFilter(id, name) {
        Lampa.Select.show({
            title: 'Удалить "' + name + '"?',
            items: [{ title: 'Да' }, { title: 'Нет' }],
            onSelect: function(item) {
                if (item.title === 'Да') {
                    savedFilters = savedFilters.filter(function(f) { return f.id !== id; });
                    saveFilters();
                    Lampa.Noty.show('Фильтр удалён', 1000);
                }
            }
        });
    }
    
    // --- Очистка всех ---
    function clearAllFilters() {
        if (savedFilters.length === 0) return;
        Lampa.Select.show({
            title: 'Удалить ВСЕ фильтры?',
            items: [{ title: 'Да' }, { title: 'Нет' }],
            onSelect: function(item) {
                if (item.title === 'Да') {
                    savedFilters = [];
                    saveFilters();
                    Lampa.Noty.show('Все фильтры удалены', 1000);
                }
            }
        });
    }
    
    // --- Обновление меню ---
    function updateMenu() {
        $('.menu__item[data-smart-filter="true"]').remove();
        
        var filterItem = $('.menu__item[data-action="filter"]');
        if (!filterItem.length) return;
        
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-smart-filter="true">\
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
    
    // --- Основной пункт меню ---
    function addMainMenu() {
        $('.menu__item[data-smart-main="true"]').remove();
        
        var filterItem = $('.menu__item[data-action="filter"]');
        if (!filterItem.length) return;
        
        var mainItem = $('<li class="menu__item selector" data-smart-main="true">\
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
    
    // --- Кнопка сохранения ---
    function addSaveButton() {
        var check = setInterval(function() {
            var panel = $('.selectbox__body');
            if (panel.length && !$('.smart-save-filter-btn').length) {
                var btn = $('<div class="selectbox-item selector smart-save-filter-btn" style="border-top:1px solid rgba(255,255,255,0.1);margin-top:0.5em;">\
                    <div class="selectbox-item__title">💾 Сохранить фильтр</div>\
                </div>');
                btn.on('hover:enter', saveCurrentFilter);
                panel.append(btn);
                clearInterval(check);
                console.log('[SmartFilters] Кнопка добавлена');
            }
        }, 1000);
    }
    
    // --- Настройки ---
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
            onChange: clearAllFilters
        });
    }
    
    // --- Запуск ---
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenu();
        addSaveButton();
        addSettings();
        console.log('[SmartFilters] Готов!');
        Lampa.Noty.show('Smart Filters загружен', 1500);
    }
    
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', init);
    }
    
})();
