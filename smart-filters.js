(function () {
    'use strict';

    console.log('[SaveFilter] Плагин запущен');

    var STORAGE_KEY = 'saved_filters_list';

    function showMsg(text) {
        console.log('[SaveFilter]', text);
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        }
    }

    // ==================== ОТКРЫТИЕ ШТАТНОГО ФИЛЬТРА ====================
    
    function openNativeFilter() {
        console.log('[SaveFilter] Открываем штатный фильтр из левого меню');
        
        var filterMenuItem = $('.menu__item[data-action="filter"]');
        
        if (filterMenuItem.length) {
            filterMenuItem.trigger('click');
            console.log('[SaveFilter] Клик по пункту "Фильтр" отправлен');
            
            setTimeout(function() {
                hookFilterApply();
            }, 500);
        } else {
            console.log('[SaveFilter] Пункт меню "Фильтр" не найден');
            showMsg('Пункт "Фильтр" не найден в меню');
        }
    }

    // ==================== ПЕРЕХВАТ КНОПКИ "НАЧАТЬ ПОИСК" ====================
    
    function hookFilterApply() {
        console.log('[SaveFilter] Поиск кнопки "Начать поиск"');
        
        var searchBtn = $('.selectbox__footer .selector:contains("Начать поиск"), .selectbox__footer .selector:contains("Применить")');
        
        if (searchBtn.length) {
            console.log('[SaveFilter] Кнопка найдена:', searchBtn.text());
            
            if (!searchBtn.hasClass('filter-save-hooked')) {
                searchBtn.addClass('filter-save-hooked');
                
                searchBtn.on('click', function() {
                    console.log('[SaveFilter] Кнопка "Начать поиск" нажата');
                    
                    setTimeout(function() {
                        var activity = Lampa.Activity.active();
                        console.log('[SaveFilter] Текущий activity:', activity.component, activity.url);
                        
                        if (activity && (activity.component === 'category_full' || activity.component === 'category')) {
                            Lampa.Input.show({
                                title: 'Сохранить фильтр',
                                placeholder: 'Введите название...',
                                onBack: function() {
                                    console.log('[SaveFilter] Отмена сохранения');
                                },
                                onEnter: function(name) {
                                    if (name && name.trim()) {
                                        saveFilter(name.trim(), activity);
                                    } else {
                                        showMsg('Название не может быть пустым');
                                    }
                                }
                            });
                        }
                    }, 1500);
                });
            }
        } else {
            setTimeout(hookFilterApply, 1000);
        }
    }

    // ==================== СОХРАНЕНИЕ ФИЛЬТРА ====================
    
    function saveFilter(name, activity) {
        var newFilter = {
            id: Date.now(),
            name: name,
            url: activity.url,
            title: activity.title,
            component: activity.component,
            source: activity.source || 'tmdb',
            card_type: activity.card_type || true,
            params: activity.params || {}
        };
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        filters.push(newFilter);
        Lampa.Storage.set(STORAGE_KEY, filters);
        updateFiltersMenu();
        showMsg('Фильтр "' + name + '" сохранен');
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
                    var newFilters = filters.filter(function(f) { 
                        return f.id != filterId; 
                    });
                    Lampa.Storage.set(STORAGE_KEY, newFilters);
                    updateFiltersMenu();
                    showMsg('Фильтр "' + filterName + '" удален');
                }
            }
        });
    }

    // ==================== МЕНЮ ====================
    
    function updateFiltersMenu() {
        console.log('[SaveFilter] Обновление меню');
        
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
