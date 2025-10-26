/**
 * Розраховує швидкість клубочкової фільтрації (eGFR) за формулою CKD-EPI 2021 року.
 *
 * @param {number} scr Креатинін сироватки крові (в мг/дл)
 * @param {number} age Вік пацієнта (в роках)
 * @param {string} gender Стать пацієнта (приймає 'female' для жінок або 'male' для чоловіків)
 * @returns {number | string} Розраховане значення eGFR (мл/хв/1.73м²) або повідомлення про помилку.
 */
function calculateCkdEpi2021(scr, age, gender) {
  let kappa, alpha, genderCoeff;

  if (gender === 'female') {
    kappa = 0.7;       // κ (каппа) для жінок
    alpha = -0.241;    // α (альфа) для жінок
    genderCoeff = 1.012; // Коефіцієнт для статі (жінки)
  } else if (gender === 'male') {
    kappa = 0.9;       // κ (каппа) для чоловіків
    alpha = -0.302;    // α (альфа) для чоловіків
    genderCoeff = 1.0;   // Коефіцієнт для статі (чоловіки)
  } else {
    // Обробка некоректного введення статі
    return "Помилка: стать повинна бути 'female' або 'male'.";
  }

  // Перевірка на коректність числових значень
  if (typeof scr !== 'number' || typeof age !== 'number' || scr <= 0 || age <= 0) {
    return "Помилка: креатинін та вік повинні бути додатніми числами.";
  }

  // Розрахунок за формулою
  const scrRatio = scr / kappa;
  
  // min(Scr/κ, 1)^α
  const minPart = Math.pow(Math.min(scrRatio, 1), alpha);
  
  // max(Scr/κ, 1)^-1.200
  const maxPart = Math.pow(Math.max(scrRatio, 1), -1.200);
  
  // 0.9938^Вік
  const agePart = Math.pow(0.9938, age);

  // Збираємо все разом
  const eGFR = 142 * minPart * maxPart * agePart * genderCoeff;

  return eGFR;
}

// --- Приклад використання ---

// 1. Жінка, 45 років, креатинін 0.8 мг/дл
const scr1 = 0.8;
const age1 = 45;
const gender1 = 'female';
const eGFR1 = calculateCkdEpi2021(scr1, age1, gender1);
console.log(`eGFR (Жінка, ${age1} років, креатинін ${scr1}): ${eGFR1.toFixed(2)} мл/хв/1.73м²`);


// 2. Чоловік, 60 років, креатинін 1.1 мг/дл
const scr2 = 1.1;
const age2 = 60;
const gender2 = 'male';
const eGFR2 = calculateCkdEpi2021(scr2, age2, gender2);
console.log(`eGFR (Чоловік, ${age2} років, креатинін ${scr2}): ${eGFR2.toFixed(2)} мл/хв/1.73м²`);

// 3. Жінка, 70 років, креатинін 1.5 мг/дл
const scr3 = 1.5;
const age3 = 70;
const gender3 = 'female';
const eGFR3 = calculateCkdEpi2021(scr3, age3, gender3);
console.log(`eGFR (Жінка, ${age3} років, креатинін ${scr3}): ${eGFR3.toFixed(2)} мл/хв/1.73м²`);

// 4. Приклад помилки
const eGFR_error = calculateCkdEpi2021(1.0, 50, 'man'); // Неправильна стать
console.log(eGFR_error);