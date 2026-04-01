(function() {
    'use strict';
    
    console.log('[SmartFilters] File loaded, checking conditions...');
    
    // Предотвращаем двойную инициализацию
    if (window.SmartFiltersPlugin && window.SmartFiltersPlugin.initialized) {
        console.log('[SmartFilters] Already initialized, skipping');
        return;
    }
    
    console.log('[SmartFilters] Starting initialization...');
    
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
    
    console.log('[SmartFilters] Config loaded:', PLUGIN_CONFIG);
    
    // --- Глобальные переменные плагина ---
    let categories = [];
    let currentCategory = null;
    let currentFilterParams = {};
    
    // --- UI Классы для стилизации ---
    const UI_CLASSES = {
        menuItem: 'menu__item',
        menuItemText: 'menu__item-text',
        menuSubmenu: 'menu__submenu',
        menuSubmenuItem: 'menu__submenu-item',
        button: 'button',
        buttonIcon: 'button__icon',
        input: 'input',
        select: 'select',
        checkbox: 'checkbox',
        modal: 'modal',
        modalContent: 'modal__content',
        modalHeader: 'modal__header',
        modalBody: 'modal__body',
        modalFooter: 'modal__footer'
    };
    
    // --- Основной объект плагина ---
    window.SmartFiltersPlugin = {
        initialized: false,
        
        // Инициализация плагина
        init: function() {
            console.log('[SmartFilters] init() called');
            
            if (this.initialized) {
                console.log('[SmartFilters] Already initialized, returning');
                return;
            }
            
            console.log(`[${PLUGIN_CONFIG.id}] Initializing...`);
            
            try {
                // Загружаем сохранённые категории
                this.loadCategories();
                console.log('[SmartFilters] Categories loaded:', categories.length);
                
                // Создаём раздел в настройках
                this.createSettingsSection();
                console.log('[SmartFilters] Settings section created');
                
                // Создаём меню в боковой панели
                this.createSidebarMenu();
                console.log('[SmartFilters] Sidebar menu created');
                
                // Добавляем кнопку сохранения в интерфейс фильтра
                this.addSaveFilterButton();
                console.log('[SmartFilters] Save button added');
                
                this.initialized = true;
                console.log(`[${PLUGIN_CONFIG.id}] Initialized successfully`);
                
                // Показываем уведомление
                if (Lampa.Notify) {
                    Lampa.Notify.show('Smart Filters плагин загружен', 2000);
                }
            } catch(e) {
                console.error('[SmartFilters] Initialization error:', e);
                if (Lampa.Notify) {
                    Lampa.Notify.show('Ошибка загрузки Smart Filters: ' + e.message, 3000);
                }
            }
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
        
        // Создание раздела в настройках
        createSettingsSection: function() {
            const self = this;
            
            try {
                // Проверяем наличие API настроек
                if (typeof Lampa.SettingsApi === 'undefined') {
                    console.log('[SmartFilters] SettingsApi not available');
                    return;
                }
                
                // Добавляем раздел в настройки
                Lampa.SettingsApi.addComponent({
                    id: PLUGIN_CONFIG.id,
                    name: PLUGIN_CONFIG.name,
                    icon: '🎯',
                    component: 'smart_filters_settings',
                    position: 100,
                    handler: function() {
                        self.showSettingsModal();
                    }
                });
                
                // Добавляем параметр автосохранения
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
                
                // Добавляем параметр лимита фильтров
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
        
        // Показать модальное окно настроек
        showSettingsModal: function() {
            const self = this;
            
            // Создаём модальное окно для управления категориями
            const modalHtml = `
                <div class="${UI_CLASSES.modal}" data-modal="smart_filters_settings" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center;">
                    <div class="${UI_CLASSES.modalContent}" style="background: #1a1a1a; border-radius: 12px; min-width: 400px; max-width: 90vw; max-height: 80vh; overflow: hidden;">
                        <div class="${UI_CLASSES.modalHeader}" style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0;">Управление категориями</h3>
                            <div class="${UI_CLASSES.button}" data-action="close" style="cursor: pointer;">✖</div>
                        </div>
                        <div class="${UI_CLASSES.modalBody}" style="padding: 20px; max-height: 60vh; overflow-y: auto;">
                            <div class="smart-filters-categories-list">
                                ${this.renderCategoriesList()}
                            </div>
                            <div class="smart-filters-add-category" style="margin-top: 20px;">
                                <input type="text" class="modal-input" placeholder="Название новой категории" id="new_category_name" style="width: 100%; padding: 10px; margin-bottom: 10px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff;">
                                <div class="${UI_CLASSES.button}" data-action="add_category" style="display: inline-block; padding: 10px 20px; background: #4caf50; border-radius: 6px; cursor: pointer; text-align: center;">➕ Добавить категорию</div>
                            </div>
                        </div>
                        <div class="${UI_CLASSES.modalFooter}" style="padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: flex-end;">
                            <div class="${UI_CLASSES.button}" data-action="close" style="padding: 8px 16px; background: rgba(255,255,255,0.1); border-radius: 6px; cursor: pointer;">Закрыть</div>
                        </div>
                    </div>
                </div>
            `;
            
            $('body').append(modalHtml);
            
            // Обработчики событий
            $('[data-action="close"]').on('hover:enter', function() {
                $('[data-modal="smart_filters_settings"]').remove();
            });
            
            $('[data-action="add_category"]').on('hover:enter', () => {
                const name = $('#new_category_name').val();
                if (name && name.trim()) {
                    this.addCategory(name.trim());
                    $('#new_category_name').val('');
                    $('[data-modal="smart_filters_settings"]').remove();
                    this.showSettingsModal();
                }
            });
            
            $('[data-action="edit_category"]').on('hover:enter', function() {
                const id = $(this).data('id');
                const currentName = $(this).data('name');
                const newName = prompt('Введите новое название:', currentName);
                if (newName && newName.trim()) {
                    self.editCategory(id, newName.trim());
                    $('[data-modal="smart_filters_settings"]').remove();
                    self.showSettingsModal();
                }
            });
            
            $('[data-action="delete_category"]').on('hover:enter', function() {
                const id = $(this).data('id');
                if (confirm('Удалить категорию и все фильтры в ней?')) {
                    self.deleteCategory(id);
                    $('[data-modal="smart_filters_settings"]').remove();
                    self.showSettingsModal();
                }
            });
        },
        
        // Рендер списка категорий
        renderCategoriesList: function() {
            if (categories.length === 0) {
                return '<div class="smart-filters-empty" style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">Нет созданных категорий</div>';
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
                        <div class="modal-button-small" data-action="edit_category" data-id="${cat.id}" data-name="${this.escapeHtml(cat.name)}" style="padding: 5px 10px; background: rgba(255,255,255,0.1); border-radius: 4px; cursor: pointer;">✏️</div>
                        <div class="modal-button-small" data-action="delete_category" data-id="${cat.id}" style="padding: 5px 10px; background: rgba(255,255,255,0.1); border-radius: 4px; cursor: pointer;">🗑️</div>
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
            if (Lampa.Notify) Lampa.Notify.show(`Категория "${name}" создана`, 2000);
        },
        
        // Редактирование категории
        editCategory: function(id, newName) {
            const category = categories.find(c => c.id === id);
            if (category) {
                const oldName = category.name;
                category.name = newName;
                category.updatedAt = Date.now();
                this.saveCategories();
                if (Lampa.Notify) Lampa.Notify.show(`Категория переименована в "${newName}"`, 2000);
            }
        },
        
        // Удаление категории
        deleteCategory: function(id) {
            const category = categories.find(c => c.id === id);
            if (category) {
                const name = category.name;
                categories = categories.filter(c => c.id !== id);
                this.saveCategories();
                if (Lampa.Notify) Lampa.Notify.show(`Категория "${name}" удалена`, 2000);
            }
            
            if (currentCategory && currentCategory.id === id) {
                currentCategory = null;
            }
        },
        
        // Создание меню в боковой панели
        createSidebarMenu: function() {
            const self = this;
            
            // Проверяем, существует ли уже пункт меню
            if ($('.menu__item[data-name="smart_filters_root"]').length) {
                console.log('[SmartFilters] Menu already exists');
                return;
            }
            
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
            
            console.log('[SmartFilters] Menu item added to sidebar');
            
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
                    <div class="menu__submenu" data-parent="smart_filters_root" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 220px;">
                        <div class="menu__submenu-item" data-action="create_category" style="padding: 12px 16px; cursor: pointer;">
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
            
            let submenuHtml = `<div class="menu__submenu" data-parent="smart_filters_root" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 220px;">`;
            
            categories.forEach(category => {
                submenuHtml += `
                    <div class="menu__submenu-item" data-category-id="${category.id}" data-category-name="${this.escapeHtml(category.name)}" style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div class="menu__submenu-item-text">📁 ${this.escapeHtml(category.name)}</div>
                        <div class="menu__item-count" style="background: rgba(76,175,80,0.3); border-radius: 12px; padding: 2px 8px;">${category.filters.length}</div>
                    </div>
                `;
            });
            
            submenuHtml += `
                <div class="menu__submenu-item menu__submenu-item--divider" data-action="manage_categories" style="padding: 12px 16px; cursor: pointer; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 5px;">
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
                <div class="menu__submenu" data-parent="smart_filters_${category.id}" style="position: absolute; background: rgba(0,0,0,0.95); border-radius: 8px; min-width: 220px;">
                    <div class="menu__submenu-item menu__submenu-item--header" style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">
                        <div class="menu__submenu-item-text">📁 ${this.escapeHtml(category.name)}</div>
                    </div>
            `;
            
            if (category.filters.length === 0) {
                submenuHtml += `
                    <div class="menu__submenu-item" style="padding: 12px 16px;">
                        <div class="menu__submenu-item-text" style="color: rgba(255,255,255,0.5);">Нет сохранённых фильтров</div>
                    </div>
                `;
            } else {
                category.filters.forEach((filter) => {
                    submenuHtml += `
                        <div class="menu__submenu-item" data-filter-id="${filter.id}" style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <div class="menu__submenu-item-text">🔖 ${this.escapeHtml(filter.name)}</div>
                            <div class="menu__item-icon menu__item-icon--delete" data-action="delete_filter" data-filter-id="${filter.id}" style="margin-left: 12px; cursor: pointer;">✖</div>
                        </div>
                    `;
                });
            }
            
            submenuHtml += `
                <div class="menu__submenu-item menu__submenu-item--divider" data-action="save_current_filter" style="padding: 12px 16px; cursor: pointer; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 5px;">
                    <div class="menu__submenu-item-text">💾 Сохранить текущий фильтр</div>
                </div>
                <div class="menu__submenu-item" data-action="back_to_categories" style="padding: 12px 16px; cursor: pointer;">
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
                if (Lampa.Notify) Lampa.Notify.show('Нет активных параметров фильтрации', 3000);
                return;
            }
            
            const name = prompt('Введите название фильтра:', 'Мой фильтр');
            if (name && name.trim()) {
                this.saveFilterToCategory(category, name.trim(), currentParams);
                if (Lampa.Notify) Lampa.Notify.show(`Фильтр "${name}" сохранён в "${category.name}"`, 2000);
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
        
        // Получение текущих параметров фильтра
        getCurrentFilterParams: function() {
            try {
                const params = {};
                
                // Получаем параметры из контроллера фильтров
                if (Lampa.Controller && Lampa.Controller.filters && Lampa.Controller.filters.params) {
                    const filterParams = Lampa.Controller.filters.params;
                    
                    if (filterParams.genres) params.genres = filterParams.genres;
                    if (filterParams.year) params.year = filterParams.year;
                    if (filterParams.countries) params.countries = filterParams.countries;
                    if (filterParams.sort) params.sort = filterParams.sort;
                    if (filterParams.rating) params.rating = filterParams.rating;
                    if (filterParams.keyword) params.keyword = filterParams.keyword;
                }
                
                // Добавляем информацию о текущем разделе
                if (Lampa.Activity && Lampa.Activity.active) {
                    const currentActivity = Lampa.Activity.active();
                    if (currentActivity) {
                        params.section = currentActivity.name || currentActivity.title;
                        params.url = currentActivity.url;
                    }
                }
                
                return params;
            } catch(e) {
                console.error('[SmartFilters] Error getting filter params:', e);
                return null;
            }
        },
        
        // Применение сохранённого фильтра
        applyFilter: function(params) {
            try {
                if (!params) return;
                
                // Применяем параметры фильтрации
                if (Lampa.Controller && Lampa.Controller.filters) {
                    if (typeof Lampa.Controller.filters.setParams === 'function') {
                        Lampa.Controller.filters.setParams(params);
                    } else {
                        Lampa.Controller.filters.params = params;
                    }
                    
                    // Обновляем интерфейс
                    if (typeof Lampa.Controller.filters.update === 'function') {
                        Lampa.Controller.filters.update();
                    }
                    
                    // Перезагружаем контент
                    if (typeof Lampa.Controller.filters.reload === 'function') {
                        Lampa.Controller.filters.reload();
                    }
                }
                
                if (Lampa.Notify) Lampa.Notify.show('Фильтр применён', 1500);
            } catch(e) {
                console.error('[SmartFilters] Error applying filter:', e);
                if (Lampa.Notify) Lampa.Notify.show('Ошибка применения фильтра', 2000);
            }
        },
        
        // Добавление кнопки сохранения в интерфейс фильтра
        addSaveFilterButton: function() {
            const self = this;
            
            // Функция для добавления кнопки
            const addButton = function() {
                if ($('.smart-filters-save-btn').length) return;
                
                const saveButtonHtml = `
                    <div class="button smart-filters-save-btn" style="margin-left: 10px; cursor: pointer;">
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
                    console.log('[SmartFilters] Save button added to filter panel');
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
                if (Lampa.Notify) Lampa.Notify.show('Нет активных параметров фильтрации', 2000);
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
                        if (Lampa.Notify) Lampa.Notify.show(`Фильтр сохранён в "${selectedCategory.name}"`, 2000);
                    }
                } else {
                    if (Lampa.Notify) Lampa.Notify.show('Категория не найдена', 2000);
                }
            }
        },
        
        // Обновление меню категорий
        updateCategoriesMenu: function() {
            // Метод для обновления меню при изменении категорий
            console.log('[SmartFilters] Categories updated, menu will refresh on next open');
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
    
    // Автозапуск
    console.log('[SmartFilters] Setting up auto-start...');
    
    if (typeof Lampa !== 'undefined' && Lampa.Listener) {
        if (window.appready) {
            console.log('[SmartFilters] App ready, starting now');
            window.SmartFiltersPlugin.init();
        } else {
            console.log('[SmartFilters] Waiting for app event');
            Lampa.Listener.follow('app', function() {
                console.log('[SmartFilters] App event received');
                window.SmartFiltersPlugin.init();
            });
        }
    } else {
        console.error('[SmartFilters] Lampa not available');
    }
    
})();
