(function () {
    'use strict';

    console.log('[SaveFilter] Плагин запущен');

    var STORAGE_KEY = 'saved_filters_list';
    var POSITION_KEY = 'bookmark_button_position';

    function showMsg(text) {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        }
    }

    // ==================== НОРМАЛИЗАЦИЯ ====================
    
    function normalizeUrl(activity) {
        if (activity.url && activity.url.indexOf('discover/') === 0) return activity.url;
        if (activity.genres) {
            var type = (activity.url === 'tv' || activity.component === 'tv') ? 'tv' : 'movie';
            return 'discover/' + type + '?with_genres=' + activity.genres;
        }
        if (activity.sort) {
            var sortType = (activity.url === 'tv') ? 'tv' : 'movie';
            return 'discover/' + sortType + '?sort_by=' + activity.sort;
        }
        if (activity.url === 'movie') return 'discover/movie';
        if (activity.url === 'tv') return 'discover/tv';
        if (activity.url && activity.url.indexOf('keyword/') === 0) return activity.url;
        return activity.url;
    }

    function getDefaultName(activity) {
        if (activity.title) return activity.title.replace(' - TMDB', '');
        if (activity.genres === 16) return 'Мультфильмы';
        if (activity.genres === 28) return 'Боевики';
        if (activity.genres === 35) return 'Комедии';
        if (activity.genres === 27) return 'Ужасы';
        if (activity.genres === 18) return 'Драмы';
        if (activity.component === 'anime') return 'Аниме';
        if (activity.component === 'tv') return 'Сериалы';
        if (activity.url === 'movie') return 'Фильмы';
        return 'Моя закладка';
    }

    // ==================== СОХРАНЕНИЕ ====================
    
    function saveCurrentFilter() {
        var activity = Lampa.Activity.active();
        if (!activity) {
            showMsg('Не удалось определить текущую страницу');
            return;
        }
        var validComponents = ['category', 'category_full', 'serial', 'movie', 'cartoon', 'anime', 'tv', 'catalog'];
        if (!validComponents.includes(activity.component) && activity.component.indexOf('category') === -1) {
            showMsg('Откройте раздел с контентом');
            return;
        }
        var defaultName = getDefaultName(activity);
        var name = prompt('Введите название закладки:', defaultName);
        if (!name || !name.trim()) return;
        
        var newFilter = {
            id: Date.now(),
            name: name.trim(),
            url: normalizeUrl(activity),
            component: activity.component || 'category',
            source: activity.source || 'tmdb',
            card_type: true,
            page: 1
        };
        if (activity.genres) newFilter.genres = activity.genres;
        if (activity.sort) newFilter.sort = activity.sort;
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        filters.push(newFilter);
        Lampa.Storage.set(STORAGE_KEY, filters);
        updateFiltersMenu();
        showMsg('Закладка "' + name + '" сохранена');
    }

    // ==================== ОТКРЫТИЕ ====================
    
    function openFilter(filter) {
        var openParams = {
            url: filter.url,
            title: filter.name,
            component: filter.component || 'category',
            source: filter.source || 'tmdb',
            card_type: true,
            page: 1
        };
        if (filter.genres) openParams.genres = filter.genres;
        if (filter.sort) openParams.sort = filter.sort;
        Lampa.Activity.push(openParams);
    }

    // ==================== УДАЛЕНИЕ ====================
    
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

    function deleteAllFilters() {
        Lampa.Select.show({
            title: 'Удалить все закладки?',
            items: [
                { title: 'Да, удалить все', value: 'yes' },
                { title: 'Нет', value: 'no' }
            ],
            onSelect: function(item) {
                if (item.value === 'yes') {
                    Lampa.Storage.set(STORAGE_KEY, []);
                    updateFiltersMenu();
                    showMsg('Все закладки удалены');
                }
            }
        });
    }

    // ==================== КНОПКИ ====================
    
    var menuButton = null;
    
    function addButtonToMenu() {
        if (menuButton && menuButton.length) return;
        
        menuButton = $(`
            <li class="menu__item selector" data-action="save_filter_btn">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="menu__text">Сохранить закладку</div>
            </li>
        `);
        
        menuButton.on('click', function() {
            saveCurrentFilter();
        });
        
        var menuList = $('.menu .menu__list').first();
        menuList.append(menuButton);
    }

    function addButtonToHeader() {
        if ($('[data-action="save_bookmark_header"]').length) return;
        
        var bookmarkBtn = $(`
            <div class="head__action selector" data-action="save_bookmark_header" style="order: 10;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" fill="currentColor"/>
                </svg>
            </div>
        `);
        
        bookmarkBtn.on('click', function() {
            saveCurrentFilter();
        });
        
        $('.head__actions').append(bookmarkBtn);
    }

    function removeButtonFromMenu() {
        $('[data-action="save_filter_btn"]').remove();
        menuButton = null;
    }

    function removeButtonFromHeader() {
        $('[data-action="save_bookmark_header"]').remove();
    }

    function applyButtonPosition() {
        var position = Lampa.Storage.get(POSITION_KEY, 'menu');
        removeButtonFromMenu();
        removeButtonFromHeader();
        if (position === 'menu') {
            addButtonToMenu();
        } else if (position === 'header') {
            addButtonToHeader();
        }
    }

    // ==================== НАСТРОЙКИ ====================
    
    function addSettings() {
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: {
                name: 'bookmark_position',
                type: 'select',
                values: {
                    'menu': 'В левом меню',
                    'header': 'В верхней панели'
                },
                default: 'menu'
            },
            field: {
                name: 'Кнопка "Сохранить закладку"',
                description: 'Выберите расположение кнопки'
            },
            onChange: function(value) {
                Lampa.Storage.set(POSITION_KEY, value);
                applyButtonPosition();
            }
        });
        
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: {
                name: 'clear_all_bookmarks',
                type: 'trigger',
                default: false
            },
            field: {
                name: 'Удалить все закладки',
                description: 'Очистить список сохраненных закладок'
            },
            onChange: function(value) {
                if (value) {
                    deleteAllFilters();
                }
            }
        });
    }

    // ==================== ОБНОВЛЕНИЕ МЕНЮ ЗАКЛАДОК ====================
    
    function updateFiltersMenu() {
        $('.menu__item.submenu-item').remove();
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        if (filters.length === 0) return;
        
        var menuList = $('.menu .menu__list').first();
        
        filters.forEach(function(filter) {
            var item = $(`
                <li class="menu__item selector submenu-item" data-filter-id="${filter.id}">
                    <div class="menu__ico">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 6H20V8H4V6ZM6 11H18V13H6V11ZM10 16H14V18H10V16Z" fill="currentColor"/>
                        </svg>
                    </div>
                    <div class="menu__text" style="white-space: normal; line-height: 1.3; padding-right: 10px;">${filter.name}</div>
                </li>
            `);
            
            item.on('click', function(e) {
                e.stopPropagation();
                openFilter(filter);
            });
            
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
            
            item.on('v-click', function(e) {
                e.stopPropagation();
                deleteFilter(filter.id, filter.name);
            });
            
            menuList.append(item);
        });
    }

    // ==================== ЗАПУСК ====================
    
    function init() {
        console.log('[SaveFilter] Инициализация');
        applyButtonPosition();
        updateFiltersMenu();
        addSettings();
        showMsg('Плагин загружен. Настройки в разделе "Интерфейс"');
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
