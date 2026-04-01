(function() {
    console.log('SIMPLE: Loader started');
    
    function start() {
        console.log('SIMPLE: Start called');
        var url = 'https://YuriKuv.github.io/lampa-smart-filters/v3/simple.js';
        Lampa.Utils.putScriptAsync(url, function() {
            console.log('SIMPLE: Script loaded callback');
        });
    }
    
    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', start);
    }
})();
