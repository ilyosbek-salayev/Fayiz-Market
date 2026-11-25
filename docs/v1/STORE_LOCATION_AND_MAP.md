# Doʻkon lokatsiyasi, GPS va marshrut — Fayz Market V1

## 1. Doʻkon joylashuvi (Admin → Sozlamalar → Doʻkon joylashuvi)

Bu panel avval Integratsiyalar boʻlimida edi. Endi sozlamalarda turadi va maydonlar kengaytirildi:

| Maydon | Saqlanadi | Tekshiruv |
|---|---|---|
| Manzil nomi | `settings.store_place_name` | ≤ 80 belgi |
| Toʻliq manzil | `settings.store_address` | 5–300 belgi |
| Latitude / Longitude | `settings.store_lat/lng` (6 kasr) | −90..90 / −180..180, (0,0) rad etiladi |
| Xaritada tanlash | MapLibre picker (qizil pin), «Hozirgi joylashuvim» | — |

- API: `PUT /admin/store`, faqat Owner. Audit: `store.location`.
- Mijoz tomoni koordinatani `GET /storefront` → `store` orqali oladi. Yangi APK kerak emas.
- Kuryer marshruti va «olib ketish» manzili ham shu nuqtadan foydalanadi.
- Manzil hech qachon taxmin qilib yozilmaydi: kiritilmagan boʻlsa, ilova «Manzil hali kiritilmagan» deb koʻrsatadi.

## 2. Foydalanuvchi joylashuvi

- Faqat foydalanuvchi bosganda bir marta aniqlanadi (`navigator.geolocation.getCurrentPosition`).
  - Android WebView’da ruxsat soʻraladi (`MainActivity.onGeolocationPermissionsShowPrompt`, faqat ilovaning oʻz origin’i uchun).
- Natija faqat telefonda saqlanadi: `fayz_user_location_v1`. Serverga yuborilmaydi. Istisno — foydalanuvchi oʻzi soʻragan marshrut hisobi: bu holda bitta koordinata yuboriladi va u saqlanmaydi.
- Fon kuzatuvi yoʻq. «Joylashuvni unutish» tugmasi qiymatni oʻchiradi.
- Holatlar:

| Holat | Xatti-harakat |
|---|---|
| Ruxsat berildi | Koordinata va aniqlik (±m), doʻkongacha masofa |
| Ruxsat berilmadi | Ilova ishlashda davom etadi. «Sizning joylashuvingiz» oynasi ochiladi: sabab koʻrsatiladi, pinni qoʻlda qoʻyish mumkin |
| GPS yoʻq / vaqt tugadi | Shu oyna, «GPS yoqilganini tekshiring» matni bilan |
| Bosh sahifani koʻrish | Geolokatsiya **majburiy emas** |

## 3. «Doʻkonga yoʻl» xaritasi

Ekran ikki yoʻl bilan ochiladi: headerdagi oʻng tugma yoki banner tugmasi (`ctaTarget: store`). Ekranda:

- Orqaga tugmasi, doʻkon nomi va manzili;
- doʻkon pini (brend belgisi bilan) va foydalanuvchi pini;
- marshrut chizigʻi, masofa va taxminiy vaqt;
- «Yoʻlga chiqish» (Google Maps’da haqiqiy yoʻnalish);
- «Joylashuvimni aniqlash / Qayta aniqlash»;
- «Boshqa xarita ilovasida» (Android’da `geo:` intent — Yandex, 2GIS va hokazo);
- doʻkonga qoʻngʻiroq (telefon kiritilgan boʻlsa);
- loading va error holatlari.

**Orqaga qaytish.** Ekran ochilganda `history.pushState` qilinadi. Natijada quyidagilarning hammasi bir xil ishlaydi:

- Android system Back (`MainActivity.onBackPressed → WebView.goBack`);
- ekrandagi Orqaga tugmasi;
- Escape tugmasi.

Bosh sahifa ostida ochiq qoladi, shuning uchun **scroll holati saqlanadi** (avtomatik test buni ±5 px aniqlikda tekshiradi).

### Xarita texnologiyasi

