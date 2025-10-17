




// Дані для авторизації
const username = 'HMU';
const password = 'cybersecurity';
const url = 'localhost:1025';
let depcode = document.getElementById('data-container').getAttribute('data-depcode');
let startStatus = false;
let tableData2;
if (depcode === 'undefined') { depcode = '00032'}
const apiUrl = `http://${url}/analyzeClinik?depcode=${depcode}`;
const buttons = document.getElementById("openModalBtn");

// Кодуємо авторизацію в форматі Basic
const base64Credentials = btoa(username + ':' + password);

// Заголовки для запиту
const headers = {
    'Authorization': 'Basic ' + base64Credentials
};

// Масив для зберігання отриманих даних
let tableData = [];

let codeCountData = [];

proccesData();


async function proccesData(){


        try {
            // Очікуємо виконання codeCountList перед тим, як продовжити
            codeCountData = await codeCountList ();
            await primaryLoad();
        } catch (error) {
            console.error ('Помилка обробки даних:', error);
        }




}






async function primaryLoad() {

// Отримуємо дані з API
    fetch (apiUrl, {headers: headers})
        .then (response => {
            if (!response.ok) {
                throw new Error ('Помилка при отриманні даних з API');
            }
            return response.json ();
        })
        .then (async data => {

            // Приховуємо індикатор завантаження
            document.getElementById ('loading').style.display = 'none';

            // Зміна ширини стовпців через JavaScript
            document.querySelectorAll ('#resultsTable th').forEach ((th, index) => {
                if (index === 0) {
                    th.style.width = '5%';
                    th.style.textAlign = 'center'; // Ширина для першого стовпця
                } else if (index === 1) {
                    th.style.width = '10%';
                    th.style.textAlign = 'center';// Ширина для другого стовпця
                } else if (index === 2) {
                    th.style.width = '10%';
                    th.style.textAlign = 'center';// Ширина для третього стовпця
                } else if (index === 3) {
                    th.style.width = '45%';  // Ширина для четвертого стовпця
                    th.style.textAlign = 'center';  // Вирівнювання по правому краю
                } else if (index === 4) {
                    th.style.width = '10%';  // Ширина для четвертого стовпця
                    th.style.textAlign = 'center';  // Вирівнювання по правому краю
                }
            });

            // Перевіряємо наявність даних
            if (data && Array.isArray (data) && data.length > 0) {
                tableData = data; // Зберігаємо дані в змінній

                // Показуємо таблицю
                document.getElementById ('resultsTable').style.display = 'table';

                // Заповнюємо таблицю даними
                populateTable (data);


                // Заповнюємо випадаючий список панелями
                populatePanelDropdown (data);
                // populatePacketsDropdown(data);
                checkDatabaseConnection ()


            } else {
                document.getElementById ('error').style.display = 'block';
            }
        })
        .catch (error => {
            // У разі помилки показуємо повідомлення
            console.error ('Помилка:', error);
            document.getElementById ('loading').style.display = 'none';
            document.getElementById ('error').style.display = 'block';
        });


}





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

    fetch(`http://${url}/departaments`, { headers: headers })
        .then(response => {
            if (!response.ok) {
                throw new Error('Помилка при отриманні даних з API');
            }
            return response.json();
        })
        .then(data => {
            const panelDropdown = document.getElementById('panelDropdown');

            data.forEach(panel => {
                const option = document.createElement('option');
                option.value = panel.kododd;
                option.textContent = panel.kodpzszobraz;
                panelDropdown.appendChild(option);
            });

            // Додаємо обробник події на зміну вибору панелі
            panelDropdown.addEventListener('change', (event) => {
                const tableBody = document.querySelector('#resultsTable tbody');
                tableBody.innerHTML = ''; // Очищаємо таблицю перед заповненням
                document.getElementById('error').style.display = 'none';  // Приховуємо повідомлення про помилку
                const selectedPanel = event.target.value;
               // const selectedPanel = event.target.options[event.target.selectedIndex].text;

                const username = 'HMU';
                const password = 'cybersecurity';

                const apiUrl = `http://${url}/analyzeClinik?depcode=${selectedPanel}`;

// Кодуємо авторизацію в форматі Basic
                const base64Credentials = btoa(username + ':' + password);

// Заголовки для запиту
                const headers = {
                    'Authorization': 'Basic ' + base64Credentials
                };

// Масив для зберігання отриманих даних
              //  let tableData2 = [];




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
                                th.style.width = '5%';
                                th.style.textAlign = 'center';
                                // Ширина для першого стовпця
                            } else if (index === 1) {
                                th.style.width = '10%';
                                th.style.textAlign = 'center';// Ширина для другого стовпця
                            } else if (index === 2) {
                                th.style.width = '10%';
                                th.style.textAlign = 'center';// Ширина для третього стовпця
                            } else if (index === 3) {
                                th.style.width = '45%';  // Ширина для четвертого стовпця
                                th.style.textAlign = 'center';  // Вирівнювання по правому краю
                            }   else if (index === 4) {
                                th.style.width = '10%';  // Ширина для четвертого стовпця
                                th.style.textAlign = 'center';  // Вирівнювання по правому краю
                            }
                        });

                        // Перевіряємо наявність даних

                        if (data && Array.isArray (data) && data.length > 0) {
                            tableData2 = data; // Зберігаємо дані в змінній

                            // Показуємо таблицю
                            document.getElementById ('resultsTable').style.display = 'table';

                            // Заповнюємо таблицю даними
                            populateTable (data);


                        } else {
                            document.getElementById ('error').style.display = 'block';
                        }
                    })
                    .catch(error => {
                        // У разі помилки показуємо повідомлення
                        console.error('Помилка:', error);
                        document.getElementById('loading').style.display = 'none';
                        document.getElementById('error').style.display = 'block';
                    });



            });


        })


}



