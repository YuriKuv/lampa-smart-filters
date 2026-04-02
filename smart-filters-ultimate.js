(function() {
    'use strict';

    if (window.SmartFiltersUltimate) return;
    window.SmartFiltersUltimate = true;

    console.log('[SmartFilters] Плагин загружается...');

    // --- Хранилище ---
    const STORAGE_KEY = 'smart_filters_saved_list';
    let savedFilters = [];

    // --- Загрузка и сохранение ---
    function loadFilters() {
        const data = Lampa.Storage.get(STORAGE_KEY);
        savedFilters = Array.isArray(data) ? data : [];
        updateMenu();
    }

    function saveFilters() {
        Lampa.Storage.set(STORAGE_KEY, savedFilters);
        updateMenu();
    }

    // --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ПРИМЕНЕНИЯ ФИЛЬТРА (ГЛАВНЫЙ СЕКРЕТ!) ---
    // Эта функция принимает ID раздела ('movie', 'tv', 'anime' и т.д.) и параметры фильтра
    function applyFilterToSection(sectionComponent, filterParams) {
        console.log(`[SmartFilters] Применяю фильтр к разделу ${sectionComponent}`, filterParams);

        // 1. Переходим в целевой раздел (например, 'movie').
        //    Lampa сама создаст правильный компонент и загрузит начальные данные.
        Lampa.Activity.push({
            component: sectionComponent,
            url: '',
            title: 'Загрузка...'
        });

        // 2. Ждем, когда переход завершится и компонент фильтра будет готов.
        //    Проверяем каждые 100 мс, до 2 секунд.
        let attempts = 0;
        const maxAttempts = 20;
        const interval = setInterval(() => {
            attempts++;
            // Проверяем, существует ли контроллер фильтров у текущего раздела
            if (Lampa.Controller && Lampa.Controller.filters) {
                clearInterval(interval);
                console.log('[SmartFilters] Контроллер фильтра найден, применяю параметры...');

                // 3. Применяем сохраненные параметры к фильтру.
                //    Это самый надежный способ в Lampa.
                if (typeof Lampa.Controller.filters.setParams === 'function') {
                    Lampa.Controller.filters.setParams(filterParams);
                } else {
                    Lampa.Controller.filters.params = filterParams;
                }

                // 4. Обновляем интерфейс фильтра (чтобы отметки отобразились).
                if (Lampa.Controller.filters.update) Lampa.Controller.filters.update();

                // 5. Перезагружаем контент, чтобы результаты применились.
                if (Lampa.Controller.filters.reload) Lampa.Controller.filters.reload();

                // 6. (Опционально) Закрываем панель фильтрации, если она открылась.
                //    Если вы хотите, чтобы панель оставалась открытой, закомментируйте эту строку.
                if (Lampa.Controller.filters.close) Lampa.Controller.filters.close();

                Lampa.Noty.show('✓ Фильтр применен!', 1500);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                console.error('[SmartFilters] Не удалось найти контроллер фильтра');
                Lampa.Noty.show('Ошибка: не удалось применить фильтр', 2000);
            }
        }, 100);
    }


    // --- Применение сохраненного фильтра (точка входа) ---
    function applySavedFilter(filter) {
        console.log('[SmartFilters] Выбран фильтр:', filter.name, filter.params);

        // Определяем, в какой раздел нужно перейти, основываясь на типе контента.
        let targetSection = 'movie'; // По умолчанию фильмы
        if (filter.params.type === 'Сериалы') {
            targetSection = 'tv';
        }
        // Если нужно добавить поддержку Аниме и т.д., просто добавьте условия.

        // Вызываем главную функцию для применения фильтра
        applyFilterToSection(targetSection, filter.params);
    }


    // --- Получение параметров из открытой панели фильтра ---
    function getCurrentFilterFromPanel() {
        // Эта функция собирает ВСЕ параметры из DOM-элементов панели фильтрации.
        // ВАЖНО: Если в вашей версии Lampa другие названия полей, их нужно скорректировать.
        try {
            const params = {};

            const getSubtitle = (containsText) => {
                const el = $(`.selectbox-item:contains("${containsText}") .selectbox-item__subtitle`);
                return (el.length && el.text() !== 'Не выбрано') ? el.text() : null;
            };

            const type = getSubtitle('Тип');
            if (type) params.type = type;

            const rating = getSubtitle('Рейтинг');
            if (rating) {
                const match = rating.match(/\d+/);
                if (match) params['vote_average.gte'] = match[0];
            }

            const genre = getSubtitle('Жанр');
            if (genre) params.with_genres = genre;

            const year = getSubtitle('Год');
            if (year && year.match(/^\d{4}$/)) params.primary_release_year = year;

            console.log('[SmartFilters] Собранные параметры из панели:', params);
            return Object.keys(params).length ? params : null;
        } catch (e) {
            console.error('[SmartFilters] Ошибка при сборе параметров:', e);
            return null;
        }
    }

    // --- Сохранение текущего фильтра ---
    function saveCurrentFilter() {
        const params = getCurrentFilterFromPanel();

        if (!params) {
            Lampa.Noty.show('✗ Сначала выберите параметры в фильтре', 2000);
            return;
        }

        const name = prompt('Введите название фильтра:', 'Мой фильтр');
        if (name && name.trim()) {
            savedFilters.push({
                id: Date.now(),
                name: name.trim(),
                params: params,
                date: new Date().toLocaleString()
            });
            saveFilters();
            Lampa.Noty.show(`✓ Фильтр "${name}" сохранён`, 2000);
        }
    }

    // --- Управление фильтрами (Удаление, Очистка) ---
    function deleteFilter(id, name) {
        Lampa.Select.show({
            title: `Удалить "${name}"?`,
            items: [{ title: 'Да' }, { title: 'Нет' }],
            onSelect: (item) => {
                if (item.title === 'Да') {
                    savedFilters = savedFilters.filter(f => f.id !== id);
                    saveFilters();
                    Lampa.Noty.show('Фильтр удалён', 1000);
                }
            }
        });
    }

    function clearAllFilters() {
        if (savedFilters.length === 0) return;
        Lampa.Select.show({
            title: 'Удалить ВСЕ фильтры?',
            items: [{ title: 'Да' }, { title: 'Нет' }],
            onSelect: (item) => {
                if (item.title === 'Да') {
                    savedFilters = [];
                    saveFilters();
                    Lampa.Noty.show('Все фильтры удалены', 1000);
                }
            }
        });
    }

    // --- Обновление левого меню ---
    function updateMenu() {
        $('.menu__item[data-smart-filter="true"]').remove();

        const filterMenuItem = $('.menu__item[data-action="filter"]');
        if (!filterMenuItem.length) return;

        savedFilters.forEach(filter => {
            const menuItem = $(`
                <li class="menu__item selector" data-smart-filter="true">
                    <div class="menu__ico">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                        </svg>
                    </div>
                    <div class="menu__text">🔖 ${filter.name}</div>
                </li>
            `);
            filterMenuItem.after(menuItem);
            menuItem.on('hover:enter', () => applySavedFilter(filter));
        });
    }

    // --- Добавление основного пункта "Мои фильтры" в меню ---
    function addMainMenuButton() {
        $('.menu__item[data-smart-main="true"]').remove();

        const filterMenuItem = $('.menu__item[data-action="filter"]');
        if (!filterMenuItem.length) return;

        const mainMenuButton = $(`
            <li class="menu__item selector" data-smart-main="true">
                <div class="menu__ico">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2zM8 4h2v16H8V4zM14 4h2v16h-2V4z"/>
                    </svg>
                </div>
                <div class="menu__text">📁 Мои фильтры</div>
            </li>
        `);
        filterMenuItem.after(mainMenuButton);

        mainMenuButton.on('hover:enter', () => {
            if (savedFilters.length === 0) {
                Lampa.Noty.show('Нет сохранённых фильтров', 2000);
                return;
            }
            const items = savedFilters.map(f => ({ title: f.name, subtitle: f.date, filter: f }));
            Lampa.Select.show({
                title: 'Мои фильтры',
                items: items,
                onSelect: (item) => applySavedFilter(item.filter)
            });
        });
    }

    // --- Кнопка "Сохранить фильтр" в панели фильтрации ---
    function addSaveButtonToFilterPanel() {
        const interval = setInterval(() => {
            const filterPanelBody = $('.selectbox__body');
            if (filterPanelBody.length && !$('.smart-save-filter-btn').length) {
                const saveButton = $(`
                    <div class="selectbox-item selector smart-save-filter-btn" style="border-top:1px solid rgba(255,255,255,0.1);margin-top:0.5em;">
                        <div class="selectbox-item__title">💾 Сохранить фильтр</div>
                    </div>
                `);
                saveButton.on('hover:enter', saveCurrentFilter);
                filterPanelBody.append(saveButton);
                clearInterval(interval);
                console.log('[SmartFilters] Кнопка сохранения добавлена');
            }
        }, 1000);
    }

    // --- Добавление раздела в настройки ---
    function addSettingsSection() {
        if (!Lampa.SettingsApi) return;
        Lampa.SettingsApi.addComponent({ component: 'smart_filters', name: 'Smart Filters', icon: '🔖' });
        Lampa.SettingsApi.addParam({
            component: 'smart_filters',
            param: { name: 'clear', type: 'button' },
            field: { name: 'Очистить все фильтры' },
            onChange: clearAllFilters
        });
    }

    // --- Инициализация плагина ---
    function init() {
        console.log('[SmartFilters] Инициализация...');
        loadFilters();
        addMainMenuButton();
        addSaveButtonToFilterPanel();
        addSettingsSection();
        console.log('[SmartFilters] Плагин успешно загружен и готов к работе!');
        Lampa.Noty.show('Smart Filters загружен', 1500);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', init);
})();
