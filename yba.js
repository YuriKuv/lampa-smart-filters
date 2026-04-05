javascript
// ==UserScript==
// @name         Lampa Input Dialog Universal
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Универсальный диалог ввода для Lampa на всех платформах
// @author       Your Name
// @match        *://lampa.tv/*
// @match        *://lampa.to/*
// @match        *://*.lampa.tv/*
// @match        *://*.lampa.to/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    
    // Проверяем окружение Lampa
    const isLampaApp = typeof window.Lampa !== 'undefined' && 
                      (window.Lampa.manifest || window.Lampa.isApp());
    
    // Ждем полной загрузки страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, isLampaApp ? 2000 : 1000);
    }
    
    function init() {
        // Проверяем, что мы на странице Lampa
        if (!isLampaPage()) {
            console.log('Не страница Lampa, скрипт не активирован');
            return;
        }
        
        // Ждем загрузки Lampa API
        waitForLampa().then(() => {
            // Добавляем функцию в глобальную область видимости
            addInputDialogFunction();
            console.log('Lampa Input Dialog Universal загружен');
            
            // Для TV устройств добавляем навигацию
            if (isTVDevice()) {
                addTVNavigationSupport();
            }
        }).catch(error => {
            console.warn('Lampa не найдена, используем fallback:', error);
            addInputDialogFunction();
        });
    }
    
    function isLampaPage() {
        const lampaUrls = ['lampa.tv', 'lampa.to'];
        const currentUrl = window.location.href.toLowerCase();
        
        return lampaUrls.some(url => currentUrl.includes(url)) ||
               document.querySelector('[lampa], .lampa, #lampa') ||
               window.Lampa ||
               navigator.userAgent.includes('Lampa');
    }
    
    function waitForLampa() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 100; // 10 секунд максимум
            
            function checkLampa() {
                attempts++;
                
                // Проверяем разные варианты Lampa API
                if (typeof Lampa !== 'undefined' && 
                    (Lampa.Select || Lampa.Manager || Lampa.Activity)) {
                    resolve();
                } else if (attempts >= maxAttempts) {
                    reject(new Error('Lampa не загрузилась'));
                } else {
                    setTimeout(checkLampa, 100);
                }
            }
            
            checkLampa();
        });
    }
    
    function addInputDialogFunction() {
        // Добавляем функцию безопасно
        if (typeof window.showInputDialog === 'undefined') {
            window.showInputDialog = showInputDialog;
        }
        
        // Добавляем в объект Lampa
        if (typeof Lampa !== 'undefined') {
            Lampa.showInputDialog = showInputDialog;
            Lampa.Dialog = Lampa.Dialog || {};
            Lampa.Dialog.input = showInputDialog;
        }
    }
    
    function isTVDevice() {
        const ua = navigator.userAgent.toLowerCase();
        return ua.includes('smart-tv') || 
               ua.includes('tv') || 
               ua.includes('android tv') ||
               ua.includes('googletv') ||
               ua.includes('appletv') ||
               ua.includes('crkey') ||
               ua.includes('aftb') ||
               ua.includes('aftm') ||
               ua.includes('aftmm') ||
               ua.includes('afte') ||
               ua.includes('afta') ||
               screen.width >= 1280 && screen.height >= 720 && !isMobileDevice();
    }
    
    function isMobileDevice() {
        const ua = navigator.userAgent.toLowerCase();
        return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
    }
    
    function addTVNavigationSupport() {
        // Добавляем поддержку навигации для TV пультов
        const style = document.createElement('style');
        style.textContent = `
            .input-dialog-button:focus {
                outline: 3px solid #667eea;
                outline-offset: 2px;
                transform: scale(1.05);
            }
            
            .input-dialog-input:focus {
                outline: 3px solid #667eea;
                outline-offset: -2px;
            }
            
            @media (pointer: coarse) {
                .input-dialog-button {
                    min-height: 48px;
                    min-width: 120px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    /**
     * Универсальный диалог ввода для всех платформ Lampa
     */
    function showInputDialog(title, placeholder, callback, options = {}) {
        try {
            const config = {
                defaultValue: options.defaultValue || '',
                maxLength: options.maxLength || 100,
                minLength: options.minLength || 1,
                type: options.type || 'text',
                required: options.required !== false,
                cancelable: options.cancelable !== false,
                width: options.width || (isTVDevice() ? '600px' : '400px'),
                height: options.height || 'auto',
                theme: options.theme || getSystemTheme(),
                platform: detectPlatform(),
                keyboard: options.keyboard || 'default',
                inputMode: options.inputMode || 'text',
                onCancel: options.onCancel || null,
                onShow: options.onShow || null,
                onHide: options.onHide || null
            };
            
            // Вызываем onShow если есть
            if (typeof config.onShow === 'function') {
                config.onShow();
            }
            
            // Пробуем использовать нативный диалог Lampa если доступен
            if (tryNativeLampaDialog(title, placeholder, callback, config)) {
                return;
            }
            
            // Пробуем использовать Keyboard если доступен (для TV)
            if (tryKeyboardDialog(title, placeholder, callback, config)) {
                return;
            }
            
            // Fallback на кастомный диалог
            showCustomDialog(title, placeholder, callback, config);
            
        } catch (error) {
            console.error('Ошибка в showInputDialog:', error);
            fallbackPrompt(title, placeholder, callback, options);
        }
    }
    
    function tryNativeLampaDialog(title, placeholder, callback, config) {
        try {
            // Проверяем наличие нативного диалога Lampa
            if (typeof Lampa !== 'undefined') {
                // Вариант 1: Lampa.Dialog (если существует)
                if (Lampa.Dialog && Lampa.Dialog.prompt) {
                    Lampa.Dialog.prompt({
                        title: title,
                        text: placeholder,
                        value: config.defaultValue,
                        callback: callback
                    });
                    return true;
                }
                
                // Вариант 2: Lampa.Activity (для Android TV)
                if (Lampa.Activity && Lampa.Activity.input) {
                    Lampa.Activity.input({
                        title: title,
                        hint: placeholder,
                        value: config.defaultValue,
                        onSuccess: callback,
                        onCancel: config.onCancel
                    });
                    return true;
                }
                
                // Вариант 3: Lampa.Manager
                if (Lampa.Manager && Lampa.Manager.showDialog) {
                    Lampa.Manager.showDialog({
                        title: title,
                        html: `
                            <div style="padding: 20px;">
                                <input type="${config.type}" 
                                       placeholder="${placeholder}"
                                       value="${config.defaultValue}"
                                       style="width: 100%; padding: 10px; font-size: 16px;"
                                       class="lampa-input-dialog-field" />
                            </div>
                        `,
                        buttons: [
                            {
                                title: 'Отмена',
                                action: 'cancel'
                            },
                            {
                                title: 'OK',
                                action: function() {
                                    const value = document.querySelector('.lampa-input-dialog-field').value;
                                    if (config.required && !value.trim()) return;
                                    callback(value);
                                }
                            }
                        ]
                    });
                    return true;
                }
            }
        } catch (e) {
            console.warn('Нативный диалог Lampa не доступен:', e);
        }
        return false;
    }
    
    function tryKeyboardDialog(title, placeholder, callback, config) {
        // Для TV устройств пробуем использовать виртуальную клавиатуру
        if (isTVDevice() && typeof Lampa !== 'undefined' && Lampa.Keyboard) {
            try {
                Lampa.Keyboard.show({
                    title: title,
                    text: config.defaultValue,
                    placeholder: placeholder,
                    type: config.type === 'password' ? 'password' : 'text',
                    onEnter: function(text) {
                        if (config.required && !text.trim()) {
                            Lampa.Noty.show('Поле не может быть пустым', 'error');
                            return false;
                        }
                        callback(text);
                        return true;
                    },
                    onCancel: config.onCancel
                });
                return true;
            } catch (e) {
                console.warn('Клавиатура Lampa не доступна:', e);
            }
        }
        return false;
    }
    
    function showCustomDialog(title, placeholder, callback, config) {
        removeExistingDialog();
        
        const overlay = createOverlay(config);
        const dialog = createDialog(title, placeholder, callback, config, overlay);
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // Блокируем скролл
        document.body.style.overflow = 'hidden';
        
        // Фокус на поле ввода
        setTimeout(() => {
            const input = dialog.querySelector('.input-dialog-input');
            if (input) {
                input.focus();
                if (config.defaultValue) {
                    input.setSelectionRange(0, config.defaultValue.length);
                }
                
                // Для TV добавляем виртуальную клавиатуру если нужно
                if (isTVDevice() && config.keyboard !== 'none') {
                    input.setAttribute('inputmode', config.inputMode);
                }
            }
        }, 100);
        
        // Добавляем обработчик клавиатуры
        const keyHandler = createKeyHandler(dialog, overlay, callback, config);
        document.addEventListener('keydown', keyHandler);
        
        // Сохраняем ссылку для cleanup
        overlay._keyHandler = keyHandler;
        overlay._config = config;
    }
    
    function createOverlay(config) {
        const overlay = document.createElement('div');
        overlay.className = 'input-dialog-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            z-index: 999999;
            display: flex;
            align-items: ${isTVDevice() ? 'flex-start' : 'center'};
            justify-content: center;
            animation: inputDialogFadeIn 0.3s ease;
            padding-top: ${isTVDevice() ? '100px' : '0'};
        `;
        
        // Добавляем стили
        addDialogStyles();
        
        // Обработчик клика на overlay
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay && config.cancelable) {
                closeDialog(overlay, config);
            }
        });
        
        return overlay;
    }
    
    function createDialog(title, placeholder, callback, config, overlay) {
        const dialog = document.createElement('div');
        dialog.className = 'input-dialog';
        dialog.style.cssText = `
            background: ${config.theme === 'dark' ? '#1a1a1a' : '#ffffff'};
            color: ${config.theme === 'dark' ? '#ffffff' : '#000000'};
            border-radius: ${isTVDevice() ? '8px' : '12px'};
            padding: ${isTVDevice() ? '30px' : '24px'};
            width: ${config.width};
            max-width: ${isTVDevice() ? '800px' : '90vw'};
            max-height: ${isTVDevice() ? '70vh' : '90vh'};
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            animation: inputDialogSlideUp 0.3s ease;
            font-family: ${isTVDevice() ? 'Arial, sans-serif' : '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'};
            box-sizing: border-box;
            border: ${isTVDevice() ? '2px solid #333' : 'none'};
            overflow-y: auto;
        `;
        
        // Заголовок
        const titleEl = document.createElement('div');
        titleEl.className = 'input-dialog-title';
        titleEl.textContent = title;
        titleEl.style.cssText = `
            margin: 0 0 20px 0;
            font-size: ${isTVDevice() ? '28px' : '20px'};
            font-weight: ${isTVDevice() ? 'bold' : '600'};
            color: ${config.theme === 'dark' ? '#ffffff' : '#000000'};
            text-align: ${isTVDevice() ? 'center' : 'left'};
        `;
        
        // Поле ввода
        const input = document.createElement('input');
        input.className = 'input-dialog-input';
        input.type = config.type;
        input.placeholder = placeholder;
        input.value = config.defaultValue;
        input.maxLength = config.maxLength;
        input.autocomplete = 'off';
        input.autocorrect = 'off';
        input.autocapitalize = 'off';
        input.spellcheck = false;
        input.inputMode = config.inputMode;
        
        input.style.cssText = `
            width: 100%;
            padding: ${isTVDevice() ? '20px' : '12px'};
            margin: 0 0 25px 0;
            border: 2px solid ${config.theme === 'dark' ? '#444' : '#ddd'};
            border-radius: ${isTVDevice() ? '6px' : '8px'};
            font-size: ${isTVDevice() ? '24px' : '16px'};
            background: ${config.theme === 'dark' ? '#2a2a2a' : '#f9f9f9'};
            color: ${config.theme === 'dark' ? '#ffffff' : '#000000'};
            box-sizing: border-box;
            outline: none;
            transition: border-color 0.3s ease;
        `;
        
        // Кнопки
        const buttons = createButtons(config, input, overlay, callback);
        
        // Собираем диалог
        dialog.appendChild(titleEl);
        dialog.appendChild(input);
        dialog.appendChild(buttons);
        
        // Обработчики для input
        input.addEventListener('focus', () => {
            input.style.borderColor = '#667eea';
        });
        
        input.addEventListener('blur', () => {
            input.style.borderColor = config.theme === 'dark' ? '#444' : '#ddd';
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm(input, callback, config, overlay);
            }
        });
        
        return dialog;
    }
    
    function createButtons(config, input, overlay, callback) {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            gap: ${isTVDevice() ? '20px' : '12px'};
            justify-content: ${isTVDevice() ? 'space-between' : 'flex-end'};
        `;
        
        // Кнопка отмены (только если cancelable)
        if (config.cancelable) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'input-dialog-button input-dialog-cancel';
            cancelBtn.textContent = 'Отмена';
            cancelBtn.tabIndex = 1;
            cancelBtn.style.cssText = `
                padding: ${isTVDevice() ? '20px 30px' : '10px 20px'};
                background: ${config.theme === 'dark' ? '#444' : '#f0f0f0'};
                color: ${config.theme === 'dark' ? '#ccc' : '#666'};
                border: none;
                border-radius: ${isTVDevice() ? '6px' : '8px'};
                font-size: ${isTVDevice() ? '22px' : '14px'};
                font-weight: ${isTVDevice() ? 'bold' : '500'};
                cursor: pointer;
                transition: all 0.3s ease;
                flex: ${isTVDevice() ? '1' : 'none'};
                min-width: ${isTVDevice() ? '200px' : 'auto'};
            `;
            
            cancelBtn.addEventListener('click', () => {
                closeDialog(overlay, config);
            });
            
            container.appendChild(cancelBtn);
        }
        
        // Кнопка OK
        const okBtn = document.createElement('button');
        okBtn.className = 'input-dialog-button input-dialog-ok';
        okBtn.textContent = 'OK';
        okBtn.tabIndex = 2;
        okBtn.style.cssText = `
            padding: ${isTVDevice() ? '20px 30px' : '10px 20px'};
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: ${isTVDevice() ? '6px' : '8px'};
