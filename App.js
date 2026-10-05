import 'react-native-url-polyfill/auto'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Linking, Platform, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// Same Supabase project (database + auth + API) as the website.
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
})
// Alert.alert does nothing in the browser preview, so fall back to window.alert there.
const notify = (title, msg) => (Platform.OS === 'web' ? window.alert(title + '\n' + msg) : Alert.alert(title, msg))
const money = (c) => 'KES ' + (c / 100).toLocaleString()

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
    </View>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState('shop')
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
  }, [])
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
          <View style={s.tabs}>
            {[['shop', 'Shop'], ['cart', `Cart (${count})`]].map(([k, l]) => (
              <Pressable key={k} style={[s.tab, tab === k && s.tabOn]} onPress={() => setTab(k)}>
                <Text style={[s.tabText, tab === k && { color: '#fff' }]}>{l}</Text>
              </Pressable>
            ))}
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
                  <Pressable style={s.btn} onPress={() => Linking.openURL((process.env.EXPO_PUBLIC_WEB_URL || '') + '/checkout')}>
                    <Text style={s.btnText}>Checkout on the website</Text>
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
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
})