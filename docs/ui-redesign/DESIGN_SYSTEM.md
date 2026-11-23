# Fayz Market dizayn tizimi

Manba: `packages/ui/src/tokens.css`, `packages/ui/src/Icon.tsx`, `packages/ui/src/format.ts`. Xaridor ilovasi va admin panel bir xil tokenlardan foydalanadi. Yangi npm paket o‘rnatilmagan.

## G‘oya

Brend belgisi — ichida "F" harfi bo‘lgan xarid sumkasi (launcher ikonkasi). Bu belgi butun interfeysda takrorlanmaydi: u faqat **bitta ifodali joyda**, ya’ni bosh sahifa bannerida katta va kesilgan grafik sifatida ishlatiladi. Qolgan hamma joy sokin: oq yuzalar, ingichka chiziqlar, aniq tipografik ierarxiya. Narx va asosiy harakat (sariq tugma) har ekranda birinchi ko‘zga tashlanadi.

## Ranglar

`<html data-theme="…">` atributi orqali tanlanadi. Mavzu kaliti va localStorage kaliti (`fayz_theme`) o‘zgarmagan.

| Token | Sariq (asosiy) | Yashil | Ko‘k | Qora |
|---|---|---|---|---|
| `--accent` | `#FFCC29` | `#2DBE7E` | `#2F6FEB` | `#FFCC29` |
| `--on-accent` | `#1E1E1E` | `#0A2A1B` | `#FFFFFF` | `#1E1E1E` |
| `--bg` | `#FAFAF7` | `#F7FAF8` | `#F7F9FC` | `#151513` |
| `--surface` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#1E1E1B` |
| `--text` | `#1E1E1E` | `#1E1E1E` | `#1E1E1E` | `#F3F3EE` |
| `--muted` | `#6B6B6B` | `#6B6B6B` | `#6B6B6B` | `#ABABA2` |
| `--line` | `#E8E8E4` | `#E2EAE5` | `#E2E7F0` | `#2F2F2B` |

- Aksent ustidagi matn kontrasti har mavzuda tekshirildi: sariq va yashil fonda qora matn, ko‘k fonda oq matn ishlatiladi. Oldingi ko‘k `#75a7f6` qora matn bilan past kontrastli edi, shuning uchun to‘qroq `#2F6FEB` tanlandi.
- Qora mavzuda brend sarig‘i aksent bo‘lib qoladi. Holat ranglari (`--success`, `--danger`, `--warning`, `--info`) va ularning `-soft` fonlari har mavzuda alohida berilgan.
- Admin panelida mavzu tanlash funksiyasi yo‘q edi va qo‘shilmadi. Admin har doim sariq mavzuda.

## Tipografiya

Shrift: **Onest** (variable, 400–800). U `packages/ui/src/fonts/` papkasiga woff2 ko‘rinishida lokal joylandi (latin, latin-ext, cyrillic, cyrillic-ext; SIL OFL). Shuning uchun APK internetsiz ham to‘g‘ri shriftni ko‘rsatadi. O‘zbekcha `ʻ` (U+02BB) latin subset'ida bor.

| Rol | Klass | O‘lcham / qalinlik |
|---|---|---|
| Display (banner) | `.t-display` | clamp(24–34px) / 800, −0.025em |
| Ekran sarlavhasi | `.t-h1` | 22px / 750 |
| Bo‘lim sarlavhasi | `.t-h2` | 17px / 700 |
| Karta sarlavhasi | `.t-title` | 14px / 600 |
| Asosiy matn | `.t-body` | 15px / 1.5 |
| Yorliq | `.t-label` | 13px / 600 |
| Izoh | `.t-caption` | 12px, `--muted` |

Narx va sonlarda `font-variant-numeric: tabular-nums` (`.num`) ishlatiladi. CAPS yorliqlar ishlatilmaydi.

## O‘lchamlar

- Spacing: `4 / 8 / 12 / 16 / 20 / 24 / 32` (`--s1`…`--s8`).
- Radius ierarxiyasi: sheet/hero `24`, karta `16`, input va tugma `12`, mayda element `8`, chip va badge `pill`.
- Bosish maydoni kamida `44px` (`--tap`). Asosiy CTA `52px`.
- Soyalar 3 darajali (`--shadow-1/2/3`). Kartalarda faqat eng yengil soya ishlatiladi.

## Komponentlar

| Topshiriqdagi nomi | Amalga oshirilgan joyi |
|---|---|
| AppHeader | customer `.app-header` (BrandMark + nom), admin `.topbar` |
| ScreenContainer | `.screen` / `.view` |
| SearchField | `.search-field`, bosh sahifada `.search-trigger` |
| CategoryChip | `.chip`, bosh sahifada `.cat-tile` |
| ProductCard | `ProductCard` (customer/components.tsx) |
| PriceLabel | `.price.num`, `.detail-price` |
| StockBadge | `StockLabel`, `.badge-ok/.badge-danger`, `.pcard-flag` |
| PrimaryButton / SecondaryButton | `.btn-primary`, `.btn-secondary`, `.btn-quiet`, `.btn-danger` |
| FormField | `Field` (ikkala app), `.input` |
| SectionHeader | `SectionHeader`, admin `Panel` sarlavhasi |
| EmptyState / ErrorState / LoadingState | `EmptyState`, `.state-card`, `.skeleton`, `ProductSkeleton`, `.spinner`, admin `.progress` |
| BottomNavigation | `.tabbar` (ikonka + yorliq + savat badge) |
| AdminSidebar | `.sidebar` (desktop'da qotib turadi, `<1024px`da drawer) |
| AdminMetricCard | `MetricCard` |
| AdminDataTable | `.table` + `.table-wrap` (`≥760px`) |
| AdminMobileCard | `.m-card` (`<760px`) |
| ConfirmationDialog | `ConfirmDialog` (native `confirm()` o‘rniga) |
| — | `Sheet` (checkout), `Modal`, `Toast`, `Toggle`, `Thumb`, `IconAction` |

Ikonkalar: `Icon` komponenti, 24px grid, 1.8 stroke. 37 ta ikonka qo‘lda chizilgan, tashqi kutubxona yo‘q.

## Harakat (motion)

- Ekran almashganda 0.28s yengil kirish animatsiyasi.
- Sheet va modal pastdan yoki markazdan ochiladi.
- Tugma bosilganda `scale(.97)` effekti.
- Skeleton shimmer, toast.
- `prefers-reduced-motion: reduce` holatida barcha animatsiyalar o‘chadi.
- Og‘ir effektlar yo‘q. `backdrop-filter` faqat sticky header va nav'da ishlatiladi.

## Android integratsiyasi

- `paintSystemBars()` mavzu fonini `FayzNative.setSystemBars(color, light)` orqali status bar va (API 26+) navigatsiya bariga uzatadi.
- Texnik boshqaruvlar `FayzNative.isDebug()` true bo‘lganda chiqadi, ya’ni faqat debug APK'da.
