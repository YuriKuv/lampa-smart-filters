
```javascript
(function () {
    'use strict';

    const STORAGE_KEY = 'saved_filters_list';
    const PLUGIN_NAME = 'BookmarksPlugin';
    
    // Проверяем доступность API
    function isLampaAvailable() {
        return window.Lampa && Lampa.Storage && Lampa.Activity;
    }
    
    function showMsg(text) {
        if (window.Lampa && Lampa.Noty) {
            Lampa.Noty.show(text);
        } else {
            console.log('[Bookmarks]', text);
        }
    }
    
    function showInput(placeholder, callback) {
        // Для Android TV используем встроенный Input Lampa
        if (Lampa.Input && Lampa.Input.edit) {
            Lampa.Input.edit({
                title: 'Название закладки',
                value: placeholder || '',
                free: true,
                nosave: true
            }, function (new_value) {
                if (callback && typeof callback === 'function') {
                    callback(new_value || '');
                }
            }, function () {
                if (Lampa.Controller && Lampa.Controller.toggle) {
                    Lampa.Controller.toggle('content');
                }
            });
        } else {
            // Fallback для браузеров
            const name = prompt('Название закладки:', placeholder || '');
            if (name !== null && callback) {
                callback(name);
            }
        }
    }
    
    function isRootSection(activity) {
        if (!activity || !activity.url) return true;
        
        const rootActions = [
            'main', 'feed', 'movie', 'cartoon', 'tv', 'myperson', 
            'catalog', 'filter', 'relise', 'anime', 'favorite', 
            'history', 'subscribes', 'timetable', 'mytorrents', 
            'settings', 'about', 'console', 'edit', 'search'
        ];
        return rootActions.includes(activity.url);
    }
    
    function getCurrentActivity() {
        if (!Lampa.Activity || !Lampa.Activity.active) return null;
        return Lampa.Activity.active();
    }
    
    function saveCurrentFilter() {
        if (!isLampaAvailable()) {
            showMsg('Lampa API недоступно');
            return;
        }
        
        const activity = getCurrentActivity();
        
        if (!activity || isRootSection(activity)) {
            showMsg('Нельзя сохранить этот раздел');
            return;
        }
        
        const defaultName = activity.title || 'Новая закладка';
        
        showInput(defaultName, function(name) {
            if (!name || !name.trim()) {
                showMsg('Название не может быть пустым');
                return;
            }
            
            try {
                const filters = Lampa.Storage.get(STORAGE_KEY, []);
                const newFilter = {
                    id: Date.now(),
                    name: name.trim(),
                    url: activity.url || '',
                    component: activity.component || 'category',
                    source: activity.source || 'tmdb',
                    genres: activity.genres || [],
                    sort: activity.sort || '',
                    page: activity.page || 1,
                    timestamp: Date.now()
                };
                
                // Проверяем на дубликаты
                const isDuplicate = filters.some(f => 
                    f.url === newFilter.url && 
                    JSON.stringify(f.genres) === JSON.stringify(newFilter.genres) &&
                    f.sort === newFilter.sort
                );
                
                if (isDuplicate) {
                    showMsg('Такая закладка уже существует');
                    return;
                }
                
                filters.push(newFilter);
                Lampa.Storage.set(STORAGE_KEY, filters);
                updateFiltersMenu();
                showMsg('Закладка сохранена: ' + name.trim());
            } catch (error) {
                console.error('[Bookmarks] Save error:', error);
                showMsg('Ошибка сохранения');
            }
        });
    }
    
    function loadFilter(filter) {
        if (!isLampaAvailable()) return;
        
        try {
            Lampa.Activity.push({
                url: filter.url,
                title: filter.name,
                component: filter.component || 'category',
                source: filter.source || 'tmdb',
                genres: filter.genres || [],
                sort: filter.sort || '',
                page: filter.page || 1
            });
        } catch (error) {
            console.error('[Bookmarks] Load error:', error);
            showMsg('Ошибка загрузки закладки');
        }
    }
    
    function deleteFilter(filterId) {
        try {
            const filters = Lampa.Storage.get(STORAGE_KEY, []);
            const updatedFilters = filters.filter(f => f.id !== filterId);
            Lampa.Storage.set(STORAGE_KEY, updatedFilters);
            updateFiltersMenu();
            showMsg('Закладка удалена');
        } catch (error) {
            console.error('[Bookmarks] Delete error:', error);
            showMsg('Ошибка удаления');
        }
    }
    
    function showDeleteConfirm(filter, callback) {
        if (Lampa.Select && Lampa.Select.show) {
            Lampa.Select.show({
                title: 'Удалить "' + filter.name + '"?',
                items: [
                    { title: 'Отмена', value: 'cancel' },
                    { title: 'Удалить', value: 'delete' }
                ],
                onSelect: function(selected) {
                    if (selected.value === 'delete' && callback) {
                        callback();
                    }
                }
            });
        } else {
            // Fallback для браузеров
            if (confirm('Удалить "' + filter.name + '"?')) {
                callback();
            }
        }
    }
    
    function createMenuItem(filter) {
        // Создаем элемент меню безопасным способом
        const li = document.createElement('li');
        li.className = 'menu__item selector bookmark-item';
        li.setAttribute('data-id', filter.id);
        li.setAttribute('data-name', filter.name);
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'menu__item-title';
        titleDiv.textContent = filter.name;
        
        li.appendChild(titleDiv);
        
        // Обработчики событий для Android TV
        li.addEventListener('click', function(e) {
            if (e.type === 'click' || (e.detail && e.detail.key === 'Enter')) {
                loadFilter(filter);
            }
        });
        
        // Долгое нажатие для удаления
        let longPressTimer;
        li.addEventListener('mousedown', function() {
            longPressTimer = setTimeout(function() {
                showDeleteConfirm(filter, function() {
                    deleteFilter(filter.id);
                });
            }, 1000);
        });
        
        li.addEventListener('mouseup', function() {
            clearTimeout(longPressTimer);
        });
        
        li.addEventListener('mouseleave', function() {
            clearTimeout(longPressTimer);
        });
        
        // Для TV remote control
        li.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                loadFilter(filter);
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                showDeleteConfirm(filter, function() {
                    deleteFilter(filter.id);
                });
            }
        });
        
        return li;
    }
    
    function updateFiltersMenu() {
        if (!isLampaAvailable()) return;
        
        try {
            // Удаляем старые элементы закладок
            const oldItems = document.querySelectorAll('.bookmark-item, .bookmarks-separator');
            oldItems.forEach(item => {
                if (item.parentNode) {
                    item.parentNode.removeChild(item);
                }
            });
            
            const filters = Lampa.Storage.get(STORAGE_KEY, []);
            if (filters.length === 0) return;
            
            // Ищем меню
            const menuList = document.querySelector('.menu .menu__list');
            if (!menuList) {
                // Пробуем найти меню позже
                setTimeout(updateFiltersMenu, 1000);
                return;
            }
            
            // Добавляем разделитель
            const separator = document.createElement('li');
            separator.className = 'menu__item menu__item--separator bookmarks-separator';
            const separatorTitle = document.createElement('div');
            separatorTitle.className = 'menu__item-title';
            separatorTitle.textContent = 'Закладки';
            separator.appendChild(separatorTitle);
            menuList.appendChild(separator);
            
            // Добавляем закладки
            filters.forEach(filter => {
                const menuItem = createMenuItem(filter);
                menuList.appendChild(menuItem);
            });
            
            // Обновляем фокус меню
            if (Lampa.Menu && Lampa.Menu.update) {
                Lampa.Menu.update();
            }
            
        } catch (error) {
            console.error('[Bookmarks] Menu update error:', error);
        }
    }
    
    function addMenuButton() {
        if (!isLampaAvailable()) return;
        
        try {
            // Добавляем кнопку в меню действий (три точки)
            if (Lampa.Menu && Lampa.Menu.add) {
                Lampa.Menu.add({
                    title: 'Сохранить закладку',
                    action: saveCurrentFilter,
                    group: 'bookmarks',
                    icon: 'bookmark'
                });
            }
            
            // Альтернативно добавляем в основное меню
            const menuObserver = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.addedNodes.length) {
                        const mainMenu = document.querySelector('.menu .menu__list');
                        if (mainMenu && !document.querySelector('.bookmark-save-btn')) {
                            const saveBtn = document.createElement('li');
                            saveBtn.className = 'menu__item selector bookmark-save-btn';
                            saveBtn.innerHTML = '<div class="menu__item-title">Сохранить закладку</div>';
                            
                            saveBtn.addEventListener('click', saveCurrentFilter);
                            saveBtn.addEventListener('keydown', function(e) {
                                if (e.key === 'Enter') saveCurrentFilter();
                            });
                            
                            // Вставляем после "Избранное" или в конец
                            const favoriteItem = document.querySelector('.menu__item[data-action="favorite"]');
                            if (favoriteItem && favoriteItem.parentNode === mainMenu) {
                                mainMenu.insertBefore(saveBtn, favoriteItem.nextSibling);
                            } else {
                                mainMenu.appendChild(saveBtn);
                            }
                        }
                    }
                });
            });
            
            // Начинаем наблюдение
            menuObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
            
        } catch (error) {
            console.error('[Bookmarks] Menu button error:', error);
        }
    }
    
    function init() {
        console.log('[Bookmarks] Initializing...');
        
        if (!isLampaAvailable()) {
            // Ждем загрузки Lampa
            const checkInterval = setInterval(function() {
                if (isLampaAvailable()) {
                    clearInterval(checkInterval);
                    startPlugin();
                }
            }, 1000);
            
            // Таймаут на случай если Lampa не загрузится
            setTimeout(function() {
                clearInterval(checkInterval);
                if (!isLampaAvailable()) {
                    console.error('[Bookmarks] Lampa not found');
                }
            }, 10000);
        } else {
            startPlugin();
        }
    }
    
    function startPlugin() {
        console.log('[Bookmarks] Starting plugin...');
        
        // Ждем полной загрузки DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(setupPlugin, 1000);
            });
        } else {
            setTimeout(setupPlugin, 1000);
        }
    }
    
    function setupPlugin() {
        try {
            addMenuButton();
            updateFiltersMenu();
            
            // Обновляем меню при изменении хранилища
            if (Lampa.Listener && Lampa.Listener.follow) {
                Lampa.Listener.follow('storage', function(e) {
                    if (e.key === STORAGE_KEY) {
                        updateFiltersMenu();
                    }
                });
            }
            
            // Обновляем меню при открытии меню
            document.addEventListener('menu:open', updateFiltersMenu);
            
            // Периодически проверяем наличие меню
            const menuCheckInterval = setInterval(function() {
                const menuList = document.querySelector('.menu .menu__list');
                if (menuList) {
                    updateFiltersMenu();
                }
            }, 5000);
            
            // Останавливаем проверку через 30 секунд
            setTimeout(function() {
                clearInterval(menuCheckInterval);
            }, 30000);
            
            console.log('[Bookmarks] Plugin initialized successfully');
            showMsg('Плагин закладок загружен');
            
        } catch (error) {
            console.error('[Bookmarks] Setup error:', error);
        }
    }
    
    // Запускаем плагин
    init();
    
    // Экспортируем API для отладки
    window.BookmarksPlugin = {
        save: saveCurrentFilter,
        updateMenu: updateFiltersMenu,
        getFilters: function() {
            return Lampa.Storage.get(STORAGE_KEY, []);
        },
        clearFilters: function() {
            Lampa.Storage.set(STORAGE_KEY, []);
            updateFiltersMenu();
            showMsg('Все закладки удалены');
        }
    };
    
})();
```

