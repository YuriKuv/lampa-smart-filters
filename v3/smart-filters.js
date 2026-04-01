(function() {
    'use strict';
    
    console.log('[SmartFilters] File loaded - starting');
    
    // Простая проверка
    if (window.SmartFiltersPlugin && window.SmartFiltersPlugin.initialized) {
        console.log('[SmartFilters] Already initialized');
        return;
    }
    
    // Создаём объект плагина
    window.SmartFiltersPlugin = {
        initialized: false,
        
        init: function() {
            console.log('[SmartFilters] init() called');
            if (this.initialized) return;
            
            try {
                // Простое добавление пункта в меню для теста
                this.addMenuItem();
                
                this.initialized = true;
                console.log('[SmartFilters] Initialized!');
                
                if (Lampa.Notify) {
                    Lampa.Notify.show('Smart Filters загружен!', 2000);
                }
            } catch(e) {
                console.error('[SmartFilters] Error:', e);
            }
        },
        
        addMenuItem: function() {
            console.log('[SmartFilters] Adding menu item');
            
            // Проверяем, есть ли уже
            if ($('.menu__item[data-name="smart_filters_test"]').length) return;
            
            var menuHtml = '<div class="menu__item" data-name="smart_filters_test"><div class="menu__item-text">🎯 Smart Filters</div></div>';
            var settingsItem = $('.menu__item[data-name="settings"]');
            
            if (settingsItem.length) {
                settingsItem.before(menuHtml);
            } else {
                $('.menu__list').append(menuHtml);
            }
            
            console.log('[SmartFilters] Menu item added');
        }
    };
    
    // Автозапуск
    console.log('[SmartFilters] Setting up auto-start');
    
    if (typeof Lampa !== 'undefined') {
        if (window.appready) {
            window.SmartFiltersPlugin.init();
        } else {
            Lampa.Listener.follow('app', function() {
                window.SmartFiltersPlugin.init();
            });
        }
    } else {
        console.error('[SmartFilters] Lampa not found');
    }
    
})();
