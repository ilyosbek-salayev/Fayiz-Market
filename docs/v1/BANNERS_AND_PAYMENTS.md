# Bannerlar va toʻlov tizimi — Fayz Market V1

## 1. Bannerlar

### Maʼlumot modeli

- Jadval: `banners` (D1). Rasmlar R2’da, `POST /admin/images` orqali yuklanadi (JPEG/PNG/WebP, magic-bytes tekshiruvi, 5 MB gacha).
- Maydonlar:
  - `title` (2–80 belgi), `subtitle` (≤ 160);
  - `cta_label` (≤ 24), `cta_target`;
  - `image_url` — faqat oʻz R2 manzilimiz qabul qilinadi;
  - `tone` (sariq / qora / oq);
  - `active`;
  - `position` (kichigi oldinda).
- `cta_target` faqat ilova ichidagi manzillar boʻlishi mumkin: `none`, `catalog`, `store`, `category:<slug>`, `product:<slug>`. `javascript:` yoki tashqi URL rad etiladi.
- Cheklovlar:
  - jami 20 ta banner;
  - mijozga eng koʻpi 8 ta faol banner koʻrsatiladi.

### Admin → Bannerlar (Owner va Admin; kuryer va anonim foydalanuvchiga yopiq)

- Roʻyxat: har bir banner haqiqiy koʻrinishi bilan, «Faol/Yashirin» va tartib bilan.
- Qoʻshish va tahrirlash oynasi:
  - sarlavha, tavsif;
  - tugma havolasi (katalog / kategoriya / mahsulot / doʻkon xaritasi / havolasiz) va tugma matni;
  - rang, tartib raqami, faollik;
  - rasm (galereya yoki kamera; rasmni olib tashlash);
  - jonli preview: 360 px telefon kengligida, yorugʻ va qorongʻi fonda.
- Yashirish / faollashtirish; oʻchirish (tasdiqlash oynasi bilan).
- «Standart banner»: faol banner yoʻq paytda koʻrinadigan banner matni.
- Har bir amal audit jurnaliga yoziladi: `banner.create/update/delete/default`.

### Customer UI

- Bitta banner — oddiy karta. Bir nechta — gorizontal swipe karusel, keyingisi chetdan biroz koʻrinib turadi. Pastda nuqtalar (24 px teginish maydoni).
- **Avtomatik aylantirish yoʻq.** Banner soni kam boʻlganda ortiqcha animatsiya kerak emas.
- Matn va rasm alohida ustunda turadi. Shu sababli matn rasm ustiga tushmaydi va kontrast doim yetarli.
- Ranglar brend palitrasidan, har qanday mavzuda bir xil.
- Rasmsiz banner va standart hero’da yangi brend belgisi chiqadi. Eski sumka belgisi olib tashlandi.
- Admin oʻzgartirgan banner keyingi ochilishda yoki ilovaga qaytganda koʻrinadi (`GET /storefront`, `visibilitychange`). Yangi APK kerak emas.

## 2. Toʻlov

### Usullar

| Usul | Checkoutda | Qanday tasdiqlanadi |
|---|---|---|
| Naqd pul | Owner yoqsa (standart: yoqilgan) | Xodim pulni olgach «Toʻlovni qayd etish» |
| Karta — terminal orqali | Owner yoqsa | Xodim chek/RRN raqami bilan qayd etadi; bir raqam ikki marta qayd etilmaydi |
| Bank oʻtkazmasi | Owner yoqsa (rekvizitlar majburiy) | Mijoz rekvizitlarni koʻradi → «Pulni oʻtkazdim» (holat: *tekshirilmoqda*) → xodim hujjat raqami bilan qayd etadi |
| Payme | Merchant ID, kalit kiritilgan **va** «Faol» yoqilgan boʻlsa | Payme serveri `/payments/payme` ga JSON-RPC soʻrovi yuboradi; Basic auth merchant kaliti bilan tekshiriladi |
| Click | Service/Merchant ID, secret **va** «Faol» yoqilgan boʻlsa | Click serveri `/payments/click/prepare` va `/complete` ga soʻrov yuboradi; MD5 imzo tekshiriladi |
| Doʻkondan olib ketish | Owner yoqsa va doʻkon manzili kiritilgan boʻlsa | Qabul qilish usuli; toʻlov usullaridan istalgani bilan |

