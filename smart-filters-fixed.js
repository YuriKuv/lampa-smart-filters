(function() {
    'use strict';
    
    if (window.SmartFiltersFixed) return;
    window.SmartFiltersFixed = true;
    
    console.log('[SmartFilters] Загрузка...');
    
    var STORAGE_KEY = 'smart_filters_list';
    var savedFilters = [];
    
    // Карта жанров
    var genreIds = {
        'Боевик': 28, 'Комедия': 35, 'Драма': 18, 'Ужасы': 27, 'Триллер': 53,
        'Фантастика': 878, 'Мелодрама': 10749, 'Детектив': 9648, 'Приключения': 12,
        'Криминал': 80, 'Мультфильм': 16, 'Фэнтези': 14, 'История': 36, 'Военный': 10752
    };
    
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
    
    // Получение параметров из панели фильтра
    function getCurrentFilter() {
        try {
            var params = {};
            
            var type = $('.selectbox-item:contains("Тип") .selectbox-item__subtitle');
            if (type.length && type.text() !== 'Не выбрано') params.type = type.text();
            
            var rating = $('.selectbox-item:contains("Рейтинг") .selectbox-item__subtitle');
            if (rating.length && rating.text() !== 'Не выбрано') {
                var match = rating.text().match(/\d+/);
                if (match) params.rating = match[0];
            }
            
            var genre = $('.selectbox-item:contains("Жанр") .selectbox-item__subtitle');
            if (genre.length && genre.text() !== 'Не выбрано') params.genre = genre.text();
            
            var year = $('.selectbox-item:contains("Год") .selectbox-item__subtitle');
            if (year.length && year.text() !== 'Не выбрано' && year.text().match(/^\d{4}$/)) {
                params.year = year.text();
            }
            
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            return null;
        }
    }
    
    // Применение фильтра - используем стандартный компонент Lampa
    function applyFilter(filter) {
        console.log('[SmartFilters] Открываем:', filter.name);
        
        var params = filter.params;
        var mediaType = (params.type === 'Сериалы') ? 'tv' : 'movie';
        
        // Формируем параметры для URL
        var urlParams = [];
        urlParams.push('api_key=4ef0d7355d9ffb5151e987764708ce96');
        urlParams.push('language=ru');
        urlParams.push('sort_by=popularity.desc');
        
        if (params.genre && genreIds[params.genre]) {
            urlParams.push('with_genres=' + genreIds[params.genre]);
        }
        
        if (params.year) {
            urlParams.push('primary_release_year=' + params.year);
        }
        
        if (params.rating) {
            urlParams.push('vote_average.gte=' + params.rating);
        }
        
        var apiUrl = 'https://tmdb.' + Lampa.Manifest.cub_domain + '/3/discover/' + mediaType + '?' + urlParams.join('&');
        
        console.log('[SmartFilters] URL:', apiUrl);
        
        // Используем стандартный компонент catalog
        Lampa.Activity.push({
            url: apiUrl,
            title: filter.name,
            component: 'catalog',
            source: 'tmdb',
            page: 1
        });
    }
    
    // Сохранение фильтра
    function saveCurrentFilter() {
        var params = getCurrentFilter();
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
    
    // Удаление фильтра
    function deleteFilter(id, name) {
        if (confirm('Удалить фильтр "' + name + '"?')) {
            savedFilters = savedFilters.filter(function(f) { return f.id !== id; });
            saveFilters();
            Lampa.Noty.show('Фильтр удалён', 1000);
        }
    }
    
    // Очистка всех
    function clearAll() {
        if (savedFilters.length === 0) return;
        if (confirm('Удалить ВСЕ сохранённые фильтры?')) {
            savedFilters = [];
            saveFilters();
            Lampa.Noty.show('Все фильтры удалены', 1000);
        }
    }
    
    // Обновление меню
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
    
    // Добавление основного пункта меню
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
    
    // Кнопка сохранения в панели фильтра
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
    
    // Инициализация
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
