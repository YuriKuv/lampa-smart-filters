(function () {
    'use strict';

    console.log('[FilterCreator] Плагин запущен');

    var STORAGE_KEY = 'user_filters_list';
    
    // Маппинг жанров
    var GENRES_LIST = [
        "Боевик", "Приключения", "Мультфильм", "Комедия", "Криминал",
        "Документальный", "Драма", "Семейный", "Фэнтези", "История",
        "Ужасы", "Музыка", "Детектив", "Мелодрама", "Фантастика",
        "Триллер", "Военный", "Вестерн"
    ];
    
    var GENRES_MAP = {
        "Боевик": 28, "Приключения": 12, "Мультфильм": 16, "Комедия": 35,
        "Криминал": 80, "Документальный": 99, "Драма": 18, "Семейный": 10751,
        "Фэнтези": 14, "История": 36, "Ужасы": 27, "Музыка": 10402,
        "Детектив": 9648, "Мелодрама": 10749, "Фантастика": 878,
        "Триллер": 53, "Военный": 10752, "Вестерн": 37
    };
    
    var LANGUAGES_LIST = [
        "Русский", "Английский", "Японский", "Китайский", "Корейский",
        "Французский", "Немецкий", "Испанский", "Итальянский"
    ];
    
    var LANGUAGES_MAP = {
        "Русский": "ru", "Английский": "en", "Японский": "ja",
        "Китайский": "zh", "Корейский": "ko", "Французский": "fr",
        "Немецкий": "de", "Испанский": "es", "Итальянский": "it"
    };

    function showMsg(text) {
        console.log('[FilterCreator]', text);
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        }
    }

    // ==================== ОКНО СОЗДАНИЯ ФИЛЬТРА ====================
    
    function openFilterCreator() {
        var selectedType = 'movie';
        var selectedGenres = [];
        var selectedLanguage = '';
        var yearFrom = 2000;
        var yearTo = new Date().getFullYear();
        
        function updateGenresDisplay() {
            var container = $('#filter_genres_selected');
            if (container.length) {
                var names = selectedGenres.map(function(id) {
                    for (var name in GENRES_MAP) {
                        if (GENRES_MAP[name] === id) return name;
                    }
                    return id;
                });
                container.text(names.length ? '✓ ' + names.join(', ') : 'Не выбраны');
            }
        }
        
        var dialogHtml = `
            <div id="filter_creator_dialog" style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 90%;
                max-width: 500px;
                max-height: 80vh;
                background: #1a1a2e;
                border-radius: 12px;
                z-index: 10000;
                color: white;
                overflow: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            ">
                <div style="padding: 20px;">
                    <div style="font-size: 20px; margin-bottom: 15px; text-align: center;">➕ Создать фильтр</div>
                    
                    <div style="margin-bottom: 15px;">
                        <div style="margin-bottom: 5px; color: #aaa;">Тип контента</div>
                        <div style="display: flex; gap: 10px;">
                            <div class="filter_type_btn" data-type="movie" style="flex:1; padding: 8px; text-align: center; background: #4CAF50; border-radius: 6px; cursor: pointer;">🎬 Фильмы</div>
                            <div class="filter_type_btn" data-type="tv" style="flex:1; padding: 8px; text-align: center; background: #333; border-radius: 6px; cursor: pointer;">📺 Сериалы</div>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <div style="margin-bottom: 5px; color: #aaa;">Жанры</div>
                        <div id="filter_genres_list" style="display: flex; flex-wrap: wrap; gap: 8px; max-height: 150px; overflow-y: auto; padding: 5px; background: #0d0d1a; border-radius: 8px;">
                            ${GENRES_LIST.map(function(g) { 
                                return '<div class="genre_item" data-genre="' + g + '" style="padding: 5px 10px; background: #2a2a3e; border-radius: 20px; cursor: pointer;">' + g + '</div>';
                            }).join('')}
                        </div>
                        <div style="margin-top: 8px; font-size: 12px; color: #aaa;">Выбрано: <span id="filter_genres_selected">Не выбраны</span></div>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <div style="margin-bottom: 5px; color: #aaa;">Язык оригинала</div>
                        <select id="filter_language" style="width: 100%; padding: 8px; background: #2a2a3e; color: white; border: none; border-radius: 6px;">
                            <option value="">Любой</option>
                            ${LANGUAGES_LIST.map(function(l) { return '<option value="' + LANGUAGES_MAP[l] + '">' + l + '</option>'; }).join('')}
                        </select>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <div style="margin-bottom: 5px; color: #aaa;">Годы</div>
                        <div style="display: flex; gap: 10px;">
                            <input type="number" id="filter_year_from" value="2000" placeholder="с" style="flex:1; padding: 8px; background: #2a2a3e; color: white; border: none; border-radius: 6px;">
                            <input type="number" id="filter_year_to" value="${new Date().getFullYear()}" placeholder="по" style="flex:1; padding: 8px; background: #2a2a3e; color: white; border: none; border-radius: 6px;">
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <div id="filter_save_btn" style="flex:1; padding: 10px; text-align: center; background: #4CAF50; border-radius: 6px; cursor: pointer;">💾 Сохранить</div>
                        <div id="filter_cancel_btn" style="flex:1; padding: 10px; text-align: center; background: #555; border-radius: 6px; cursor: pointer;">Отмена</div>
                    </div>
                </div>
            </div>
            <div id="filter_overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999;"></div>
        `;
        
        $('body').append(dialogHtml);
        
        $('.filter_type_btn').on('click', function() {
            $('.filter_type_btn').css('background', '#333');
            $(this).css('background', '#4CAF50');
            selectedType = $(this).data('type');
        });
        
        $('.genre_item').on('click', function() {
            var genreName = $(this).data('genre');
            var genreId = GENRES_MAP[genreName];
            
            var index = selectedGenres.indexOf(genreId);
            if (index === -1) {
                selectedGenres.push(genreId);
                $(this).css('background', '#4CAF50');
            } else {
                selectedGenres.splice(index, 1);
                $(this).css('background', '#2a2a3e');
            }
            updateGenresDisplay();
        });
        
        $('#filter_save_btn').on('click', function() {
            yearFrom = parseInt($('#filter_year_from').val()) || 2000;
            yearTo = parseInt($('#filter_year_to').val()) || new Date().getFullYear();
            selectedLanguage = $('#filter_language').val() || '';
            
            var name = prompt('Введите название фильтра:', 'Мой фильтр');
            if (name && name.trim()) {
                var newFilter = {
                    id: Date.now(),
                    name: name.trim(),
                    type: selectedType,
                    genres: selectedGenres,
                    language: selectedLanguage,
                    yearFrom: yearFrom,
                    yearTo: yearTo
                };
                
                var filters = Lampa.Storage.get(STORAGE_KEY, []);
                filters.push(newFilter);
                Lampa.Storage.set(STORAGE_KEY, filters);
                updateFiltersMenu();
                showMsg('Фильтр "' + name + '" сохранен');
            }
            
            $('#filter_creator_dialog, #filter_overlay').remove();
        });
        
        $('#filter_cancel_btn, #filter_overlay').on('click', function() {
            $('#filter_creator_dialog, #filter_overlay').remove();
        });
    }

    // ==================== ОТКРЫТИЕ ФИЛЬТРА (ИСПРАВЛЕННАЯ ВЕРСИЯ 2) ====================
    
    function openFilter(filter) {
        console.log('[FilterCreator] Открываем фильтр:', filter);
        
        // Определяем базовый URL
        var baseUrl = filter.type === 'movie' ? 'discover/movie' : 'discover/tv';
        
        // Собираем параметры в объект, как это делает Lampa
        var params = {
            sort_by: 'popularity.desc',
            language: 'ru-RU',
            page: 1
        };
        
        // Добавляем жанры (как строку через запятую)
        if (filter.genres && filter.genres.length > 0) {
            params.with_genres = filter.genres.join(',');
        }
        
        // Добавляем язык
        if (filter.language && filter.language !== '') {
            params.with_original_language = filter.language;
        }
        
        // Добавляем годы
        if (filter.yearFrom) {
            var dateField = filter.type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
            params[dateField] = filter.yearFrom + '-01-01';
        }
        
        if (filter.yearTo) {
            var dateFieldTo = filter.type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
            params[dateFieldTo] = filter.yearTo + '-12-31';
        }
        
        // Формируем URL строку
        var urlParams = [];
        for (var key in params) {
            urlParams.push(key + '=' + encodeURIComponent(params[key]));
        }
        var url = baseUrl + '?' + urlParams.join('&');
        
        console.log('[FilterCreator] URL:', url);
        
        // Открываем категорию
        try {
            Lampa.Activity.push({
                url: url,
                title: filter.name,
                component: 'category',
                source: 'tmdb',
                page: 1
            });
        } catch (e) {
            console.error('[FilterCreator] Ошибка:', e);
            showMsg('Ошибка открытия: ' + e.message);
        }
    }
    // ==================== ОБНОВЛЕНИЕ МЕНЮ (БЕЗ ДУБЛЕЙ) ====================
    
    function updateFiltersMenu() {
        // Удаляем только старые пункты, но не все
        $('.menu__item[data-action="user_filters_section"]').remove();
        $('.menu__item[data-action="create_filter_btn"]').remove();
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        
        // Кнопка создания нового фильтра
        var createBtn = $(`
            <li class="menu__item selector" data-action="create_filter_btn">
                <div class="menu__ico">➕</div>
                <div class="menu__text">➕ Создать фильтр</div>
            </li>
        `);
        
        createBtn.on('click', function(e) {
            e.stopPropagation();
            openFilterCreator();
        });
        
        $('.menu .menu__list').first().append(createBtn);
        
        if (filters.length === 0) return;
        
        var section = $(`
            <li class="menu__item selector" data-action="user_filters_section">
                <div class="menu__ico">📁</div>
                <div class="menu__text">📁 Мои фильтры</div>
            </li>
        `);
        
        var submenu = $('<div class="menu__submenu"></div>');
        
        filters.forEach(function(filter) {
            var item = $(`
                <div class="menu__item selector submenu-item" data-filter-id="${filter.id}">
                    <div class="menu__ico">🔖</div>
                    <div class="menu__text">${filter.name}</div>
                    <div class="menu__delete" style="margin-left: auto; padding: 0 10px; color: #ff5555;">✕</div>
                </div>
            `);
            
            // Обработчик клика (исправленный)
            item.off('click').on('click', function(e) {
                // Проверяем, кликнули ли на крестик
                if ($(e.target).hasClass('menu__delete') || $(e.target).parent().hasClass('menu__delete')) {
                    e.stopPropagation();
                    e.preventDefault();
                    var newFilters = filters.filter(function(f) { return f.id !== filter.id; });
                    Lampa.Storage.set(STORAGE_KEY, newFilters);
                    updateFiltersMenu();
                    showMsg('Фильтр "' + filter.name + '" удален');
                    return false;
                }
                // Иначе открываем фильтр
                openFilter(filter);
                return false;
            });
    // ==================== ЗАПУСК ====================
    
    function init() {
        console.log('[FilterCreator] Инициализация');
        updateFiltersMenu();
        showMsg('Плагин загружен. Нажмите "➕ Создать фильтр" в меню');
    }
    
    if (typeof Lampa !== 'undefined') {
        if (window.appready) {
            init();
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') init();
            });
        }
    }
})();