async function populateTable(data) {




    const tableBody = document.querySelector('#resultsTable tbody');
    tableBody.innerHTML = ''; // Очищаємо таблицю перед заповненням

    for (const item of data) {
        const row = document.createElement('tr');

        // Додаємо чекбокс до кожного рядка
        const checkboxCell = document.createElement('td');
        checkboxCell.style.textAlign = 'center'; // Вирівнювання по горизонталі
        checkboxCell.style.verticalAlign = 'middle'; // Вирівнювання по вертикалі

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('item-checkbox');  // Додаємо клас для чекбоксу

        checkboxCell.appendChild(checkbox);
        row.appendChild(checkboxCell);

        // Додаємо інші дані до рядка
        const kodvysTextCell = document.createElement('td');
        kodvysTextCell.style.textAlign = 'center'; // Вирівнювання по центру







           const codeItem = codeCountData?.find(itemCode => itemCode.kodvykonu === item.kodvykonu && itemCode.count > 1);
        console.log(codeItem);
          if (codeItem?.count > 1) {           // Додаємо зелений кружок

               const greenCircle = document.createElement('div');
               greenCircle.classList.add('green-circle');
              greenCircle.title = " Послуга має нащадків по коду в інших підрозділах"; // додавання підказки
               kodvysTextCell.appendChild(greenCircle);
         }












       // greenCircle.addEventListener('click', () => openFormWithData(item.kodvykonu)); // Відкриваємо форму при кліку на кружок

        kodvysTextCell.appendChild(document.createTextNode(item.kodvykonu || ''));  // Додаємо текст після кружка
        row.appendChild(kodvysTextCell);

        const skratkaCell = document.createElement('td');
        skratkaCell.textContent = item.kodpzszobraz || '';  // Перевірка на null чи undefined
        skratkaCell.style.textAlign = 'center'; // Вирівнювання по центру
        row.appendChild(skratkaCell);

        const nazovCell = document.createElement('td');
        nazovCell.style.textAlign = 'left';
        nazovCell.textContent = item.popis || '';  // Перевірка на null чи undefined
        row.appendChild(nazovCell);

        const cenaCell = document.createElement('td');
        cenaCell.classList.add('editable-price');  // Додаємо клас editable-price
        cenaCell.textContent = item.hotovost || '';  // Перевірка на null чи undefined
        cenaCell.setAttribute('ondblclick', 'editPrice(this)');  // При дворазовому кліку викликається функція editPrice
        cenaCell.style.textAlign = 'center';  // Вирівнювання по правому краю
        row.appendChild(cenaCell);

        // Додаємо рядок в таблицю
        tableBody.appendChild(row);

}}
async function codeCountList() {
    try {
        // Викликаємо API для отримання даних
        const response = await fetch(`http://${url}/codeCount`, { headers: headers });

        // Перевірка на успішний статус відповіді
        if (!response.ok) {
            throw new Error(`HTTP помилка! Статус: ${response.status}`);
        }

        // Отримуємо дані у форматі JSON
        const data = await response.json();

        // Повертаємо отримані дані
        return data;

    } catch (error) {
        console.error('Помилка при отриманні даних з API:', error);
    }
}

