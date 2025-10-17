




// Дані для авторизації
const username = 'HMU';
const password = 'cybersecurity';
// Масив для зберігання отриманих даних
let tableDataPrice = [];

// Кодуємо авторизацію в форматі Basic
const base64Credentials = btoa(username + ':' + password);
let actualDate;
let actualDatePrice;
// Заголовки для запиту
const headers = {
    'Authorization': 'Basic ' + base64Credentials
};

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');  // Додаємо нуль, якщо день одноцифровий
    const month = String(date.getMonth() + 1).padStart(2, '0');  // Додаємо нуль, якщо місяць одноцифровий
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

const selectedDate = localStorage.getItem("selectedDate");
const defaultDate = selectedDate || formatDate(new Date());
localStorage.setItem('selectedDate', defaultDate);
let apiUrl = `http://localhost:1025/analyzeOnDate?sdate=${localStorage.getItem("selectedDate")}`;  // URL для отримання даних
console.log('apiUrl:', apiUrl);
document.addEventListener("DOMContentLoaded", function() {
    document.querySelector('.code-text').textContent = localStorage.getItem('LastChangedCode');
    // Ініціалізація календаря
    flatpickr("#calendar", {
        dateFormat: "d.m.Y", // Формат дати
        defaultDate: defaultDate, // Отримуємо дату з localStorage або встановлюємо поточну // Встановлює поточну дату за замовчуванням
            minDate: "today", // Забороняє вибір минулих дат
            locale: "uk",// Встановлює українську мову
            allowInput: false,
        onChange: function(selectedDates, dateStr, instance) {
            localStorage.setItem('selectedDate', dateStr);
           apiUrl = `http://localhost:1025/analyzeOnDate?sdate=${localStorage.getItem("selectedDate")}`;

            document.getElementById("searchInput").value = '';
            // Дані для авторизації
            const username = 'HMU';
            const password = 'cybersecurity';

// Кодуємо авторизацію в форматі Basic
            const base64Credentials = btoa(username + ':' + password);

// Заголовки для запиту
            const headers = {
                'Authorization': 'Basic ' + base64Credentials
            };


            // Insert code for request to Date Price!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


            // Виведення alert, коли змінюється дата
            actualDate = dateStr
            actualDatePrice = dateStr

            document.getElementById("selected-date").textContent = ( "Вибрана дата: " + dateStr)
            document.getElementById("selected-date").style.fontWeight = 'bold';

            const panelclear = document.getElementById('panelDropdown');
                  panelclear.selectedIndex = 0;
            const packetclear = document.getElementById('packetsPackets');
                  packetclear.selectedIndex = 0;




// Отримуємо дані з API
            fetch(`http://localhost:1025/analyzeOnDate?sdate=${dateStr}`, { headers: headers })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Помилка при отриманні даних з API');
                    }
                    return response.json();
                })
                .then(data => {
                    // Приховуємо індикатор завантаження
                    document.getElementById('loading').style.display = 'none';

                    // Зміна ширини стовпців через JavaScript
                    document.querySelectorAll('#resultsTable th').forEach((th, index) => {
                        if (index === 0) {
                            th.style.width = '5%';  // Ширина для першого стовпця
                        } else if (index === 1) {
                            th.style.width = '10%';  // Ширина для другого стовпця
                        } else if (index === 2) {
                            th.style.width = '70%';  // Ширина для третього стовпця
                        } else if (index === 3) {
                            th.style.width = '15%';  // Ширина для четвертого стовпця
                            th.style.textAlign = 'center';  // Вирівнювання по правому краю
                        }
                    });

                    // Перевіряємо наявність даних
                    if (data && Array.isArray(data) && data.length > 0) {
                        tableDataPrice = data; // Зберігаємо дані в змінній

                        // Показуємо таблицю
                     //   document.getElementById('resultsTable').style.display = 'none';


                        document.getElementById('resultsTable').style.display = 'table';


                        tableData = tableDataPrice; // це добавив
                        populateTable(tableDataPrice);
                        // Заповнюємо таблицю даними






                    } else {
                        document.getElementById('error').style.display = 'block';
                    }
                })
                .catch(error => {
                    // У разі помилки показуємо повідомлення
                    console.error('Помилка:', error);
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('error').style.display = 'block';
                });






        },
        onReady: function(selectedDates, dateStr, instance) {
            localStorage.setItem('selectedDate', dateStr);
            apiUrl = `http://localhost:1025/analyzeOnDate?sdate=${localStorage.getItem("selectedDate")}`;
            // Автоматично оновлюємо текстовий блок при завантаженні сторінки
            tableDataPrice = tableData; // це добавив
            document.getElementById("selected-date").textContent = "Поточна дата: " + dateStr;
            actualDate = dateStr;
            actualDatePrice = dateStr
        }
    }

    );

    // Функція для фільтрації таблиці (якщо необхідно)
    function filterTable() {
        // Ваш код для фільтрації таблиці
    }
});





