```javascript
// Lampa Bookmarks Plugin
// Версия 2.0 - Кросс-платформенная
(function() {
    'use strict';
    
    console.log('[Bookmarks] Plugin loading...');
    
    // Ждем полной загрузки Lampa
    function waitForLampa(callback) {
        if (window.Lampa && window.Lampa.Storage) {
            callback();
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 30; // 30 секунд максимум
        
        const interval = setInterval(function() {
            attempts++;
            
            if (window.Lampa && window.Lampa.Storage) {
                clearInterval(interval);
                callback();
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                console.error('[Bookmarks] Lampa not found after', maxAttempts, 'seconds');
            }
        }, 1000);
    }
    
    // Основной код плагина
    function initPlugin() {
        console.log('[Bookmarks] Lampa found, initializing plugin...');
        
        const STORAGE_KEY = 'lampa_bookmarks_v2';
        let isInitialized = false;
        
        // Безопасный доступ к API
        function getStorage() {
            try {
                return Lampa.Storage.get(STORAGE_KEY, []);
            } catch (e) {
                console.error('[Bookmarks] Storage error:', e);
                return [];
            }
        }
        
        function setStorage(data) {
            try {
                Lampa.Storage.set(STORAGE_KEY, data);
                return true;
            } catch (e) {
                console.error('[Bookmarks] Storage set error:', e);
                return false;
            }
        }
        
        function showMessage(text) {
            try {
                if (Lampa.Noty && Lampa.Noty.show) {
                    Lampa.Noty.show(text);
                } else {
                    console.log('[Bookmarks]', text);
                }
            } catch (e) {
                console.log('[Bookmarks]', text);
            }
        }
        
        function showInputDialog(title, defaultValue, callback) {
            try {
                if (Lampa.Input && Lampa.Input.edit) {
                    Lampa.Input.edit({
                        title: title,
                        value: defaultValue || '',
                        free: true,
                        nosave: true
                    }, function(value) {
                        if (callback) callback(value || '');
                    });
                } else {
                    // Fallback для браузеров
                    const result = prompt(title, defaultValue || '');
                    if (callback) callback(result || '');
                }
            } catch (e) {
                console.error('[Bookmarks] Input error:', e);
                if (callback) callback(defaultValue || '');
            }
        }
        
        function getCurrentActivity() {
            try {
                if (Lampa.Activity && Lampa.Activity.active) {
                    return Lampa.Activity.active();
                }
                return null;
            } catch (e) {
                console.error('[Bookmarks] Activity error:', e);
                return null;
            }
        }
        
        function isSaveableActivity(activity) {
            if (!activity || !activity.url) return false;
            
            // Не сохраняем корневые разделы
            const nonSaveable = [
                'main', 'feed', 'catalog', 'search', 
                'settings', 'about', 'console', 'edit',
                'favorite', 'history', 'subscribes'
            ];
            
            return !nonSaveable.includes(activity.url);
        }
        
        // Основные функции
        function saveBookmark() {
            const activity = getCurrentActivity();
            
            if (!isSaveableActivity(activity)) {
                showMessage('Этот раздел нельзя сохранить как закладку');
                return;
            }
            
            const defaultName = activity.title || 'Без названия';
            
            showInputDialog('Название закладки', defaultName, function(name) {
                if (!name || !name.trim()) {
                    showMessage('Название не может быть пустым');
                    return;
                }
                
                const bookmarks = getStorage();
                const newBookmark = {
                    id: Date.now(),
                    name: name.trim(),
                    url: activity.url || '',
                    component: activity.component || 'category',
                    source: activity.source || 'tmdb',
                    genres: activity.genres || [],
                    sort: activity.sort || '',
                    page: activity.page || 1,
                    time: new Date().toLocaleString()
                };
                
                bookmarks.push(newBookmark);
                
                if (setStorage(bookmarks)) {
                    showMessage('Закладка сохранена: ' + name.trim());
                    updateBookmarksMenu();
                } else {
                    showMessage('Ошибка сохранения');
                }
            });
        }
        
        function loadBookmark(bookmark) {
            try {
                Lampa.Activity.push({
                    url: bookmark.url,
                    title: bookmark.name,
                    component: bookmark.component,
                    source: bookmark.source,
                    genres: bookmark.genres,
                    sort: bookmark.sort,
                    page: bookmark.page || 1
                });
            } catch (e) {
                console.error('[Bookmarks] Load error:', e);
                showMessage('Ошибка загрузки закладки');
            }
        }
        
        function deleteBookmark(bookmarkId) {
            const bookmarks = getStorage();
            const newBookmarks = bookmarks.filter(b => b.id !== bookmarkId);
            
            if (setStorage(newBookmarks)) {
                showMessage('Закладка удалена');
                updateBookmarksMenu();
            }
        }
        
        function confirmDelete(bookmark, callback) {
            try {
                if (Lampa.Select && Lampa.Select.show) {
                    Lampa.Select.show({
                        title: 'Удалить "' + bookmark.name + '"?',
                        items: [
                            { title: 'Отмена', value: 'cancel' },
                            { title: 'Удалить', value: 'delete' }
                        ],
                        onSelect: function(result) {
                            if (result.value === 'delete' && callback) {
                                callback();
                            }
                        }
                    });
                } else {
                    if (confirm('Удалить "' + bookmark.name + '"?')) {
                        if (callback) callback();
                    }
                }
            } catch (e) {
                console.error('[Bookmarks] Confirm error:', e);
                if (confirm('Удалить "' + bookmark.name + '"?')) {
                    if (callback) callback();
                }
            }
        }
        
        // Работа с меню
        function createBookmarkElement(bookmark) {
            const element = document.createElement('div');
            element.className = 'selector focusable';
            element.tabIndex = 0;
            element.setAttribute('data-id', bookmark.id);
            element.setAttribute('data-name', bookmark.name);
            
            element.innerHTML = `
                <div class="bookmark-item" style="
                    padding: 12px 16px;
                    display: flex;
                    align-items: center;
                    color: #fff;
                    font-size: 16px;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                ">
                    <span style="margin-right: 10px;">📌</span>
                    <span>${escapeHtml(bookmark.name)}</span>
                </div>
            `;
            
            // Обработчики событий
            element.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                loadBookmark(bookmark);
            });
            
            element.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    loadBookmark(bookmark);
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    confirmDelete(bookmark, function() {
                        deleteBookmark(bookmark.id);
                    });
                }
            });
            
            // Долгое нажатие для TV
            let longPressTimer;
            element.addEventListener('mousedown', function() {
                longPressTimer = setTimeout(function() {
                    confirmDelete(bookmark, function() {
                        deleteBookmark(bookmark.id);
                    });
                }, 1000);
            });
            
            element.addEventListener('mouseup', function() {
                clearTimeout(longPressTimer);
            });
            
            element.addEventListener('mouseleave', function() {
                clearTimeout(longPressTimer);
            });
            
            return element;
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function updateBookmarksMenu() {
            try {
                // Удаляем старое меню закладок
                const oldMenu = document.getElementById('bookmarks-menu-container');
                if (oldMenu && oldMenu.parentNode) {
                    oldMenu.parentNode.removeChild(oldMenu);
                }
                
                const bookmarks = getStorage();
                if (bookmarks.length === 0) return;
                
                // Ищем основное меню
                const mainMenu = document.querySelector('.menu__body, .menu-body, [class*="menu"]');
                if (!mainMenu) {
                    // Пробуем позже
                    setTimeout(updateBookmarksMenu, 1000);
                    return;
                }
                
                // Создаем контейнер для закладок
                const container = document.createElement('div');
                container.id = 'bookmarks-menu-container';
                container.style.cssText = `
                    margin-top: 20px;
                    padding: 0 16px;
                `;
                
                // Заголовок
                const title = document.createElement('div');
                title.textContent = '📚 Закладки';
                title.style.cssText = `
                    color: #888;
                    font-size: 14px;
                    margin-bottom: 10px;
                    padding-left: 16px;
                    opacity: 0.7;
                `;
                container.appendChild(title);
                
                // Добавляем закладки
                bookmarks.forEach(bookmark => {
                    container.appendChild(createBookmarkElement(bookmark));
                });
                
                // Вставляем в меню
                mainMenu.appendChild(container);
                
            } catch (e) {
                console.error('[Bookmarks] Menu update error:', e);
            }
        }
        
        function addSaveButton() {
            try {
                // Добавляем кнопку через API Lampa если доступно
                if (Lampa.Menu && Lampa.Menu.add) {
                    Lampa.Menu.add({
                        title: 'Сохранить закладку',
                        action: saveBookmark,
                        group: 'tools'
                    });
                    return true;
                }
                
                // Альтернативный способ - добавляем в DOM
                const observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        if (mutation.addedNodes.length) {
                            const actionMenu = document.querySelector('.actions-menu, .menu-actions, [class*="action"]');
                            if (actionMenu && !document.getElementById('bookmark-save-btn')) {
                                const button = document.createElement('div');
                                button.id = 'bookmark-save-btn';
                                button.className = 'selector focusable';
                                button.tabIndex = 0;
                                button.innerHTML = `
                                    <div style="padding: 12px 16px; color: #4CAF50; font-size: 16px;">
                                        💾 Сохранить закладку
                                    </div>
                                `;
                                
                                button.addEventListener('click', saveBookmark);
                                button.addEventListener('keydown', function(e) {
                                    if (e.key === 'Enter') saveBookmark();
                                });
                                
                                actionMenu.appendChild(button);
                            }
                        }
                    });
                });
                
                observer.observe(document.body, { childList: true, subtree: true });
                
                return true;
                
            } catch (e) {
                console.error('[Bookmarks] Button error:', e);
                return false;
            }
        }
        
        function injectStyles() {
            const styleId = 'bookmarks-plugin-styles';
            if (document.getElementById(styleId)) return;
            
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .bookmark-item:hover, 
                .bookmark-item:focus {
                    background-color: rgba(255, 152, 0, 0.1);
                }
                
                #bookmark-save-btn:hover,
                #bookmark-save-btn:focus {
                    background-color: rgba(76, 175, 80, 0.1);
                }
                
                .selector.focusable:focus {
                    outline: 2px solid #ff9800;
                    outline-offset: -2px;
                }
            `;
            
            document.head.appendChild(style);
        }
        
        // Инициализация
        function initialize() {
            if (isInitialized) return;
            
            console.log('[Bookmarks] Starting initialization...');
            
            injectStyles();
            addSaveButton();
            
            // Обновляем меню при открытии
            document.addEventListener('menu:open', updateBookmarksMenu);
            document.addEventListener('menu:show', updateBookmarksMenu);
            
            // Периодически проверяем и обновляем
            let checkCount = 0;
            const checkInterval = setInterval(function() {
                checkCount++;
                updateBookmarksMenu();
                
                if (checkCount >= 6) { // 30 секунд
                    clearInterval(checkInterval);
                }
            }, 5000);
            
            // Обновляем при изменении хранилища
            if (Lampa.Listener && Lampa.Listener.follow) {
                Lampa.Listener.follow('storage', function(e) {
                    if (e.key === STORAGE_KEY) {
                        updateBookmarksMenu();
                    }
                });
            }
            
            isInitialized = true;
            console.log('[Bookmarks] Plugin initialized successfully');
            showMessage('Плагин закладок активирован');
        }
        
        // Запускаем инициализацию после загрузки DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(initialize, 2000);
            });
        } else {
            setTimeout(initialize, 2000);
        }
        
        // Экспортируем API для отладки
        window.BookmarksAPI = {
            save: saveBookmark,
            list: getStorage,
            clear: function() {
                setStorage([]);
                updateBookmarksMenu();
                showMessage('Все закладки удалены');
            },
            refresh: updateBookmarksMenu
        };
    }
    
    // Запускаем плагин
    waitForLampa(initPlugin);
    
})();
```

**Упрощенная версия (если выше не работает):**

```javascript
// Минимальная версия плагина закладок для Lampa
try {
    console.log('Bookmarks plugin starting...');
    
    // Ждем Lampa
    const checkLampa = setInterval(() => {
        if (window.Lampa && Lampa.Storage) {
            clearInterval(checkLampa);
            startBookmarks();
        }
    }, 500);
    
    function startBookmarks() {
        const STORAGE_KEY = 'my_bookmarks';
        
        // Простая функция сохранения
        function saveBookmark() {
            try {
                const activity = Lampa.Activity.active();
                if (!activity || !activity.url) return;
                
                const name = prompt('Название закладки:', activity.title || 'Закладка');
                if (!name) return;
                
                const bookmarks = Lampa.Storage.get(STORAGE_KEY, []);
                bookmarks.push({
                    id: Date.now(),
                    name: name,
                    url: activity.url,
                    title: activity.title,
                    time: new Date().toLocaleString()
                });
                
                Lampa.Storage.set(STORAGE_KEY, bookmarks);
                
                if (Lampa.Noty) {
                    Lampa.Noty.show('Сохранено: ' + name);
                } else {
                    alert('Сохранено: ' + name);
                }
            } catch (e) {
                console.error('Bookmark save error:', e);
            }
        }
        
        // Добавляем кнопку в меню
        function addButton() {
            // Ищем меню и добавляем кнопку
            const observer = new MutationObserver(() => {
                const menu = document.querySelector('.menu__list, .menu-list');
                if (menu && !document.querySelector('#bookmark-btn')) {
                    const btn = document.createElement('li');
                    btn.id = 'bookmark-btn';
                    btn.innerHTML = '<div>💾 Сохранить закладку</div>';
                    btn.style.cssText = 'padding: 10px; color: #4CAF50;';
                    btn.onclick = saveBookmark;
                    menu.appendChild(btn);
                }
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
        }
        
        // Запускаем
        setTimeout(addButton, 2000);
        console.log('Bookmarks plugin loaded');
    }
    
    // Таймаут на случай ошибки
    setTimeout(() => {
        clearInterval(checkLampa);
    }, 10000);
    
} catch (e) {
    console.error('Bookmarks plugin fatal error:', e);
}
```

**Инструкция по установке:**

1. **Для Android TV через браузер:**
   - Откройте Lampa
   - Нажмите "Настройки" → "Консоль"
   - Вставьте код в консоль и нажмите Enter

2. **Для постоянной установки:**
   - Создайте файл `bookmarks.js` с кодом
   - Добавьте в `index.html` Lampa:
   ```html
   <script src="bookmarks.js"></script>
   ```

3. **Проверка работы:**
   - Откройте любой фильм или сериал
   - Нажмите "Меню" (три точки)
   - Должна появиться кнопка "Сохранить закладку"

**Если все еще возникает "Script error":**
1. Убедитесь что Lampa полностью загружена
2. Попробуйте добавить скрипт через `setTimeout`:
```javascript
setTimeout(function() {
    // Весь код плагина здесь
}, 5000);
```
