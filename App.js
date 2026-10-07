import 'react-native-url-polyfill/auto'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import Svg, { Circle, Path } from 'react-native-svg'
import * as WebBrowser from 'expo-web-browser'
import * as ExpoLinking from 'expo-linking'

WebBrowser.maybeCompleteAuthSession()

// Same Supabase project (database + auth + API) as the website.
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web' },
})
// Alert.alert does nothing in the browser preview, so fall back to window.alert there.
const notify = (title, msg) => (Platform.OS === 'web' ? window.alert(title + '\n' + msg) : Alert.alert(title, msg))
const money = (c) => 'KES ' + (c / 100).toLocaleString()

// Same palette as the website: navy + coral, light by default, dark on request.
const LIGHT = { ink: '#16213a', brand: '#1f3a5f', accent: '#ff6b4a', bg: '#f6f7fb', card: '#ffffff', line: '#e1e5ee', muted: '#5b6578' }
const DARK = { ink: '#eef1f7', brand: '#3b5f94', accent: '#ff6b4a', bg: '#0f1523', card: '#18202f', line: '#2a3447', muted: '#9aa7bd' }
let s = makeStyles(LIGHT) // re-assigned by <App> whenever the theme changes

function Icon({ name, size = 20, color = '#000' }) {
  const p = { stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'cart' && <><Circle cx="9" cy="20" r="1.5" {...p} /><Circle cx="18" cy="20" r="1.5" {...p} /><Path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21.5 8H6" {...p} /></>}
      {name === 'search' && <><Circle cx="11" cy="11" r="7" {...p} /><Path d="M21 21l-4.3-4.3" {...p} /></>}
      {name === 'sun' && <><Circle cx="12" cy="12" r="4" {...p} /><Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" {...p} /></>}
      {name === 'moon' && <Path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" {...p} />}
    </Svg>
  )
}

function ProductCard({ p, qty, onQty }) {
  return (
    <View style={s.pcard}>
      <View style={s.pimg}>
        {p.image_url ? <Image source={{ uri: p.image_url }} style={s.pimgPic} resizeMode="cover" /> : <Text style={s.pEmoji}>{p.emoji || '🛒'}</Text>}
        <View style={s.ptag}><Text style={s.ptagText}>{p.category}</Text></View>
      </View>
      <View style={s.pbody}>
        <Text style={s.pname} numberOfLines={1}>{p.name}</Text>
        <Text style={s.pdesc} numberOfLines={2}>{p.description}</Text>
        <Text style={s.pprice}>{money(p.price_cents)}</Text>
        {qty ? <Stepper qty={qty} onChange={onQty} />
          : <Pressable style={s.pAdd} onPress={() => onQty(1)}><Icon name="cart" size={16} color="#fff" /><Text style={s.btnText}>Add</Text></Pressable>}
      </View>
    </View>
  )
}

function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  )
}

