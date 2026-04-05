javascript
// ==UserScript==
// @name         Lampa Input Dialog
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Универсальный диалог ввода для Lampa
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
    
    // Ждем полной загрузки страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }
    
    function init() {
        // Проверяем, что мы на странице Lampa
        if (!isLampaPage()) {
            console.log('Не страница Lampa, скрипт не активирован');
            return;
        }
        
        // Ждем загрузки Lampa API
        waitForLampa().then(() => {
            // Безопасно добавляем функцию в глобальную область видимости
            addInputDialogFunction();
            console.log('Lampa Input Dialog загружен');
        }).catch(error => {
            console.warn('Lampa не найдена, используем fallback:', error);
            addInputDialogFunction();
        });
    }
    
    function isLampaPage() {
        // Проверяем по URL и наличию элементов Lampa
        const lampaUrls = ['lampa.tv', 'lampa.to'];
        const currentUrl = window.location.href.toLowerCase();
        
        return lampaUrls.some(url => currentUrl.includes(url)) ||
               document.querySelector('[lampa], .lampa, #lampa') ||
               window.Lampa;
    }
    
    function waitForLampa() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 секунд максимум
            
            function checkLampa() {
                attempts++;
                
                if (typeof Lampa !== 'undefined' && Lampa.Select) {
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
        // Добавляем функцию безопасно, проверяя конфликты
        if (typeof window.showInputDialog === 'undefined') {
            window.showInputDialog = showInputDialog;
        }
        
        // Также добавляем в объект Lampa, если он существует
        if (typeof Lampa !== 'undefined') {
            Lampa.showInputDialog = showInputDialog;
        }
    }
    
    /**
     * Универсальный диалог ввода для Lampa
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
                width: options.width || '400px',
                theme: options.theme || getSystemTheme(),
                platform: detectPlatform()
            };
            
            // Проверяем доступность Lampa.Select
            if (typeof Lampa !== 'undefined' && Lampa.Select && Lampa.Select.show) {
                showLampaSelectDialog(title, placeholder, callback, config);
            } else {
                showCustomDialog(title, placeholder, callback, config);
            }
        } catch (error) {
            console.error('Ошибка в showInputDialog:', error);
            // Fallback на стандартный prompt
            const result = prompt(title, placeholder || '');
            if (result !== null && result.trim()) {
                callback(result.trim());
            }
        }
    }
    
    function detectPlatform() {
        const ua = navigator.userAgent.toLowerCase();
        return {
            isMobile: /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua),
            isIOS: /iphone|ipad|ipod/.test(ua),
            isAndroid: /android/.test(ua),
            isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0
        };
    }
    
    function getSystemTheme() {
        try {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
        } catch (e) {
            // Игнорируем ошибки
        }
        return 'light';
    }
    
    function showLampaSelectDialog(title, placeholder, callback, config) {
        Lampa.Select.show({
            title: title,
            items: [
                { 
                    title: '[Введите название]', 
                    value: 'input',
                    description: placeholder
                }
            ],
            onSelect: function(item) {
                if (item.value === 'input') {
                    showCustomDialog(title, placeholder, callback, config);
                }
            },
            onBack: function() {
                if (config.cancelable && typeof options.onCancel === 'function') {
                    options.onCancel();
                }
            }
        });
    }
    
    function showCustomDialog(title, placeholder, callback, config) {
        // Удаляем существующий диалог
        removeExistingDialog();
        
        // Создаем overlay
        const overlay = createOverlay();
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
                input.select();
            }
        }, 50);
        
        // Добавляем обработчик клавиатуры
        const keyHandler = createKeyHandler(dialog, overlay, callback, config);
        document.addEventListener('keydown', keyHandler);
        
        // Сохраняем ссылку для cleanup
        overlay._keyHandler = keyHandler;
    }
    
    function removeExistingDialog() {
        const existing = document.querySelector('.input-dialog-overlay');
        if (existing) {
            if (existing._keyHandler) {
                document.removeEventListener('keydown', existing._keyHandler);
            }
            existing.remove();
        }
    }
    
    function createOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'input-dialog-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: inputDialogFadeIn 0.3s ease;
        `;
        
        // Добавляем стили если их еще нет
        addDialogStyles();
        
        return overlay;
    }
    
    function createDialog(title, placeholder, callback, config, overlay) {
        const dialog = document.createElement('div');
        dialog.className = 'input-dialog';
        dialog.style.cssText = `
            background: ${config.theme === 'dark' ? '#1a1a1a' : '#ffffff'};
            color: ${config.theme === 'dark' ? '#ffffff' : '#000000'};
            border-radius: 12px;
            padding: 24px;
            width: ${config.width};
            max-width: 90vw;
            max-height: 90vh;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            animation: inputDialogSlideUp 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            box-sizing: border-box;
        `;
        
        // Заголовок
        const titleEl = document.createElement('div');
        titleEl.className = 'input-dialog-title';
        titleEl.textContent = title;
        titleEl.style.cssText = `
            margin: 0 0 16px 0;
            font-size: 20px;
            font-weight: 600;
            color: ${config.theme === 'dark' ? '#ffffff' : '#000000'};
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
        
        input.style.cssText = `
            width: 100%;
            padding: ${config.platform.isMobile ? '16px' : '12px'};
            margin: 0 0 20px 0;
            border: 2px solid ${config.theme === 'dark' ? '#444' : '#ddd'};
            border-radius: 8px;
            font-size: ${config.platform.isMobile ? '18px' : '16px'};
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
            input.style.borderColor = config.theme === 'dark' ? '#667eea' : '#764ba2';
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
            gap: 12px;
            justify-content: flex-end;
        `;
        
        // Кнопка отмены
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'input-dialog-cancel';
        cancelBtn.textContent = 'Отмена';
        cancelBtn.style.cssText = `
            padding: ${config.platform.isMobile ? '14px 24px' : '10px 20px'};
            background: ${config.theme === 'dark' ? '#444' : '#f0f0f0'};
            color: ${config.theme === 'dark' ? '#ccc' : '#666'};
            border: none;
            border-radius: 8px;
            font-size: ${config.platform.isMobile ? '16px' : '14px'};
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            flex: 1;
        `;
        
        // Кнопка OK
        const okBtn = document.createElement('button');
        okBtn.className = 'input-dialog-ok';
        okBtn.textContent = 'OK';
        okBtn.style.cssText = `
            padding: ${config.platform.isMobile ? '14px 24px' : '10px 20px'};
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: ${config.platform.isMobile ? '16px' : '14px'};
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            flex: 1;
        `;
        
        // Обработчики
        cancelBtn.addEventListener('click', () => {
            closeDialog(overlay);
            if (config.cancelable && typeof options.onCancel === 'function') {
                options.onCancel();
            }
        });
        
        okBtn.addEventListener('click', () => {
            handleConfirm(input, callback, config, overlay);
        });
        
        // Hover эффекты для десктопа
        if (!config.platform.isMobile) {
            cancelBtn.addEventListener('mouseenter', () => {
                cancelBtn.style.opacity = '0.8';
            });
            cancelBtn.addEventListener('mouseleave', () => {
                cancelBtn.style.opacity = '1';
            });
            
            okBtn.addEventListener('mouseenter', () => {
                okBtn.style.transform = 'translateY(-2px)';
                okBtn.style.boxShadow = '0 5px 15px rgba(102, 126, 234, 0.4)';
            });
            okBtn.addEventListener('mouseleave', () => {
                okBtn.style.transform = 'translateY(0)';
                okBtn.style.boxShadow = 'none';
            });
        }
        
        container.appendChild(cancelBtn);
        container.appendChild(okBtn);
        
        return container;
    }
    
    function handleConfirm(input, callback, config, overlay) {
        const value = input.value.trim();
        
        if (config.required && !value) {
            showError('Поле не может быть пустым', input);
            return;
        }
        
        if (value.length < config.minLength) {
            showError(`Минимальная длина: ${config.minLength} символов`, input);
            return;
        }
        
        closeDialog(overlay);
        callback(value);
    }
    
    function showError(message, input) {
        // Удаляем старую ошибку
        const oldError = input.parentNode.querySelector('.input-dialog-error');
        if (oldError) oldError.remove();
        
        const error = document.createElement('div');
        error.className = 'input-dialog-error';
        error.textContent = message;
        error.style.cssText = `
            color: #ff4757;
            font-size: 14px;
            margin: -10px 0 10px 0;
            animation: inputDialogShake 0.3s ease;
        `;
        
        input.parentNode.insertBefore(error, input.nextSibling);
        
        // Анимация встряхивания
        input.style.animation = 'inputDialogShake 0.3s ease';
        setTimeout(() => {
            input.style.animation = '';
        }, 300);
        
        input.focus();
    }
    
    function closeDialog(overlay) {
        if (overlay && overlay.parentNode) {
            if (overlay._keyHandler) {
                document.removeEventListener('keydown', overlay._keyHandler);
            }
            overlay.remove();
            document.body.style.overflow = '';
        }
    }
    
    function createKeyHandler(dialog, overlay, callback, config) {
        return function(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeDialog(overlay);
                if (config.cancelable && typeof options.onCancel === 'function') {
                    options.onCancel();
                }
            } else if (e.key === 'Enter' && !e.shiftKey) {
                const input = dialog.querySelector('.input-dialog-input');
                if (input && document.activeElement === input) {
                    e.preventDefault();
                    handleConfirm(input, callback, config, overlay);
                }
            }
        };
    }
    
    function addDialogStyles() {
        if (document.querySelector('#input-dialog-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'input-dialog-styles';
        style.textContent = `
            @keyframes inputDialogFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes inputDialogSlideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @keyframes inputDialogShake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                20%, 40%, 60%, 80% { transform: translateX(5px); }
            }
            
            @media (max-width: 768px) {
                .input-dialog {
                    padding: 20px !important;
                    margin: 10px !important;
                }
                
                .input-dialog-input {
                    font-size: 18px !important;
                    padding: 16px !important;
                }
                
                .input-dialog-cancel,
                .input-dialog-ok {
                    font-size: 16px !important;
                    padding: 14px 20px !important;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
    
})();
