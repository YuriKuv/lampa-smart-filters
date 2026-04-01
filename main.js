(function() {
    'use strict';
    
    console.log('[SmartFilters] Loader started');
    
    function start() {
        console.log('[SmartFilters] Start function called');
        
        let version = 'v3';
        if (Lampa.Manifest.app_digital && Lampa.Manifest.app_digital < 3.0) {
            version = 'v2';
        }
        
        let scriptUrl = `https://YuriKuv.github.io/lampa-smart-filters/${version}/smart-filters.js`;
        console.log('[SmartFilters] Loading script from:', scriptUrl);
        
        Lampa.Utils.putScriptAsync(scriptUrl, function() {
            console.log('[SmartFilters] Script loaded successfully');
            
            // Проверяем, что плагин появился
            setTimeout(function() {
                if (window.SmartFiltersPlugin) {
                    console.log('[SmartFilters] Plugin object found');
                    if (typeof window.SmartFiltersPlugin.init === 'function') {
                        console.log('[SmartFilters] Calling init()');
                        window.SmartFiltersPlugin.init();
                    } else {
                        console.error('[SmartFilters] init is not a function');
                    }
                } else {
                    console.error('[SmartFilters] SmartFiltersPlugin not found on window');
                }
            }, 500);
        });
    }
    
    if (window.appready) {
        console.log('[SmartFilters] App already ready');
        start();
    } else {
        console.log('[SmartFilters] Waiting for app');
        Lampa.Listener.follow('app', start);
    }
})();