// Google sign-in goes through Supabase, so it is the same account as on the website.
async function googleSignIn() {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } } })
    if (error) notify('Google sign-in failed', error.message)
    return
  }
  const redirectTo = ExpoLinking.createURL('auth')
  console.log('Supabase Redirect URL needed:', redirectTo)
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } })
  if (error || !data?.url) return notify('Google sign-in failed', error?.message || 'No sign-in address was returned.')
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (res.type !== 'success') return
  const q = new URLSearchParams([res.url.split('#')[1], (res.url.split('?')[1] || '').split('#')[0]].filter(Boolean).join('&'))
  if (q.get('error_description')) return notify('Google sign-in failed', q.get('error_description').replace(/\+/g, ' '))
  const result = q.get('access_token') && q.get('refresh_token')
    ? await supabase.auth.setSession({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token') })
    : q.get('code') ? await supabase.auth.exchangeCodeForSession(q.get('code')) : { error: { message: 'No sign-in details came back. Check the Supabase Redirect URLs.' } }
  if (result.error) notify('Google sign-in failed', result.error.message)
}

function Stepper({ qty, onChange }) {
  return (
    <View style={s.stepper}>
      <Pressable style={s.circle} onPress={() => onChange(qty - 1)}><Text style={s.circleText}>−</Text></Pressable>
      <Text style={s.qty}>{qty}</Text>
      <Pressable style={s.circle} onPress={() => onChange(qty + 1)}><Text style={s.circleText}>+</Text></Pressable>
    </View>
  )
}

function Auth() {
  const [mode, setMode] = useState('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    const creds = { email: email.trim(), password }
    const { data, error } = mode === 'in' ? await supabase.auth.signInWithPassword(creds) : await supabase.auth.signUp(creds)
    setBusy(false)
    if (error) notify('Could not continue', mode === 'in' && /invalid login/i.test(error.message) ? "Wrong email or password. If you signed up with Google on the website, open the website's Account page and set a password first." : error.message)
    else if (mode === 'up' && !data.session) notify('Check your email', 'Confirm your account, then sign in.')
  }
  return (
    <View style={s.authBox}>
      <Text style={s.brand}>Corner Shop</Text>
      <Text style={s.muted}>Sign in with the same account you use on the website.</Text>
      <TextInput style={s.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <Pressable style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
        <Text style={s.btnText}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</Text>
      </Pressable>
      <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')}>
        <Text style={s.link}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</Text>
      </Pressable>
      <View style={s.orRow}><View style={s.line} /><Text style={s.muted}>or</Text><View style={s.line} /></View>
      <Pressable style={s.gbtn} onPress={googleSignIn}><GoogleLogo /><Text style={s.gtext}>Continue with Google</Text></Pressable>
    </View>
  )
}

const STATUSES = [['placed', 'New'], ['preparing', 'Preparing'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']]
const statusLabel = (k) => (STATUSES.find(([x]) => x === k) || [0, k])[1]
const payLabel = (o) => (o.payment_status === 'paid' ? 'Paid' : o.payment_method === 'mpesa' ? 'M-Pesa ' + o.payment_status : 'Pay on delivery')

function OrderCard({ o, admin, onStatus }) {
  return (
    <View style={s.orderCard}>
      <View style={s.totalRow}><Text style={s.name}>#{o.id.slice(0, 8)}</Text><Text style={s.name}>{money(o.total_cents)}</Text></View>
      <Text style={s.muted}>{new Date(o.created_at).toLocaleString()} · {payLabel(o)}</Text>
      {admin && <Text style={s.muted}>{o.email} · {o.phone}{'\n'}{o.address}{o.note ? '\nNote: ' + o.note : ''}</Text>}
      {o.order_items.map((i) => <Text key={i.id} style={s.item}>{i.qty} × {i.name}</Text>)}
      {admin ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
          {STATUSES.map(([k, l]) => (
            <Pressable key={k} style={[s.chip, o.status === k && s.chipOn]} onPress={() => onStatus(o.id, k)}>
              <Text style={[s.chipText, o.status === k && { color: '#fff' }]}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : <Text style={s.badge}>Status: {statusLabel(o.status)}</Text>}
    </View>
  )
}

function OrdersScreen({ uid, admin }) {
  const [orders, setOrders] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const load = useCallback(async () => {
    let q = supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false })
    if (!admin) q = q.eq('user_id', uid)
    const { data, error } = await q
    if (error) notify('Could not load orders', error.message); else setOrders(data)
  }, [uid, admin])
  useEffect(() => { load() }, [load])
  const setStatus = async (id, status) => {
    const { error } = await supabase.rpc('set_order_status', { p_id: id, p_status: status })
    if (error) notify('Could not update', error.message); else load()
  }
  return (
    <FlatList data={orders || []} keyExtractor={(o) => o.id} contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }}
      ListEmptyComponent={<Text style={s.muted}>{orders ? 'No orders yet.' : 'Loading…'}</Text>}
      renderItem={({ item }) => <OrderCard o={item} admin={admin} onStatus={setStatus} />} />
  )
}

function AccountScreen({ email }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (pw.length < 6) return notify('Password too short', 'Use at least 6 characters.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) notify('Could not save', error.message); else { setPw(''); notify('Password saved', 'You can now sign in with your email and this password.') }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Account</Text>
      <Text style={s.muted}>Signed in as {email}</Text>
      <Text style={s.label}>Set or change your password</Text>
      <TextInput style={s.input} secureTextEntry placeholder="New password" value={pw} onChangeText={setPw} />
      <Pressable style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}><Text style={s.btnText}>{busy ? 'Saving…' : 'Save password'}</Text></Pressable>
      <Pressable style={[s.btn, s.btnOutline]} onPress={() => supabase.auth.signOut()}><Text style={[s.btnText, s.outlineText]}>Sign out</Text></Pressable>
    </ScrollView>
  )
}

const blankProduct = { name: '', category: '', price: '', emoji: '', in_stock: true }

function ProductEditor({ p, onSaved }) {
  const [d, setD] = useState(p ? { name: p.name, category: p.category, price: String(p.price_cents / 100), emoji: p.emoji || '', in_stock: p.in_stock } : blankProduct)
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setD({ ...d, [k]: v })
  const save = async () => {
    const price = Number(d.price)
    if (!d.name.trim() || !d.category.trim() || d.price === '' || !(price >= 0)) return notify('Missing details', 'Name, category and a valid price are required.')
    setBusy(true)
    const row = { name: d.name.trim(), category: d.category.trim(), price_cents: Math.round(price * 100), emoji: d.emoji, in_stock: d.in_stock }
    const { error } = p ? await supabase.from('products').update(row).eq('id', p.id) : await supabase.from('products').insert(row)
    setBusy(false)
    if (error) return notify('Could not save', error.message)
    if (!p) setD(blankProduct)
    onSaved()
  }
  return (
    <View style={s.orderCard}>
      <TextInput style={s.input} placeholder="Name" value={d.name} onChangeText={set('name')} />
      <TextInput style={s.input} placeholder="Category" value={d.category} onChangeText={set('category')} />
      <TextInput style={s.input} placeholder="Price (KES)" keyboardType="decimal-pad" value={d.price} onChangeText={set('price')} />
      <TextInput style={s.input} placeholder="Emoji" value={d.emoji} onChangeText={set('emoji')} />
      <View style={s.totalRow}><Text style={s.name}>In stock</Text><Switch value={d.in_stock} onValueChange={set('in_stock')} /></View>
      <Pressable style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}><Text style={s.btnText}>{busy ? 'Saving…' : p ? 'Save' : 'Add product'}</Text></Pressable>
    </View>
  )
}

function AdminScreen() {
  const [sub, setSub] = useState('orders')
  const [list, setList] = useState(null)
  const load = useCallback(() => supabase.from('products').select('*').order('category').order('name').then(({ data }) => setList(data || [])), [])
  useEffect(() => { load() }, [load])
  return (
    <View style={{ flex: 1 }}>
      <View style={s.tabs}>
        {[['orders', 'All orders'], ['products', 'Products']].map(([k, l]) => (
          <Pressable key={k} style={[s.tab, sub === k && s.tabOn]} onPress={() => setSub(k)}><Text style={[s.tabText, sub === k && { color: '#fff' }]}>{l}</Text></Pressable>
        ))}
      </View>
      {sub === 'orders' ? <OrdersScreen admin /> : (
        <FlatList data={list || []} keyExtractor={(p) => p.id} contentContainerStyle={{ padding: 16, gap: 12 }}
          ListHeaderComponent={<View style={{ gap: 12 }}><Text style={s.h1}>Add a product</Text><ProductEditor onSaved={load} /><Text style={s.h1}>All products</Text></View>}
          renderItem={({ item }) => <ProductEditor p={item} onSaved={load} />} />
      )}
    </View>
  )
}

function Checkout({ uid, items, total, onDone, onBack }) {
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!phone.trim() || !address.trim()) return notify('Missing details', 'Please enter your phone number and delivery address.')
    setBusy(true)
    const { data: id, error } = await supabase.rpc('place_order', {
      p_items: items.map((i) => ({ id: i.p.id, qty: i.qty })), p_phone: phone.trim(), p_address: address.trim(), p_note: note.trim(),
    })
    if (error) { setBusy(false); return notify('Could not place order', error.message) }
    await supabase.functions.invoke('send-order-email', { body: { order_id: id } }).catch(() => {}) // email is a bonus
    await supabase.from('cart_items').delete().eq('user_id', uid)
    setBusy(false)
    onDone(id)
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack}><Text style={s.link}>← Back to cart</Text></Pressable>
      <Text style={[s.h1, { marginTop: 12 }]}>Delivery details</Text>
      <Text style={s.label}>Phone number</Text>
      <TextInput style={s.input} keyboardType="phone-pad" placeholder="0712 345 678" value={phone} onChangeText={setPhone} />
      <Text style={s.label}>Delivery address</Text>
      <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]} multiline placeholder="Building, street, landmark" value={address} onChangeText={setAddress} />
      <Text style={s.label}>Note for the shop (optional)</Text>
      <TextInput style={s.input} value={note} onChangeText={setNote} />
      <Text style={[s.muted, { marginTop: 12 }]}>Payment: cash or M-Pesa to the rider on delivery.</Text>
      <Pressable style={[s.btn, { marginTop: 16 }, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
        <Text style={s.btnText}>{busy ? 'Placing order…' : `Place order · ${money(total)}`}</Text>
      </Pressable>
    </ScrollView>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState('shop')
  const [orderId, setOrderId] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [dark, setDark] = useState(false)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const c = dark ? DARK : LIGHT
  s = useMemo(() => makeStyles(c), [dark])
  useEffect(() => { AsyncStorage.getItem('theme').then((v) => setDark(v === 'dark')) }, [])
  const flip = () => { AsyncStorage.setItem('theme', dark ? 'light' : 'dark'); setDark(!dark) }
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState({}) // productId -> { p, qty }
  const uid = session?.user?.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess))
    return () => subscription.unsubscribe()
  }, [])
  useEffect(() => {
    supabase.from('products').select('*').eq('in_stock', true).order('name').then(({ data }) => setProducts(data || []))
  }, [tab])
  useEffect(() => {
    if (!uid) { setIsAdmin(false); return }
    supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle().then(({ data }) => setIsAdmin(!!data))
  }, [uid])
  const loadCart = useCallback(async () => {
    const { data } = await supabase.from('cart_items').select('qty, product:products(*)')
    if (data) setCart(Object.fromEntries(data.filter((r) => r.product?.in_stock).map((r) => [r.product.id, { p: r.product, qty: r.qty }])))
  }, [])
  useEffect(() => { // load the cart, then update live whenever the website (or another device) changes it
    if (!uid) { setCart({}); return }
    loadCart()
    const ch = supabase.channel('cart-' + uid).on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items' }, loadCart).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [uid, loadCart])

  const setQty = async (p, q) => {
    setCart((c) => { const n = { ...c }; if (q <= 0) delete n[p.id]; else n[p.id] = { p, qty: q }; return n })
    const { error } = q <= 0
      ? await supabase.from('cart_items').delete().eq('product_id', p.id)
      : await supabase.from('cart_items').upsert({ user_id: uid, product_id: p.id, qty: q }, { onConflict: 'user_id,product_id' })
    if (error) { notify('Could not update cart', error.message); loadCart() }
  }

  if (session === undefined) return <View style={[s.screen, s.center]}><ActivityIndicator size="large" color={c.brand} /></View>
  const items = Object.values(cart)
  const total = items.reduce((sum, i) => sum + i.p.price_cents * i.qty, 0)
  const count = items.reduce((sum, i) => sum + i.qty, 0)
  const cats = ['All', ...new Set(products.map((p) => p.category))]
  const shown = products.filter((p) => (cat === 'All' || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase()))
  const grid = shown.length % 2 ? [...shown, { id: '_pad', pad: true }] : shown

  return (
    <View style={s.screen}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <View style={s.strip}><Text style={s.stripText}>Fresh groceries · Pay on delivery</Text></View>
      {!session ? <Auth /> : (
        <>
          <View style={s.header}>
            <View style={s.logoRow}><View style={s.mark}><Icon name="cart" size={18} color="#fff" /></View><Text style={s.brand}>Corner Shop</Text></View>
            <View style={s.hActs}>
              <Pressable style={s.iconBtn} onPress={flip} accessibilityLabel="Switch theme"><Icon name={dark ? 'sun' : 'moon'} color={c.ink} /></Pressable>
              <Pressable style={s.cartBtn} onPress={() => setTab('cart')}>
                <Icon name="cart" size={18} color="#fff" /><View style={s.cnt}><Text style={s.cntText}>{count}</Text></View><Text style={s.amt}>{money(total)}</Text>
              </Pressable>
            </View>
          </View>
          <View style={s.navbar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[['shop', 'Shop'], ['cart', `Cart (${count})`], ['orders', 'Orders'], ['account', 'Account'], ...(isAdmin ? [['admin', 'Admin']] : [])].map(([k, l]) => (
                <Pressable key={k} style={[s.navItem, tab === k && s.navOn]} onPress={() => setTab(k)}>
                  <Text style={[s.navText, tab === k && { color: '#fff' }]}>{l}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {tab === 'shop' ? (
            <FlatList data={grid} keyExtractor={(p) => p.id} numColumns={2} columnWrapperStyle={s.gridRow} keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 16, gap: 12 }}
              ListHeaderComponent={(
                <View>
                  <View style={s.banner}>
                    <Text style={s.eyebrow}>LOCAL · FRESH · FAST</Text>
                    <Text style={s.bannerTitle}>Fresh groceries, delivered from the shop down the road.</Text>
                    <Text style={s.bannerSub}>Order online and pay when it arrives.</Text>
                    <View style={s.bannerEmoji}>{['🍅', '🥛', '🍞', '🍌', '🥬'].map((e) => <View key={e} style={s.bannerChip}><Text style={{ fontSize: 22 }}>{e}</Text></View>)}</View>
                  </View>
                  <View style={s.searchBox}>
                    <Icon name="search" size={18} color={c.muted} />
                    <TextInput style={s.searchInput} placeholder="Search products…" placeholderTextColor={c.muted} value={q} onChangeText={setQ} />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
                    {cats.map((k) => (
                      <Pressable key={k} style={[s.chip, cat === k && s.chipOn]} onPress={() => setCat(k)}>
                        <Text style={[s.chipText, cat === k && { color: '#fff' }]}>{k}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
              ListEmptyComponent={<Text style={s.muted}>No products match your search.</Text>}
              renderItem={({ item: p }) => p.pad ? <View style={{ flex: 1 }} /> : <ProductCard p={p} qty={cart[p.id]?.qty || 0} onQty={(n) => setQty(p, n)} />} />
          ) : tab === 'checkout' ? (
            <Checkout uid={uid} items={items} total={total} onBack={() => setTab('cart')} onDone={(id) => { setCart({}); setOrderId(id); setTab('done') }} />
          ) : tab === 'done' ? (
            <View style={{ padding: 24, gap: 12 }}>
              <Text style={s.h1}>Order placed. Thank you!</Text>
              <Text style={s.muted}>Order #{orderId.slice(0, 8)}. You'll pay on delivery.</Text>
              <Pressable style={s.btn} onPress={() => setTab('shop')}><Text style={s.btnText}>Keep shopping</Text></Pressable>
            </View>
          ) : tab === 'orders' ? (
            <OrdersScreen uid={uid} />
          ) : tab === 'account' ? (
            <AccountScreen email={session.user.email} />
          ) : tab === 'admin' && isAdmin ? (
            <AdminScreen />
          ) : (
            <FlatList data={items} keyExtractor={(i) => i.p.id} contentContainerStyle={{ padding: 16, gap: 12 }}
              ListEmptyComponent={<Text style={s.muted}>Your cart is empty. Add something from the shop.</Text>}
              renderItem={({ item: i }) => (
                <View style={s.card}>
                  {i.p.image_url ? <Image source={{ uri: i.p.image_url }} style={s.thumb} /> : <Text style={s.emoji}>{i.p.emoji || '🛒'}</Text>}
                  <View style={{ flex: 1 }}><Text style={s.name}>{i.p.name}</Text><Text style={s.price}>{money(i.p.price_cents * i.qty)}</Text></View>
                  <Stepper qty={i.qty} onChange={(q) => setQty(i.p, q)} />
                </View>
              )}
              ListFooterComponent={items.length ? (
                <View style={{ marginTop: 8 }}>
                  <View style={s.totalRow}><Text style={s.name}>Total</Text><Text style={s.name}>{money(total)}</Text></View>
                  <Pressable style={s.btn} onPress={() => setTab('checkout')}>
                    <Text style={s.btnText}>Checkout</Text>
                  </Pressable>
                </View>
              ) : null} />
          )}
        </>
      )}
    </View>
  )
}

function makeStyles(c) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg, paddingTop: StatusBar.currentHeight || 44 },
    center: { alignItems: 'center', justifyContent: 'center' },
    authBox: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
    strip: { backgroundColor: c.ink, paddingVertical: 4, alignItems: 'center' },
    stripText: { color: c.bg, fontSize: 11, letterSpacing: 0.5 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    mark: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
    brand: { fontSize: 22, fontWeight: '800', color: c.brand },
    hActs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    cartBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.brand, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 12 },
    cnt: { backgroundColor: c.accent, borderRadius: 99, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
    cntText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    amt: { color: '#fff', fontWeight: '600', fontSize: 13 },
    navbar: { backgroundColor: c.brand, height: 46 },
    navItem: { paddingHorizontal: 16, justifyContent: 'center', height: 46 },
    navOn: { borderBottomWidth: 3, borderBottomColor: c.accent },
    navText: { color: '#ffffffb3', fontWeight: '600' },
    muted: { color: c.muted },
    link: { color: c.brand, fontWeight: '600', textDecorationLine: 'underline' },
    input: { backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 12, fontSize: 16, color: c.ink },
    btn: { backgroundColor: c.brand, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    btnOutline: { backgroundColor: c.card, borderWidth: 1, borderColor: c.brand, marginTop: 12 },
    outlineText: { color: c.brand },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12 },
    tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, borderColor: c.line, backgroundColor: c.card },
    tabOn: { backgroundColor: c.brand, borderColor: c.brand },
    tabText: { fontWeight: '600', color: c.ink },
    banner: { backgroundColor: c.brand, padding: 22, alignItems: 'center', gap: 8, borderRadius: 18, marginBottom: 14 },
    eyebrow: { color: '#ffd2c6', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
    bannerTitle: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
    bannerSub: { color: '#ffffffdd', textAlign: 'center' },
    bannerEmoji: { flexDirection: 'row', gap: 8, marginTop: 6 },
    bannerChip: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 99, paddingHorizontal: 14, marginBottom: 10 },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 16, color: c.ink },
    chipsRow: { gap: 8, paddingBottom: 12 },
    chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: c.line, backgroundColor: c.card },
    chipOn: { backgroundColor: c.brand, borderColor: c.brand },
    chipText: { fontWeight: '600', color: c.ink },
    gridRow: { gap: 12 },
    pcard: { flex: 1, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.line, overflow: 'hidden' },
    pimg: { aspectRatio: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
    pimgPic: { width: '100%', height: '100%' },
    pEmoji: { fontSize: 54 },
    ptag: { position: 'absolute', top: 8, left: 8, backgroundColor: c.card, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
    ptagText: { fontSize: 11, fontWeight: '600', color: c.ink },
    pbody: { padding: 10, alignItems: 'center', gap: 4, flex: 1 },
    pname: { fontWeight: '700', fontSize: 15, color: c.ink, textAlign: 'center' },
    pdesc: { color: c.muted, fontSize: 12, textAlign: 'center', minHeight: 32 },
    pprice: { fontWeight: '800', fontSize: 15, color: c.ink, marginTop: 'auto' },
    pAdd: { backgroundColor: c.brand, borderRadius: 99, paddingVertical: 8, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.line, padding: 12 },
    thumb: { width: 44, height: 44, borderRadius: 10 },
    emoji: { fontSize: 34 },
    name: { fontSize: 16, fontWeight: '700', color: c.ink },
    price: { color: c.muted, marginTop: 2 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    circle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    circleText: { fontSize: 20, lineHeight: 22, color: c.ink },
    qty: { fontSize: 16, fontWeight: '700', minWidth: 18, textAlign: 'center', color: c.ink },
    h1: { fontSize: 22, fontWeight: '800', color: c.ink },
    label: { fontWeight: '600', marginTop: 12, marginBottom: 4, color: c.ink },
    orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    line: { flex: 1, height: 1, backgroundColor: c.line },
    gbtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dadce0', borderRadius: 10, padding: 12 },
    gtext: { color: '#3c4043', fontWeight: '600', fontSize: 16 },
    orderCard: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.line, padding: 12, gap: 6 },
    item: { color: c.ink },
    badge: { marginTop: 4, fontWeight: '700', color: c.brand },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  })
}