// Функція для відображення форми з даними
function showForm(data) {
    // Тут можна реалізувати логіку для відображення форми
    // Наприклад, створити модальне вікно зі списком даних
    console.log('Відкриваємо форму з даними:', data);
    // Приклад: alert(JSON.stringify(data));
}

// Функція для редагування ціни
function editPrice(cell) {
    startStatus = false;
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
    input.addEventListener('blur', function() {

        const newPrice = input.value.trim();

        // Якщо ціна змінилась, викликаємо функцію
        if (newPrice !== currentPrice) {
            updatePrice(newPrice, cell,currentPrice); // Викликаємо функцію для оновлення ціни
        }



        // Повертаємо текстове значення в клітинку
        cell.textContent = newPrice;

    });

    // Обробка натискання Enter для завершення редагування
    input.addEventListener('keypress', function(e) {

        if (e.key === 'Enter') {
            const newPrice = input.value.trim();
            if (newPrice !== currentPrice) {
                updatePrice(newPrice, cell,currentPrice); // Викликаємо функцію для оновлення ціни
            }

            cell.textContent = newPrice;
        }
    });
}






// Функція для оновлення ціни
function updatePrice(newPrice, cell,currentPrice) {

    // Отримуємо всі клітинки в цьому рядку
    const row = cell.closest('tr');
    const cells = row.querySelectorAll('td');
    // Отримуємо чекбокс з першої клітинки
    const checkbox = cells[0].querySelector('input[type="checkbox"]');

    // Перевіряємо, чи встановлена галочка
    const isChecked = checkbox ? checkbox.checked : false;
debugger;
    let rowDataModal;
    // Отримуємо всі значення з клітинок
    const rowData = {
        checked: isChecked,
        kodvys_text: cells[1].textContent.trim(),
        skratka: cells[2].textContent.trim(),
        nazov: cells[3].textContent.trim(),
        cena: newPrice,  // Оновлене значення ціни
    };
    if (isChecked) {
       if(!startStatus){
         //  alert(`Вибрано аналіз:\n${rowData.nazov}.\nНова вартість ${rowData.cena} грн.\nТакож буде оновлена вартість у всіх потомків по коду ( ${rowData.kodvys_text} ).`);
              startStatus = true;
              openModal(rowData.kodvys_text,rowData.cena);
           buttons.addEventListener('click', async function (event) {
               event.preventDefault ();
               // Отримуємо всі чекбокси з класом "checkbox-class"
               const checkboxes = document.querySelectorAll ('.checkboxID');

// Перевіряємо стан кожного чекбоксу

let name = '';
               for (const index in checkboxes) {
                   const checkbox = checkboxes[index];
                   if (checkbox.checked) {

                       const listItem = checkbox.closest ('li');

                       // Знаходимо елемент <span> для назви та ціни
                       const nameSpan = listItem.querySelector ('span:first-of-type'); // Перше <span> - це назва
                       const priceSpan = listItem.querySelector ('span:last-of-type'); // Останнє <span> - це ціна
                       // Отримуємо текстові значення
                        name = nameSpan ? nameSpan.textContent : '';
                       const price = priceSpan ? priceSpan.textContent : '';
                       console.log (`Чекбокс увімкнено для ${name}`);
                        rowDataModal = {
                           checked: isChecked,
                           kodvys_text: cells[1].textContent.trim(),
                           skratka: name,
                           nazov: cells[3].textContent.trim(),
                           cena: rowData.cena,  // Оновлене значення ціни
                       };
                       // О

                       try {
                           const response = await fetch (`http://${url}/update-priceClinik`, {
                               method: 'POST',
                               headers: {'Content-Type': 'application/json'},
                               body: JSON.stringify (rowDataModal) // Відправляємо всю інформацію рядка
                           });

                           if (response.ok) {



                                 // Оновлюємо текст в клітинці
                               cell.style.color = 'green'; // Задаємо зелений колір
                               cell.style.fontWeight = 'bold'; // Задаємо жирний шрифт
                               console.log ('Ціна оновлена на сервері');
                               // Функція для закриття модального вікна
                               const modalClose = document.getElementById ("modal");
                               modalClose.style.display = "none";
                           }
                       } catch (error) {
                           // Обробка помилки
                           console.error ('Сталася помилка:', error);
                           cell.style.color = 'red'; // Задаємо червоний колір для помилки
                           cell.style.fontWeight = 'bold'; // Змінюємо шрифт на звичайний
                       }
                   } else {
                       const listItem = checkbox.closest ('li');
                       const nameSpan = listItem.querySelector ('span:first-of-type'); // Перше <span> - це назва
                       name = nameSpan ? nameSpan.textContent : '';


                       if(name === rowData.skratka){


                           cell.textContent = currentPrice;


                       }
                       console.log (`Чекбокс вимкнено`);
                   }
               }


               // Функція для закриття модального вікна

               modal.style.display = "none";


           });
       }
    } else {
        const rowDataModal = {
            checked: isChecked,
            kodvys_text: cells[1].textContent.trim(),
            skratka: cells[2].textContent.trim(),
            nazov: cells[3].textContent.trim(),
            cena: rowData.cena,  // Оновлене значення ціни
        };
        console.log (rowDataModal  );
         fetch (`http://${url}/update-priceClinik`, {
             method: 'POST',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify (rowDataModal) // Відправляємо всю інформацію рядка
         }).then (response => {})




       // alert(`Вибрано аналіз:\n${rowDataModal.nazov}.\nНова вартість ${rowDataModal.cena} грн.\n${rowDataModal.skratka}\n${rowDataModal.kodvys_text}\nТакож буде оновлена вартість у всіх потомків по коду ( ${rowDataModal.kodvys_text} ).`);












    }





    // Відправляємо дані на сервер



}
// Функція для фільтрації таблиці за вибраною панеллю
function filterTableByPanel(selectedPanel) {


    if (selectedPanel === '') {
        populateTable(tableData);  // Якщо панель не вибрана, показуємо всі дані
    } else {
        const filteredData = tableData.filter(item => item.kodpzszobraz === selectedPanel);
        populateTable(filteredData);  // Оновлюємо таблицю з відфільтрованими даними
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
    fetch(apiUrl, { headers: headers })
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
    const filteredData = tableData2.filter(item => {
        return (
            (item.kodvykonu && item.kodvykonu.toLowerCase().includes(searchTerm)) ||
            (item.kodpzszobraz && item.kodpzszobraz.toLowerCase().includes(searchTerm)) ||
            (item.popis && item.popis.toLowerCase().includes(searchTerm))
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
