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
    let currentFilterParams = {};
    
    // --- UI Классы для стилизации (адаптация под Lampa) ---
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
            if (this.initialized) return;
            
            console.log(`[${PLUGIN_CONFIG.id}] Initializing...`);
            
            // Загружаем сохранённые категории
            this.loadCategories();
            
            // Создаём раздел в настройках
            this.createSettingsSection();
            
            // Создаём меню в боковой панели
            this.createSidebarMenu();
            
            // Добавляем кнопку сохранения в интерфейс фильтра
            this.addSaveFilterButton();
            
            // Подписываемся на события Lampa
            this.subscribeToEvents();
            
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
        
        // Создание раздела в настройках
        createSettingsSection: function() {
            const self = this;
            
            // Добавляем раздел в настройки
            Lampa.SettingsApi.addComponent({
                id: PLUGIN_CONFIG.id,
                name: PLUGIN_CONFIG.name,
                icon: '<svg>...</svg>', // Иконка плагина
                component: 'smart_filters_settings',
                position: 100,
                handler: function() {
                    self.showSettingsModal();
                }
            });
            
            // Добавляем настройки плагина
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
        },
        
        // Показать модальное окно настроек
        showSettingsModal: function() {
            const self = this;
            
            // Создаём модальное окно для управления категориями
            const modalHtml = `
                <div class="${UI_CLASSES.modal}" data-modal="smart_filters_settings">
                    <div class="${UI_CLASSES.modalContent}" style="width: 600px;">
                        <div class="${UI_CLASSES.modalHeader}">
                            <h3>Управление категориями</h3>
                            <div class="${UI_CLASSES.button}" data-action="close">✖</div>
                        </div>
                        <div class="${UI_CLASSES.modalBody}">
                            <div class="smart-filters-categories-list">
                                ${this.renderCategoriesList()}
                            </div>
                            <div class="smart-filters-add-category" style="margin-top: 20px;">
                                <input type="text" class="${UI_CLASSES.input}" placeholder="Название новой категории" id="new_category_name">
                                <div class="${UI_CLASSES.button}" data-action="add_category">➕ Добавить категорию</div>
                            </div>
                        </div>
                        <div class="${UI_CLASSES.modalFooter}">
                            <div class="${UI_CLASSES.button}" data-action="close">Закрыть</div>
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
                    this.showSettingsModal(); // Обновляем модальное окно
                }
            });
            
            $('[data-action="edit_category"]').on('hover:enter', function() {
                const id = $(this).data('id');
                const newName = prompt('Введите новое название:', $(this).data('name'));
                if (newName && newName.trim()) {
                    self.editCategory(id, newName.trim());
                    self.showSettingsModal();
                }
            });
            
            $('[data-action="delete_category"]').on('hover:enter', function() {
                const id = $(this).data('id');
                if (confirm('Удалить категорию и все фильтры в ней?')) {
                    self.deleteCategory(id);
                    self.showSettingsModal();
                }
            });
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
                        <div class="${UI_CLASSES.button}" data-action="edit_category" data-id="${cat.id}" data-name="${this.escapeHtml(cat.name)}" style="padding: 5px 10px;">✏️</div>
                        <div class="${UI_CLASSES.button}" data-action="delete_category" data-id="${cat.id}" style="padding: 5px 10px;">🗑️</div>
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
        },
        
        // Редактирование категории
        editCategory: function(id, newName) {
            const category = categories.find(c => c.id === id);
            if (category) {
                category.name = newName;
                category.updatedAt = Date.now();
                this.saveCategories();
            }
        },
        
        // Удаление категории
        deleteCategory: function(id) {
            categories = categories.filter(c => c.id !== id);
            this.saveCategories();
            
            // Если удалена текущая категория, сбрасываем её
            if (currentCategory && currentCategory.id === id) {
                currentCategory = null;
            }
        },
        
        // Создание меню в боковой панели
        createSidebarMenu: function() {
            const self = this;
            
            // Создаём основной пункт меню
            const menuHtml = `
                <div class="${UI_CLASSES.menuItem}" data-name="smart_filters_root">
                    <div class="${UI_CLASSES.menuItemText}">
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
                    <div class="${UI_CLASSES.menuSubmenu}" data-parent="smart_filters_root">
                        <div class="${UI_CLASSES.menuSubmenuItem}" data-action="create_category">
                            <div class="${UI_CLASSES.menuItemText}">➕ Создать первую категорию</div>
                        </div>
                    </div>
                `;
                $('body').append(emptyHtml);
                
                $('[data-action="create_category"]').on('hover:enter', () => {
                    const name = prompt('Введите название категории:');
                    if (name && name.trim()) {
                        this.addCategory(name.trim());
                        this.showCategoriesSubmenu();
                    }
                });
                return;
            }
            
            let submenuHtml = `<div class="${UI_CLASSES.menuSubmenu}" data-parent="smart_filters_root">`;
            
            categories.forEach(category => {
                submenuHtml += `
                    <div class="${UI_CLASSES.menuSubmenuItem}" data-category-id="${category.id}" data-category-name="${this.escapeHtml(category.name)}">
                        <div class="${UI_CLASSES.menuItemText}">📁 ${this.escapeHtml(category.name)}</div>
                        <div class="menu__item-count">${category.filters.length}</div>
                    </div>
                `;
            });
            
            submenuHtml += `
                <div class="${UI_CLASSES.menuSubmenuItem} menu__submenu-item--divider" data-action="manage_categories">
                    <div class="${UI_CLASSES.menuItemText}">⚙️ Управление категориями</div>
                </div>
            `;
            
            submenuHtml += '</div>';
            $('body').append(submenuHtml);
            
            // Обработчик для категорий
            $('.menu__submenu-item[data-category-id]').on('hover:enter', function() {
                const categoryId = $(this).data('category-id');
                const category = categories.find(c => c.id === categoryId);
                if (category) {
                    self.showFiltersSubmenu(category);
                }
                $('.menu__submenu[data-parent="smart_filters_root"]').remove();
            });
            
            // Обработчик для управления категориями
            $('[data-action="manage_categories"]').on('hover:enter', () => {
                this.showSettingsModal();
                $('.menu__submenu[data-parent="smart_filters_root"]').remove();
            });
        },
        
        // Показать подменю с фильтрами категории
        showFiltersSubmenu: function(category) {
            const self = this;
            
            let submenuHtml = `
                <div class="${UI_CLASSES.menuSubmenu}" data-parent="smart_filters_${category.id}">
                    <div class="${UI_CLASSES.menuSubmenuItem} menu__submenu-item--header">
                        <div class="${UI_CLASSES.menuItemText}">📁 ${this.escapeHtml(category.name)}</div>
                    </div>
            `;
            
            if (category.filters.length === 0) {
                submenuHtml += `
                    <div class="${UI_CLASSES.menuSubmenuItem}">
                        <div class="${UI_CLASSES.menuItemText}" style="color: rgba(255,255,255,0.5);">Нет сохранённых фильтров</div>
                    </div>
                `;
            } else {
                category.filters.forEach((filter, index) => {
                    submenuHtml += `
                        <div class="${UI_CLASSES.menuSubmenuItem}" data-filter-id="${filter.id}">
                            <div class="${UI_CLASSES.menuItemText}">🔖 ${this.escapeHtml(filter.name)}</div>
                            <div class="menu__item-icon menu__item-icon--delete" data-action="delete_filter" data-filter-id="${filter.id}">✖</div>
                        </div>
                    `;
                });
            }
            
            submenuHtml += `
                <div class="${UI_CLASSES.menuSubmenuItem} menu__submenu-item--divider" data-action="save_current_filter">
                    <div class="${UI_CLASSES.menuItemText}">💾 Сохранить текущий фильтр</div>
                </div>
                <div class="${UI_CLASSES.menuSubmenuItem}" data-action="back_to_categories">
                    <div class="${UI_CLASSES.menuItemText}">← Назад к категориям</div>
                </div>
            `;
            
            submenuHtml += '</div>';
            $('body').append(submenuHtml);
            
            // Обработчик для применения фильтра
            $('.menu__submenu-item[data-filter-id]').on('hover:enter', function() {
                const filterId = $(this).data('filter-id');
                const filter = category.filters.find(f => f.id === filterId);
                if (filter && filter.params) {
                    self.applyFilter(filter.params);
                }
                $('.menu__submenu[data-parent="smart_filters_${category.id}"]').remove();
            });
            
            // Обработчик для удаления фильтра
            $('[data-action="delete_filter"]').on('hover:enter', function(e) {
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
            $('[data-action="save_current_filter"]').on('hover:enter', () => {
                this.saveCurrentFilterDialog(category);
                $('.menu__submenu[data-parent="smart_filters_${category.id}"]').remove();
            });
            
            // Обработчик для возврата к категориям
            $('[data-action="back_to_categories"]').on('hover:enter', () => {
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
            
            const modalHtml = `
                <div class="${UI_CLASSES.modal}" data-modal="save_filter">
                    <div class="${UI_CLASSES.modalContent}" style="width: 500px;">
                        <div class="${UI_CLASSES.modalHeader}">
                            <h3>Сохранить фильтр</h3>
                            <div class="${UI_CLASSES.button}" data-action="close">✖</div>
                        </div>
                        <div class="${UI_CLASSES.modalBody}">
                            <div style="margin-bottom: 15px;">
                                <label>Название фильтра:</label>
                                <input type="text" class="${UI_CLASSES.input}" id="filter_name" placeholder="Например: Боевики 2024" autocomplete="off">
                            </div>
                            <div>
                                <label>Параметры фильтра:</label>
                                <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; margin-top: 5px; font-size: 12px;">
                                    ${this.formatFilterParams(currentParams)}
                                </div>
                            </div>
                        </div>
                        <div class="${UI_CLASSES.modalFooter}">
                            <div class="${UI_CLASSES.button}" data-action="cancel">Отмена</div>
                            <div class="${UI_CLASSES.button} button--green" data-action="save">Сохранить</div>
                        </div>
                    </div>
                </div>
            `;
            
            $('body').append(modalHtml);
            
            $('[data-action="close"], [data-action="cancel"]').on('hover:enter', function() {
                $('[data-modal="save_filter"]').remove();
            });
            
            $('[data-action="save"]').on('hover:enter', () => {
                const name = $('#filter_name').val();
                if (name && name.trim()) {
                    this.saveFilterToCategory(category, name.trim(), currentParams);
                    $('[data-modal="save_filter"]').remove();
                    Lampa.Notify.show(`Фильтр "${name}" сохранён`, 2000);
                } else {
                    Lampa.Notify.show('Введите название фильтра', 2000);
                }
            });
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
                const currentActivity = Lampa.Activity.active();
                if (currentActivity && currentActivity.name) {
                    params.section = currentActivity.name;
                    params.url = currentActivity.url;
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
                    Lampa.Controller.filters.setParams(params);
                    
                    // Обновляем интерфейс
                    if (Lampa.Controller.filters.update) {
                        Lampa.Controller.filters.update();
                    }
                    
                    // Перезагружаем контент
                    if (Lampa.Controller.filters.reload) {
                        Lampa.Controller.filters.reload();
                    }
                }
                
                // Если указан раздел, переходим в него
                if (params.section && params.url) {
                    Lampa.Activity.push({
                        url: params.url,
                        title: params.section
                    });
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
            
            // Ждём загрузки интерфейса фильтра
            Lampa.Listener.follow('filter:render', function() {
                // Проверяем, есть ли уже кнопка
                if ($('.smart-filters-save-btn').length) return;
                
                // Добавляем кнопку в интерфейс фильтра
                const saveButtonHtml = `
                    <div class="button smart-filters-save-btn" style="margin-left: 10px;">
                        <div class="button__icon">💾</div>
                        <div class="button__text">Сохранить фильтр</div>
                    </div>
                `;
                
                // Вставляем кнопку в панель фильтров
                const filterPanel = $('.filter-panel .buttons');
                if (filterPanel.length) {
                    filterPanel.append(saveButtonHtml);
                    
                    $('.smart-filters-save-btn').on('hover:enter', function() {
                        self.quickSaveFilter();
                    });
                }
            });
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
            const categoryNames = categories.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
            const choice = prompt(`Выберите категорию для сохранения:\n${categoryNames}\n\nВведите номер или название:`);
            
            if (choice) {
                let selectedCategory = null;
                
                // Поиск по номеру
                if (!isNaN(choice) && choice > 0 && choice <= categories.length) {
                    selectedCategory = categories[choice - 1];
                } else {
                    // Поиск по названию
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
            // Обновляем существующее меню при изменении категорий
            if ($('.menu__item[data-name="smart_filters_root"]').length) {
                // Просто пересоздаём подменю при следующем открытии
                // Ничего не делаем, т.к. подменю создаётся динамически
            }
        },
        
        // Подписка на события Lampa
        subscribeToEvents: function() {
            const self = this;
            const autoSave = Lampa.Storage.get(PLUGIN_CONFIG.storagePrefix + 'auto_save') || true;
            
            if (autoSave) {
                // Автосохранение последнего использованного фильтра
                Lampa.Listener.follow('filter:change', function(params) {
                    if (params && Object.keys(params).length > 0) {
                        Lampa.Storage.set(PLUGIN_CONFIG.storagePrefix + 'last_filter', params);
                    }
                });
                
                // Восстановление последнего фильтра при запуске
                const lastFilter = Lampa.Storage.get(PLUGIN_CONFIG.storagePrefix + 'last_filter');
                if (lastFilter) {
                    setTimeout(() => {
                        self.applyFilter(lastFilter);
                    }, 1000);
                }
            }
        },
        
        // Форматирование параметров фильтра для отображения
        formatFilterParams: function(params) {
            const lines = [];
            
            if (params.genres && params.genres.length) {
                lines.push(`Жанры: ${params.genres.join(', ')}`);
            }
            if (params.year) {
                lines.push(`Год: ${params.year}`);
            }
            if (params.countries && params.countries.length) {
                lines.push(`Страны: ${params.countries.join(', ')}`);
            }
            if (params.sort) {
                lines.push(`Сортировка: ${params.sort}`);
            }
            if (params.rating) {
                lines.push(`Рейтинг: ${params.rating}`);
            }
            if (params.keyword) {
                lines.push(`Поиск: ${params.keyword}`);
            }
            
            return lines.length ? lines.join('<br>') : 'Нет параметров';
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
    
    // Экспортируем плагин
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.SmartFiltersPlugin;
    }
    
})();