(function () {
'use strict';

if (window.bf_init) return;
window.bf_init = true;

const STORE = 'bf_items_v10';
const CFG = 'bf_cfg_v10';
const GIST_CACHE = 'bf_gist_cache';
const WEBDAV_CACHE = 'bf_webdav_cache';

let lock = false;
let syncTimer = null;

// ========= FIX SELECT =========

function safeSelect(config){
    try{ Lampa.Select.close(); }catch(e){}
    setTimeout(()=>Lampa.Select.show(config),50);
}

// чистим зависшие оверлеи (Android fix)
Lampa.Listener.follow('select', function(e){
    if(e.type === 'close'){
        setTimeout(()=>{
            $('.selectbox, .selectbox-overlay').remove();
        },300);
    }
});

// ========= SVG =========

const ICON_ADD = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>`;
const ICON_FLAG = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 2v20l6-4 6 4V2z"/></svg>`;

// ========= CONFIG =========

function cfg(){
    return Lampa.Storage.get(CFG,{
        enabled:true,
        button:'side',
        gist_token:'',
        gist_id:'',
        webdav_enabled:false,
        webdav_url:'https://webdav.yandex.ru',
        webdav_login:'',
        webdav_password:'',
        webdav_path:'/lampa_bookmarks.json',
        sync_method:'none',
        sync_on_start:true,
        sync_on_close:false,
        sync_on_add:true,
        sync_on_remove:true,
        sync_on_edit:false,
        sync_auto_interval:true,
        sync_interval_minutes:60
    })||{};
}

function saveCfg(c){
    Lampa.Storage.set(CFG,c,true);
}

// ========= STORAGE =========

function list(){ return Lampa.Storage.get(STORE,[])||[]; }
function saveList(l){ Lampa.Storage.set(STORE,l,true); }
function notify(t){ Lampa.Noty.show(t); }

// ========= KEY =========

function makeKey(a){
    return [
        a.url||'',
        a.component||'',
        a.source||'',
        a.id||'',
        a.job||'',
        JSON.stringify(a.genres||''),
        JSON.stringify(a.params||'')
    ].join('|');
}

function exists(act){
    const key=makeKey(act);
    return list().some(i=>i.key===key);
}

// ========= LOGIC =========

function isAllowed(){
    const act=Lampa.Activity.active();
    if(!act)return false;

    if(act.component==='actor'||act.component==='person')return true;
    if(!act.url)return false;

    if(['movie','tv','anime','catalog'].includes(act.url))return false;

    if(act.params||act.genres||act.sort||act.filter)return true;
    if(act.url.includes('discover')&&act.url.includes('?'))return true;

    return false;
}

function normalize(a){
    return {
        id:Date.now(),
        key:makeKey(a),
        name:a.title||a.name||'Закладка',
        url:a.url,
        component:a.component||'category_full',
        source:a.source||'tmdb',
        id_person:a.id,
        job:a.job,
        genres:a.genres,
        params:a.params,
        page:a.page||1,
        created:Date.now()
    };
}

// ========= SAVE =========

function save(){
    if(lock)return;
    lock=true;

    const act=Lampa.Activity.active();

    if(!isAllowed()){ notify('Здесь нельзя создать закладку'); return unlock(); }
    if(exists(act)){ notify('Уже есть'); return unlock(); }

    Lampa.Input.edit({
        title:'Название',
        value:act.title||act.name||'Закладка'
    },(val)=>{
        if(!val)return unlock();

        const l=list();
        l.push({...normalize(act),name:val.trim()});

        saveList(l);
        render();

        const c=cfg();
        if(c.sync_on_add && c.sync_method!=='none') syncToCloud(false);

        notify('Сохранено');
        unlock();
    },unlock);
}

function unlock(){
    setTimeout(()=>{
        lock=false;
        Lampa.Controller.toggle('content');
    },200);
}

// ========= REMOVE =========

function remove(item){
    const l=list().filter(i=>i.id!==item.id);
    saveList(l);
    render();

    const c=cfg();
    if(c.sync_on_remove && c.sync_method!=='none') syncToCloud(false);

    setTimeout(()=>Lampa.Controller.toggle('content'),100);

    notify('Удалено');
}

// ========= OPEN =========

function open(item){
    Lampa.Activity.push({
        url:item.url,
        title:item.name,
        component:item.component,
        source:item.source,
        id:item.id_person,
        job:item.job,
        genres:item.genres,
        params:item.params,
        page:item.page
    });
}

// ========= RENDER =========

function render(){
    $('.bf-item').remove();
    const root=$('.menu .menu__list').eq(0);
    if(!root.length)return;

    list().forEach(item=>{
        const el=$(`
            <li class="menu__item selector bf-item">
                <div class="menu__ico">${ICON_FLAG}</div>
                <div class="menu__text">${item.name}</div>
            </li>`);

        el.on('hover:enter',()=>open(item));

        el.on('hover:long',()=>{
            safeSelect({
                title:`Удалить "${item.name}"?`,
                items:[
                    {title:'Нет'},
                    {title:'Да',action:'remove'}
                ],
                onSelect:a=>{ if(a.action==='remove') remove(item); }
            });
        });

        root.append(el);
    });
}

// ========= BUTTON =========

function addButton(){
    if($('[data-bf-save]').length)return;

    const c=cfg();

    if(c.button==='top'){
        const head=$('.head__actions, .head__buttons').first();
        const btn=$(`<div class="head__action selector" data-bf-save>
            <div class="head__action-ico">${ICON_ADD}</div>
        </div>`);
        btn.on('hover:enter',save);
        head.prepend(btn);
    }else{
        const menu=$('.menu .menu__list');
        const btn=$(`<li class="menu__item selector" data-bf-save>
            <div class="menu__ico">${ICON_ADD}</div>
            <div class="menu__text">Добавить закладку</div>
        </li>`);
        btn.on('hover:enter',save);
        menu.eq(1).prepend(btn);
    }
}

// ========= SYNC UI =========

function showFullSettings(){
    safeSelect({
        title:'Закладки+',
        items:[
            {title:'☁️ Синхронизация →',action:'sync'},
            {title:'❌ Закрыть'}
        ],
        onSelect:(i)=>{
            if(i.action==='sync'){
                setTimeout(showSyncSetup,50);
            }
        },
        onBack:()=>Lampa.Select.close()
    });
}

function showSyncSetup(){
    const c=cfg();

    safeSelect({
        title:'Синхронизация',
        items:[
            {title:`Метод: ${c.sync_method}`,action:'method'},
            {title:'⚙️ Настройки →',action:'settings'},
            {title:'◀ Назад',action:'back'}
        ],
        onSelect:(i)=>{
            if(i.action==='method'){
                safeSelect({
                    title:'Метод',
                    items:[
                        {title:'Отключена',action:'none'},
                        {title:'WebDAV',action:'webdav'},
                        {title:'Gist',action:'gist'}
                    ],
                    onSelect:(m)=>{
                        c.sync_method=m.action;
                        saveCfg(c);
                        showSyncSetup();
                    }
                });
            }
            else if(i.action==='settings'){
                notify('Настройки синхронизации открыты');
            }
            else if(i.action==='back'){
                showFullSettings();
            }
        },
        onBack:()=>showFullSettings()
    });
}

// ========= SETTINGS =========

function settings(){

    Lampa.SettingsApi.addComponent({
        component:'bf',
        name:'Закладки+',
        icon:ICON_FLAG
    });

    Lampa.SettingsApi.addParam({
        component:'bf',
        param:{ name:'bf_sync_settings_btn', type:'button' },
        field:{ name:'☁️ Синхронизация' },
        onChange:()=>setTimeout(showFullSettings,50)
    });

}

// ========= INIT =========

function init(){
    if(!cfg().enabled)return;

    settings();
    setTimeout(addButton,500);

    render();
}

if(window.appready) init();
else Lampa.Listener.follow('app',e=>e.type==='ready'&&init());

})();
