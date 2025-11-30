document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // DOM ELEMENTS
    // ============================================

    // Block Sections
    const block1PatientSearch = document.getElementById('block-1-patient-search');
    const block2AnalysisSelection = document.getElementById('block-2-analysis-selection');
    const block3AdditionalInfo = document.getElementById('block-3-additional-info');
    const block4Confirmation = document.getElementById('block-4-confirmation');
    const analysisRegistrationUnavailable = document.getElementById('analysis-registration-unavailable');

    // Header
    const headerSubtitle = document.getElementById('header-subtitle');

    // Step Indicator Elements
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');
    const step4 = document.getElementById('step-4');
    const line1 = document.getElementById('line-1');
    const line2 = document.getElementById('line-2');
    const line3 = document.getElementById('line-3');

    // Block 1: Patient Search
    const lastNameInput = document.getElementById('lastName');
    const firstNameInput = document.getElementById('firstName');
    const searchPatientBtn = document.getElementById('search-patient-btn');
    const clearPatientBtn = document.getElementById('clear-patient-btn');
    const searchResultsContainer = document.getElementById('search-results-container');
    const patientSearchResults = document.getElementById('patient-search-results');
    const patientSearchLoader = document.getElementById('patient-search-loader');
    const patientSearchError = document.getElementById('patient-search-error');
    const paginationControls = document.getElementById('pagination-controls');
    const selectedPatientInfo = document.getElementById('selected-patient-info');
    const patientDetails = document.getElementById('patient-details');
    const createPatientContainer = document.getElementById('create-patient-container');
    const createPatientForm = document.getElementById('create-patient-form');
    const showCreatePatientFormBtn = document.getElementById('show-create-patient-form-btn');
    const newPatientDob = document.getElementById('new-patient-dob');
    const newPatientPhone = document.getElementById('new-patient-phone');
    const newPatientGender = document.getElementById('new-patient-gender');
    const createPatientBtn = document.getElementById('create-patient-btn');

    // Block 2: Analysis Selection
    const analysisSearchInput = document.getElementById('analysis-search-input');
    const analysisList = document.getElementById('analysis-list');
    const analysisListLoader = document.getElementById('analysis-list-loader');
    const analysisListError = document.getElementById('analysis-list-error');
    const selectedAnalysesList = document.getElementById('selected-analyses-list');
    const noAnalysesSelected = document.getElementById('no-analyses-selected');
    const totalPriceEl = document.getElementById('total-price');
    const discountSelect = document.getElementById('discount-select');
    const backFromAnalysesBtn = document.getElementById('back-from-analyses-btn');
    const nextToAdditionalInfoBtn = document.getElementById('next-to-additional-info-btn');

    // Block 3: Additional Info
    const registrationNotes = document.getElementById('registration-notes');
    const recipientSearchInput = document.getElementById('recipient-search-input');
    const recipientListContainer = document.getElementById('recipient-list-container');
    const recipientListLoader = document.getElementById('recipient-list-loader');
    const recipientListError = document.getElementById('recipient-list-error');
    const selectedRecipientContainer = document.getElementById('selected-recipient-container');
    const prioritySelect = document.getElementById('priority-select'); // <-- ДОДАНО
    const selectedRecipientName = document.getElementById('selected-recipient-name');
    const clearRecipientBtn = document.getElementById('clear-recipient-btn');
    const backFromAdditionalInfoBtn = document.getElementById('back-from-additional-info-btn');
    const nextToConfirmationBtn = document.getElementById('next-to-confirmation-btn');

    // Block 4: Confirmation
    const confirmationPatientInfo = document.getElementById('confirmation-patient-info');
    const confirmationAnalysesList = document.getElementById('confirmation-analyses-list');
    const confirmationTotalPrice = document.getElementById('confirmation-total-price');
    const confirmationRecipientContainer = document.getElementById('confirmation-recipient-container');
    const confirmationPriorityInfo = document.getElementById('confirmation-priority-info');
    const confirmationRecipientInfo = document.getElementById('confirmation-recipient-info');
    const backFromConfirmationBtn = document.getElementById('back-from-confirmation-btn');
    const registerAnalysisBtn = document.getElementById('register-analysis-btn');
    const printLabelsBtn = document.getElementById('print-labels-btn');
    const confirmCodesBtn = document.getElementById('confirm-codes-btn');

    // Navigation
    const backBtn = document.getElementById('back-btn');
    const forwardBtn = document.getElementById('forward-btn');

    // Modal
    const successModal = document.getElementById('success-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const infoModal = document.getElementById('info-modal');
    const infoModalIconContainer = document.getElementById('info-modal-icon-container');
    const infoModalIcon = document.getElementById('info-modal-icon');
    const infoModalTitle = document.getElementById('info-modal-title');
    const infoModalMessage = document.getElementById('info-modal-message');
    const closeInfoModalBtn = document.getElementById('close-info-modal-btn');

    // ============================================
    // STATE VARIABLES
    // ============================================

    let currentBlock = 1;
    let allAnalyses = [];
    let selectedAnalyses = [];
    let selectedAnalysisCodes = []; // Масив кодів, який будем формувати для відправки в БД
    let selectedPriradenie = []; // Новий масив для збереження значень поля `priradenie`
    let allRecipients = [];
    let selectedRecipient = null;
    let selectedPriority = 'b'; // <-- ДОДАНО: Значення за замовчуванням
    let selectedPatient = null;
    let currentPage = 1;
    const limit = 10;

    // ============================================
    // INITIALIZATION
    // ============================================

    async function initialize() {
        // Check configuration for analysis registration availability
        const config = await getConfig();
        if (config.dbType !== 'sybase' || !config.hasAnalysisRegistration) {
            block1PatientSearch.classList.add('hidden');
            block2AnalysisSelection.classList.add('hidden');
            block3AdditionalInfo.classList.add('hidden');
            block4Confirmation.classList.add('hidden');
            analysisRegistrationUnavailable.classList.remove('hidden');
            return;
        }

    }

    async function getConfig() {
        try {
            const response = await fetch('/config');
            return await response.json();
        } catch (error) {
            console.error('Error fetching config:', error);
            return {};
        }
    }

    // ============================================
    // UI STATE MANAGEMENT
    // ============================================

    function showBlock(blockNumber) {
        // Hide all blocks
        block1PatientSearch.classList.remove('active');
        block2AnalysisSelection.classList.remove('active');
        block3AdditionalInfo.classList.remove('active');
        block4Confirmation.classList.remove('active');

        // Show requested block
        if (blockNumber === 1) {
            block1PatientSearch.classList.add('active');
            updateStepIndicator(1);
            currentBlock = 1;
        } else if (blockNumber === 2) {
            block2AnalysisSelection.classList.add('active');
            updateStepIndicator(2);
            currentBlock = 2;
            // Завантажуємо аналізи тільки при переході на цей крок, якщо вони ще не завантажені
            if (allAnalyses.length === 0) loadAnalyses();
            // Очищуємо аналізи, тільки якщо переходимо на цей крок вперше (коли масив ще порожній)
            // Це дозволяє зберігати вибір при навігації "назад-вперед"
            if (selectedAnalyses.length === 0) {
                selectedAnalysisCodes = [];
                selectedPriradenie = [];
                renderSelectedAnalyses();
            }
        } else if (blockNumber === 3) {
            block3AdditionalInfo.classList.add('active');
            updateStepIndicator(3);
            currentBlock = 3;
            // Завантажуємо отримувачів тільки при переході на цей крок, якщо вони ще не завантажені
            if (allRecipients.length === 0) loadRecipients();
        } else if (blockNumber === 4) {
            block4Confirmation.classList.add('active');
            updateStepIndicator(4);
            currentBlock = 4;
        }
    }

    function updateStepIndicator(activeStep) {
        // Reset all steps
        [step1, step2, step3, step4].forEach(step => {
            step.classList.remove('active', 'completed');
        });
        [line1, line2, line3].forEach(line => {
            line.classList.remove('active');
        });

        // Mark completed steps
        if (activeStep >= 1) {
            step1.classList.add(activeStep === 1 ? 'active' : 'completed');
        }
        if (activeStep >= 2) {
            line1.classList.add(activeStep >= 2 ? 'active' : '');
            step2.classList.add(activeStep === 2 ? 'active' : activeStep > 2 ? 'completed' : '');
        }
        if (activeStep >= 3) {
            line2.classList.add('active');
            step3.classList.add(activeStep === 3 ? 'active' : activeStep > 3 ? 'completed' : '');
        }
        if (activeStep >= 4) {
            line3.classList.add('active');
            step4.classList.add(activeStep === 4 ? 'active' : 'completed');
        }
    }

    function hideInfoModal() {
        infoModal.classList.add('hidden');
        infoModal.classList.remove('flex');
    }

    closeInfoModalBtn.addEventListener('click', hideInfoModal);


    // ============================================
    // BLOCK 1: PATIENT SEARCH
    // ============================================

    searchPatientBtn.addEventListener('click', () => searchPatients(1));
    clearPatientBtn.addEventListener('click', resetPatientSearch);

    // Header navigation
    backBtn.addEventListener('click', () => {
        if (currentBlock > 1) {
            showBlock(currentBlock - 1);
        }
    });

    forwardBtn.addEventListener('click', () => {
        if (currentBlock < 4) {
            // Add validation if needed before going to the next step
            if (currentBlock === 1 && !selectedPatient) {
                showInfoModal('warning', 'Пацієнта не обрано', 'Будь ласка, оберіть пацієнта, щоб перейти до наступного кроку.');
                return;
            }
            showBlock(currentBlock + 1);
        }
    });

    async function searchPatients(page) {
        const lastName = lastNameInput.value.trim();
        if (!lastName) {
            patientSearchError.textContent = 'Прізвище є обов\'язковим для пошуку.';
            patientSearchError.classList.remove('hidden');
            return;
        }

        currentPage = page;
        patientSearchLoader.classList.remove('hidden');
        patientSearchError.classList.add('hidden');
        patientSearchResults.innerHTML = '';
        createPatientContainer.classList.add('hidden'); // Сховати форму створення
        searchResultsContainer.classList.remove('hidden');

        try {
            const response = await fetch('/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lastName,
                    firstName: firstNameInput.value.trim(),
                    page: currentPage,
                    limit,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Помилка сервера');
            }

            const data = await response.json();
            displayPatientResults(data.results, data.total);

        } catch (error) {
            // Використовуємо модальне вікно для відображення помилки
            showInfoModal('error', 'Помилка пошуку', error.message);
            // Також можна залишити повідомлення в блоці помилок
            patientSearchError.textContent = error.message;
            patientSearchError.classList.remove('hidden');
        } finally {
            patientSearchLoader.classList.add('hidden');
        }
    }

    function displayPatientResults(patients, total) {
        patientSearchResults.innerHTML = '';
        if (patients.length === 0) {
            // Якщо пацієнтів не знайдено, показуємо форму створення
            patientSearchResults.innerHTML = '<p class="p-4 text-gray-500 text-center">Пацієнта не знайдено. Ви можете створити нового.</p>';
            createPatientContainer.classList.remove('hidden');
            // Автоматично заповнюємо поля з полів пошуку
            document.getElementById('new-patient-lastName').value = lastNameInput.value.trim();
            document.getElementById('new-patient-firstName').value = firstNameInput.value.trim();
            return;
        }

        patients.forEach(patient => {
            const div = document.createElement('div');
            div.className = 'p-3 border-b hover:bg-gray-100 cursor-pointer transition-colors';
            div.innerHTML = `
                <div class="font-medium text-gray-800">${patient.priezvisko} ${patient.meno || ''}</div>
                <div class="text-sm text-gray-600">ДН: ${patient.datumnarod || 'не вказано'} | Телефон: ${patient.tel || 'не вказано'}</div>
            `;
            div.addEventListener('click', () => selectPatient(patient));
            patientSearchResults.appendChild(div);
        });

        renderPagination(total);
    }

    function renderPagination(total) {
        paginationControls.innerHTML = '';
        const totalPages = Math.ceil(total / limit);

        if (totalPages <= 1) return;

        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.className = `px-3 py-1 border rounded transition-colors ${i === currentPage
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`;
            btn.addEventListener('click', () => searchPatients(i));
            paginationControls.appendChild(btn);
        }
    }

    function selectPatient(patient) {
        selectedPatient = patient;
        console.log('Обраний пацієнт:', patient);
        patientDetails.innerHTML = `
            <strong>${patient.priezvisko} ${patient.meno || ''}</strong><br>
            Дата народження: ${patient.datumnarod || 'не вказано'}<br>
            Телефон: ${patient.tel || 'не вказано'}
        `;
        selectedPatientInfo.classList.remove('hidden');
        if (forwardBtn) forwardBtn.classList.remove('hidden');
        searchResultsContainer.classList.add('hidden');

        // Update header subtitle
        if (headerSubtitle) {
            // Видаляємо час з дати народження, якщо він є
            const dobOnly = patient.datumnarod ? patient.datumnarod.split(' ')[0] : 'не вказано';
            headerSubtitle.innerHTML = `
                Пацієнт: <strong class="text-indigo-600">${patient.priezvisko} ${patient.meno || ''}</strong>, 
                ДН: ${dobOnly},
                ID: ${patient.rodcis || 'не вказано'},
                Тел: ${patient.tel || 'не вказано'}
            `;
        }

        // Не переходимо автоматично, а показуємо кнопку "Вперед"
        // showBlock(2);
    }

    function resetPatientSearch() {
        lastNameInput.value = '';
        firstNameInput.value = '';
        selectedPatient = null;
        selectedAnalyses = [];
        selectedAnalysisCodes = [];
        selectedPriradenie = [];
        selectedRecipient = null;
        selectedPriority = 'b'; // Повертаємо до значення за замовчуванням
        currentPage = 1;

        // Очищення Блоку 1
        patientSearchResults.innerHTML = '';
        patientSearchError.classList.add('hidden');
        searchResultsContainer.classList.add('hidden');
        selectedPatientInfo.classList.add('hidden');
        if (forwardBtn) forwardBtn.classList.add('hidden');
        createPatientContainer.classList.add('hidden');
        if (createPatientForm) createPatientForm.reset();
        const registeredDate = document.getElementById('registered-analyses-date');
        const registeredStatus = document.getElementById('registered-analyses-status');
        if (registeredDate) registeredDate.value = '';
        if (registeredStatus) registeredStatus.value = '';

        // Очищення Блоку 2
        if (analysisSearchInput) analysisSearchInput.value = '';
        if (analysisList) analysisList.innerHTML = '';
        if (discountSelect) discountSelect.value = '0';
        renderSelectedAnalyses(); // Це оновить список обраних аналізів та загальну суму

        // Очищення Блоку 3
        if (recipientSearchInput) recipientSearchInput.value = '';
        if (selectedRecipientContainer) selectedRecipientContainer.classList.add('hidden');
        if (document.getElementById('recipient-search-wrapper')) document.getElementById('recipient-search-wrapper').classList.remove('hidden');
        if (prioritySelect) prioritySelect.value = 'b';
        const weightInput = document.getElementById('patient-weight');
        const heightInput = document.getElementById('patient-height');
        const quantityInput = document.getElementById('material-quantity');
        if (weightInput) weightInput.value = '';
        if (heightInput) heightInput.value = '';
        if (quantityInput) quantityInput.value = '';
        if (registrationNotes) registrationNotes.value = '';

        // Reset header subtitle
        if (headerSubtitle) {
            headerSubtitle.textContent = 'Пошук пацієнта та реєстрація лабораторних досліджень';
        }

        showBlock(1);
        updateStepIndicator(1); // Також скидаємо індикатор кроків
    }

    // Обробник для форми створення нового пацієнта
    createPatientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await createPatient();
    });

    async function createPatient() {
        const patientData = {
            lastName: document.getElementById('new-patient-lastName').value.trim(),
            firstName: document.getElementById('new-patient-firstName').value.trim(),
            dob: newPatientDob.value,
            phone: newPatientPhone.value.trim(),
            gender: newPatientGender.value
        };

        if (!patientData.lastName || !patientData.dob || !patientData.phone) {
            showInfoModal('error', 'Не всі поля заповнено', 'Прізвище, дата народження та телефон є обов\'язковими для створення нового пацієнта.');
            return;
        }

        createPatientBtn.disabled = true;
        createPatientBtn.textContent = 'Створення...';

        try {
            const response = await fetch('/pacientcreate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patientData)
            });

            if (!response.ok) throw new Error('Помилка сервера при створенні пацієнта.');

            const responseText = await response.text();
            if (responseText) {
                const result = JSON.parse(responseText);
                const status = result?.[0]?.status;
                if (status === 'Patient already exists') {
                    throw new Error('Пацієнт з такими даними вже існує. Будь ласка, скористайтеся пошуком.');
                } else if (status !== 'OK' && status !== 'Patient created') {
                    throw new Error(result?.[0]?.message || 'Невідома помилка при створенні пацієнта.');
                }
            }
            // Якщо відповідь порожня, але статус 200 OK, вважаємо, що все пройшло успішно.

            // Пацієнта створено, тепер треба його "обрати"
            const newPatient = {
                priezvisko: patientData.lastName,
                meno: patientData.firstName,
                datumnarod: patientData.dob,
                tel: patientData.phone
            };
            selectPatient(newPatient);

        } catch (error) {
            showInfoModal('error', 'Помилка створення', error.message);
        } finally {
            createPatientBtn.disabled = false;
            createPatientBtn.textContent = 'Створити та обрати пацієнта';
        }
    }
    // ============================================
    // BLOCK 2: ANALYSIS SELECTION
    // ============================================

    async function loadAnalyses() { // Завантажує аналізи в пам'ять, але не відображає їх
        if (allAnalyses.length > 0) return; // Не перезавантажуємо, якщо дані вже є

        analysisListLoader.classList.remove('hidden');
        analysisListError.classList.add('hidden');
        analysisList.innerHTML = ''; // Очищуємо список при завантаженні
        try {
            // Завантажуємо одночасно і звичайні, і пакетні аналізи
            const [analysesResponse, packagesResponse] = await Promise.all([
                fetch('/api/analyses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }),
                fetch('/api/package-analyses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
            ]);

            if (!analysesResponse.ok) throw new Error('Не вдалося завантажити список аналізів.');
            if (!packagesResponse.ok) throw new Error('Не вдалося завантажити список пакетних досліджень.');

            const individualAnalyses = await analysesResponse.json();
            const packageAnalyses = await packagesResponse.json();

            // Об'єднуємо два масиви в один
            allAnalyses = [...individualAnalyses, ...packageAnalyses];

        } catch (error) {
            analysisListError.textContent = error.message;
            analysisListError.classList.remove('hidden');
        } finally {
            analysisListLoader.classList.add('hidden');
        }
    }

    function displayAnalyses(analyses) {
        analysisList.innerHTML = '';
        if (analyses.length === 0) {
            analysisList.innerHTML = '<p class="p-4 text-gray-500 text-center">Аналізів не знайдено.</p>';
            return;
        }
        analyses.forEach(analysis => {
            const div = document.createElement('div');
            div.className = 'p-3 border-b hover:bg-gray-100 cursor-pointer transition-colors flex justify-between items-center';
            div.innerHTML = `
                <div class="flex-grow">
                    <div class="font-medium text-gray-800">${analysis.nazov}</div>
                    <div class="text-sm text-gray-600">Код: ${analysis.kodvys}</div>
                </div>
                <span class="font-semibold text-indigo-600 ml-4">${(analysis.cena || 0).toFixed(2)} грн</span>
            `;
            div.addEventListener('click', () => addAnalysisToSelected(analysis));
            analysisList.appendChild(div);
        });
    }

    analysisSearchInput.addEventListener('input', () => {
        const searchTerm = analysisSearchInput.value.trim().toLowerCase();
        if (!searchTerm) {
            // Якщо поле пошуку порожнє, очищуємо список
            analysisList.innerHTML = '';
            return;
        }
        const filteredAnalyses = allAnalyses.filter(analysis =>
            (analysis.nazov && String(analysis.nazov).toLowerCase().includes(searchTerm)) ||
            (analysis.kodvys && String(analysis.kodvys).toLowerCase().includes(searchTerm))
        );
        displayAnalyses(filteredAnalyses);
    });

    async function addAnalysisToSelected(analysis) {
        // Check if already selected
        if (selectedAnalyses.find(a => a.kodvys === analysis.kodvys)) {
            showInfoModal('warning', 'Аналіз вже додано', 'Цей аналіз вже є у списку обраних.');
            return;
        }

        // Якщо це пакет (код починається з 'M'), отримуємо його склад
        if (analysis.kodvys && String(analysis.kodvys).startsWith('М')) {
            const kodSkup = String(analysis.kodvys).substring(1);
            try {
                const response = await fetch('/api/package-contents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kodSkup })
                });
                if (!response.ok) throw new Error('Не вдалося завантажити склад пакету.');
                const contents = await response.json();
                analysis.containedAnalyses = contents.map(item => item.KodVys);

                // Виводимо в консоль для тестування, як просили
                console.log(`Додано пакет: ${analysis.nazov} (Код: ${analysis.kodvys})`);
                console.log('Склад пакету (коди аналізів):', analysis.containedAnalyses);

            } catch (error) {
                showInfoModal('error', 'Помилка завантаження пакету', error.message);
            }
        }

        selectedAnalyses.push(analysis);
        // Після додавання перераховуємо масив кодів (враховуємо пакети)
        rebuildSelectedCodes();
        rebuildSelectedPriradenie();
        renderSelectedAnalyses();
    }

    function removeAnalysisFromSelected(kodvys) {
        selectedAnalyses = selectedAnalyses.filter(a => a.kodvys !== kodvys);
        // Після видалення перераховуємо масив кодів
        rebuildSelectedCodes();
        rebuildSelectedPriradenie();
        renderSelectedAnalyses();
    }

    // Формуємо унікальний масив кодів аналізів (включно зі складами пакетів)
    function rebuildSelectedCodes() {
        const codes = [];
        selectedAnalyses.forEach(a => {
            if (a && a.containedAnalyses && Array.isArray(a.containedAnalyses) && a.containedAnalyses.length > 0) {
                a.containedAnalyses.forEach(c => {
                    if (c) codes.push(String(c));
                });
            } else if (a && a.kodvys) {
                codes.push(String(a.kodvys));
            }
        });
        // Видаляємо дублікати
        selectedAnalysisCodes = Array.from(new Set(codes));
        // Для дебагу в консолі
        console.log('Поточний масив кодів для реєстрації:', selectedAnalysisCodes);
        // Оновлюємо також масив priradenie, бо коди і priradenie залежать від поточних обраних аналізів
        rebuildSelectedPriradenie();
    }

    // Формуємо унікальний масив значень поля `priradenie` для обраних аналізів
    function rebuildSelectedPriradenie() {
        const values = [];
        selectedAnalyses.forEach(a => {
            // Якщо аналіз - пакет і має containedAnalyses (масив кодів), намагаємось знайти об'єкти в allAnalyses
            if (a && a.containedAnalyses && Array.isArray(a.containedAnalyses) && a.containedAnalyses.length > 0) {
                a.containedAnalyses.forEach(code => {
                    if (!code) return;
                    const match = allAnalyses.find(x => String(x.kodvys) === String(code));
                    if (match && (match.priradenie !== undefined && match.priradenie !== null)) {
                        values.push(match.priradenie);
                    }
                });
            } else {
                // Для окремого аналізу беремо його priradenie або намагаємось знайти в allAnalyses
                if (a && (a.priradenie !== undefined && a.priradenie !== null)) {
                    values.push(a.priradenie);
                } else if (a && a.kodvys) {
                    const match = allAnalyses.find(x => String(x.kodvys) === String(a.kodvys));
                    if (match && (match.priradenie !== undefined && match.priradenie !== null)) {
                        values.push(match.priradenie);
                    }
                }
            }
        });

        // Видаляємо дублікати і пусті значення
        selectedPriradenie = Array.from(new Set(values.filter(v => v !== undefined && v !== null && String(v).trim() !== '')));
        console.log('Поточний масив priradenie:', selectedPriradenie);
    }

    function renderSelectedAnalyses() {
        selectedAnalysesList.innerHTML = '';
        if (selectedAnalyses.length === 0) {
            selectedAnalysesList.appendChild(noAnalysesSelected);
            noAnalysesSelected.classList.remove('hidden');
        } else {
            noAnalysesSelected.classList.add('hidden');
            selectedAnalyses.forEach(analysis => {
                const div = document.createElement('div');
                div.className = 'p-3 border-b flex justify-between items-center hover:bg-indigo-100 transition-colors';
                div.innerHTML = `
                    <div class="flex-grow">
                        <div class="font-medium text-gray-800">${analysis.nazov}</div>
                        <div class="text-sm text-gray-600">Код: ${analysis.kodvys}</div>
                    </div>
                    <div class="flex items-center gap-6">
                        <span class="font-semibold text-indigo-600">${(analysis.cena || 0).toFixed(2)} грн</span>
                        <button type="button" class="text-red-500 hover:text-red-700 font-bold">×</button>
                    </div>
                `;
                div.querySelector('button').addEventListener('click', () => removeAnalysisFromSelected(analysis.kodvys));
                selectedAnalysesList.appendChild(div);
            });
        }
        updateTotalPrice();
    }

    function updateTotalPrice() {
        const baseTotal = selectedAnalyses.reduce((sum, a) => sum + (a.cena || 0), 0);
        const discount = parseFloat(discountSelect.value) || 0;
        const finalTotal = baseTotal * (1 - discount / 100);
        totalPriceEl.textContent = `${finalTotal.toFixed(2)} грн`;
    }

    // Додаємо обробник події для випадаючого списку знижок
    discountSelect.addEventListener('change', updateTotalPrice);

    // Повернення з блоку 2 до блоку 1 без скидання даних
    backFromAnalysesBtn.addEventListener('click', () => showBlock(1));

    nextToAdditionalInfoBtn.addEventListener('click', () => {
        if (!selectedAnalyses.length) {
            showInfoModal('warning', 'Аналізи не обрано', 'Будь ласка, оберіть хоча б один аналіз, щоб продовжити.');
            return;
        }
        showBlock(3);
    });

    // ============================================
    // BLOCK 3: ADDITIONAL INFO (RECIPIENT SELECTION)
    // ============================================

    async function loadRecipients() {
        if (allRecipients.length > 0) return; // Не перезавантажуємо, якщо дані вже є

        try {
            const response = await fetch('/api/recipients');
            if (!response.ok) throw new Error('Не вдалося завантажити список отримувачів');
            allRecipients = await response.json();
        } catch (error) {
            console.error('Error loading recipients:', error);
            recipientListError.textContent = 'Помилка завантаження списку';
            recipientListError.classList.remove('hidden');
        }
    }

    function displayRecipients(recipients) {
        // Clear previous results (keep loader and error)
        Array.from(recipientListContainer.children).forEach(child => {
            if (child.id !== 'recipient-list-loader' && child.id !== 'recipient-list-error') {
                recipientListContainer.removeChild(child);
            }
        });

        if (recipients.length === 0) {
            const div = document.createElement('div');
            div.className = 'p-3 text-gray-500 text-center';
            div.textContent = 'Нічого не знайдено';
            recipientListContainer.appendChild(div);
            return;
        }

        recipients.forEach(recipient => {
            const div = document.createElement('div');
            div.className = 'p-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-0 text-sm text-gray-700';
            div.textContent = recipient.nazov;
            div.addEventListener('click', () => selectRecipient(recipient));
            recipientListContainer.appendChild(div);
        });
    }

    function filterRecipients(term) {
        const lowerTerm = term.toLowerCase();
        return allRecipients.filter(r =>
            r.nazov && r.nazov.toLowerCase().includes(lowerTerm)
        );
    }

    recipientSearchInput.addEventListener('input', () => {
        const term = recipientSearchInput.value.trim();
        const filtered = filterRecipients(term);
        displayRecipients(filtered);
        recipientListContainer.classList.remove('hidden');
    });

    recipientSearchInput.addEventListener('focus', () => {
        const term = recipientSearchInput.value.trim();
        const filtered = filterRecipients(term);
        displayRecipients(filtered);
        recipientListContainer.classList.remove('hidden');
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!recipientSearchInput.contains(e.target) && !recipientListContainer.contains(e.target)) {
            recipientListContainer.classList.add('hidden');
        }
    });

    function selectRecipient(recipient) {
        selectedRecipient = recipient;
        selectedRecipientName.textContent = recipient.nazov;
        selectedRecipientContainer.classList.remove('hidden');
        selectedRecipientContainer.classList.add('flex');
        document.getElementById('recipient-search-wrapper').classList.add('hidden');
        recipientListContainer.classList.add('hidden');
        recipientSearchInput.value = ''; // Clear input
    }

    clearRecipientBtn.addEventListener('click', () => {
        selectedRecipient = null;
        selectedRecipientContainer.classList.add('hidden');
        selectedRecipientContainer.classList.remove('flex');
        document.getElementById('recipient-search-wrapper').classList.remove('hidden');
        recipientSearchInput.focus();
    });

    // <-- ДОДАНО: Обробник для вибору пріоритету -->
    if (prioritySelect) {
        prioritySelect.addEventListener('change', (e) => {
            selectedPriority = e.target.value;
        });
    }
    // Block 3 -> 4
    backFromAdditionalInfoBtn.addEventListener('click', () => {
        showBlock(2);
    });
    nextToConfirmationBtn.addEventListener('click', () => {
        populateConfirmationBlock();
        showBlock(4);
    });

    // ============================================
    // BLOCK 4: CONFIRMATION
    // ============================================

    function populateConfirmationBlock() {
        // Patient info
        confirmationPatientInfo.innerHTML = `
            <strong>${selectedPatient.priezvisko} ${selectedPatient.meno || ''}</strong><br>
            Дата народження: ${selectedPatient.datumnarod || 'не вказано'}<br>
            Телефон: ${selectedPatient.tel || 'не вказано'}
        `;

        // Analyses list
        confirmationAnalysesList.innerHTML = '';
        selectedAnalyses.forEach(analysis => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center p-2 bg-white rounded border border-purple-200';
            div.innerHTML = `
                <span>${analysis.nazov} (${analysis.kodvys})</span>
                <span class="font-semibold">${(analysis.cena || 0).toFixed(2)} грн</span>
            `;
            confirmationAnalysesList.appendChild(div);
        });

        // Recipient info (if selected)
        if (selectedRecipient) {
            confirmationRecipientInfo.textContent = selectedRecipient.nazov || JSON.stringify(selectedRecipient);
            if (confirmationRecipientContainer) confirmationRecipientContainer.classList.remove('hidden');
        } else {
            if (confirmationRecipientContainer) confirmationRecipientContainer.classList.add('hidden');
            if (confirmationRecipientInfo) confirmationRecipientInfo.textContent = '';
        }

        // <-- ДОДАНО: Відображення пріоритету -->
        if (confirmationPriorityInfo) {
            const selectedOption = prioritySelect.options[prioritySelect.selectedIndex];
            const priorityText = selectedOption ? selectedOption.text : 'Не обрано';
            confirmationPriorityInfo.textContent = priorityText;
        }

        // Total price
        const baseTotal = selectedAnalyses.reduce((sum, a) => sum + (a.cena || 0), 0);
        const discount = parseFloat(discountSelect.value) || 0;
        const finalTotal = baseTotal * (1 - discount / 100);
        confirmationTotalPrice.textContent = `${finalTotal.toFixed(2)} грн`;
    }

    backFromConfirmationBtn.addEventListener('click', () => {
        showBlock(3);
    });

    /**
     * Формує дані для штрих-кодів, зберігає їх у localStorage та відкриває сторінку для друку.
     * @param {object} patient - Об'єкт з даними пацієнта (priezvisko, meno, datumnarod).
     * @param {Array} analyses - Масив обраних аналізів.
     * @param {Array} priradenie - Масив унікальних типів біоматеріалу.
     * @param {string} IdBarcode - ID для штрих-коду.
     */
    window.generateAndPrintBarcodes = function (patient, analyses, priradenie, IdBarcode = `MH-${Date.now().toString().slice(-6)}`) {
        if (!patient) {
            if (window.showInfoModal) {
                window.showInfoModal('warning', 'Пацієнта не обрано', 'Будь ласка, спочатку оберіть пацієнта.');
            } else {
                alert('Пацієнта не обрано');
            }
            return;
        }

        // Якщо аналізи порожні, все одно дозволяємо друкувати (для деталей замовлення)
        // але показуємо попередження
        if (!analyses || analyses.length === 0) {
            // Для модального вікна з деталями замовлення - це допускається
            // але потрібно переконатися, що це усвідомлене дійство
        }

        // Формуємо дані для передачі
        const registrationDateIso = new Date().toISOString(); // Дата реєстрації дослідження
        const barcodeData = {
            orderId: IdBarcode,
            patientName: `${patient.priezvisko}`,
            label: priradenie && priradenie.length > 0 ? priradenie : [],
            patientDob: patient.datumnarod ? patient.datumnarod.split(' ')[0] : 'не вказано',
            registrationDate: registrationDateIso, // Дата реєстрації дослідження
            datodberu: patient.datodberu || registrationDateIso, // Якщо немає дати забору — використовуємо дату реєстрації
            evidcis: patient.evidcis || null, // Номер замовлення (якщо є)
            typziad: patient.typziad, // Тип замовлення
            analyses: analyses && analyses.length > 0 ? analyses.map(analysis => ({
                name: analysis.nazov,
                code: analysis.kodvys
            })) : []
        };

        // Зберігаємо дані в localStorage
        localStorage.setItem('barcodeData', JSON.stringify(barcodeData));

        // Відкриваємо сторінку barcode.html у новій вкладці
        window.open('barcode.html', '_blank');
    };

    // Обробник для кнопки "Штрих-коди"
    if (printLabelsBtn) {
        printLabelsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Викликаємо функцію з пацієнтом та аналізами зі стану
            generateAndPrintBarcodes(selectedPatient, selectedAnalyses, selectedPriradenie);
        });
    }

    registerAnalysisBtn.addEventListener('click', async () => {
        try {
            registerAnalysisBtn.disabled = true;
            registerAnalysisBtn.innerHTML = '<span>Обробка...</span>';

            const payload = {
                patient: selectedPatient,
                analyses: selectedAnalyses,
                analysesCodes: selectedAnalysisCodes,
                priradenieValues: selectedPriradenie,
                recipient: selectedRecipient, // Add selected recipient
                priority: selectedPriority, // <-- ДОДАНО: Передаємо обраний пріоритет
                notes: registrationNotes.value.trim(),
                registrationDate: new Date().toISOString(),
            };

            const response = await fetch('/api/register-analyses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            // Show success modal
            successModal.classList.remove('hidden');

            // Reset state after 2 seconds
            setTimeout(() => {
                resetPatientSearch();
            }, 2000);

        } catch (error) {
            showInfoModal('error', 'Помилка при реєстрації', error.message);
        } finally {
            registerAnalysisBtn.disabled = false;
            registerAnalysisBtn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Зареєструвати аналізи</span>
            `;
        }
    });

    // Кнопка для підтвердження та відправки масиву кодів (тільки масив)
    if (confirmCodesBtn) {
        confirmCodesBtn.addEventListener('click', async () => {
            try {
                if (!selectedAnalysisCodes || selectedAnalysisCodes.length === 0) {
                    showInfoModal('warning', 'Немає кодів', 'Масив кодів порожній. Додайте аналізи або пакети.');
                    return;
                }

                confirmCodesBtn.disabled = true;
                confirmCodesBtn.textContent = 'Saving...';

                const payload = { analysesCodes: selectedAnalysisCodes };

                const response = await fetch('/api/register-analyses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(await response.text());
                }

                showInfoModal('success', 'Коди відправлено', 'Масив кодів був успішно відправлений на сервер (заглушка).');

            } catch (error) {
                showInfoModal('error', 'Помилка відправки', error.message || 'Не вдалося відправити масив кодів.');
            } finally {
                confirmCodesBtn.disabled = false;
                confirmCodesBtn.textContent = 'Save changes';
            }
        });
    }

    closeModalBtn.addEventListener('click', () => {
        successModal.classList.add('hidden');
    });

    // ============================================
    // INITIALIZATION
    // ============================================

    initialize();
});