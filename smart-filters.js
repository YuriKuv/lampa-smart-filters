(function () {
    'use strict';

    console.log('[MyFilters] Плагин запущен');

    // Функция показа уведомлений
    function showMsg(text) {
        console.log('[MyFilters]', text);
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        } else {
            alert(text);
        }
    }

    // Добавление тестовой кнопки в меню
    function addTestButton() {
        // Проверяем, есть ли уже такая кнопка
        if ($('.menu__item[data-action="my_test_btn"]').length > 0) return;
        
        var btn = $(`
            <li class="menu__item selector" data-action="my_test_btn">
                <div class="menu__ico">🔧</div>
                <div class="menu__text">🔧 Мой плагин</div>
            </li>
        `);
        
        btn.on('click', function(e) {
            e.stopPropagation();
            showMsg('Плагин работает!');
        });
        
        // Добавляем в первое меню
        $(".menu .menu__list").first().append(btn);
        console.log('[MyFilters] Кнопка добавлена');
    }

    // Добавление кнопки сохранения на экран фильмов
    function addSaveButton() {
        // Функция поиска и добавления
        function tryAdd() {
            // Ищем контейнер с кнопками
            var container = $('.full-start__buttons, .full-start-new__buttons');
            if (container.length === 0) return false;
            
            // Проверяем, есть ли уже наша кнопка
            if (container.find('[data-action="my_save_btn"]').length > 0) return true;
            
            var btn = $(`
                <div class="full-start__button selector" data-action="my_save_btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" fill="currentColor"/>
                    </svg>
                    <span>💾 Сохранить</span>
                </div>
            `);
            
            btn.on('click', function(e) {
                e.stopPropagation();
                var name = prompt('Введите название фильтра:', 'Мой фильтр');
                if (name) {
                    // Сохраняем в Storage
                    var saved = Lampa.Storage.get('my_filters_list', []);
                    saved.push({
                        id: Date.now(),
                        name: name,
                        date: new Date().toISOString()
                    });
                    Lampa.Storage.set('my_filters_list', saved);
                    showMsg('Сохранено: ' + name);
                    
                    // Обновляем меню
                    updateFiltersMenu();
                }
            });
            
            container.append(btn);
            console.log('[MyFilters] Кнопка сохранения добавлена');
            return true;
        }
        
        // Пробуем добавить сразу
        if (!tryAdd()) {
            // Если не получилось, ждем загрузки экрана
            Lampa.Listener.follow('activity', function(e) {
                if (e.type === 'create') {
                    setTimeout(tryAdd, 500);
                }
            });
        }
    }

    // Обновление меню с сохраненными фильтрами
    function updateFiltersMenu() {
        // Удаляем старый раздел
        $('.menu__item[data-action="my_filters_section"]').remove();
        
        var filters = Lampa.Storage.get('my_filters_list', []);
        if (filters.length === 0) return;
        
        var section = $(`
            <li class="menu__item selector" data-action="my_filters_section">
                <div class="menu__ico">📁</div>
                <div class="menu__text">📁 Мои фильтры</div>
            </li>
        `);
        
        var submenu = $('<div class="menu__submenu"></div>');
        
        filters.forEach(function(filter) {
            var item = $(`
                <div class="menu__item selector submenu-item">
                    <div class="menu__ico">🔖</div>
                    <div class="menu__text">${filter.name}</div>
                    <div class="menu__delete" style="margin-left: auto; padding: 0 10px; color: red;">✕</div>
                </div>
            `);
            
            item.on('click', function(e) {
                if ($(e.target).hasClass('menu__delete')) {
                    e.stopPropagation();
                    var newFilters = filters.filter(function(f) { return f.id !== filter.id; });
                    Lampa.Storage.set('my_filters_list', newFilters);
                    updateFiltersMenu();
                    showMsg('Удалено: ' + filter.name);
                } else {
                    showMsg('Открываем: ' + filter.name);
                    // Здесь позже добавим открытие фильтра
                }
            });
            
            submenu.append(item);
        });
        
        section.append(submenu);
        $(".menu .menu__list").first().append(section);
    }

    // Загрузка сохраненных фильтров при старте
    function loadSavedFilters() {
        var saved = Lampa.Storage.get('my_filters_list', []);
        console.log('[MyFilters] Загружено фильтров:', saved.length);
        if (saved.length > 0) {
            updateFiltersMenu();
        }
    }

    // Запуск плагина
    function init() {
        console.log('[MyFilters] Инициализация');
        addTestButton();
        addSaveButton();
        loadSavedFilters();
        showMsg('Плагин загружен');
    }

    // Ждем готовности Lampa
    if (typeof Lampa !== 'undefined') {
        if (window.appready) {
            init();
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') init();
            });
        }
    } else {
        console.log('[MyFilters] Lampa не найдена');
    }
})();
