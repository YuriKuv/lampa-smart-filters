// Простейший плагин для Lampa
(function() {
    console.log('SIMPLE PLUGIN: started');
    
    function addMenuItem() {
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
        
        console.log('SIMPLE PLUGIN: menu item added');
        
        // Обработчик нажатия
        $(document).on('hover:enter', '.menu__item[data-name="my_simple_plugin"]', function() {
            alert('Плагин работает!');
        });
    }
    
    // Ждём готовность приложения
    if (window.appready) {
        addMenuItem();
    } else {
        Lampa.Listener.follow('app', addMenuItem);
    }
    
})();
