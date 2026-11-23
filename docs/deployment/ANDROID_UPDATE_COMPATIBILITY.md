# Android: o‘rnatilgan ilovalar ustidan yangilash

## Tekshirilgan identifikatorlar

| | Xaridor v1.0.0 (o‘rnatilgan) | Xaridor v1.0.1 (yangi) | Admin v1.0.0 (o‘rnatilgan) | Admin v1.0.1 (yangi) |
|---|---|---|---|---|
| Paket (applicationId) | `uz.fayzmarket.customer` | `uz.fayzmarket.customer` | `uz.fayzmarket.admin` | `uz.fayzmarket.admin` |
| versionCode / versionName | 1 / 1.0.0 | **2 / 1.0.1** | 1 / 1.0.0 | **2 / 1.0.1** |
| Imzo sertifikati | CN=Android Debug | CN=Android Debug | CN=Android Debug | CN=Android Debug |
| Sertifikat SHA-256 | `93f0f845…f89851` | `93f0f845…f89851` | `93f0f845…f89851` | `93f0f845…f89851` |
| Imzo sxemalari | v1 + v2 | v1 + v2 | v1 + v2 | v1 + v2 |
| Standart API | `http://192.168.1.106:8787` | `https://fayz-market-api.ilyosbeksalayev240.workers.dev` | xuddi shunday | xuddi shunday |

To‘liq sertifikat SHA-256: `93f0f84579729ab0348d6910253a85281326811b66c7ad98f788e0a5c2f89851`.

Imzolovchi kalit: `~/.android/debug.keystore`, alias `androiddebugkey`, amal qilish muddati 2056-yilgacha. `keytool` ko‘rsatgan SHA-256 APK sertifikati bilan aynan bir xil. Ma’lumotlar `aapt2 dump badging`, `apksigner verify --print-certs` va `keytool -list -v` bilan olingan.

**Xulosa:**
- Paket nomi bir xil, sertifikat bir xil, versionCode kattaroq. Shuning uchun Android v1.0.1 ni mavjud ilova ustidan, uni o‘chirmasdan va ma’lumotlarini tozalamasdan o‘rnatadi (`adb install -r`).
- Ogohlantirish: telefondagi ilovalar aynan shu Mac'da build qilingan `dist/apk` fayllaridan o‘rnatilgan deb hisoblandi. Telefondagi sertifikat qurilmaning o‘zida tekshirilmagan, chunki `adb devices` bo‘sh edi.
- Agar telefondagi ilova boshqa kalit bilan imzolangan bo‘lsa, `adb install -r` `INSTALL_FAILED_UPDATE_INCOMPATIBLE` xatosini beradi. Bu holatda **ilovani o‘chirmang**, avval menga xabar bering.

**Kalitni saqlang.** `~/.android/debug.keystore` yo‘qolsa, keyingi APK'larni mavjud ilovalar ustidan o‘rnatib bo‘lmaydi. Bu faylning nusxasini xavfsiz joyda saqlash tavsiya qilinadi. Uni Git'ga qo‘shmang.

## Ikki xil yangilanish

### Backend yangilanishi (APK kerak emas)

Cloudflare'dagi Worker yoki D1 o‘zgarishlari darhol ishga tushadi. Ilova `https://fayz-market-api…workers.dev` manziliga ulangan bo‘lsa, ularni qayta o‘rnatish shart emas, agar API kontrakti mos qolsa.

### Ilova yangilanishi (yangi APK)

UI bundle APK ichida joylashgan. Shuning uchun UI, Java yoki standart manzil o‘zgarsa, yangi APK kerak bo‘ladi. Avtomatik OTA yangilanish yo‘q va qo‘shilmadi: Expo Updates ham, Play Services ham ishlatilmaydi.

## Telefonni Cloudflare'ga ulashning ikki yo‘li

### A yo‘l — qayta o‘rnatmasdan, hozirgi v1.0.0 ilovalarda

O‘rnatilgan ikkala APK ham debug build. Ularda server manzilini ilova ichidan almashtirish mumkin. Dialog `https://` manzilni qabul qiladi, interceptor esa istalgan host uchun ishlaydi.

- **Xaridor:** Profil → Texnik sozlamalar → Server (API) manzili → `https://fayz-market-api.ilyosbeksalayev240.workers.dev` → Saqlash.
- **Admin:** login ekranidagi yoki xato bannerdagi "Server manzili" tugmasi → o‘sha manzil → Saqlash. Keyin production owner login'i bilan kiring.

### B yo‘l — v1.0.1 ni ustidan o‘rnatish (tavsiya)

Bu yo‘lda standart manzil allaqachon production bo‘ladi. Telefonni USB orqali ulang va "USB debugging"ni yoqing:

```sh
adb install -r dist/apk/v1.0.1/fayz-market-customer-debug.apk
adb install -r dist/apk/v1.0.1/fayz-market-admin-debug.apk
adb shell dumpsys package uz.fayzmarket.customer | grep versionName   # 1.0.1 bo‘lishi kerak
```

`adb uninstall` va `pm clear` buyruqlarini **ishlatmang**.

Agar ilovada avval "Server manzili" dialogi orqali boshqa manzil saqlangan bo‘lsa, o‘sha manzil standart qiymatdan ustun turadi. Bunday holatda yuqoridagi A yo‘l bilan production manzilini bir marta kiriting.

## Manzil almashganda ilova ichidagi ma’lumot

Ilova UI'ni API manzilining origin'ida ochadi. Brauzer xotirasi (`localStorage`) esa origin bo‘yicha alohida saqlanadi. Shuning uchun `http://192.168.1.106:8787` dan `https://…workers.dev` ga o‘tganda:

| Ma’lumot | Nima bo‘ladi |
|---|---|
| Xaridorning savati, profili, mavzusi va "Buyurtmalarim" ro‘yxati | Yangi manzil ostida bo‘sh boshlanadi. Eski ma’lumot **o‘chirilmaydi**, u eski origin ostida qoladi. Eski ro‘yxatdagi buyurtmalar faqat Mac'dagi lokal bazada bor edi, productionda ular yo‘q. Mavzu sariqqa qaytadi, profilni bir marta qayta kiritish kerak |
| Admin sessiyasi | `sessionStorage`da edi, production owner login'i bilan qayta kiriladi |
| Ilovaning Android ma’lumotlari (SharedPreferences) | saqlanadi |

## Yangi APK'lar

| Fayl | Rol | Hajm | SHA-256 |
|---|---|---|---|
| `dist/apk/v1.0.1/fayz-market-customer-debug.apk` | Xaridor | 263 267 bayt | `6d9c72a28e051e48e9147db5114f91c4cb21cf6dfe1422196b0676c95c984ff0` |
| `dist/apk/v1.0.1/fayz-market-admin-debug.apk` | Admin | 263 669 bayt | `2d7cf87762c8d4906363a75153296a872298b56510d1306aec63ef166f8f5e1b` |

- O‘sha fayllar `dist/apk/fayz-market-*-debug.apk` nomi ostida ham bor.
- Avvalgi v1.0.0 APK'lari `dist/apk/v1.0.0/`da saqlangan.
- Bundle tarkibi v1.0.0 bilan bir xil: JS, CSS, 4 ta Onest woff2 va `index.html`. Hajm farqi faqat zip siqilishidan kelib chiqqan.

Bular hali ham **debug** build: `debuggable=true`, Texnik sozlamalar ko‘rinadi. Play Store uchun alohida release kalit, release build va `targetSdk` yangilanishi kerak. Bu vazifa doirasida ular o‘zgartirilmadi.
