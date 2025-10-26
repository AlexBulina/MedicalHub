import { Service } from 'node-windows';
// import { appendFileSync } from 'fs';

// appendFileSync('C:\\servicelog.txt', 'Service started\n');

const args = process.argv.slice(2);

// Створюємо нову службу
var svc = new Service({
  name: 'Hemomedika SMS Backend service last work', // Назва служби
  description: 'Hemomedika SMS Backend service last work', // Опис
  script: 'C:\\Hemomed Backup\\backend.js' // Шлях до вашого JS файлу
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
  