// Масив для зберігання отриманих даних
let tableData = [];

// Отримуємо дані з API
fetch(apiUrl, { headers: headers })
    .then(response => {
        if (!response.ok) {
            throw new Error('Помилка при отриманні даних з API');
        }
        return response.json();
    })
    .then(data => {
        // Приховуємо індикатор завантаження
        document.getElementById('loading').style.display = 'none';

        // Зміна ширини стовпців через JavaScript
        document.querySelectorAll('#resultsTable th').forEach((th, index) => {
            if (index === 0) {
                th.style.width = '5%';  // Ширина для першого стовпця
            } else if (index === 1) {
                th.style.width = '10%';  // Ширина для другого стовпця
            } else if (index === 2) {
                th.style.width = '70%';  // Ширина для третього стовпця
            } else if (index === 3) {
                th.style.width = '15%';  // Ширина для четвертого стовпця
                th.style.textAlign = 'center';  // Вирівнювання по правому краю
            }
        });

        // Перевіряємо наявність даних
        if (data && Array.isArray(data) && data.length > 0) {
            tableDataPrice = data; // Зберігаємо дані в змінній

            // Показуємо таблицю
            document.getElementById('resultsTable').style.display = 'table';

            // Заповнюємо таблицю даними
            populateTable(data);

            // Заповнюємо випадаючий список панелями
            populatePanelDropdown(data);
            populatePacketsDropdown(data);
            checkDatabaseConnection()


        } else {
            document.getElementById('error').style.display = 'block';
        }
    })
    .catch(error => {
        // У разі помилки показуємо повідомлення
        console.error('Помилка:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
    });







// Функція для заповнення випадаючого списку пакетами
function populatePacketsDropdown(data) {
    const packetDropdown = document.getElementById ('packetsPackets');

    const uniquePanels = [
        ...new Set (
            data
                .filter (item => item.nazovskup === item.skratka)  // додати умови для вибору
                .map (item => item.nazovskup)
        )
    ];  // Отримуємо унікальні панелі

    uniquePanels.forEach(panel => {
        const option = document.createElement('option');
        option.value = panel;
        option.textContent = panel;
        packetDropdown.appendChild(option);
    });
    // Додаємо обробник події на зміну вибору панелі
    packetDropdown.addEventListener('change', (event) => {
        const selectedPanel = event.target.value;
        const paneldropdown = document.getElementById('panelDropdown');
        paneldropdown.selectedIndex = 0;  // Це вибере "Option
        filterTableByPanel(selectedPanel);
    });

}


// Функція для заповнення випадаючого списку панелями
function populatePanelDropdown(data) {
    const panelDropdown = document.getElementById('panelDropdown');

    const uniquePanels = [
        ...new Set(
            data
                .filter(item => item.nazovskup !== item.skratka)  // додати умови для вибору
                .map(item => item.nazovskup)
        )
    ];  // Отримуємо унікальні панелі

    uniquePanels.forEach(panel => {
        const option = document.createElement('option');
        option.value = panel;
        option.textContent = panel;
        panelDropdown.appendChild(option);
    });

    // Додаємо обробник події на зміну вибору панелі
    panelDropdown.addEventListener('change', (event) => {
        const selectedPanel = event.target.value;
        const dropdown = document.getElementById('packetsPackets');
        dropdown.selectedIndex = 0;  // Це вибере "Option
        filterTableByPanel(selectedPanel);

    });
}

async function fetchDataTimeStamp() {
    try {
        const response = await fetch('http://localhost:1025/TimeStampList', { headers: headers });
        if (!response.ok) {
            throw new Error('Помилка при отриманні даних з API');
        }


        return await response.json();
    } catch (error) {

    }
}

// Функція порівняння об'єктів
function isEqual(obj1, obj2) {
    // Перевірка, чи обидва параметри є об'єктами
    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
        return false;
    }

    // Отримуємо ключі об'єктів
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    // Перевірка, чи кількість ключів у обох об'єктів однакова
    if (keys1.length !== keys2.length) {
        return false;
    }

    // Перевірка кожної пари ключ-значення
    for (let key of keys1) {
        if (obj1[key] !== obj2[key]) {
            return false;
        }
    }

    return true;
}




