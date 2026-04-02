(function () {
    'use strict';
    
    var STORAGE_KEY = 'saved_filters_v2';
    
    // ==================== СПРАВОЧНИКИ ====================
    var GENRES_MAP = {
        "Боевик": 28, "Приключения": 12, "Мультфильм": 16, "Комедия": 35,
        "Криминал": 80, "Документальный": 99, "Драма": 18, "Семейный": 10751,
        "Фэнтези": 14, "История": 36, "Ужасы": 27, "Музыка": 10402,
        "Детектив": 9648, "Мелодрама": 10749, "Научная фантастика": 878,
        "Телевизионный фильм": 10770, "Триллер": 53, "Военный": 10752, "Вестерн": 37
    };
    
    var LANGUAGES_MAP = {
        "Русский": "ru", "Украинский": "uk", "Белорусский": "be", "Английский": "en",
        "Японский": "ja", "Китайский": "zh", "Корейский": "ko", "Французский": "fr",
        "Немецкий": "de", "Испанский": "es", "Итальянский": "it", "Португальский": "pt"
    };
    
    // ==================== РАБОТА С ХРАНИЛИЩЕМ ====================
    function getFilters() {
        var saved = Lampa.Storage.get(STORAGE_KEY);
        if (!saved) return [];
        if (typeof saved === 'string') {
            try { return JSON.parse(saved); } catch(e) { return []; }
        }
        return saved;
    }
    
    function saveFilters(filters) {
        Lampa.Storage.set(STORAGE_KEY, filters);
    }
    
    function addFilter(name, filterData) {
        var filters = getFilters();
        filters.push({
            id: Date.now(),
            name: name,
            type: filterData.type,
            genres: filterData.genres || [],
            language: filterData.language,
            yearFrom: filterData.yearFrom,
            yearTo: filterData.yearTo
        });
        saveFilters(filters);
        return filters;
    }
    
    function removeFilter(id) {
        var filters = getFilters();
        var newFilters = [];
        for (var i = 0; i < filters.length; i++) {
            if (filters[i].id != id) newFilters.push(filters[i]);
        }
        saveFilters(newFilters);
        return newFilters;
    }
    
    // ==================== СБОР ФИЛЬТРОВ ====================
    function getCurrentType() {
        var act = Lampa.Activity.active();
        if (!act) return 'movie';
        var url = act.url || '';
        if (url.indexOf('/tv') !== -1 || url.indexOf('discover/tv') !== -1) return 'tv';
        return 'movie';
    }
    
    function getSelectedGenres() {
        var genres = [];
        $('.selectbox-item--checkbox').each(function() {
            var $item = $(this);
            var $check = $item.find('.selectbox-item__checkbox');
            if ($check.hasClass('active') || $check.hasClass('checked')) {
                var title = $item.find('.selectbox-item__title').text().trim();
                if (GENRES_MAP[title]) genres.push(GENRES_MAP[title]);
            }
        });
        return genres;
    }
    
    function getSelectedLanguage() {
        var lang = null;
        $('.selectbox-item--checkbox').each(function() {
            var $item = $(this);
            var $check = $item.find('.selectbox-item__checkbox');
            if (($check.hasClass('active') || $check.hasClass('checked')) && !lang) {
                var title = $item.find('.selectbox-item__title').text().trim();
                if (LANGUAGES_MAP[title]) lang = LANGUAGES_MAP[title];
            }
        });
        return lang;
    }
    
    function getYearRange() {
        var from = null, to = null;
        var text = $('.selectbox:contains("Год"), .selectbox:contains("Годы")').text();
        var match = text.match(/(\d{4})\s*[-–]\s*(\d{4})/);
        if (match) {
            from = parseInt(match[1]);
            to = parseInt(match[2]);
        }
        return { from: from, to: to };
    }
    
    function collectFilters() {
        return {
            type: getCurrentType(),
            genres: getSelectedGenres(),
            language: getSelectedLanguage(),
            yearFrom: getYearRange().from,
            yearTo: getYearRange().to
        };
    }
    
    // ==================== ПОСТРОЕНИЕ URL ====================
    function buildUrl(filter) {
        var base = filter.type === 'movie' ? 'discover/movie' : 'discover/tv';
        var params = [];
        
        if (filter.genres && filter.genres.length) {
            params.push('with_genres=' + filter.genres.join(','));
        }
        if (filter.language) {
            params.push('with_original_language=' + filter.language);
        }
        if (filter.yearFrom) {
            var date = filter.yearFrom + '-01-01';
            params.push(filter.type === 'movie' ? 'primary_release_date.gte=' + date : 'first_air_date.gte=' + date);
        }
        if (filter.yearTo) {
            var date = filter.yearTo + '-12-31';
            params.push(filter.type === 'movie' ? 'primary_release_date.lte=' + date : 'first_air_date.lte=' + date);
        }
        params.push('sort_by=popularity.desc', 'language=ru-RU');
        
        return base + (params.length ? '?' + params.join('&') : '');
    }
    
    // ==================== ДОБАВЛЕНИЕ В МЕНЮ ====================
    function renderMenu() {
        // Удаляем старые пункты
        $('.menu__item[data-saved-filter]').remove();
        
        var filters = getFilters();
        var menuList = $('.menu .menu__list').eq(0);
        
        if (menuList.length === 0) {
            console.log('[SavedFilters] Меню не найдено');
            return;
        }
        
        // Добавляем раздел, если есть фильтры
        if (filters.length > 0) {
            // Проверяем, есть ли уже разделитель
            if (menuList.find('.menu__divider--filters').length === 0) {
                menuList.append('<li class="menu__divider menu__divider--filters"><div class="menu__text">━━━ Сохраненные фильтры ━━━</div></li>');
            }
        }
        
        for (var i = 0; i < filters.length; i++) {
            var f = filters[i];
            var item = $(
                '<li class="menu__item selector" data-saved-filter="' + f.id + '">' +
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg></div>' +
                    '<div class="menu__text">' + f.name + '</div>' +
                '</li>'
            );
            
            item.on('hover:enter', (function(filter) {
                return function() {
                    var url = buildUrl(filter);
                    Lampa.Activity.push({
                        url: url,
                        title: filter.name,
                        component: 'category_full',
                        source: 'tmdb',
                        page: 1
                    });
                };
            })(f));
            
            // Добавляем контекстное меню для удаления (удержание)
            item.on('contextmenu', (function(id, name) {
                return function(e) {
                    e.stopPropagation();
                    Lampa.Select.show({
                        title: 'Удалить "' + name + '"?',
                        items: [
                            { title: 'Да, удалить', value: 'delete' },
                            { title: 'Отмена', value: 'cancel' }
                        ],
                        onSelect: function(choice) {
                            if (choice.value === 'delete') {
                                removeFilter(id);
                                renderMenu();
                                Lampa.Noty.show('Фильтр удален');
                            }
                        }
                    });
                    return false;
                };
            })(f.id, f.name));
            
            menuList.append(item);
        }
    }
    
    // ==================== КНОПКА СОХРАНЕНИЯ ====================
    function addSaveButton() {
        var act = Lampa.Activity.active();
        if (!act) return;
        
        var component = act.component || '';
        if (component.indexOf('category') === -1) return;
        
        var render = act.render();
        if (!render) return;
        
        // Не добавляем повторно
        if (render.find('.saved-filter-btn').length) return;
        
        var btn = $(
            '<div class="full-start__button saved-filter-btn selector" style="margin-left: 10px;">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">' +
                    '<path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>' +
                '</svg>' +
                '<span>Сохранить фильтр</span>' +
            '</div>'
        );
        
        btn.on('hover:enter', function() {
            var filters = collectFilters();
            
            Lampa.Input.show({
                title: 'Название фильтра',
                text: '',
                placeholder: 'Например: Боевики 2020-2025',
                onEnter: function(name) {
                    if (!name || name.trim() === '') {
                        Lampa.Noty.show('Введите название');
                        return;
                    }
                    addFilter(name.trim(), filters);
                    renderMenu();
                    Lampa.Noty.show('Фильтр "' + name + '" сохранен');
                }
            });
        });
        
        // Ищем место для кнопки
        var target = render.find('.full-start-new__buttons, .category__actions');
        if (target.length) {
            target.append(btn);
        } else {
            render.find('.category__header').append(btn);
        }
    }
    
    // ==================== НАСТРОЙКИ ====================
    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'saved_filters',
            name: 'Сохраненные фильтры'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'saved_filters',
            param: { name: 'clear_filters', type: 'trigger', default: false },
            field: { name: 'Очистить все фильтры', description: 'Удалить все сохраненные фильтры' },
            onChange: function(val) {
                if (val) {
                    Lampa.Select.show({
                        title: 'Удалить все фильтры?',
                        items: [
                            { title: 'Да, удалить все', value: 'yes' },
                            { title: 'Отмена', value: 'no' }
                        ],
                        onSelect: function(choice) {
                            if (choice.value === 'yes') {
                                saveFilters([]);
                                renderMenu();
                                Lampa.Noty.show('Все фильтры удалены');
                            }
                            Lampa.Settings.set('clear_filters', false);
                        }
                    });
                }
            }
        });
    }
    
    // ==================== ЗАПУСК ====================
    function init() {
        if (window.saved_filters_ready) return;
        window.saved_filters_ready = true;
        
        console.log('[SavedFilters] Инициализация...');
        
        renderMenu();
        addSettings();
        
        // Добавляем кнопку при открытии экрана
        Lampa.Listener.follow('activity', function(e) {
            if (e.type === 'open') {
                setTimeout(addSaveButton, 500);
            }
        });
        
        // Также пробуем добавить сразу
        setTimeout(addSaveButton, 1000);
        
        console.log('[SavedFilters] Готово, фильтров:', getFilters().length);
    }
    
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') init();
        });
    }
})();
