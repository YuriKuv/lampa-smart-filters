
```javascript
(function () {
    'use strict';

    var STORAGE_KEY = 'saved_filters_list';
    var POSITION_SAVE_KEY = 'bookmark_save_position';
    var POSITION_CLEAR_KEY = 'bookmark_clear_position';

    function showMsg(text) {
        if (window.Lampa && Lampa.Noty) Lampa.Noty.show(text);
    }

    // Замена prompt на системный ввод Lampa
    function showInput(placeholder, callback) {
        Lampa.Input.edit({
            title: 'Название закладки',
            value: placeholder,
            free: true,
            nosave: true
        }, function (new_value) {
            callback(new_value);
        }, function () {
            Lampa.Controller.toggle('content');
        });
    }

    function isRootSection(activity) {
        var rootActions = ['main', 'feed', 'movie', 'cartoon', 'tv', 'myperson', 'catalog', 'filter', 'relise', 'anime', 'favorite', 'history', 'subscribes', 'timetable', 'mytorrents', 'settings', 'about', 'console', 'edit'];
        return rootActions.indexOf(activity.url) !== -1;
    }

    function saveCurrentFilter() {
        var activity = Lampa.Activity.active();
        if (!activity || isRootSection(activity)) {
            showMsg('Нельзя сохранить этот раздел');
            return;
        }

        var defaultName = activity.title || 'Новая закладка';
        
        showInput(defaultName, function(name) {
            if (!name.trim()) return;
            
            var filters = Lampa.Storage.get(STORAGE_KEY, []);
            filters.push({
                id: Date.now(),
                name: name.trim(),
                url: activity.url,
                component: activity.component || 'category',
                source: activity.source || 'tmdb',
                genres: activity.genres,
                sort: activity.sort,
                page: 1
            });
            Lampa.Storage.set(STORAGE_KEY, filters);
            updateFiltersMenu();
            showMsg('Сохранено');
        });
    }

    // Использование встроенного Lampa.Select для меню
    function updateFiltersMenu() {
        $('.submenu-item').remove();
        var filters = Lampa.Storage.get(STORAGE_KEY, []);
        var mainList = $('.menu .menu__list').eq(0);

        filters.forEach(function (filter) {
            var item = $('<li class="menu__item selector submenu-item">...</li>');
            
            // В Lampa лучше использовать событие 'hover' для фокуса и 'click' для выбора
            item.on('hover:enter', function () {
                Lampa.Activity.push({
                    url: filter.url,
                    title: filter.name,
                    component: filter.component,
                    source: filter.source,
                    genres: filter.genres,
                    sort: filter.sort
                });
            });

            // Длительное нажатие для удаления (через ContextMenu Lampa)
            item.on('hover:long', function () {
                Lampa.Select.show({
                    title: 'Управление',
                    items: [{title: 'Удалить', value: 'del'}],
                    onSelect: function(a) {
                        if(a.value === 'del') {
                            var list = Lampa.Storage.get(STORAGE_KEY, []);
                            Lampa.Storage.set(STORAGE_KEY, list.filter(f => f.id !== filter.id));
                            updateFiltersMenu();
                        }
                    }
                });
            });

            mainList.append(item);
        });
    }

    function init() {
        addSettings();
        updateFiltersMenu();
    }

    // Ожидание готовности приложения
    if (window.appready) init();
    else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') init(); });
})();