// Функція для заповнення таблиці даними
async function populateTable(data) {

    const timeStamp = await fetchDataTimeStamp ();



    const tableBody = document.querySelector ('#resultsTable tbody');

    tableBody.innerHTML = ''; // Очищаємо таблицю перед заповненням
    data.sort ((a, b) => a.nazovskup.localeCompare (b.nazovskup));
    // console.log('Сортоване' + JSON.stringify(data));

    let lastGroup = ''; // Змінна для відстеження попередньої групи

    data.forEach (item => {
        // Перевіряємо, чи змінилася група
        if (item.nazovskup !== lastGroup) {
            // Якщо група змінилася, додаємо новий рядок для назви групи
            const groupRow = document.createElement ('tr');
            groupRow.classList.add ('group-row'); // Додаємо клас для стилю

            const groupCell = document.createElement ('td');
            groupCell.colSpan = 3;  // Колонка займатиме 4 клітинки для назви групи (перед кнопкою)
            groupCell.textContent = item.nazovskup || '';  // Назва групи
            groupRow.appendChild (groupCell);

            // Додаємо кнопку для показу/сховання в тому ж рядку
            const toggleButtonCell = document.createElement ('td');
            const toggleButton = document.createElement ('button');
            toggleButton.textContent = 'Сховати';  // Текст кнопки
            toggleButton.classList.add ('toggle-button'); // Додаємо клас для кнопки

            toggleButton.addEventListener ('click', () => {
                // Перевіряємо, який текст на кнопці, і змінюємо на протилежний
                if (toggleButton.textContent === 'Показати') {
                    toggleButton.textContent = 'Сховати';  // Якщо кнопка має текст "Показати", змінюємо на "Сховати"
                    toggleButton.classList.remove ('blinking');  // Видаляємо клас анімації
                } else {
                    toggleButton.textContent = 'Показати';  // Якщо кнопка має текст "Сховати", змінюємо на "Показати"
                    toggleButton.classList.add ('blinking');  // Додаємо клас для анімації моргання
                }

                // Знаходимо всі рядки, що належать до цієї групи
                const groupRows = tableBody.querySelectorAll (`[data-group="${item.nazovskup}"]`);
                groupRows.forEach (row => {
                    // Перемикаємо видимість рядків
                    row.style.display = row.style.display === 'none' ? '' : 'none';
                });
            });

            toggleButtonCell.appendChild (toggleButton);
            groupRow.appendChild (toggleButtonCell);
            tableBody.appendChild (groupRow);

            // Оновлюємо значення останньої групи
            lastGroup = item.nazovskup;
        }

        // Додаємо рядок з даними аналізу
        const row = document.createElement ('tr');
        row.setAttribute ('data-group', item.nazovskup); // Додаємо атрибут для зв'язку з групою

        const kodvysTextCell = document.createElement ('td');
        kodvysTextCell.textContent = item.kodvys_text || '';  // Перевірка на null чи undefined
        row.appendChild (kodvysTextCell);

        const skratkaCell = document.createElement ('td');
        skratkaCell.textContent = item.skratka || '';  // Перевірка на null чи undefined
        row.appendChild (skratkaCell);

        const nazovCell = document.createElement ('td');
        nazovCell.textContent = item.nazov || '';  // Перевірка на null чи undefined
        row.appendChild (nazovCell);

        const cenaCell = document.createElement ('td');
// Встановлення класу для редагування ціни
        cenaCell.classList.add ('editable-price');  // Додаємо клас editable-price
        cenaCell.textContent = item.cena || '';  // Перевірка на null чи undefined

// Додавання обробника події для подвійного кліку (щоб редагувати ціну)
        cenaCell.setAttribute ('ondblclick', 'editPrice(this)');  // При дворазовому кліку викликається функція editPrice
        cenaCell.style.textAlign = 'center';  // Вирівнювання по центру

        const [day, month, year] = actualDatePrice.split('.');
        const formattedDate = `${year}-${month}-${day}`;
        const realObj = {
            code: item.kodvys_text,
            confirm_date: formattedDate ,
            new_price: `${item.cena}`


        }


        timeStamp.forEach(obj => {
            if (isEqual(realObj,obj)){
                // Створюємо елемент іконки
                const warningIcon = document.createElement ('span');
                warningIcon.classList.add ('warning-icon');  // Додаємо клас для іконки
                // Додаємо текст підказки (title) до іконки
                warningIcon.setAttribute ('title', 'Планова сума оновлення, на вибрану дату');  // Підказка з текстом
                // Додаємо іконку до клітинки правіше ціни
                cenaCell.appendChild (warningIcon);




            }
        });


// Перевірка умови для показу іконки (наприклад, якщо ціна менша за 10)








// Додаємо клітинку до таблиці або іншого контейнера


        row.appendChild (cenaCell);

        // Додаємо рядок з даними аналізу
        tableBody.appendChild (row);
    });
}






