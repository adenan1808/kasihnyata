import { useState, useMemo, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { db } from '../db/database';
import { generateUUID } from '../utils/helpers';
import { exportPurchaseTransactionsCSV } from '../utils/csvExport';
import { printPurchaseInvoice } from '../utils/thermalPrint';
import type { PurchaseTransaction, Supplier, Produk } from '../types/local';

declare global {
  interface Window {
    Admin?: {
      openProductModal?: () => void;
    }
  }
}

type FilterStatus = 'ALL' | 'UNPAID' | 'PARTIAL' | 'PAID';

interface PTForm {
  supplierId: string;
  invoiceNumber: string;
  paymentType: 'cash' | 'tempo';
  dueDate: string;
  total: number;
  catatan: string;
  items: Array<{
    id: string; // To match existing items if needed, or use a unique key
    produkId: string;
    namaProduk: string;
    skuProduk: string;
    qty: number;
    hargaBeli: number;
    subtotal: number;
  }>;
  lampiran?: string; // base64 or url for Foto invoice
}

const EMPTY_FORM: PTForm = {
  supplierId: '', invoiceNumber: '', paymentType: 'cash',
  dueDate: '', total: 0, catatan: '', items: [], lampiran: undefined
};

function genInvoice(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const rand = Math.random().toString(36).slice(2,6).toUpperCase();
  return `INV-${ymd}-${rand}`;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status==='PAID'?'text-green-400 bg-green-500/10 border-green-500/20'
    :status==='PARTIAL'?'text-amber-400 bg-amber-500/10 border-amber-500/20'
    :'text-red-400 bg-red-500/10 border-red-500/20';
  const label = status==='PAID'?'Lunas':status==='PARTIAL'?'Sebagian':'Belum Bayar';
  return <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

export default function PurchasePage_impl() {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<PurchaseTransaction|null>(null);
  const [form, setForm] = useState<PTForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showPayModal, setShowPayModal] = useState<PurchaseTransaction|null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<PurchaseTransaction|null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [previewLampiran, setPreviewLampiran] = useState<string | null>(null);

  // New state for product search
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productSearchRef = useRef<HTMLDivElement>(null);

  // Handle click outside for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productSearchRef.current && !productSearchRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowModal(false); setShowPayModal(null); setDeleteConfirm(null); }
      if (e.key === 'F2') { setShowModal(true); openAdd(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const suppliers = useLiveQuery<Supplier[]>(() => db.supplier.filter(s => s.isActive).toArray(), []) ?? [];
  const rawList = useLiveQuery<PurchaseTransaction[]>(
    () => db.purchaseTransactions.orderBy('createdAt').reverse().toArray(), []
  ) ?? [];
  const allProduk = useLiveQuery<Produk[]>(() => db.produk.filter(p => p.isActive).toArray(), []) ?? [];

  const supplierProducts = useMemo(() => {
    if (!form.supplierId) return [];
    return allProduk.filter(p => p.supplierId === form.supplierId);
  }, [allProduk, form.supplierId]);

  const filteredSupplierProducts = useMemo(() => {
    if (!productSearch.trim()) return supplierProducts;
    const q = productSearch.toLowerCase();
    return supplierProducts.filter(p => p.nama.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [supplierProducts, productSearch]);

  const handleAddProduct = (p: Produk) => {
    setForm(f => {
      const existing = f.items.find(i => i.produkId === p.id);
      if (existing) {
        return {
          ...f,
          items: f.items.map(i => i.produkId === p.id ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.hargaBeli } : i)
        };
      }
      return {
        ...f,
        items: [...f.items, {
          id: generateUUID(),
          produkId: p.id,
          namaProduk: p.nama,
          skuProduk: p.sku,
          qty: 1,
          hargaBeli: p.hargaModal,
          subtotal: p.hargaModal
        }]
      };
    });
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const handleUpdateItem = (id: string, field: 'qty' | 'hargaBeli', value: number) => {
    setForm(f => {
      const newItems = f.items.map(i => {
        if (i.id === id) {
          const newVal = { ...i, [field]: value };
          newVal.subtotal = newVal.qty * newVal.hargaBeli;
          return newVal;
        }
        return i;
      });
      // Recalculate total
      const newTotal = newItems.reduce((sum, item) => sum + item.subtotal, 0);
      return { ...f, items: newItems, total: newTotal };
    });
  };

  const handleRemoveItem = (id: string) => {
    setForm(f => {
      const newItems = f.items.filter(i => i.id !== id);
      const newTotal = newItems.reduce((sum, item) => sum + item.subtotal, 0);
      return { ...f, items: newItems, total: newTotal };
    });
  };

  const list = useMemo(() => {
    let items = rawList;
    if (filterStatus !== 'ALL') items = items.filter(t => t.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(t =>
        t.invoiceNumber.toLowerCase().includes(q) ||
        (t.supplierNama ?? '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [rawList, filterStatus, search]);

  // Summary stats
  const stats = useMemo(() => {
    const totalDebt = rawList.filter(t => t.status !== 'PAID').reduce((s, t) => s + t.remainingDebt, 0);
    const unpaidCount = rawList.filter(t => t.status === 'UNPAID').length;
    const now = Date.now();
    const overdueCount = rawList.filter(t => t.status !== 'PAID' && t.dueDate && t.dueDate < now).length;
    return { totalDebt, unpaidCount, overdueCount };
  }, [rawList]);

  // Due date warnings
  const warnings = useMemo(() => {
    const now = Date.now();
    return rawList
      .filter(t => t.status !== 'PAID' && t.dueDate)
      .map(t => ({ ...t, sisaHari: Math.ceil(((t.dueDate ?? 0) - now) / 86400000) }))
      .filter(t => t.sisaHari <= 7)
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
  }, [rawList]);

  const openAdd = () => {
    setEditItem(null);
    setForm({ ...EMPTY_FORM, invoiceNumber: genInvoice() });
    setShowModal(true);
  };

  const openEdit = (t: PurchaseTransaction) => {
    setEditItem(t);
    setForm({
      supplierId: t.supplierId,
      invoiceNumber: t.invoiceNumber,
      paymentType: t.paymentType,
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0,10) : '',
      total: t.total,
      catatan: t.catatan ?? '',
      lampiran: (t as any).lampiran,
      items: t.items ?? [],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.supplierId) { toast.error('Pilih supplier'); return; }
    if (!form.invoiceNumber.trim()) { toast.error('Nomor invoice wajib'); return; }
    if (form.total <= 0) { toast.error('Total harus > 0'); return; }
    if (form.paymentType === 'tempo' && !form.dueDate) { toast.error('Pilih tanggal jatuh tempo'); return; }
    setSaving(true);
    try {
      const sup = suppliers.find(s => s.id === form.supplierId);
      const now = Date.now();
      const data: Omit<PurchaseTransaction, 'id'> = {
        supplierId: form.supplierId,
        supplierNama: sup?.nama ?? '',
        invoiceNumber: form.invoiceNumber.trim(),
        paymentType: form.paymentType,
        dueDate: form.dueDate ? new Date(form.dueDate).getTime() : undefined,
        total: Number(form.total),
        remainingDebt: editItem ? editItem.remainingDebt : (form.paymentType === 'cash' ? 0 : Number(form.total)),
        status: editItem ? editItem.status : (form.paymentType === 'cash' ? 'PAID' : 'UNPAID'),
        items: form.items,
        catatan: form.catatan.trim() || undefined,
        lampiran: form.lampiran,
        createdAt: editItem?.createdAt ?? now,
        updatedAt: now,
      };
      if (editItem) {
        await db.purchaseTransactions.where('id').equals(editItem.id).modify({ ...data });
        toast.success('Invoice diperbarui!');
      } else {
        await db.purchaseTransactions.add({ id: generateUUID(), ...data });
        toast.success('Invoice ditambahkan!');
      }
      setShowModal(false);
    } finally { setSaving(false); }
  };

  const handlePayment = async () => {
    if (!showPayModal) return;
    if (payAmount <= 0) { toast.error('Jumlah bayar harus > 0'); return; }
    const newRemaining = Math.max(0, showPayModal.remainingDebt - payAmount);
    const newStatus: PurchaseTransaction['status'] = newRemaining === 0 ? 'PAID' : 'PARTIAL';
    await db.purchaseTransactions.where('id').equals(showPayModal.id).modify({
      remainingDebt: newRemaining, status: newStatus, updatedAt: Date.now(),
    });
    toast.success(`Pembayaran Rp ${payAmount.toLocaleString('id-ID')} dicatat!`);
    setShowPayModal(null); setPayAmount(0);
  };

  const handleDelete = async (t: PurchaseTransaction) => {
    await db.purchaseTransactions.where('id').equals(t.id).delete();
    toast.success('Invoice dihapus'); setDeleteConfirm(null);
  };

  const handlePrint = (t: PurchaseTransaction) => {
    printPurchaseInvoice({
      supplierNama: t.supplierNama ?? t.supplierId,
      invoiceNumber: t.invoiceNumber,
      tanggal: new Date(t.createdAt).toLocaleDateString('id-ID'),
      paymentType: t.paymentType,
      dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString('id-ID') : undefined,
      items: (t.items ?? []).map(i => ({ nama: i.namaProduk, qty: i.qty, hargaBeli: i.hargaBeli, subtotal: i.subtotal })),
      total: t.total,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-[#0f1117]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h1 className="text-lg font-bold flex-1">Pembelian & Hutang Supplier</h1>
        <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cari invoice / supplier..." className="input-base w-44"
          onKeyDown={e => e.key === 'Escape' && setSearch('')}/>
        <button onClick={() => exportPurchaseTransactionsCSV(rawList)}
          className="flex items-center gap-1 px-3 py-1.5 border border-[#2a3347] text-slate-400 hover:text-white rounded-lg text-xs">
          ↓ Export CSV
        </button>
        <button onClick={openAdd} className="btn-primary">+ Tambah Invoice</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label:'Total Hutang Aktif', value:`Rp ${stats.totalDebt.toLocaleString('id-ID')}`, cls:'text-red-400' },
          { label:'Invoice Belum Lunas', value:stats.unpaidCount, cls:'text-amber-400' },
          { label:'Lewat Jatuh Tempo', value:stats.overdueCount, cls:'text-orange-500' },
        ].map(s => (
          <div key={s.label} className="bg-[#161b27] border border-[#2a3347] rounded-xl px-4 py-3">
            <p className="text-[10px] text-slate-500">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Due date warnings */}
      {warnings.length > 0 && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5">
          <p className="text-xs font-bold text-amber-400 mb-2">⏰ Peringatan Jatuh Tempo</p>
          {warnings.map(w => (
            <div key={w.id} className="flex items-center justify-between text-xs">
              <span className="text-white font-medium">{w.supplierNama}</span>
              <span className="text-slate-400 mx-2">{w.invoiceNumber}</span>
              <span className="text-amber-400">Rp {w.remainingDebt.toLocaleString('id-ID')}</span>
              <span className={`ml-2 font-bold ${w.sisaHari < 0 ? 'text-red-500' : w.sisaHari <= 3 ? 'text-orange-400' : 'text-amber-300'}`}>
                {w.sisaHari < 0 ? `Lewat ${Math.abs(w.sisaHari)} hari` : `${w.sisaHari} hari lagi`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {(['ALL','UNPAID','PARTIAL','PAID'] as FilterStatus[]).map(f => (
          <button key={f} onClick={() => setFilterStatus(f)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${filterStatus===f?'bg-green-500/20 text-green-400 border border-green-500/30':'text-slate-500 hover:text-white border border-transparent'}`}>
            {f==='ALL'?'Semua':f==='UNPAID'?'Belum Bayar':f==='PARTIAL'?'Sebagian':'Lunas'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="table-container overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead><tr className="border-b border-[#2a3347]">
            {['No. Invoice','Supplier','Tipe','Total','Sisa Hutang','Jatuh Tempo','Status','Lampiran','Aksi'].map(h => (
              <th key={h} className="th">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {list.map(t => {
              const now = Date.now();
              const overdue = t.status !== 'PAID' && t.dueDate && t.dueDate < now;
              const dueSoon = t.status !== 'PAID' && t.dueDate && t.dueDate - now < 7 * 86400000;
              return (
                <tr key={t.id} className={`tr ${overdue ? 'bg-red-500/5' : dueSoon ? 'bg-amber-500/5' : ''}`}>
                  <td className="td font-mono text-blue-400 text-[11px]">{t.invoiceNumber}</td>
                  <td className="td font-medium text-sm">{t.supplierNama ?? t.supplierId}</td>
                  <td className="td">
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${t.paymentType==='cash'?'text-green-400 border-green-500/20':'text-amber-400 border-amber-500/20'}`}>
                      {t.paymentType==='cash'?'TUNAI':'TEMPO'}
                    </span>
                  </td>
                  <td className="td text-sm">Rp {t.total.toLocaleString('id-ID')}</td>
                  <td className="td text-sm font-semibold text-red-400">{t.remainingDebt > 0 ? `Rp ${t.remainingDebt.toLocaleString('id-ID')}` : <span className="text-green-400">Lunas</span>}</td>
                  <td className="td text-[11px]">
                    {t.dueDate ? (
                      <span className={overdue ? 'text-red-500 font-bold' : dueSoon ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                        {new Date(t.dueDate).toLocaleDateString('id-ID')}
                        {overdue && ' 🔴'}
                        {!overdue && dueSoon && ' 🟠'}
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="td"><StatusBadge status={t.status}/></td>
                  <td className="td text-center">
                    {(t as any).lampiran ? (
                      <button onClick={() => setPreviewLampiran((t as any).lampiran)} className="text-blue-400 hover:text-blue-300 underline text-[10px]">
                        Lihat Foto
                      </button>
                    ) : (
                      <span className="text-slate-500 text-[10px]">-</span>
                    )}
                  </td>
                  <td className="td">
                    <div className="flex gap-1">
                      {t.status !== 'PAID' && (
                        <button onClick={() => { setShowPayModal(t); setPayAmount(t.remainingDebt); }}
                          className="px-2 py-1 text-[10px] border border-green-500/30 bg-green-500/5 text-green-400 rounded hover:bg-green-500/15">
                          Bayar
                        </button>
                      )}
                      <button onClick={() => handlePrint(t)}
                        className="w-6 h-6 border border-[#2a3347] rounded bg-[#1e2535] text-slate-400 hover:text-white flex items-center justify-center" title="Cetak">
                        🖨️
                      </button>
                      <button onClick={() => openEdit(t)}
                        className="w-6 h-6 border border-[#2a3347] rounded bg-[#1e2535] text-slate-400 hover:text-white flex items-center justify-center" title="Edit">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => setDeleteConfirm(t)}
                        className="w-6 h-6 border border-red-500/20 rounded bg-red-500/5 text-red-400 hover:bg-red-500/15 flex items-center justify-center">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <div className="text-4xl mb-3">🧾</div>
            <p className="text-sm">{search || filterStatus !== 'ALL' ? 'Tidak ditemukan' : 'Belum ada transaksi pembelian'}</p>
          </div>
        )}
      </div>

            {/* Add/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
              className="bg-[#161b27] border border-[#2a3347] rounded-2xl w-[480px]">
              <div className="px-5 py-4 border-b border-[#2a3347] flex justify-between items-center">
                <h2 className="font-bold">{editItem ? 'Edit Invoice' : 'Tambah Invoice Pembelian'}</h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white text-xl">×</button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Supplier *</label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">👤</span>
                    <select value={form.supplierId} onChange={e => setForm(f => ({...f, supplierId: e.target.value}))}
                      className="input-base flex-1" autoFocus>
                      <option value="">— Pilih Supplier —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">No. Invoice *</label>
                    <input value={form.invoiceNumber} onChange={e => setForm(f => ({...f, invoiceNumber: e.target.value}))}
                      className="input-base" placeholder="INV-20240101-XXXX"
                      onKeyDown={e => e.key === 'Enter' && (document.querySelector('[data-field="total"]') as HTMLElement)?.focus()}/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Tipe Pembayaran</label>
                    <select value={form.paymentType} onChange={e => setForm(f => ({...f, paymentType: e.target.value as 'cash'|'tempo'}))}
                      className="input-base">
                      <option value="cash">Tunai (Langsung Lunas)</option>
                      <option value="tempo">Tempo (Hutang)</option>
                    </select>
                  </div>
                </div>

                {form.supplierId && (
                  <div className="bg-[#1e2535] p-3 rounded-xl border border-[#2a3347] relative">
                    <label className="text-xs text-slate-400 block mb-2 font-bold">Panel Produk</label>

                    <div className="relative mb-3" ref={productSearchRef}>
                      <input
                        value={productSearch}
                        onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                        onFocus={() => setShowProductDropdown(true)}
                        className="input-base w-full bg-[#161b27]"
                        placeholder="Cari produk dari supplier ini..."
                      />
                      <AnimatePresence>
                        {showProductDropdown && (
                          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                            className="absolute top-full left-0 right-0 mt-1 bg-[#1a2032] border border-[#2a3347] rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                            {filteredSupplierProducts.map(p => (
                              <div key={p.id} onClick={() => handleAddProduct(p)}
                                className="px-3 py-2 hover:bg-[#2a3347] cursor-pointer text-sm border-b border-[#2a3347] last:border-0">
                                <div className="font-medium text-white">{p.nama}</div>
                                <div className="text-[10px] text-slate-400">{p.sku} · Rp {p.hargaModal.toLocaleString('id-ID')}</div>
                              </div>
                            ))}
                            {filteredSupplierProducts.length === 0 && productSearch && (
                              <div className="px-3 py-2 text-sm text-slate-500">Tidak ada produk cocok.</div>
                            )}
                            <div onClick={() => {
                                if (window.Admin && window.Admin.openProductModal) window.Admin.openProductModal();
                                setShowProductDropdown(false);
                              }}
                              className="px-3 py-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 cursor-pointer text-sm font-bold flex items-center justify-center gap-1 border-t border-[#2a3347]">
                              + Produk Baru
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {form.items.length > 0 && (
                      <div className="overflow-x-auto border border-[#2a3347] rounded-lg">
                        <table className="w-full text-left">
                          <thead className="bg-[#161b27] text-[10px] text-slate-400 uppercase">
                            <tr>
                              <th className="px-2 py-1.5 font-medium">Nama Produk</th>
                              <th className="px-2 py-1.5 font-medium w-20">Qty</th>
                              <th className="px-2 py-1.5 font-medium w-28">Harga Beli</th>
                              <th className="px-2 py-1.5 font-medium w-28">Sub Total</th>
                              <th className="px-2 py-1.5 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {form.items.map((item, idx) => (
                              <tr key={item.id} className="border-t border-[#2a3347] text-xs">
                                <td className="px-2 py-1.5 truncate max-w-[120px]" title={item.namaProduk}>{item.namaProduk}</td>
                                <td className="px-2 py-1.5">
                                  <input type="number" value={item.qty || ''} onChange={e => {
                                      let val = e.target.value.replace(/\D/g, '');
                                      if (val.length > 7) val = val.slice(0, 7);
                                      handleUpdateItem(item.id, 'qty', Number(val));
                                    }}
                                    className="w-full bg-[#161b27] border border-[#2a3347] rounded px-1.5 py-1 outline-none focus:border-blue-500"
                                    min="1" />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input type="number" value={item.hargaBeli || ''} onChange={e => {
                                      let val = e.target.value.replace(/\D/g, '');
                                      if (val.length > 9) val = val.slice(0, 9);
                                      handleUpdateItem(item.id, 'hargaBeli', Number(val));
                                    }}
                                    className="w-full bg-[#161b27] border border-[#2a3347] rounded px-1.5 py-1 outline-none focus:border-blue-500" />
                                </td>
                                <td className="px-2 py-1.5 font-medium">Rp {item.subtotal.toLocaleString('id-ID')}</td>
                                <td className="px-2 py-1.5 text-center">
                                  <button onClick={() => handleRemoveItem(item.id)} className="text-red-400 hover:text-red-300 font-bold">×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1 font-bold">Foto invoice</label>
                    <div className="border-2 border-dashed border-[#2a3347] bg-[#161b27] hover:bg-[#1e2535] rounded-xl h-24 flex items-center justify-center cursor-pointer transition-colors relative overflow-hidden"
                         onClick={() => document.getElementById('lampiranUpload')?.click()}>
                      {form.lampiran ? (
                        <img src={form.lampiran} alt="Invoice" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center">
                          <div className="text-xl mb-1">📸</div>
                          <span className="text-[10px] text-slate-400">Upload Foto</span>
                        </div>
                      )}
                      <input id="lampiranUpload" type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (e) => setForm(f => ({...f, lampiran: e.target?.result as string}));
                            reader.readAsDataURL(file);
                          }
                        }} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="bg-[#1e2535] rounded-xl p-2.5 border border-[#2a3347] flex justify-between items-center">
                      <div className="text-[10px] text-slate-400">Jumlah Item</div>
                      <div className="text-sm font-bold text-white">{form.items.reduce((s, i) => s + i.qty, 0)}</div>
                    </div>
                    <div className="bg-[#1e2535] rounded-xl p-2.5 border border-[#2a3347]">
                      <div className="text-[10px] text-slate-400 mb-0.5">Total invoice (Rp) *</div>
                      <div className="flex">
                        <input type="number" data-field="total" value={form.total || ''}
                          onChange={e => {
                            let val = e.target.value.replace(/\D/g, '');
                            if (val.length > 12) val = val.slice(0, 12);
                            setForm(f => ({...f, total: Number(val)}));
                          }}
                          className="bg-transparent text-lg font-bold text-amber-400 w-full outline-none"
                          placeholder="0"
                          onKeyDown={e => e.key === 'Enter' && (document.querySelector('[data-field="duedate"]') as HTMLElement)?.focus()}/>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-end mb-3">
                  {form.paymentType === 'tempo' && (
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Jatuh Tempo *</label>
                      <input type="date" data-field="duedate" value={form.dueDate}
                        onChange={e => setForm(f => ({...f, dueDate: e.target.value}))}
                        className="input-base"/>
                    </div>
                  )}
                  <div className={form.paymentType === 'tempo' ? '' : 'col-span-2'}>
                    <label className="text-xs text-slate-400 block mb-1">Catatan</label>
                    <input value={form.catatan} onChange={e => setForm(f => ({...f, catatan: e.target.value}))}
                      className="input-base" placeholder="Opsional..."/>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 border border-[#2a3347] rounded-lg text-sm hover:bg-[#1e2535]">Batal</button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 btn-primary py-2.5" onKeyDown={e => e.key === 'Enter' && handleSave()}>
                    {saving ? 'Menyimpan...' : editItem ? 'Perbarui' : 'Simpan'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

{/* Payment Modal */}
      <AnimatePresence>
        {showPayModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
              className="bg-[#161b27] border border-green-500/30 rounded-2xl w-[360px] p-5">
              <h2 className="font-bold mb-1">💰 Catat Pembayaran</h2>
              <p className="text-xs text-slate-500 mb-4">{showPayModal.invoiceNumber} · {showPayModal.supplierNama}</p>
              <div className="mb-3">
                <p className="text-xs text-slate-400 mb-1">Sisa Hutang: <strong className="text-red-400">Rp {showPayModal.remainingDebt.toLocaleString('id-ID')}</strong></p>
                <label className="text-xs text-slate-400 block mb-1">Jumlah Dibayar (Rp)</label>
                <input type="number" value={payAmount || ''} onChange={e => setPayAmount(Number(e.target.value))}
                  className="input-base" autoFocus
                  onKeyDown={e => e.key === 'Enter' && handlePayment()}/>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowPayModal(null); setPayAmount(0); }}
                  className="flex-1 py-2 border border-[#2a3347] rounded-lg text-sm">Batal</button>
                <button onClick={handlePayment} className="flex-1 py-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg text-sm">
                  Catat
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
              className="bg-[#161b27] border border-red-500/30 rounded-2xl w-[300px] p-5 text-center">
              <div className="text-3xl mb-2">⚠️</div>
              <h3 className="font-bold mb-1">Hapus Invoice?</h3>
              <p className="text-slate-400 text-xs mb-4">{deleteConfirm.invoiceNumber}</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 border border-[#2a3347] rounded-lg text-sm">Batal</button>
                <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2 bg-red-500 hover:bg-red-400 text-white rounded-lg text-sm font-bold">Hapus</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preview Lampiran Modal */}
      <AnimatePresence>
        {previewLampiran && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={() => setPreviewLampiran(null)}>
            <motion.div initial={{scale:.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.9,opacity:0}}
              className="relative max-w-2xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <button onClick={() => setPreviewLampiran(null)} className="absolute top-2 right-2 bg-black/50 hover:bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center z-10">×</button>
              <img src={previewLampiran} alt="Preview Invoice" className="max-w-full max-h-[90vh] object-contain rounded-xl" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
</div>
  );
}