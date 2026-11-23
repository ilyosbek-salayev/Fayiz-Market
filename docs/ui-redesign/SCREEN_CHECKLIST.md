# Ekranlar bo‘yicha checklist

✅ — yangi dizaynda bajarilgan va render qilingan skrinshotda tekshirilgan. "Funksiya" ustunida saqlangan mantiq ko‘rsatilgan.

## Xaridor ilovasi (`apps/customer`)

| Ekran | Holat | Nima o‘zgardi | Saqlangan funksiya |
|---|---|---|---|
| Splash | ✅ | Markazdagi brend belgisi va nom. `index.html` ichida, React yuklanguncha ko‘rinadi; sun’iy kechikish yo‘q. Mavzu oldindan qo‘llanadi | — |
| Bosh sahifa | ✅ | Brend header, qidiruv maydoni (katalogni ochib fokuslaydi), sumka grafikali banner, kategoriya plitkalari, "Tanlangan" rail, mahsulot grid'i | `settings.banner_*`, `featured`, kategoriya filtri, "Yana ko‘rish" sahifalash |
| Katalog | ✅ | Sticky panel: sarlavha, qidiruv (tozalash tugmasi bilan), kategoriya chiplari, natija soni va ixcham saralash select'i. 2/auto-fill grid | Qidiruv (350ms debounce), `category`, `sort` (newest/price_asc/price_desc/name), sahifalash |
| Mahsulot kartasi | ✅ | 1:1 rasm, kategoriya, 2 qatorli nom, to‘liq narx, qoldiq, rasm burchagida tez qo‘shish tugmasi (savatdagi sonini ko‘rsatadi) | `setSelected`, `quantity(p, 1)` |
| Mahsulot sahifasi | ✅ | To‘liq kenglikdagi galereya (scroll-snap, nuqta indikatorlari, `contain` — rasm qirqilmaydi), narx, qoldiq badge, tavsif, sticky "Savatga qo‘shish" paneli, ulashish | `quantity()`, `FayzNative.share` / `navigator.share`, deep link |
| Savat | ✅ | Rasmli qatorlar, stepper (1 dona bo‘lganda chiqindi qutisi ikonkasi), qator summasi, jami kartasi, yetkazib berish izohi, sticky "Buyurtma berish" | `cart`, `quantity(±1)`, qoldiq chegarasi |
| Checkout | ✅ | Bottom sheet (planshetda markazda): buyurtma tarkibi, maydon ostidagi xatolar, umumiy xato banneri, summa yozilgan CTA, yuborish spinneri, Escape/fon bosilganda yopiladi | Xuddi shu validatsiya qoidalari, narx/qoldiqni qayta tekshirish, `POST /orders` |
| Buyurtmalar | ✅ | Muvaffaqiyat banneri, karta: raqam, rangli holat badge, mahalliy vaqt, tarkib, jami; skeleton; bo‘sh holat; yangilash ikonkasi | `refreshOrders()`, `Order <token>` |
| Profil | ✅ | Avatar kartasi, "Yetkazib berish ma’lumotlari", 4 ta mavzu tanlagichi (radiogroup), do‘kon aloqasi; texnik sozlamalar faqat debug'da | `fayz_profile`, `fayz_theme`, `settings.contact_phone/delivery_info` |
| Pastki menyu | ✅ | Ikonka + yorliq, aktiv pill, savat badge, safe-area | `go(tab)` |
| Xato / offline | ✅ | Ikonkali holat kartasi, o‘zbekcha xabar, "Qayta urinish", debug'da "Server manzili" | `load()` |

`alert()` chaqiruvlari (3 ta) toast va ilova ichidagi bannerlar bilan almashtirildi. Xabar matnlari saqlangan.

## Administrator paneli (`apps/admin`)

| Ekran | Holat | Nima o‘zgardi | Saqlangan funksiya |
|---|---|---|---|
| Login | ✅ | Brend kartasi, yorliqli maydonlar, spinner, tarmoq xatosi uchun alohida ikonka, debug'da server manzili | `POST /admin/login`, `sessionStorage` |
| Navigatsiya | ✅ | `≥1024px`: ikonkali qotgan sidebar, rol, chiqish. `<1024px`: menyu tugmasi va drawer (fon, Escape, yopish). Hamma 5 bo‘lim mavjud | `changeView`, `logout` |
| Boshqaruv | ✅ | 4 ta KPI karta (yetkazilgan summa va ombordagi donalar — API'dagi real maydonlar), kunlik savdo jadvali ichida bar | `GET /admin/reports/summary` |
| Mahsulotlar | ✅ | Desktop jadval (rasm, nom va kategoriya, narx, qoldiq, holat badge'lari, ikonkali amallar). Mobil kartalar. Bo‘sh holat | `GET /admin/products`, sahifalash |
| Mahsulot formasi | ✅ | Modal (mobil'da bottom sheet), 5 bo‘lim: asosiy, narx/qoldiq, tavsif, rasmlar (preview grid, "Asosiy" belgisi, yuklash plitkasi, 8 ta limit), ko‘rinish (toggle) | `saveProduct`, `uploadImage`, mavjud mahsulotda qoldiq maydoni yopiq |
| Qoldiq | ✅ | Kichik modal: joriy qoldiq, ± farq, sabab | `adjust-stock` |
| O‘chirish | ✅ | `confirm()` o‘rniga `ConfirmDialog` | `DELETE /admin/products/:id`, `/categories/:id` |
| Kategoriyalar | ✅ | Chapda forma (tahrirni bekor qilish tugmasi bilan), o‘ngda ro‘yxat; mobil'da ustma-ust | CRUD, o‘chirish faqat egasi uchun |
| Buyurtmalar | ✅ | Desktop jadval (qator bosiladi), mobil kartalar, holat badge'lari | `GET /admin/orders` |
| Buyurtma tafsilotlari | ✅ | Xaridor, holat o‘tish tugmalari, tarkib, to‘langan/qolgan, to‘lovlar ro‘yxati, to‘lov qaydi formasi | `status()`, `savePayment()`, o‘sha o‘tish xaritasi |
| Sozlamalar | ✅ | "Do‘kon ma’lumotlari" va "Bosh sahifa banneri" guruhlari, bannerning jonli ko‘rinishi, menejer uchun faqat o‘qish rejimi va izoh, administratorlar ro‘yxati (rol badge), admin qo‘shish | `PUT /admin/settings`, `/admin/users` |
| Sozlamalar xatosi | ✅ | Tarmoq xatosida bo‘sh holat kartasi va "Qayta urinish" | `load('settings')` |

## Mavjud emas (yaratilmadi)

- Alohida **Inventory**, **Payments**, **Reports** sahifalari. Funksiyalari mavjud joylarda saqlangan: Mahsulotlar → Qoldiq, Buyurtma → To‘lovlar, Boshqaruv.
- Wishlist, reyting, bildirishnomalar — tizimda yo‘q, qo‘shilmadi.