// Функція для редагування ціни
function editPrice(cell) {
    // Зберігаємо поточну ціну
    const currentPrice = cell.textContent.trim();

    // Створюємо інпут для редагування
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentPrice;
    input.classList.add('price-input');

    // Замінюємо клітинку на інпут
    cell.textContent = ''; // Очищаємо клітинку
    cell.appendChild(input);

    // Задаємо фокус на новому інпуті
    input.focus();

    // Обробка зміни значення (коли користувач натискає Enter або виходить з поля)
  //  input.addEventListener('blur', function() {
     //   const newPrice = input.value.trim();

        // Якщо ціна змінилась, викликаємо функцію
     //   if (newPrice !== currentPrice) {
       //     updatePrice(newPrice, cell); // Викликаємо функцію для оновлення ціни
      //  }



        // Повертаємо текстове значення в клітинку
      //  cell.textContent = newPrice;

   // });

    // Обробка натискання Enter для завершення редагування
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {

            console.log('Enter')
            let currentDate = new Date();
                    console.log(currentDate.toLocaleDateString('uk-UA'));
                    console.log(actualDatePrice);
            // Отримуємо всі клітинки в цьому рядку
            const row = cell.closest('tr');
            const cells = row.querySelectorAll('td');
                if (actualDate === currentDate.toLocaleDateString('uk-UA')  ){
                    localStorage.setItem('LastChangedCode', `Останній змінений код: ${JSON.stringify(row.cells[0].textContent.trim())}  на дослідження: ${JSON.stringify(row.cells[1].textContent.trim())} на дату ${actualDatePrice}` );
                    document.querySelector('.code-text').textContent = localStorage.getItem('LastChangedCode');
                    console.log('ok');


                    const newPrice = input.value.trim();
                    if (newPrice !== currentPrice) {
                        updatePrice(newPrice, cell); // Викликаємо функцію для оновлення ціни
                    }

                    cell.textContent = newPrice;


                } else if((actualDate !== currentDate.toLocaleDateString('uk-UA')) && (cells[1].textContent.trim() !== cells[2].textContent.trim())) {
                    console.log('no');
                    const newPrice = input.value.trim();
                    if (newPrice !== currentPrice) {
                        updatePriceToDate(newPrice, cell); // Викликаємо функцію для оновлення ціни
                        localStorage.setItem('LastChangedCode', `Остання змінена вартість на код: ${JSON.stringify(row.cells[0].textContent.trim())}  на дослідження: ${JSON.stringify(row.cells[1].textContent.trim())} на дату ${actualDatePrice}` );
                        document.querySelector('.code-text').textContent = localStorage.getItem('LastChangedCode');
                    }

                    cell.textContent = newPrice;
                } else {

                    const newPrice = input.value.trim();
                    if (newPrice !== currentPrice) {
                        updatePriceToDate(newPrice, cell); // Викликаємо функцію для оновлення ціни
                        localStorage.setItem('LastChangedCode', `Остання змінена вартість на код: ${JSON.stringify(row.cells[0].textContent.trim())}  на дослідження: ${JSON.stringify(row.cells[1].textContent.trim())} на дату ${actualDatePrice}` );
                        document.querySelector('.code-text').textContent = localStorage.getItem('LastChangedCode');
                    }

                    cell.textContent = newPrice;

                   // alert('Зміна вартості пакетів на дату. В розробці');

                }

        }
    });
}


// Функція для оновлення ціни
function updatePriceToDate(newPrice, cell) {
    // Отримуємо всі клітинки в цьому рядку
    const row = cell.closest('tr');
    const cells = row.querySelectorAll('td');

    // Отримуємо всі значення з клітинок
    const rowData = {
        kodvys_text: cells[0].textContent.trim(),
        skratka: cells[1].textContent.trim(),
        nazov: cells[2].textContent.trim(),
        cena: newPrice,
        activaton: actualDate// Оновлене значення ціни
    };

    // Логіка для відправки на сервер або оновлення даних
    console.log('Оновлені дані рядка:', rowData);

    // Тут ви можете викликати свою функцію або API для обробки нової ціни

    fetch('http://localhost:1025/update-price-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rowData) // Відправляємо всю інформацію рядка
    })
        .then(response => {
            // Перевірка статусу відповіді
            if (response.ok) {
                cell.style.color = 'green'; // Задаємо зелений колір
                cell.style.fontWeight = 'bold'; // Задаємо жирний шрифт
                console.log('Ціна оновлена на сервері');
            }
        })
        .catch(error => {
            // Обробка помилки
            console.error('Сталася помилка:', error);
            cell.style.color = 'red'; // Задаємо червоний колір для помилки
            cell.style.fontWeight = 'bold'; // Змінюємо шрифт на звичайний
            alert('Помилка при оновленні ціни. Спробуйте ще раз.');
        });









}








