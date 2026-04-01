console.log('[SmartFilters] Loading...');

(function() {
    'use strict';
    
    console.log('[SmartFilters] IIFE started');
    
    // Создаём плагин
    window.SmartFiltersPlugin = {
        init: function() {
            console.log('[SmartFilters] init() called');
            
            // Добавляем пункт в меню
            var menuHtml = '<div class="menu__item" data-name="smart_filters_menu"><div class="menu__item-text">🎯 Smart Filters</div></div>';
            var settingsItem = $('.menu__item[data-name="settings"]');
            
            if (settingsItem.length) {
                settingsItem.before(menuHtml);
                console.log('[SmartFilters] Menu added before settings');
            } else {
                $('.menu__list').append(menuHtml);
                console.log('[SmartFilters] Menu added at end');
            }
            
            // Показываем уведомление
            if (Lampa.Notify) {
                Lampa.Notify.show('Smart Filters готов к работе!', 2000);
            }
        }
    };
    
    console.log('[SmartFilters] Plugin object created');
    
    // Запускаем
    if (window.appready) {
        console.log('[SmartFilters] App ready, starting');
        window.SmartFiltersPlugin.init();
    } else {
        console.log('[SmartFilters] Waiting for app');
        Lampa.Listener.follow('app', function() {
            console.log('[SmartFilters] App event received');
            window.SmartFiltersPlugin.init();
        });
    }
    
})();

console.log('[SmartFilters] End of file');console.log('SMART-FILTERS: FILE LOADED SUCCESSFULLY!');
window.SmartFiltersPlugin = { test: true };
