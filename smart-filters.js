(function () {
    'use strict';
    
    // Справочники жанров и языков
    var GENRES = {
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
    
    var LANGUAGES = {
        "Русский": "ru",
        "Украинский": "uk",
        "Английский": "en",
        "Белорусский": "be",
        "Китайский": "zh",
        "Японский": "ja",
        "Корейский": "ko",
        // ... остальные языки из твоего списка
    };
    
    // Типы контента
    var CONTENT_TYPES = {
        "Фильмы": { url: "discover/movie", component: "category" },
        "Сериалы": { url: "discover/tv", component: "category" },
        "Мультфильмы": { url: "discover/movie?with_genres=16", component: "category" },
        "Мультсериалы": { url: "discover/tv?with_genres=16", component: "category" },
        "Аниме": { url: "discover/movie?with_genres=16&with_original_language=ja", component: "category" }
    };
    
    // Ключ для хранения в Lampa.Storage
    var STORAGE_KEY = 'my_saved_filters';
    
    // Основной объект плагина
    function SavedFiltersPlugin() {
        // Загрузка сохраненных фильтров
        this.loadFilters = function() {
            return Lampa.Storage.get(STORAGE_KEY, []);
        };
        
        // Сохранение фильтра
        this.saveFilter = function(filter) {
            var filters = this.loadFilters();
            filters.push(filter);
            Lampa.Storage.set(STORAGE_KEY, filters);
            this.updateMenu();
        };
        
        // Удаление фильтра
        this.removeFilter = function(id) {
            var filters = this.loadFilters();
            var newFilters = filters.filter(function(f) { return f.id !== id; });
            Lampa.Storage.set(STORAGE_KEY, newFilters);
            this.updateMenu();
        };
        
        // Сбор текущих фильтров с экрана
        this.getCurrentFilters = function() {
            // Здесь парсим DOM текущего экрана категории
            var filters = {
                id: Date.now(),
                name: "Новый фильтр",
                type: "Фильмы",
                genres: [],
                language: null,
                yearFrom: null,
                yearTo: null,
                quality: null
            };
            
            // Определяем тип контента по URL или компоненту
            var activity = Lampa.Activity.active();
            if (activity && activity.url) {
                if (activity.url.indexOf('discover/tv') !== -1) {
                    filters.type = "Сериалы";
                } else if (activity.url.indexOf('with_genres=16') !== -1) {
                    if (activity.url.indexOf('discover/tv') !== -1) {
                        filters.type = "Мультсериалы";
                    } else {
                        filters.type = "Мультфильмы";
                    }
                } else if (activity.url.indexOf('with_original_language=ja') !== -1) {
                    filters.type = "Аниме";
                } else {
                    filters.type = "Фильмы";
                }
            }
            
            // Собираем выбранные жанры из DOM
            $('.selectbox-item--checkbox.active').each(function() {
                var genreName = $(this).find('.selectbox-item__title').text();
                if (GENRES[genreName]) {
                    filters.genres.push(GENRES[genreName]);
                }
            });
            
            // Собираем выбранный язык
            var activeLang = $('.selectbox-item--checkbox.active .selectbox-item__title').filter(function() {
                return LANGUAGES[$(this).text()];
            }).first().text();
            if (activeLang && LANGUAGES[activeLang]) {
                filters.language = LANGUAGES[activeLang];
            }
            
            // Собираем диапазон годов
            var yearInput = $('.filter-year input').val();
            if (yearInput && yearInput.indexOf('-') !== -1) {
                var years = yearInput.split('-');
                filters.yearFrom = parseInt(years[0]);
                filters.yearTo = parseInt(years[1]);
            }
            
            return filters;
        };
        
        // Открытие категории с применением фильтра
        this.openFilter = function(filter) {
            var typeConfig = CONTENT_TYPES[filter.type] || CONTENT_TYPES["Фильмы"];
            var url = typeConfig.url;
            
            // Добавляем жанры
            if (filter.genres && filter.genres.length > 0) {
                url += (url.indexOf('?') === -1 ? '?' : '&') + 'with_genres=' + filter.genres.join(',');
            }
            
            // Добавляем язык
            if (filter.language) {
                url += (url.indexOf('?') === -1 ? '?' : '&') + 'with_original_language=' + filter.language;
            }
            
            // Добавляем год
            if (filter.yearFrom) {
                url += (url.indexOf('?') === -1 ? '?' : '&') + 'primary_release_date.gte=' + filter.yearFrom + '-01-01';
            }
            if (filter.yearTo) {
                url += (url.indexOf('?') === -1 ? '?' : '&') + 'primary_release_date.lte=' + filter.yearTo + '-12-31';
            }
            
            Lampa.Activity.push({
                url: url,
                title: filter.name,
                component: typeConfig.component,
                source: "tmdb",
                page: 1
            });
            
            // Если есть фильтр по качеству — применяем клиентскую фильтрацию
            if (filter.quality) {
                setTimeout(function() {
                    applyQualityFilter(filter.quality);
                }, 2000);
            }
        };
        
        // Обновление пунктов в левом меню
        this.updateMenu = function() {
            // Удаляем старые пункты нашего плагина
            $('.menu__item[data-action="saved_filter"]').remove();
            
            var filters = this.loadFilters();
            var menuList = $(".menu .menu__list").eq(0);
            
            filters.forEach(function(filter) {
                var menuItem = $('<li class="menu__item selector" data-action="saved_filter" data-id="' + filter.id + '">' +
                    '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4H20V20H4V4Z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 8H16V10H8V8Z" fill="currentColor"/><path d="M8 12H14V14H8V12Z" fill="currentColor"/></svg></div>' +
                    '<div class="menu__text">' + filter.name + '</div>' +
                    '<div class="menu__remove" style="margin-left: auto; margin-right: 10px;">✕</div>' +
                '</li>');
                
                menuItem.on('hover:enter', function() {
                    SavedFiltersPlugin.openFilter(filter);
                });
                
                menuItem.find('.menu__remove').on('hover:enter', function(e) {
                    e.stopPropagation();
                    Lampa.Select.show({
                        title: 'Удалить фильтр?',
                        items: [
                            { title: 'Да', value: 'yes' },
                            { title: 'Нет', value: 'no' }
                        ],
                        onSelect: function(item) {
                            if (item.value === 'yes') {
                                SavedFiltersPlugin.removeFilter(filter.id);
                            }
                        }
                    });
                });
                
                menuList.append(menuItem);
            });
        };
    }
    
    // Функция применения фильтра по качеству (клиентская)
    function applyQualityFilter(quality) {
        $('.card').each(function() {
            var card = $(this);
            var qualityLabel = card.find('.card__quality').text().toUpperCase();
            
            if (quality === '4K') {
                if (qualityLabel.indexOf('4K') === -1 && qualityLabel.indexOf('2160') === -1) {
                    card.hide();
                } else {
                    card.show();
                }
            } else if (quality === 'FULLHD') {
                if (qualityLabel.indexOf('FULLHD') === -1 && qualityLabel.indexOf('1080') === -1) {
                    card.hide();
                } else {
                    card.show();
                }
            } else {
                card.show();
            }
        });
    }
    
    // Добавление кнопки "Сохранить фильтр" на экран категории
    function addSaveButton() {
        // Ждем загрузки экрана категории
        Lampa.Listener.follow('activity', function(e) {
            if (e.type === 'create' && e.activity.component === 'category') {
                setTimeout(function() {
                    var toolbar = $('.category__toolbar');
                    if (toolbar.length && !toolbar.find('.save-filter-btn').length) {
                        var saveBtn = $('<div class="toolbar__button selector save-filter-btn">' +
                            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                            '<path d="M4 4H20V20H4V4Z" stroke="currentColor" stroke-width="2" fill="none"/>' +
                            '<path d="M8 8H16V10H8V8Z" fill="currentColor"/>' +
                            '<path d="M8 12H14V14H8V12Z" fill="currentColor"/>' +
                            '</svg>' +
                            '<span>Сохранить фильтр</span>' +
                            '</div>');
                        
                        saveBtn.on('hover:enter', function() {
                            var plugin = new SavedFiltersPlugin();
                            var currentFilters = plugin.getCurrentFilters();
                            
                            Lampa.Input.show({
                                title: 'Название фильтра',
                                default: currentFilters.name,
                                onInput: function(name) {
                                    if (name && name.trim()) {
                                        currentFilters.name = name.trim();
                                        plugin.saveFilter(currentFilters);
                                        Lampa.Noty.show('Фильтр "' + currentFilters.name + '" сохранен');
                                    }
                                }
                            });
                        });
                        
                        toolbar.append(saveBtn);
                    }
                }, 1000);
            }
        });
    }
    
    // Инициализация плагина
    function initPlugin() {
        if (window.saved_filters_plugin_ready) return;
        window.saved_filters_plugin_ready = true;
        
        var plugin = new SavedFiltersPlugin();
        
        // Восстанавливаем пункты меню при старте
        if (window.appready) {
            plugin.updateMenu();
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') {
                    plugin.updateMenu();
                }
            });
        }
        
        // Добавляем кнопку сохранения
        addSaveButton();
    }
    
    // Запуск
    initPlugin();
})();
