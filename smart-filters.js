(function () {
    'use strict';

    // ==================== СОПОСТАВЛЕНИЯ ====================
    // Жанры (русское название -> ID TMDB)
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

    // Обратный маппинг (ID -> русское название)
    var GENRES_REVERSE = {};
    for (var g in GENRES_MAP) {
        GENRES_REVERSE[GENRES_MAP[g]] = g;
    }

    // Языки (русское название -> код TMDB)
    var LANGUAGES_MAP = {
        "Русский": "ru",
        "Английский": "en",
        "Японский": "ja",
        "Китайский": "zh",
        "Корейский": "ko",
        "Французский": "fr",
        "Немецкий": "de",
        "Испанский": "es",
        "Итальянский": "it",
        "Португальский": "pt",
        "Турецкий": "tr",
        "Польский": "pl",
        "Украинский": "uk",
        "Белорусский": "be"
        // Добавь остальные языки по необходимости
    };

    // Обратный маппинг (код -> русское название)
    var LANGUAGES_REVERSE = {};
    for (var l in LANGUAGES_MAP) {
        LANGUAGES_REVERSE[LANGUAGES_MAP[l]] = l;
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    
    // Получение текущего типа контента (movie/tv)
    function getCurrentContentType() {
        var activity = Lampa.Activity.active();
        if (!activity) return "movie";
        
        var url = activity.url || "";
        var component = activity.component || "";
        
        if (url.indexOf("discover/tv") !== -1 || component === "serial") {
            return "tv";
        }
        return "movie";
    }

    // Получение текущих выбранных жанров из DOM фильтра
    function getSelectedGenres() {
        var selected = [];
        
        // Ищем активные чекбоксы в блоке жанров
        $('.selectbox-item.selector.selectbox-item--checkbox .selectbox-item__checkbox.checked').each(function() {
            var parent = $(this).closest('.selectbox-item');
            var genreName = parent.find('.selectbox-item__title').text().trim();
            
            if (GENRES_MAP[genreName]) {
                selected.push(GENRES_MAP[genreName]);
            }
        });
        
        return selected;
    }

    // Получение текущего выбранного языка
    function getSelectedLanguage() {
        var selectedLang = null;
        
        $('.selectbox-item.selector.selectbox-item--checkbox .selectbox-item__checkbox.checked').each(function() {
            var parent = $(this).closest('.selectbox-item');
            var langName = parent.find('.selectbox-item__title').text().trim();
            
            if (LANGUAGES_MAP[langName]) {
                selectedLang = LANGUAGES_MAP[langName];
            }
        });
        
        return selectedLang;
    }

    // Получение диапазона годов
    function getYearRange() {
        var yearFrom = 1932;
        var yearTo = new Date().getFullYear();
        
        // Ищем поля ввода годов в фильтре
        var yearInputs = $('.input-group input[type="text"]');
        if (yearInputs.length >= 2) {
            var fromVal = parseInt($(yearInputs[0]).val());
            var toVal = parseInt($(yearInputs[1]).val());
            
            if (!isNaN(fromVal)) yearFrom = fromVal;
            if (!isNaN(toVal)) yearTo = toVal;
        }
        
        return { from: yearFrom, to: yearTo };
    }

    // Получение текущих параметров фильтрации
    function getCurrentFilterParams() {
        return {
            type: getCurrentContentType(),
            genres: getSelectedGenres(),
            language: getSelectedLanguage(),
            yearFrom: getYearRange().from,
            yearTo: getYearRange().to
        };
    }

    // Сохранение фильтра
    function saveFilter(name, params) {
        var filters = Lampa.Storage.get('my_custom_filters', []);
        
        var newFilter = {
            id: Date.now().toString(),
            name: name,
            type: params.type,
            genres: params.genres,
            language: params.language,
            yearFrom: params.yearFrom,
            yearTo: params.yearTo,
            source: "tmdb",
            created: new Date().toISOString()
        };
        
        filters.push(newFilter);
        Lampa.Storage.set('my_custom_filters', filters);
        
        // Обновляем меню
        rebuildFiltersMenu();
        
        return newFilter;
    }

    // Удаление фильтра
    function deleteFilter(filterId) {
        var filters = Lampa.Storage.get('my_custom_filters', []);
        filters = filters.filter(function(f) { return f.id !== filterId; });
        Lampa.Storage.set('my_custom_filters', filters);
        rebuildFiltersMenu();
    }

    // Построение URL для TMDB запроса на основе фильтра
    function buildFilterUrl(filter) {
        var baseUrl = filter.type === "movie" ? "discover/movie" : "discover/tv";
        var params = [];
        
        // Жанры
        if (filter.genres && filter.genres.length > 0) {
            params.push("with_genres=" + filter.genres.join(","));
        }
        
        // Язык оригинала
        if (filter.language) {
            params.push("with_original_language=" + filter.language);
        }
        
        // Годы
        if (filter.yearFrom) {
            var dateField = filter.type === "movie" ? "primary_release_date.gte" : "first_air_date.gte";
            params.push(dateField + "=" + filter.yearFrom + "-01-01");
        }
        if (filter.yearTo) {
            var dateFieldTo = filter.type === "movie" ? "primary_release_date.lte" : "first_air_date.lte";
            params.push(dateFieldTo + "=" + filter.yearTo + "-12-31");
        }
        
        params.push("language=ru-RU");
        params.push("sort_by=popularity.desc");
        
        var url = baseUrl + "?" + params.join("&");
        return url;
    }

    // Открытие фильтра
    function openFilter(filter) {
        var url = buildFilterUrl(filter);
        var title = filter.name;
        
        Lampa.Activity.push({
            url: url,
            title: title,
            component: "category",
            source: "tmdb",
            page: 1
        });
        
        // Если есть фильтр по качеству — применяем клиентскую фильтрацию
        if (filter.quality) {
            setTimeout(function() {
                applyQualityFilter(filter.quality);
            }, 2000);
        }
    }

    // Клиентская фильтрация по качеству
    function applyQualityFilter(quality) {
        var qualityUpper = quality.toUpperCase();
        
        $('.card').each(function() {
            var card = $(this);
            var qualityLabel = card.find('.card__quality, .card__type-online').text().toUpperCase();
            
            if (qualityUpper === '4K') {
                if (qualityLabel.indexOf('4K') === -1 && qualityLabel.indexOf('2160') === -1) {
                    card.hide();
                } else {
                    card.show();
                }
            } else if (qualityUpper === 'FULLHD' || qualityUpper === '1080P') {
                if (qualityLabel.indexOf('FULLHD') === -1 && qualityLabel.indexOf('1080') === -1) {
                    card.hide();
                } else {
                    card.show();
                }
            }
        });
    }

    // Перестроение меню фильтров
    function rebuildFiltersMenu() {
        // Удаляем старый раздел
        $('.menu__item[data-action="my_filters_section"]').remove();
        
        var filters = Lampa.Storage.get('my_custom_filters', []);
        if (filters.length === 0) return;
        
        // Создаем раздел "Мои фильтры"
        var sectionHtml = `
            <li class="menu__item selector" data-action="my_filters_section">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 6H20V8H4V6ZM6 11H18V13H6V11ZM10 16H14V18H10V16Z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="menu__text">Мои фильтры</div>
            </li>
        `;
        
        var section = $(sectionHtml);
        
        // Добавляем подменю
        var submenu = $('<div class="menu__submenu"></div>');
        
        filters.forEach(function(filter) {
            var filterItem = $(`
                <div class="menu__item selector submenu-item" data-filter-id="${filter.id}">
                    <div class="menu__ico">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10 4H4C2.9 4 2 4.9 2 6V10C2 11.1 2.9 12 4 12H10C11.1 12 12 11.1 12 10V6C12 4.9 11.1 4 10 4ZM10 14H4C2.9 14 2 14.9 2 16V20C2 21.1 2.9 22 4 22H10C11.1 22 12 21.1 12 20V16C12 14.9 11.1 14 10 14ZM20 4H14C12.9 4 12 4.9 12 6V10C12 11.1 12.9 12 14 12H20C21.1 12 22 11.1 22 10V6C22 4.9 21.1 4 20 4ZM20 14H14C12.9 14 12 14.9 12 16V20C12 21.1 12.9 22 14 22H20C21.1 22 22 21.1 22 20V16C22 14.9 21.1 14 20 14Z" fill="currentColor"/>
                        </svg>
                    </div>
                    <div class="menu__text">${filter.name}</div>
                    <div class="menu__delete" data-delete-id="${filter.id}">✕</div>
                </div>
            `);
            
            // Открытие фильтра
            filterItem.on('hover:enter', function(e) {
                // Если кликнули на кнопку удаления — не открываем фильтр
                if ($(e.target).hasClass('menu__delete')) return;
                openFilter(filter);
            });
            
            // Удаление фильтра
            filterItem.find('.menu__delete').on('hover:enter', function(e) {
                e.stopPropagation();
                Lampa.Select.show({
                    title: "Удалить фильтр?",
                    items: [
                        { title: "Да", value: "yes" },
                        { title: "Нет", value: "no" }
                    ],
                    onSelect: function(item) {
                        if (item.value === "yes") {
                            deleteFilter(filter.id);
                            Lampa.Noty.show('Фильтр "' + filter.name + '" удален');
                        }
                    }
                });
            });
            
            submenu.append(filterItem);
        });
        
        section.append(submenu);
        
        // Добавляем в левое меню (после стандартных пунктов)
        var menuList = $(".menu .menu__list").eq(1);
        if (menuList.length === 0) {
            menuList = $(".menu .menu__list").eq(0);
        }
        menuList.append(section);
    }

    // Добавление кнопки "Сохранить фильтр" на экран категории
    function addSaveFilterButton() {
        // Проверяем, не добавлена ли уже кнопка
        if ($('.full-start__button[data-action="save_filter"]').length > 0) return;
        
        var buttonHtml = `
            <div class="full-start__button selector" data-action="save_filter">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" fill="currentColor"/>
                </svg>
                <span>Сохранить фильтр</span>
            </div>
        `;
        
        var button = $(buttonHtml);
        
        button.on('hover:enter', function() {
            var params = getCurrentFilterParams();
            
            // Формируем описание фильтра для отображения
            var genreNames = params.genres.map(function(id) {
                return GENRES_REVERSE[id] || id;
            }).join(", ");
            
            var langName = LANGUAGES_REVERSE[params.language] || params.language || "Любой";
            
            var description = "Тип: " + (params.type === "movie" ? "Фильмы" : "Сериалы") + "\n";
            if (genreNames) description += "Жанры: " + genreNames + "\n";
            description += "Язык: " + langName + "\n";
            description += "Годы: " + params.yearFrom + " - " + params.yearTo;
            
            Lampa.Input.show({
                title: "Название фильтра",
                placeholder: "Например: Боевики 2020-2025",
                onBack: function() {},
                onEnter: function(name) {
                    if (name && name.trim()) {
                        saveFilter(name.trim(), params);
                        Lampa.Noty.show('Фильтр "' + name + '" сохранен');
                    } else {
                        Lampa.Noty.show('Название не может быть пустым');
                    }
                }
            });
        });
        
        // Ждем загрузки экрана категории
        Lampa.Listener.follow('activity', function(e) {
            if (e.type === 'create' && (e.data.component === 'category' || e.data.component === 'category_full')) {
                setTimeout(function() {
                    var buttonsContainer = $('.full-start__buttons');
                    if (buttonsContainer.length && buttonsContainer.find('[data-action="save_filter"]').length === 0) {
                        buttonsContainer.append(button);
                    }
                }, 500);
            }
        });
    }

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    
    function initPlugin() {
        if (window.my_custom_filters_plugin) return;
        window.my_custom_filters_plugin = true;
        
        // Восстанавливаем меню из сохраненных фильтров
        rebuildFiltersMenu();
        
        // Добавляем кнопку сохранения
        addSaveFilterButton();
        
        // Слушаем прокрутку для фильтрации по качеству
        $(window).on('scroll', function() {
            var activeFilter = Lampa.Storage.get('current_quality_filter', null);
            if (activeFilter) {
                applyQualityFilter(activeFilter);
            }
        });
        
        console.log('Плагин "Мои фильтры" загружен');
    }
    
    // Запуск плагина
    if (window.appready) {
        initPlugin();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') initPlugin();
        });
    }
})();
