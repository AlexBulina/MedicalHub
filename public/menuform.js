// Отримуємо елементи модального вікна
var modal = document.getElementById("modal");
const closeModal = document.getElementById ("closeModal");


// Функція для відкриття модального вікна
function openModal(item,cena) {
    const username = 'HMU';  // Замініть на вашого користувача
    const password = 'cybersecurity';  // Замініть на ваш пароль
    // Кодуємо авторизацію в форматі Basic
    const base64Credentials = btoa(username + ':' + password);

    // Заголовки для запиту
    const headers = {
        'Authorization': 'Basic ' + base64Credentials
    };

    fetch(`http://localhost:1025/analyzeDoctorSelector?depcode=${item}`, { headers: headers })

        .then(response => {
            if (!response.ok) {
                throw new Error('Помилка при отриманні даних з API');
            }
            return response.json();
        })
        .then(data => {

            const listElement = document.getElementById("modalList");
            const codeName = document.getElementById("codeName");
            document.getElementById('modalTitle').innerHTML = `Нова ціна ${cena} грн.<br>Перелік нащадків по коду: ${data[0].kodvykonu}`;

            // Очищаємо попередні елементи списку
            listElement.innerHTML = "";
            if (data && data.length > 0) {
                data.forEach(item => {
                    const listItem = document.createElement("li");

                    // Створюємо чекбокс
                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.checked = true;
                    // Додаємо унікальний id до чекбоксу
                    checkbox.classList.add(`checkboxID`);
                    checkbox.style.marginRight = "10px";
                    checkbox.style.marginTop = "10px";
                    // Додаємо чекбокс до списку
                    listItem.appendChild(checkbox);
                    // Створюємо елементи для назви та ціни
                    const name = document.createElement("span");
                    name.textContent = item.kodpzszobraz;
                    name.style.flex = "1";  // Забезпечуємо, щоб назва займала всю доступну ширину
                    name.style.textAlign = "left";  // Вирівнюємо текст зліва


                    const price = document.createElement("span");
                    price.textContent = `Актуальна вартість послуги - ${item.hotovost} грн.`;

                    // Задаємо стиль для li, щоб елементи відображались в рядок
                    listItem.style.display = "flex";
                    listItem.style.justifyContent = "space-between";
                    listItem.style.alignItems = "center";
                    listItem.style.borderBottom = "1px solid black";



                    // Додаємо чекбокс, назву та ціну до li
                    listItem.appendChild(checkbox);  // Чекбокс перед назвою
                    listItem.appendChild(name);
                    listItem.appendChild(price);

                    // Додаємо li до списку
                    listElement.appendChild(listItem);
                });
            }



            console.log(data);

        })



        .catch(error => {

        });

    modal.style.display = "block";
}

// Функція для закриття модального вікна
closeModal.onclick = function() {
    modal.style.display = "none";
}

// Закриття модального вікна при кліку поза його межами
window.onclick = function(event) {
    if (event.target === modal) {
        modal.style.display = "none";
    }
}

