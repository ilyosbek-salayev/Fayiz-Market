# Kuryer ish jarayoni

Kuryer **admin APK’ning o‘zida** ishlaydi. Super admin Sozlamalar → Xodimlar’da «Kuryer» rolini ism va +998 telefon bilan yaratadi. Kuryer kirgach faqat «Kuryer paneli» ochiladi.

## Bosqichlar

| Kuryer amali | Talab qilingan holat | Natija | Mijozga |
|---|---|---|---|
| Qabul qilish | assigned | accepted | «Kuryer buyurtmangizni qabul qildi» |
| Qabul qila olmayman (sabab majburiy) | assigned | declined → adminga xabar | — |
| Do‘kondan oldim | accepted | picked_up; order confirmed→preparing→shipped | «Buyurtmangiz kuryerda» |
| Yo‘lga chiqdim | picked_up | on_the_way | «Buyurtmangiz yo‘lda» |
| Manzilga yetib keldim | on_the_way | arrived | «Kuryer yetib keldi» |
| Mijozga topshirdim | arrived | handed_over → admin xabari | «Qabul qilganingizni tasdiqlang» |

- Har amal `version` bilan: eskirgan so‘rov **409 STALE**; o‘tkazib yuborilgan/takroriy qadam **409**.
- Admin olib ketishgacha qayta tayinlay oladi (eski kuryerga xabar), keyin — yo‘q. Admin olib ketishgacha bekor qilsa, kuryerga xabar boradi.
- Admin kuryer bor buyurtmani qo‘lda «yo‘lga chiqarildi/yetkazildi» qila olmaydi.
- `handed_over` dan keyin: mijoz tasdiqlaydi → `delivered`; yoki «Olmadim» → `disputed` → admin tekshirib, yozma sabab bilan hal qiladi (audit).

## Joylashuv ulashish

- Faqat `accepted…arrived` holatida, kuryer ilovasi ochiq bo‘lganda (WebView geolokatsiya + Android ruxsati). Ekran yoniq qoladi; «Joylashuv ulashilmoqda» indikatori va oxirgi yuborish vaqti ko‘rinadi.
- Har ≥15 s yoki ≥30 m; server limiti 30/daqiqa; GPS yo‘qolsa ogohlantirish.
- Yetkazish tugasa yoki bekor bo‘lsa — server qabul qilmaydi va nuqta o‘chiriladi.
- **Cheklov:** ilova fonga o‘tganda/yopilganda ulashish davom etmaydi (foreground service qo‘shilmadi). Mijoz eskirgan nuqtani «Oxirgi ma’lum joy» deb ko‘radi.

## Kuryer ko‘ra olmaydi

Moliya/hisobotlar, mahsulotlar, barcha buyurtmalar, xodimlar, integratsiyalar, sharhlar — 9 ta endpoint 403 bilan tekshirildi; boshqa kuryer yetkazishi 404.