- Production’da Payme va Click **sozlanmagan**: kalit va shartnoma yoʻq. Shuning uchun checkoutda koʻrinmaydi va «faol» deb koʻrsatilmaydi.
- Kamida bitta toʻlov usuli doim yoqilgan qoladi: server boshqacha saqlashga ruxsat bermaydi.

### Holatlar

| Holat | Kim yoki nima oʻrnatadi |
|---|---|
| `pending` — Toʻlov kutilmoqda | Buyurtma yaratilganda (yaratilish **toʻlov emas**) |
| `verifying` — Tekshirilmoqda | Mijoz «Pulni oʻtkazdim» deydi / provayder tranzaksiya ochadi / xodim belgilaydi |
| `paid` — Toʻlandi | Faqat jurnaldagi pul jami summani qoplaganda yoki provayder *perform* qilganda |
| `failed` — Muvaffaqiyatsiz | Xodim sabab bilan belgilaydi / provayder bekor qiladi |
| `cancelled` — Bekor qilingan | Toʻlanmagan buyurtma bekor qilinganda |
| `refunded` — Qaytarilgan | Owner sabab bilan belgilaydi (qoʻlda) / Payme toʻlangan tranzaksiyani bekor qiladi |

Ruxsat etilgan oʻtishlar D1 trigger’i bilan himoyalangan (`order_payment_transition`):

- `pending/failed → verifying/paid/failed/cancelled/pending`;
- `verifying → pending/paid/failed/cancelled`;
- `paid → refunded`.

Qolgan barcha oʻtishlar `409` qaytaradi.

### Moliyaviy xavfsizlik

- **Summa.** Server joriy narxlardan hisoblaydi. Mijoz yuborgan `total/amount/paymentStatus` eʼtiborsiz qoldiriladi; test buni tasdiqlaydi.
- **«Toʻlandi» uchun haqiqiy pul kerak.** `order_paid_requires_money` trigger’i quyidagini talab qiladi: jurnaldagi summa + provayder bajargan tranzaksiyalar ≥ jami summa.
- **Takroriy toʻlov yoʻq:**
  - toʻlangan buyurtmaga yangi toʻlov yozilmaydi (`ALREADY_PAID`);
  - bank va terminal hujjat raqami takrorlanmaydi (`DUPLICATE_PAYMENT`);
  - jami summadan oshirib boʻlmaydi (`OVERPAYMENT`);
  - provayder tranzaksiyasi `UNIQUE(provider, provider_txn_id)`;
  - har bir buyurtmada bitta jonli tranzaksiya.
- **Ikki marta oʻzgartirish yoʻq.** Admin holatni `from → to` shaklida oʻzgartiradi. Boshqa xodim allaqachon oʻzgartirgan boʻlsa — `409`.
- **Callback imzosi:**
  - Payme: `Authorization: Basic base64("Paycom:<kalit>")`, timing-safe taqqoslash. Notoʻgʻri kalit → `-32504`;
  - Click: `sign_string = md5(click_trans_id + service_id + SECRET + merchant_trans_id + [merchant_prepare_id] + amount + action + sign_time)`. Notoʻgʻri imzo → `-1`.
- **Karta raqami va CVV serverga kelmaydi.** Onlayn toʻlov provayderning oʻz sahifasida boʻladi (`GET /orders/:id/payment/link`). Bu havola summani serverdagi buyurtmadan oladi.
- **Bekor qilish cheklovi.** Toʻlangan buyurtmani (qoʻlda yoki onlayn) bekor qilib boʻlmaydi.
- **Audit.** Har bir toʻlov hodisasi `order_events` (buyurtma tarixi) va `audit_log` ga yoziladi: qayd etish, holat, qaytarish, provayder.

### Payme Merchant API — amalga oshirilgan metodlar

`CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction`, `CancelTransaction`, `CheckTransaction`, `GetStatement`:

- summa tiyinda;
- 12 soatlik timeout (sabab 4);
- idempotent;
- `-31001/-31003/-31007/-31008/-31050/-31051/-32504/-32601` xato kodlari.

Toʻlangandan keyin `CancelTransaction` kelsa → holat `refunded`. Buyurtma allaqachon yetkazilgan boʻlsa → `-31007`.

### Click SHOP API