// Функція для оновлення ціни
function updatePrice(newPrice, cell) {
    // Отримуємо всі клітинки в цьому рядку
    const row = cell.closest('tr');
    const cells = row.querySelectorAll('td');

    // Отримуємо всі значення з клітинок
    const rowData = {
        kodvys_text: cells[0].textContent.trim(),
        skratka: cells[1].textContent.trim(),
        nazov: cells[2].textContent.trim(),
        cena: newPrice,  // Оновлене значення ціни
        activaton: actualDate// Оновлене значення ціни
    };

    // Логіка для відправки на сервер або оновлення даних
    console.log('Оновлені дані рядка:', rowData);

    // Тут ви можете викликати свою функцію або API для обробки нової ціни

    fetch('http://localhost:1025/update-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rowData) // Відправляємо всю інформацію рядка
    })
        .then(response => {
            // Перевірка статусу відповіді
            if (response.ok) {
                cell.style.color = 'green'; // Задаємо зелений колір
                cell.style.fontWeight = 'bold'; // Задаємо жирний шрифт
                console.log('Ціна оновлена на сервері');
            }
        })
        .catch(error => {
            // Обробка помилки
            console.error('Сталася помилка:', error);
            cell.style.color = 'red'; // Задаємо червоний колір для помилки
            cell.style.fontWeight = 'bold'; // Змінюємо шрифт на звичайний
            alert('Помилка при оновленні ціни. Спробуйте ще раз.');
        });

}
// Функція для фільтрації таблиці за вибраною панеллю
async function filterTableByPanel(selectedPanel) {
    if (selectedPanel === '') {
        await populateTable (tableDataPrice);  // Якщо панель не вибрана, показуємо всі дані
    } else {
        const filteredData = tableDataPrice.filter (item => item.nazovskup === selectedPanel);
        await populateTable (filteredData);  // Оновлюємо таблицю з відфільтрованими даними
    }
}

// Функція для оновлення індикатора підключення
function updateConnectionIndicator(isConnected) {
    let indicator = document.getElementById('connectionIndicator');

    if (isConnected) {
        indicator.style.backgroundColor = 'green';  // Зелене коло при успішному підключенні
    } else {
        indicator.style.backgroundColor = 'red';    // Червоне коло при невдалому підключенні
    }
}

// Симуляція перевірки підключення до БД
// Замість цього викликайте відповідну функцію для перевірки реального підключення
function checkDatabaseConnection() {
    // Отримуємо дані з API
    fetch('http://localhost:1025/analyze', { headers: headers })
        .then(response => {
            console.log('Статус відповіді:', response.status);
            if (response.ok) {
                updateConnectionIndicator(true);  // Зелене коло при успішному підключенні
            } else  {updateConnectionIndicator(false);  // Червоне коло при невдалому підключенні}

        }}).catch(() => {updateConnectionIndicator(false);})}  // Червоне коло при невдалому підключенні}
// Виконувати перевірку підключення кожні 2 хвилини
setInterval(checkDatabaseConnection, 60000); // 120000 мс = 2 хвилини





// Функція для фільтрації таблиці за текстовим запитом
function filterTable() {

    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // Виводимо значення пошуку для налагодження
    console.log('Пошуковий запит: ', searchTerm);

    // Фільтруємо дані за допомогою пошукового запиту
    const filteredData = tableDataPrice.filter(item => {
        return (
            (item.kodvys_text && item.kodvys_text.toLowerCase().includes(searchTerm)) ||
            (item.skratka && item.skratka.toLowerCase().includes(searchTerm)) ||
            (item.nazov && item.nazov.toLowerCase().includes(searchTerm))
        );
    });

    // Виводимо відфільтровані дані для налагодження
    console.log('Відфільтровані дані: ', filteredData);

    // Оновлюємо таблицю з відфільтрованими даними
    populateTable(filteredData);
}

// Функція для прокручування вгору
const scrollToTopBtn = document.getElementById('scrollToTopBtn');
scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Показувати кнопку при прокручуванні
window.onscroll = function() {
    if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
        scrollToTopBtn.style.display = 'block';
    } else {
        scrollToTopBtn.style.display = 'none';
    }
};
