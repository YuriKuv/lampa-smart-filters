(function () {
    'use strict';

    console.log('[SaveFilter] Плагин запущен');

    var STORAGE_KEY = 'saved_filters_list';
    var POSITION_SAVE_KEY = 'bookmark_save_position';
    var POSITION_CLEAR_KEY = 'bookmark_clear_position';

    function showMsg(text) {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        } else {
            console.log('[SaveFilter]', text);
        }
    }

    // ==================== КАСТОМНЫЙ ДИАЛОГ С ПОЛЕМ ВВОДА ====================
    
    function showCustomInputDialog(title, placeholder, callback) {
        // Определяем платформу
        var isAndroid = Lampa.Platform && Lampa.Platform.is('android');
        
        // Создаем HTML диалог
        var dialogHtml = `
            <div id="custom_input_dialog" style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 85%;
                max-width: 500px;
                background: #1a1a2e;
                border-radius: 12px;
                z-index: 100000;
                color: white;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                padding: 20px;
            ">
                <div style="font-size: 20px; margin-bottom: 15px; text-align: center;">${title}</div>
                <input type="text" id="custom_input_field" placeholder="${placeholder}" value="${placeholder}" style="
                    width: 100%;
                    padding: 12px;
                    background: #2a2a3e;
                    color: white;
                    border: 2px solid #4CAF50;
                    border-radius: 8px;
                    font-size: 16px;
                    margin-bottom: 15px;
                    box-sizing: border-box;
                ">
                <div style="display: flex; gap: 10px;">
                    <div id="custom_input_ok" style="
                        flex: 1;
                        padding: 10px;
                        text-align: center;
                        background: #4CAF50;
                        border-radius: 6px;
                        cursor: pointer;
                    ">✅ Сохранить</div>
                    <div id="custom_input_cancel" style="
                        flex: 1;
                        padding: 10px;
                        text-align: center;
                        background: #555;
                        border-radius: 6px;
                        cursor: pointer;
                    ">❌ Отмена</div>
                </div>
            </div>
            <div id="custom_input_overlay" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                z-index: 99999;
            "></div>
        `;
        
        $('body').append(dialogHtml);
        
        var inputField = $('#custom_input_field');
        
        // Функция для фокуса на поле ввода
        function focusInput() {
            inputField.focus();
            // Для браузера выделяем текст
            if (!isAndroid) {
                inputField.select();
            }
        }
        
        // Задержка для правильной инициализации
        setTimeout(focusInput, 100);
        
        // Для браузера: обрабатываем клик по полю
        inputField.on('click', function() {
            focusInput();
        });
        
        // Обработчик OK
        $('#custom_input_ok').on('click', function() {
            var value = inputField.val().trim();
            if (value) {
                $('#custom_input_dialog, #custom_input_overlay').remove();
                callback(value);
            } else {
                showMsg('Название не может быть пустым');
                focusInput();
            }
        });
        
        // Обработчик Cancel
        $('#custom_input_cancel, #custom_input_overlay').on('click', function() {
            $('#custom_input_dialog, #custom_input_overlay').remove();
        });
        
        // Обработка нажатия Enter
        inputField.on('keypress', function(e) {
            if (e.which === 13) {
                $('#custom_input_ok').trigger('click');
            }
        });
        
        // Предотвращаем всплытие событий для диалога
        $('#custom_input_dialog').on('click', function(e) {
            e.stopPropagation();
        });
    }

    // ==================== ОПРЕДЕЛЕНИЕ ТИПА КОНТЕНТА ====================
    
    function getContentType(activity) {
        if (activity.component === 'tv') return 'сериалы';
        if (activity.component === 'cartoon') return 'мультфильмы';
        if (activity.component === 'anime') return 'аниме';
        if (activity.url && activity.url.indexOf('discover/tv') !== -1) return 'сериалы';
        if (activity.genres === 16) return 'мультфильмы';
        return 'фильмы';
    }

    // ==================== ПОЛУЧЕНИЕ ВСЕХ ПАРАМЕТРОВ ФИЛЬТРА ====================
    
    function getAllFilterParams(activity) {
        var url = activity.url || '';
        var params = {
            genres: [],
            year: null,
            yearFrom: null,
            yearTo: null,
            language: null
        };
        
        if (activity.genres) {
            params.genres = Array.isArray(activity.genres) ? activity.genres : [activity.genres];
        }
        var genreMatch = url.match(/with_genres=([\d,]+)/);
        if (genreMatch) {
            var ids = genreMatch[1].split(',').map(Number);
            for (var i = 0; i < ids.length; i++) {
                if (params.genres.indexOf(ids[i]) === -1) params.genres.push(ids[i]);
            }
        }
        
        var yearMatch = url.match(/(?:primary_release_year|air_date|first_air_date)[=:](\d{4})/);
        if (yearMatch) params.year = yearMatch[1];
        
        var yearFromMatch = url.match(/(?:primary_release_date|first_air_date)\.gte=(\d{4})/);
        var yearToMatch = url.match(/(?:primary_release_date|first_air_date)\.lte=(\d{4})/);
        if (yearFromMatch && yearToMatch) {
            params.yearFrom = yearFromMatch[1];
            params.yearTo = yearToMatch[1];
        }
        
        var langMatch = url.match(/with_original_language=([a-z]+)/);
        if (langMatch) params.language = langMatch[1];
        
        return params;
    }
    
    function getGenreNames(genreIds) {
        var genreMap = {
            28: 'Боевики', 12: 'Приключения', 16: 'Мультфильмы',
            35: 'Комедии', 80: 'Криминал', 99: 'Документальные',
            18: 'Драмы', 10751: 'Семейные', 14: 'Фэнтези',
            36: 'Исторические', 27: 'Ужасы', 10402: 'Музыкальные',
            9648: 'Детективы', 10749: 'Мелодрамы', 878: 'Фантастика',
            10770: 'ТВ фильмы', 53: 'Триллеры', 10752: 'Военные', 37: 'Вестерны'
        };
        if (!genreIds || genreIds.length === 0) return [];
        var names = [];
        for (var i = 0; i < genreIds.length; i++) {
            if (genreMap[genreIds[i]]) names.push(genreMap[genreIds[i]]);
        }
        return names;
    }
    
    function getLanguageName(code) {
        var langMap = {
            'ru': 'Русские', 'en': 'Английские', 'ja': 'Японские',
            'zh': 'Китайские', 'ko': 'Корейские', 'fr': 'Французские',
            'de': 'Немецкие', 'es': 'Испанские', 'it': 'Итальянские'
        };
        return langMap[code] || null;
    }

    // ==================== ГЕНЕРАЦИЯ НАЗВАНИЙ ====================
    
    function generateAllNames(activity) {
        var type = getContentType(activity);
        var params = getAllFilterParams(activity);
        var genreNames = getGenreNames(params.genres);
        var languageName = getLanguageName(params.language);
        var typeCapitalized = type.charAt(0).toUpperCase() + type.slice(1);
        
        var names = [];
        
        if (activity.title && activity.title !== 'Фильмы - TMDB' && activity.title !== 'Сериалы - TMDB') {
            var sectionName = activity.title.replace(' - TMDB', '');
            names.push(sectionName);
        }
        
        if (genreNames.length === 1) {
            names.push(genreNames[0]);
            names.push(genreNames[0] + ' ' + type);
            names.push('Лучшие ' + genreNames[0].toLowerCase());
            names.push('Популярные ' + genreNames[0].toLowerCase());
        } else if (genreNames.length >= 2) {
            names.push(genreNames.join(', '));
            names.push(genreNames.join(', ') + ' ' + type);
        }
        
        if (params.year) {
            names.push(typeCapitalized + ' ' + params.year);
            names.push('Новинки ' + params.year);
            if (genreNames.length === 1) {
                names.push(genreNames[0] + ' ' + params.year);
            }
        }
        
        if (params.yearFrom && params.yearTo) {
            var range = params.yearFrom + '–' + params.yearTo;
            names.push(typeCapitalized + ' ' + range);
            if (genreNames.length === 1) {
                names.push(genreNames[0] + ' ' + range);
            }
        }
        
        if (languageName) {
            names.push(languageName + ' ' + typeCapitalized);
            names.push(languageName);
            if (params.year) {
                names.push(languageName + ' ' + typeCapitalized + ' ' + params.year);
            }
            if (genreNames.length === 1) {
                names.push(languageName + ' ' + genreNames[0]);
            }
        }
        
        if (params.year && languageName && genreNames.length === 1) {
            names.push(languageName + ' ' + genreNames[0] + ' ' + params.year);
        }
        
        if (activity.url) {
            if (activity.url.indexOf('now_playing') !== -1) names.push('Сейчас в кино');
            if (activity.url.indexOf('popular') !== -1) names.push('Популярные ' + type);
            if (activity.url.indexOf('top_rated') !== -1) names.push('Лучшие ' + type);
        }
        
        var uniqueNames = [];
        for (var i = 0; i < names.length; i++) {
            if (uniqueNames.indexOf(names[i]) === -1 && names[i] && names[i].length < 60) {
                uniqueNames.push(names[i]);
            }
        }
        
        return uniqueNames.slice(0, 12);
    }

    // ==================== ДИАЛОГ ВЫБОРА ====================
    
    function showSelectionDialog(title, activity, callback) {
        var suggestions = generateAllNames(activity);
        var items = [];
        
        for (var i = 0; i < suggestions.length; i++) {
            items.push({ title: '📌 ' + suggestions[i], value: suggestions[i] });
        }
        
        items.push({ title: '──────────', value: 'separator', disabled: true });
        items.push({ title: '✏️ Ввести своё название', value: 'custom' });
        items.push({ title: '❌ Отмена', value: 'cancel' });
        
        Lampa.Select.show({
            title: title,
            items: items,
            onSelect: function(item) {
                if (item.value === 'cancel') return;
                if (item.value === 'custom') {
                    showCustomInputDialog(title, suggestions[0] || 'Моя закладка', callback);
                } else if (item.value !== 'separator') {
                    callback(item.value);
                }
            },
            onBack: function() {
                console.log('[SaveFilter] Диалог закрыт');
            }
        });
    }

    // ==================== ПРОВЕРКА КОРНЕВОГО РАЗДЕЛА ====================
    
    function isRootSection(activity) {
        var rootActions = [
            'main', 'feed', 'movie', 'cartoon', 'tv', 'myperson', 
            'catalog', 'filter', 'relise', 'anime', 'favorite', 
            'history', 'subscribes', 'timetable', 'mytorrents',
            'settings', 'about', 'console', 'edit'
        ];
        
        for (var i = 0; i < rootActions.length; i++) {
            if (activity.url === rootActions[i]) return true;
        }
        
        if (activity.component === 'category' && !activity.genres && !activity.sort) {
            if (activity.url === 'movie' || activity.url === 'tv') return true;
        }
        
        return false;
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
        return activity.url;
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
        
        if (isRootSection(activity)) {
            showMsg('Нельзя сохранить основной раздел. Откройте подраздел через кнопку "Ещё" или примените фильтр');
            return;
        }
        
        showSelectionDialog('Сохранить закладку', activity, function(name) {
            var newFilter = {
                id: Date.now(),
                name: name,
                url: normalizeUrl(activity),
                component: activity.component || 'category',
                source: activity.source || 'tmdb',
                card_type: true,
                page: 1
            };
            if (activity.genres) newFilter.genres = activity.genres;
            if (activity.sort) newFilter.sort = activity.sort;
            
            var filters = Lampa.Storage.get(STORAGE_KEY, []);
            var exists = filters.some(function(f) { return f.name === name && f.url === newFilter.url; });
            if (exists) {
                showMsg('Закладка с таким названием уже существует');
                return;
            }
            filters.push(newFilter);
            Lampa.Storage.set(STORAGE_KEY, filters);
            updateFiltersMenu();
            showMsg('Закладка "' + name + '" сохранена');
        });
    }

    // ==================== ОТКРЫТИЕ ====================
    
    function openFilter(filter) {
        Lampa.Activity.push({
            url: filter.url,
            title: filter.name,
            component: filter.component || 'category',
            source: filter.source || 'tmdb',
            card_type: true,
            page: 1,
            genres: filter.genres,
            sort: filter.sort
        });
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
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        if (filters.length === 0) {
            showMsg('Нет сохраненных закладок');
            return;
        }
        
        Lampa.Select.show({
            title: 'Удалить все закладки?',
            items: [
                { title: 'Да, удалить все (' + filters.length + ')', value: 'yes' },
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
    
    var saveButton = null;
    var clearButton = null;
    
    function addSaveButtonToMenu() {
        if (saveButton && saveButton.length) return;
        
        saveButton = $(`
            <li class="menu__item selector" data-action="save_filter_btn">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="menu__text">Сохранить закладку</div>
            </li>
        `);
        
        saveButton.on('hover:enter', function() {
            saveCurrentFilter();
        });
        
        saveButton.on('click', function() {
            saveCurrentFilter();
        });
        
        var settingsList = $('.menu .menu__list').eq(1);
        if (settingsList.length) {
            settingsList.prepend(saveButton);
        }
    }
    
    function addClearButtonToMenu() {
        if (clearButton && clearButton.length) return;
        
        clearButton = $(`
            <li class="menu__item selector" data-action="clear_all_bookmarks_btn">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="menu__text">Удалить все закладки</div>
            </li>
        `);
        
        clearButton.on('hover:enter', function() {
            deleteAllFilters();
        });
        
        clearButton.on('click', function() {
            deleteAllFilters();
        });
        
        var settingsList = $('.menu .menu__list').eq(1);
        if (settingsList.length) {
            if (saveButton && saveButton.length) {
                saveButton.after(clearButton);
            } else {
                settingsList.prepend(clearButton);
            }
        }
    }
    
    function addSaveButtonToHeader() {
        if ($('[data-action="save_bookmark_header"]').length) return;
        
        var bookmarkBtn = $(`
            <div class="head__action selector" data-action="save_bookmark_header" style="order: 10;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" fill="currentColor"/>
                </svg>
            </div>
        `);
        
        bookmarkBtn.on('hover:enter', function() {
            saveCurrentFilter();
        });
        
        bookmarkBtn.on('click', function() {
            saveCurrentFilter();
        });
        
        $('.head__actions').append(bookmarkBtn);
    }
    
    function addClearButtonToHeader() {
        if ($('[data-action="clear_bookmarks_header"]').length) return;
        
        var clearBtn = $(`
            <div class="head__action selector" data-action="clear_bookmarks_header" style="order: 11;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
                </svg>
            </div>
        `);
        
        clearBtn.on('hover:enter', function() {
            deleteAllFilters();
        });
        
        clearBtn.on('click', function() {
            deleteAllFilters();
        });
        
        $('.head__actions').append(clearBtn);
    }

    function removeButtonsFromMenu() {
        $('[data-action="save_filter_btn"]').remove();
        $('[data-action="clear_all_bookmarks_btn"]').remove();
        saveButton = null;
        clearButton = null;
    }

    function removeButtonsFromHeader() {
        $('[data-action="save_bookmark_header"]').remove();
        $('[data-action="clear_bookmarks_header"]').remove();
    }

    function applyButtonPositions() {
        var savePosition = Lampa.Storage.get(POSITION_SAVE_KEY, 'menu');
        var clearPosition = Lampa.Storage.get(POSITION_CLEAR_KEY, 'menu');
        
        removeButtonsFromMenu();
        removeButtonsFromHeader();
        
        if (savePosition === 'menu') {
            addSaveButtonToMenu();
        } else if (savePosition === 'header') {
            addSaveButtonToHeader();
        }
        
        if (clearPosition === 'menu') {
            addClearButtonToMenu();
        } else if (clearPosition === 'header') {
            addClearButtonToHeader();
        }
    }

    // ==================== ОБНОВЛЕНИЕ МЕНЮ ЗАКЛАДОК ====================
    
    function updateFiltersMenu() {
        $('.submenu-item').remove();
        
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        if (filters.length === 0) return;
        
        var mainList = $('.menu .menu__list').eq(0);
        if (!mainList.length) return;
        
        filters.forEach(function(filter) {
            var safeName = filter.name.replace(/[&<>]/g, function(m) {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return m;
            });
            
            var item = $(`
                <li class="menu__item selector submenu-item" data-filter-id="${filter.id}">
                    <div class="menu__ico">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 6H20V8H4V6ZM6 11H18V13H6V11ZM10 16H14V18H10V16Z" fill="currentColor"/>
                        </svg>
                    </div>
                    <div class="menu__text" style="white-space: normal; line-height: 1.3; padding-right: 10px;">${safeName}</div>
                </li>
            `);
            
            item.on('hover:enter', function(e) {
                e.stopPropagation();
                openFilter(filter);
            });
            
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
            
            mainList.append(item);
        });
    }

    // ==================== НАСТРОЙКИ ====================
    
    function addSettings() {
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: {
                name: 'bookmark_save_position',
                type: 'select',
                values: {
                    'menu': 'В левом меню (над Настройками)',
                    'header': 'В верхней панели'
                },
                default: 'menu'
            },
            field: {
                name: 'Кнопка "Сохранить закладку"',
                description: 'Выберите расположение кнопки'
            },
            onChange: function(value) {
                Lampa.Storage.set(POSITION_SAVE_KEY, value);
                applyButtonPositions();
            }
        });
        
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: {
                name: 'bookmark_clear_position',
                type: 'select',
                values: {
                    'menu': 'В левом меню (над Настройками)',
                    'header': 'В верхней панели'
                },
                default: 'menu'
            },
            field: {
                name: 'Кнопка "Удалить все закладки"',
                description: 'Выберите расположение кнопки'
            },
            onChange: function(value) {
                Lampa.Storage.set(POSITION_CLEAR_KEY, value);
                applyButtonPositions();
            }
        });
    }

    // ==================== ЗАПУСК ====================
    
    function init() {
        console.log('[SaveFilter] Инициализация');
        applyButtonPositions();
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
