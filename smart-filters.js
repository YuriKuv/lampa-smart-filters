(function () {
    'use strict';

    console.log('[SaveFilter] Плагин запущен');

    var STORAGE_KEY = 'saved_filters_list';

    function showMsg(text) {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        }
    }

    // ==================== СОХРАНЕНИЕ ФИЛЬТРА ====================
    
    function saveCurrentFilter() {
        var activity = Lampa.Activity.active();
        
        if (!activity) {
            showMsg('Не удалось определить текущую страницу');
            return;
        }
        
        if (activity.component !== 'category_full' && activity.component !== 'category') {
            showMsg('Сначала примените фильтр в разделе Фильмы или Сериалы');
            return;
        }
        
        var name = prompt('Введите название фильтра:', activity.title || 'Мой фильтр');
        if (!name) return;
        
        var newFilter = {
            id: Date.now(),
            name: name,
            url: activity.url,
            title: activity.title,
            component: activity.component,
            source: activity.source || 'tmdb',
            card_type: true,
            page: 1
        };
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        filters.push(newFilter);
        Lampa.Storage.set(STORAGE_KEY, filters);
        updateFiltersMenu();
        showMsg('Фильтр "' + name + '" сохранен');
    }

    // ==================== ОТКРЫТИЕ ФИЛЬТРА ====================
    
    function openFilter(filter) {
        Lampa.Activity.push({
            url: filter.url,
            title: filter.name,
            component: filter.component || 'category_full',
            source: filter.source || 'tmdb',
            card_type: true,
            page: 1
        });
    }

    // ==================== УДАЛЕНИЕ ФИЛЬТРА ====================
    
    function deleteFilter(filterId, filterName) {
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        var newFilters = filters.filter(function(f) { return f.id != filterId; });
        Lampa.Storage.set(STORAGE_KEY, newFilters);
        updateFiltersMenu();
        showMsg('Фильтр "' + filterName + '" удален');
    }

    // ==================== МЕНЮ ====================
    
    function updateFiltersMenu() {
        $('.menu__item[data-action="saved_filters_section"]').remove();
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        
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
            
            submenu.append(item);
        });
        
        section.append(submenu);
        $('.menu .menu__list').first().append(section);
    }

    // ==================== ДОБАВЛЕНИЕ КНОПКИ СОХРАНЕНИЯ ====================
    
    function addSaveButton() {
        // Ищем контейнер с кнопками на экране категории
        var container = $('.full-start__buttons, .full-start-new__buttons');
        
        if (container.length && !container.find('[data-action="save_filter_btn"]').length) {
            var saveBtn = $(`
                <div class="full-start__button selector" data-action="save_filter_btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" fill="currentColor"/>
                    </svg>
                    <span>💾 Сохранить фильтр</span>
                </div>
            `);
            
            saveBtn.on('click', function(e) {
                e.stopPropagation();
                saveCurrentFilter();
            });
            
            container.append(saveBtn);
            console.log('[SaveFilter] Кнопка сохранения добавлена');
        }
    }

    // ==================== ЗАПУСК ====================
    
    function init() {
        console.log('[SaveFilter] Инициализация');
        updateFiltersMenu();
        
        // Добавляем кнопку на экран категории
        Lampa.Listener.follow('activity', function(e) {
            if (e.type === 'create' && (e.data.component === 'category' || e.data.component === 'category_full')) {
                setTimeout(addSaveButton, 500);
            }
        });
        
        showMsg('Плагин загружен. Кнопка "Сохранить фильтр" появится на экране фильмов/сериалов');
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
