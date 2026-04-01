// Простейший плагин для Lampa
(function() {
    'use strict';
    
    console.log('SIMPLE PLUGIN: started');
    
    // Флаг чтобы не добавлять дважды
    var isAdded = false;
    
    function addMenuItem() {
        // Проверяем, не добавлен ли уже
        if (isAdded) {
            console.log('SIMPLE PLUGIN: already added, skipping');
            return;
        }
        
        // Проверяем, существует ли уже пункт в DOM
        if ($('.menu__item[data-name="my_simple_plugin"]').length) {
            console.log('SIMPLE PLUGIN: menu item exists, skipping');
            return;
        }
        
        console.log('SIMPLE PLUGIN: adding menu item');
        
        // Создаём пункт меню
        var menuHtml = '<div class="menu__item" data-name="my_simple_plugin"><div class="menu__item-text">🔧 МОЙ ПЛАГИН</div></div>';
        
        // Добавляем в меню
        var settingsItem = $('.menu__item[data-name="settings"]');
        if (settingsItem.length) {
            settingsItem.before(menuHtml);
        } else {
            $('.menu__list').append(menuHtml);
        }
        
        isAdded = true;
        console.log('SIMPLE PLUGIN: menu item added');
        
        // Обработчик нажатия
        $(document).off('hover:enter', '.menu__item[data-name="my_simple_plugin"]');
        $(document).on('hover:enter', '.menu__item[data-name="my_simple_plugin"]', function() {
            console.log('SIMPLE PLUGIN: clicked!');
            alert('Плагин работает!');
        });
    }
    
    // Ждём готовность приложения
    if (window.appready) {
        setTimeout(addMenuItem, 1000);
    } else {
        Lampa.Listener.follow('app', function() {
            setTimeout(addMenuItem, 1000);
        });
    }
    
})();