- `prepare` (`action=0`) va `complete` (`action=1`).
- Xato kodlari: `-1` imzo, `-2` summa, `-4` allaqachon toʻlangan, `-5` buyurtma yoʻq, `-6` tranzaksiya yoʻq, `-9` bekor qilingan.
- Click xatosi (`error<0`) kelsa → holat `failed` va sabab yoziladi.

### Admin

- **Buyurtmalar roʻyxati:**
  - toʻlov holati va usuli ustuni;
  - filtrlar: Hammasi / Kutilmoqda / Tekshirilmoqda / Toʻlangan / Muvaffaqiyatsiz.
- **Buyurtma oynasi → Toʻlov:**
  - usul, holat, toʻlangan va qolgan summa, toʻlov sanasi, xato sababi;
  - provayder tranzaksiyalari jadvali: provayder, tranzaksiya ID, summa, holat, vaqt;
  - qoʻlda toʻlovlar jurnali: kim qayd etgani bilan;
  - «Toʻlovni qayd etish»;
  - «Tekshirilmoqda», «Kutilmoqda», «Muvaffaqiyatsiz (sabab)» tugmalari;
  - Owner uchun «Pul qaytarildi».
- **Boshqaruv paneli:** «Qabul qilingan toʻlov» = qoʻlda qayd etilgan + onlayn tasdiqlangan − qaytarilganlar. Tekshirilayotganlar soni ham koʻrsatiladi.
- **Sozlamalar → Toʻlov va qabul qilish:** usullarni yoqish/oʻchirish, bank rekvizitlari, olib ketish, Payme/Click holati.

## 3. Production credentials kiritish yoʻriqnomasi

1. **Payme**
   - Payme Business’da shartnoma tuzing va kassa yarating.
   - Endpoint: `https://fayz-market-api.ilyosbeksalayev240.workers.dev/payments/payme`. Hisob maydoni: `order_id`.
   - Admin → Integratsiyalar → Payme ga kiriting: Merchant ID, Test kaliti, Production kaliti. Rejim: **Test**.
   - Payme sandbox (test.paycom.uz) testlarini oʻtkazing.
   - Soʻng rejimni **Production** qiling va «Faollashtirish»ni bosing.
2. **Click**
   - Kabinetda Prepare URL `…/payments/click/prepare` va Complete URL `…/payments/click/complete` ni kiriting.
   - Panelga kiriting: Service ID, Merchant ID, Secret key.
   - «Ulanishni tekshirish» (ichki), soʻng Click kabinetida test toʻlovi.
   - Hammasi oʻtgach «Faollashtirish».
3. **Bir martalik shart.** Kalitlarni panelda saqlash uchun Cloudflare’da `INTEGRATIONS_MASTER_KEY` boʻlishi kerak (qarang: `ADMIN_INTEGRATIONS.md`).

### Shartnoma uchun doʻkon egasidan talab qilinadigan hujjatlar

Aniq roʻyxatni provayder tasdiqlaydi. Odatda quyidagilar soʻraladi:

| Hujjat yoki maʼlumot | Payme | Click |
|---|---|---|
| Yuridik shaxs yoki YaTT guvohnomasi, INN (STIR) | ✓ | ✓ |
| Bank hisob raqami (h/r), bank nomi, MFO | ✓ | ✓ |
| Rahbar pasporti nusxasi, ustav (MChJ uchun) | ✓ | ✓ |
| Faoliyat turi (OKED) va sotiladigan mahsulotlar tavsifi | ✓ | ✓ |
| Ilova/sayt havolasi, ommaviy oferta, qaytarish siyosati | ✓ | ✓ |
| Aloqa: telefon, email, masʼul shaxs | ✓ | ✓ |
| Texnik maʼlumot: endpoint URL (yuqorida) | ✓ | ✓ |

## 4. Sinov holati

| Sinov | Natija |
|---|---|
| Naqd, terminal, olib ketish, bank oʻtkazmasi (API va UI) | PASS (lokal Worker) |
| Holat oʻtishlari, takroriy toʻlov, ortiqcha toʻlov, ruxsatlar | PASS |
| Payme: barcha metodlar, imzolangan mock soʻrovlar | PASS — **mock**, Payme sandbox emas |
| Click: prepare/complete, imzo, xato | PASS — **mock** |
| Payme/Click sandbox | **BLOCKED** — merchant hisobi va test kalitlari yoʻq |
| Production merchant toʻlovi | **NOT TESTED** — shartnoma va ruxsat yoʻq |
