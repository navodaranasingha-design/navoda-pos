import React, { useEffect, useMemo, useState } from "react";

// ===============================
//  Navoda Print Out and Photocopy — POS + Billing (All requested features)
//  Features included (per your list):
//  1) POS / cashier UI (fast entry)
//  2) Invoice / bill print layout (customer name, date/time, invoice id)
//  3) Save history (daily / monthly views) — stored locally (localStorage)
//  4) Price presets (editable later in Settings)
//  5) Full website theme (header + sections)
//  6) Login system (simple local users; demo-grade)
//  7) Mobile-first UI (responsive, large touch targets)
// ===============================

type ItemKey =
  | "bwPcSingle"
  | "bwPcDouble"
  | "colorPcSingle"
  | "colorPcDouble"
  | "bwPrSingle"
  | "bwPrDouble"
  | "colorPrSingle"
  | "colorPrDouble";

type PricePreset = Record<ItemKey, number>;

type CartLine = { qty: number; price: number };

type SaleItem = { key: ItemKey; label: string; qty: number; price: number; total: number };

type Sale = {
  id: string; // invoice id
  ts: number; // epoch ms
  cashier: string;
  customer?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
};

type User = { username: string; password: string };

const SHOP_NAME = "Navoda Print Out and Photocopy";
const SHOP_PHONE = "0755425113";
const SHOP_ADDRESS = "18 meriland wathurugama"; // optional (leave empty if not provided)

const STORAGE = {
  users: "navoda_users_v1",
  session: "navoda_session_v1",
  presets: "navoda_price_presets_v1",
  sales: "navoda_sales_v1",
};

const DEFAULT_PRESETS: PricePreset = {
  bwPcSingle: 5,
  bwPcDouble: 8,
  colorPcSingle: 25,
  colorPcDouble: 40,
  bwPrSingle: 8,
  bwPrDouble: 12,
  colorPrSingle: 35,
  colorPrDouble: 55,
};

