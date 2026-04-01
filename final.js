// SMART FILTERS PLUGIN - FINAL VERSION
console.log('=== SMART FILTERS: LOADING ===');

// Удаляем старый, если есть
if (window.SmartFiltersLoaded) {
    console.log('=== SMART FILTERS: Already loaded, skipping ===');
} else {
    window.SmartFiltersLoaded = true;
    
    // Функция добавления пункта в меню
    function addSmartFiltersMenu() {
        console.log('=== SMART FILTERS: Adding menu ===');
        
        // Удаляем дубликаты, если есть
        $('.menu__item[data-name="smart_filters_menu"]').remove();
        
        // Создаём пункт меню
        var menuItem = $('<div>', {
            class: 'menu__item',
            'data-name': 'smart_filters_menu',
            html: '<div class="menu__item-text">🎯 SMART FILTERS</div>'
        });
        
        // Добавляем перед настройками
        var settingsItem = $('.menu__item[data-name="settings"]');
        if (settingsItem.length) {
            settingsItem.before(menuItem);
        } else {
            $('.menu__list').append(menuItem);
        }
        
        // Обработчик нажатия
        menuItem.on('hover:enter', function() {
            console.log('=== SMART FILTERS: CLICKED ===');
            alert('🎯 SMART FILTERS РАБОТАЕТ!\n\nФункционал сохранения фильтров будет добавлен.');
        });
        
        console.log('=== SMART FILTERS: Menu added successfully ===');
    }
    
    // Запускаем через setTimeout, чтобы DOM точно загрузился
    setTimeout(function() {
        console.log('=== SMART FILTERS: Starting after delay ===');
        addSmartFiltersMenu();
    }, 2000);
    
    // Также запускаем при готовности Lampa
    if (typeof Lampa !== 'undefined' && Lampa.Listener) {
        Lampa.Listener.follow('app', function() {
            console.log('=== SMART FILTERS: App ready event ===');
            setTimeout(addSmartFiltersMenu, 1000);
        });
    }
}

console.log('=== SMART FILTERS: Loading complete ===');
