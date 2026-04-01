(function() {
    'use strict';
    
    console.log('=== TEST: main-test.js loaded ===');
    
    function start() {
        console.log('=== TEST: start() called ===');
        var scriptUrl = 'https://YuriKuv.github.io/lampa-smart-filters/v3/test.js';
        console.log('=== TEST: Loading script from:', scriptUrl);
        
        Lampa.Utils.putScriptAsync(scriptUrl, function() {
            console.log('=== TEST: Script loaded, checking for TestPlugin...');
            setTimeout(function() {
                if (window.TestPlugin) {
                    console.log('=== TEST: TestPlugin found! ===');
                } else {
                    console.error('=== TEST: TestPlugin NOT found! ===');
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
