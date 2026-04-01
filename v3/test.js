(function() {
    'use strict';
    
    console.log('=== TEST: test.js loaded ===');
    
    window.TestPlugin = {
        init: function() {
            console.log('=== TEST: TestPlugin.init() called ===');
            
            // Пробуем добавить пункт в меню
            try {
                var menuHtml = '<div class="menu__item" data-name="test_plugin"><div class="menu__item-text">🔧 TEST PLUGIN</div></div>';
                $('.menu__list').append(menuHtml);
                console.log('=== TEST: Menu item added ===');
            } catch(e) {
                console.error('=== TEST: Error adding menu:', e);
            }
        }
    };
    
    console.log('=== TEST: TestPlugin created on window ===');
    
    // Автозапуск
    if (window.appready) {
        window.TestPlugin.init();
    } else {
        Lampa.Listener.follow('app', function() {
            window.TestPlugin.init();
        });
    }
    
})();
