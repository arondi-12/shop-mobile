import 'react-native-url-polyfill/auto'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import Svg, { Path } from 'react-native-svg'
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
      <Pressable style={[s.btn, s.btnOutline]} onPress={() => supabase.auth.signOut()}><Text style={[s.btnText, { color: '#1f6f54' }]}>Sign out</Text></Pressable>
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

  if (session === undefined) return <View style={[s.screen, s.center]}><ActivityIndicator size="large" color="#1f6f54" /></View>
  const items = Object.values(cart)
  const total = items.reduce((sum, i) => sum + i.p.price_cents * i.qty, 0)
  const count = items.reduce((sum, i) => sum + i.qty, 0)

  return (
    <View style={s.screen}>
      <StatusBar barStyle="dark-content" />
      {!session ? <Auth /> : (
        <>
          <View style={s.header}>
            <View><Text style={s.brand}>Corner Shop</Text><Text style={s.muted}>{session.user.email}</Text></View>
            <Pressable onPress={() => supabase.auth.signOut()}><Text style={s.link}>Sign out</Text></Pressable>
          </View>
          <View style={{ height: 52 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
              {[['shop', 'Shop'], ['cart', `Cart (${count})`], ['orders', 'Orders'], ['account', 'Account'], ...(isAdmin ? [['admin', 'Admin']] : [])].map(([k, l]) => (
                <Pressable key={k} style={[s.tab, tab === k && s.tabOn]} onPress={() => setTab(k)}>
                  <Text style={[s.tabText, tab === k && { color: '#fff' }]}>{l}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {tab === 'shop' ? (
            <FlatList data={products} keyExtractor={(p) => p.id} contentContainerStyle={{ padding: 16, gap: 12 }}
              renderItem={({ item: p }) => (
                <View style={s.card}>
                  <Text style={s.emoji}>{p.emoji || '🛒'}</Text>
                  <View style={{ flex: 1 }}><Text style={s.name}>{p.name}</Text><Text style={s.price}>{money(p.price_cents)}</Text></View>
                  {cart[p.id] ? <Stepper qty={cart[p.id].qty} onChange={(q) => setQty(p, q)} />
                    : <Pressable style={s.addBtn} onPress={() => setQty(p, 1)}><Text style={s.btnText}>Add</Text></Pressable>}
                </View>
              )} />
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
                  <Text style={s.emoji}>{i.p.emoji || '🛒'}</Text>
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

const G = '#1f6f54'
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8f5', paddingTop: StatusBar.currentHeight || 44 },
  center: { alignItems: 'center', justifyContent: 'center' },
  authBox: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  brand: { fontSize: 26, fontWeight: '800', color: G },
  muted: { color: '#5d6b66' },
  link: { color: G, fontWeight: '600', textDecorationLine: 'underline' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dde2db', borderRadius: 10, padding: 12, fontSize: 16 },
  btn: { backgroundColor: G, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, borderColor: '#dde2db', backgroundColor: '#fff' },
  tabOn: { backgroundColor: G, borderColor: G },
  tabText: { fontWeight: '600', color: '#1b2a2f' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dde2db', padding: 12 },
  emoji: { fontSize: 34 },
  name: { fontSize: 16, fontWeight: '700', color: '#1b2a2f' },
  price: { color: '#5d6b66', marginTop: 2 },
  addBtn: { backgroundColor: G, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 18 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  circle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#dde2db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  circleText: { fontSize: 20, lineHeight: 22 },
  qty: { fontSize: 16, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  h1: { fontSize: 22, fontWeight: '800', color: '#1b2a2f' },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 4, color: '#1b2a2f' },
  orderCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dde2db', padding: 12, gap: 6 },
  item: { color: '#1b2a2f' },
  badge: { marginTop: 4, fontWeight: '700', color: G },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, borderColor: '#dde2db', backgroundColor: '#fff' },
  chipOn: { backgroundColor: G, borderColor: G },
  chipText: { fontWeight: '600', color: '#1b2a2f' },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: G, marginTop: 12 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: '#dde2db' },
  gbtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dadce0', borderRadius: 10, padding: 12 },
  gtext: { color: '#3c4043', fontWeight: '600', fontSize: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
})