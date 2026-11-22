import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { Category, Product } from '@fayz/shared';
import { cartTotal, money } from '@fayz/shared';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8787';
type Tab = 'home' | 'catalog' | 'cart' | 'orders' | 'profile';
type Theme = 'yellow' | 'green' | 'blue' | 'black';
type StoredOrder = { id: number; orderNumber: string; accessToken: string };
const palettes = { yellow: ['#F7C948', '#FFFDF4', '#211D13'], green: ['#5CA972', '#F7FFF9', '#173C24'], blue: ['#5D9CEB', '#F7FAFF', '#153151'], black: ['#262626', '#FAFAFA', '#1C1C1C'] } as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || 'Ulanishda xatolik');
  return body as T;
}
function AppContent() {
  const [tab, setTab] = useState<Tab>('home');
  const [theme, setTheme] = useState<Theme>('yellow');
  const [products, setProducts] = useState<Product[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [cartProducts, setCartProducts] = useState<Record<number, Product>>({});
  const [savedOrders, setSavedOrders] = useState<StoredOrder[]>([]);
  const [orders, setOrders] = useState<Record<number, any>>({});
  const [selected, setSelected] = useState<Product | null>(null);
  const [q, setQ] = useState(''); const [category, setCategory] = useState(''); const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const [name, setName] = useState(''); const [phone, setPhone] = useState('+998'); const [address, setAddress] = useState(''); const [note, setNote] = useState('');
  const [settings, setSettings] = useState<Record<string, string>>({}); const [submitting, setSubmitting] = useState(false);
  const [checkout, setCheckout] = useState(false); const [confirmation, setConfirmation] = useState<StoredOrder | null>(null);
  const [total, setTotal] = useState(0); const [page, setPage] = useState(1);
  const [initial, setInitial] = useState(true);
  const colors = palettes[theme];
  const styles = useMemo(() => makeStyles(colors), [theme]);

  useEffect(() => { (async () => {
    try {
      const [storedCart, storedOrders, profile, savedTheme, storedProducts] = await Promise.all(['cart', 'orders', 'profile', 'theme', 'cartProducts'].map(key => AsyncStorage.getItem(key)));
      if (storedCart) setCart(JSON.parse(storedCart)); if (storedOrders) setSavedOrders(JSON.parse(storedOrders));
      if (storedProducts) setCartProducts(JSON.parse(storedProducts));
      if (profile) { const p = JSON.parse(profile); setName(p.name || ''); setPhone(p.phone || '+998'); setAddress(p.address || ''); }
      if (savedTheme && savedTheme in palettes) setTheme(savedTheme as Theme);
    } finally { setInitial(false); }
  })(); }, []);
  useEffect(() => { if (!initial) AsyncStorage.setItem('cart', JSON.stringify(cart)); }, [cart, initial]);
  useEffect(() => { if (!initial) AsyncStorage.setItem('cartProducts', JSON.stringify(cartProducts)); }, [cartProducts, initial]);
  useEffect(() => { if (!initial) AsyncStorage.setItem('orders', JSON.stringify(savedOrders)); }, [savedOrders, initial]);
  useEffect(() => { if (!initial) AsyncStorage.setItem('profile', JSON.stringify({ name, phone, address })); }, [name, phone, address, initial]);
  useEffect(() => { if (!initial) AsyncStorage.setItem('theme', theme); }, [theme, initial]);

  const load = useCallback(async (nextPage = 1, append = false) => {
    setError(''); if (!append) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: '20', sort });
      if (q.trim()) params.set('q', q.trim()); if (category) params.set('category', category);
      const [catalog, cats, config, featured] = await Promise.all([
        api<{ products: Product[]; total: number }>('/products?' + params.toString()),
        api<{ categories: Category[] }>('/categories'), api<{ settings: Record<string, string> }>('/settings'),
        api<{ products: Product[] }>('/products?featured=1&limit=8')
      ]);
      setProducts(previous => append ? [...previous, ...catalog.products] : catalog.products);
      setTotal(catalog.total); setCategories(cats.categories); setSettings(config.settings); setFeaturedProducts(featured.products); setPage(nextPage);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); setRefreshing(false); }
  }, [q, category, sort]);
  useEffect(() => { const timeout = setTimeout(() => load(), 300); return () => clearTimeout(timeout); }, [load]);
  useEffect(() => { const handle = (url: string) => { const slug = url.match(/\/(?:p|products)\/([a-z0-9-]+)/)?.[1]; if (slug) api<{ product: Product }>('/products/' + slug).then(r => { setSelected(r.product); setTab('catalog'); }).catch(() => Alert.alert('Xatolik', 'Mahsulot topilmadi')); }; Linking.getInitialURL().then(url => { if (url) handle(url); }); const sub = Linking.addEventListener('url', event => handle(event.url)); return () => sub.remove(); }, []);
  const cartItems = Object.entries(cart).map(([id, quantity]) => ({ product: cartProducts[Number(id)] || products.find(p => p.id === Number(id)), quantity })).filter((v): v is { product: Product; quantity: number } => !!v.product);
  const updateQuantity = (id: number, delta: number, selectedProduct?: Product) => { if (selectedProduct) setCartProducts(previous => ({ ...previous, [id]: selectedProduct })); setCart(previous => { const next = { ...previous }; const product = selectedProduct || products.find(p => p.id === id) || cartProducts[id]; const value = Math.min(product?.stock || 0, Math.max(0, (next[id] || 0) + delta)); if (value) next[id] = value; else delete next[id]; return next; }); };
  const refreshOrders = async () => { setLoading(true); setError(''); try { const result = await Promise.all(savedOrders.map(async order => { const data = await api<{ order: any }>(`/orders/${order.id}`, { headers: { Authorization: `Order ${order.accessToken}` } }); return [order.id, data.order] as const; })); setOrders(Object.fromEntries(result)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } };
  useEffect(() => { if (tab === 'orders' && savedOrders.length) refreshOrders(); }, [tab, savedOrders.length]);
  const submit = async () => {
    if (submitting) return;
    if (name.trim().length < 2 || !/^\+998\d{9}$/.test(phone) || address.trim().length < 5) { Alert.alert('Maʼlumot yetarli emas', 'Ism, +998 formatidagi telefon va manzilni kiriting.'); return; }
    if (!cartItems.length) return;
    setSubmitting(true);
    try {
      const latest = await Promise.all(cartItems.map(async x => (await api<{ product: Product }>('/products/' + x.product.slug)).product));
      setCartProducts(Object.fromEntries(latest.map(p => [p.id, p])));
      if (latest.some((p, i) => p.price !== cartItems[i].product.price || p.stock < cartItems[i].quantity)) {
        Alert.alert('Savatni qayta tekshiring', 'Mahsulot narxi yoki qoldigʻi oʻzgargan. Savatdagi maʼlumot yangilandi.');
        setCheckout(false);
        return;
      }
      const result = await api<{ order: StoredOrder }>('/orders', { method: 'POST', body: JSON.stringify({ customerName: name.trim(), phone, address: address.trim(), note, items: cartItems.map(x => ({ productId: x.product.id, quantity: x.quantity })) }) });
      setSavedOrders(previous => [result.order, ...previous]); setCart({}); setCartProducts({}); setCheckout(false); setConfirmation(result.order); setTab('orders');
    } catch (e) { Alert.alert('Buyurtma yuborilmadi', (e as Error).message); await load(); } finally { setSubmitting(false); }
  };
  const button = (label: string, action: () => void, secondary = false, disabled = false) => <Pressable disabled={disabled} onPress={action} style={[styles.button, secondary && styles.secondary, disabled && { opacity: .5 }]}><Text style={[styles.buttonText, secondary && { color: colors[2] }]}>{label}</Text></Pressable>;
  const productCard = ({ item }: { item: Product }) => <Pressable style={styles.productCard} onPress={() => setSelected(item)}><View style={styles.imageBox}>{item.images[0] ? <Image source={{ uri: item.images[0] }} style={styles.productImage} /> : <Text style={styles.imagePlaceholder}>Fayz Market</Text>}</View><Text numberOfLines={2} style={styles.cardTitle}>{item.name}</Text><Text style={styles.muted}>{item.categoryName}</Text><Text style={styles.price}>{money(item.price)}</Text><Text style={styles.muted}>{item.stock > 0 ? `Qoldiq: ${item.stock}` : 'Sotuvda yoʻq'}</Text></Pressable>;
  const input = (placeholder: string, value: string, change: (v: string) => void, keyboardType?: 'phone-pad', multiline = false) => <TextInput style={[styles.input, multiline && { minHeight: 88, textAlignVertical: 'top' }]} placeholder={placeholder} placeholderTextColor="#888" value={value} onChangeText={change} keyboardType={keyboardType} multiline={multiline} />;

  if (initial) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors[0]} size="large" /><Text style={styles.brand}>Fayz Market</Text></SafeAreaView>;
  return <SafeAreaView style={styles.root} edges={['top', 'bottom']}><StatusBar style={theme === 'black' ? 'light' : 'dark'} />
    <View style={styles.header}><Text style={styles.brand}>Fayz Market</Text><Text style={styles.headerMeta}>{tab === 'home' ? 'Aksessuarlar doʻkoni' : ({ catalog: 'Katalog', cart: 'Savat', orders: 'Buyurtmalar', profile: 'Profil' } as any)[tab]}</Text></View>
    {selected ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {button('← Orqaga', () => setSelected(null), true)}
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>{selected.images.length ? selected.images.map((uri, i) => <Image key={i} source={{ uri }} style={styles.detailImage} />) : <View style={[styles.detailImage, styles.center]}><Text>Rasm mavjud emas</Text></View>}</ScrollView>
      <Text style={styles.title}>{selected.name}</Text><Text style={styles.price}>{money(selected.price)}</Text><Text style={styles.muted}>{selected.stock > 0 ? `${selected.stock} dona mavjud` : 'Hozir sotuvda yoʻq'}</Text>
      <Text style={styles.body}>{selected.description}</Text>
      {button('Savatga qoʻshish', () => { updateQuantity(selected.id, 1, selected); Alert.alert('Savatga qoʻshildi', selected.name); }, false, selected.stock < 1)}
      {button('Ulashish', () => Share.share({ message: `Fayz Market: ${selected.name} — ${API}/p/${selected.slug}` }), true)}
    </ScrollView> : tab === 'home' || tab === 'catalog' ? <View style={{ flex: 1 }}>
      <FlatList data={products} keyExtractor={p => String(p.id)} numColumns={2} columnWrapperStyle={styles.columns} renderItem={productCard} contentContainerStyle={styles.content}
        ListHeaderComponent={<View>{tab === 'home' && <><View style={styles.hero}><Text style={styles.heroTitle}>{settings.banner_title || 'Fayz Market'}</Text><Text style={styles.body}>{settings.banner_subtitle}</Text></View>{featuredProducts.length > 0 && <><Text style={styles.sectionTitle}>Tanlangan mahsulotlar</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>{featuredProducts.map(item => <Pressable key={item.id} onPress={() => setSelected(item)} style={[styles.productCard, { width: 156, maxWidth: 156, marginRight: 10 }]}><View style={styles.imageBox}>{item.images[0] ? <Image source={{ uri: item.images[0] }} style={styles.productImage} /> : <Text style={styles.imagePlaceholder}>Fayz Market</Text>}</View><Text numberOfLines={2} style={styles.cardTitle}>{item.name}</Text><Text style={styles.price}>{money(item.price)}</Text></Pressable>)}</ScrollView></>}</>}
          {input('Mahsulot qidirish', q, setQ)}<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}><Pressable onPress={() => setCategory('')} style={[styles.chip, !category && styles.chipActive]}><Text>Barchasi</Text></Pressable>{categories.map(cat => <Pressable key={cat.id} onPress={() => setCategory(cat.slug)} style={[styles.chip, category === cat.slug && styles.chipActive]}><Text>{cat.name}</Text></Pressable>)}</ScrollView>
          <View style={styles.sortRow}>{[['newest', 'Yangi'], ['price_asc', 'Arzon'], ['price_desc', 'Qimmat'], ['name', 'Nom']].map(([value, label]) => <Pressable key={value} onPress={() => setSort(value)} style={[styles.sortChip, sort === value && styles.chipActive]}><Text style={styles.small}>{label}</Text></Pressable>)}</View>
          <Text style={styles.sectionTitle}>{tab === 'home' ? 'Mahsulotlar' : `Katalog (${total})`}</Text>{error ? <View style={styles.error}><Text>{error}</Text>{button('Qayta urinish', () => load())}</View> : null}{loading && <ActivityIndicator color={colors[0]} />}</View>}
        ListEmptyComponent={!loading && !error ? <Text style={styles.empty}>Mahsulot topilmadi</Text> : null}
        ListFooterComponent={products.length < total ? button('Yana koʻrish', () => load(page + 1, true)) : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} />
    </View> : tab === 'cart' ? <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Savat</Text>{cartItems.length ? cartItems.map(({ product, quantity }) => <View key={product.id} style={styles.cartRow}>{product.images[0] ? <Image source={{ uri: product.images[0] }} style={styles.thumb} /> : <View style={styles.thumb} />}<View style={{ flex: 1 }}><Text style={styles.cardTitle}>{product.name}</Text><Text style={styles.price}>{money(product.price * quantity)}</Text><View style={styles.quantity}>{button('−', () => updateQuantity(product.id, -1), true)}<Text style={styles.quantityText}>{quantity}</Text>{button('+', () => updateQuantity(product.id, 1), true)}</View></View></View>) : <Text style={styles.empty}>Savat boʻsh</Text>}
      {cartItems.length > 0 && <><Text style={styles.title}>Jami: {money(cartTotal(cartItems))}</Text>{button('Buyurtma berish', () => setCheckout(true))}</>}
    </ScrollView> : tab === 'orders' ? <ScrollView contentContainerStyle={styles.content}><Text style={styles.title}>Buyurtmalarim</Text>{confirmation && <View style={styles.success}><Text>Buyurtma qabul qilindi: {confirmation.orderNumber}</Text></View>}{loading && <ActivityIndicator />}{error && <View style={styles.error}><Text>{error}</Text>{button('Qayta urinish', refreshOrders)}</View>}{!savedOrders.length && <Text style={styles.empty}>Hali buyurtma yoʻq</Text>}{savedOrders.map(saved => { const order = orders[saved.id]; return <View key={saved.id} style={styles.orderCard}><Text style={styles.cardTitle}>{saved.orderNumber}</Text><Text style={styles.muted}>{order?.createdAt || 'Yuklanmoqda...'}</Text><Text>Holat: {({ new: 'Yangi', confirmed: 'Tasdiqlangan', preparing: 'Tayyorlanmoqda', shipped: 'Yoʻlda', delivered: 'Yetkazildi', cancelled: 'Bekor qilingan' } as any)[order?.status] || 'Yuklanmoqda'}</Text><Text style={styles.price}>{order ? money(order.total) : ''}</Text>{order?.items?.map((item: any, i: number) => <Text key={i} style={styles.muted}>{item.name} × {item.quantity}</Text>)}</View>; })}</ScrollView> : <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Text style={styles.title}>Profil</Text><Text style={styles.muted}>Maʼlumotlar faqat shu telefonda saqlanadi.</Text>{input('Ism', name, setName)}{input('Telefon: +998901234567', phone, setPhone, 'phone-pad')}{input('Yetkazib berish manzili', address, setAddress, undefined, true)}<Text style={styles.sectionTitle}>Koʻrinish</Text><View style={styles.sortRow}>{(['yellow', 'green', 'blue', 'black'] as Theme[]).map(value => <Pressable key={value} onPress={() => setTheme(value)} style={[styles.themeChip, { backgroundColor: palettes[value][0] }, theme === value && { borderWidth: 2, borderColor: colors[2] }]}><Text>{({ yellow: 'Sariq', green: 'Yashil', blue: 'Koʻk', black: 'Qora' } as any)[value]}</Text></Pressable>)}</View><Text style={styles.sectionTitle}>Aloqa</Text><Text style={styles.body}>{settings.contact_phone || 'Telefon raqami tez orada qoʻshiladi'}</Text><Text style={styles.muted}>{settings.delivery_info}</Text></ScrollView>}
    <View style={styles.nav}>{([['home', 'Bosh sahifa'], ['catalog', 'Katalog'], ['cart', `Savat (${Object.values(cart).reduce((a,b)=>a+b,0)})`], ['orders', 'Buyurtmalar'], ['profile', 'Profil']] as [Tab, string][]).map(([value, label]) => <Pressable key={value} onPress={() => { setSelected(null); setTab(value); }} style={[styles.navItem, tab === value && styles.navActive]}><Text style={styles.navText}>{label}</Text></Pressable>)}</View>
    {checkout && <View style={styles.overlay}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}><ScrollView keyboardShouldPersistTaps="handled"><Text style={styles.title}>Buyurtmani rasmiylashtirish</Text><Text style={styles.price}>Jami: {money(cartTotal(cartItems))}</Text>{input('Ism', name, setName)}{input('Telefon: +998901234567', phone, setPhone, 'phone-pad')}{input('Yetkazib berish manzili', address, setAddress, undefined, true)}{input('Izoh (ixtiyoriy)', note, setNote, undefined, true)}{button(submitting ? 'Yuborilmoqda...' : 'Buyurtmani yuborish', submit, false, submitting)}{button('Bekor qilish', () => setCheckout(false), true)}</ScrollView></KeyboardAvoidingView></View>}
  </SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><AppContent /></SafeAreaProvider>; }

