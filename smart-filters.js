(function() {
    'use strict';
    
    // Защита от повторной загрузки
    if (window.SmartFiltersSimple) return;
    window.SmartFiltersSimple = true;
    
    console.log('[SmartFilters] Загрузка...');
    
    // --- Хранилище ---
    var STORAGE_KEY = 'smart_filters_list';
    var savedFilters = [];
    
    // --- Загрузка ---
    function loadFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        if (data && Array.isArray(data)) {
            savedFilters = data;
        } else {
            savedFilters = [];
        }
        console.log('[SmartFilters] Загружено:', savedFilters.length);
        updateMenu();
    }
    
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
    }
    
    // --- Получение параметров ---
    function getCurrentFilter() {
        try {
            var params = {};
            
            // Тип
            var type = $('.selectbox-item:contains("Тип") .selectbox-item__subtitle');
            if (type.length && type.text() !== 'Не выбрано') {
                params.type = type.text();
            }
            
            // Рейтинг
            var rating = $('.selectbox-item:contains("Рейтинг") .selectbox-item__subtitle');
            if (rating.length && rating.text() !== 'Не выбрано') {
                var rateText = rating.text();
                var match = rateText.match(/\d+/);
                if (match) params.rating = match[0];
            }
            
            // Жанр
            var genre = $('.selectbox-item:contains("Жанр") .selectbox-item__subtitle');
            if (genre.length && genre.text() !== 'Не выбрано') {
                params.genre = genre.text();
            }
            
            // Страна
            var country = $('.selectbox-item:contains("Язык оригинала") .selectbox-item__subtitle');
            if (country.length && country.text() !== 'Не выбрано') {
                params.country = country.text();
            }
            
            // Год
            var year = $('.selectbox-item:contains("Год") .selectbox-item__subtitle');
            if (year.length && year.text() !== 'Не выбрано' && year.text().match(/^\d{4}$/)) {
                params.year = year.text();
            }
            
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            console.error(e);
            return null;
        }
    }
    
    // --- Применение фильтра ---
    function applyFilter(filter) {
        try {
            console.log('[SmartFilters] Применяем:', filter.name);
            
            var params = filter.params;
            var mediaType = (params.type === 'Сериалы') ? 'tv' : 'movie';
            
            var url = 'https://tmdb.' + Lampa.Manifest.cub_domain + '/3/discover/' + mediaType;
            url += '?api_key=4ef0d7355d9ffb5151e987764708ce96&language=ru&sort_by=popularity.desc';
            
            // Карта жанров
            var genreIds = {
                'Боевик': 28, 'Комедия': 35, 'Драма': 18, 'Ужасы': 27, 'Триллер': 53,
                'Фантастика': 878, 'Мелодрама': 10749, 'Детектив': 9648, 'Приключения': 12,
                'Криминал': 80, 'Мультфильм': 16, 'Фэнтези': 14, 'История': 36, 'Военный': 10752
            };
            
            if (params.genre && genreIds[params.genre]) {
                url += '&with_genres=' + genreIds[params.genre];
            }
            
            if (params.year) {
                url += '&primary_release_year=' + params.year;
            }
            
            if (params.rating) {
                url += '&vote_average.gte=' + params.rating;
            }
            
            url += '&page=1';
            
            var componentName = 'filter_' + filter.id;
            
            var FilterComp = function(obj) {
                var comp = new Lampa.InteractionCategory(obj);
                comp.create = function() {
                    Lampa.Api.request(url, function(data) {
                        if (data && data.results) this.build(data);
                        else this.empty();
                    }.bind(this));
                };
                comp.nextPageReuest = function(obj, resolve, reject) {
                    var nextUrl = url.replace('page=1', 'page=' + obj.page);
                    Lampa.Api.request(nextUrl, resolve, reject);
                };
                return comp;
            };
            
            Lampa.Component.add(componentName, FilterComp);
            
            Lampa.Activity.push({
                url: url,
                title: filter.name,
                component: componentName,
                page: 1
            });
            
        } catch(e) {
            console.error(e);
            Lampa.Noty.show('Ошибка', 2000);
        }
    }
    
    // --- Сохранение ---
    function saveCurrentFilter() {
        var params = getCurrentFilter();
        if (!params) {
            Lampa.Noty.show('Выберите параметры фильтра', 2000);
            return;
        }
        
        var name = prompt('Название фильтра:', 'Мой фильтр');
        if (name && name.trim()) {
            savedFilters.push({
                id: Date.now(),
                name: name.trim(),
                params: params,
                date: new Date().toLocaleDateString()
            });
            saveFilters();
            Lampa.Noty.show('Сохранено: ' + name, 2000);
        }
    }
    
    // --- Удаление ---
    function deleteFilter(id, name) {
        if (confirm('Удалить "' + name + '"?')) {
            savedFilters = savedFilters.filter(function(f) { return f.id !== id; });
            saveFilters();
            Lampa.Noty.show('Удалено', 1000);
        }
    }
    
    // --- Очистка всех ---
    function clearAll() {
        if (savedFilters.length === 0) return;
        if (confirm('Удалить ВСЕ фильтры?')) {
            savedFilters = [];
            saveFilters();
            Lampa.Noty.show('Все фильтры удалены', 1000);
        }
    }
    
    // --- Обновление меню (без дублей) ---
    function updateMenu() {
        // Удаляем все наши пункты
        $('.menu__item[data-smart-filter="true"]').remove();
        
        // Находим пункт "Фильтр"
        var filterItem = $('.menu__item[data-action="filter"]');
        if (!filterItem.length) return;
        
        // Добавляем сохранённые фильтры
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
    
    // --- Добавление пункта "Мои фильтры" ---
    function addMainMenu() {
        // Удаляем старый
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
    
    // --- Кнопка в панели фильтра ---
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
            onChange: clearAll
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
