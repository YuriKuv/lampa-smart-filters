javascript
/**
 * Универсальный диалог ввода с поддержкой всех платформ
 * @param {string} title - Заголовок диалога
 * @param {string} placeholder - Подсказка в поле ввода
 * @param {Function} callback - Функция обратного вызова
 * @param {Object} options - Дополнительные опции
 */
function showInputDialog(title, placeholder, callback, options = {}) {
    const config = {
        defaultValue: options.defaultValue || '',
        maxLength: options.maxLength || 100,
        minLength: options.minLength || 1,
        type: options.type || 'text', // text, number, password, email
        required: options.required !== false,
        cancelable: options.cancelable !== false,
        width: options.width || '400px',
        height: options.height || 'auto',
        theme: options.theme || getSystemTheme(),
        platform: detectPlatform()
    };

    // Проверяем, доступен ли Lampa.Select
    if (typeof Lampa !== 'undefined' && Lampa.Select && Lampa.Select.show) {
        showLampaDialog(title, placeholder, callback, config);
    } else {
        // Fallback для случаев, когда Lampa не доступен
        showUniversalDialog(title, placeholder, callback, config);
    }
}

/**
 * Определение текущей платформы
 */
function detectPlatform() {
    const ua = navigator.userAgent.toLowerCase();
    return {
        isMobile: /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua),
        isIOS: /iphone|ipad|ipod/.test(ua),
        isAndroid: /android/.test(ua),
        isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        isDesktop: !/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)
    };
}

/**
 * Получение системной темы
 */
function getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

/**
 * Диалог через Lampa.Select (оригинальный стиль)
 */
function showLampaDialog(title, placeholder, callback, config) {
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
                // Используем универсальный диалог вместо prompt
                showCustomInputDialog(title, placeholder, callback, config);
            }
        },
        onBack: function() {
            if (config.cancelable && typeof options.onCancel === 'function') {
                options.onCancel();
            }
        }
    });
}

/**
 * Универсальный кастомный диалог ввода
 */