function clampInt(n: number, min = 0) {
  return Math.max(min, Math.trunc(n || 0));
}

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString("en-LK", { maximumFractionDigits: 2 })}`;
}

function formatDateTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function genInvoiceId() {
  // Simple readable invoice id (good enough for shop-level use)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(100 + Math.random() * 900); // 3 digits
  return `NAV-${y}${m}${day}-${rand}`;
}

function useLocalStorageState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore storage errors (private mode / quota)
    }
  }, [key, state]);

  return [state, setState] as const;
}

export default function App() {
  // --- auth (feature 6) ---
  const [users, setUsers] = useLocalStorageState<User[]>(STORAGE.users, [{ username: "admin", password: "admin" }]);
  const [session, setSession] = useLocalStorageState<{ username: string } | null>(STORAGE.session, null);

  // --- pricing presets (feature 4) ---
  const [presets, setPresets] = useLocalStorageState<PricePreset>(STORAGE.presets, DEFAULT_PRESETS);

  // --- sales history (feature 3) ---
  const [sales, setSales] = useLocalStorageState<Sale[]>(STORAGE.sales, []);

  // --- app navigation (feature 5) ---
  const [tab, setTab] = useState<"pos" | "history" | "settings">("pos");

  // --- POS state (feature 1) ---
  const [customer, setCustomer] = useState("");
  const [discount, setDiscount] = useState(0);
  const [cart, setCart] = useState<Record<ItemKey, CartLine>>(() => {
    const base: Record<ItemKey, CartLine> = {};
    (Object.keys(ITEM_META) as ItemKey[]).forEach((k) => (base[k] = { qty: 0, price: presets[k] }));
    return base;
  });

  // keep cart price in sync when presets change (so cashier sees updated prices immediately)
  useEffect(() => {
    setCart((prev) => {
      const next = { ...prev };
      (Object.keys(ITEM_META) as ItemKey[]).forEach((k) => {
        next[k] = { ...next[k], price: presets[k] };
      });
      return next;
    });
  }, [presets]);

  // derived values
  const cartLines = useMemo(() => {
    return (Object.keys(cart) as ItemKey[])
      .filter((k) => cart[k].qty > 0)
      .map((k) => {
        const qty = cart[k].qty;
        const price = cart[k].price;
        return {
          key: k,
          label: ITEM_META[k].label,
          qty,
          price,
          total: qty * price,
        };
      });
  }, [cart]);

  const subtotal = useMemo(() => cartLines.reduce((sum, l) => sum + l.total, 0), [cartLines]);
  const safeDiscount = Math.min(Math.max(discount, 0), subtotal); // prevent negative / > subtotal
  const total = useMemo(() => Math.max(0, subtotal - safeDiscount), [subtotal, safeDiscount]);

  // --- actions ---
  const addQty = (key: ItemKey, delta: number) => {
    setCart((prev) => ({
      ...prev,
      [key]: { ...prev[key], qty: clampInt(prev[key].qty + delta, 0) },
    }));
  };

  const setQty = (key: ItemKey, value: string) => {
    setCart((prev) => ({
      ...prev,
      [key]: { ...prev[key], qty: clampInt(Number(value), 0) },
    }));
  };

  const completeSale = () => {
    if (!session) return;
    if (total <= 0) return;

    const invoice: Sale = {
      id: genInvoiceId(),
      ts: Date.now(),
      cashier: session.username,
      customer: customer.trim() || undefined,
      items: cartLines.map((l) => ({ ...l })),
      subtotal,
      discount: safeDiscount,
      total,
    };

    setSales((prev) => [invoice, ...prev]);

    // reset POS
    setCustomer("");
    setDiscount(0);
    setCart((prev) => {
      const next = { ...prev };
      (Object.keys(next) as ItemKey[]).forEach((k) => (next[k] = { ...next[k], qty: 0 }));
      return next;
    });

    // open print view (feature 2)
    // We render a printable receipt section and trigger native print.
    setTimeout(() => {
      window.print();
    }, 50);
  };

  // --- auth handlers (feature 6) ---
  const login = (username: string, password: string) => {
    const found = users.find((u) => u.username === username && u.password === password);
    if (found) setSession({ username: found.username });
  };

  const signup = (username: string, password: string) => {
    if (!username || !password) return;
    if (users.some((u) => u.username === username)) return;
    const next = [...users, { username, password }];
    setUsers(next);
    setSession({ username });
  };

  const logout = () => setSession(null);

  // --- views ---
  if (!session) {
    return (
      <Shell shopName={SHOP_NAME} tab={tab} setTab={setTab} session={null} onLogout={() => {}}>
        <AuthCard onLogin={login} onSignup={signup} />
      </Shell>
    );
  }

  return (
    <Shell shopName={SHOP_NAME} tab={tab} setTab={setTab} session={session} onLogout={logout}>
      {tab === "pos" && (
        <POSView
          customer={customer}
          setCustomer={setCustomer}
          discount={discount}
          setDiscount={setDiscount}
          cart={cart}
          addQty={addQty}
          setQty={setQty}
          cartLines={cartLines}
          subtotal={subtotal}
          discountEffective={safeDiscount}
          total={total}
          onComplete={completeSale}
        />
      )}

      {tab === "history" && <HistoryView sales={sales} />}

      {tab === "settings" && (
        <SettingsView presets={presets} setPresets={setPresets} />
      )}
    </Shell>
  );
}

// -------------------------- UI Shell (feature 5: site theme) --------------------------
function Shell({
  shopName,
  session,
  tab,
  setTab,
  onLogout,
  children,
}: {
  shopName: string;
  session: { username: string } | null;
  tab: "pos" | "history" | "settings";
  setTab: (t: "pos" | "history" | "settings") => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xl font-bold leading-tight truncate">{shopName}</div>
            <div className="text-xs text-slate-600">POS • Billing • Reports</div>
          </div>

          {session && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Cashier: <b>{session.username}</b></span>
              <button
                className="text-xs px-3 py-1 rounded border bg-white hover:bg-slate-50"
                onClick={onLogout}
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {session && (
          <nav className="mx-auto max-w-6xl px-4 pb-2">
            <div className="flex gap-2 flex-wrap">
              <TabButton active={tab === "pos"} onClick={() => setTab("pos")} label="POS" />
              <TabButton active={tab === "history"} onClick={() => setTab("history")} label="History" />
              <TabButton active={tab === "settings"} onClick={() => setTab("settings")} label="Settings" />
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500">
        Built for a small shop workflow: quick entry, fast totals, and printable bills.
      </footer>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={
        "px-3 py-2 rounded-lg text-sm font-medium border " +
        (active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-800 border-slate-200")
      }
    >
      {label}
    </button>
  );
}

// -------------------------- Auth (feature 6) --------------------------
function AuthCard({ onLogin, onSignup }: { onLogin: (u: string, p: string) => void; onSignup: (u: string, p: string) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Welcome</h2>
        <button className="text-sm underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Create account" : "Have an account? Login"}
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-xs text-slate-600 mb-1">Username</div>
          <input className="w-full border rounded p-2" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-slate-600 mb-1">Password</div>
          <input
            type="password"
            className="w-full border rounded p-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>

      <button
        className="mt-4 w-full rounded-xl bg-slate-900 text-white py-2 font-semibold"
        onClick={() => (mode === "login" ? onLogin(username, password) : onSignup(username, password))}
      >
        {mode === "login" ? "Login" : "Sign up"}
      </button>

      <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
        Note: This login is stored locally in your browser (good for a small shop setup). For multi-device / cloud access,
        we can upgrade this to Firebase/Supabase later.
      </div>
    </div>
  );
}

// -------------------------- POS (feature 1 + 2) --------------------------
function POSView(props: {
  customer: string;
  setCustomer: (v: string) => void;
  discount: number;
  setDiscount: (v: number) => void;
  cart: Record<ItemKey, CartLine>;
  addQty: (key: ItemKey, delta: number) => void;
  setQty: (key: ItemKey, value: string) => void;
  cartLines: SaleItem[];
  subtotal: number;
  discountEffective: number;
  total: number;
  onComplete: () => void;
}) {
  const {
    customer,
    setCustomer,
    discount,
    setDiscount,
    cart,
    addQty,
    setQty,
    cartLines,
    subtotal,
    discountEffective,
    total,
    onComplete,
  } = props;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: quick entry (mobile-friendly) */}
      <div className="bg-white rounded-2xl shadow p-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
          <div className="flex-1">
            <div className="text-xs text-slate-600 mb-1">Customer (optional)</div>
            <input
              className="w-full border rounded p-2"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Customer name / phone"
            />
          </div>
          <div className="w-full sm:w-44">
            <div className="text-xs text-slate-600 mb-1">Discount (Rs.)</div>
            <input
              className="w-full border rounded p-2"
              inputMode="numeric"
              value={String(discount)}
              onChange={(e) => setDiscount(Number(e.target.value || 0))}
              placeholder="0"
            />
          </div>
        </div>

        <div className="mt-5">
          <div className="text-sm font-semibold mb-2">Quick Items (tap to add)</div>
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
            {(Object.keys(ITEM_META) as ItemKey[]).map((k) => (
              <button
                key={k}
                className="text-left border rounded-xl p-3 bg-slate-50 hover:bg-white active:bg-white transition"
                onClick={() => addQty(k, 1)}
              >
                <div className="font-medium text-sm leading-tight">{ITEM_META[k].label}</div>
                <div className="text-xs text-slate-600 mt-1">Price: {formatRs(cart[k].price)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-xl border bg-slate-50 p-3">
          <div className="text-sm font-semibold mb-2">Cart (edit qty)</div>
          <div className="space-y-2">
            {(Object.keys(ITEM_META) as ItemKey[]).map((k) => (
              <div key={k} className="flex items-center gap-2">
                <div className="flex-1 min-w-0 text-sm truncate">{ITEM_META[k].label}</div>
                <button className="px-2 py-1 rounded border" onClick={() => addQty(k, -1)}>-</button>
                <input
                  className="w-16 border rounded p-1 text-center"
                  inputMode="numeric"
                  value={String(cart[k].qty)}
                  onChange={(e) => setQty(k, e.target.value)}
                />
                <button className="px-2 py-1 rounded border" onClick={() => addQty(k, 1)}>+</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: totals + checkout (sticky on mobile) */}
      <div className="bg-white rounded-2xl shadow p-5 flex flex-col">
        <div className="text-sm font-semibold mb-2">Bill Summary</div>
        <div className="flex flex-col gap-2 text-sm">
          {cartLines.length === 0 ? (
            <div className="text-slate-500">Add items (tap buttons or set qty) to build the bill.</div>
          ) : (
            cartLines.map((l) => (
              <div key={l.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{l.label}</div>
                  <div className="text-xs text-slate-600">{l.qty} × {formatRs(l.price)}</div>
                </div>
                <div className="font-semibold">{formatRs(l.total)}</div>
              </div>
            ))
          )}
          <hr />
          <div className="flex justify-between"><span className="text-slate-700">Subtotal</span><b>{formatRs(subtotal)}</b></div>
          <div className="flex justify-between"><span className="text-slate-700">Discount</span><b>{formatRs(discountEffective)}</b></div>
          <div className="flex justify-between text-lg"><span className="font-bold">Grand Total</span><span className="font-extrabold">{formatRs(total)}</span></div>
        </div>

        <button
          className="mt-auto w-full rounded-xl bg-slate-900 text-white py-3 text-lg font-semibold disabled:opacity-40"
          onClick={onComplete}
          disabled={total <= 0}
        >
          Complete Sale & Print Bill
        </button>

        {/* Print-only receipt layout (feature 2) */}
        <div className="hidden print:block mt-6">
          <PrintReceipt
            shopName={SHOP_NAME}
            customer={customer}
            cartLines={cartLines}
            subtotal={subtotal}
            discount={discountEffective}
            total={total}
          />
        </div>
      </div>
    </div>
  );
}

function PrintReceipt({
  shopName,
  customer,
  cartLines,
  subtotal,
  discount,
  total,
}: {
  shopName: string;
  customer: string;
  cartLines: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
}) {
  return (
    <div className="print:visible">
      <div className="text-center">
        <div className="text-xl font-bold">{shopName}</div>
        <div className="text-sm text-slate-600">Phone: {SHOP_PHONE}</div>
        {SHOP_ADDRESS.trim() && <div className="text-sm text-slate-600">Address: {SHOP_ADDRESS}</div>}
        <div className="text-sm text-slate-600">Receipt / Bill</div>
      </div>
      <div className="mt-3 text-sm">
        <div>Date & Time: {formatDateTime(Date.now())}</div>
        {customer.trim() && <div>Customer: {customer.trim()}</div>}
      </div>
      <div className="mt-3 border-t pt-2">
        {cartLines.map((l) => (
          <div key={l.key} className="flex justify-between text-sm">
            <div className="max-w-[70%]">{l.label} ({l.qty} × {formatRs(l.price)})</div>
            <div className="font-semibold">{formatRs(l.total)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t pt-2 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><b>{formatRs(subtotal)}</b></div>
        <div className="flex justify-between"><span>Discount</span><b>{formatRs(discount)}</b></div>
        <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatRs(total)}</span></div>
      </div>
      <div className="mt-3 text-xs text-slate-600">Thank you — {shopName}</div>
    </div>
  );
}

// -------------------------- History (feature 3) --------------------------
function HistoryView({ sales }: { sales: Sale[] }) {
  const [mode, setMode] = useState<"today" | "month" | "all">("today");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const now = new Date();
    return sales.filter((s) => {
      if (mode === "today") {
        const d = new Date(s.ts);
        if (d.toDateString() !== now.toDateString()) return false;
      }
      if (mode === "month") {
        const d = new Date(s.ts);
        if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
      }
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        return (
          s.id.toLowerCase().includes(q) ||
          (s.customer || "").toLowerCase().includes(q) ||
          s.cashier.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sales, mode, query]);

  const totals = useMemo(() => {
    const sum = filtered.reduce((a, s) => a + s.total, 0);
    return { count: filtered.length, sum };
  }, [filtered]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="bg-white rounded-2xl shadow p-5">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Sales history</div>
            <div className="text-xs text-slate-600">Daily / monthly views (saved locally)</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="px-3 py-2 rounded border" onClick={() => setMode("today")}>Today</button>
            <button className="px-3 py-2 rounded border" onClick={() => setMode("month")}>This month</button>
            <button className="px-3 py-2 rounded border" onClick={() => setMode("all")}>All</button>
          </div>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 border rounded p-2"
            placeholder="Search invoice / customer / cashier"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="text-sm text-slate-700">Records: <b>{totals.count}</b> · Total: <b>{formatRs(totals.sum)}</b></div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-5 overflow-x-auto">
        <div className="text-sm font-semibold mb-3">Entries</div>
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-slate-500">No sales found for this view.</div>
          ) : (
            filtered.map((s) => (
              <div key={s.id} className="border rounded-xl p-3">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="font-semibold">{s.id}</div>
                  <div className="text-sm text-slate-600">{formatDateTime(s.ts)}</div>
                </div>
                <div className="text-sm mt-1 text-slate-700">Cashier: <b>{s.cashier}</b>{s.customer ? ` · Customer: ${s.customer}` : ""}</div>
                <div className="mt-2 text-sm font-medium">Total: {formatRs(s.total)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------- Settings (feature 4) --------------------------
function SettingsView({ presets, setPresets }: { presets: PricePreset; setPresets: (p: PricePreset) => void }) {
  const [draft, setDraft] = useState<PricePreset>(presets);

  const update = (k: ItemKey, v: string) => {
    const n = Number(v);
    setDraft((prev) => ({ ...prev, [k]: Number.isFinite(n) && n >= 0 ? n : 0 }));
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="bg-white rounded-2xl shadow p-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Price presets (editable)</div>
            <div className="text-xs text-slate-600">Change values here — POS will use these prices automatically.</div>
          </div>
          <button
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold"
            onClick={() => setPresets(draft)}
          >
            Save Prices
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(ITEM_META) as ItemKey[]).map((k) => (
            <div key={k} className="border rounded-xl p-3 bg-slate-50">
              <div className="text-sm font-medium mb-1">{ITEM_META[k].label}</div>
              <div className="flex gap-2 items-center">
                <div className="text-xs text-slate-600">Rs.</div>
                <input
                  className="flex-1 border rounded p-2"
                  inputMode="numeric"
                  value={String(draft[k])}
                  onChange={(e) => update(k, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
