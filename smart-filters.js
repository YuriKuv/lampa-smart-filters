(function () {
    'use strict';

    // ==================== СПРАВОЧНИКИ ====================
    
    var GENRES_MAP = {
        "Боевик": 28, "Приключения": 12, "Мультфильм": 16, "Комедия": 35,
        "Криминал": 80, "Документальный": 99, "Драма": 18, "Семейный": 10751,
        "Фэнтези": 14, "История": 36, "Ужасы": 27, "Музыка": 10402,
        "Детектив": 9648, "Мелодрама": 10749, "Научная фантастика": 878,
        "Телевизионный фильм": 10770, "Триллер": 53, "Военный": 10752, "Вестерн": 37
    };
    
    var GENRES_REVERSE = {};
    for (var g in GENRES_MAP) { GENRES_REVERSE[GENRES_MAP[g]] = g; }
    
    var LANGUAGES_MAP = {
        "Русский": "ru", "Украинский": "uk", "Белорусский": "be", "Английский": "en",
        "Японский": "ja", "Китайский": "zh", "Корейский": "ko", "Французский": "fr",
        "Немецкий": "de", "Испанский": "es", "Итальянский": "it", "Португальский": "pt",
        "Греческий": "el", "Польский": "pl", "Чешский": "cs", "Словацкий": "sk",
        "Венгерский": "hu", "Румынский": "ro", "Болгарский": "bg", "Сербский": "sr",
        "Хорватский": "hr", "Словенский": "sl", "Эстонский": "et", "Латышский": "lv",
        "Литовский": "lt", "Финский": "fi", "Шведский": "sv", "Норвежский": "no",
        "Датский": "da", "Исландский": "is", "Нидерландский": "nl", "Турецкий": "tr",
        "Арабский": "ar", "Иврит": "he", "Персидский": "fa", "Хинди": "hi",
        "Тайский": "th", "Вьетнамский": "vi", "Индонезийский": "id"
    };
    
    var LANGUAGES_REVERSE = {};
    for (var l in LANGUAGES_MAP) { LANGUAGES_REVERSE[LANGUAGES_MAP[l]] = l; }
    
    // Ключ для хранения в Lampa.Storage
    var STORAGE_KEY = 'saved_filters_list';
    
    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    
    // Получить список сохраненных фильтров
    function getSavedFilters() {
        return Lampa.Storage.get(STORAGE_KEY, []);
    }
    
    // Сохранить список фильтров
    function setSavedFilters(filters) {
        Lampa.Storage.set(STORAGE_KEY, filters);
    }
    
    // Добавить новый фильтр
    function addSavedFilter(name, filterData) {
        var filters = getSavedFilters();
        filters.push({
            id: 'filter_' + Date.now(),
            name: name,
            type: filterData.type,
            genres: filterData.genres,
            language: filterData.language,
            yearFrom: filterData.yearFrom,
            yearTo: filterData.yearTo,
            quality: filterData.quality || null
        });
        setSavedFilters(filters);
        return filters;
    }
    
    // Удалить фильтр по ID
    function removeSavedFilter(filterId) {
        var filters = getSavedFilters();
        var newFilters = [];
        for (var i = 0; i < filters.length; i++) {
            if (filters[i].id !== filterId) newFilters.push(filters[i]);
        }
        setSavedFilters(newFilters);
        return newFilters;
    }
    
    // ==================== СБОР ТЕКУЩИХ ФИЛЬТРОВ ====================
    
    // Определение типа контента (фильмы/сериалы) из URL или компонента
    function getCurrentContentType() {
        var activity = Lampa.Activity.active();
        if (!activity) return 'movie';
        
        var url = activity.url || '';
        var component = activity.component || '';
        var source = activity.source || '';
        
        // Проверяем URL и компонент
        if (url.indexOf('/tv') !== -1 || component.indexOf('tv') !== -1 || source === 'tmdb_tv') {
            return 'tv';
        }
        if (url.indexOf('/movie') !== -1 || component.indexOf('movie') !== -1) {
            return 'movie';
        }
        
        // По умолчанию - фильмы
        return 'movie';
    }
    
    // Сбор выбранных жанров из фильтра
    function getSelectedGenres() {
        var selected = [];
        
        // Ищем активные чекбоксы в блоке жанров
        $('.selectbox-item--checkbox').each(function() {
            var $item = $(this);
            var $checkbox = $item.find('.selectbox-item__checkbox');
            var title = $item.find('.selectbox-item__title').text().trim();
            
            // Проверяем, активен ли чекбокс (есть класс active или checkbox имеет состояние checked)
            var isActive = $checkbox.hasClass('active') || $checkbox.hasClass('checked');
            if (isActive && GENRES_MAP[title]) {
                selected.push(GENRES_MAP[title]);
            }
        });
        
        return selected;
    }
    
    // Сбор выбранного языка
    function getSelectedLanguage() {
        // Сначала ищем активный чекбокс в блоке языков
        var languageBlocks = $('.selectbox:contains("Язык оригинала"), .selectbox:contains("Язык")');
        if (languageBlocks.length) {
            var activeLang = languageBlocks.find('.selectbox-item--checkbox .selectbox-item__checkbox.active, .selectbox-item--checkbox .selectbox-item__checkbox.checked');
            if (activeLang.length) {
                var langTitle = activeLang.closest('.selectbox-item--checkbox').find('.selectbox-item__title').text().trim();
                if (LANGUAGES_MAP[langTitle]) {
                    return LANGUAGES_MAP[langTitle];
                }
            }
        }
        
        return null;
    }
    
    // Сбор диапазона годов
    function getSelectedYearRange() {
        var yearFrom = null;
        var yearTo = null;
        var currentYear = new Date().getFullYear();
        
        // Ищем поля ввода годов в фильтре
        var yearInputs = $('input[type="number"], input[placeholder*="год"], input[placeholder*="Год"]');
        if (yearInputs.length >= 2) {
            var fromVal = parseInt($(yearInputs[0]).val());
            var toVal = parseInt($(yearInputs[1]).val());
            if (!isNaN(fromVal)) yearFrom = fromVal;
            if (!isNaN(toVal)) yearTo = toVal;
        }
        
        // Если не нашли через инпуты, ищем через текст "Годы"
        var yearText = $('.selectbox:contains("Год"), .selectbox:contains("Годы")').text();
        if (yearText) {
            var match = yearText.match(/(\d{4})\s*[-–]\s*(\d{4})/);
            if (match) {
                yearFrom = parseInt(match[1]);
                yearTo = parseInt(match[2]);
            } else {
                match = yearText.match(/c\s*(\d{4})/);
                if (match) yearFrom = parseInt(match[1]);
                match = yearText.match(/по\s*(\d{4})/);
                if (match) yearTo = parseInt(match[1]);
            }
        }
        
        return { from: yearFrom, to: yearTo };
    }
    
    // Главная функция сбора текущих фильтров
    function collectCurrentFilters() {
        var type = getCurrentContentType();
        var genres = getSelectedGenres();
        var language = getSelectedLanguage();
        var yearRange = getSelectedYearRange();
        
        return {
            type: type,
            genres: genres,
            language: language,
            yearFrom: yearRange.from,
            yearTo: yearRange.to,
            quality: null
        };
    }
    
    // ==================== ПОСТРОЕНИЕ URL ДЛЯ ЗАПРОСА ====================
    
    // Построение URL для TMDB API на основе сохраненного фильтра
    function buildFilterUrl(filter) {
        var baseUrl = filter.type === 'movie' ? 'discover/movie' : 'discover/tv';
        var params = [];
        
        // Жанры
        if (filter.genres && filter.genres.length > 0) {
            params.push('with_genres=' + filter.genres.join(','));
        }
        
        // Язык оригинала
        if (filter.language) {
            params.push('with_original_language=' + filter.language);
        }
        
        // Годы
        if (filter.yearFrom) {
            var fromDate = filter.yearFrom + '-01-01';
            if (filter.type === 'movie') {
                params.push('primary_release_date.gte=' + fromDate);
            } else {
                params.push('first_air_date.gte=' + fromDate);
            }
        }
        if (filter.yearTo) {
            var toDate = filter.yearTo + '-12-31';
            if (filter.type === 'movie') {
                params.push('primary_release_date.lte=' + toDate);
            } else {
                params.push('first_air_date.lte=' + toDate);
            }
        }
        
        // Сортировка по популярности
        params.push('sort_by=popularity.desc');
        params.push('language=ru-RU');
        
        var url = baseUrl;
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        return url;
    }
    
    // ==================== ДОБАВЛЕНИЕ ПУНКТОВ В ЛЕВОЕ МЕНЮ ====================
    
    // Создание иконки для пункта меню
    function getFilterIcon() {
        return '<svg height="30" viewBox="0 0 24 24" width="30" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>';
    }
    
    // Добавить один сохраненный фильтр в меню
    function addFilterToMenu(filter) {
        var menuItem = $(
            '<li class="menu__item selector" data-filter-id="' + filter.id + '">' +
                '<div class="menu__ico">' + getFilterIcon() + '</div>' +
                '<div class="menu__text">' + Lampa.Lang.translate(filter.name) + '</div>' +
            '</li>'
        );
        
        menuItem.on('hover:enter', function() {
            var url = buildFilterUrl(filter);
            var title = filter.name;
            
            Lampa.Activity.push({
                url: url,
                title: title,
                component: 'category_full',
                source: 'tmdb',
                page: 1,
                filter: filter
            });
        });
        
        // Добавляем в конец первого списка меню
        $('.menu .menu__list').eq(0).append(menuItem);
    }
    
    // Обновить все пункты меню из сохраненных фильтров
    function refreshMenuFilters() {
        // Удаляем старые пункты
        $('.menu .menu__item[data-filter-id]').remove();
        
        // Добавляем новые
        var filters = getSavedFilters();
        for (var i = 0; i < filters.length; i++) {
            addFilterToMenu(filters[i]);
        }
    }
    
    // ==================== ДОБАВЛЕНИЕ КНОПКИ СОХРАНЕНИЯ ====================
    
    // Добавить кнопку "Сохранить фильтр" на экран категории
    function addSaveFilterButton() {
        var activeActivity = Lampa.Activity.active();
        if (!activeActivity) return;
        
        var render = activeActivity.render();
        if (!render || render.find('.button--save-filter').length > 0) return;
        
        // Проверяем, что мы на экране категории
        var component = activeActivity.component || '';
        if (component.indexOf('category') === -1) return;
        
        // Создаем кнопку
        var saveButton = $(
            '<div class="full-start__button button--save-filter selector" style="margin-left: 10px;">' +
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">' +
                    '<path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>' +
                '</svg>' +
                '<span>Сохранить фильтр</span>' +
            '</div>'
        );
        
        saveButton.on('hover:enter', function() {
            var filters = collectCurrentFilters();
            
            // Запрашиваем название фильтра
            Lampa.Input.show({
                title: 'Название фильтра',
                text: '',
                placeholder: 'Например: Боевики 2020-2025',
                onEnter: function(name) {
                    if (!name || name.trim() === '') {
                        Lampa.Noty.show('Название не может быть пустым');
                        return;
                    }
                    
                    addSavedFilter(name.trim(), filters);
                    refreshMenuFilters();
                    Lampa.Noty.show('Фильтр "' + name + '" сохранен в левом меню');
                },
                onBack: function() {
                    Lampa.Noty.show('Сохранение отменено');
                }
            });
        });
        
        // Ищем место для кнопки (рядом с кнопками фильтров)
        var buttonsContainer = render.find('.full-start-new__buttons, .category__actions, .items-line__head');
        if (buttonsContainer.length) {
            buttonsContainer.append(saveButton);
        } else {
            // Альтернативное место
            render.find('.category__header, .full-start-new__head').after(saveButton);
        }
    }
    
    // ==================== МЕНЮ УПРАВЛЕНИЯ ФИЛЬТРАМИ ====================
    
    // Показать меню управления фильтрами (удаление/редактирование)
    function showFiltersManagementMenu() {
        var filters = getSavedFilters();
        if (filters.length === 0) {
            Lampa.Noty.show('Нет сохраненных фильтров');
            return;
        }
        
        var items = [];
        for (var i = 0; i < filters.length; i++) {
            items.push({
                title: filters[i].name,
                value: filters[i].id
            });
        }
        items.push({ title: '──────────', value: null, disabled: true });
        items.push({ title: 'Отмена', value: null });
        
        Lampa.Select.show({
            title: 'Управление фильтрами (выберите для удаления)',
            items: items,
            onSelect: function(item) {
                if (item.value && item.value !== null) {
                    Lampa.Select.show({
                        title: 'Удалить "' + item.title + '"?',
                        items: [
                            { title: 'Да, удалить', value: 'delete' },
                            { title: 'Нет, отмена', value: 'cancel' }
                        ],
                        onSelect: function(confirm) {
                            if (confirm.value === 'delete') {
                                removeSavedFilter(item.value);
                                refreshMenuFilters();
                                Lampa.Noty.show('Фильтр удален');
                            }
                        }
                    });
                }
            }
        });
    }
    
    // ==================== ДОБАВЛЕНИЕ НАСТРОЕК ====================
    
    function addPluginSettings() {
        // Добавляем раздел в настройки
        Lampa.SettingsApi.addComponent({
            component: 'saved_filters',
            name: 'Сохраненные фильтры'
        });
        
        // Добавляем кнопку управления
        Lampa.SettingsApi.addParam({
            component: 'saved_filters',
            param: {
                name: 'manage_filters',
                type: 'trigger',
                default: false
            },
            field: {
                name: 'Управление фильтрами',
                description: 'Удалить или переименовать сохраненные фильтры'
            },
            onChange: function(value) {
                if (value) {
                    showFiltersManagementMenu();
                    // Сбрасываем триггер
                    setTimeout(function() {
                        Lampa.Settings.set('manage_filters', false);
                    }, 500);
                }
            }
        });
        
        // Количество сохраненных фильтров
        Lampa.SettingsApi.addParam({
            component: 'saved_filters',
            param: {
                name: 'filters_count',
                type: 'static',
                default: getSavedFilters().length + ' фильтров сохранено'
            },
            field: {
                name: 'Статус',
                description: ''
            }
        });
    }
    
    // Обновление статического параметра при изменении
    function updateSettingsCount() {
        var count = getSavedFilters().length;
        Lampa.Settings.set('filters_count', count + ' фильтров сохранено');
        Lampa.Settings.update('saved_filters');
    }
    
    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    
    // Переопределяем addSavedFilter, чтобы обновлять настройки
    var originalAdd = addSavedFilter;
    window.addSavedFilter = function(name, filterData) {
        var result = originalAdd(name, filterData);
        updateSettingsCount();
        return result;
    };
    
    // Переопределяем removeSavedFilter
    var originalRemove = removeSavedFilter;
    window.removeSavedFilter = function(filterId) {
        var result = originalRemove(filterId);
        updateSettingsCount();
        return result;
    };
    
    function initPlugin() {
        if (window.saved_filters_plugin_ready) return;
        window.saved_filters_plugin_ready = true;
        
        // Добавляем переводы
        Lampa.Lang.add({
            'Сохранить фильтр': { ru: 'Сохранить фильтр' }
        });
        
        // Загружаем настройки и обновляем меню
        refreshMenuFilters();
        
        // Добавляем настройки
        addPluginSettings();
        
        // Слушаем открытие экранов для добавления кнопки сохранения
        Lampa.Listener.follow('activity', function(e) {
            if (e.type === 'open') {
                setTimeout(function() {
                    addSaveFilterButton();
                }, 500);
            }
        });
        
        // При полной загрузке тоже пробуем добавить
        setTimeout(function() {
            addSaveFilterButton();
        }, 1000);
        
        console.log('[SavedFilters] Плагин инициализирован, сохраненных фильтров:', getSavedFilters().length);
    }
    
    // Запуск
    if (window.appready) {
        initPlugin();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') initPlugin();
        });
    }
    
})();