function makeStyles(colors: readonly [string, string, string]) { return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors[1] }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, header: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#e6e6e6' }, brand: { fontSize: 24, fontWeight: '800', color: colors[2] }, headerMeta: { color: '#676767', fontSize: 12 }, content: { padding: 16, paddingBottom: 30 }, title: { fontSize: 23, fontWeight: '800', color: colors[2], marginVertical: 14 }, sectionTitle: { fontSize: 19, fontWeight: '700', color: colors[2], marginVertical: 14 }, body: { fontSize: 15, color: colors[2], lineHeight: 23, marginVertical: 8 }, muted: { color: '#666', fontSize: 13, marginTop: 4 }, price: { color: colors[2], fontSize: 17, fontWeight: '800', marginTop: 8 }, small: { fontSize: 12, color: colors[2] },
  hero: { backgroundColor: colors[0], borderRadius: 20, padding: 24, marginBottom: 18 }, heroTitle: { fontSize: 24, fontWeight: '800', color: colors[2] }, input: { borderWidth: 1, borderColor: '#d7d7d7', borderRadius: 12, padding: 14, fontSize: 16, color: colors[2], backgroundColor: '#fff', marginBottom: 12 }, categoryRow: { marginVertical: 6 }, chip: { backgroundColor: '#eee', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8, minHeight: 44 }, chipActive: { backgroundColor: colors[0] }, sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }, sortChip: { backgroundColor: '#eee', padding: 10, borderRadius: 12, minHeight: 40 }, columns: { gap: 12 }, productCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 10, marginBottom: 12, maxWidth: '49%', borderWidth: 1, borderColor: '#eee' }, imageBox: { backgroundColor: '#f3f3f3', borderRadius: 12, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, productImage: { width: '100%', height: '100%' }, imagePlaceholder: { fontWeight: '700', color: '#999' }, cardTitle: { fontSize: 15, fontWeight: '700', color: colors[2], marginTop: 8 }, detailImage: { width: 310, height: 310, marginRight: 8, borderRadius: 16, backgroundColor: '#f2f2f2' }, button: { backgroundColor: colors[0], minHeight: 48, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginVertical: 5 }, secondary: { backgroundColor: '#eee' }, buttonText: { fontSize: 15, fontWeight: '700', color: colors[2] }, empty: { textAlign: 'center', padding: 28, color: '#777' }, error: { padding: 18, backgroundColor: '#ffeded', borderRadius: 12, marginVertical: 8 }, success: { padding: 16, backgroundColor: '#e6f6e9', borderRadius: 12 }, cartRow: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: '#fff', borderRadius: 14, marginBottom: 10 }, thumb: { width: 84, height: 84, borderRadius: 10, backgroundColor: '#eee' }, quantity: { flexDirection: 'row', alignItems: 'center', gap: 12 }, quantityText: { fontSize: 18, fontWeight: '700' }, orderCard: { padding: 16, backgroundColor: '#fff', borderRadius: 14, marginBottom: 10 }, nav: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' }, navItem: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' }, navActive: { borderTopWidth: 3, borderColor: colors[0] }, navText: { fontSize: 10, color: '#333', textAlign: 'center' }, themeChip: { padding: 12, borderRadius: 10 }, overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#0009', justifyContent: 'flex-end' }, sheet: { maxHeight: '90%', backgroundColor: colors[1], borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18 }
}); }
