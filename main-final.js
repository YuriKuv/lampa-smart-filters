(function() {
    'use strict';
    
    console.log('FINAL: Loader started');
    
    function start() {
        console.log('FINAL: Start called');
        var url = 'https://YuriKuv.github.io/lampa-smart-filters/v3/smart-filters.js?t=' + Date.now();
        console.log('FINAL: Loading:', url);
        
        Lampa.Utils.putScriptAsync(url, function() {
            console.log('FINAL: Script loaded callback');
            setTimeout(function() {
                if (window.SmartFiltersPlugin) {
                    console.log('FINAL: Plugin found!', window.SmartFiltersPlugin);
                } else {
                    console.error('FINAL: Plugin NOT found');
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
