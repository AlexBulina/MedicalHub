document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // DOM ELEMENTS
    // ============================================

    // Block Sections
    const block1PatientSearch = document.getElementById('block-1-patient-search');
    const block2AnalysisSelection = document.getElementById('block-2-analysis-selection');
    const block3Confirmation = document.getElementById('block-3-confirmation');
    const analysisRegistrationUnavailable = document.getElementById('analysis-registration-unavailable');

    // Header
    const headerSubtitle = document.getElementById('header-subtitle');

    // Step Indicator Elements
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');
    const line1 = document.getElementById('line-1');
    const line2 = document.getElementById('line-2');

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

    // Block 2: Analysis Selection
    const analysisSearchInput = document.getElementById('analysis-search-input');
    const analysisList = document.getElementById('analysis-list');
    const analysisListLoader = document.getElementById('analysis-list-loader');
    const analysisListError = document.getElementById('analysis-list-error');
    const selectedAnalysesList = document.getElementById('selected-analyses-list');
    const noAnalysesSelected = document.getElementById('no-analyses-selected');
    const totalPriceEl = document.getElementById('total-price');
    const backFromAnalysesBtn = document.getElementById('back-from-analyses-btn');
    const nextToConfirmationBtn = document.getElementById('next-to-confirmation-btn');

    // Block 3: Confirmation
    const confirmationPatientInfo = document.getElementById('confirmation-patient-info');
    const confirmationAnalysesList = document.getElementById('confirmation-analyses-list');
    const confirmationTotalPrice = document.getElementById('confirmation-total-price');
    const registrationNotes = document.getElementById('registration-notes');
    const backFromConfirmationBtn = document.getElementById('back-from-confirmation-btn');
    const registerAnalysisBtn = document.getElementById('register-analysis-btn');

    // Navigation
    const backBtn = document.getElementById('back-btn');

    // Modal
    const successModal = document.getElementById('success-modal');
    const closeModalBtn = document.getElementById('close-modal');

    // ============================================
    // STATE VARIABLES
    // ============================================

    let allAnalyses = [];
    let selectedAnalyses = [];
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
            block3Confirmation.classList.add('hidden');
            analysisRegistrationUnavailable.classList.remove('hidden');
            return;
        }

        // Load all analyses
        loadAnalyses();
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
        block3Confirmation.classList.remove('active');

        // Show requested block
        if (blockNumber === 1) {
            block1PatientSearch.classList.add('active');
            updateStepIndicator(1);
        } else if (blockNumber === 2) {
            block2AnalysisSelection.classList.add('active');
            updateStepIndicator(2);
        } else if (blockNumber === 3) {
            block3Confirmation.classList.add('active');
            updateStepIndicator(3);
        }
    }

    function updateStepIndicator(activeStep) {
        // Reset all steps
        [step1, step2, step3].forEach(step => {
            step.classList.remove('active', 'completed');
        });
        [line1, line2].forEach(line => {
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
            line2.classList.add(activeStep >= 3 ? 'active' : '');
            step3.classList.add(activeStep === 3 ? 'active' : 'completed');
        }
    }

    // ============================================
    // BLOCK 1: PATIENT SEARCH
    // ============================================

    searchPatientBtn.addEventListener('click', () => searchPatients(1));
    clearPatientBtn.addEventListener('click', resetPatientSearch);
    backBtn.addEventListener('click', () => window.history.back());

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

            if (!response.ok) throw new Error('Помилка сервера');

            const data = await response.json();
            displayPatientResults(data.results, data.total);

        } catch (error) {
            patientSearchError.textContent = `Помилка пошуку: ${error.message}`;
            patientSearchError.classList.remove('hidden');
        } finally {
            patientSearchLoader.classList.add('hidden');
        }
    }

    function displayPatientResults(patients, total) {
        patientSearchResults.innerHTML = '';
        if (patients.length === 0) {
            patientSearchResults.innerHTML = '<p class="p-4 text-gray-500 text-center">Пацієнтів не знайдено.</p>';
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
        patientDetails.innerHTML = `
            <strong>${patient.priezvisko} ${patient.meno || ''}</strong><br>
            Дата народження: ${patient.datumnarod || 'не вказано'}<br>
            Телефон: ${patient.tel || 'не вказано'}
        `;
        selectedPatientInfo.classList.remove('hidden');
        searchResultsContainer.classList.add('hidden');

        // Update header subtitle
        if (headerSubtitle) {
            headerSubtitle.innerHTML = `
                Пацієнт: <strong class="text-indigo-600">${patient.priezvisko} ${patient.meno || ''}</strong>, 
                ДН: ${patient.datumnarod || 'не вказано'}
            `;
        }

        // Show next block
        showBlock(2);
    }

    function resetPatientSearch() {
        lastNameInput.value = '';
        firstNameInput.value = '';
        patientSearchResults.innerHTML = '';
        patientSearchError.classList.add('hidden');
        searchResultsContainer.classList.add('hidden');
        selectedPatientInfo.classList.add('hidden');
        selectedPatient = null;
        selectedAnalyses = [];

        // Reset header subtitle
        if (headerSubtitle) {
            headerSubtitle.textContent = 'Пошук пацієнта та реєстрація лабораторних досліджень';
        }

        showBlock(1);
    }

    // ============================================
    // BLOCK 2: ANALYSIS SELECTION
    // ============================================

    async function loadAnalyses() {
        analysisListLoader.classList.remove('hidden');
        analysisListError.classList.add('hidden');
        try {
            const response = await fetch('/api/analyses', { method: 'POST' });
            if (!response.ok) throw new Error('Не вдалося завантажити список аналізів.');
            allAnalyses = await response.json();
            displayAnalyses(allAnalyses);
        } catch (error) {
            analysisListError.textContent = error.message;
            analysisListError.classList.remove('hidden');
        } finally {
            analysisListLoader.classList.add('hidden');
        }
    }

    function displayAnalyses(analyses) {
        analysisList.innerHTML = '';
        analyses.forEach(analysis => {
            const div = document.createElement('div');
            div.className = 'p-3 border-b hover:bg-gray-100 cursor-pointer transition-colors flex justify-between items-center';
            div.innerHTML = `
                <div class="flex-grow">
                    <div class="font-medium text-gray-800">${analysis.nazov}</div>
                    <div class="text-sm text-gray-600">Код: ${analysis.kodvys}</div>
                </div>
                <span class="font-semibold text-indigo-600 ml-4">${analysis.cena.toFixed(2)} грн</span>
            `;
            div.addEventListener('click', () => addAnalysisToSelected(analysis));
            analysisList.appendChild(div);
        });
    }

    analysisSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredAnalyses = allAnalyses.filter(a =>
            a.nazov.toLowerCase().includes(searchTerm) ||
            a.kodvys.toLowerCase().includes(searchTerm)
        );
        displayAnalyses(filteredAnalyses);
    });

    function addAnalysisToSelected(analysis) {
        // Check if already selected
        if (selectedAnalyses.find(a => a.kodvys === analysis.kodvys)) {
            alert('Цей аналіз вже обраний!');
            return;
        }
        selectedAnalyses.push(analysis);
        renderSelectedAnalyses();
    }

    function removeAnalysisFromSelected(kodvys) {
        selectedAnalyses = selectedAnalyses.filter(a => a.kodvys !== kodvys);
        renderSelectedAnalyses();
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
                    <div class="flex items-center gap-3">
                        <span class="font-semibold text-indigo-600">${analysis.cena.toFixed(2)} грн</span>
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
        const total = selectedAnalyses.reduce((sum, a) => sum + a.cena, 0);
        totalPriceEl.textContent = `${total.toFixed(2)} грн`;
    }

    backFromAnalysesBtn.addEventListener('click', () => {
        selectedPatient = null;
        selectedAnalyses = [];
        selectedPatientInfo.classList.add('hidden');

        // Reset header subtitle
        if (headerSubtitle) {
            headerSubtitle.textContent = 'Пошук пацієнта та реєстрація лабораторних досліджень';
        }

        showBlock(1);
    });

    nextToConfirmationBtn.addEventListener('click', () => {
        if (!selectedAnalyses.length) {
            alert('Будь ласка, оберіть хоча б один аналіз.');
            return;
        }
        populateConfirmationBlock();
        showBlock(3);
    });

    // ============================================
    // BLOCK 3: CONFIRMATION
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
                <span class="font-semibold">${analysis.cena.toFixed(2)} грн</span>
            `;
            confirmationAnalysesList.appendChild(div);
        });

        // Total price
        const total = selectedAnalyses.reduce((sum, a) => sum + a.cena, 0);
        confirmationTotalPrice.textContent = `${total.toFixed(2)} грн`;
    }

    backFromConfirmationBtn.addEventListener('click', () => {
        showBlock(2);
    });

    registerAnalysisBtn.addEventListener('click', async () => {
        try {
            registerAnalysisBtn.disabled = true;
            registerAnalysisBtn.innerHTML = '<span>Обробка...</span>';

            const payload = {
                patient: selectedPatient,
                analyses: selectedAnalyses,
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
            alert(`Помилка при реєстрації: ${error.message}`);
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

    closeModalBtn.addEventListener('click', () => {
        successModal.classList.add('hidden');
    });

    // ============================================
    // INITIALIZATION
    // ============================================

    initialize();
});