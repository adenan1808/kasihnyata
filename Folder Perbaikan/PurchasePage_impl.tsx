import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { db } from '../db/database';
import { generateUUID } from '../utils/helpers';
import { exportPurchaseTransactionsCSV } from '../utils/csvExport';
import { printPurchaseInvoice } from '../utils/thermalPrint';
import { compressImage } from '../utils/imageCompressor';
import type { Produk, PurchaseTransaction, PurchaseTransactionItem, StokLog, Supplier } from '../types/local';

type FilterStatus = 'ALL' | 'UNPAID' | 'PARTIAL' | 'PAID';
type PaymentType = 'cash' | 'tempo';
type ProductOption = Produk & { supplierName?: string };

interface InvoiceFormItem extends PurchaseTransactionItem {
  isNewProduct?: boolean;
  deskripsiProduk?: string;
  gambarUrl?: string;
}

interface InvoiceFormState {
  supplierId: string;
  invoiceNumber: string;
  paymentType: PaymentType;
  dueDate: string;
  deskripsiSingkat: string;
  catatan: string;
  gambarUrl: string;
  items: InvoiceFormItem[];
}

// ─── Supplier form (mirrored from SupplierPage) ───────────────────────────────
interface SupplierForm { nama: string; noWA: string; alamat: string; hutang: number; jatuhTempo: string; }
const EMPTY_SUPPLIER_FORM: SupplierForm = { nama: '', noWA: '', alamat: '', hutang: 0, jatuhTempo: '' };

// ─── Produk form (mirrored from ProdukPage) ────────────────────────────────────
interface NewProdukForm {
  nama: string; sku: string; kategori: string; satuan: string;
  hargaModal: number; deskripsi: string; gambarUrl: string;
  markupPersen: number; stokMinimum: number;
}
const EMPTY_PRODUK_FORM: NewProdukForm = {
  nama: '', sku: '', kategori: 'Lainnya', satuan: 'pcs',
  hargaModal: 0, deskripsi: '', gambarUrl: '', markupPersen: 20, stokMinimum: 10,
};

const EMPTY_FORM: InvoiceFormState = {
  supplierId: '',
  invoiceNumber: '',
  paymentType: 'cash',
  dueDate: '',
  deskripsiSingkat: '',
  catatan: '',
  gambarUrl: '',
  items: [],
};

