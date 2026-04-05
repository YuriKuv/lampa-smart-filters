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

    // ==================== ДИАЛОГ С ВВОДОМ ТЕКСТА ====================
    
    function showInputDialog(title, defaultName, callback) {
        // Пробуем использовать Lampa.Input (работает на Android TV)
        if (typeof Lampa !== 'undefined' && Lampa.Input && Lampa.Input.show) {
            Lampa.Input.show({
                title: title,
                placeholder: defaultName,
                value: defaultName,
                onBack: function() {
                    console.log('[SaveFilter] Диалог закрыт');
                },
                onEnter: function(value) {
                    if (value && value.trim()) {
                        callback(value.trim());
                    } else {
                        showMsg('Название не может быть пустым');
                        // Повторно открываем диалог
                        showInputDialog(title, defaultName, callback);
                    }
                }
            });
        } 
        // Альтернативный метод через Lampa.Select с keyboard
        else if (typeof Lampa !== 'undefined' && Lampa.Select) {
            Lampa.Select.show({
                title: title,
                items: [
                    { title: '📝 ' + (defaultName || 'Введите название'), value: 'input_field', keyboard: true },
                    { title: '✅ Сохранить', value: 'save' },
                    { title: '❌ Отмена', value: 'cancel' }
                ],
                onKeyboard: function(value) {
                    // Обновляем отображение при вводе
                    this.items[0].title = '📝 ' + (value || defaultName || 'Введите название');
                    this.update();
                    this.tempValue = value;
                },
                onSelect: function(item) {
                    if (item.value === 'save') {
                        var inputValue = this.tempValue || defaultName || '';
                        if (inputValue && inputValue.trim()) {
                            callback(inputValue.trim());
                        } else {
                            showMsg('Название не может быть пустым');
                        }
                    } else if (item.value === 'input_field') {
                        // Активируем клавиатуру
                        if (Lampa.Keyboard && Lampa.Keyboard.show) {
                            Lampa.Keyboard.show({
                                title: title,
                                value: defaultName || '',
                                onKey: function(value) {
                                    this.tempValue = value;
                                    this.items[0].title = '📝 ' + (value || defaultName || 'Введите название');
                                    this.update();
                                }.bind(this)
                            });
                        }
                    }
                }.bind(this),
                onBack: function() {
                    console.log('[SaveFilter] Диалог закрыт');
                }
            });
        }
        // Последний шанс - обычный prompt (для браузера)
        else {
            var result = prompt(title, defaultName);
            if (result && result.trim()) {
                callback(result.trim());
            } else if (result !== null) {
                showMsg('Название не может быть пустым');
                showInputDialog(title, defaultName, callback);
            }
        }
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
            if (activity.url === rootActions[i]) {
                return true;
            }
        }
        
        if (activity.component === 'category' && !activity.genres && !activity.sort) {
            if (activity.url === 'movie' || activity.url === 'tv') {
                return true;
            }
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
        console.log('[SaveFilter] saveCurrentFilter вызван');
        
        var activity = Lampa.Activity.active();
        if (!activity) {
            showMsg('Не удалось определить текущую страницу');
            return;
        }
        
        console.log('[SaveFilter] Текущий activity:', activity.component, activity.url);
        
        var validComponents = ['category', 'category_full', 'serial', 'movie', 'cartoon', 'anime', 'tv', 'catalog'];
        if (!validComponents.includes(activity.component) && activity.component.indexOf('category') === -1) {
            showMsg('Откройте раздел с контентом');
            return;
        }
        
        if (isRootSection(activity)) {
            showMsg('❌ Нельзя сохранить основной раздел.\n\n✅ Для создания закладки:\n• Откройте подраздел через кнопку "Ещё"\n• Или примените фильтр (жанры, годы, язык)');
            return;
        }
        
        var defaultName = getDefaultName(activity);
        
        showInputDialog('Сохранить закладку', defaultName, function(name) {
            console.log('[SaveFilter] Сохраняем закладку:', name);
            
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
            // Проверяем, нет ли уже такой закладки
            var exists = filters.some(function(f) { return f.name === name && f.url === newFilter.url; });
            if (exists) {
                showMsg('Закладка с таким названием уже существует');
                return;
            }
            filters.push(newFilter);
            Lampa.Storage.set(STORAGE_KEY, filters);
            updateFiltersMenu();
            showMsg('✓ Закладка "' + name + '" сохранена');
        });
    }

    // ==================== ОТКРЫТИЕ ====================
    
    function openFilter(filter) {
        console.log('[SaveFilter] Открываем закладку:', filter.name);
        
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
                    showMsg('✓ Все закладки удалены');
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
            console.log('[SaveFilter] Кнопка "Сохранить закладку" нажата');
            saveCurrentFilter();
        });
        
        saveButton.on('click', function() {
            console.log('[SaveFilter] Кнопка "Сохранить закладку" нажата (click)');
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
            console.log('[SaveFilter] Кнопка "Удалить все закладки" нажата');
            deleteAllFilters();
        });
        
        clearButton.on('click', function() {
            console.log('[SaveFilter] Кнопка "Удалить все закладки" нажата (click)');
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
            console.log('[SaveFilter] Кнопка (header) "Сохранить закладку" нажата');
            saveCurrentFilter();
        });
        
        bookmarkBtn.on('click', function() {
            console.log('[SaveFilter] Кнопка (header) "Сохранить закладку" нажата (click)');
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
            console.log('[SaveFilter] Кнопка (header) "Удалить все закладки" нажата');
            deleteAllFilters();
        });
        
        clearBtn.on('click', function() {
            console.log('[SaveFilter] Кнопка (header) "Удалить все закладки" нажата (click)');
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
            
            item.on('v-click', function(e) {
                e.stopPropagation();
                deleteFilter(filter.id, filter.name);
            });
            
            mainList.append(item);
        });
        
        console.log('[SaveFilter] Меню обновлено, закладок:', filters.length);
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
        showMsg('✓ Плагин загружен. Настройки в разделе "Интерфейс"');
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
