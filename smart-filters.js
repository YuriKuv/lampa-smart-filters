(function () {
    'use strict';

    console.log('[SaveFilter] Плагин запущен');

    var STORAGE_KEY = 'saved_filters_list';

    function showMsg(text) {
        console.log('[SaveFilter]', text);
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        } else {
            alert(text);
        }
    }

    // ==================== СОХРАНЕНИЕ ТЕКУЩЕГО ФИЛЬТРА ====================
    
    function saveCurrentFilter() {
        var currentActivity = Lampa.Activity.active();
        if (!currentActivity) {
            showMsg('Не удалось определить текущую страницу');
            return;
        }
        
        if (currentActivity.component !== 'category_full' && currentActivity.component !== 'category') {
            showMsg('Откройте раздел Фильмы или Сериалы и примените фильтр');
            return;
        }
        
        var name = prompt('Введите название фильтра:', currentActivity.title || 'Мой фильтр');
        if (!name) return;
        
        var newFilter = {
            id: Date.now(),
            name: name,
            url: currentActivity.url,
            title: currentActivity.title,
            component: currentActivity.component,
            source: currentActivity.source || 'tmdb',
            card_type: currentActivity.card_type || true,
            params: currentActivity.params || {}
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
        console.log('[SaveFilter] deleteFilter вызван для:', filterId, filterName);
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        console.log('[SaveFilter] Было фильтров:', filters.length);
        
        var newFilters = filters.filter(function(f) { 
            return f.id != filterId; 
        });
        
        Lampa.Storage.set(STORAGE_KEY, newFilters);
        console.log('[SaveFilter] Стало фильтров:', newFilters.length);
        
        // Удаляем элементы из DOM напрямую
        $('.submenu-item[data-filter-id="' + filterId + '"]').remove();
        
        // Проверяем, остались ли еще фильтры
        var remainingFilters = Lampa.Storage.get(STORAGE_KEY, []);
        if (remainingFilters.length === 0) {
            // Если фильтров нет, удаляем весь раздел
            $('.menu__item[data-action="saved_filters_section"]').remove();
        }
        
        showMsg('Фильтр "' + filterName + '" удален');
    }
    // ==================== МЕНЮ ====================
    
    function updateFiltersMenu() {
        console.log('[SaveFilter] Обновление меню');
        
        // Удаляем старые пункты
        $('.menu__item[data-action="saved_filters_section"]').remove();
        $('.menu__item[data-action="save_current_filter"]').remove();
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        console.log('[SaveFilter] Найдено фильтров:', filters.length);
        
        // Кнопка сохранения текущего фильтра
        var saveBtn = $(`
            <li class="menu__item selector" data-action="save_current_filter">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="menu__text">Сохранить фильтр</div>
            </li>
        `);
        
        saveBtn.on('click', function(e) {
            e.stopPropagation();
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
                    <div class="menu__delete" style="margin-left: auto; padding: 0 10px;">✕</div>
                </div>
            `);
            
            // Обработчик для пункта фильтра
            item.on('click', function(e) {
                // Проверяем, кликнули ли на крестик
                if ($(e.target).hasClass('menu__delete') || $(e.target).parent().hasClass('menu__delete')) {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log('[SaveFilter] Удаляем фильтр:', filter.id, filter.name);
                    deleteFilter(filter.id, filter.name);
                    return false;
                }
                openFilter(filter);
                return false;
            });
            
            submenu.append(item);
        });
        
        section.append(submenu);
        
        var firstMenu = $('.menu .menu__list').first();
        firstMenu.append(section);
        
        console.log('[SaveFilter] Меню обновлено');
    }

    // ==================== ЗАПУСК ====================
    
    function init() {
        console.log('[SaveFilter] Инициализация');
        updateFiltersMenu();
        showMsg('Плагин загружен. Откройте фильтр и нажмите "Сохранить фильтр" в меню');
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
