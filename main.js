(function() {
    'use strict';
    
    console.log('[SmartFilters] Loader started');
    
    function start() {
        console.log('[SmartFilters] Start called');
        var url = 'https://YuriKuv.github.io/lampa-smart-filters/v3/smart-filters.js';
        console.log('[SmartFilters] Loading:', url);
        
        Lampa.Utils.putScriptAsync(url, function() {
            console.log('[SmartFilters] Script loaded');
            setTimeout(function() {
                if (window.SmartFiltersPlugin) {
                    console.log('[SmartFilters] Plugin found, calling init');
                    window.SmartFiltersPlugin.init();
                } else {
                    console.error('[SmartFilters] Plugin NOT found');
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