**Ключевые изменения для работы на Android TV:**

1. **Безопасное создание DOM элементов** - используем `document.createElement` вместо jQuery/`$()`
2. **Универсальные обработчики событий** - `addEventListener` вместо `.on()`
3. **Поддержка TV remote** - обработка клавиш `Enter`, `Delete`, `Backspace`
4. **Долгое нажатие** - реализовано через `setTimeout` для TV пультов
5. **MutationObserver** - для динамического обнаружения меню
6. **Проверки доступности API** - безопасные проверки всех методов Lampa
7. **Fallback-решения** - работают даже если некоторые API недоступны
8. **Интервальные проверки** - для TV где DOM может загружаться асинхронно
9. **Отладка** - консоль логи для отслеживания работы плагина

**Дополнительный CSS для стилизации (добавьте в начало скрипта или отдельно):**

```javascript
// Добавьте этот код в начало функции init() или setupPlugin()
const style = document.createElement('style');
style.textContent = `
    .bookmark-item .menu__item-title {
        color: #ff9800;
    }
    .bookmark-item:hover .menu__item-title,
    .bookmark-item:focus .menu__item-title {
        color: #ff5722;
    }
    .bookmarks-separator .menu__item-title {
        color: #888;
        font-size: 0.9em;
        opacity: 0.7;
    }
    .bookmark-save-btn .menu__item-title {
        color: #4caf50;
    }
`;
document.head.appendChild(style);
