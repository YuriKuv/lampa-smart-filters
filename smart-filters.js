(function() {
    'use strict';
    
    var STORAGE_KEY = 'smart_filters_list';
    
    // Функция показа диалога ввода через Lampa.Input.edit
    function showInputDialog(title, defaultValue, callback) {
        Lampa.Input.edit({
            title: title,
            value: defaultValue,
            onEdit: function(value) {
                if (value && value.trim()) {
                    callback(value.trim());
                }
            }
        });
    }
    
    var plugin = {
        loadFilters: function() {
            return Lampa.Storage.get(STORAGE_KEY, []);
        },
        
        saveFilter: function(filter) {
            var filters = this.loadFilters();
            filters.push(filter);
            Lampa.Storage.set(STORAGE_KEY, filters);
            this.updateMenu();
            Lampa.Noty.show('Фильтр "' + filter.name + '" сохранен');
        },
        
        removeFilter: function(id) {
            var filters = this.loadFilters();
            var newFilters = [];
            for (var i = 0; i < filters.length; i++) {
                if (filters[i].id != id) newFilters.push(filters[i]);
            }
            Lampa.Storage.set(STORAGE_KEY, newFilters);
            this.updateMenu();
            Lampa.Noty.show('Фильтр удален');
        },
        
        getCurrentFilters: function() {
            var activity = Lampa.Activity.active();
            var filters = {
                id: Date.now(),
                name: "Мой фильтр",
                genres: null,
                yearFrom: null,
                yearTo: null
            };
            
            if (activity && activity.params) {
                // Сохраняем параметры напрямую из activity
                if (activity.params.genres) filters.genres = activity.params.genres;
                if (activity.params.year) filters.yearFrom = activity.params.year;
                
                // Также проверяем URL
                if (activity.url) {
                    var gMatch = activity.url.match(/with_genres=([0-9,]+)/);
                    if (gMatch && !filters.genres) filters.genres = gMatch[1];
                    
                    var yMatch = activity.url.match(/primary_release_date\.gte=([0-9]+)/);
                    if (yMatch) filters.yearFrom = yMatch[1];
                }
            }
            
            return filters;
        },
        
        openFilter: function(filter) {
            // Формируем параметры для Lampa.Activity.push
            var params = {
                component: 'category',
                source: 'tmdb',
                page: 1,
                card_type: true,
                title: filter.name
            };
            
            // Добавляем жанры если есть
            if (filter.genres) {
                params.genres = filter.genres;
            }
            
            // Добавляем год если есть
            if (filter.yearFrom) {
                params.year = filter.yearFrom;
            }
            
            // Формируем URL в зависимости от типа (по умолчанию фильмы)
            var url = 'discover/movie';
            params.url = url;
            
            console.log('Открываем фильтр с параметрами:', params);
            
            try {
                Lampa.Activity.push(params);
            } catch(e) {
                console.error('Ошибка открытия фильтра:', e);
                // Пробуем альтернативный способ
                Lampa.Activity.push({
                    url: 'discover/movie',
                    title: filter.name,
                    component: 'category',
                    source: 'tmdb',
                    page: 1
                });
            }
        },
        
        updateMenu: function() {
            $('.menu__item[data-smart-filter]').remove();
            
            var filters = this.loadFilters();
            if (!filters.length) return;
            
            var menuList = $('.menu .menu__list').eq(0);
            if (!menuList.length) {
                setTimeout(this.updateMenu.bind(this), 1000);
                return;
            }
            
            for (var i = 0; i < filters.length; i++) {
                var filter = filters[i];
                var self = this;
                
                var item = $(
                    '<li class="menu__item selector" data-smart-filter="' + filter.id + '">' +
                        '<div class="menu__ico">🔍</div>' +
                        '<div class="menu__text" style="flex:1;">' + (filter.name || 'Без названия') + '</div>' +
                        '<div class="menu__remove" style="width:30px;text-align:center;color:#ff5555;">✕</div>' +
                    '</li>'
                );
                
                item.on('hover:enter', function(e) {
                    if ($(e.target).hasClass('menu__remove')) return;
                    self.openFilter(filter);
                });
                
                item.find('.menu__remove').on('hover:enter', function(e) {
                    e.stopPropagation();
                    Lampa.Select.show({
                        title: 'Удалить фильтр?',
                        items: [{title:'Да',value:'yes'},{title:'Нет',value:'no'}],
                        onSelect: function(res) {
                            if (res.value === 'yes') self.removeFilter(filter.id);
                        }
                    });
                });
                
                menuList.append(item);
            }
        },
        
        showSaveDialog: function() {
            var current = this.getCurrentFilters();
            var self = this;
            showInputDialog('Название фильтра', current.name, function(name) {
                if (name && name.trim()) {
                    current.name = name.trim();
                    self.saveFilter(current);
                }
            });
        }
    };
    
    // Функция принудительного добавления кнопки
    function forceAddButton() {
        var actionsBar = document.querySelector('.head__actions');
        if (actionsBar && !document.querySelector('.smart-save-header')) {
            console.log('Нашел head__actions, добавляю кнопку');
            
            var saveBtn = document.createElement('div');
            saveBtn.className = 'head__action selector smart-save-header';
            saveBtn.style.marginRight = '15px';
            saveBtn.style.cursor = 'pointer';
            saveBtn.style.display = 'flex';
            saveBtn.style.alignItems = 'center';
            saveBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M4 4H20V20H4V4Z" stroke="currentColor" fill="none"/>
                    <path d="M8 8H16V10H8V8Z" fill="currentColor"/>
                    <path d="M8 12H14V14H8V12Z" fill="currentColor"/>
                </svg>
                <span style="margin-left:5px;">Сохранить фильтр</span>
            `;
            
            saveBtn.addEventListener('hover:enter', function() {
                plugin.showSaveDialog();
            });
            
            actionsBar.insertBefore(saveBtn, actionsBar.firstChild);
            console.log('Кнопка успешно добавлена!');
        } else if (!actionsBar) {
            setTimeout(forceAddButton, 500);
        }
    }
    
    // Запускаем добавление кнопки
    function initButton() {
        forceAddButton();
        
        var lastUrl = window.location.href;
        setInterval(function() {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                setTimeout(forceAddButton, 1000);
            }
        }, 500);
    }
    
    // Слушаем событие активности
    Lampa.Listener.follow('activity', function(e) {
        if (e.type === 'create') {
            setTimeout(forceAddButton, 1500);
        }
    });
    
    // Инициализация
    function init() {
        if (window.smart_filters_final) return;
        window.smart_filters_final = true;
        
        if (window.appready) {
            plugin.updateMenu();
            initButton();
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') {
                    plugin.updateMenu();
                    initButton();
                }
            });
        }
        console.log('Smart Filters Plugin v9 загружен');
    }
    
    init();
})();
