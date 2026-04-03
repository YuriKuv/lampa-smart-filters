(function () {
    'use strict';

    console.log('[SaveFilter] Плагин запущен');

    var STORAGE_KEY = 'saved_filters_list';
    var pendingFilter = null;

    function showMsg(text) {
        console.log('[SaveFilter]', text);
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        }
    }

    // ==================== СОХРАНЕНИЕ ФИЛЬТРА ====================
    
    function saveFilter(name, activity) {
        var newFilter = {
            id: Date.now(),
            name: name,
            url: activity.url,
            title: activity.title || name,
            component: activity.component || 'category_full',
            source: activity.source || 'tmdb',
            card_type: activity.card_type !== undefined ? activity.card_type : true,
            page: activity.page || 1,
            params: activity.params || {}
        };
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        filters.push(newFilter);
        Lampa.Storage.set(STORAGE_KEY, filters);
        updateFiltersMenu();
        showMsg('Фильтр "' + name + '" сохранен');
    }

    // ==================== ОТКРЫТИЕ ШТАТНОГО ФИЛЬТРА ====================
    
    function openNativeFilter() {
        console.log('[SaveFilter] Открываем штатный фильтр');
        
        var filterMenuItem = $('.menu__item[data-action="filter"]');
        
        if (filterMenuItem.length) {
            filterMenuItem.trigger('click');
            console.log('[SaveFilter] Клик по пункту "Фильтр" отправлен');
            
            // Ищем кнопку "Начать поиск" и вешаем обработчик
            setTimeout(function() {
                hookSearchButton();
            }, 500);
        } else {
            showMsg('Пункт "Фильтр" не найден');
        }
    }

    // ==================== ПЕРЕХВАТ КНОПКИ "НАЧАТЬ ПОИСК" ====================
    
    function hookSearchButton() {
        // Ищем элемент "Начать поиск" в окне фильтрации
        var searchItem = $('.selectbox-item.selector:contains("Начать поиск")');
        
        if (searchItem.length) {
            console.log('[SaveFilter] Найден элемент "Начать поиск"');
            
            if (!searchItem.hasClass('search-hooked')) {
                searchItem.addClass('search-hooked');
                
                // Сохраняем оригинальный обработчик
                var oldClick = searchItem.data('events');
                
                // Добавляем свой обработчик
                searchItem.off('click').on('click', function(e) {
                    console.log('[SaveFilter] "Начать поиск" нажат');
                    
                    // Сохраняем текущий activity ДО применения фильтра
                    var beforeActivity = Lampa.Activity.active();
                    console.log('[SaveFilter] До применения:', beforeActivity ? beforeActivity.component : 'none');
                    
                    // Даем время на применение фильтра
                    setTimeout(function() {
                        var afterActivity = Lampa.Activity.active();
                        console.log('[SaveFilter] После применения:', afterActivity ? afterActivity.component : 'none');
                        
                        if (afterActivity && (afterActivity.component === 'category_full' || afterActivity.component === 'category')) {
                            Lampa.Input.show({
                                title: 'Сохранить фильтр',
                                placeholder: 'Введите название...',
                                onBack: function() {
                                    console.log('[SaveFilter] Отмена');
                                },
                                onEnter: function(name) {
                                    if (name && name.trim()) {
                                        saveFilter(name.trim(), afterActivity);
                                    } else {
                                        showMsg('Название не может быть пустым');
                                    }
                                }
                            });
                        } else {
                            console.log('[SaveFilter] Activity не найден, повтор через 1с');
                            setTimeout(arguments.callee, 1000);
                        }
                    }, 1500);
                });
            }
        } else {
            console.log('[SaveFilter] Элемент "Начать поиск" не найден');
            setTimeout(hookSearchButton, 500);
        }
    }

    // ==================== ОТКРЫТИЕ ФИЛЬТРА ====================
    
    function openFilter(filter) {
        console.log('[SaveFilter] Открываем фильтр:', filter);
        
        Lampa.Activity.push({
            url: filter.url,
            title: filter.name,
            component: filter.component || 'category_full',
            source: filter.source || 'tmdb',
            card_type: filter.card_type !== undefined ? filter.card_type : true,
            page: 1,
            params: filter.params || {}
        });
    }

    // ==================== УДАЛЕНИЕ ФИЛЬТРА ====================
    
    function deleteFilter(filterId, filterName) {
        Lampa.Select.show({
            title: 'Удалить фильтр?',
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
                    showMsg('Фильтр "' + filterName + '" удален');
                }
            }
        });
    }

    // ==================== МЕНЮ ====================
    
    function updateFiltersMenu() {
        $('.menu__item[data-action="saved_filters_section"]').remove();
        $('.menu__item[data-action="create_filter_btn"]').remove();
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        
        var createBtn = $(`
            <li class="menu__item selector" data-action="create_filter_btn">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="menu__text">Создать фильтр</div>
            </li>
        `);
        
        createBtn.on('click', function(e) {
            e.stopPropagation();
            openNativeFilter();
        });
        
        $('.menu .menu__list').first().append(createBtn);
        
        if (filters.length === 0) return;
        
        var section = $(`
            <li class="menu__item selector" data-action="saved_filters_section">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 6H20V8H4V6ZM6 11H18V13H6V11ZM10 16H14V18H10V16Z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="menu__text">Мои фильтры</div>
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
            
            submenu.append(item);
        });
        
        section.append(submenu);
        $('.menu .menu__list').first().append(section);
    }

    // ==================== ЗАПУСК ====================
    
    function init() {
        console.log('[SaveFilter] Инициализация');
        updateFiltersMenu();
        showMsg('Плагин загружен. Нажмите "Создать фильтр" в меню');
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
