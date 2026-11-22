# Xarita va yetkazish manzili

## Mijoz checkout

1. «Xaritadan manzil tanlash» → `LocationSheet`.
2. «Joylashuvimni aniqlash» — WebView geolokatsiyasi; Android `ACCESS_FINE/COARSE_LOCATION` ruxsati faqat shu tugma bosilganda va faqat ilovaning o‘z origin’i uchun so‘raladi.
3. Google Maps kaliti bo‘lsa: xarita markazidagi pin, xaritani surib aniqlash, reverse geocoding (manzil matni). Kalit bo‘lmasa — **aniq yozilgan muqobil**: GPS koordinata, aniqlik (±m), «Google Maps’da ochish» havolasi. Soxta xarita chizilmaydi.
4. Ruxsat rad etilsa: xabar va matnli manzil bilan davom etish (manzil maydoni avvalgidek majburiy).
5. Buyurtmaga `location {lat,lng,accuracy}` va `deliveryDetails` (podyezd, qavat, mo‘ljal) saqlanadi — sinovda D1 da tasdiqlandi.

Uzluksiz kuzatuv yo‘q — mijozdan faqat bir martalik joylashuv.

## Admin

Buyurtma modali: xarita (yoki koordinata), tafsilotlar, «Google Maps’da ochish», kuryer tanlash/tayinlash/qayta tayinlash (versiya bilan), kuryerning oxirgi joylashuvi va yoshi, hodisalar tarixi.

## Kuryer

- Olib ketishgacha: do‘konga navigatsiya (do‘kon nuqtasi Integratsiyalar → «Do‘kon joylashuvi»).
- Keyin: mijozga navigatsiya — Google Maps URL (`/maps/dir/?api=1…`, kalitsiz, bepul).
- «Masofa va vaqt»: faqat Google Routes API dan (`GOOGLE_ROUTES_KEY`); kalit yo‘q bo‘lsa 503 va aniq xabar. **Masofa/ETA o‘ylab topilmaydi.** Limit: kuryerga 20 so‘rov/soat.

## Google sozlamalari va xarajat

- Browser kaliti (Maps JavaScript + Geocoding): HTTP referrer cheklovi `https://fayz-market-api.ilyosbeksalayev240.workers.dev/*`. Desktop ilova `file://` dan ochiladi — Electron Google Maps so‘rovlariga shu referrerni qo‘yadi.
- Routes kaliti faqat serverda (secret).
- Google Cloud billing hisobi talab qiladi — **faollashtirish sizning tasdig‘ingizsiz qilinmadi.** Taxmin (tasdiqlanmagan, Google narxlari o‘zgaradi): kuniga 50 buyurtma × (1 xarita yuklanishi checkoutda + ~3 kuzatuv/admin ko‘rish) ≈ oyiga 6 000 xarita yuklanishi va ~1 500 geocoding — odatda Google’ning oylik bepul chegarasi ichida; Routes faqat tugma bosilganda.
- Tavsiya: Google Cloud’da kunlik kvota cheklovi qo‘yish.