- MapLibre GL 6 + OpenFreeMap: kalitsiz va bepul. Google Maps browser kaliti kiritilsa, Google xaritasi ishlatiladi.
- Codex tuzatgan Web Worker ulanishi (`?worker&url` + `setWorkerUrl`) **oʻzgartirilmadi**.
  - Yangi marshrut qatlami oddiy GeoJSON `line` qatlami.
  - Doʻkon pini HTML marker.
- Xarita chizilmasa (WebGL yoʻq yoki internet yoʻq), koordinata va havolalar roʻyxati koʻrsatiladi. Soxta xarita chizilmaydi.

### Marshrut

Xarita plitkalari marshrut chiza olmaydi, shuning uchun server orqali haqiqiy routing xizmati ishlatiladi:

| Provayder | Kalit | Narx | Tanlanish tartibi |
|---|---|---|---|
| OpenRouteService (HeiGIT, OSM maʼlumotlari) | `ORS_API_KEY` | Bepul: kuniga 2 000 / daqiqasiga 40 | 1-chi |
| Google Routes | `GOOGLE_ROUTES_KEY` | Bepul limitdan keyin pullik | 2-chi |

**API: `POST /store/route { lat, lng }`.**

- Javob: `route.coordinates` (haqiqiy yoʻl geometriyasi, `[lng,lat]`), `distanceMeters`, `durationSeconds`, `attribution`.
- Doʻkon manzili kiritilmagan → `409 STORE_LOCATION_MISSING`.
- Provayder ulanmagan → `503 ROUTES_NOT_CONFIGURED`.
- Doʻkondan 300 km dan uzoq nuqta → `422`.
- Limitlar:
  - IP boʻyicha soatiga 30 soʻrov;
  - jami kuniga 1 500 soʻrov (ORS bepul kvotasini himoya qiladi).
- Kuryer marshruti (`/courier/deliveries/:id/route`) ham shu modulga oʻtkazildi. Avval faqat Google ishlatilardi, endi ORS ham.

**Routing ulanmagan boʻlsa:**

- chiziq **chizilmaydi**, faqat ikki pin koʻrsatiladi;
- matn: «Yoʻl chizigʻi uchun marshrut xizmati hali ulanmagan. Toʻgʻri chiziq boʻyicha: ~X km»;
- «Yoʻlga chiqish» Google Maps yoki qurilmadagi navigatsiya ilovasida haqiqiy yoʻlni ochadi. Ilova qulamaydi.

**Foydalanish shartlari:**

- ORS atributsiyasi («© openrouteservice.org by HeiGIT · © OpenStreetMap») marshrut ostida koʻrsatiladi;
- OpenFreeMap/OSM atributsiyasi xaritada turadi;
- kvota cheklovi serverda.

**Ulash:** Admin → Integratsiyalar → «Marshrut (OpenRouteService)» → API kaliti → Saqlash → «Ulanishni tekshirish». Bu tugma Toshkent ichida haqiqiy marshrut soʻraydi.

## 4. Sinov dalillari

- **API.** `scripts/v1/storefront-verify.mjs` — routing boʻlimi:
  - 503 (soxta chiziq yoʻq);
  - 409 (manzil yoʻq);
  - kalit paneldan kiritilgach marshrut paydo boʻladi;
  - koordinatalar `[lng,lat]` tartibida;
  - 422 (juda uzoq nuqta);
  - kalit oʻchirilgach xizmat darhol toʻxtaydi.
- **UI.** `scripts/ui-qa/v1-storefront-ui.mjs`:
  - xarita chiziladi;
  - marshrut 6,4 km / 16 daqiqa (mock);
  - atributsiya;
  - Back → bosh sahifa, scroll saqlanadi;
  - ruxsat rad etilganda pinni qoʻlda qoʻyish;
  - routing yoʻq holatdagi matn;
  - banner → xarita.
- **Skrinshotlar:** `customer-store-map-route.png`, `customer-store-map-no-location.png`, `customer-store-map-no-routing.png`, `customer-location-denied.png`.
- **Android emulyator:** natijalar `TEST_RESULTS.md` da. Haqiqiy telefon: **NOT TESTED**.
