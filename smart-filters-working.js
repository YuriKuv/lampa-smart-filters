(function() {
    'use strict';
    
    // Защита от повторной загрузки
    if (window.SmartFiltersFinalWorking) return;
    window.SmartFiltersFinalWorking = true;
    
    console.log('[SmartFilters] Плагин загружается...');
    
    // --- Хранилище ---
    const STORAGE_KEY = 'smart_filters_saved';
    let savedFilters = [];
    
    // --- Загрузка ---
    function loadFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        savedFilters = Array.isArray(data) ? data : [];
        console.log('[SmartFilters] Загружено фильтров:', savedFilters.length);
        updateMenu();
    }
    
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
    }
    
    // --- Получение параметров фильтра из DOM ---
    function getCurrentFilterParams() {
        try {
            var params = {};
            
            // Тип
            var typeEl = $('.selectbox-item:contains("Тип") .selectbox-item__subtitle');
            if (typeEl.length && typeEl.text() !== 'Не выбрано') {
                params.type = typeEl.text();
            }
            
            // Рейтинг
            var ratingEl = $('.selectbox-item:contains("Рейтинг") .selectbox-item__subtitle');
            if (ratingEl.length && ratingEl.text() !== 'Не выбрано') {
                params.rating = ratingEl.text();
            }
            
            // Жанр
            var genreEl = $('.selectbox-item:contains("Жанр") .selectbox-item__subtitle');
            if (genreEl.length && genreEl.text() !== 'Не выбрано') {
                params.genre = genreEl.text();
            }
            
            // Язык оригинала (страна)
            var countryEl = $('.selectbox-item:contains("Язык оригинала") .selectbox-item__subtitle');
            if (countryEl.length && countryEl.text() !== 'Не выбрано') {
                params.country = countryEl.text();
            }
            
            // Год
            var yearEl = $('.selectbox-item:contains("Год") .selectbox-item__subtitle');
            if (yearEl.length && yearEl.text() !== 'Не выбрано') {
                params.year = yearEl.text();
            }
            
            console.log('[SmartFilters] Получены параметры:', params);
            return Object.keys(params).length > 0 ? params : null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            return null;
        }
    }
    
    // --- ПРИМЕНЕНИЕ ФИЛЬТРА (улучшенная версия) ---
    function applyFilter(params) {
        try {
            console.log('[SmartFilters] Применяем фильтр:', params);
            
            if (!params) return false;
            
            // Открываем панель фильтрации
            var filterMenuItem = $('.menu__item[data-action="filter"]');
            if (filterMenuItem.length) {
                filterMenuItem.trigger('hover:enter');
            }
            
            // Ждём открытия панели и устанавливаем значения
            setTimeout(function() {
                // Устанавливаем жанр
                if (params.genre && params.genre !== 'Не выбрано') {
                    var genreItem = $('.selectbox-item:contains("Жанр")');
                    if (genreItem.length) {
                        genreItem.trigger('hover:enter');
                        setTimeout(function() {
                            var targetGenre = $('.selectbox-item:contains("' + params.genre + '")').filter(function() {
                                return !$(this).text().includes('Жанр');
                            });
                            if (targetGenre.length) {
                                targetGenre.trigger('hover:enter');
                            }
                            // Возвращаемся
                            setTimeout(function() {
                                $('.selectbox__back, .head-backward').trigger('hover:enter');
                            }, 100);
                        }, 100);
                    }
                }
                
                // Устанавливаем год
                if (params.year && params.year !== 'Не выбрано') {
                    setTimeout(function() {
                        var yearItem = $('.selectbox-item:contains("Год")');
                        if (yearItem.length) {
                            yearItem.trigger('hover:enter');
                            setTimeout(function() {
                                var targetYear = $('.selectbox-item:contains("' + params.year + '")').filter(function() {
                                    return !$(this).text().includes('Год');
                                });
                                if (targetYear.length) {
                                    targetYear.trigger('hover:enter');
                                }
                                setTimeout(function() {
                                    $('.selectbox__back, .head-backward').trigger('hover:enter');
                                }, 100);
                            }, 100);
                        }
                    }, 200);
                }
                
                // Устанавливаем рейтинг
                if (params.rating && params.rating !== 'Не выбрано') {
                    setTimeout(function() {
                        var ratingItem = $('.selectbox-item:contains("Рейтинг")');
                        if (ratingItem.length) {
                            ratingItem.trigger('hover:enter');
                            setTimeout(function() {
                                var targetRating = $('.selectbox-item:contains("' + params.rating + '")').filter(function() {
                                    return !$(this).text().includes('Рейтинг');
                                });
                                if (targetRating.length) {
                                    targetRating.trigger('hover:enter');
                                }
                                setTimeout(function() {
                                    $('.selectbox__back, .head-backward').trigger('hover:enter');
                                }, 100);
                            }, 100);
                        }
                    }, 400);
                }
                
                // Устанавливаем страну
                if (params.country && params.country !== 'Не выбрано') {
                    setTimeout(function() {
                        var countryItem = $('.selectbox-item:contains("Язык оригинала")');
                        if (countryItem.length) {
                            countryItem.trigger('hover:enter');
                            setTimeout(function() {
                                var targetCountry = $('.selectbox-item:contains("' + params.country + '")').filter(function() {
                                    return !$(this).text().includes('Язык');
                                });
                                if (targetCountry.length) {
                                    targetCountry.trigger('hover:enter');
                                }
                                setTimeout(function() {
                                    $('.selectbox__back, .head-backward').trigger('hover:enter');
                                }, 100);
                            }, 100);
                        }
                    }, 600);
                }
                
                // После всех настроек, нажимаем "Начать поиск"
                setTimeout(function() {
                    var searchBtn = $('.selectbox-item:contains("Начать поиск")');
                    if (searchBtn.length) {
                        searchBtn.trigger('hover:enter');
                    }
                }, 1000);
                
            }, 100);
            
            Lampa.Noty.show('✓ Фильтр "' + (params.name || '') + '" применён', 2000);
            return true;
        } catch(e) {
            console.error('[SmartFilters] Ошибка применения:', e);
            return false;
        }
    }
    
    // --- Сохранение текущего фильтра ---
    function saveCurrentFilter() {
        var params = getCurrentFilterParams();
        
        if (!params) {
            Lampa.Noty.show('✗ Сначала выберите параметры в фильтре', 2000);
            return;
        }
        
        var name = prompt('Введите название фильтра:', 'Мой фильтр');
        if (name && name.trim()) {
            savedFilters.push({
                id: Date.now(),
                name: name.trim(),
                params: params,
                date: new Date().toLocaleString()
            });
            saveFilters();
            Lampa.Noty.show('✓ Фильтр "' + name + '" сохранён', 2000);
        }
    }
    
    // --- Удаление фильтра по ID ---
    function deleteFilterById(id) {
        savedFilters = savedFilters.filter(function(f) { return f.id != id; });
        saveFilters();
        Lampa.Noty.show('Фильтр удалён', 1000);
    }
    
    // --- Показать список фильтров с возможностью применения и удаления ---
    function showFiltersList() {
        if (savedFilters.length === 0) {
            Lampa.Noty.show('Нет сохранённых фильтров', 2000);
            return;
        }
        
        var items = [];
        for (var i = 0; i < savedFilters.length; i++) {
            items.push({
                title: savedFilters[i].name,
                subtitle: 'Сохранён: ' + savedFilters[i].date,
                filter: savedFilters[i]
            });
        }
        
        Lampa.Select.show({
            title: 'Мои фильтры',
            items: items,
            onSelect: function(item) {
                // Спрашиваем, применить или удалить
                Lampa.Select.show({
                    title: item.filter.name,
                    items: [
                        { title: '✓ Применить фильтр', action: 'apply' },
                        { title: '🗑️ Удалить фильтр', action: 'delete' }
                    ],
                    onSelect: function(choice) {
                        if (choice.action === 'apply') {
                            applyFilter(item.filter.params);
                        } else if (choice.action === 'delete') {
                            deleteFilterById(item.filter.id);
                        }
                    }
                });
            }
        });
    }
    
    // --- Очистка всех ---
    function clearAll() {
        Lampa.Select.show({
            title: 'Удалить все фильтры?',
            items: [{ title: 'Да' }, { title: 'Нет' }],
            onSelect: function(item) {
                if (item.title === 'Да') {
                    savedFilters = [];
                    saveFilters();
                    Lampa.Noty.show('Все фильтры удалены', 2000);
                }
            }
        });
    }
    
    // --- Обновление меню ---
    function updateMenu() {
        // Удаляем старые пункты
        $('.menu__item[data-name^="smart_filter_saved_"]').remove();
        
        // Находим пункт "Фильтр"
        var filterItem = $('.menu__item[data-action="filter"]');
        
        // Добавляем сохранённые фильтры после "Фильтр"
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-name="smart_filter_saved_' + filter.id + '">\
                <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg></div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
            </li>');
            
            if (filterItem.length) {
                filterItem.after(item);
            } else {
                $('.menu__list').append(item);
            }
            
            // Применение фильтра при нажатии
            item.on('hover:enter', function(e) {
                console.log('[SmartFilters] Выбран фильтр:', filter.name);
                applyFilter(filter.params);
            });
            
            // Удаление при долгом нажатии (контекстное меню)
            item.on('contextmenu', function(e) {
                e.preventDefault();
                Lampa.Select.show({
                    title: filter.name,
                    items: [
                        { title: '🗑️ Удалить фильтр', action: 'delete' },
                        { title: 'Отмена', action: 'cancel' }
                    ],
                    onSelect: function(choice) {
                        if (choice.action === 'delete') {
                            deleteFilterById(filter.id);
                        }
                    }
                });
                return false;
            });
        });
    }
    
    // --- Добавление основного пункта в меню ---
    function addMainMenuItem() {
        // Удаляем старый
        $('.menu__item[data-name="smart_filters_root"]').remove();
        
        var filterItem = $('.menu__item[data-action="filter"]');
        
        var mainItem = $('<li class="menu__item selector" data-name="smart_filters_root">\
            <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/></svg></div>\
            <div class="menu__text">📁 Мои фильтры</div>\
        </li>');
        
        if (filterItem.length) {
            filterItem.after(mainItem);
        } else {
            $('.menu__list').append(mainItem);
        }
        
        // Подменю
        mainItem.off('hover:enter').on('hover:enter', function() {
            $('.menu__submenu[data-parent="smart_filters_root"]').remove();
            
            var submenu = $('<div class="menu__submenu" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 180px;">\
                <div class="menu__submenu-item selector" data-action="save">💾 Сохранить текущий фильтр</div>\
                <div class="menu__submenu-item selector" data-action="list">📋 Мои фильтры</div>\
                <div class="menu__submenu-item selector" data-action="clear">🗑️ Очистить все</div>\
            </div>');
            
            $('body').append(submenu);
            
            submenu.find('[data-action="save"]').on('hover:enter', function() { saveCurrentFilter(); submenu.remove(); });
            submenu.find('[data-action="list"]').on('hover:enter', function() { showFiltersList(); submenu.remove(); });
            submenu.find('[data-action="clear"]').on('hover:enter', function() { clearAll(); submenu.remove(); });
        });
    }
    
    // --- Добавление кнопки в панель фильтра ---
    function addFilterButton() {
        var checkInterval = setInterval(function() {
            var selectboxBody = $('.selectbox__body');
            if (selectboxBody.length && !$('.smart-filter-save-btn').length) {
                var btn = $('<div class="selectbox-item selector smart-filter-save-btn" style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 0.5em;">\
                    <div class="selectbox-item__title">💾 Сохранить этот фильтр</div>\
                </div>');
                btn.on('hover:enter', function() {
                    saveCurrentFilter();
                });
                selectboxBody.append(btn);
                clearInterval(checkInterval);
                console.log('[SmartFilters] Кнопка сохранения добавлена');
            }
        }, 500);
    }
    
    // --- Добавление настроек ---
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        
        Lampa.SettingsApi.addComponent({
            component: 'smart_filters',
            name: 'Smart Filters',
            icon: '🔖'
        });
        
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'clear_all', type: 'button' },
            field: { name: 'Очистить все фильтры' },
            onChange: clearAll
        });
    }
    
    // --- Инициализация ---
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenuItem();
        addFilterButton();
        addSettings();
        console.log('[SmartFilters] Готов!');
        Lampa.Noty.show('Smart Filters загружен', 2000);
    }
    
    // --- Запуск ---
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', init);
    }
    
})();
