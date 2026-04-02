(function() {
    'use strict';
    
    // Защита от повторной загрузки
    if (window.SmartFiltersClean) return;
    window.SmartFiltersClean = true;
    
    console.log('[SmartFilters] Плагин загружается...');
    
    // --- Хранилище ---
    const STORAGE_KEY = 'smart_filters_saved';
    let savedFilters = [];
    
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
    
    // --- Получение ВСЕХ параметров фильтра из DOM ---
    function getCurrentFilterParams() {
        try {
            var params = {};
            
            // Тип
            var typeEl = $('.selectbox-item:contains("Тип") .selectbox-item__subtitle');
            if (typeEl.length && typeEl.text() !== 'Не выбрано') {
                params.type = typeEl.text();
            }
            
            // Рейтинг
            var ratingEl = $('.selectbox-item:contains("Рейтинг") .selectbox-item__subtitle');
            if (ratingEl.length && ratingEl.text() !== 'Не выбрано') {
                params.rating = ratingEl.text();
            }
            
            // Жанр
            var genreEl = $('.selectbox-item:contains("Жанр") .selectbox-item__subtitle');
            if (genreEl.length && genreEl.text() !== 'Не выбрано') {
                params.genre = genreEl.text();
            }
            
            // Язык оригинала (страна)
            var countryEl = $('.selectbox-item:contains("Язык оригинала") .selectbox-item__subtitle');
            if (countryEl.length && countryEl.text() !== 'Не выбрано') {
                params.country = countryEl.text();
            }
            
            // Год
            var yearEl = $('.selectbox-item:contains("Год") .selectbox-item__subtitle');
            if (yearEl.length && yearEl.text() !== 'Не выбрано') {
                params.year = yearEl.text();
            }
            
            console.log('[SmartFilters] Сохранены параметры:', params);
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка получения параметров:', e);
            return null;
        }
    }
    
    // --- Применение фильтра (открытие раздела с фильтрацией) ---
    function applyFilter(filter) {
        try {
            console.log('[SmartFilters] Применяем фильтр:', filter);
            
            var params = filter.params;
            if (!params) return false;
            
            // Определяем тип контента
            var mediaType = 'movie';
            if (params.type === 'Сериалы') {
                mediaType = 'tv';
            }
            
            // Формируем URL с параметрами фильтрации
            var apiUrl = 'https://tmdb.' + Lampa.Manifest.cub_domain + '/3/discover/' + mediaType;
            apiUrl += '?api_key=4ef0d7355d9ffb5151e987764708ce96&language=ru';
            
            // Добавляем параметры в URL
            if (params.genre && params.genre !== 'Не выбрано') {
                apiUrl += '&with_genres=' + encodeURIComponent(params.genre);
            }
            
            if (params.year && params.year !== 'Не выбрано') {
                apiUrl += '&primary_release_year=' + params.year;
            }
            
            if (params.country && params.country !== 'Не выбрано') {
                apiUrl += '&with_origin_country=' + encodeURIComponent(params.country);
            }
            
            if (params.rating && params.rating !== 'Не выбрано') {
                var ratingValue = parseFloat(params.rating);
                if (!isNaN(ratingValue)) {
                    apiUrl += '&vote_average.gte=' + ratingValue;
                }
            }
            
            apiUrl += '&page=1';
            
            console.log('[SmartFilters] URL:', apiUrl);
            
            // Создаём компонент для отображения
            var componentName = 'smart_filter_' + filter.id;
            
            // Удаляем старый компонент, если есть
            if (Lampa.Component.list[componentName]) {
                delete Lampa.Component.list[componentName];
            }
            
            var FilterComponent = function(object) {
                var comp = new Lampa.InteractionCategory(object);
                comp.create = function() {
                    Lampa.Api.request(apiUrl, function(data) {
                        if (data && data.results) {
                            this.build(data);
                        } else {
                            this.empty();
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
            
            // Открываем раздел
            Lampa.Activity.push({
                url: apiUrl,
                title: filter.name,
                component: componentName,
                page: 1
            });
            
            Lampa.Noty.show('✓ Открыт фильтр "' + filter.name + '"', 1500);
            return true;
        } catch(e) {
            console.error('[SmartFilters] Ошибка применения:', e);
            Lampa.Noty.show('Ошибка применения фильтра', 2000);
            return false;
        }
    }
    
    // --- Сохранение текущего фильтра ---
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
    
    // --- Обновление меню (только пункты для открытия, без крестиков) ---
    function updateMenu() {
        // Удаляем старые пункты
        $('.menu__item[data-name^="smart_filter_saved_"]').remove();
        
        // Находим пункт "Фильтр"
        var filterItem = $('.menu__item[data-action="filter"]');
        
        // Добавляем сохранённые фильтры после "Фильтр"
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
            
            // Применение фильтра при нажатии
            item.on('hover:enter', function() {
                console.log('[SmartFilters] Открываем фильтр:', filter.name);
                applyFilter(filter);
            });
        });
    }
    
    // --- Обновление панели настроек ---
    function updateSettingsPanel() {
        // Находим контейнер настроек
        var settingsContainer = $('.settings__body');
        if (!settingsContainer.length) return;
        
        // Находим или создаём раздел
        var section = settingsContainer.find('[data-component="smart_filters"]');
        if (!section.length) return;
        
        // Обновляем список фильтров
        var filtersList = section.find('.smart-filters-list');
        if (filtersList.length) {
            filtersList.empty();
            
            if (savedFilters.length === 0) {
                filtersList.html('<div style="padding: 1em; text-align: center; opacity: 0.7;">Нет сохранённых фильтров</div>');
            } else {
                savedFilters.forEach(function(filter) {
                    var filterItem = $('<div class="settings-param" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5em 0; border-bottom: 1px solid rgba(255,255,255,0.1);">\
                        <div style="flex: 1;">\
                            <div class="settings-param__name">' + filter.name + '</div>\
                            <div style="font-size: 0.7em; opacity: 0.6;">' + filter.date + '</div>\
                        </div>\
                        <div class="button smart-filters-delete-btn selector" data-id="' + filter.id + '" data-name="' + filter.name + '" style="padding: 0.3em 0.8em; background: rgba(255,255,255,0.1); border-radius: 0.3em;">🗑️ Удалить</div>\
                    </div>');
                    filtersList.append(filterItem);
                    
                    filterItem.find('.smart-filters-delete-btn').on('hover:enter', function() {
                        var id = parseInt($(this).data('id'));
                        var name = $(this).data('name');
                        deleteFilter(id, name);
                    });
                });
            }
        }
    }
    
    // --- Добавление основного пункта в меню ---
    function addMainMenuItem() {
        // Удаляем старый
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
        
        // Подменю
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
    
    // --- Показать список фильтров (для подменю) ---
    function showFiltersList() {
        if (savedFilters.length === 0) {
            Lampa.Noty.show('Нет сохранённых фильтров', 2000);
            return;
        }
        
        var items = [];
        for (var i = 0; i < savedFilters.length; i++) {
            items.push({
                title: savedFilters[i].name,
                subtitle: 'Сохранён: ' + savedFilters[i].date,
                filter: savedFilters[i]
            });
        }
        
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
    
    // --- Добавление раздела в настройки ---
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        
        // Добавляем компонент
        Lampa.SettingsApi.addComponent({
            component: 'smart_filters',
            name: 'Smart Filters',
            icon: '🔖'
        });
        
        // Список фильтров
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'filters_list', type: 'info' },
            field: {
                name: 'Сохранённые фильтры',
                value: function() { return ''; }
            },
            onRender: function(element) {
                // Создаём контейнер для списка фильтров
                var container = $('<div class="smart-filters-list" style="margin-top: 0.5em;"></div>');
                element.find('.settings-param__value').append(container);
                updateSettingsPanel();
            }
        });
        
        // Кнопка очистки
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'clear_all_btn', type: 'button' },
            field: { name: '🗑️ Очистить все фильтры' },
            onChange: function() {
                clearAllFilters();
            }
        });
        
        // Информация о количестве
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'count_info', type: 'info' },
            field: {
                name: 'Всего фильтров',
                value: function() { return savedFilters.length + ' шт.'; }
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
        Lampa.Noty.show('Smart Filters загружен', 2000);
    }
    
    // --- Запуск ---
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', init);
    }
    
})();
