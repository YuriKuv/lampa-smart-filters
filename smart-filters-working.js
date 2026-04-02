(function() {
    'use strict';
    
    // Защита от повторной загрузки
    if (window.SmartFiltersFinalWorking) return;
    window.SmartFiltersFinalWorking = true;
    
    console.log('[SmartFilters] Плагин загружается...');
    
    // --- Хранилище ---
    const STORAGE_KEY = 'smart_filters_saved';
    let savedFilters = [];
    
    // --- Карта соответствий ---
    const genreMap = {
        'Боевик': 28, 'Приключения': 12, 'Мультфильм': 16, 'Комедия': 35,
        'Криминал': 80, 'Документальный': 99, 'Драма': 18, 'Семейный': 10751,
        'Фэнтези': 14, 'История': 36, 'Ужасы': 27, 'Музыка': 10402,
        'Детектив': 9648, 'Мелодрама': 10749, 'Военный': 10752, 'Телевизионный фильм': 10770,
        'Триллер': 53, 'Вестерн': 37
    };
    
    const countryMap = {
        'Русский': 'RU', 'Английский': 'US', 'Французский': 'FR', 'Немецкий': 'DE',
        'Испанский': 'ES', 'Итальянский': 'IT', 'Японский': 'JP', 'Китайский': 'CN',
        'Корейский': 'KR', 'Индийский': 'IN'
    };
    
    // --- Загрузка ---
    function loadFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        savedFilters = Array.isArray(data) ? data : [];
        console.log('[SmartFilters] Загружено фильтров:', savedFilters.length);
        updateMenu();
        updateSettingsPanel();
    }
    
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
        updateSettingsPanel();
    }
    
    // --- Получение параметров фильтра из DOM ---
    function getCurrentFilterParams() {
        try {
            var params = {};
            
            var typeEl = $('.selectbox-item:contains("Тип") .selectbox-item__subtitle');
            if (typeEl.length && typeEl.text() !== 'Не выбрано') {
                params.type = typeEl.text();
            }
            
            var ratingEl = $('.selectbox-item:contains("Рейтинг") .selectbox-item__subtitle');
            if (ratingEl.length && ratingEl.text() !== 'Не выбрано') {
                var ratingText = ratingEl.text();
                if (ratingText.includes('до')) {
                    var match = ratingText.match(/(\d+)/);
                    if (match) params.rating = match[1];
                } else if (ratingText.includes('От')) {
                    var match = ratingText.match(/(\d+)/);
                    if (match) params.rating = match[1];
                } else {
                    params.rating = ratingText;
                }
            }
            
            var genreEl = $('.selectbox-item:contains("Жанр") .selectbox-item__subtitle');
            if (genreEl.length && genreEl.text() !== 'Не выбрано') {
                params.genre = genreEl.text();
                params.genreId = genreMap[params.genre] || null;
            }
            
            var countryEl = $('.selectbox-item:contains("Язык оригинала") .selectbox-item__subtitle');
            if (countryEl.length && countryEl.text() !== 'Не выбрано') {
                params.country = countryEl.text();
                params.countryCode = countryMap[params.country] || null;
            }
            
            var yearEl = $('.selectbox-item:contains("Год") .selectbox-item__subtitle');
            if (yearEl.length && yearEl.text() !== 'Не выбрано') {
                params.year = yearEl.text();
            }
            
            console.log('[SmartFilters] Сохранены параметры:', params);
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            return null;
        }
    }
    
    // --- Применение фильтра ---
    function applyFilter(filter) {
        try {
            console.log('[SmartFilters] Применяем фильтр:', filter);
            
            var params = filter.params;
            if (!params) return false;
            
            var mediaType = (params.type === 'Сериалы') ? 'tv' : 'movie';
            
            var apiUrl = 'https://tmdb.' + Lampa.Manifest.cub_domain + '/3/discover/' + mediaType;
            apiUrl += '?api_key=4ef0d7355d9ffb5151e987764708ce96&language=ru';
            
            // Добавляем жанр (по ID)
            if (params.genreId) {
                apiUrl += '&with_genres=' + params.genreId;
            }
            
            // Добавляем год
            if (params.year) {
                apiUrl += '&primary_release_year=' + params.year;
                if (mediaType === 'tv') {
                    apiUrl += '&first_air_date_year=' + params.year;
                }
            }
            
            // Добавляем страну
            if (params.countryCode) {
                apiUrl += '&with_origin_country=' + params.countryCode;
            }
            
            // Добавляем рейтинг
            if (params.rating) {
                var ratingNum = parseFloat(params.rating);
                if (!isNaN(ratingNum)) {
                    apiUrl += '&vote_average.gte=' + ratingNum;
                }
            }
            
            apiUrl += '&page=1&sort_by=popularity.desc';
            
            console.log('[SmartFilters] URL:', apiUrl);
            
            var componentName = 'smart_filter_' + filter.id;
            
            if (Lampa.Component.list[componentName]) {
                delete Lampa.Component.list[componentName];
            }
            
            var FilterComponent = function(object) {
                var comp = new Lampa.InteractionCategory(object);
                comp.create = function() {
                    Lampa.Api.request(apiUrl, function(data) {
                        if (data && data.results && data.results.length) {
                            this.build(data);
                        } else {
                            this.empty();
                            Lampa.Noty.show('По вашему запросу ничего не найдено', 2000);
                        }
                    }.bind(this), function() {
                        this.empty();
                        Lampa.Noty.show('Ошибка загрузки данных', 2000);
                    }.bind(this));
                };
                comp.nextPageReuest = function(object, resolve, reject) {
                    var nextUrl = apiUrl.replace('page=1', 'page=' + object.page);
                    Lampa.Api.request(nextUrl, resolve, reject);
                }.bind(comp);
                return comp;
            };
            
            Lampa.Component.add(componentName, FilterComponent);
            
            Lampa.Activity.push({
                url: apiUrl,
                title: filter.name,
                component: componentName,
                page: 1
            });
            
            Lampa.Noty.show('✓ Открыт фильтр "' + filter.name + '"', 1500);
            return true;
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            Lampa.Noty.show('Ошибка применения фильтра', 2000);
            return false;
        }
    }
    
    // --- Сохранение фильтра ---
    function saveCurrentFilter() {
        var params = getCurrentFilterParams();
        
        if (!params) {
            Lampa.Noty.show('✗ Сначала выберите параметры в фильтре', 2000);
            return;
        }
        
        var name = prompt('Введите название фильтра:', 'Мой фильтр');
        if (name && name.trim()) {
            var newFilter = {
                id: Date.now(),
                name: name.trim(),
                params: params,
                date: new Date().toLocaleString()
            };
            savedFilters.push(newFilter);
            saveFilters();
            Lampa.Noty.show('✓ Фильтр "' + name + '" сохранён', 2000);
        }
    }
    
    // --- Удаление фильтра ---
    function deleteFilter(filterId, filterName) {
        Lampa.Select.show({
            title: 'Удалить фильтр "' + filterName + '"?',
            items: [
                { title: 'Да, удалить', confirm: true },
                { title: 'Отмена' }
            ],
            onSelect: function(item) {
                if (item.confirm) {
                    savedFilters = savedFilters.filter(function(f) { return f.id !== filterId; });
                    saveFilters();
                    Lampa.Noty.show('Фильтр "' + filterName + '" удалён', 1000);
                }
            }
        });
    }
    
    // --- Очистка всех фильтров ---
    function clearAllFilters() {
        if (savedFilters.length === 0) {
            Lampa.Noty.show('Нет фильтров для удаления', 1000);
            return;
        }
        
        Lampa.Select.show({
            title: 'Удалить ВСЕ фильтры?',
            items: [
                { title: 'Да, удалить все', confirm: true },
                { title: 'Отмена' }
            ],
            onSelect: function(item) {
                if (item.confirm) {
                    savedFilters = [];
                    saveFilters();
                    Lampa.Noty.show('Все фильтры удалены', 1000);
                }
            }
        });
    }
    
    // --- Обновление меню ---
    function updateMenu() {
        $('.menu__item[data-name^="smart_filter_saved_"]').remove();
        
        var filterItem = $('.menu__item[data-action="filter"]');
        
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-name="smart_filter_saved_' + filter.id + '">\
                <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg></div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
            </li>');
            
            if (filterItem.length) {
                filterItem.after(item);
            } else {
                $('.menu__list').append(item);
            }
            
            item.on('hover:enter', function() {
                applyFilter(filter);
            });
        });
    }
    
    // --- Обновление панели настроек ---
    function updateSettingsPanel() {
        var container = $('.smart-filters-list-container');
        if (!container.length) return;
        
        container.empty();
        
        if (savedFilters.length === 0) {
            container.html('<div style="padding: 1em; text-align: center; opacity: 0.7;">Нет сохранённых фильтров</div>');
            return;
        }
        
        savedFilters.forEach(function(filter) {
            var filterItem = $('<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.8em 0; border-bottom: 1px solid rgba(255,255,255,0.1);">\
                <div style="flex: 1;">\
                    <div style="font-weight: bold;">' + filter.name + '</div>\
                    <div style="font-size: 0.7em; opacity: 0.6;">' + filter.date + '</div>\
                </div>\
                <div class="button smart-filters-delete-btn selector" data-id="' + filter.id + '" data-name="' + filter.name.replace(/'/g, "\\'") + '" style="padding: 0.3em 0.8em; background: rgba(255,255,255,0.1); border-radius: 0.3em;">🗑️ Удалить</div>\
            </div>');
            container.append(filterItem);
            
            filterItem.find('.smart-filters-delete-btn').on('hover:enter', function() {
                var id = parseInt($(this).data('id'));
                var name = $(this).data('name');
                deleteFilter(id, name);
            });
        });
    }
    
    // --- Добавление пункта в меню ---
    function addMainMenuItem() {
        $('.menu__item[data-name="smart_filters_root"]').remove();
        
        var filterItem = $('.menu__item[data-action="filter"]');
        
        var mainItem = $('<li class="menu__item selector" data-name="smart_filters_root">\
            <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/></svg></div>\
            <div class="menu__text">📁 Мои фильтры</div>\
        </li>');
        
        if (filterItem.length) {
            filterItem.after(mainItem);
        } else {
            $('.menu__list').append(mainItem);
        }
        
        mainItem.off('hover:enter').on('hover:enter', function() {
            $('.menu__submenu[data-parent="smart_filters_root"]').remove();
            
            var submenu = $('<div class="menu__submenu" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 180px;">\
                <div class="menu__submenu-item selector" data-action="save">💾 Сохранить текущий фильтр</div>\
                <div class="menu__submenu-item selector" data-action="list">📋 Мои фильтры</div>\
                <div class="menu__submenu-item selector" data-action="clear">🗑️ Очистить все</div>\
            </div>');
            
            $('body').append(submenu);
            
            submenu.find('[data-action="save"]').on('hover:enter', function() { saveCurrentFilter(); submenu.remove(); });
            submenu.find('[data-action="list"]').on('hover:enter', function() { showFiltersList(); submenu.remove(); });
            submenu.find('[data-action="clear"]').on('hover:enter', function() { clearAllFilters(); submenu.remove(); });
        });
    }
    
    // --- Показать список фильтров ---
    function showFiltersList() {
        if (savedFilters.length === 0) {
            Lampa.Noty.show('Нет сохранённых фильтров', 2000);
            return;
        }
        
        var items = savedFilters.map(function(f) {
            return { title: f.name, subtitle: 'Сохранён: ' + f.date, filter: f };
        });
        
        Lampa.Select.show({
            title: 'Мои фильтры',
            items: items,
            onSelect: function(item) {
                applyFilter(item.filter);
            }
        });
    }
    
    // --- Добавление кнопки в панель фильтра ---
    function addFilterButton() {
        var checkInterval = setInterval(function() {
            var selectboxBody = $('.selectbox__body');
            if (selectboxBody.length && !$('.smart-filter-save-btn').length) {
                var btn = $('<div class="selectbox-item selector smart-filter-save-btn" style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 0.5em;">\
                    <div class="selectbox-item__title">💾 Сохранить этот фильтр</div>\
                </div>');
                btn.on('hover:enter', function() {
                    saveCurrentFilter();
                });
                selectboxBody.append(btn);
                clearInterval(checkInterval);
                console.log('[SmartFilters] Кнопка сохранения добавлена');
            }
        }, 500);
    }
    
    // --- Добавление настроек ---
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        
        // Удаляем старый компонент, если есть
        if (Lampa.SettingsApi.components.smart_filters) {
            delete Lampa.SettingsApi.components.smart_filters;
        }
        
        Lampa.SettingsApi.addComponent({
            component: 'smart_filters',
            name: 'Smart Filters',
            icon: '🔖'
        });
        
        // Контейнер для списка фильтров
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'filters_list', type: 'info' },
            field: { name: 'Сохранённые фильтры', value: '' },
            onRender: function(element) {
                var container = $('<div class="smart-filters-list-container" style="margin-top: 0.5em;"></div>');
                element.find('.settings-param__value').html('').append(container);
                updateSettingsPanel();
            }
        });
        
        // Кнопка очистки (одна)
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'clear_all', type: 'button' },
            field: { name: 'Очистить все фильтры' },
            onChange: function() {
                clearAllFilters();
            }
        });
    }
    
    // --- Инициализация ---
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenuItem();
        addFilterButton();
        addSettings();
        console.log('[SmartFilters] Готов!');
        setTimeout(function() {
            Lampa.Noty.show('Smart Filters загружен', 2000);
        }, 500);
    }
    
    // --- Запуск ---
    if (window.appready) {
        setTimeout(init, 500);
    } else {
        Lampa.Listener.follow('app', function() {
            setTimeout(init, 500);
        });
    }
    
})();
