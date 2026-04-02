(function() {
    'use strict';
    
    if (window.SmartFiltersLoaded) return;
    window.SmartFiltersLoaded = true;
    
    console.log('[SmartFilters] Плагин загружается...');
    
    const STORAGE_KEY = 'smart_filters_saved';
    let savedFilters = [];
    
    // Карта соответствий для API
    var genreMap = {
        'Боевик': 28, 'Приключения': 12, 'Мультфильм': 16, 'Комедия': 35,
        'Криминал': 80, 'Документальный': 99, 'Драма': 18, 'Семейный': 10751,
        'Фэнтези': 14, 'История': 36, 'Ужасы': 27, 'Музыка': 10402,
        'Детектив': 9648, 'Мелодрама': 10749, 'Военный': 10752, 'Триллер': 53,
        'Вестерн': 37, 'Фантастика': 878, 'ТВ фильм': 10770
    };
    
    var countryMap = {
        'Русский': 'RU', 'Английский': 'US', 'Французский': 'FR', 'Немецкий': 'DE',
        'Испанский': 'ES', 'Итальянский': 'IT', 'Японский': 'JP', 'Китайский': 'CN',
        'Корейский': 'KR', 'Индийский': 'IN'
    };
    
    function loadFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        savedFilters = Array.isArray(data) ? data : [];
        console.log('[SmartFilters] Загружено:', savedFilters.length);
        updateMenu();
        updateSettingsPanel();
    }
    
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
        updateSettingsPanel();
    }
    
    // Получение ВСЕХ параметров (включая "Не выбрано")
    function getCurrentFilterParams() {
        try {
            var params = {
                type: 'Не выбрано',
                rating: 'Не выбрано',
                genre: 'Не выбрано',
                country: 'Не выбрано',
                year: 'Не выбрано'
            };
            
            var typeEl = $('.selectbox-item:contains("Тип") .selectbox-item__subtitle');
            if (typeEl.length && typeEl.text() !== 'Не выбрано') {
                params.type = typeEl.text();
            }
            
            var ratingEl = $('.selectbox-item:contains("Рейтинг") .selectbox-item__subtitle');
            if (ratingEl.length && ratingEl.text() !== 'Не выбрано') {
                var ratingText = ratingEl.text();
                var match = ratingText.match(/\d+/);
                if (match) params.rating = match[0];
                else params.rating = ratingText;
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
            if (yearEl.length && yearEl.text() !== 'Не выбрано' && yearEl.text().match(/^\d{4}$/)) {
                params.year = yearEl.text();
            }
            
            console.log('[SmartFilters] Параметры:', params);
            return params;
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            return null;
        }
    }
    
    // Применение фильтра
    function applyFilter(filter) {
        try {
            console.log('[SmartFilters] Применяем:', filter.name);
            
            var params = filter.params;
            if (!params) return;
            
            var mediaType = (params.type === 'Сериалы') ? 'tv' : 'movie';
            var apiUrl = 'https://tmdb.' + Lampa.Manifest.cub_domain + '/3/discover/' + mediaType;
            apiUrl += '?api_key=4ef0d7355d9ffb5151e987764708ce96&language=ru&sort_by=popularity.desc';
            
            if (params.genreId && params.genreId !== 'Не выбрано') {
                apiUrl += '&with_genres=' + params.genreId;
            }
            
            if (params.year && params.year !== 'Не выбрано' && params.year.match(/^\d{4}$/)) {
                apiUrl += '&primary_release_year=' + params.year;
                if (mediaType === 'tv') apiUrl += '&first_air_date_year=' + params.year;
            }
            
            if (params.countryCode && params.countryCode !== 'Не выбрано') {
                apiUrl += '&with_origin_country=' + params.countryCode;
            }
            
            if (params.rating && params.rating !== 'Не выбрано' && !isNaN(parseFloat(params.rating))) {
                apiUrl += '&vote_average.gte=' + parseFloat(params.rating);
            }
            
            apiUrl += '&page=1';
            
            console.log('[SmartFilters] URL:', apiUrl);
            
            var componentName = 'smart_filter_' + filter.id;
            if (Lampa.Component.list[componentName]) delete Lampa.Component.list[componentName];
            
            var FilterComponent = function(object) {
                var comp = new Lampa.InteractionCategory(object);
                comp.create = function() {
                    Lampa.Api.request(apiUrl, function(data) {
                        if (data && data.results && data.results.length) {
                            this.build(data);
                        } else {
                            this.empty();
                            Lampa.Noty.show('Ничего не найдено', 2000);
                        }
                    }.bind(this), function() {
                        this.empty();
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
            
            Lampa.Noty.show('✓ Открыт "' + filter.name + '"', 1500);
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            Lampa.Noty.show('Ошибка применения', 2000);
        }
    }
    
    // Сохранение
    function saveCurrentFilter() {
        var params = getCurrentFilterParams();
        if (!params) {
            Lampa.Noty.show('Ошибка получения параметров', 2000);
            return;
        }
        
        var name = prompt('Введите название фильтра:', 'Мой фильтр');
        if (name && name.trim()) {
            savedFilters.push({
                id: Date.now(),
                name: name.trim(),
                params: params,
                date: new Date().toLocaleString()
            });
            saveFilters();
            Lampa.Noty.show('✓ Фильтр сохранён', 2000);
        }
    }
    
    // Удаление одного
    function deleteFilter(id, name) {
        Lampa.Select.show({
            title: 'Удалить "' + name + '"?',
            items: [{ title: 'Да' }, { title: 'Нет' }],
            onSelect: function(item) {
                if (item.title === 'Да') {
                    savedFilters = savedFilters.filter(function(f) { return f.id !== id; });
                    saveFilters();
                    Lampa.Noty.show('Фильтр удалён', 1000);
                }
            }
        });
    }
    
    // Очистка всех
    function clearAllFilters() {
        if (savedFilters.length === 0) {
            Lampa.Noty.show('Нет фильтров', 1000);
            return;
        }
        Lampa.Select.show({
            title: 'Удалить все фильтры?',
            items: [{ title: 'Да' }, { title: 'Нет' }],
            onSelect: function(item) {
                if (item.title === 'Да') {
                    savedFilters = [];
                    saveFilters();
                    Lampa.Noty.show('Все фильтры удалены', 1000);
                }
            }
        });
    }
    
    // Обновление меню
    function updateMenu() {
        $('.menu__item[data-name^="smart_filter_"]').remove();
        var filterItem = $('.menu__item[data-action="filter"]');
        
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-name="smart_filter_' + filter.id + '">\
                <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg></div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
            </li>');
            if (filterItem.length) filterItem.after(item);
            else $('.menu__list').append(item);
            item.on('hover:enter', function() { applyFilter(filter); });
        });
    }
    
    // Панель настроек
    function updateSettingsPanel() {
        var container = $('.smart-filters-list');
        if (!container.length) return;
        container.empty();
        
        if (savedFilters.length === 0) {
            container.html('<div style="padding: 1em; text-align: center;">Нет фильтров</div>');
            return;
        }
        
        savedFilters.forEach(function(filter) {
            var div = $('<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5em 0; border-bottom: 1px solid rgba(255,255,255,0.1);">\
                <div><b>' + filter.name + '</b><br><span style="font-size: 0.7em;">' + filter.date + '</span></div>\
                <div class="button del-btn selector" data-id="' + filter.id + '" data-name="' + filter.name.replace(/'/g, "\\'") + '" style="padding: 0.2em 0.6em; background: rgba(255,0,0,0.3); border-radius: 0.3em;">Удалить</div>\
            </div>');
            container.append(div);
            div.find('.del-btn').on('hover:enter', function() {
                deleteFilter(parseInt($(this).data('id')), $(this).data('name'));
            });
        });
    }
    
    // Основной пункт меню
    function addMainMenuItem() {
        $('.menu__item[data-name="smart_filters_root"]').remove();
        var filterItem = $('.menu__item[data-action="filter"]');
        var mainItem = $('<li class="menu__item selector" data-name="smart_filters_root">\
            <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/></svg></div>\
            <div class="menu__text">📁 Мои фильтры</div>\
        </li>');
        if (filterItem.length) filterItem.after(mainItem);
        else $('.menu__list').append(mainItem);
        
        mainItem.on('hover:enter', function() {
            $('.menu__submenu').remove();
            var sub = $('<div class="menu__submenu" style="position:absolute;background:rgba(0,0,0,0.95);border-radius:8px;min-width:180px;">\
                <div class="menu__submenu-item selector" data-action="save">💾 Сохранить фильтр</div>\
                <div class="menu__submenu-item selector" data-action="list">📋 Мои фильтры</div>\
                <div class="menu__submenu-item selector" data-action="clear">🗑️ Очистить все</div>\
            </div>');
            $('body').append(sub);
            sub.find('[data-action="save"]').on('hover:enter', function() { saveCurrentFilter(); sub.remove(); });
            sub.find('[data-action="list"]').on('hover:enter', function() { showFiltersList(); sub.remove(); });
            sub.find('[data-action="clear"]').on('hover:enter', function() { clearAllFilters(); sub.remove(); });
        });
    }
    
    function showFiltersList() {
        if (!savedFilters.length) { Lampa.Noty.show('Нет фильтров', 2000); return; }
        var items = savedFilters.map(function(f) {
            return { title: f.name, subtitle: f.date, filter: f };
        });
        Lampa.Select.show({
            title: 'Мои фильтры',
            items: items,
            onSelect: function(item) { applyFilter(item.filter); }
        });
    }
    
    // Кнопка в панели фильтра
    function addFilterButton() {
        var interval = setInterval(function() {
            var body = $('.selectbox__body');
            if (body.length && !$('.smart-save-btn').length) {
                var btn = $('<div class="selectbox-item selector smart-save-btn" style="border-top:1px solid rgba(255,255,255,0.1);margin-top:0.5em;">\
                    <div class="selectbox-item__title">💾 Сохранить фильтр</div>\
                </div>');
                btn.on('hover:enter', saveCurrentFilter);
                body.append(btn);
                clearInterval(interval);
            }
        }, 500);
    }
    
    // Настройки
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        Lampa.SettingsApi.addComponent({ component: 'smart_filters', name: 'Smart Filters', icon: '🔖' });
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'list', type: 'info' },
            field: { name: 'Сохранённые фильтры', value: '' },
            onRender: function(el) {
                var container = $('<div class="smart-filters-list" style="margin-top:0.5em;"></div>');
                el.find('.settings-param__value').html('').append(container);
                updateSettingsPanel();
            }
        });
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'clear', type: 'button' },
            field: { name: 'Очистить все фильтры' },
            onChange: clearAllFilters
        });
    }
    
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenuItem();
        addFilterButton();
        addSettings();
        console.log('[SmartFilters] Готов!');
    }
    
    if (window.appready) init();
    else Lampa.Listener.follow('app', init);
    
})();(function() {
    'use strict';
    
    // Защита от повторной загрузки
    if (window.SmartFiltersFinal) return;
    window.SmartFiltersFinal = true;
    
    console.log('[SmartFilters] Загрузка плагина...');
    
    // --- Хранилище ---
    const STORAGE_KEY = 'smart_filters_list';
    let savedFilters = [];
    
    // --- Загрузка фильтров ---
    function loadFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        savedFilters = Array.isArray(data) ? data : [];
        console.log('[SmartFilters] Загружено:', savedFilters.length);
    }
    
    // --- Сохранение ---
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
    }
    
    // --- Получение текущих параметров фильтра (из исходного кода Lampa) ---
    function getCurrentFilterParams() {
        try {
            // Прямой доступ к параметрам фильтра через Controller
            if (Lampa.Controller && Lampa.Controller.filters && Lampa.Controller.filters.params) {
                var params = Lampa.Controller.filters.params;
                console.log('[SmartFilters] Текущие параметры:', params);
                return params;
            }
            
            // Альтернативный способ через компонент
            var filterComponent = Lampa.Component.find('filter');
            if (filterComponent && filterComponent.activity && filterComponent.activity.params) {
                return filterComponent.activity.params;
            }
            
            return null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            return null;
        }
    }
    
    // --- Применение фильтра (как в Lampa) ---
    function applyFilter(params) {
        try {
            if (!params) return;
            
            console.log('[SmartFilters] Применяем фильтр:', params);
            
            // Устанавливаем параметры
            if (Lampa.Controller && Lampa.Controller.filters) {
                Lampa.Controller.filters.setParams(params);
                
                // Обновляем UI фильтра
                if (Lampa.Controller.filters.update) {
                    Lampa.Controller.filters.update();
                }
                
                // Перезагружаем контент
                if (Lampa.Controller.filters.reload) {
                    Lampa.Controller.filters.reload();
                }
            }
            
            Lampa.Noty.show('✓ Фильтр применён', 1500);
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            Lampa.Noty.show('Ошибка применения фильтра', 2000);
        }
    }
    
    // --- Сохранение ---
    function saveCurrentFilter() {
        var params = getCurrentFilterParams();
        
        if (!params || Object.keys(params).length === 0) {
            Lampa.Noty.show('✗ Сначала настройте фильтр', 2000);
            return;
        }
        
        // Модальное окно для ввода имени
        Lampa.Modal.open({
            title: 'Сохранить фильтр',
            html: '<div style="padding: 20px;"><input type="text" id="filter_name" placeholder="Название фильтра" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; color: #fff;"></div>',
            onSelect: function() {
                var name = $('#filter_name').val();
                if (name && name.trim()) {
                    savedFilters.push({
                        id: Date.now(),
                        name: name.trim(),
                        params: params,
                        date: new Date().toLocaleString()
                    });
                    saveFilters();
                    Lampa.Noty.show('✓ Фильтр "' + name + '" сохранён', 2000);
                }
            }
        });
    }
    
    // --- Показать список ---
    function showFiltersList() {
        if (savedFilters.length === 0) {
            Lampa.Noty.show('Нет сохранённых фильтров', 2000);
            return;
        }
        
        var items = savedFilters.map(function(f) {
            return { title: f.name, subtitle: f.date, filter: f };
        });
        
        Lampa.Select.show({
            title: 'Мои фильтры',
            items: items,
            onSelect: function(item) {
                applyFilter(item.filter.params);
            }
        });
    }
    
    // --- Очистка ---
    function clearAll() {
        Lampa.Select.show({
            title: 'Удалить все фильтры?',
            items: [{ title: 'Да' }, { title: 'Нет' }],
            onSelect: function(item) {
                if (item.title === 'Да') {
                    savedFilters = [];
                    saveFilters();
                    Lampa.Noty.show('Все фильтры удалены', 2000);
                }
            }
        });
    }
    
    // --- Обновление меню ---
    function updateMenu() {
        // Удаляем старые пункты
        $('.menu__item[data-name^="smart_filter_"]').remove();
        
        // Находим пункт "Фильтр"
        var filterItem = $('.menu__item[data-name="filter"]');
        
        // Добавляем сохранённые фильтры
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-name="smart_filter_' + filter.id + '">\
                <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg></div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
                <div class="menu__item-icon menu__item-icon--delete">✖</div>\
            </li>');
            
            if (filterItem.length) {
                filterItem.after(item);
            } else {
                $('.menu__list').append(item);
            }
            
            item.on('hover:enter', function(e) {
                if ($(e.target).hasClass('menu__item-icon--delete')) return;
                applyFilter(filter.params);
            });
            
            item.find('.menu__item-icon--delete').on('hover:enter', function(e) {
                e.stopPropagation();
                savedFilters = savedFilters.filter(function(f) { return f.id !== filter.id; });
                saveFilters();
                Lampa.Noty.show('Фильтр удалён', 1000);
            });
        });
    }
    
    // --- ДОБАВЛЕНИЕ КНОПКИ В ПАНЕЛЬ ФИЛЬТРА (из исходного кода Lampa) ---
    function addSaveButton() {
        console.log('[SmartFilters] Добавление кнопки в панель фильтра...');
        
        // Используем событие из исходного кода Lampa
        Lampa.Listener.follow('filter', function(e) {
            if (e.type === 'create' || e.type === 'open' || e.type === 'render') {
                setTimeout(function() {
                    // Ищем контейнер кнопок (как в исходном коде Lampa)
                    var buttonsContainer = $('.filter-panel .buttons, .filter .buttons, .filter__buttons');
                    
                    if (buttonsContainer.length && !buttonsContainer.find('.smart-save-btn').length) {
                        var btn = $('<div class="button smart-save-btn selector" style="margin-left: 10px;">\
                            <div class="button__icon">💾</div>\
                            <div class="button__text">Сохранить</div>\
                        </div>');
                        
                        btn.on('hover:enter', function() {
                            saveCurrentFilter();
                        });
                        
                        buttonsContainer.append(btn);
                        console.log('[SmartFilters] Кнопка добавлена!');
                    }
                }, 200);
            }
        });
        
        // Также проверяем каждые 2 секунды
        var interval = setInterval(function() {
            var buttonsContainer = $('.filter-panel .buttons, .filter .buttons, .filter__buttons');
            if (buttonsContainer.length && !buttonsContainer.find('.smart-save-btn').length) {
                var btn = $('<div class="button smart-save-btn selector" style="margin-left: 10px;">\
                    <div class="button__icon">💾</div>\
                    <div class="button__text">Сохранить</div>\
                </div>');
                btn.on('hover:enter', saveCurrentFilter);
                buttonsContainer.append(btn);
                console.log('[SmartFilters] Кнопка добавлена (interval)');
                clearInterval(interval);
            }
        }, 1000);
    }
    
    // --- Добавление пункта в левое меню ---
    function addMainMenu() {
        var filterItem = $('.menu__item[data-name="filter"]');
        
        var mainItem = $('<li class="menu__item selector" data-name="smart_filters_menu">\
            <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/></svg></div>\
            <div class="menu__text">📁 Мои фильтры</div>\
        </li>');
        
        if (filterItem.length) {
            filterItem.after(mainItem);
        } else {
            $('.menu__list').append(mainItem);
        }
        
        mainItem.on('hover:enter', function() {
            $('.menu__submenu[data-parent="smart_filters_menu"]').remove();
            
            var submenu = $('<div class="menu__submenu" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 180px;">\
                <div class="menu__submenu-item selector" data-action="save">💾 Сохранить фильтр</div>\
                <div class="menu__submenu-item selector" data-action="list">📋 Мои фильтры</div>\
                <div class="menu__submenu-item selector" data-action="clear">🗑️ Очистить все</div>\
            </div>');
            
            $('body').append(submenu);
            
            submenu.find('[data-action="save"]').on('hover:enter', function() { saveCurrentFilter(); submenu.remove(); });
            submenu.find('[data-action="list"]').on('hover:enter', function() { showFiltersList(); submenu.remove(); });
            submenu.find('[data-action="clear"]').on('hover:enter', function() { clearAll(); submenu.remove(); });
        });
    }
    
    // --- Настройки ---
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        
        Lampa.SettingsApi.addComponent({
            component: 'smart_filters',
            name: 'Smart Filters',
            icon: '🔖'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'clear_all', type: 'button' },
            field: { name: 'Очистить все фильтры' },
            onChange: clearAll
        });
    }
    
    // --- Запуск ---
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenu();
        addSaveButton();
        addSettings();
        updateMenu();
        console.log('[SmartFilters] Готов!');
        Lampa.Noty.show('Smart Filters загружен', 2000);
    }
    
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', init);
    }
    
})();