function genInvoice(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-BELI-${ymd}-${rand}`;
}

function formatCurrency(n: number) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function statusLabel(status: PurchaseTransaction['status']) {
  if (status === 'PAID') return 'Lunas';
  if (status === 'PARTIAL') return 'Sebagian';
  return 'Belum Bayar';
}

function paymentTypeLabel(v: PaymentType) {
  return v === 'cash' ? 'Tunai' : 'Tempo';
}

function calcSubtotal(qty: number, hargaBeli: number) {
  return Math.max(0, qty) * Math.max(0, hargaBeli);
}

function StatusBadge({ status }: { status: PurchaseTransaction['status'] }) {
  const cls =
    status === 'PAID'
      ? 'text-green-400 bg-green-500/10 border-green-500/20'
      : status === 'PARTIAL'
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-red-400 bg-red-500/10 border-red-500/20';
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {statusLabel(status)}
    </span>
  );
}

function buildDefaultItem(product?: ProductOption): InvoiceFormItem {
  return {
    produkId: product?.id ?? '',
    namaProduk: product?.nama ?? '',
    skuProduk: product?.sku ?? '',
    qty: 1,
    hargaBeli: product?.hargaModal ?? 0,
    subtotal: calcSubtotal(1, product?.hargaModal ?? 0),
    isNewProduct: false,
    deskripsiProduk: '',
    gambarUrl: '',
  };
}

export default function PurchasePageImpl() {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState<PurchaseTransaction | null>(null);
  const [showPayModal, setShowPayModal] = useState<PurchaseTransaction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PurchaseTransaction | null>(null);
  const [editItem, setEditItem] = useState<PurchaseTransaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [printWidth, setPrintWidth] = useState<'58mm' | '80mm'>('80mm');
  const [barcodeInput, setBarcodeInput] = useState('');

  // ─── Supplier dropdown open/close state ────────────────────────────────────
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);

  // ─── Modal Tambah Supplier (mirrored from SupplierPage) ────────────────────
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(EMPTY_SUPPLIER_FORM);
  const [savingSupplier, setSavingSupplier] = useState(false);

  // ─── Modal Tambah Produk Baru ──────────────────────────────────────────────
  const [showProductModal, setShowProductModal] = useState(false);
  const [productModalRowIndex, setProductModalRowIndex] = useState<number | null>(null);
  const [newProductForm, setNewProductForm] = useState<NewProdukForm>({ ...EMPTY_PRODUK_FORM });
  const [savingProduct, setSavingProduct] = useState(false);

  // ─── Modal Lihat Invoice Image ─────────────────────────────────────────────
  const [showInvoiceImageModal, setShowInvoiceImageModal] = useState(false);
  const [invoiceImageUrl, setInvoiceImageUrl] = useState('');

  const [form, setForm] = useState<InvoiceFormState>({ ...EMPTY_FORM, invoiceNumber: genInvoice(), items: [] });

  const searchRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLSelectElement>(null);
  const dueDateRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

  const suppliers = useLiveQuery<Supplier[]>(() => db.supplier.filter(s => s.isActive).toArray(), []) ?? [];
  const products = useLiveQuery<Produk[]>(() => db.produk.filter(p => p.isActive).toArray(), []) ?? [];
  const rawList = useLiveQuery<PurchaseTransaction[]>(() => db.purchaseTransactions.orderBy('createdAt').reverse().toArray(), []) ?? [];

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers]);
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const productOptions = useMemo<ProductOption[]>(
    () => products.map(p => ({ ...p, supplierName: supplierMap.get(p.supplierId!)?.nama })),
    [products, supplierMap]
  );

  // Products supplied by selected supplier
  const supplierProducts = useMemo<ProductOption[]>(() => {
    if (!form.supplierId) return [];
    return productOptions.filter(p => p.supplierId === form.supplierId);
  }, [productOptions, form.supplierId]);

  const totals = useMemo(() => {
    const total = form.items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    return { total };
  }, [form.items]);

  const list = useMemo(() => {
    let items = rawList;
    if (filterStatus !== 'ALL') items = items.filter(t => t.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(t => {
        const hasItem = (t.items ?? []).some(
          it =>
            it.namaProduk.toLowerCase().includes(q) ||
            (it.skuProduk ?? '').toLowerCase().includes(q) ||
            (it.produkId ?? '').toLowerCase().includes(q)
        );
        return t.invoiceNumber.toLowerCase().includes(q) || (t.supplierNama ?? '').toLowerCase().includes(q) || hasItem;
      });
    }
    return items;
  }, [rawList, filterStatus, search]);

  const stats = useMemo(() => {
    const totalDebt = rawList.filter(t => t.status !== 'PAID').reduce((s, t) => s + t.remainingDebt, 0);
    const unpaidCount = rawList.filter(t => t.status !== 'PAID').length;
    const now = Date.now();
    const overdueCount = rawList.filter(t => t.status !== 'PAID' && t.dueDate && t.dueDate < now).length;
    return { totalDebt, unpaidCount, overdueCount };
  }, [rawList]);

  const warnings = useMemo(() => {
    const now = Date.now();
    return rawList
      .filter(t => t.status !== 'PAID' && t.dueDate)
      .map(t => ({ ...t, sisaHari: Math.ceil(((t.dueDate ?? 0) - now) / 86400000) }))
      .filter(t => t.sisaHari < 7)
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
  }, [rawList]);

  // Close supplier dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target as Node)) {
        setSupplierDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false);
        setShowDetail(null);
        setShowPayModal(null);
        setDeleteConfirm(null);
        setSupplierDropdownOpen(false);
      }
      if (e.key === 'F3') { e.preventDefault(); searchRef.current?.focus(); }
      if (showModal && (e.key === 'F9' || (e.ctrlKey && e.key.toLowerCase() === 's'))) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showModal, form, saving]);

  useEffect(() => {
    if (showModal) setTimeout(() => {}, 40);
  }, [showModal]);

  // When supplier changes, auto-populate items with supplier's products
  useEffect(() => {
    if (!form.supplierId) return;
    const supplierProds = productOptions.filter(p => p.supplierId === form.supplierId);
    if (supplierProds.length === 0) return;

    setForm(prev => {
      const hasRealItems = prev.items.some(it => it.produkId && !it.isNewProduct);
      if (hasRealItems) return prev;
      const newItems = supplierProds.map(p => buildDefaultItem(p));
      return { ...prev, items: newItems };
    });
  }, [form.supplierId]);

  const resetForm = () => {
    setEditItem(null);
    setBarcodeInput('');
    setForm({ ...EMPTY_FORM, invoiceNumber: genInvoice(), items: [] });
  };

  const openAdd = () => { resetForm(); setShowModal(true); };

  const openEdit = (t: PurchaseTransaction) => {
    setEditItem(t);
    setBarcodeInput('');
    setForm({
      supplierId: t.supplierId,
      invoiceNumber: t.invoiceNumber,
      paymentType: t.paymentType,
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '',
      deskripsiSingkat: '',
      catatan: t.catatan ?? '',
      gambarUrl: t.gambarUrl ?? '',
      items: (t.items ?? []).map(item => ({
        ...item,
        subtotal: calcSubtotal(item.qty, item.hargaBeli),
        isNewProduct: false,
        deskripsiProduk: productMap.get(item.produkId)?.deskripsi ?? '',
        gambarUrl: productMap.get(item.produkId)?.gambarUrl ?? '',
      })),
    });
    setShowModal(true);
  };

  const updateForm = <K extends keyof InvoiceFormState>(key: K, value: InvoiceFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const updateItem = (index: number, patch: Partial<InvoiceFormItem>) => {
    setForm(prev => {
      const items = [...prev.items];
      const current = items[index];
      if (!current) return prev;
      const merged = { ...current, ...patch };
      merged.qty = Number(merged.qty || 0);
      merged.hargaBeli = Number(merged.hargaBeli || 0);
      merged.subtotal = calcSubtotal(merged.qty, merged.hargaBeli);
      items[index] = merged;
      return { ...prev, items };
    });
  };

  const removeItem = (index: number) =>
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const handleSelectProduct = (index: number, productId: string) => {
    if (productId === 'NEW') {
      setProductModalRowIndex(index);
      setNewProductForm({ ...EMPTY_PRODUK_FORM });
      setShowProductModal(true);
      return;
    }
    const selected = productOptions.find(p => p.id === productId);
    if (!selected) return;
    updateItem(index, {
      produkId: selected.id,
      namaProduk: selected.nama,
      skuProduk: selected.sku,
      hargaBeli: selected.hargaModal ?? 0,
      isNewProduct: false,
      deskripsiProduk: selected.deskripsi ?? '',
      gambarUrl: selected.gambarUrl ?? '',
    });
    if (!form.supplierId && selected.supplierId) updateForm('supplierId', selected.supplierId);
  };

  // ─── Save new Supplier (mirrored from SupplierPage) ─────────────────────────
  const handleSaveNewSupplier = async () => {
    if (!supplierForm.nama.trim()) { toast.error('Nama supplier wajib diisi'); return; }
    setSavingSupplier(true);
    try {
      const now = Date.now();
      const newId = generateUUID();
      await db.supplier.add({
        id: newId,
        nama: supplierForm.nama.trim(),
        noWA: supplierForm.noWA.trim(),
        alamat: supplierForm.alamat.trim(),
        hutang: Number(supplierForm.hutang) || 0,
        jatuhTempo: supplierForm.jatuhTempo ? new Date(supplierForm.jatuhTempo).getTime() : undefined,
        isActive: true,
        syncStatus: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });
      toast.success(`Supplier "${supplierForm.nama}" berhasil ditambahkan!`);
      // Auto-select the new supplier
      updateForm('supplierId', newId);
      setShowAddSupplierModal(false);
      setSupplierForm(EMPTY_SUPPLIER_FORM);
      setSupplierDropdownOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Gagal menambahkan supplier');
    } finally {
      setSavingSupplier(false);
    }
  };

  // ─── Save new Product (mirrored from ProdukPage) ─────────────────────────────
  const handleSaveNewProduct = async () => {
    if (!newProductForm.nama.trim()) { toast.error('Nama produk wajib diisi'); return; }
    if (!form.supplierId) { toast.error('Pilih supplier terlebih dahulu'); return; }

    setSavingProduct(true);
    try {
      const now = Date.now();
      const sku = newProductForm.sku || `LOC-${Date.now().toString().slice(-6)}`;
      const defaultToko = await db.toko.toCollection().first();
      const defaultGudang = await db.gudang.toCollection().first();

      const newProduct: Produk = {
        id: generateUUID(),
        nama: newProductForm.nama.trim(),
        sku,
        barcode: 'LOC' + Date.now().toString().slice(-9),
        brand: '',
        kategori: newProductForm.kategori,
        satuan: newProductForm.satuan,
        hargaModal: Number(newProductForm.hargaModal),
        markupPersen: Number(newProductForm.markupPersen) || 20,
        hargaJual: Math.round(Number(newProductForm.hargaModal) * (1 + (Number(newProductForm.markupPersen) || 20) / 100)),
        stok: 0,
        stokMinimum: Number(newProductForm.stokMinimum) || 10,
        deskripsi: newProductForm.deskripsi || undefined,
        gambarUrl: newProductForm.gambarUrl || undefined,
        supplierId: form.supplierId,
        tokoId: defaultToko?.id,
        gudangId: defaultGudang?.id,
        isActive: true,
        syncStatus: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };

      await db.produk.add(newProduct);

      // Auto-link to supplierProduk
      await db.supplierProduk.add({
        id: generateUUID(),
        supplierId: form.supplierId,
        produkId: newProduct.id,
        namaProduk: newProduct.nama,
        skuProduk: newProduct.sku,
        hargaBeli: newProduct.hargaModal,
        createdAt: now,
      });

      // Add the new product to the current invoice row
      if (productModalRowIndex !== null) {
        updateItem(productModalRowIndex, {
          produkId: newProduct.id,
          namaProduk: newProduct.nama,
          skuProduk: newProduct.sku,
          hargaBeli: newProduct.hargaModal,
          isNewProduct: false,
          deskripsiProduk: newProduct.deskripsi,
          gambarUrl: newProduct.gambarUrl,
        });
      }

      toast.success('Produk baru berhasil ditambahkan!');
      setShowProductModal(false);
      setNewProductForm({ ...EMPTY_PRODUK_FORM });
      setProductModalRowIndex(null);
    } catch (error) {
      console.error(error);
      toast.error('Gagal menambahkan produk baru');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleNewProductImage = async (file?: File | null) => {
    if (!file) return;
    try {
      let quality = 0.75;
      let result = await compressImage(file, { format: 'webp', quality, maxWidth: 900, maxHeight: 900 });
      while (result.sizeKB > 70 && quality > 0.2) {
        quality -= 0.1;
        const asFile = new File([result.blob], file.name.replace(/\..*/, '.webp'), { type: 'image/webp' });
        result = await compressImage(asFile, { format: 'webp', quality, maxWidth: 900, maxHeight: 900 });
      }
      const reader = new FileReader();
      reader.onload = () => setNewProductForm(prev => ({ ...prev, gambarUrl: String(reader.result) }));
      toast.success(`Gambar dikompres ${result.sizeKB}KB`);
      reader.readAsDataURL(result.blob);
    } catch (error) {
      console.error(error);
      toast.error('Gagal memproses gambar');
    }
  };

  const findProductByBarcode = (value: string) => {
    const code = value.trim().toLowerCase();
    if (!code) return null;
    return productOptions.find(
      p => (p.barcode ?? '').toLowerCase() === code || (p.sku ?? '').toLowerCase() === code
    );
  };

  const addOrMergeProduct = (product: ProductOption) => {
    setForm(prev => {
      const idx = prev.items.findIndex(
        it => it.produkId === product.id && Number(it.hargaBeli) === Number(product.hargaModal ?? 0)
      );
      const items = [...prev.items];
      if (idx >= 0) {
        const current = items[idx];
        const qty = Number(current.qty || 0) + 1;
        items[idx] = { ...current, qty, subtotal: calcSubtotal(qty, Number(current.hargaBeli || product.hargaModal || 0)) };
      } else {
        items.push(buildDefaultItem(product));
      }
      return { ...prev, supplierId: prev.supplierId || product.supplierId || '', items };
    });
  };

  const handleBarcodeSubmit = () => {
    const product = findProductByBarcode(barcodeInput);
    if (!product) { toast.error('Barcode / SKU tidak ditemukan'); return; }
    addOrMergeProduct(product);
    setBarcodeInput('');
    toast.success('Item ditambahkan: ' + product.nama);
  };

  const handleInvoiceItemImage = async (index: number, file?: File | null) => {
    if (!file) return;
    try {
      let quality = 0.75;
      let result = await compressImage(file, { format: 'webp', quality, maxWidth: 900, maxHeight: 900 });
      while (result.sizeKB > 70 && quality > 0.2) {
        quality -= 0.1;
        const asFile = new File([result.blob], file.name.replace(/\..*/, '.webp'), { type: 'image/webp' });
        result = await compressImage(asFile, { format: 'webp', quality, maxWidth: 900, maxHeight: 900 });
      }
      const reader = new FileReader();
      reader.onload = () => updateItem(index, { gambarUrl: String(reader.result), isNewProduct: true });
      toast.success(`Gambar dikompres ${result.sizeKB}KB`);
      reader.readAsDataURL(result.blob);
    } catch (error) {
      console.error(error);
      toast.error('Gagal memproses gambar');
    }
  };

  const handleFormImage = async (file?: File | null) => {
    if (!file) return;
    try {
      let quality = 0.75;
      let result = await compressImage(file, { format: 'webp', quality, maxWidth: 1200, maxHeight: 1600 });
      while (result.sizeKB > 150 && quality > 0.2) {
        quality -= 0.1;
        const asFile = new File([result.blob], file.name.replace(/\..*/, '.webp'), { type: 'image/webp' });
        result = await compressImage(asFile, { format: 'webp', quality, maxWidth: 1200, maxHeight: 1600 });
      }
      const reader = new FileReader();
      reader.onload = () => updateForm('gambarUrl', String(reader.result));
      toast.success(`Foto invoice dikompres ${result.sizeKB}KB`);
      reader.readAsDataURL(result.blob);
    } catch (error) {
      console.error(error);
      toast.error('Gagal memproses gambar');
    }
  };

  const validateForm = () => {
    if (!form.supplierId) { toast.error('Pilih supplier'); return false; }
    if (!form.invoiceNumber.trim()) { toast.error('Nomor invoice wajib diisi'); return false; }
    if (form.paymentType === 'tempo' && !form.dueDate) { toast.error('Tanggal jatuh tempo wajib diisi'); return false; }
    const validItems = form.items.filter(it => it.produkId || it.namaProduk.trim());
    if (validItems.length === 0) { toast.error('Item pembelian wajib ada minimal 1'); return false; }
    for (const item of validItems) {
      if (!item.produkId && !item.namaProduk.trim()) { toast.error('Produk baru wajib isi nama produk'); return false; }
      if (item.qty <= 0) { toast.error(`Qty item "${item.namaProduk}" harus lebih dari 0`); return false; }
      if (item.hargaBeli < 0) { toast.error(`Harga beli item "${item.namaProduk}" tidak valid`); return false; }
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const now = Date.now();
      const supplier = supplierMap.get(form.supplierId);
      const total = totals.total;
      const draftItems = form.items.filter(it => it.produkId || it.namaProduk.trim());

      const normalizedItems: PurchaseTransactionItem[] = draftItems.map(item => ({
        produkId: item.produkId,
        namaProduk: item.namaProduk.trim(),
        skuProduk: item.skuProduk?.trim() ?? '',
        qty: Number(item.qty),
        hargaBeli: Number(item.hargaBeli),
        subtotal: calcSubtotal(item.qty, item.hargaBeli),
      }));

      const nextRemainingDebt = editItem
        ? editItem.status === 'PAID'
          ? 0
          : Math.max(0, editItem.remainingDebt + total - editItem.total)
        : form.paymentType === 'cash'
        ? 0
        : total;

      const nextStatus: PurchaseTransaction['status'] =
        form.paymentType === 'cash'
          ? 'PAID'
          : nextRemainingDebt === 0
          ? 'PAID'
          : editItem && nextRemainingDebt < total
          ? 'PARTIAL'
          : 'UNPAID';

      await db.transaction('rw', db.purchaseTransactions, db.produk, db.stokLog, db.toko, db.gudang, async () => {
        const invoiceId = editItem?.id ?? generateUUID();
        const defaultToko = await db.toko.toCollection().first();
        const defaultGudang = await db.gudang.toCollection().first();

        // Handle new inline products
        for (let i = 0; i < draftItems.length; i += 1) {
          const item = draftItems[i];
          if (item.produkId) continue;
          const nowSeq = Date.now().toString().slice(-6);
          const katKode = 'NEW';
          const nameCode = item.namaProduk.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, 'X');
          const sku = item.skuProduk?.trim() || `${katKode}-${nameCode}-${nowSeq}`;
          const barcode = `NEW${Date.now()}${i}`;
          const newId = generateUUID();
          await db.produk.add({
            id: newId, sku, barcode,
            nama: item.namaProduk.trim(), brand: '', kategori: 'Lainnya',
            gambarUrl: item.gambarUrl || undefined,
            deskripsi: item.deskripsiProduk?.trim() || undefined,
            hargaModal: Number(item.hargaBeli || 0),
            markupPersen: 15,
            hargaJual: Math.round(Number(item.hargaBeli || 0) * 1.15),
            stok: 0, stokMinimum: 5, satuan: 'pcs',
            supplierId: form.supplierId,
            tokoId: defaultToko?.id, gudangId: defaultGudang?.id,
            isActive: true, syncStatus: 'PENDING', createdAt: now, updatedAt: now,
          });
          normalizedItems[i].produkId = newId;
          normalizedItems[i].skuProduk = sku;
        }

        // Rollback old items if editing
        if (editItem?.items?.length) {
          for (const oldItem of editItem.items) {
            const produkLama = await db.produk.get(oldItem.produkId);
            if (!produkLama) continue;
            const stokAfterRollback = Math.max(0, Number(produkLama.stok || 0) - Number(oldItem.qty || 0));
            await db.produk.update(produkLama.id, { stok: stokAfterRollback, updatedAt: now });
            const rollbackLog: StokLog = {
              produkId: produkLama.id, gudangId: produkLama.gudangId, tokoId: produkLama.tokoId,
              type: 'KELUAR', qty: Number(oldItem.qty || 0),
              stokBefore: Number(produkLama.stok || 0), stokAfter: stokAfterRollback,
              referenceId: invoiceId,
              catatan: `Rollback edit invoice pembelian ${form.invoiceNumber.trim()}`,
              userId: 'system', timestamp: now,
            };
            await db.stokLog.add(rollbackLog);
          }
        }

        // Update stock for new items — SYNC with all warehouses
        for (const item of normalizedItems) {
          const produk = await db.produk.get(item.produkId);
          if (!produk) throw new Error(`Produk tidak ditemukan: ${item.namaProduk}`);
          const stokBefore = Number(produk.stok || 0);
          const stokAfter = stokBefore + Number(item.qty || 0);
          await db.produk.update(produk.id, {
            stok: stokAfter,
            hargaModal: Number(item.hargaBeli || 0),
            supplierId: form.supplierId,
            updatedAt: now,
          });
          const stokLog: StokLog = {
            produkId: produk.id, gudangId: produk.gudangId, tokoId: produk.tokoId,
            type: 'MASUK', qty: Number(item.qty || 0),
            stokBefore, stokAfter,
            referenceId: invoiceId,
            catatan: `Invoice pembelian ${form.invoiceNumber.trim()}`,
            userId: 'system', timestamp: now,
          };
          await db.stokLog.add(stokLog);
        }

        const payload: PurchaseTransaction = {
          id: invoiceId,
          supplierId: form.supplierId,
          supplierNama: supplier?.nama ?? '',
          invoiceNumber: form.invoiceNumber.trim(),
          paymentType: form.paymentType,
          dueDate: form.paymentType === 'tempo' && form.dueDate ? new Date(form.dueDate).getTime() : undefined,
          total,
          remainingDebt: nextRemainingDebt,
          status: nextStatus,
          items: normalizedItems,
          catatan: form.catatan.trim() || undefined,
          gambarUrl: form.gambarUrl || undefined,
          createdAt: editItem?.createdAt ?? now,
          updatedAt: now,
        };

        if (editItem) {
          await db.purchaseTransactions.put(payload);
        } else {
          await db.purchaseTransactions.add(payload);
        }
      });

      toast.success(editItem ? 'Invoice pembelian diperbarui' : 'Invoice pembelian disimpan');
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan invoice');
    } finally {
      setSaving(false);
    }
  };

  const handlePayment = async () => {
    if (!showPayModal) return;
    if (payAmount <= 0) { toast.error('Jumlah bayar harus > 0'); return; }
    if (payAmount > showPayModal.remainingDebt) { toast.error('Jumlah bayar melebihi sisa hutang'); return; }
    const newRemaining = Math.max(0, showPayModal.remainingDebt - payAmount);
    const newStatus: PurchaseTransaction['status'] = newRemaining === 0 ? 'PAID' : 'PARTIAL';
    await db.purchaseTransactions.update(showPayModal.id, {
      remainingDebt: newRemaining, status: newStatus, updatedAt: Date.now(),
    });
    toast.success(`Pembayaran ${formatCurrency(payAmount)} dicatat`);
    setShowPayModal(null);
    setPayAmount(0);
  };

  const handleDelete = async (t: PurchaseTransaction) => {
    try {
      await db.transaction('rw', db.purchaseTransactions, db.produk, db.stokLog, async () => {
        for (const item of t.items ?? []) {
          const produk = await db.produk.get(item.produkId);
          if (!produk) continue;
          const stokBefore = Number(produk.stok || 0);
          const stokAfter = Math.max(0, stokBefore - Number(item.qty || 0));
          await db.produk.update(produk.id, { stok: stokAfter, updatedAt: Date.now() });
          await db.stokLog.add({
            produkId: produk.id, gudangId: produk.gudangId, tokoId: produk.tokoId,
            type: 'KELUAR', qty: Number(item.qty || 0),
            stokBefore, stokAfter,
            referenceId: t.id,
            catatan: `Hapus invoice pembelian ${t.invoiceNumber}`,
            userId: 'system', timestamp: Date.now(),
          });
        }
        await db.purchaseTransactions.delete(t.id);
      });
      toast.success('Invoice dihapus');
      setDeleteConfirm(null);
    } catch (error) {
      console.error(error);
      toast.error('Gagal menghapus invoice');
    }
  };

  const handlePrint = (t: PurchaseTransaction, paper: '58mm' | '80mm' = printWidth) =>
    printPurchaseInvoice({
      supplierNama: t.supplierNama ?? t.supplierId,
      invoiceNumber: t.invoiceNumber,
      tanggal: new Date(t.createdAt).toLocaleDateString('id-ID'),
      paymentType: t.paymentType,
      dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString('id-ID') : undefined,
      items: (t.items ?? []).map(i => ({ nama: i.namaProduk, qty: i.qty, hargaBeli: i.hargaBeli, subtotal: i.subtotal })),
      total: t.total,
      remainingDebt: t.remainingDebt,
      status: t.status,
      paperWidth: paper,
    } as any);

  const focusById = (id: string, delay = 0) =>
    window.setTimeout(() => {
      const el = document.getElementById(id) as HTMLElement | null;
      el?.focus();
    }, delay);

  const selectedSupplierName = form.supplierId ? (supplierMap.get(form.supplierId)?.nama ?? '') : '';

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-[#0f1117] text-slate-100">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h1 className="text-lg font-bold flex-1">Pembelian Hutang Supplier</h1>
        <input
          ref={searchRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari invoice, supplier, item..."
          className="input-base w-52"
          onKeyDown={e => e.key === 'Escape' && setSearch('')}
        />
        <select
          value={printWidth}
          onChange={e => setPrintWidth(e.target.value as '58mm' | '80mm')}
          className="px-3 py-2 rounded-lg border border-[#2a3347] bg-[#121826] text-xs text-slate-300"
          title="Default thermal paper"
        >
          <option value="58mm">Thermal 58mm</option>
          <option value="80mm">Thermal 80mm</option>
        </select>
        <button
          onClick={() => exportPurchaseTransactionsCSV(rawList)}
          className="flex items-center gap-1 px-3 py-2 border border-[#2a3347] text-slate-300 hover:text-white rounded-lg text-xs bg-[#121826]"
        >
          Export CSV
        </button>
        <button onClick={openAdd} className="btn-primary">Tambah Invoice</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Total Hutang Aktif', value: formatCurrency(stats.totalDebt), cls: 'text-red-400' },
          { label: 'Invoice Belum Lunas', value: stats.unpaidCount, cls: 'text-amber-400' },
          { label: 'Lewat Jatuh Tempo', value: stats.overdueCount, cls: 'text-orange-400' },
        ].map(s => (
          <div key={s.label} className="bg-[#161b27] border border-[#2a3347] rounded-xl px-4 py-3">
            <p className="text-[11px] text-slate-500">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5">
          <p className="text-xs font-bold text-amber-400 mb-2">⚠ Peringatan Jatuh Tempo</p>
          {warnings.map(w => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-white font-medium">{w.supplierNama}</span>
              <span className="text-slate-400">{w.invoiceNumber}</span>
              <span className="text-amber-400">{formatCurrency(w.remainingDebt)}</span>
              <span className={`${w.sisaHari < 0 ? 'text-red-500' : w.sisaHari < 3 ? 'text-orange-400' : 'text-amber-300'} font-bold`}>
                {w.sisaHari < 0 ? `Lewat ${Math.abs(w.sisaHari)} hari` : `${w.sisaHari} hari lagi`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {(['ALL', 'UNPAID', 'PARTIAL', 'PAID'] as FilterStatus[]).map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg text-xs border transition ${
              filterStatus === status
                ? 'bg-green-500/15 text-green-400 border-green-500/30'
                : 'bg-[#161b27] text-slate-400 border-[#2a3347] hover:text-white'
            }`}
          >
            {status === 'ALL' ? 'Semua' : statusLabel(status as PurchaseTransaction['status'])}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#161b27] border border-[#2a3347] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left">
            <thead className="bg-[#131827] text-[11px] text-slate-400 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">No. Invoice</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Sisa Hutang</th>
                <th className="px-4 py-3">Jatuh Tempo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Lihat Invoice</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.map(t => {
                const overdue = !!t.dueDate && t.status !== 'PAID' && t.dueDate < Date.now();
                const dueSoon = !!t.dueDate && t.status !== 'PAID' && t.dueDate > Date.now() && t.dueDate - Date.now() < 3 * 86400000;
                return (
                  <tr key={t.id} className="border-t border-[#20283a] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <button onClick={() => setShowDetail(t)} className="text-sm font-semibold text-white hover:text-green-400 text-left">
                        {t.invoiceNumber}
                      </button>
                      <div className="text-[11px] text-slate-500 mt-0.5">{new Date(t.createdAt).toLocaleString('id-ID')}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{t.supplierNama}</td>
                    <td className="px-4 py-3 text-xs text-slate-300">{paymentTypeLabel(t.paymentType)}</td>
                    <td className="px-4 py-3 text-xs text-slate-300">{t.items?.length ?? 0} item</td>
                    <td className="px-4 py-3 text-sm font-semibold text-white">{formatCurrency(t.total)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-red-400">
                      {t.remainingDebt > 0 ? formatCurrency(t.remainingDebt) : <span className="text-green-400">Lunas</span>}
                    </td>
                    <td className="px-4 py-3 text-[11px]">
                      {t.dueDate ? (
                        <span className={overdue ? 'text-red-500 font-bold' : dueSoon ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                          {new Date(t.dueDate).toLocaleDateString('id-ID')}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    {/* ─── Kolom Lihat Invoice (foto) ─── */}
                    <td className="px-4 py-3">
                      {(t as any).gambarUrl ? (
                        <button
                          onClick={() => {
                            setInvoiceImageUrl((t as any).gambarUrl || '');
                            setShowInvoiceImageModal(true);
                          }}
                          className="flex items-center gap-1 px-2 py-1.5 text-[10px] border border-blue-500/30 bg-blue-500/5 text-blue-400 rounded-lg hover:bg-blue-500/15 transition"
                        >
                          📷 Lihat
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[10px]">Tidak ada</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {t.status !== 'PAID' && (
                          <button
                            onClick={() => { setShowPayModal(t); setPayAmount(t.remainingDebt); }}
                            className="px-2 py-1 text-[10px] border border-green-500/30 bg-green-500/5 text-green-400 rounded hover:bg-green-500/15"
                          >
                            Bayar
                          </button>
                        )}
                        <button onClick={() => handlePrint(t)} className="px-2 py-1 text-[10px] border border-[#2a3347] rounded bg-[#1e2535] text-slate-300 hover:text-white" title="Cetak thermal">
                          Print
                        </button>
                        <button onClick={() => openEdit(t)} className="px-2 py-1 text-[10px] border border-[#2a3347] rounded bg-[#1e2535] text-slate-300 hover:text-white">
                          Edit
                        </button>
                        <button onClick={() => setDeleteConfirm(t)} className="px-2 py-1 text-[10px] border border-red-500/20 rounded bg-red-500/5 text-red-400 hover:bg-red-500/15">
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <div className="text-4xl mb-3">🧾</div>
            <p className="text-sm">{search || filterStatus !== 'ALL' ? 'Tidak ditemukan' : 'Belum ada transaksi pembelian'}</p>
          </div>
        )}
      </div>

      {/* ─── MODAL TAMBAH/EDIT INVOICE ─── */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-3 md:p-4">
            <motion.div
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              className="relative bg-[radial-gradient(circle_at_top,#12203d_0%,#0b1220_35%,#090d16_100%)] border border-[#243041] rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col shadow-[0_0_40px_rgba(0,140,255,0.12)] backdrop-blur-xl"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-[#243041] flex justify-between items-center shrink-0">
                <div>
                  <h2 className="font-bold text-base text-white">
                    {editItem ? 'Edit Invoice Pembelian' : 'Tambah Invoice Pembelian'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Buat invoice pembelian dari supplier</p>
                </div>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 text-lg leading-none">
                  ×
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                {/* Top fields */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">

                  {/* ─── Supplier — custom dropdown with "+ Supplier Baru" ─── */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Supplier <span className="text-red-400">*</span>
                    </label>
                    <div className="relative flex items-center gap-2" ref={supplierDropdownRef}>
                      {/* Custom dropdown trigger */}
                      <button
                        type="button"
                        onClick={() => setSupplierDropdownOpen(v => !v)}
                        className="flex-1 flex items-center gap-2 input-base text-left h-10 px-3"
                      >
                        <span className="text-slate-500 text-base select-none shrink-0">🏭</span>
                        <span className={`flex-1 truncate text-sm ${form.supplierId ? 'text-white' : 'text-slate-500'}`}>
                          {selectedSupplierName || '- Pilih Supplier -'}
                        </span>
                        <span className="text-slate-500 text-xs shrink-0">▾</span>
                      </button>

                      {/* Clear button — with gap so it doesn't overlap */}
                      {form.supplierId && (
                        <button
                          type="button"
                          onClick={() => updateForm('supplierId', '')}
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-[#2a3347] bg-[#121826] text-slate-400 hover:text-white text-xs"
                          title="Batal pilih"
                          tabIndex={-1}
                        >
                          ×
                        </button>
                      )}

                      {/* Dropdown menu */}
                      <AnimatePresence>
                        {supplierDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="absolute top-full left-0 mt-1 w-full bg-[#161b27] border border-[#2a3347] rounded-xl shadow-xl z-30 overflow-hidden"
                            style={{ minWidth: 220 }}
                          >
                            <div className="max-h-48 overflow-y-auto">
                              {suppliers.map(s => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => { updateForm('supplierId', s.id); setSupplierDropdownOpen(false); }}
                                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-white/5 transition flex items-center gap-2 ${form.supplierId === s.id ? 'text-green-400 bg-green-500/5' : 'text-slate-200'}`}
                                >
                                  <span className="text-slate-500 text-base">🏭</span>
                                  {s.nama}
                                </button>
                              ))}
                            </div>
                            {/* + Supplier Baru */}
                            <div className="border-t border-[#2a3347]">
                              <button
                                type="button"
                                onClick={() => {
                                  setSupplierDropdownOpen(false);
                                  setSupplierForm(EMPTY_SUPPLIER_FORM);
                                  setShowAddSupplierModal(true);
                                }}
                                className="w-full text-left px-3 py-2.5 text-sm text-green-400 hover:bg-green-500/10 transition flex items-center gap-2 font-medium"
                              >
                                <span className="text-lg">＋</span> Supplier Baru
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* No. Invoice */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      No. Invoice <span className="text-red-400">*</span>
                    </label>
                    <input
                      ref={invoiceRef}
                      value={form.invoiceNumber}
                      onChange={e => updateForm('invoiceNumber', e.target.value)}
                      className="input-base"
                      placeholder="INV-BELI-..."
                      onKeyDown={e => e.key === 'Enter' && paymentRef.current?.focus()}
                    />
                  </div>

                  {/* Tipe Pembayaran */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Tipe Pembayaran</label>
                    <select
                      ref={paymentRef}
                      value={form.paymentType}
                      onChange={e => updateForm('paymentType', e.target.value as PaymentType)}
                      className="input-base"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (form.paymentType === 'tempo') dueDateRef.current?.focus();
                          else barcodeRef.current?.focus();
                        }
                      }}
                    >
                      <option value="cash">Tunai (Lunas)</option>
                      <option value="tempo">Tempo Hutang</option>
                    </select>
                  </div>

                  {/* Jatuh Tempo */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Jatuh Tempo{form.paymentType === 'tempo' && <span className="text-red-400"> *</span>}
                    </label>
                    <input
                      ref={dueDateRef}
                      type="date"
                      value={form.dueDate}
                      disabled={form.paymentType !== 'tempo'}
                      onChange={e => updateForm('dueDate', e.target.value)}
                      className="input-base disabled:opacity-40"
                      onKeyDown={e => e.key === 'Enter' && barcodeRef.current?.focus()}
                    />
                  </div>
                </div>

                {/* Barcode Scan */}
                <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-[#101827]/0 to-[#0b1220]/100 shadow-[0_0_25px_rgba(16,185,129,0.08)] p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-slate-300 mr-2 shrink-0">
                      <span className="text-xl">📷</span>
                      <p className="text-sm font-medium">Scan Barcode / Input SKU</p>
                    </div>
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <input
                        ref={barcodeRef}
                        value={barcodeInput}
                        onChange={e => setBarcodeInput(e.target.value)}
                        placeholder="Scan barcode atau ketik SKU lalu tekan Enter"
                        className="input-base flex-1 min-w-0"
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); handleBarcodeSubmit(); }
                        }}
                      />
                      <button
                        onClick={handleBarcodeSubmit}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 text-sm font-medium"
                      >
                        <span className="text-emerald-400">✓</span> Auto add item
                      </button>
                    </div>
                  </div>
                </div>

                {/* ─── Items Table ─── */}
                {!form.supplierId ? (
                  <div className="rounded-2xl border border-dashed border-[#2a3347] bg-[#0b1220] px-6 py-10 text-center">
                    <div className="text-3xl mb-2">🏭</div>
                    <p className="text-slate-400 text-sm">Pilih supplier terlebih dahulu untuk menampilkan produk</p>
                    <p className="text-slate-600 text-xs mt-1">Produk akan otomatis dimuat berdasarkan supplier yang dipilih</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-[#1f2937] rounded-2xl bg-[#0b1220] shadow-[0_0_25px_rgba(0,0,0,0.35)]">
                    <table className="w-full text-sm" style={{ minWidth: 860 }}>
                      <thead className="bg-gradient-to-b from-[#111827]/0 to-[#0b1220]/100 text-[11px] uppercase tracking-wide text-slate-400 border-b border-[#1f2937]">
                        <tr>
                          <th className="px-3 py-3 text-left w-10">No.</th>
                          <th className="px-3 py-3 text-left" style={{ minWidth: 260 }}>Cari Produk</th>
                          <th className="px-3 py-3 text-left" style={{ width: 130 }}>Barcode / SKU</th>
                          {/* Qty — 8 digit */}
                          <th className="px-3 py-3 text-left" style={{ width: 110 }}>Qty (8 digit)</th>
                          {/* Harga Beli — 9 digit */}
                          <th className="px-3 py-3 text-left" style={{ width: 150 }}>Harga Beli (9 digit)</th>
                          {/* Sub Total — auto */}
                          <th className="px-3 py-3 text-left" style={{ width: 160 }}>Sub Total</th>
                          <th className="px-3 py-3 text-left w-12">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.items.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-sm">
                              Produk supplier ditampilkan di sini. Klik "+ Tambah Baris" untuk menambah item.
                            </td>
                          </tr>
                        ) : (
                          form.items.map((item, index) => {
                            const rowKey = item.produkId || `new-${index}`;
                            return (
                              <tr
                                key={rowKey}
                                className={`border-t border-[#182233] transition-all duration-200 hover:bg-cyan-500/[0.04] ${
                                  index % 2 === 0 ? 'bg-[#0b1220]' : 'bg-[#0d1525]'
                                } ${item.isNewProduct ? 'ring-1 ring-cyan-500/10 bg-cyan-500/[0.04]' : ''}`}
                              >
                                {/* No */}
                                <td className="px-3 py-2.5 text-slate-400 text-sm">{index + 1}</td>

                                {/* Produk dropdown — shows supplier products + "+ Produk Baru" */}
                                <td className="px-3 py-2.5">
                                  <select
                                    id={`produk-${index}`}
                                    value={item.produkId || ''}
                                    onChange={e => handleSelectProduct(index, e.target.value)}
                                    className="input-base h-10 text-sm w-full font-medium bg-[#0d1525] border-cyan-500/20 focus:border-cyan-400"
                                    ref={el => { rowRefs.current[rowKey] = el; }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') { e.preventDefault(); focusById(`qty-${index}`); }
                                    }}
                                  >
                                    <option value="">— Cari produk —</option>
                                    <option value="NEW">＋ Produk Baru</option>
                                    {supplierProducts.map(p => (
                                      <option key={p.id} value={p.id}>
                                        {p.nama}{p.sku ? ` · ${p.sku}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                  {item.produkId && (
                                    <div className="text-[10px] text-slate-500 mt-0.5 pl-1">
                                      {productOptions.find(p => p.id === item.produkId)?.kategori ?? ''} · {productOptions.find(p => p.id === item.produkId)?.satuan ?? ''}
                                    </div>
                                  )}
                                  {item.isNewProduct && !item.produkId && (
                                    <input
                                      value={item.namaProduk}
                                      onChange={e => updateItem(index, { namaProduk: e.target.value, isNewProduct: true })}
                                      className="input-base h-9 text-sm font-medium border-cyan-500/20 mt-1.5"
                                      placeholder="Nama produk baru..."
                                    />
                                  )}
                                </td>

                                {/* Barcode/SKU — readonly */}
                                <td className="px-3 py-2.5">
                                  <input
                                    value={item.skuProduk ?? ''}
                                    readOnly
                                    className="input-base h-9 text-sm w-full font-mono bg-[#080c14] text-slate-400 cursor-default border-slate-700/40"
                                    placeholder="—"
                                    title="Terisi otomatis dari SKU produk"
                                    maxLength={12}
                                    style={{ letterSpacing: '0.04em' }}
                                  />
                                </td>

                                {/* QTY — 8 digit max */}
                                <td className="px-3 py-2.5">
                                  <input
                                    id={`qty-${index}`}
                                    type="number"
                                    min={1}
                                    max={99999999}
                                    value={item.qty}
                                    onChange={e => {
                                      const value = Math.max(0, Math.min(99999999, Number(e.target.value || 0)));
                                      updateItem(index, { qty: value });
                                    }}
                                    className="input-base h-9 text-sm w-full text-center"
                                    style={{ maxWidth: 110 }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') { e.preventDefault(); focusById(`harga-${index}`); }
                                    }}
                                  />
                                </td>

                                {/* Harga Beli — 9 digit max, editable */}
                                <td className="px-3 py-2.5">
                                  <input
                                    id={`harga-${index}`}
                                    type="number"
                                    min={0}
                                    max={999999999}
                                    value={item.hargaBeli}
                                    onChange={e => {
                                      const value = Math.max(0, Math.min(999999999, Number(e.target.value || 0)));
                                      updateItem(index, { hargaBeli: value });
                                    }}
                                    className="input-base h-9 text-sm w-full"
                                    style={{ maxWidth: 150 }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') { e.preventDefault(); focusById(`produk-${index + 1}`, 40); }
                                    }}
                                    title="Harga beli dapat diubah langsung"
                                  />
                                </td>

                                {/* Sub Total — Qty × Harga Beli, read-only */}
                                <td className="px-3 py-2.5">
                                  <div
                                    className="h-9 px-3 rounded-lg border border-[#1f2937] bg-[#0b0f1a] text-white flex items-center text-sm font-bold tracking-wide"
                                    style={{ minWidth: 140 }}
                                  >
                                    {formatCurrency(item.subtotal)}
                                  </div>
                                </td>

                                {/* Aksi */}
                                <td className="px-3 py-2.5">
                                  <button
                                    type="button"
                                    onClick={() => removeItem(index)}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/20 text-base"
                                    title="Hapus item"
                                  >
                                    🗑
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Below table actions */}
                {form.supplierId && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-400 text-xs">
                      {form.items.filter(i => i.produkId || i.namaProduk.trim()).length} item
                      <span className="mx-1 text-slate-600">·</span>
                      Total Qty {form.items.reduce((s, i) => s + Number(i.qty || 0), 0)}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setForm(prev => ({
                            ...prev,
                            items: [...prev.items, buildDefaultItem()],
                          }));
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 text-xs"
                      >
                        ＋ Tambah Baris
                      </button>
                      <button
                        type="button"
                        onClick={() => updateForm('items', [])}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs"
                      >
                        🗑 Hapus Semua
                      </button>
                    </div>
                  </div>
                )}

                {/* Bottom: Catatan + Lampiran + Summary */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_240px] gap-4">

                  {/* ─── Catatan (diperpendek) ─── */}
                  <div className="border border-[#252f42] rounded-xl p-3 bg-[#0f1420]">
                    <p className="text-sm font-semibold text-slate-200 mb-2">Catatan</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Deskripsi singkat</label>
                        <div className="relative">
                          <input
                            value={form.deskripsiSingkat}
                            onChange={e => updateForm('deskripsiSingkat', e.target.value.slice(0, 255))}
                            className="input-base pr-10 h-8 text-xs"
                            placeholder="Deskripsi singkat (opsional)"
                            maxLength={255}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-600">
                            {form.deskripsiSingkat.length}/255
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Catatan</label>
                        <div className="relative">
                          <textarea
                            ref={noteRef}
                            value={form.catatan}
                            onChange={e => updateForm('catatan', e.target.value.slice(0, 1000))}
                            className="input-base resize-none pr-10 pb-4 text-xs"
                            style={{ minHeight: 56, maxHeight: 80 }}
                            placeholder="Catatan tambahan (opsional)"
                            maxLength={1000}
                          />
                          <span className="absolute right-2 bottom-2 text-[9px] text-slate-600">
                            {form.catatan.length}/1000
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ─── Lampiran — Foto Invoice ─── */}
                  <div className="border border-[#252f42] rounded-xl p-3 bg-[#0f1420] flex flex-col">
                    <p className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
                      📷 Foto Invoice
                      <span className="text-[10px] text-slate-500 font-normal">(opsional)</span>
                    </p>
                    <p className="text-[10px] text-slate-600 mb-2">Lampirkan foto/scan invoice fisik dari supplier</p>
                    <label className="flex-1 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#252f42] rounded-xl cursor-pointer hover:border-[#3a4a62] hover:bg-white/[0.02] transition min-h-[90px] px-3 py-3 text-center">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={e => handleFormImage(e.target.files?.[0] ?? null)}
                      />
                      {form.gambarUrl ? (
                        <img src={form.gambarUrl} alt="Preview" className="h-16 w-16 rounded-lg object-cover border border-[#2a3347]" />
                      ) : (
                        <>
                          <span className="text-2xl text-slate-500">📄</span>
                          <p className="text-[10px] text-slate-500 leading-relaxed">
                            Klik untuk pilih foto<br />
                            <span className="text-slate-600">JPG, PNG, PDF</span>
                          </p>
                        </>
                      )}
                    </label>
                    {form.gambarUrl && (
                      <button
                        type="button"
                        onClick={() => updateForm('gambarUrl', '')}
                        className="mt-1.5 text-[10px] text-red-400 hover:text-red-300"
                      >
                        × Hapus foto
                      </button>
                    )}
                  </div>

                  {/* ─── Summary ─── */}
                  <div className="border border-[#252f42] rounded-xl p-4 bg-[#0f1420] flex flex-col gap-3">
                    <div className="flex flex-col">
                      <span className="text-slate-400 text-[10px]">Jumlah Item</span>
                      <span className="font-bold text-white text-2xl leading-tight tabular-nums">
                        {form.items.filter(i => i.produkId || i.namaProduk.trim()).length}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-400 text-[10px]">Total Qty</span>
                      <span className="font-bold text-white text-2xl leading-tight tabular-nums">
                        {form.items.reduce((s, i) => s + Number(i.qty || 0), 0)}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-[#252f42] flex flex-col">
                      <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide">Total Invoice</span>
                      <span className="font-extrabold text-[#22c55e] text-xl tracking-tight drop-shadow-[0_0_12px_rgba(34,197,94,0.35)] mt-0.5 tabular-nums break-all">
                        {formatCurrency(totals.total)}
                      </span>
                    </div>
                    {form.paymentType === 'tempo' && (
                      <p className="text-[10px] text-amber-400">Sisa hutang awal mengikuti total invoice.</p>
                    )}
                  </div>
                </div>

                {/* Keyboard tips */}
                <div className="border border-[#252f42] rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-[#0f1420] border-b border-[#252f42] flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">Tips Keyboard</span>
                    {[
                      { key: 'Enter', label: 'Pindah Kolom' },
                      { key: 'Tab', label: 'Pindah Kolom' },
                      { key: 'F9', label: 'Simpan' },
                      { key: 'Esc', label: 'Batal' },
                    ].map(({ key, label }) => (
                      <span key={key} className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-[#1a2235] border border-[#2e3a50] font-mono text-[11px] text-slate-300">{key}</kbd>
                        <span className="text-slate-500">{label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-[#243041] flex gap-3 shrink-0 bg-[#090d16]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-3 border border-[#252f42] rounded-lg text-sm hover:bg-[#1a2235] text-slate-300 font-medium flex items-center gap-2"
                >
                  <kbd className="px-1.5 py-0.5 rounded text-[10px] border border-[#3a4a62] font-mono">Esc</kbd> Batal
                </button>
                <button
                  ref={saveRef}
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 text-white font-bold text-sm hover:from-emerald-500 hover:to-green-400 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  🔒 {saving ? 'Menyimpan...' : 'Simpan Invoice'}
                  <kbd className="px-1.5 py-0.5 rounded text-[10px] border border-white/20 font-mono">Ctrl + S</kbd>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL DETAIL ─── */}
      <AnimatePresence>
        {showDetail && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#161b27] border border-[#2a3347] rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="px-5 py-4 border-b border-[#2a3347] flex justify-between items-center sticky top-0 bg-[#161b27] z-10">
                <div>
                  <h2 className="font-bold text-white">{showDetail.invoiceNumber}</h2>
                  <p className="text-xs text-slate-500">{showDetail.supplierNama}</p>
                </div>
                <button onClick={() => setShowDetail(null)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#101522] border border-[#2a3347] rounded-xl p-4 space-y-2 text-sm">
                    {[
                      { label: 'Status Pembayaran', value: <StatusBadge status={showDetail.status} /> },
                      { label: 'Tipe Pembayaran', value: paymentTypeLabel(showDetail.paymentType) },
                      { label: 'Jatuh Tempo', value: showDetail.dueDate ? new Date(showDetail.dueDate).toLocaleDateString('id-ID') : '—' },
                      { label: 'Catatan', value: showDetail.catatan || '—' },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between">
                        <span className="text-slate-400">{row.label}</span>
                        <span>{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-[#101522] border border-[#2a3347] rounded-xl p-4 space-y-2 text-sm">
                    {[
                      { label: 'Total', value: formatCurrency(showDetail.total) },
                      { label: 'Sisa Hutang', value: <span className="font-semibold text-red-400">{formatCurrency(showDetail.remainingDebt)}</span> },
                      { label: 'Jumlah Item', value: showDetail.items?.length ?? 0 },
                      { label: 'Total Qty', value: (showDetail.items ?? []).reduce((s, i) => s + Number(i.qty || 0), 0) },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between">
                        <span className="text-slate-400">{row.label}</span>
                        <span className="font-semibold">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {(showDetail as any).gambarUrl && (
                  <div className="border border-[#2a3347] rounded-xl p-3 bg-[#0f1420]">
                    <p className="text-xs text-slate-400 mb-2 font-medium">📷 Foto Invoice</p>
                    <img src={(showDetail as any).gambarUrl} alt="Invoice" className="max-w-full max-h-60 object-contain rounded-lg mx-auto block" />
                  </div>
                )}
                <div className="overflow-x-auto border border-[#2a3347] rounded-xl">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="bg-[#111726] text-[11px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-3 text-left">Item Pembelian</th>
                        <th className="px-4 py-3 text-left">SKU</th>
                        <th className="px-4 py-3 text-left">Qty</th>
                        <th className="px-4 py-3 text-left">Harga Beli</th>
                        <th className="px-4 py-3 text-left">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showDetail.items ?? []).map((item, idx) => (
                        <tr key={`${item.produkId}-${idx}`} className="border-t border-[#20283a]">
                          <td className="px-4 py-3">{item.namaProduk}</td>
                          <td className="px-4 py-3 text-slate-400 font-mono text-xs">{item.skuProduk || '—'}</td>
                          <td className="px-4 py-3">{item.qty}</td>
                          <td className="px-4 py-3">{formatCurrency(item.hargaBeli)}</td>
                          <td className="px-4 py-3 font-semibold">{formatCurrency(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="px-5 py-4 border-t border-[#2a3347] flex gap-3">
                <button onClick={() => setShowDetail(null)} className="px-4 py-2 border border-[#252f42] rounded-lg text-sm hover:bg-[#1a2235] text-slate-300">Tutup</button>
                <button onClick={() => { openEdit(showDetail); setShowDetail(null); }} className="px-4 py-2 border border-[#2a3347] rounded-lg text-sm hover:bg-[#1a2235] text-slate-300">Edit</button>
                <button onClick={() => handlePrint(showDetail)} className="px-4 py-2 bg-[#1a2235] rounded-lg text-sm text-white border border-[#2a3347]">Print</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL BAYAR ─── */}
      <AnimatePresence>
        {showPayModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#161b27] border border-[#2a3347] rounded-2xl w-full max-w-sm p-6"
            >
              <h2 className="font-bold text-white mb-1">Catat Pembayaran</h2>
              <p className="text-xs text-slate-400 mb-4">{showPayModal.invoiceNumber} · {showPayModal.supplierNama}</p>
              <p className="text-sm text-slate-400 mb-1">
                Sisa Hutang: <strong className="text-red-400">{formatCurrency(showPayModal.remainingDebt)}</strong>
              </p>
              <input
                type="number"
                min={0}
                max={showPayModal.remainingDebt}
                value={payAmount}
                onChange={e => setPayAmount(Number(e.target.value || 0))}
                className="input-base w-full mb-4"
                placeholder="Jumlah bayar"
                onKeyDown={e => e.key === 'Enter' && handlePayment()}
              />
              <div className="flex gap-3">
                <button onClick={() => setShowPayModal(null)} className="flex-1 py-2.5 border border-[#252f42] rounded-lg text-sm hover:bg-[#1a2235] text-slate-300">Batal</button>
                <button onClick={handlePayment} className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold">Bayar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL HAPUS ─── */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#161b27] border border-red-500/20 rounded-2xl w-full max-w-sm p-6"
            >
              <h2 className="font-bold text-white mb-1">Hapus Invoice?</h2>
              <p className="text-xs text-slate-400 mb-2">{deleteConfirm.invoiceNumber}</p>
              <p className="text-xs text-red-400 mb-6">Stok pembelian dari invoice ini akan di-rollback otomatis.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-[#252f42] rounded-lg text-sm hover:bg-[#1a2235] text-slate-300">Batal</button>
                <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold">Hapus</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL TAMBAH SUPPLIER BARU (mirrored dari SupplierPage) ─── */}
      <AnimatePresence>
        {showAddSupplierModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#161b27] border border-[#2a3347] rounded-2xl w-[440px]"
            >
              <div className="px-5 py-4 border-b border-[#2a3347] flex justify-between items-center">
                <div>
                  <h2 className="font-bold text-white">Tambah Supplier</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Supplier baru akan langsung tersedia di daftar</p>
                </div>
                <button onClick={() => setShowAddSupplierModal(false)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Nama Supplier <span className="text-red-400">*</span></label>
                  <input
                    value={supplierForm.nama}
                    onChange={e => setSupplierForm(f => ({ ...f, nama: e.target.value }))}
                    className="input-base"
                    autoFocus
                    placeholder="Nama supplier..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">No. WhatsApp</label>
                    <input
                      value={supplierForm.noWA}
                      onChange={e => setSupplierForm(f => ({ ...f, noWA: e.target.value }))}
                      type="tel"
                      placeholder="08123..."
                      className="input-base"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Jatuh Tempo</label>
                    <input
                      value={supplierForm.jatuhTempo}
                      onChange={e => setSupplierForm(f => ({ ...f, jatuhTempo: e.target.value }))}
                      type="date"
                      className="input-base"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Alamat</label>
                  <input
                    value={supplierForm.alamat}
                    onChange={e => setSupplierForm(f => ({ ...f, alamat: e.target.value }))}
                    className="input-base"
                    placeholder="Alamat supplier..."
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Nominal Hutang Awal (Rp)</label>
                  <input
                    value={supplierForm.hutang || ''}
                    onChange={e => setSupplierForm(f => ({ ...f, hutang: Number(e.target.value) || 0 }))}
                    type="number"
                    className="input-base"
                    placeholder="0"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setShowAddSupplierModal(false); setSupplierForm(EMPTY_SUPPLIER_FORM); }}
                    className="flex-1 py-2.5 border border-[#2a3347] rounded-lg text-sm hover:bg-[#1e2535] text-slate-300"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveNewSupplier}
                    disabled={savingSupplier}
                    className="flex-1 py-2.5 btn-primary disabled:opacity-50"
                  >
                    {savingSupplier ? 'Menyimpan...' : 'Tambah Supplier'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL TAMBAH PRODUK BARU (mirrored dari ProdukPage) ─── */}
      <AnimatePresence>
        {showProductModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#161b27] border border-[#2a3347] rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto"
            >
              <div className="px-5 py-4 border-b border-[#2a3347] flex justify-between items-center sticky top-0 bg-[#161b27] z-10">
                <div>
                  <h2 className="font-bold text-white">Tambah Produk Baru</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Supplier: <span className="text-green-400">{suppliers.find(s => s.id === form.supplierId)?.nama}</span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowProductModal(false);
                    setNewProductForm({ ...EMPTY_PRODUK_FORM });
                    setProductModalRowIndex(null);
                  }}
                  className="text-slate-400 hover:text-white text-xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="p-5 space-y-3">
                {/* Nama */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Nama Produk <span className="text-red-400">*</span></label>
                  <input
                    value={newProductForm.nama}
                    onChange={e => setNewProductForm(prev => ({ ...prev, nama: e.target.value }))}
                    className="input-base"
                    placeholder="Nama produk..."
                    autoFocus
                  />
                </div>

                {/* SKU + Kategori */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">SKU <span className="text-slate-600 font-normal">(opsional)</span></label>
                    <input
                      value={newProductForm.sku}
                      onChange={e => setNewProductForm(prev => ({ ...prev, sku: e.target.value }))}
                      className="input-base font-mono"
                      placeholder="Auto-generate jika kosong"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Kategori</label>
                    <select
                      value={newProductForm.kategori}
                      onChange={e => setNewProductForm(prev => ({ ...prev, kategori: e.target.value }))}
                      className="input-base"
                    >
                      {['Lainnya','Sembako','Minuman','Makanan','Elektronik','Kebersihan','Kesehatan'].map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Satuan + Markup */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Satuan</label>
                    <input
                      value={newProductForm.satuan}
                      onChange={e => setNewProductForm(prev => ({ ...prev, satuan: e.target.value }))}
                      className="input-base"
                      placeholder="pcs / kg / liter"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Markup (%)</label>
                    <input
                      type="number"
                      min={0}
                      value={newProductForm.markupPersen}
                      onChange={e => setNewProductForm(prev => ({ ...prev, markupPersen: Number(e.target.value) }))}
                      className="input-base"
                    />
                  </div>
                </div>

                {/* Harga */}
                <div className="bg-[#1e2535] rounded-xl p-3 border border-[#2a3347]">
                  <p className="text-xs text-slate-400 font-medium mb-2">💰 Kalkulasi Harga</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Harga Modal (Rp) <span className="text-red-400">*</span></label>
                      <input
                        type="number"
                        min={0}
                        value={newProductForm.hargaModal}
                        onChange={e => setNewProductForm(prev => ({ ...prev, hargaModal: Number(e.target.value) }))}
                        className="input-base"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-green-400 block mb-1">= Harga Jual (auto)</label>
                      <div className="input-base flex items-center text-green-400 font-bold bg-[#0f1420] cursor-default">
                        Rp {Math.round(newProductForm.hargaModal * (1 + (newProductForm.markupPersen || 0) / 100)).toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stok Minimum */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Stok Minimum</label>
                  <input
                    type="number"
                    min={0}
                    value={newProductForm.stokMinimum}
                    onChange={e => setNewProductForm(prev => ({ ...prev, stokMinimum: Number(e.target.value) }))}
                    className="input-base"
                  />
                </div>

                {/* Deskripsi */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Deskripsi</label>
                  <textarea
                    value={newProductForm.deskripsi}
                    onChange={e => setNewProductForm(prev => ({ ...prev, deskripsi: e.target.value }))}
                    className="input-base h-16 resize-none text-xs"
                    placeholder="Deskripsi produk (opsional)"
                  />
                </div>

                {/* Gambar */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Gambar Produk</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleNewProductImage(e.target.files?.[0])}
                    className="input-base text-[11px]"
                  />
                  {newProductForm.gambarUrl && (
                    <div className="mt-2">
                      <img src={newProductForm.gambarUrl} alt="Preview" className="h-20 w-20 object-cover rounded-lg border border-[#2a3347]" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 p-5 pt-0">
                <button
                  onClick={() => {
                    setShowProductModal(false);
                    setNewProductForm({ ...EMPTY_PRODUK_FORM });
                    setProductModalRowIndex(null);
                  }}
                  className="flex-1 py-2.5 border border-[#252f42] rounded-lg text-sm hover:bg-[#1a2235] text-slate-300"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveNewProduct}
                  disabled={savingProduct}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold disabled:opacity-50"
                >
                  {savingProduct ? 'Menyimpan...' : 'Simpan Produk'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL LIHAT FOTO INVOICE ─── */}
      <AnimatePresence>
        {showInvoiceImageModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#161b27] border border-[#2a3347] rounded-2xl w-full max-w-4xl p-6"
            >
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="font-bold text-white">Foto Invoice</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Lampiran foto invoice fisik dari supplier</p>
                </div>
                <button
                  onClick={() => { setShowInvoiceImageModal(false); setInvoiceImageUrl(''); }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 text-lg leading-none"
                >
                  ×
                </button>
              </div>
              <div className="flex justify-center items-center bg-[#0f1420] rounded-xl p-4 min-h-[400px]">
                {invoiceImageUrl ? (
                  <img src={invoiceImageUrl} alt="Invoice" className="max-w-full max-h-[600px] object-contain rounded-lg" />
                ) : (
                  <div className="text-center">
                    <div className="text-4xl mb-3">📷</div>
                    <p className="text-slate-500">Tidak ada gambar invoice</p>
                  </div>
                )}
              </div>
              {invoiceImageUrl && (
                <div className="mt-3 flex justify-center">
                  <a
                    href={invoiceImageUrl}
                    download="invoice.jpg"
                    className="px-4 py-2 border border-[#2a3347] rounded-lg text-sm text-slate-300 hover:text-white hover:bg-[#1a2235] transition"
                  >
                    ↓ Unduh Gambar
                  </a>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
