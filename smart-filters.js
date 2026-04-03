(function () {
    'use strict';

    console.log('[SaveFilter] Плагин запущен');

    var STORAGE_KEY = 'saved_filters_list';

    function showMsg(text) {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        }
    }

    // ==================== НОРМАЛИЗАЦИЯ URL ====================
    
    function normalizeUrl(activity) {
        // Если URL уже содержит discover/ — оставляем как есть
        if (activity.url && activity.url.indexOf('discover/') === 0) {
            return activity.url;
        }
        
        // Если это раздел с жанрами (как Мультфильмы)
        if (activity.genres) {
            var type = 'movie';
            if (activity.url === 'tv' || activity.component === 'tv') {
                type = 'tv';
            }
            return 'discover/' + type + '?with_genres=' + activity.genres;
        }
        
        // Если это просто "movie" или "tv"
        if (activity.url === 'movie') {
            return 'discover/movie';
        }
        if (activity.url === 'tv') {
            return 'discover/tv';
        }
        
        // Если есть sort параметр
        if (activity.sort) {
            return 'discover/movie?sort_by=' + activity.sort;
        }
        
        return activity.url;
    }

    // ==================== СОХРАНЕНИЕ ЗАКЛАДКИ ====================
    
    function saveCurrentFilter() {
        var activity = Lampa.Activity.active();
        
        if (!activity) {
            showMsg('Не удалось определить текущую страницу');
            return;
        }
        
        // Проверяем, что это страница с контентом
        var validComponents = ['category', 'category_full', 'serial', 'movie', 'cartoon', 'anime', 'tv'];
        if (!validComponents.includes(activity.component) && activity.component.indexOf('category') === -1) {
            showMsg('Откройте раздел с контентом (Фильмы, Сериалы, Мультфильмы, Аниме)');
            return;
        }
        
        // Определяем название по умолчанию
        var defaultName = activity.title || 
                         (activity.genres === 16 ? 'Мультфильмы' :
                          activity.component === 'anime' ? 'Аниме' : 
                          activity.component === 'tv' ? 'Сериалы' : 'Моя закладка');
        
        var name = prompt('Введите название закладки:', defaultName);
        if (!name || !name.trim()) return;
        
        // Нормализуем URL для сохранения
        var normalizedUrl = normalizeUrl(activity);
        
        var newFilter = {
            id: Date.now(),
            name: name.trim(),
            url: normalizedUrl,
            original_url: activity.url, // сохраняем оригинал на всякий случай
            title: activity.title,
            component: activity.component || 'category',
            source: activity.source || 'tmdb',
            card_type: activity.card_type !== undefined ? activity.card_type : true,
            page: activity.page || 1
        };
        
        // Сохраняем жанры если есть
        if (activity.genres) {
            newFilter.genres = activity.genres;
        }
        
        // Сохраняем params если есть
        if (activity.params && Object.keys(activity.params).length > 0) {
            newFilter.params = activity.params;
        }
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        filters.push(newFilter);
        Lampa.Storage.set(STORAGE_KEY, filters);
        updateFiltersMenu();
        showMsg('Закладка "' + name + '" сохранена');
    }

    // ==================== ОТКРЫТИЕ ЗАКЛАДКИ ====================
    
    function openFilter(filter) {
        console.log('[SaveFilter] Открываем закладку:', filter);
        
        var openParams = {
            url: filter.url,
            title: filter.name,
            component: filter.component || 'category',
            source: filter.source || 'tmdb',
            card_type: filter.card_type !== undefined ? filter.card_type : true,
            page: filter.page || 1
        };
        
        // Добавляем жанры если есть
        if (filter.genres) {
            openParams.genres = filter.genres;
        }
        
        // Добавляем params если есть
        if (filter.params && Object.keys(filter.params).length > 0) {
            openParams.params = filter.params;
        }
        
        console.log('[SaveFilter] Параметры открытия:', openParams);
        Lampa.Activity.push(openParams);
    }

    // ==================== УДАЛЕНИЕ ЗАКЛАДКИ ====================
    
    function deleteFilter(filterId, filterName) {
        Lampa.Select.show({
            title: 'Удалить закладку?',
            items: [
                { title: 'Да', value: 'yes' },
                { title: 'Нет', value: 'no' }
            ],
            onSelect: function(item) {
                if (item.value === 'yes') {
                    var filters = Lampa.Storage.get(STORAGE_KEY, []);
                    var newFilters = filters.filter(function(f) { return f.id != filterId; });
                    Lampa.Storage.set(STORAGE_KEY, newFilters);
                    updateFiltersMenu();
                    showMsg('Закладка "' + filterName + '" удалена');
                }
            }
        });
    }

    // ==================== МЕНЮ ====================
    
    function updateFiltersMenu() {
        // Полностью удаляем ВСЕ наши пункты меню
        $('.menu__item[data-action="save_filter_btn"]').remove();
        $('.menu__item[data-action="saved_filters_section"]').remove();
        $('.submenu-item').remove();
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        
        // Кнопка сохранения текущей страницы
        var saveBtn = $(`
            <li class="menu__item selector" data-action="save_filter_btn">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="menu__text">Сохранить закладку</div>
            </li>
        `);
        
        saveBtn.on('click', function() {
            saveCurrentFilter();
        });
        
        $('.menu .menu__list').first().append(saveBtn);
        
        if (filters.length === 0) return;
        
        var section = $(`
            <li class="menu__item selector" data-action="saved_filters_section">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 6H20V8H4V6ZM6 11H18V13H6V11ZM10 16H14V18H10V16Z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="menu__text">Мои закладки</div>
            </li>
        `);
        
        var submenu = $('<div class="menu__submenu"></div>');
        
        filters.forEach(function(filter) {
            var item = $(`
                <div class="menu__item selector submenu-item" data-filter-id="${filter.id}">
                    <div class="menu__ico">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 6H20V8H4V6ZM6 11H18V13H6V11ZM10 16H14V18H10V16Z" fill="currentColor"/>
                        </svg>
                    </div>
                    <div class="menu__text">${filter.name}</div>
                </div>
            `);
            
            // Короткое нажатие — открытие
            item.on('click', function(e) {
                e.stopPropagation();
                openFilter(filter);
            });
            
            // Долгое нажатие — удаление
            var holdTimer = null;
            item.on('mousedown', function() {
                holdTimer = setTimeout(function() {
                    deleteFilter(filter.id, filter.name);
                    holdTimer = null;
                }, 800);
            }).on('mouseup mouseleave', function() {
                if (holdTimer) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }
            });
            
            // Событие для пульта
            item.on('v-click', function(e) {
                e.stopPropagation();
                deleteFilter(filter.id, filter.name);
            });
            
            submenu.append(item);
        });
        
        section.append(submenu);
        $('.menu .menu__list').first().append(section);
        
        console.log('[SaveFilter] Меню обновлено, закладок:', filters.length);
    }

    // ==================== ЗАПУСК ====================
    
    function init() {
        console.log('[SaveFilter] Инициализация');
        updateFiltersMenu();
        showMsg('Плагин загружен. Откройте любой раздел и нажмите "Сохранить закладку" в меню');
    }
    
    if (typeof Lampa !== 'undefined') {
        if (window.appready) {
            init();
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') init();
            });
        }
    }
})();
