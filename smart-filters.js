(function () {
    'use strict';

    console.log('[MyFilters] Скрипт начал выполнение');

    // Флаг, чтобы не добавлять дубли
    var isMenuBuilt = false;
    var isButtonAdded = false;

    // ==================== СОПОСТАВЛЕНИЯ ====================
    var GENRES_MAP = {
        "Боевик": 28, "Приключения": 12, "Мультфильм": 16, "Комедия": 35,
        "Криминал": 80, "Документальный": 99, "Драма": 18, "Семейный": 10751,
        "Фэнтези": 14, "История": 36, "Ужасы": 27, "Музыка": 10402,
        "Детектив": 9648, "Мелодрама": 10749, "Фантастика": 878,
        "Телевизионный фильм": 10770, "Триллер": 53, "Военный": 10752, "Вестерн": 37
    };

    function showNoty(text) {
        console.log('[MyFilters] Уведомление:', text);
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        } else {
            alert(text);
        }
    }

    function rebuildFiltersMenu() {
        console.log('[MyFilters] rebuildFiltersMenu вызван');
        
        // Удаляем только наши пункты меню (не все)
        $('.menu__item[data-action="my_filters_section"]').remove();
        $('.menu__item[data-action="test_filter"]').remove();
        
        var filters = Lampa.Storage.get('my_custom_filters', []);
        console.log('[MyFilters] Найдено фильтров:', filters.length);
        
        // Находим ОСНОВНОЕ меню (первое)
        var mainMenu = $(".menu .menu__list").first();
        if (!mainMenu.length) {
            mainMenu = $(".menu .menu__list").eq(0);
        }
        
        // Добавляем тестовую кнопку (только один раз)
        var testBtn = $(`
            <li class="menu__item selector" data-action="test_filter">
                <div class="menu__ico">🧪</div>
                <div class="menu__text">🧪 Тест плагина</div>
            </li>
        `);
        
        testBtn.on('click', function(e) {
            e.stopPropagation();
            console.log('[MyFilters] Тестовая кнопка нажата');
            showNoty('Плагин "Мои фильтры" работает!');
        });
        
        mainMenu.append(testBtn);
        
        // Если нет сохраненных фильтров — выходим
        if (filters.length === 0) return;
        
        // Создаем раздел "Мои фильтры"
        var section = $(`
            <li class="menu__item selector" data-action="my_filters_section">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 6H20V8H4V6ZM6 11H18V13H6V11ZM10 16H14V18H10V16Z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="menu__text">⭐ Мои фильтры</div>
            </li>
        `);
        
        var submenu = $('<div class="menu__submenu"></div>');
        
        filters.forEach(function(filter) {
            var filterItem = $(`
                <div class="menu__item selector submenu-item" data-filter-id="${filter.id}">
                    <div class="menu__ico">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10 4H4C2.9 4 2 4.9 2 6V10C2 11.1 2.9 12 4 12H10C11.1 12 12 11.1 12 10V6C12 4.9 11.1 4 10 4Z" fill="currentColor"/>
                        </svg>
                    </div>
                    <div class="menu__text">${filter.name}</div>
                    <div class="menu__delete" style="margin-left: auto; padding: 0 10px; color: #ff5555;">✕</div>
                </div>
            `);
            
            filterItem.on('click', function(e) {
                if ($(e.target).hasClass('menu__delete')) {
                    e.stopPropagation();
                    if (confirm('Удалить фильтр "' + filter.name + '"?')) {
                        var newFilters = Lampa.Storage.get('my_custom_filters', []).filter(function(f) { return f.id !== filter.id; });
                        Lampa.Storage.set('my_custom_filters', newFilters);
                        rebuildFiltersMenu();
                        showNoty('Фильтр удален');
                    }
                    return;
                }
                showNoty('Открываем: ' + filter.name);
                console.log('[MyFilters] Открываем фильтр:', filter);
            });
            
            submenu.append(filterItem);
        });
        
        section.append(submenu);
        mainMenu.append(section);
    }

    function addSaveFilterButton() {
        if (isButtonAdded) return;
        
        console.log('[MyFilters] addSaveFilterButton вызван');
        
        var buttonHtml = `
            <div class="full-start__button selector" data-action="save_filter" style="order: 10;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" fill="currentColor"/>
                </svg>
                <span>💾 Сохранить фильтр</span>
            </div>
        `;
        
        var button = $(buttonHtml);
        
        button.on('click', function(e) {
            e.stopPropagation();
            console.log('[MyFilters] Кнопка сохранения нажата');
            
            var filterName = prompt("Введите название фильтра:", "Мой фильтр");
            if (filterName && filterName.trim()) {
                var newFilter = {
                    id: Date.now().toString(),
                    name: filterName.trim(),
                    type: "movie",
                    genres: [],
                    language: null,
                    yearFrom: 2000,
                    yearTo: 2025,
                    created: new Date().toISOString()
                };
                
                var filters = Lampa.Storage.get('my_custom_filters', []);
                filters.push(newFilter);
                Lampa.Storage.set('my_custom_filters', filters);
                rebuildFiltersMenu();
                showNoty('Фильтр "' + filterName + '" сохранен');
            }
        });
        
        // Функция поиска контейнера для кнопки
        function findAndAppend() {
            // Ищем контейнер с кнопками на активном экране
            var container = $('.full-start__buttons, .full-start-new__buttons, .info__actions');
            
            if (container.length && container.find('[data-action="save_filter"]').length === 0) {
                container.append(button);
                isButtonAdded = true;
                console.log('[MyFilters] Кнопка сохранения добавлена');
                return true;
            }
            return false;
        }
        
        // Пробуем добавить сразу
        if (!findAndAppend()) {
            // Если не получилось, ждем открытия экрана категории
            Lampa.Listener.follow('activity', function(e) {
                if (e.type === 'create') {
                    setTimeout(function() {
                        findAndAppend();
                    }, 500);
                }
            });
        }
    }

    // ==================== ЗАПУСК ====================
    
    function startPlugin() {
        console.log('[MyFilters] startPlugin вызван');
        if (window.my_filters_plugin_loaded) return;
        window.my_filters_plugin_loaded = true;
        
        rebuildFiltersMenu();
        addSaveFilterButton();
        
        console.log('[MyFilters] Плагин загружен');
    }
    
    // Запуск
    if (typeof Lampa !== 'undefined' && Lampa) {
        if (window.appready === true) {
            startPlugin();
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') startPlugin();
            });
            setTimeout(startPlugin, 3000);
        }
    } else {
        console.log('[MyFilters] Lampa не найдена');
    }
})();
