(function () {
    'use strict';

    console.log('[MyFilters] Плагин запущен');

    function showMsg(text) {
        console.log('[MyFilters]', text);
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        } else {
            alert(text);
        }
    }

    // Функция открытия фильтра (РЕАЛЬНО ОТКРЫВАЕТ КАТЕГОРИЮ)
    function openFilter(filter) {
        console.log('[MyFilters] Открываем фильтр:', filter);
        
        // Формируем параметры для TMDB
        var url = "discover/movie"; // по умолчанию фильмы
        
        // Если в фильтре указан тип "tv" - открываем сериалы
        if (filter.type === "tv") {
            url = "discover/tv";
        }
        
        var params = [];
        params.push("sort_by=popularity.desc");
        params.push("language=ru-RU");
        
        // Добавляем жанры если есть
        if (filter.genres && filter.genres.length > 0) {
            params.push("with_genres=" + filter.genres.join(","));
        }
        
        // Добавляем язык если есть
        if (filter.language) {
            params.push("with_original_language=" + filter.language);
        }
        
        // Добавляем годы если есть
        if (filter.yearFrom) {
            var dateField = filter.type === "tv" ? "first_air_date.gte" : "primary_release_date.gte";
            params.push(dateField + "=" + filter.yearFrom + "-01-01");
        }
        if (filter.yearTo) {
            var dateFieldTo = filter.type === "tv" ? "first_air_date.lte" : "primary_release_date.lte";
            params.push(dateFieldTo + "=" + filter.yearTo + "-12-31");
        }
        
        var fullUrl = url + "?" + params.join("&");
        console.log('[MyFilters] URL:', fullUrl);
        
        // Открываем категорию
        Lampa.Activity.push({
            url: fullUrl,
            title: filter.name,
            component: "category",
            source: "tmdb",
            page: 1
        });
    }

    // Функция сохранения текущих параметров фильтрации
    function saveCurrentFilters(name) {
        // Пытаемся получить текущие параметры из URL или DOM
        var currentActivity = Lampa.Activity.active();
        var currentUrl = currentActivity ? currentActivity.url : "";
        
        var filterData = {
            id: Date.now(),
            name: name,
            date: new Date().toISOString(),
            type: "movie", // по умолчанию
            genres: [],
            language: null,
            yearFrom: null,
            yearTo: null
        };
        
        // Определяем тип контента из URL
        if (currentUrl.indexOf("discover/tv") !== -1 || currentUrl.indexOf("/tv/") !== -1) {
            filterData.type = "tv";
        }
        
        // Пробуем вытащить жанры из URL
        var genresMatch = currentUrl.match(/with_genres=([\d,]+)/);
        if (genresMatch) {
            filterData.genres = genresMatch[1].split(",").map(Number);
        }
        
        // Пробуем вытащить язык
        var langMatch = currentUrl.match(/with_original_language=([a-z]+)/);
        if (langMatch) {
            filterData.language = langMatch[1];
        }
        
        // Пробуем вытащить годы
        var yearFromMatch = currentUrl.match(/primary_release_date\.gte=(\d{4})/);
        if (yearFromMatch) filterData.yearFrom = parseInt(yearFromMatch[1]);
        
        var yearToMatch = currentUrl.match(/primary_release_date\.lte=(\d{4})/);
        if (yearToMatch) filterData.yearTo = parseInt(yearToMatch[1]);
        
        var saved = Lampa.Storage.get('my_filters_list', []);
        saved.push(filterData);
        Lampa.Storage.set('my_filters_list', saved);
        
        updateFiltersMenu();
        showMsg('Сохранено: ' + name);
    }

    // Обновление меню с сохраненными фильтрами
    function updateFiltersMenu() {
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
                <div class="menu__item selector submenu-item" data-filter-id="${filter.id}">
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
                    // ОТКРЫВАЕМ ФИЛЬТР
                    openFilter(filter);
                }
            });
            
            submenu.append(item);
        });
        
        section.append(submenu);
        $(".menu .menu__list").first().append(section);
    }

    // Кнопка в левом меню
    function addTestButton() {
        if ($('.menu__item[data-action="my_test_btn"]').length > 0) return;
        
        var btn = $(`
            <li class="menu__item selector" data-action="my_test_btn">
                <div class="menu__ico">🔧</div>
                <div class="menu__text">🔧 Мой плагин</div>
            </li>
        `);
        
        btn.on('click', function(e) {
            e.stopPropagation();
            showMsg('Плагин работает! Нажми "Сохранить" на экране фильмов');
        });
        
        $(".menu .menu__list").first().append(btn);
    }

    // Кнопка сохранения на экране фильмов
    function addSaveButton() {
        function tryAdd() {
            var container = $('.full-start__buttons, .full-start-new__buttons');
            if (container.length === 0) return false;
            
            if (container.find('[data-action="my_save_btn"]').length > 0) return true;
            
            var btn = $(`
                <div class="full-start__button selector" data-action="my_save_btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" fill="currentColor"/>
                    </svg>
                    <span>💾 Сохранить фильтр</span>
                </div>
            `);
            
            btn.on('click', function(e) {
                e.stopPropagation();
                var name = prompt('Введите название фильтра:', 'Мой фильтр');
                if (name) {
                    saveCurrentFilters(name);
                }
            });
            
            container.append(btn);
            console.log('[MyFilters] Кнопка сохранения добавлена');
            return true;
        }
        
        if (!tryAdd()) {
            Lampa.Listener.follow('activity', function(e) {
                if (e.type === 'create') {
                    setTimeout(tryAdd, 500);
                }
            });
        }
    }

    // Загрузка при старте
    function init() {
        console.log('[MyFilters] Инициализация');
        addTestButton();
        addSaveButton();
        updateFiltersMenu();
        showMsg('Плагин загружен');
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