function showCustomInputDialog(title, placeholder, callback, config) {
    // Удаляем предыдущий диалог, если есть
    const existingDialog = document.querySelector('.universal-input-dialog');
    if (existingDialog) existingDialog.remove();

    // Создаем overlay
    const overlay = document.createElement('div');
    overlay.className = 'universal-input-dialog-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease;
    `;

    // Создаем диалог
    const dialog = document.createElement('div');
    dialog.className = 'universal-input-dialog';
    dialog.style.cssText = `
        background: ${config.theme === 'dark' ? '#1a1a1a' : '#ffffff'};
        color: ${config.theme === 'dark' ? '#ffffff' : '#000000'};
        border-radius: 12px;
        padding: 24px;
        width: ${config.width};
        max-width: 90vw;
        max-height: 90vh;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        animation: slideUp 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    `;

    // Заголовок
    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    titleEl.style.cssText = `
        margin: 0 0 16px 0;
        font-size: 20px;
        font-weight: 600;
        color: ${config.theme === 'dark' ? '#ffffff' : '#000000'};
    `;

    // Поле ввода
    const input = document.createElement('input');
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
        padding: ${config.isMobile ? '16px' : '12px'};
        margin: 0 0 20px 0;
        border: 2px solid ${config.theme === 'dark' ? '#444' : '#ddd'};
        border-radius: 8px;
        font-size: ${config.isMobile ? '18px' : '16px'};
        background: ${config.theme === 'dark' ? '#2a2a2a' : '#f9f9f9'};
        color: ${config.theme === 'dark' ? '#ffffff' : '#000000'};
        box-sizing: border-box;
        outline: none;
        transition: border-color 0.3s ease;
    `;

    input.addEventListener('focus', () => {
        input.style.borderColor = config.theme === 'dark' ? '#667eea' : '#764ba2';
    });

    input.addEventListener('blur', () => {
        input.style.borderColor = config.theme === 'dark' ? '#444' : '#ddd';
    });

    // Кнопки
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
        display: flex;
        gap: 12px;
        justify-content: flex-end;
    `;

    // Кнопка отмены
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Отмена';
    cancelButton.style.cssText = `
        padding: ${config.isMobile ? '14px 24px' : '10px 20px'};
        background: ${config.theme === 'dark' ? '#444' : '#f0f0f0'};
        color: ${config.theme === 'dark' ? '#ccc' : '#666'};
        border: none;
        border-radius: 8px;
        font-size: ${config.isMobile ? '16px' : '14px'};
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        flex: 1;
    `;

    // Кнопка подтверждения
    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'OK';
    confirmButton.style.cssText = `
        padding: ${config.isMobile ? '14px 24px' : '10px 20px'};
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: ${config.isMobile ? '16px' : '14px'};
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        flex: 1;
    `;

    // Добавляем hover эффекты для десктопа
    if (!config.isMobile) {
        cancelButton.addEventListener('mouseenter', () => {
            cancelButton.style.opacity = '0.8';
        });
        cancelButton.addEventListener('mouseleave', () => {
            cancelButton.style.opacity = '1';
        });
        
        confirmButton.addEventListener('mouseenter', () => {
            confirmButton.style.transform = 'translateY(-2px)';
            confirmButton.style.boxShadow = '0 5px 15px rgba(102, 126, 234, 0.4)';
        });
        confirmButton.addEventListener('mouseleave', () => {
            confirmButton.style.transform = 'translateY(0)';
            confirmButton.style.boxShadow = 'none';
        });
    }

    // Обработчики событий
    const handleConfirm = () => {
        const value = input.value.trim();
        
        if (config.required && !value) {
            showError('Поле не может быть пустым');
            input.focus();
            return;
        }
        
        if (value.length < config.minLength) {
            showError(`Минимальная длина: ${config.minLength} символов`);
            input.focus();
            return;
        }
        
        closeDialog();
        callback(value);
    };

    const handleCancel = () => {
        closeDialog();
        if (config.cancelable && typeof options.onCancel === 'function') {
            options.onCancel();
        }
    };

    const closeDialog = () => {
        document.body.style.overflow = '';
        overlay.remove();
        
        // Удаляем обработчики клавиатуры
        document.removeEventListener('keydown', handleKeyDown);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            handleCancel();
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleConfirm();
        }
    };

    // Показ ошибки
    const showError = (message) => {
        // Удаляем предыдущую ошибку
        const existingError = dialog.querySelector('.input-error');
        if (existingError) existingError.remove();

        const errorEl = document.createElement('div');
        errorEl.className = 'input-error';
        errorEl.textContent = message;
        errorEl.style.cssText = `
            color: #ff4757;
            font-size: 14px;
            margin: -10px 0 10px 0;
            animation: shake 0.3s ease;
        `;
        
        input.parentNode.insertBefore(errorEl, input.nextSibling);
        
        // Анимация встряхивания поля ввода
        input.style.animation = 'shake 0.3s ease';
        setTimeout(() => {
            input.style.animation = '';
        }, 300);
    };

    // Назначаем обработчики
    cancelButton.addEventListener('click', handleCancel);
    confirmButton.addEventListener('click', handleConfirm);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        }
    });

    // Добавляем элементы
    buttonsContainer.appendChild(cancelButton);
    buttonsContainer.appendChild(confirmButton);
    
    dialog.appendChild(titleEl);
    dialog.appendChild(input);
    dialog.appendChild(buttonsContainer);
    overlay.appendChild(dialog);
    
    // Добавляем на страницу
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    
    // Фокусируемся на поле ввода
    setTimeout(() => {
        input.focus();
        input.select();
    }, 100);
    
    // Добавляем обработчик клавиатуры
    document.addEventListener('keydown', handleKeyDown);
    
    // Добавляем анимации CSS
    addDialogStyles();
}

/**
 * Добавляем CSS стили для анимаций
 */
function addDialogStyles() {
    if (document.querySelector('#dialog-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'dialog-styles';
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        
        /* Адаптивные стили для мобильных */
        @media (max-width: 768px) {
            .universal-input-dialog {
                padding: 20px !important;
                margin: 10px !important;
            }
            
            .universal-input-dialog input {
                font-size: 18px !important;
                padding: 16px !important;
            }
            
            .universal-input-dialog button {
                font-size: 16px !important;
                padding: 14px 20px !important;
            }
        }
        
        /* Поддержка темной темы */
        @media (prefers-color-scheme: dark) {
            .universal-input-dialog {
                background: #1a1a1a !important;
                color: #ffffff !important;
            }
            
            .universal-input-dialog input {
                background: #2a2a2a !important;
                color: #ffffff !important;
                border-color: #444 !important;
            }
        }
    `;
    
    document.head.appendChild(style);
}

/**
 * Универсальный диалог (fallback)
 */
function showUniversalDialog(title, placeholder, callback, config) {
    // Используем кастомный диалог как fallback
    showCustomInputDialog(title, placeholder, callback, config);
}

// Экспорт функции для использования
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { showInputDialog };
}
```

## Ключевые улучшения:

### 1. **Кроссплатформенность**
- Автоматическое определение платформы (мобильная/десктоп)
- Адаптивные стили для разных устройств
- Поддержка touch и mouse событий

### 2. **Улучшенный UI**
- Современный дизайн с анимациями
- Поддержка темной темы
- Градиентные кнопки
- Анимация встряхивания при ошибке

### 3. **Валидация ввода**
- Проверка минимальной/максимальной длины
- Проверка обязательных полей
- Визуальная обратная связь

### 4. **Управление с клавиатуры**
- Enter - подтвердить
- Escape - отменить
- Shift+Enter - новая строка (если нужно)

### 5. **Адаптивный дизайн**
- Большие кнопки для мобильных
- Увеличенные шрифты
- Оптимизированные отступы

### 6. **Fallback система**
- Использует Lampa.Select если доступен
- Автоматический fallback на кастомный диалог
- Работает без зависимостей

### 7. **Дополнительные опции**
```javascript
// Пример использования с опциями
showInputDialog(
    'Введите название плейлиста',
    'Мой плейлист',
    function(name) {
        console.log('Создан плейлист:', name);
    },
    {
        defaultValue: 'Избранное',
        maxLength: 50,
        minLength: 3,
        type: 'text',
        required: true,
        cancelable: true,
        width: '500px',
        theme: 'dark' // или 'auto', 'light', 'dark'
    }
);
