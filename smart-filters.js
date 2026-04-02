(function() {
    'use strict';
    
    var STORAGE_KEY = 'smart_filters_list';
    
    // Сопоставление типов контента
    var CONTENT_TYPES = {
        "Фильмы": { url: "discover/movie", component: "category" },
        "Сериалы": { url: "discover/tv", component: "category" },
        "Мультфильмы": { url: "discover/movie", component: "category", extra: "with_genres=16" },
        "Мультсериалы": { url: "discover/tv", component: "category", extra: "with_genres=16" },
        "Аниме": { url: "discover/movie", component: "category", extra: "with_genres=16&with_original_language=ja" }
    };
    
    // Сопоставление языков
    var LANG_MAP = {
        "Русский": "ru", "Английский": "en", "Японский": "ja", "Корейский": "ko",
        "Китайский": "zh", "Немецкий": "de", "Французский": "fr", "Испанский": "es",
        "Итальянский": "it", "Португальский": "pt", "Польский": "pl", "Турецкий": "tr"
    };
    
    var plugin = {
        loadFilters: function() {
            return Lampa.Storage.get(STORAGE_KEY, []);
        },
        
        saveFilter: function(filter) {
            var filters = this.loadFilters();
            filters.push(filter);
            Lampa.Storage.set(STORAGE_KEY, filters);
            this.updateMenu();
            Lampa.Noty.show('Фильтр "' + filter.name + '" сохранен');
        },
        
        removeFilter: function(id) {
            var filters = this.loadFilters();
            var newFilters = [];
            for (var i = 0; i < filters.length; i++) {
                if (filters[i].id != id) newFilters.push(filters[i]);
            }
            Lampa.Storage.set(STORAGE_KEY, newFilters);
            this.updateMenu();
            Lampa.Noty.show('Фильтр удален');
        },
        
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
            
            if (activity) {
                var url = activity.url || '';
                
                // Определяем тип
                if (url.indexOf('discover/tv') !== -1) {
                    filters.type = (url.indexOf('with_genres=16') !== -1) ? "Мультсериалы" : "Сериалы";
                } else if (url.indexOf('discover/movie') !== -1) {
                    if (url.indexOf('with_genres=16') !== -1) {
                        filters.type = (url.indexOf('with_original_language=ja') !== -1) ? "Аниме" : "Мультфильмы";
                    } else {
                        filters.type = "Фильмы";
                    }
                }
                
                // Жанры
                var gMatch = url.match(/with_genres=([0-9,]+)/);
                if (gMatch) filters.genres = gMatch[1].split(',').map(Number);
                
                // Язык
                var lMatch = url.match(/with_original_language=([a-z]+)/);
                if (lMatch) filters.language = lMatch[1];
                
                // Год
                var yMatch = url.match(/primary_release_date\.gte=([0-9]+)/);
                if (yMatch) filters.yearFrom = parseInt(yMatch[1]);
                var y2Match = url.match(/primary_release_date\.lte=([0-9]+)/);
                if (y2Match) filters.yearTo = parseInt(y2Match[1]);
            }
            
            return filters;
        },
        
        openFilter: function(filter) {
            var typeConfig = CONTENT_TYPES[filter.type] || CONTENT_TYPES["Фильмы"];
            var url = typeConfig.url;
            var params = [];
            
            if (typeConfig.extra) params.push(typeConfig.extra);
            if (filter.genres && filter.genres.length) params.push('with_genres=' + filter.genres.join(','));
            if (filter.language) params.push('with_original_language=' + filter.language);
            if (filter.yearFrom) params.push('primary_release_date.gte=' + filter.yearFrom + '-01-01');
            if (filter.yearTo) params.push('primary_release_date.lte=' + filter.yearTo + '-12-31');
            
            if (params.length) url += '?' + params.join('&');
            
            Lampa.Activity.push({
                url: url,
                title: filter.name,
                component: typeConfig.component,
                source: "tmdb",
                page: 1,
                card_type: true
            });
        },
        
        updateMenu: function() {
            $('.menu__item[data-smart-filter]').remove();
            
            var filters = this.loadFilters();
            if (!filters.length) return;
            
            var menuList = $('.menu .menu__list').eq(0);
            if (!menuList.length) {
                setTimeout(this.updateMenu.bind(this), 1000);
                return;
            }
            
            for (var i = 0; i < filters.length; i++) {
                var filter = filters[i];
                var self = this;
                
                var item = $(
                    '<li class="menu__item selector" data-smart-filter="' + filter.id + '">' +
                        '<div class="menu__ico">🔍</div>' +
                        '<div class="menu__text" style="flex:1;">' + (filter.name || 'Без названия') + '</div>' +
                        '<div class="menu__remove" style="width:30px;text-align:center;color:#ff5555;">✕</div>' +
                    '</li>'
                );
                
                item.on('hover:enter', function(e) {
                    if ($(e.target).hasClass('menu__remove')) return;
                    self.openFilter(filter);
                });
                
                item.find('.menu__remove').on('hover:enter', function(e) {
                    e.stopPropagation();
                    Lampa.Select.show({
                        title: 'Удалить фильтр?',
                        items: [{title:'Да',value:'yes'},{title:'Нет',value:'no'}],
                        onSelect: function(res) {
                            if (res.value === 'yes') self.removeFilter(filter.id);
                        }
                    });
                });
                
                menuList.append(item);
            }
        },
        
        showSaveDialog: function() {
            var current = this.getCurrentFilters();
            var self = this;
            Lampa.Input.show({
                title: 'Название фильтра',
                default: current.name,
                onInput: function(name) {
                    if (name && name.trim()) {
                        current.name = name.trim();
                        self.saveFilter(current);
                    }
                }
            });
        }
    };
    
    // Добавляем кнопку сохранения
    function addSaveButton() {
        var toolbar = $('.category__toolbar');
        if (toolbar.length && !toolbar.find('.smart-save-btn').length) {
            var btn = $(
                '<div class="toolbar__button selector smart-save-btn">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                        '<path d="M4 4H20V20H4V4Z" stroke="currentColor" fill="none"/>' +
                        '<path d="M8 8H16V10H8V8Z" fill="currentColor"/>' +
                        '<path d="M8 12H14V14H8V12Z" fill="currentColor"/>' +
                    '</svg>' +
                    '<span>Сохранить</span>' +
                '</div>'
            );
            btn.on('hover:enter', function() { plugin.showSaveDialog(); });
            toolbar.append(btn);
        }
    }
    
    // Слушаем открытие категории
    Lampa.Listener.follow('activity', function(e) {
        if (e.type === 'create' && e.activity && e.activity.component === 'category') {
            setTimeout(addSaveButton, 500);
        }
    });
    
    // Инициализация
    function init() {
        if (window.smart_filters_final) return;
        window.smart_filters_final = true;
        
        if (window.appready) {
            plugin.updateMenu();
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') plugin.updateMenu();
            });
        }
        console.log('Smart Filters Plugin v2 загружен');
    }
    
    init();
})();
