# Git Manual For Two PCs

## Для чого це

Цей файл допомагає працювати з одним репозиторієм на двох комп'ютерах без плутанини.

Сценарій простий:
- на одному комп'ютері ви змінюєте код і робите `push`
- на іншому комп'ютері ви забираєте ці зміни через `pull`

## Базове правило

Перед початком роботи на будь-якому комп'ютері спочатку виконайте:

```powershell
git pull --rebase origin main
```

Після завершення роботи виконайте:

```powershell
git add -A
git commit -m "Короткий опис змін"
git push origin main
```

## Щоденний сценарій

### На комп'ютері 1

```powershell
git pull --rebase origin main
```

Працюєте з файлами, потім:

```powershell
git add -A
git commit -m "Опис того, що зроблено"
git push origin main
```

### На комп'ютері 2

Перед початком роботи:

```powershell
git pull --rebase origin main
```

Після своїх змін:

```powershell
git add -A
git commit -m "Опис того, що зроблено"
git push origin main
```

## Якщо тут уже є локальні зміни

Спочатку перевірте стан:

```powershell
git status
```

Якщо є незакомічені зміни, є 2 варіанти.

### Варіант 1. Одразу закомітити

```powershell
git add -A
git commit -m "Проміжні локальні зміни"
git pull --rebase origin main
```

### Варіант 2. Тимчасово сховати зміни

```powershell
git stash
git pull --rebase origin main
git stash pop
```

Це зручно, якщо ви ще не готові робити коміт.

## Якщо `git push` не проходить

Найчастіше причина в тому, що на GitHub вже є нові коміти з іншого комп'ютера.

Тоді виконайте:

```powershell
git pull --rebase origin main
git push origin main
```

## Якщо з'явився конфлікт

Git покаже, у яких файлах конфлікт.

Порядок дій:
- відкрити конфліктні файли
- вибрати правильний варіант коду
- прибрати службові позначки Git
- зберегти файл
- виконати:

```powershell
git add .
git rebase --continue
```

Якщо хочете скасувати та повернутися назад:

```powershell
git rebase --abort
```

## 5 команд-шпаргалка

```powershell
git status
git pull --rebase origin main
git add -A
git commit -m "Опис змін"
git push origin main
```

## Корисна звичка

Завжди робіть `git pull --rebase origin main` перед початком роботи на іншому комп'ютері.

Це найпростіший спосіб уникати конфліктів і ситуації, коли `push` раптом не проходить.
