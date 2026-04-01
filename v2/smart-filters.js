(function() {
    'use strict';
    
    // Предотвращаем двойную инициализацию
    if (window.SmartFiltersPlugin && window.SmartFiltersPlugin.initialized) {
        return;
    }
    
    // --- Конфигурация плагина ---
    const PLUGIN_CONFIG = {
        id: 'smart-filters',
        name: 'Smart Filters',
        version: '1.0.0',
        storagePrefix: 'smart_filters_',
        categoriesStorageKey: 'smart_filters_categories',
        maxFiltersPerCategory: 20,
        defaultCategories: ['Избранное', 'Смотреть позже', 'Любимые жанры']
    };
    
    // --- Глобальные переменные плагина ---
    let categories = [];
    let currentCategory = null;
    
    // --- Основной объект плагина (адаптирован для v2) ---
    window.SmartFiltersPlugin = {
        initialized: false,
        
        // Инициализация плагина
        init: function() {
            if (this.initialized) return;
            
            console.log(`[${PLUGIN_CONFIG.id}] Initializing for Lampa v2...`);
            
            // Загружаем сохранённые категории
            this.loadCategories();
            
            // Создаём раздел в настройках (если поддерживается)
            if (typeof Lampa.SettingsApi !== 'undefined') {
                this.createSettingsSection();
            }
            
            // Создаём меню в боковой панели
            this.createSidebarMenu();
            
            // Добавляем кнопку сохранения в интерфейс фильтра
            this.addSaveFilterButton();
            
            this.initialized = true;
            console.log(`[${PLUGIN_CONFIG.id}] Initialized successfully`);
        },
        
        // Загрузка категорий из хранилища
        loadCategories: function() {
            const saved = Lampa.Storage.get(PLUGIN_CONFIG.categoriesStorageKey);
            if (saved && Array.isArray(saved)) {
                categories = saved;
            } else {
                // Создаём категории по умолчанию
                categories = PLUGIN_CONFIG.defaultCategories.map(name => ({
                    id: this.generateId(),
                    name: name,
                    filters: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                }));
                this.saveCategories();
            }
        },
        
        // Сохранение категорий
        saveCategories: function() {
            Lampa.Storage.set(PLUGIN_CONFIG.categoriesStorageKey, categories);
            this.updateCategoriesMenu();
        },
        
        // Генерация уникального ID
        generateId: function() {
            return Date.now().toString(36) + Math.random().toString(36).substr(2);
        },
        
        // Создание раздела в настройках (для v2)
        createSettingsSection: function() {
            const self = this;
            
            // Проверяем наличие API настроек
            if (typeof Lampa.SettingsApi === 'undefined') return;
            
            try {
                Lampa.SettingsApi.addComponent({
                    id: PLUGIN_CONFIG.id,
                    name: PLUGIN_CONFIG.name,
                    icon: '⚙️',
                    component: 'smart_filters_settings',
                    position: 100,
                    handler: function() {
                        self.showSettingsModal();
                    }
                });
                
                Lampa.SettingsApi.addParam({
                    component: 'smart_filters_settings',
                    name: 'auto_save',
                    type: 'toggle',
                    value: Lampa.Storage.get(PLUGIN_CONFIG.storagePrefix + 'auto_save') || true,
                    title: 'Автосохранение фильтров',
                    subtitle: 'Автоматически сохранять последние использованные фильтры',
                    onChange: function(value) {
                        Lampa.Storage.set(PLUGIN_CONFIG.storagePrefix + 'auto_save', value);
                    }
                });
                
                Lampa.SettingsApi.addParam({
                    component: 'smart_filters_settings',
                    name: 'max_filters',
                    type: 'select',
                    value: Lampa.Storage.get(PLUGIN_CONFIG.storagePrefix + 'max_filters') || 20,
                    title: 'Максимум фильтров на категорию',
                    options: [
                        { value: 10, name: '10' },
                        { value: 20, name: '20' },
                        { value: 50, name: '50' },
                        { value: 100, name: '100' }
                    ],
                    onChange: function(value) {
                        Lampa.Storage.set(PLUGIN_CONFIG.storagePrefix + 'max_filters', value);
                    }
                });
            } catch(e) {
                console.error('[SmartFilters] Error creating settings section:', e);
            }
        },
        
        // Показать модальное окно настроек (упрощённая версия для v2)
        showSettingsModal: function() {
            const self = this;
            
            // Создаём простое модальное окно через стандартные методы Lampa v2
            if (typeof Lampa.Modal !== 'undefined') {
                Lampa.Modal.show({
                    title: 'Управление категориями',
                    html: `
                        <div class="smart-filters-categories-list">
                            ${this.renderCategoriesList()}
                        </div>
                        <div style="margin-top: 20px;">
                            <input type="text" class="modal-input" placeholder="Название новой категории" id="new_category_name" style="width: 100%; padding: 8px; margin-bottom: 10px;">
                            <button class="modal-button" id="add_category_btn">➕ Добавить категорию</button>
                        </div>
                    `,
                    onShow: function() {
                        document.getElementById('add_category_btn').onclick = function() {
                            const name = document.getElementById('new_category_name').value;
                            if (name && name.trim()) {
                                self.addCategory(name.trim());
                                self.showSettingsModal();
                            }
                        };
                        
                        // Добавляем обработчики для кнопок редактирования и удаления
                        document.querySelectorAll('[data-action="edit_category_v2"]').forEach(btn => {
                            btn.onclick = function() {
                                const id = this.getAttribute('data-id');
                                const currentName = this.getAttribute('data-name');
                                const newName = prompt('Введите новое название:', currentName);
                                if (newName && newName.trim()) {
                                    self.editCategory(id, newName.trim());
                                    self.showSettingsModal();
                                }
                            };
                        });
                        
                        document.querySelectorAll('[data-action="delete_category_v2"]').forEach(btn => {
                            btn.onclick = function() {
                                const id = this.getAttribute('data-id');
                                if (confirm('Удалить категорию и все фильтры в ней?')) {
                                    self.deleteCategory(id);
                                    self.showSettingsModal();
                                }
                            };
                        });
                    }
                });
            } else {
                // Фолбэк: обычный prompt
                let message = 'Управление категориями:\n\n';
                categories.forEach((cat, i) => {
                    message += `${i+1}. ${cat.name} (${cat.filters.length} фильтров)\n`;
                });
                message += '\nВведите номер категории для редактирования, или "новый" для создания:';
                
                const input = prompt(message);
                if (input) {
                    if (input.toLowerCase() === 'новый') {
                        const name = prompt('Введите название новой категории:');
                        if (name && name.trim()) this.addCategory(name.trim());
                    } else if (!isNaN(input) && input > 0 && input <= categories.length) {
                        const category = categories[input - 1];
                        const newName = prompt(`Редактировать "${category.name}":`, category.name);
                        if (newName && newName.trim()) this.editCategory(category.id, newName.trim());
                    }
                }
            }
        },
        
        // Рендер списка категорий
        renderCategoriesList: function() {
            if (categories.length === 0) {
                return '<div class="smart-filters-empty">Нет созданных категорий</div>';
            }
            
            return categories.map(cat => `
                <div class="smart-filters-category-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <div>
                        <strong>${this.escapeHtml(cat.name)}</strong>
                        <div style="font-size: 12px; color: rgba(255,255,255,0.6);">
                            Фильтров: ${cat.filters.length}
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="modal-button-small" data-action="edit_category_v2" data-id="${cat.id}" data-name="${this.escapeHtml(cat.name)}">✏️</button>
                        <button class="modal-button-small" data-action="delete_category_v2" data-id="${cat.id}">🗑️</button>
                    </div>
                </div>
            `).join('');
        },
        
        // Добавление новой категории
        addCategory: function(name) {
            const newCategory = {
                id: this.generateId(),
                name: name,
                filters: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            categories.push(newCategory);
            this.saveCategories();
            Lampa.Notify.show(`Категория "${name}" создана`, 2000);
        },
        
        // Редактирование категории
        editCategory: function(id, newName) {
            const category = categories.find(c => c.id === id);
            if (category) {
                const oldName = category.name;
                category.name = newName;
                category.updatedAt = Date.now();
                this.saveCategories();
                Lampa.Notify.show(`Категория "${oldName}" переименована в "${newName}"`, 2000);
            }
        },
        
        // Удаление категории
        deleteCategory: function(id) {
            const category = categories.find(c => c.id === id);
            if (category) {
                const name = category.name;
                categories = categories.filter(c => c.id !== id);
                this.saveCategories();
                Lampa.Notify.show(`Категория "${name}" удалена`, 2000);
            }
            
            if (currentCategory && currentCategory.id === id) {
                currentCategory = null;
            }
        },
        
        // Создание меню в боковой панели (адаптировано для v2)
        createSidebarMenu: function() {
            const self = this;
            
            // Проверяем, существует ли уже пункт меню
            if ($('.menu__item[data-name="smart_filters_root"]').length) return;
            
            // Создаём основной пункт меню
            const menuHtml = `
                <div class="menu__item" data-name="smart_filters_root">
                    <div class="menu__item-text">
                        🎯 ${PLUGIN_CONFIG.name}
                    </div>
                </div>
            `;
            
            // Вставляем в меню
            const settingsItem = $('.menu__item[data-name="settings"]');
            if (settingsItem.length) {
                settingsItem.before(menuHtml);
            } else {
                $('.menu__list').append(menuHtml);
            }
            
            // Обработчик для основного пункта
            $(document).off('hover:enter', '.menu__item[data-name="smart_filters_root"]');
            $(document).on('hover:enter', '.menu__item[data-name="smart_filters_root"]', function(e) {
                self.showCategoriesSubmenu();
            });
        },
        
        // Показать подменю с категориями
        showCategoriesSubmenu: function() {
            const self = this;
            
            // Удаляем существующее подменю
            $('.menu__submenu[data-parent="smart_filters_root"]').remove();
            
            if (categories.length === 0) {
                const emptyHtml = `
                    <div class="menu__submenu" data-parent="smart_filters_root">
                        <div class="menu__submenu-item" data-action="create_category">
                            <div class="menu__submenu-item-text">➕ Создать первую категорию</div>
                        </div>
                    </div>
                `;
                $('body').append(emptyHtml);
                
                $('[data-action="create_category"]').off('hover:enter').on('hover:enter', () => {
                    const name = prompt('Введите название категории:');
                    if (name && name.trim()) {
                        this.addCategory(name.trim());
                        this.showCategoriesSubmenu();
                    }
                });
                return;
            }
            
            let submenuHtml = `<div class="menu__submenu" data-parent="smart_filters_root">`;
            
            categories.forEach(category => {
                submenuHtml += `
                    <div class="menu__submenu-item" data-category-id="${category.id}" data-category-name="${this.escapeHtml(category.name)}">
                        <div class="menu__submenu-item-text">📁 ${this.escapeHtml(category.name)}</div>
                        <div class="menu__item-count">${category.filters.length}</div>
                    </div>
                `;
            });
            
            submenuHtml += `
                <div class="menu__submenu-item menu__submenu-item--divider" data-action="manage_categories">
                    <div class="menu__submenu-item-text">⚙️ Управление категориями</div>
                </div>
            `;
            
            submenuHtml += '</div>';
            $('body').append(submenuHtml);
            
            // Обработчик для категорий
            $('.menu__submenu-item[data-category-id]').off('hover:enter').on('hover:enter', function() {
                const categoryId = $(this).data('category-id');
                const category = categories.find(c => c.id === categoryId);
                if (category) {
                    self.showFiltersSubmenu(category);
                }
                $('.menu__submenu[data-parent="smart_filters_root"]').remove();
            });
            
            // Обработчик для управления категориями
            $('[data-action="manage_categories"]').off('hover:enter').on('hover:enter', () => {
                this.showSettingsModal();
                $('.menu__submenu[data-parent="smart_filters_root"]').remove();
            });
        },
        
        // Показать подменю с фильтрами категории
        showFiltersSubmenu: function(category) {
            const self = this;
            
            let submenuHtml = `
                <div class="menu__submenu" data-parent="smart_filters_${category.id}">
                    <div class="menu__submenu-item menu__submenu-item--header">
                        <div class="menu__submenu-item-text">📁 ${this.escapeHtml(category.name)}</div>
                    </div>
            `;
            
            if (category.filters.length === 0) {
                submenuHtml += `
                    <div class="menu__submenu-item">
                        <div class="menu__submenu-item-text" style="color: rgba(255,255,255,0.5);">Нет сохранённых фильтров</div>
                    </div>
                `;
            } else {
                category.filters.forEach((filter, index) => {
                    submenuHtml += `
                        <div class="menu__submenu-item" data-filter-id="${filter.id}">
                            <div class="menu__submenu-item-text">🔖 ${this.escapeHtml(filter.name)}</div>
                            <div class="menu__item-icon menu__item-icon--delete" data-action="delete_filter" data-filter-id="${filter.id}">✖</div>
                        </div>
                    `;
                });
            }
            
            submenuHtml += `
                <div class="menu__submenu-item menu__submenu-item--divider" data-action="save_current_filter">
                    <div class="menu__submenu-item-text">💾 Сохранить текущий фильтр</div>
                </div>
                <div class="menu__submenu-item" data-action="back_to_categories">
                    <div class="menu__submenu-item-text">← Назад к категориям</div>
                </div>
            `;
            
            submenuHtml += '</div>';
            $('body').append(submenuHtml);
            
            // Обработчик для применения фильтра
            $('.menu__submenu-item[data-filter-id]').off('hover:enter').on('hover:enter', function() {
                const filterId = $(this).data('filter-id');
                const filter = category.filters.find(f => f.id === filterId);
                if (filter && filter.params) {
                    self.applyFilter(filter.params);
                }
                $('.menu__submenu[data-parent="smart_filters_${category.id}"]').remove();
            });
            
            // Обработчик для удаления фильтра
            $('[data-action="delete_filter"]').off('hover:enter').on('hover:enter', function(e) {
                e.stopPropagation();
                const filterId = $(this).data('filter-id');
                if (confirm('Удалить этот фильтр?')) {
                    category.filters = category.filters.filter(f => f.id !== filterId);
                    category.updatedAt = Date.now();
                    self.saveCategories();
                    self.showFiltersSubmenu(category);
                }
                return false;
            });
            
            // Обработчик для сохранения текущего фильтра
            $('[data-action="save_current_filter"]').off('hover:enter').on('hover:enter', () => {
                this.saveCurrentFilterDialog(category);
                $('.menu__submenu[data-parent="smart_filters_${category.id}"]').remove();
            });
            
            // Обработчик для возврата к категориям
            $('[data-action="back_to_categories"]').off('hover:enter').on('hover:enter', () => {
                this.showCategoriesSubmenu();
            });
        },
        
        // Диалог сохранения текущего фильтра
        saveCurrentFilterDialog: function(category) {
            const self = this;
            const currentParams = this.getCurrentFilterParams();
            
            if (!currentParams || Object.keys(currentParams).length === 0) {
                Lampa.Notify.show('Нет активных параметров фильтрации', 3000);
                return;
            }
            
            const name = prompt('Введите название фильтра:', 'Мой фильтр');
            if (name && name.trim()) {
                this.saveFilterToCategory(category, name.trim(), currentParams);
                Lampa.Notify.show(`Фильтр "${name}" сохранён в "${category.name}"`, 2000);
            }
        },
        
        // Сохранение фильтра в категорию
        saveFilterToCategory: function(category, name, params) {
            const maxFilters = Lampa.Storage.get(PLUGIN_CONFIG.storagePrefix + 'max_filters') || 20;
            
            if (category.filters.length >= maxFilters) {
                if (confirm(`Достигнут лимит фильтров (${maxFilters}). Удалить самый старый?`)) {
                    category.filters.shift();
                } else {
                    return;
                }
            }
            
            const newFilter = {
                id: this.generateId(),
                name: name,
                params: params,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            category.filters.push(newFilter);
            category.updatedAt = Date.now();
            this.saveCategories();
        },
        
        // Получение текущих параметров фильтра (адаптировано для v2)
        getCurrentFilterParams: function() {
            try {
                const params = {};
                
                // В v2 структура может отличаться
                if (Lampa.Controller && Lampa.Controller.filters) {
                    const filterParams = Lampa.Controller.filters.params || Lampa.Controller.filters;
                    
                    if (filterParams.genres) params.genres = filterParams.genres;
                    if (filterParams.year) params.year = filterParams.year;
                    if (filterParams.countries) params.countries = filterParams.countries;
                    if (filterParams.sort) params.sort = filterParams.sort;
                    if (filterParams.rating) params.rating = filterParams.rating;
                    if (filterParams.keyword) params.keyword = filterParams.keyword;
                }
                
                // Получаем текущий раздел
                if (Lampa.Activity && Lampa.Activity.active) {
                    const currentActivity = Lampa.Activity.active();
                    if (currentActivity) {
                        params.section = currentActivity.title || currentActivity.name;
                        params.url = currentActivity.url;
                    }
                }
                
                return params;
            } catch(e) {
                console.error('[SmartFilters] Error getting filter params:', e);
                return null;
            }
        },
        
        // Применение сохранённого фильтра (адаптировано для v2)
        applyFilter: function(params) {
            try {
                if (!params) return;
                
                // Применяем параметры фильтрации
                if (Lampa.Controller && Lampa.Controller.filters) {
                    if (typeof Lampa.Controller.filters.setParams === 'function') {
                        Lampa.Controller.filters.setParams(params);
                    } else if (typeof Lampa.Controller.filters.set === 'function') {
                        Lampa.Controller.filters.set(params);
                    } else {
                        // Прямое присвоение
                        Lampa.Controller.filters.params = params;
                    }
                    
                    // Обновляем интерфейс
                    if (typeof Lampa.Controller.filters.update === 'function') {
                        Lampa.Controller.filters.update();
                    }
                    
                    // Перезагружаем контент
                    if (typeof Lampa.Controller.filters.reload === 'function') {
                        Lampa.Controller.filters.reload();
                    } else if (typeof Lampa.Controller.reload === 'function') {
                        Lampa.Controller.reload();
                    }
                }
                
                Lampa.Notify.show('Фильтр применён', 1500);
            } catch(e) {
                console.error('[SmartFilters] Error applying filter:', e);
                Lampa.Notify.show('Ошибка применения фильтра', 2000);
            }
        },
        
        // Добавление кнопки сохранения в интерфейс фильтра
        addSaveFilterButton: function() {
            const self = this;
            
            // Функция для добавления кнопки
            const addButton = function() {
                if ($('.smart-filters-save-btn').length) return;
                
                const saveButtonHtml = `
                    <div class="button smart-filters-save-btn" style="margin-left: 10px;">
                        <div class="button__icon">💾</div>
                        <div class="button__text">Сохранить фильтр</div>
                    </div>
                `;
                
                const filterPanel = $('.filter-panel .buttons, .filters-panel .buttons');
                if (filterPanel.length) {
                    filterPanel.append(saveButtonHtml);
                    
                    $('.smart-filters-save-btn').off('hover:enter').on('hover:enter', function() {
                        self.quickSaveFilter();
                    });
                }
            };
            
            // Пытаемся добавить сразу
            setTimeout(addButton, 1000);
            
            // Следим за изменениями в интерфейсе
            if (Lampa.Listener && Lampa.Listener.follow) {
                Lampa.Listener.follow('filter:render', addButton);
            }
        },
        
        // Быстрое сохранение фильтра
        quickSaveFilter: function() {
            const currentParams = this.getCurrentFilterParams();
            
            if (!currentParams || Object.keys(currentParams).length === 0) {
                Lampa.Notify.show('Нет активных параметров фильтрации', 2000);
                return;
            }
            
            // Если нет категорий, предлагаем создать
            if (categories.length === 0) {
                if (confirm('Нет категорий. Создать категорию "Избранное"?')) {
                    this.addCategory('Избранное');
                } else {
                    return;
                }
            }
            
            // Выбор категории для сохранения
            let categoryNames = categories.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
            const choice = prompt(`Выберите категорию для сохранения:\n${categoryNames}\n\nВведите номер или название:`);
            
            if (choice) {
                let selectedCategory = null;
                
                if (!isNaN(choice) && choice > 0 && choice <= categories.length) {
                    selectedCategory = categories[choice - 1];
                } else {
                    selectedCategory = categories.find(c => c.name.toLowerCase().includes(choice.toLowerCase()));
                }
                
                if (selectedCategory) {
                    const name = prompt('Введите название фильтра:', 'Мой фильтр');
                    if (name && name.trim()) {
                        this.saveFilterToCategory(selectedCategory, name.trim(), currentParams);
                        Lampa.Notify.show(`Фильтр сохранён в "${selectedCategory.name}"`, 2000);
                    }
                } else {
                    Lampa.Notify.show('Категория не найдена', 2000);
                }
            }
        },
        
        // Обновление меню категорий
        updateCategoriesMenu: function() {
            // Метод для обновления меню при изменении категорий
        },
        
        // Экранирование HTML
        escapeHtml: function(str) {
            if (!str) return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    };
    
    // Автозапуск для v2
    if (typeof Lampa !== 'undefined' && Lampa.Listener) {
        if (window.appready) {
            window.SmartFiltersPlugin.init();
        } else {
            Lampa.Listener.follow('app', function() {
                window.SmartFiltersPlugin.init();
            });
        }
    }
    
})();