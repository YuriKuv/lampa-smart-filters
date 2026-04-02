(function () {
    'use strict';

    // ========== СПРАВОЧНИКИ ==========
    // Соответствие русских названий жанров ID TMDB
    var GENRES_MAP = {
        "Боевик": 28,
        "Приключения": 12,
        "Мультфильм": 16,
        "Комедия": 35,
        "Криминал": 80,
        "Документальный": 99,
        "Драма": 18,
        "Семейный": 10751,
        "Фэнтези": 14,
        "История": 36,
        "Ужасы": 27,
        "Музыка": 10402,
        "Детектив": 9648,
        "Мелодрама": 10749,
        "Фантастика": 878,
        "Телевизионный фильм": 10770,
        "Триллер": 53,
        "Военный": 10752,
        "Вестерн": 37
    };

    // Соответствие русских названий языков кодам
    var LANGUAGES_MAP = {
        "Русский": "ru",
        "Украинский": "uk",
        "Английский": "en",
        "Белорусский": "be",
        "Китайский": "zh",
        "Японский": "ja",
        "Корейский": "ko",
        "Французский": "fr",
        "Немецкий": "de",
        "Испанский": "es",
        "Итальянский": "it",
        "Португальский": "pt",
        "Польский": "pl",
        "Турецкий": "tr",
        "Хинди": "hi",
        "Арабский": "ar",
        "Иврит": "he",
        "Греческий": "el",
        "Чешский": "cs",
        "Шведский": "sv",
        "Датский": "da",
        "Финский": "fi",
        "Норвежский": "no",
        "Нидерландский": "nl",
        "Венгерский": "hu",
        "Румынский": "ro",
        "Болгарский": "bg",
        "Сербский": "sr",
        "Хорватский": "hr",
        "Словацкий": "sk",
        "Словенский": "sl",
        "Эстонский": "et",
        "Латышский": "lv",
        "Литовский": "lt",
        "Грузинский": "ka",
        "Армянский": "hy",
        "Азербайджанский": "az",
        "Казахский": "kk",
        "Узбекский": "uz",
        "Таджикский": "tg",
        "Туркменский": "tk",
        "Монгольский": "mn",
        "Вьетнамский": "vi",
        "Тайский": "th",
        "Индонезийский": "id",
        "Малайский": "ms",
        "Тамильский": "ta",
        "Телугу": "te",
        "Маратхи": "mr",
        "Панджаби": "pa",
        "Бенгальский": "bn",
        "Урду": "ur",
        "Персидский": "fa",
        "Албанский": "sq",
        "Македонский": "mk",
        "Боснийский": "bs",
        "Исландский": "is",
        "Ирландский": "ga",
        "Валлийский": "cy",
        "Мальтийский": "mt",
        "Кхмерский": "km",
        "Лаосский": "lo",
        "Бирманский": "my",
        "Сингальский": "si",
        "Непальский": "ne",
        "Кашмири": "ks",
        "Сомалийский": "so",
        "Суахили": "sw",
        "Самоанский": "sm",
        "Маори": "mi",
        "Гаитянский": "ht",
        "Курдский": "ku",
        "Пушту": "ps",
        "Идиш": "yi",
        "Фарерский": "fo",
        "Галисийский": "gl",
        "Баскский": "eu",
        "Каталанский": "ca",
        "Африкаанс": "af",
        "Гуджарати": "gu",
        "Каннада": "kn",
        "Малайялам": "ml",
        "Тагальский": "tl"
    };

    // Обратный справочник (код -> русское название)
    var LANGUAGES_REVERSE = {};
    for (var lang in LANGUAGES_MAP) {
        LANGUAGES_REVERSE[LANGUAGES_MAP[lang]] = lang;
    }

    // Типы контента
    var TYPES = {
        "Фильмы": { component: "category", url: "discover/movie", media_type: "movie" },
        "Сериалы": { component: "category", url: "discover/tv", media_type: "tv" },
        "Мультфильмы": { component: "category", url: "discover/movie", media_type: "movie", genre: 16 },
        "Мультсериалы": { component: "category", url: "discover/tv", media_type: "tv", genre: 16 },
        "Аниме": { component: "category", url: "discover/movie", media_type: "movie", genre: 16, country: "JP" }
    };

    // Ключ для хранения в Lampa.Storage
    var STORAGE_KEY = 'saved_filters';

    // ========== ФУНКЦИИ ФИЛЬТРАЦИИ ==========
    function hasGenre(item, targetGenres) {
        if (!targetGenres || targetGenres.length === 0) return true;
        var itemGenres = item.genre_ids || (item.genres ? item.genres.map(function(g) { return g.id; }) : []);
        if (itemGenres.length === 0) return false;
        return targetGenres.some(function(g) { return itemGenres.indexOf(g) !== -1; });
    }

    function hasLanguage(item, targetLang) {
        if (!targetLang) return true;
        var itemLang = item.original_language || '';
        return itemLang === targetLang;
    }

    function hasYear(item, yearFrom, yearTo) {
        if (!yearFrom && !yearTo) return true;
        var yearStr = item.release_date || item.first_air_date || '';
        var year = parseInt(yearStr.slice(0, 4));
        if (isNaN(year)) return false;
        if (yearFrom && year < yearFrom) return false;
        if (yearTo && year > yearTo) return false;
        return true;
    }

    function isAnime(item) {
        var hasAnimeGenre = hasGenre(item, [16]);
        var countryJP = item.origin_country && item.origin_country.indexOf('JP') !== -1;
        var langJA = item.original_language === 'ja';
        return hasAnimeGenre && (countryJP || langJA);
    }

    // Фильтрация по типу (фильмы/сериалы/мультфильмы/аниме)
    function filterByType(items, typeConfig) {
        if (!typeConfig) return items;
        return items.filter(function(item) {
            var itemType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
            
            // Проверка на аниме
            if (typeConfig.media_type === 'anime') {
                return isAnime(item);
            }
            
            // Проверка на мультфильмы/мультсериалы
            if (typeConfig.genre === 16) {
                var hasCartoonGenre = hasGenre(item, [16]);
                if (typeConfig.media_type === 'movie') {
                    return itemType === 'movie' && hasCartoonGenre && !isAnime(item);
                } else {
                    return itemType === 'tv' && hasCartoonGenre && !isAnime(item);
                }
            }
            
            // Обычные фильмы/сериалы
            return itemType === typeConfig.media_type;
        });
    }

    // Фильтрация по качеству (через DOM, клиентская)
    function filterByQualityDOM(quality) {
        if (!quality) return;
        $('.card').each(function() {
            var $card = $(this);
            var qualityText = $card.find('.card__quality div').text().toUpperCase();
            if (quality === '4K') {
                if (qualityText.indexOf('4K') === -1 && qualityText.indexOf('2160') === -1) {
                    $card.hide();
                } else {
                    $card.show();
                }
            } else if (quality === 'FULLHD') {
                if (qualityText.indexOf('FULLHD') === -1 && qualityText.indexOf('1080') === -1) {
                    $card.hide();
                } else {
                    $card.show();
                }
            } else if (quality === 'HD') {
                if (qualityText.indexOf('HD') === -1 || qualityText.indexOf('4K') !== -1) {
                    $card.hide();
                } else {
                    $card.show();
                }
            } else {
                $card.show();
            }
        });
    }

    // ========== СОХРАНЕНИЕ ФИЛЬТРА ==========
    function saveCurrentFilter() {
        var active = Lampa.Activity.active();
        var params = active.params || {};
        var component = active.component || '';
        
        // Определяем тип контента
        var type = null;
        if (component === 'category' || component === 'category_full') {
            if (params.source === 'tmdb') {
                var url = params.url || '';
                if (url.indexOf('discover/movie') !== -1) {
                    var hasGenre16 = params.genres === 16 || (params.with_genres && params.with_genres.indexOf('16') !== -1);
                    var isAnimeFilter = params.with_original_language === 'ja' || params.origin_country === 'JP';
                    
                    if (isAnimeFilter) {
                        type = TYPES["Аниме"];
                    } else if (hasGenre16) {
                        type = TYPES["Мультфильмы"];
                    } else {
                        type = TYPES["Фильмы"];
                    }
                } else if (url.indexOf('discover/tv') !== -1) {
                    var hasGenre16Tv = params.genres === 16 || (params.with_genres && params.with_genres.indexOf('16') !== -1);
                    if (hasGenre16Tv) {
                        type = TYPES["Мультсериалы"];
                    } else {
                        type = TYPES["Сериалы"];
                    }
                }
            }
        }
        
        if (!type) {
            Lampa.Noty.show('Не удалось определить тип контента');
            return;
        }
        
        // Собираем жанры из активных чекбоксов
        var genres = [];
        $('.selectbox-item--checkbox.active').each(function() {
            var title = $(this).find('.selectbox-item__title').text();
            if (GENRES_MAP[title]) {
                genres.push(GENRES_MAP[title]);
            }
        });
        
        // Собираем язык
        var language = null;
        $('.selectbox-item--checkbox.active').each(function() {
            var title = $(this).find('.selectbox-item__title').text();
            if (LANGUAGES_MAP[title]) {
                language = LANGUAGES_MAP[title];
            }
        });
        
        // Собираем год
        var yearFrom = null, yearTo = null;
        var yearInput = $('.selectbox__input input').val();
        if (yearInput && yearInput.indexOf('-') !== -1) {
            var years = yearInput.split('-');
            yearFrom = parseInt(years[0]);
            yearTo = parseInt(years[1]);
        } else if (yearInput) {
            yearFrom = parseInt(yearInput);
            yearTo = parseInt(yearInput);
        }
        
        // Собираем качество (если выбран фильтр)
        var quality = null;
        // TODO: добавить получение качества из интерфейса, если есть
        
        Lampa.Input.show({
            title: 'Название закладки',
            text: '',
            onInput: function(name) {
                if (!name) return;
                
                var savedFilters = Lampa.Storage.get(STORAGE_KEY, []);
                savedFilters.push({
                    id: Date.now(),
                    name: name,
                    type: type,
                    genres: genres,
                    language: language,
                    yearFrom: yearFrom,
                    yearTo: yearTo,
                    quality: quality
                });
                Lampa.Storage.set(STORAGE_KEY, savedFilters);
                
                updateMenu();
                Lampa.Noty.show('Фильтр "' + name + '" сохранен');
            }
        });
    }

    // ========== ОБНОВЛЕНИЕ МЕНЮ ==========
    function updateMenu() {
        // Удаляем старые пункты меню
        $('.menu__item[data-custom-filter="true"]').remove();
        
        var savedFilters = Lampa.Storage.get(STORAGE_KEY, []);
        
        savedFilters.forEach(function(filter) {
            var typeName = '';
            for (var t in TYPES) {
                if (TYPES[t] === filter.type) {
                    typeName = t;
                    break;
                }
            }
            
            var genresText = '';
            if (filter.genres && filter.genres.length) {
                var genreNames = [];
                for (var g in GENRES_MAP) {
                    if (filter.genres.indexOf(GENRES_MAP[g]) !== -1) {
                        genreNames.push(g);
                    }
                }
                genresText = genreNames.join(', ');
            }
            
            var langText = '';
            if (filter.language && LANGUAGES_REVERSE[filter.language]) {
                langText = LANGUAGES_REVERSE[filter.language];
            }
            
            var yearText = '';
            if (filter.yearFrom && filter.yearTo) {
                yearText = filter.yearFrom + '-' + filter.yearTo;
            } else if (filter.yearFrom) {
                yearText = filter.yearFrom + '+';
            }
            
            var qualityText = filter.quality || '';
            
            var menuItem = $('<li class="menu__item selector" data-custom-filter="true" data-filter-id="' + filter.id + '">' +
                '<div class="menu__ico">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">' +
                        '<path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>' +
                    '</svg>' +
                '</div>' +
                '<div class="menu__text">' + filter.name + '</div>' +
                '<div class="menu__delete" style="margin-left: auto; margin-right: 10px; opacity: 0.7;">✕</div>' +
            '</li>');
            
            // Обработчик нажатия на пункт меню
            menuItem.on('hover:enter', function(e) {
                // Если клик на крестик - удаляем
                if ($(e.target).hasClass('menu__delete')) {
                    e.stopPropagation();
                    var newFilters = Lampa.Storage.get(STORAGE_KEY, []).filter(function(f) {
                        return f.id !== filter.id;
                    });
                    Lampa.Storage.set(STORAGE_KEY, newFilters);
                    updateMenu();
                    Lampa.Noty.show('Фильтр "' + filter.name + '" удален');
                    return;
                }
                
                // Открываем категорию с фильтром
                var url = filter.type.url;
                var params = [];
                
                if (filter.genres && filter.genres.length) {
                    params.push('with_genres=' + filter.genres.join(','));
                }
                
                if (filter.language) {
                    params.push('with_original_language=' + filter.language);
                }
                
                if (filter.yearFrom && filter.yearTo) {
                    if (filter.type.media_type === 'movie') {
                        params.push('primary_release_date.gte=' + filter.yearFrom + '-01-01');
                        params.push('primary_release_date.lte=' + filter.yearTo + '-12-31');
                    } else {
                        params.push('first_air_date.gte=' + filter.yearFrom + '-01-01');
                        params.push('first_air_date.lte=' + filter.yearTo + '-12-31');
                    }
                } else if (filter.yearFrom) {
                    if (filter.type.media_type === 'movie') {
                        params.push('primary_release_date.gte=' + filter.yearFrom + '-01-01');
                    } else {
                        params.push('first_air_date.gte=' + filter.yearFrom + '-01-01');
                    }
                }
                
                if (filter.type.country) {
                    params.push('origin_country=' + filter.type.country);
                }
                
                var fullUrl = url;
                if (params.length) {
                    fullUrl += '?' + params.join('&');
                }
                
                Lampa.Activity.push({
                    url: fullUrl,
                    title: filter.name,
                    component: filter.type.component,
                    source: 'tmdb',
                    page: 1
                });
                
                // Если есть фильтр по качеству — применяем после загрузки
                if (filter.quality) {
                    setTimeout(function() {
                        filterByQualityDOM(filter.quality);
                    }, 2000);
                    
                    // При скролле тоже применяем
                    $(window).off('scroll.customFilter');
                    $(window).on('scroll.customFilter', function() {
                        filterByQualityDOM(filter.quality);
                    });
                }
            });
            
            $('.menu .menu__list').eq(0).append(menuItem);
        });
    }

    // ========== ДОБАВЛЕНИЕ КНОПКИ СОХРАНЕНИЯ ==========
    function addSaveButton() {
        // Ждем появления панели фильтров
        Lampa.Listener.follow('activity', function(e) {
            if (e.type === 'active') {
                var activity = e.object;
                if (activity.component === 'category' || activity.component === 'category_full') {
                    // Добавляем кнопку в панель фильтров
                    setTimeout(function() {
                        var filterBar = $('.category__filters, .selector-filters');
                        if (filterBar.length && !filterBar.find('.custom-save-filter').length) {
                            var saveBtn = $('<div class="selector-filters__item custom-save-filter" style="margin-left: auto;">' +
                                '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">' +
                                    '<path d="M17 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>' +
                                '</svg>' +
                                '<span>Сохранить фильтр</span>' +
                            '</div>');
                            
                            saveBtn.on('hover:enter', function() {
                                saveCurrentFilter();
                            });
                            
                            filterBar.append(saveBtn);
                        }
                    }, 500);
                }
            }
        });
    }

    // ========== НАСТРОЙКИ ПЛАГИНА ==========
    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'custom_filter',
            name: 'Мои фильтры'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'custom_filter',
            param: { name: 'saved_filters_clear', type: 'trigger', default: false },
            field: {
                name: 'Очистить все фильтры',
                description: 'Удалить все сохраненные закладки'
            },
            onChange: function(value) {
                if (value) {
                    Lampa.Storage.set(STORAGE_KEY, []);
                    updateMenu();
                    Lampa.Noty.show('Все фильтры удалены');
                }
            }
        });
    }

    // ========== ИНИЦИАЛИЗАЦИЯ ==========
    function initPlugin() {
        if (window.custom_filter_plugin) return;
        window.custom_filter_plugin = true;
        
        addSettings();
        addSaveButton();
        
        // Восстанавливаем меню при загрузке
        if (window.appready) {
            updateMenu();
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') updateMenu();
            });
        }
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
