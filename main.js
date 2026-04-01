(function() {
    'use strict';
    
    const PLUGIN_ID = 'smart-filters';
    const PLUGIN_VERSION = '1.0.0';
    
    function start() {
        // Определяем версию Lampa
        let version = 'v3';
        if (Lampa.Manifest.app_digital && Lampa.Manifest.app_digital < 3.0) {
            version = 'v2';
        }
        
        // Загружаем стили (опционально)
        const cssUrl = `https://YuriKuv.github.io/lampa-smart-filters/styles.css`;
        if (!document.querySelector(`link[href="${cssUrl}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssUrl;
            document.head.appendChild(link);
        }
        
        // Загружаем основной файл плагина
        let scriptUrl = `https://YuriKuv.github.io/lampa-smart-filters/${version}/smart-filters.js`;
        
        Lampa.Utils.putScriptAsync(scriptUrl, function() {
            console.log(`[${PLUGIN_ID}] v${PLUGIN_VERSION} loaded successfully`);
            
            // Ждём немного, чтобы плагин успел инициализироваться
            setTimeout(function() {
                if (window.SmartFiltersPlugin && typeof window.SmartFiltersPlugin.init === 'function') {
                    window.SmartFiltersPlugin.init();
                } else {
                    console.log(`[${PLUGIN_ID}] Waiting for plugin to initialize...`);
                    // Пробуем ещё раз через секунду
                    setTimeout(function() {
                        if (window.SmartFiltersPlugin && typeof window.SmartFiltersPlugin.init === 'function') {
                            window.SmartFiltersPlugin.init();
                        }
                    }, 1000);
                }
            }, 500);
        });
    }
    
    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', start);
    }
})();
