(function() {
    'use strict';
    
    // Защита от повторной загрузки
    if (window.SmartFiltersFinal) return;
    window.SmartFiltersFinal = true;
    
    console.log('[SmartFilters] Загрузка плагина...');
    
    // --- Хранилище ---
    const STORAGE_KEY = 'smart_filters_list';
    let savedFilters = [];
    
    // --- Загрузка фильтров ---
    function loadFilters() {
        var data = Lampa.Storage.get(STORAGE_KEY);
        savedFilters = Array.isArray(data) ? data : [];
        console.log('[SmartFilters] Загружено:', savedFilters.length);
    }
    
    // --- Сохранение ---
    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
    }
    
    // --- Получение текущих параметров фильтра (из исходного кода Lampa) ---
    function getCurrentFilterParams() {
        try {
            // Прямой доступ к параметрам фильтра через Controller
            if (Lampa.Controller && Lampa.Controller.filters && Lampa.Controller.filters.params) {
                var params = Lampa.Controller.filters.params;
                console.log('[SmartFilters] Текущие параметры:', params);
                return params;
            }
            
            // Альтернативный способ через компонент
            var filterComponent = Lampa.Component.find('filter');
            if (filterComponent && filterComponent.activity && filterComponent.activity.params) {
                return filterComponent.activity.params;
            }
            
            return null;
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            return null;
        }
    }
    
    // --- Применение фильтра (как в Lampa) ---
    function applyFilter(params) {
        try {
            if (!params) return;
            
            console.log('[SmartFilters] Применяем фильтр:', params);
            
            // Устанавливаем параметры
            if (Lampa.Controller && Lampa.Controller.filters) {
                Lampa.Controller.filters.setParams(params);
                
                // Обновляем UI фильтра
                if (Lampa.Controller.filters.update) {
                    Lampa.Controller.filters.update();
                }
                
                // Перезагружаем контент
                if (Lampa.Controller.filters.reload) {
                    Lampa.Controller.filters.reload();
                }
            }
            
            Lampa.Noty.show('✓ Фильтр применён', 1500);
        } catch(e) {
            console.error('[SmartFilters] Ошибка:', e);
            Lampa.Noty.show('Ошибка применения фильтра', 2000);
        }
    }
    
    // --- Сохранение ---
    function saveCurrentFilter() {
        var params = getCurrentFilterParams();
        
        if (!params || Object.keys(params).length === 0) {
            Lampa.Noty.show('✗ Сначала настройте фильтр', 2000);
            return;
        }
        
        // Модальное окно для ввода имени
        Lampa.Modal.open({
            title: 'Сохранить фильтр',
            html: '<div style="padding: 20px;"><input type="text" id="filter_name" placeholder="Название фильтра" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; color: #fff;"></div>',
            onSelect: function() {
                var name = $('#filter_name').val();
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
        });
    }
    
    // --- Показать список ---
    function showFiltersList() {
        if (savedFilters.length === 0) {
            Lampa.Noty.show('Нет сохранённых фильтров', 2000);
            return;
        }
        
        var items = savedFilters.map(function(f) {
            return { title: f.name, subtitle: f.date, filter: f };
        });
        
        Lampa.Select.show({
            title: 'Мои фильтры',
            items: items,
            onSelect: function(item) {
                applyFilter(item.filter.params);
            }
        });
    }
    
    // --- Очистка ---
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
        $('.menu__item[data-name^="smart_filter_"]').remove();
        
        // Находим пункт "Фильтр"
        var filterItem = $('.menu__item[data-name="filter"]');
        
        // Добавляем сохранённые фильтры
        savedFilters.forEach(function(filter) {
            var item = $('<li class="menu__item selector" data-name="smart_filter_' + filter.id + '">\
                <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg></div>\
                <div class="menu__text">🔖 ' + filter.name + '</div>\
                <div class="menu__item-icon menu__item-icon--delete">✖</div>\
            </li>');
            
            if (filterItem.length) {
                filterItem.after(item);
            } else {
                $('.menu__list').append(item);
            }
            
            item.on('hover:enter', function(e) {
                if ($(e.target).hasClass('menu__item-icon--delete')) return;
                applyFilter(filter.params);
            });
            
            item.find('.menu__item-icon--delete').on('hover:enter', function(e) {
                e.stopPropagation();
                savedFilters = savedFilters.filter(function(f) { return f.id !== filter.id; });
                saveFilters();
                Lampa.Noty.show('Фильтр удалён', 1000);
            });
        });
    }
    
    // --- ДОБАВЛЕНИЕ КНОПКИ В ПАНЕЛЬ ФИЛЬТРА (из исходного кода Lampa) ---
    function addSaveButton() {
        console.log('[SmartFilters] Добавление кнопки в панель фильтра...');
        
        // Используем событие из исходного кода Lampa
        Lampa.Listener.follow('filter', function(e) {
            if (e.type === 'create' || e.type === 'open' || e.type === 'render') {
                setTimeout(function() {
                    // Ищем контейнер кнопок (как в исходном коде Lampa)
                    var buttonsContainer = $('.filter-panel .buttons, .filter .buttons, .filter__buttons');
                    
                    if (buttonsContainer.length && !buttonsContainer.find('.smart-save-btn').length) {
                        var btn = $('<div class="button smart-save-btn selector" style="margin-left: 10px;">\
                            <div class="button__icon">💾</div>\
                            <div class="button__text">Сохранить</div>\
                        </div>');
                        
                        btn.on('hover:enter', function() {
                            saveCurrentFilter();
                        });
                        
                        buttonsContainer.append(btn);
                        console.log('[SmartFilters] Кнопка добавлена!');
                    }
                }, 200);
            }
        });
        
        // Также проверяем каждые 2 секунды
        var interval = setInterval(function() {
            var buttonsContainer = $('.filter-panel .buttons, .filter .buttons, .filter__buttons');
            if (buttonsContainer.length && !buttonsContainer.find('.smart-save-btn').length) {
                var btn = $('<div class="button smart-save-btn selector" style="margin-left: 10px;">\
                    <div class="button__icon">💾</div>\
                    <div class="button__text">Сохранить</div>\
                </div>');
                btn.on('hover:enter', saveCurrentFilter);
                buttonsContainer.append(btn);
                console.log('[SmartFilters] Кнопка добавлена (interval)');
                clearInterval(interval);
            }
        }, 1000);
    }
    
    // --- Добавление пункта в левое меню ---
    function addMainMenu() {
        var filterItem = $('.menu__item[data-name="filter"]');
        
        var mainItem = $('<li class="menu__item selector" data-name="smart_filters_menu">\
            <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/></svg></div>\
            <div class="menu__text">📁 Мои фильтры</div>\
        </li>');
        
        if (filterItem.length) {
            filterItem.after(mainItem);
        } else {
            $('.menu__list').append(mainItem);
        }
        
        mainItem.on('hover:enter', function() {
            $('.menu__submenu[data-parent="smart_filters_menu"]').remove();
            
            var submenu = $('<div class="menu__submenu" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 180px;">\
                <div class="menu__submenu-item selector" data-action="save">💾 Сохранить фильтр</div>\
                <div class="menu__submenu-item selector" data-action="list">📋 Мои фильтры</div>\
                <div class="menu__submenu-item selector" data-action="clear">🗑️ Очистить все</div>\
            </div>');
            
            $('body').append(submenu);
            
            submenu.find('[data-action="save"]').on('hover:enter', function() { saveCurrentFilter(); submenu.remove(); });
            submenu.find('[data-action="list"]').on('hover:enter', function() { showFiltersList(); submenu.remove(); });
            submenu.find('[data-action="clear"]').on('hover:enter', function() { clearAll(); submenu.remove(); });
        });
    }
    
    // --- Настройки ---
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
    
    // --- Запуск ---
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenu();
        addSaveButton();
        addSettings();
        updateMenu();
        console.log('[SmartFilters] Готов!');
        Lampa.Noty.show('Smart Filters загружен', 2000);
    }
    
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', init);
    }
    
})();
