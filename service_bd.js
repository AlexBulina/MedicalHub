import { Service } from 'node-windows';
// import { appendFileSync } from 'fs';

// appendFileSync('C:\\servicelog.txt', 'Service started\n');

const args = process.argv.slice(2);

// Створюємо нову службу
var svc = new Service({
  name: 'Hemomedika SMS DB Monitor service', // Назва служби
  description: 'Hemomedika SMS DB Monitor service', // Опис
  script: 'C:\\Hemomed Backup\\index.mjs', // Шлях до вашого JS файлу
   nodeOptions: [
    '--max-old-space-size=1024'  // Додаємо параметр для збільшення пам'яті
  ]
});

// Реєстрація події установки
svc.on('install', function() {
  svc.start();
  console.log('Service started')
});







// Встановлюємо службу
svc.install();
svc.on('error', function(err){
    console.error('Service error:', err);
  });
  
