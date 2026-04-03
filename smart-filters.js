(function () {
    'use strict';

    console.log('[SaveFilter] Плагин запущен');

    // Хранилище фильтров
    var STORAGE_KEY = 'saved_filters_list';
    
    // Маппинг жанров (русское название -> ID TMDB)
    var GENRES_MAP = {
        "Боевик": 28, "Приключения": 12, "Мультфильм": 16, "Комедия": 35,
        "Криминал": 80, "Документальный": 99, "Драма": 18, "Семейный": 10751,
        "Фэнтези": 14, "История": 36, "Ужасы": 27, "Музыка": 10402,
        "Детектив": 9648, "Мелодрама": 10749, "Фантастика": 878,
        "ТВ фильм": 10770, "Триллер": 53, "Военный": 10752, "Вестерн": 37
    };
    
    // Обратный маппинг (ID -> название)
    var GENRES_REVERSE = {};
    for (var g in GENRES_MAP) {
        GENRES_REVERSE[GENRES_MAP[g]] = g;
    }

    function showMsg(text) {
        console.log('[SaveFilter]', text);
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        } else {
            alert(text);
        }
    }

    // ==================== СБОР ПАРАМЕТРОВ ИЗ ИНТЕРФЕЙСА ФИЛЬТРА ====================
    
    function getCurrentFilterParams() {
        var params = {
            type: 'movie',      // movie или tv
            genres: [],
            language: null,
            yearFrom: null,
            yearTo: null
        };
        
        // Определяем тип контента по активному экрану
        var activity = Lampa.Activity.active();
        if (activity && activity.url) {
            if (activity.url.indexOf('discover/tv') !== -1 || activity.url.indexOf('/tv/') !== -1) {
                params.type = 'tv';
            }
        }
        
        // Собираем выбранные жанры из DOM
        $('.selectbox-item.selector.selectbox-item--checkbox').each(function() {
            var $item = $(this);
            var $checkbox = $item.find('.selectbox-item__checkbox');
            var isChecked = $checkbox.hasClass('checked');
            
            if (isChecked) {
                var genreName = $item.find('.selectbox-item__title').text().trim();
                if (GENRES_MAP[genreName]) {
                    params.genres.push(GENRES_MAP[genreName]);
                }
            }
        });
        
        // Собираем выбранный язык
        $('.selectbox-item.selector.selectbox-item--checkbox').each(function() {
            var $item = $(this);
            var $checkbox = $item.find('.selectbox-item__checkbox');
            var isChecked = $checkbox.hasClass('checked');
            
            if (isChecked) {
                var langName = $item.find('.selectbox-item__title').text().trim();
                // Простое преобразование языка (можно расширить)
                var langMap = {
                    'Русский': 'ru', 'Английский': 'en', 'Японский': 'ja',
                    'Китайский': 'zh', 'Корейский': 'ko', 'Французский': 'fr',
                    'Немецкий': 'de', 'Испанский': 'es', 'Итальянский': 'it'
                };
                if (langMap[langName]) {
                    params.language = langMap[langName];
                }
            }
        });
        
        // Собираем годы из полей ввода
        var yearInputs = $('.input-group input[type="text"]');
        if (yearInputs.length >= 2) {
            var fromVal = parseInt($(yearInputs[0]).val());
            var toVal = parseInt($(yearInputs[1]).val());
            if (!isNaN(fromVal)) params.yearFrom = fromVal;
            if (!isNaN(toVal)) params.yearTo = toVal;
        }
        
        return params;
    }

    // ==================== СОХРАНЕНИЕ ФИЛЬТРА ====================
    
    function saveFilter(name, params) {
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        
        var newFilter = {
            id: Date.now(),
            name: name,
            type: params.type,
            genres: params.genres,
            language: params.language,
            yearFrom: params.yearFrom,
            yearTo: params.yearTo,
            created: new Date().toISOString()
        };
        
        filters.push(newFilter);
        Lampa.Storage.set(STORAGE_KEY, filters);
        updateFiltersMenu();
        showMsg('Фильтр "' + name + '" сохранен');
    }

    // ==================== ОТКРЫТИЕ ФИЛЬТРА ====================
    
    function openFilter(filter) {
        console.log('[SaveFilter] Открываем фильтр:', filter);
        
        var baseUrl = filter.type === 'movie' ? 'discover/movie' : 'discover/tv';
        var params = [];
        
        params.push('sort_by=popularity.desc');
        params.push('language=ru-RU');
        
        if (filter.genres && filter.genres.length > 0) {
            params.push('with_genres=' + filter.genres.join(','));
        }
        
        if (filter.language) {
            params.push('with_original_language=' + filter.language);
        }
        
        if (filter.yearFrom) {
            var dateField = filter.type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
            params.push(dateField + '=' + filter.yearFrom + '-01-01');
        }
        
        if (filter.yearTo) {
            var dateFieldTo = filter.type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
            params.push(dateFieldTo + '=' + filter.yearTo + '-12-31');
        }
        
        var url = baseUrl + '?' + params.join('&');
        console.log('[SaveFilter] URL:', url);
        
        Lampa.Activity.push({
            url: url,
            title: filter.name,
            component: 'category',
            source: 'tmdb',
            page: 1
        });
    }

    // ==================== ОБНОВЛЕНИЕ МЕНЮ ====================
    
    function updateFiltersMenu() {
        // Удаляем старый раздел
        $('.menu__item[data-action="saved_filters_section"]').remove();
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        if (filters.length === 0) return;
        
        var section = $(`
            <li class="menu__item selector" data-action="saved_filters_section">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 6H20V8H4V6ZM6 11H18V13H6V11ZM10 16H14V18H10V16Z" fill="currentColor"/>
                    </svg>
                </div>
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
            
            item.on('click', function(e) {
                if ($(e.target).hasClass('menu__delete')) {
                    e.stopPropagation();
                    var newFilters = filters.filter(function(f) { return f.id !== filter.id; });
                    Lampa.Storage.set(STORAGE_KEY, newFilters);
                    updateFiltersMenu();
                    showMsg('Фильтр удален');
                } else {
                    openFilter(filter);
                }
            });
            
            submenu.append(item);
        });
        
        section.append(submenu);
        
        // Добавляем в первое меню (после стандартных пунктов)
        var menuList = $('.menu .menu__list').first();
        menuList.append(section);
    }

    // ==================== ДОБАВЛЕНИЕ КНОПКИ НА ЭКРАН ФИЛЬТРАЦИИ ====================
    
    function addSaveButtonToFilterScreen() {
        // Ищем кнопку "Применить" в окне фильтра
        function findAndAdd() {
            var applyButton = $('.selectbox__footer .selector:contains("Применить")');
            if (applyButton.length) {
                // Проверяем, не добавлена ли уже наша кнопка
                if ($('.save-filter-btn').length) return;
                
                var saveBtn = $(`
                    <div class="selector save-filter-btn" style="
                        display: inline-block;
                        padding: 8px 16px;
                        margin-left: 10px;
                        background: #4CAF50;
                        border-radius: 4px;
                        color: white;
                        cursor: pointer;
                    ">
                        💾 Сохранить фильтр
                    </div>
                `);
                
                saveBtn.on('click', function(e) {
                    e.stopPropagation();
                    var params = getCurrentFilterParams();
                    
                    // Формируем описание для подсказки
                    var genreNames = params.genres.map(function(id) {
                        return GENRES_REVERSE[id] || id;
                    }).join(', ');
                    
                    var info = 'Тип: ' + (params.type === 'movie' ? 'Фильмы' : 'Сериалы') + '\n';
                    if (genreNames) info += 'Жанры: ' + genreNames + '\n';
                    if (params.language) info += 'Язык: ' + params.language + '\n';
                    if (params.yearFrom && params.yearTo) info += 'Годы: ' + params.yearFrom + ' - ' + params.yearTo;
                    
                    var name = prompt('Введите название фильтра:\n\nТекущие параметры:\n' + info, 'Мой фильтр');
                    if (name && name.trim()) {
                        saveFilter(name.trim(), params);
                    }
                });
                
                applyButton.parent().append(saveBtn);
                console.log('[SaveFilter] Кнопка сохранения добавлена в окно фильтра');
            }
        }
        
        // Слушаем открытие окна фильтра
        Lampa.Listener.follow('selectbox', function(e) {
            if (e.type === 'open') {
                setTimeout(findAndAdd, 100);
            }
        });
    }

    // ==================== ТЕСТОВАЯ КНОПКА В МЕНЮ ====================
    
    function addTestButton() {
        if ($('.menu__item[data-action="save_filter_test"]').length) return;
        
        var btn = $(`
            <li class="menu__item selector" data-action="save_filter_test">
                <div class="menu__ico">🔧</div>
                <div class="menu__text">🔧 Сохранить фильтр</div>
            </li>
        `);
        
        btn.on('click', function(e) {
            e.stopPropagation();
            showMsg('Нажмите на иконку фильтра (🔍) в любом разделе, выберите параметры, затем нажмите "Сохранить фильтр" внизу окна фильтрации');
        });
        
        $('.menu .menu__list').first().append(btn);
    }

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    
    function init() {
        console.log('[SaveFilter] Инициализация');
        addTestButton();
        addSaveButtonToFilterScreen();
        updateFiltersMenu();
        showMsg('Плагин "Сохранение фильтров" загружен');
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
