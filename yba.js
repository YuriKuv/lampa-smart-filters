(function () {
    'use strict';

    console.log('[SaveFilter] Плагин запущен');

    var STORAGE_KEY = 'saved_filters_list';
    var POSITION_SAVE_KEY = 'bookmark_save_position';
    var POSITION_CLEAR_KEY = 'bookmark_clear_position';
    
    var isDialogOpen = false;
    var isSaving = false;

    function showMsg(text) {
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(text);
        } else {
            console.log('[SaveFilter]', text);
        }
    }

    // ==================== ДИАЛОГ ВВОДА ====================
    
    function showInputDialog(title, defaultValue, callback) {
        // Предотвращаем двойное открытие
        if (isDialogOpen) return;
        isDialogOpen = true;
        
        var isAndroid = Lampa.Platform && Lampa.Platform.is('android');
        
        // Для браузера используем стандартный prompt
        if (!isAndroid) {
            var result = prompt(title, defaultValue);
            isDialogOpen = false;
            if (result !== null && result.trim()) {
                callback(result.trim());
            } else if (result !== null) {
                showMsg('Название не может быть пустым');
                isDialogOpen = false;
                showInputDialog(title, defaultValue, callback);
            }
            return;
        }
        
        // Для Android TV создаем кастомный диалог
        var dialogId = 'custom_input_dialog_' + Date.now();
        
        var dialogHtml = `
            <div id="${dialogId}" style="
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
                <input type="text" id="input_field_${dialogId}" placeholder="${defaultValue}" value="${defaultValue}" style="
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
                    <div id="ok_btn_${dialogId}" class="selector" style="
                        flex: 1;
                        padding: 10px;
                        text-align: center;
                        background: #4CAF50;
                        border-radius: 6px;
                    ">✅ Сохранить</div>
                    <div id="cancel_btn_${dialogId}" class="selector" style="
                        flex: 1;
                        padding: 10px;
                        text-align: center;
                        background: #555;
                        border-radius: 6px;
                    ">❌ Отмена</div>
                </div>
            </div>
            <div id="overlay_${dialogId}" style="
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
        
        var dialog = $('#' + dialogId);
        var overlay = $('#overlay_' + dialogId);
        var inputField = $('#input_field_' + dialogId);
        
        setTimeout(function() {
            inputField.focus();
        }, 200);
        
        function closeDialog() {
            dialog.remove();
            overlay.remove();
            isDialogOpen = false;
        }
        
        $('#ok_btn_' + dialogId).on('hover:enter', function() {
            var value = inputField.val().trim();
            if (value) {
                closeDialog();
                callback(value);
            } else {
                showMsg('Название не может быть пустым');
                inputField.focus();
            }
        });
        
        $('#cancel_btn_' + dialogId).on('hover:enter', function() {
            closeDialog();
        });
        
        $('#ok_btn_' + dialogId).on('click', function() {
            var value = inputField.val().trim();
            if (value) {
                closeDialog();
                callback(value);
            } else {
                showMsg('Название не может быть пустым');
                inputField.focus();
            }
        });
        
        $('#cancel_btn_' + dialogId).on('click', function() {
            closeDialog();
        });
        
        inputField.on('keypress', function(e) {
            if (e.which === 13) {
                var value = inputField.val().trim();
                if (value) {
                    closeDialog();
                    callback(value);
                } else {
                    showMsg('Название не может быть пустым');
                }
            }
        });
        
        overlay.on('click', function() {
            closeDialog();
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

    // ==================== НОРМАЛИЗАЦИЯ URL ====================
    
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
        // Предотвращаем повторный вызов
        if (isSaving) return;
        isSaving = true;
        
        var activity = Lampa.Activity.active();
        if (!activity) {
            showMsg('Не удалось определить текущую страницу');
            isSaving = false;
            return;
        }
        
        var validComponents = ['category', 'category_full', 'serial', 'movie', 'cartoon', 'anime', 'tv', 'catalog'];
        if (!validComponents.includes(activity.component) && activity.component.indexOf('category') === -1) {
            showMsg('Откройте раздел с контентом');
            isSaving = false;
            return;
        }
        
        if (isRootSection(activity)) {
            showMsg('Нельзя сохранить основной раздел. Откройте подраздел через кнопку "Ещё" или примените фильтр');
            isSaving = false;
            return;
        }
        
        var defaultName = (activity.title || 'Моя закладка').replace(' - TMDB', '');
        
        showInputDialog('Сохранить закладку', defaultName, function(name) {
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
                isSaving = false;
                return;
            }
            filters.push(newFilter);
            Lampa.Storage.set(STORAGE_KEY, filters);
            updateFiltersMenu();
            showMsg('Закладка "' + name + '" сохранена');
            isSaving = false;
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
        
        saveButton.on('click', function(e) {
            e.stopPropagation();
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
        
        clearButton.on('click', function(e) {
            e.stopPropagation();
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
        
        bookmarkBtn.on('click', function(e) {
            e.stopPropagation();
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
        
        clearBtn.on('click', function(e) {
            e.stopPropagation();
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
