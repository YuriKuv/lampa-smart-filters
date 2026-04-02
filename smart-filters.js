(function () {
    'use strict';
    
    // Ключ для хранения в Lampa.Storage
    var STORAGE_KEY = 'smart_filters_list';
    
    // Сопоставление языков (русское название → код TMDB)
    var LANGUAGES = {
        "Русский": "ru",
        "Украинский": "uk",
        "Английский": "en",
        "Белорусский": "be",
        "Китайский": "zh",
        "Японский": "ja",
        "Корейский": "ko",
        "Немецкий": "de",
        "Французский": "fr",
        "Испанский": "es",
        "Итальянский": "it",
        "Португальский": "pt",
        "Польский": "pl",
        "Турецкий": "tr",
        "Хинди": "hi",
        "Арабский": "ar"
        // Добавь остальные языки по необходимости
    };
    
    // Типы контента
    var CONTENT_TYPES = {
        "Фильмы": { url: "discover/movie", component: "category" },
        "Сериалы": { url: "discover/tv", component: "category" },
        "Мультфильмы": { url: "discover/movie", component: "category", extra: "with_genres=16" },
        "Мультсериалы": { url: "discover/tv", component: "category", extra: "with_genres=16" },
        "Аниме": { url: "discover/movie", component: "category", extra: "with_genres=16&with_original_language=ja" }
    };
    
    // Основной объект плагина
    var plugin = {
        // Загрузка сохраненных фильтров
        loadFilters: function() {
            return Lampa.Storage.get(STORAGE_KEY, []);
        },
        
        // Сохранение фильтра
        saveFilter: function(filter) {
            var filters = this.loadFilters();
            filters.push(filter);
            Lampa.Storage.set(STORAGE_KEY, filters);
            this.updateMenu();
            Lampa.Noty.show('Фильтр "' + filter.name + '" сохранен');
        },
        
        // Удаление фильтра
        removeFilter: function(id) {
            var filters = this.loadFilters();
            var newFilters = filters.filter(function(f) { return f.id != id; });
            Lampa.Storage.set(STORAGE_KEY, newFilters);
            this.updateMenu();
            Lampa.Noty.show('Фильтр удален');
        },
        
        // Сбор текущих фильтров с экрана
        getCurrentFilters: function() {
            var activity = Lampa.Activity.active();
            var filters = {
                id: Date.now(),
                name: "Мой фильтр",
                type: "Фильмы",
                genres: [],
                language: null,
                yearFrom: null,
                yearTo: null
            };
            
            // Определяем тип контента
            if (activity) {
                var url = activity.url || '';
                if (url.indexOf('discover/tv') !== -1) {
                    if (url.indexOf('with_genres=16') !== -1) {
                        filters.type = "Мультсериалы";
                    } else {
                        filters.type = "Сериалы";
                    }
                } else if (url.indexOf('discover/movie') !== -1) {
                    if (url.indexOf('with_genres=16') !== -1) {
                        if (url.indexOf('with_original_language=ja') !== -1) {
                            filters.type = "Аниме";
                        } else {
                            filters.type = "Мультфильмы";
                        }
                    } else {
                        filters.type = "Фильмы";
                    }
                }
                
                // Сохраняем жанры из URL
                var genreMatch = url.match(/with_genres=([0-9,]+)/);
                if (genreMatch && genreMatch[1]) {
                    filters.genres = genreMatch[1].split(',').map(Number);
                }
                
                // Сохраняем язык
                var langMatch = url.match(/with_original_language=([a-z]+)/);
                if (langMatch && langMatch[1]) {
                    filters.language = langMatch[1];
                }
                
                // Сохраняем год
                var yearMatch = url.match(/primary_release_date\.gte=([0-9]+)/);
                if (yearMatch && yearMatch[1]) {
                    filters.yearFrom = parseInt(yearMatch[1]);
                }
                var yearEndMatch = url.match(/primary_release_date\.lte=([0-9]+)/);
                if (yearEndMatch && yearEndMatch[1]) {
                    filters.yearTo = parseInt(yearEndMatch[1]);
                }
            }
            
            return filters;
        },
        
        // Открытие категории с применением фильтра
        openFilter: function(filter) {
            var typeConfig = CONTENT_TYPES[filter.type] || CONTENT_TYPES["Фильмы"];
            var url = typeConfig.url;
            
            // Добавляем параметры
            var params = [];
            
            if (typeConfig.extra) {
                params.push(typeConfig.extra);
            }
            
            // Добавляем жанры
            if (filter.genres && filter.genres.length > 0) {
                params.push('with_genres=' + filter.genres.join(','));
            }
            
            // Добавляем язык
            if (filter.language) {
                params.push('with_original_language=' + filter.language);
            }
            
            // Добавляем год
            if (filter.yearFrom) {
                params.push('primary_release_date.gte=' + filter.yearFrom + '-01-01');
            }
            if (filter.yearTo) {
                params.push('primary_release_date.lte=' + filter.yearTo + '-12-31');
            }
            
            if (params.length > 0) {
                url += '?' + params.join('&');
            }
            
            Lampa.Activity.push({
                url: url,
                title: filter.name,
                component: typeConfig.component,
                source: "tmdb",
                page: 1,
                card_type: true
            });
        },
        
        // Обновление пунктов в левом меню
        updateMenu: function() {
            // Удаляем старые пункты
            $('.menu__item[data-smart-filter]').remove();
            
            var filters = this.loadFilters();
            if (filters.length === 0) return;
            
            var menuList = $(".menu .menu__list").eq(0);
            var self = this;
            
            filters.forEach(function(filter) {
                var menuItem = $(
                    '<li class="menu__item selector" data-smart-filter="' + filter.id + '">' +
                        '<div class="menu__ico">' +
                            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                                '<path d="M4 4H20V20H4V4Z" stroke="currentColor" stroke-width="1.5" fill="none"/>' +
                                '<path d="M8 8H16V10H8V8Z" fill="currentColor"/>' +
                                '<path d="M8 12H14V14H8V12Z" fill="currentColor"/>' +
                                '<path d="M8 16H12V18H8V16Z" fill="currentColor"/>' +
                            '</svg>' +
                        '</div>' +
                        '<div class="menu__text" style="flex:1;">' + self.escapeHtml(filter.name) + '</div>' +
                        '<div class="menu__remove" style="width:30px;text-align:center;color:#ff5555;">✕</div>' +
                    '</li>'
                );
                
                // Открытие фильтра
                menuItem.on('hover:enter', function(e) {
                    if ($(e.target).hasClass('menu__remove')) return;
                    self.openFilter(filter);
                });
                
                // Удаление фильтра
                menuItem.find('.menu__remove').on('hover:enter', function(e) {
                    e.stopPropagation();
                    Lampa.Select.show({
                        title: 'Удалить фильтр "' + filter.name + '"?',
                        items: [
                            { title: 'Да', value: 'yes' },
                            { title: 'Нет', value: 'no' }
                        ],
                        onSelect: function(item) {
                            if (item.value === 'yes') {
                                self.removeFilter(filter.id);
                            }
                        }
                    });
                });
                
                menuList.append(menuItem);
            });
        },
        
        // Защита от XSS
        escapeHtml: function(str) {
            if (!str) return '';
            return str.replace(/[&<>]/g, function(m) {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return m;
            });
        },
        
        // Показать диалог сохранения фильтра
        showSaveDialog: function() {
            var currentFilters = this.getCurrentFilters();
            
            Lampa.Input.show({
                title: 'Название фильтра',
                default: currentFilters.name,
                onInput: function(name) {
                    if (name && name.trim()) {
                        currentFilters.name = name.trim();
                        plugin.saveFilter(currentFilters);
                    }
                }
            });
        }
    };
    
    // Добавление кнопки "Сохранить фильтр"
    function initSaveButton() {
        // Слушаем событие открытия экрана категории
        Lampa.Listener.follow('activity', function(e) {
            // Проверяем, что это экран категории и activity существует
            if (e.type === 'create' && e.activity && e.activity.component === 'category') {
                // Ждем отрисовки тулбара
                setTimeout(function() {
                    var toolbar = $('.category__toolbar');
                    if (toolbar.length && !toolbar.find('.smart-filter-save').length) {
                        var saveBtn = $(
                            '<div class="toolbar__button selector smart-filter-save">' +
                                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                                    '<path d="M4 4H20V20H4V4Z" stroke="currentColor" stroke-width="1.5" fill="none"/>' +
                                    '<path d="M8 8H16V10H8V8Z" fill="currentColor"/>' +
                                    '<path d="M8 12H14V14H8V12Z" fill="currentColor"/>' +
                                '</svg>' +
                                '<span>Сохранить фильтр</span>' +
                            '</div>'
                        );
                        saveBtn.on('hover:enter', function() {
                            plugin.showSaveDialog();
                        });
                        toolbar.append(saveBtn);
                    }
                }, 500);
            }
        });
    }
    
    // Инициализация плагина
    function initPlugin() {
        if (window.smart_filters_ready) return;
        window.smart_filters_ready = true;
        
        // Восстанавливаем пункты меню
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
        initSaveButton();
        
        console.log('Smart Filters Plugin загружен');
    }
    
    // Запуск
    initPlugin();
})();
