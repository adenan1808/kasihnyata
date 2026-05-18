import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { db, getSetting } from '../db/database';
import { generateUUID } from '../utils/helpers';
import { useAuthStore } from '../stores';
import type { Produk, Gudang, Toko } from '../types/local';

type TabType = 'stok' | 'transfer' | 'opname';

interface TransferForm {
  produkId: string;
  dariGudangId: string;
  keGudangId: string;
  qty: number;
  catatan: string;
}

interface OpnameItem {
  produkId: string;
  nama: string;
  sku: string;
  stokSistem: number;
  stokFisik: number | '';
  selisih: number;
}

export default function StokPage() {
  const { userId } = useAuthStore();
  const [tab, setTab] = useState<TabType>('stok');
  const [search, setSearch] = useState('');
  const [filterGudang, setFilterGudang] = useState('');
  const [sortCol, setSortCol] = useState<'nama'|'stok'|'kategori'>('nama');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');

  // Transfer state
  const [transferForm, setTransferForm] = useState<TransferForm>({
    produkId: '', dariGudangId: '', keGudangId: '', qty: 1, catatan: ''
  });
  const [transferring, setTransferring] = useState(false);
  const [transferHistory, setTransferHistory] = useState<{
    id: string; produkNama: string; dari: string; ke: string; qty: number; waktu: number; catatan: string;
  }[]>([]);

  // Opname state
  const [opnameGudangId, setOpnameGudangId] = useState('');
  const [opnameItems, setOpnameItems] = useState<OpnameItem[]>([]);
  const [opnameLoaded, setOpnameLoaded] = useState(false);
  const [savingOpname, setSavingOpname] = useState(false);
  const [opnameHistory, setOpnameHistory] = useState<{waktu:number; gudangNama:string; itemCount:number; selisihTotal:number}[]>([]);

  const produkList = useLiveQuery<Produk[]>(() => db.produk.filter(p => p.isActive === true).toArray(), []);
  const gudangList = useLiveQuery<Gudang[]>(() => db.gudang.orderBy('kode').toArray(), []);
  const tokoList = useLiveQuery<Toko[]>(() => db.toko.orderBy('kode').toArray(), []);

  // Filtered stok list
  const stokList: Produk[] = useMemo(() => {
    let items = produkList ?? [];
    if (filterGudang) items = items.filter(p => p.gudangId === filterGudang);
    if (search) { const q = search.toLowerCase(); items = items.filter(p => p.nama.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)); }
    return [...items].sort((a, b) => {
      const va = a[sortCol] ?? 0, vb = b[sortCol] ?? 0;
      const res = typeof va === 'string' ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
      return sortDir === 'asc' ? res : -res;
    });
  }, [produkList, filterGudang, search, sortCol, sortDir]);

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const SI = ({ col }: { col: typeof sortCol }) => (
    <span className="ml-0.5 text-slate-600">{sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
  );

  const stokKritis = (produkList ?? []).filter(p => p.stok < p.stokMinimum);
  const stokHabis = (produkList ?? []).filter(p => p.stok === 0);

  // ─── TRANSFER STOK ─────────────────────────────────────
  const selectedProduk = (produkList ?? []).find(p => p.id === transferForm.produkId);
  const stokDiGudangAsal = selectedProduk && transferForm.dariGudangId
    ? (selectedProduk.gudangId === transferForm.dariGudangId ? selectedProduk.stok : 0)
    : 0;

  const handleTransfer = async () => {
    const { produkId, dariGudangId, keGudangId, qty, catatan } = transferForm;
    if (!produkId) { toast.error('Pilih produk'); return; }
    if (!dariGudangId || !keGudangId) { toast.error('Pilih gudang asal dan tujuan'); return; }
    if (dariGudangId === keGudangId) { toast.error('Gudang asal dan tujuan tidak boleh sama'); return; }
    if (qty <= 0) { toast.error('Jumlah harus lebih dari 0'); return; }
    if (qty > stokDiGudangAsal) { toast.error(`Stok di gudang asal hanya ${stokDiGudangAsal}`); return; }

    setTransferring(true);
    try {
      const produk = await db.produk.where('id').equals(produkId).first();
      if (!produk) { toast.error('Produk tidak ditemukan'); return; }
      if (produk.gudangId !== dariGudangId) { toast.error('Produk tidak ada di gudang asal ini'); return; }

      // Kurangi stok di gudang asal (update gudangId jika full transfer)
      await db.produk.where('id').equals(produkId).modify((p: Produk) => {
        p.stok = Math.max(0, p.stok - qty);
        p.updatedAt = Date.now();
      });

      // Cari atau buat record produk di gudang tujuan
      const produkTujuan = await db.produk
        .filter(p => p.sku === produk.sku && p.gudangId === keGudangId && p.isActive)
        .first();

      if (produkTujuan) {
        await db.produk.where('id').equals(produkTujuan.id).modify((p: Produk) => {
          p.stok = p.stok + qty;
          p.updatedAt = Date.now();
        });
      } else {
        // Buat record baru di gudang tujuan
        await db.produk.add({
          ...produk,
          id: generateUUID(),
          gudangId: keGudangId,
          stok: qty,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          syncStatus: 'PENDING',
        });
      }

      const dariNama = (gudangList ?? []).find(g => g.id === dariGudangId)?.nama || dariGudangId;
      const keNama = (gudangList ?? []).find(g => g.id === keGudangId)?.nama || keGudangId;

      // Catat history
      setTransferHistory(h => [{
        id: generateUUID(), produkNama: produk.nama, dari: dariNama, ke: keNama, qty, waktu: Date.now(), catatan,
      }, ...h.slice(0, 19)]);

      toast.success(`✅ Transfer ${qty} ${produk.satuan} "${produk.nama}" dari ${dariNama} → ${keNama}`);
      setTransferForm(f => ({ ...f, qty: 1, catatan: '' }));
    } catch (e) {
      toast.error('Transfer gagal: ' + String(e));
    } finally {
      setTransferring(false);
    }
  };

  // ─── STOK OPNAME ───────────────────────────────────────
  const loadOpname = async () => {
    if (!opnameGudangId) { toast.error('Pilih gudang terlebih dahulu'); return; }
    const produkDiGudang = (produkList ?? []).filter(p => p.gudangId === opnameGudangId);
    setOpnameItems(produkDiGudang.map(p => ({
      produkId: p.id, nama: p.nama, sku: p.sku,
      stokSistem: p.stok, stokFisik: '', selisih: 0,
    })));
    setOpnameLoaded(true);
    toast.success(`${produkDiGudang.length} produk dimuat untuk opname`);
  };

  const updateFisik = (produkId: string, val: string) => {
    setOpnameItems(items => items.map(i => {
      if (i.produkId !== produkId) return i;
      const fisik = val === '' ? '' : parseInt(val) || 0;
      const selisih = typeof fisik === 'number' ? fisik - i.stokSistem : 0;
      return { ...i, stokFisik: fisik, selisih };
    }));
  };

  const simpanOpname = async () => {
    const edited = opnameItems.filter(i => i.stokFisik !== '' && i.stokFisik !== i.stokSistem);
    if (edited.length === 0) { toast.error('Tidak ada perubahan stok'); return; }
    setSavingOpname(true);
    try {
      const now = Date.now();
      let selisihTotal = 0;
      for (const item of edited) {
        const fisik = typeof item.stokFisik === 'number' ? item.stokFisik : 0;
        await db.produk.where('id').equals(item.produkId).modify((p: Produk) => {
          p.stok = fisik;
          p.updatedAt = now;
        });
        selisihTotal += Math.abs(item.selisih);
      }
      const gudangNama = (gudangList ?? []).find(g => g.id === opnameGudangId)?.nama || '';
      setOpnameHistory(h => [{ waktu: now, gudangNama, itemCount: edited.length, selisihTotal }, ...h.slice(0, 9)]);
      toast.success(`✅ Stok opname selesai: ${edited.length} produk diperbarui`);
      // Refresh
      setOpnameItems(items => items.map(i => ({
        ...i,
        stokSistem: typeof i.stokFisik === 'number' ? i.stokFisik : i.stokSistem,
        stokFisik: '',
        selisih: 0,
      })));
    } finally {
      setSavingOpname(false);
    }
  };

  const TABS = [
    { id: 'stok' as TabType, label: 'Stok', icon: '📦' },
    { id: 'transfer' as TabType, label: 'Transfer Gudang', icon: '🔄' },
    { id: 'opname' as TabType, label: 'Stok Opname', icon: '📋' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-[#0f1117]">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-lg font-bold flex-1">Stok & Gudang</h1>
        <div className="flex items-center gap-2 text-xs">
          <span className="badge badge-red">{stokHabis.length} Habis</span>
          <span className="badge badge-amber">{stokKritis.length} Kritis</span>
          <span className="text-slate-500">{produkList?.length || 0} total</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
              tab === t.id ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-[#2a3347] text-slate-400 hover:text-white hover:border-slate-500'
            }`}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── TAB: STOK ─── */}
      {tab === 'stok' && (
        <>
          {/* Alerts */}
          {(stokHabis.length > 0 || stokKritis.length > 0) && (
            <div className="mb-3 grid grid-cols-2 gap-3">
              {stokHabis.length > 0 && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-xs text-red-400 font-semibold mb-2">🔴 Stok Habis ({stokHabis.length} produk)</p>
                  {stokHabis.slice(0, 4).map(p => (
                    <div key={p.id} className="text-[10px] text-slate-400 py-0.5 border-b border-red-500/10 truncate">{p.nama}</div>
                  ))}
                  {stokHabis.length > 4 && <p className="text-[10px] text-red-400 mt-1">+{stokHabis.length - 4} lainnya</p>}
                </div>
              )}
              {stokKritis.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-xs text-amber-400 font-semibold mb-2">🟡 Stok Kritis ({stokKritis.length} produk)</p>
                  {stokKritis.slice(0, 4).map(p => (
                    <div key={p.id} className="text-[10px] text-slate-400 py-0.5 border-b border-amber-500/10 flex justify-between">
                      <span className="truncate mr-2">{p.nama}</span>
                      <span className="text-amber-400 font-bold flex-shrink-0">{p.stok}/{p.stokMinimum}</span>
                    </div>
                  ))}
                  {stokKritis.length > 4 && <p className="text-[10px] text-amber-400 mt-1">+{stokKritis.length - 4} lainnya</p>}
                </div>
              )}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 mb-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari produk..." className="input-base w-48" />
            <select value={filterGudang} onChange={e => setFilterGudang(e.target.value)} className="input-base w-44">
              <option value="">Semua Gudang</option>
              {(gudangList ?? []).map(g => <option key={g.id} value={g.id}>{g.kode} - {g.nama}</option>)}
            </select>
            <span className="text-xs text-slate-500 ml-auto">{stokList.length} produk</span>
          </div>

          {/* Stok Table */}
          <div className="table-container overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead><tr className="border-b border-[#2a3347]">
                <th className="th cursor-pointer" onClick={() => toggleSort('nama')}>Produk <SI col="nama" /></th>
                <th className="th cursor-pointer" onClick={() => toggleSort('kategori')}>Kategori <SI col="kategori" /></th>
                <th className="th">Gudang</th>
                <th className="th cursor-pointer" onClick={() => toggleSort('stok')}>Stok <SI col="stok" /></th>
                <th className="th">Min</th>
                <th className="th">Status</th>
                <th className="th">H. Jual</th>
              </tr></thead>
              <tbody>
                {stokList.map(p => {
                  const gudang = (gudangList ?? []).find(g => g.id === p.gudangId);
                  const st = p.stok === 0 ? 'habis' : p.stok < p.stokMinimum ? 'kritis' : 'aman';
                  return (
                    <tr key={p.id} className={`tr ${st === 'habis' ? 'bg-red-500/5' : st === 'kritis' ? 'bg-amber-500/5' : ''}`}>
                      <td className="td">
                        <div className="font-medium text-xs">{p.nama}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{p.sku}</div>
                      </td>
                      <td className="td"><span className="badge badge-blue text-[9px]">{p.kategori}</span></td>
                      <td className="td text-[10px] text-slate-400">{gudang ? `${gudang.kode} - ${gudang.nama}` : '—'}</td>
                      <td className="td">
                        <span className={`text-sm font-bold ${p.stok === 0 ? 'text-red-500' : p.stok < p.stokMinimum ? 'text-amber-400' : 'text-green-400'}`}>
                          {p.stok}
                        </span>
                        <span className="text-[10px] text-slate-600 ml-1">{p.satuan}</span>
                      </td>
                      <td className="td text-[11px] text-slate-400">{p.stokMinimum}</td>
                      <td className="td">
                        {st === 'habis' && <span className="badge badge-red">Habis</span>}
                        {st === 'kritis' && <span className="badge badge-amber">Kritis</span>}
                        {st === 'aman' && <span className="badge badge-green">Aman</span>}
                      </td>
                      <td className="td text-xs text-green-400">Rp {p.hargaJual.toLocaleString('id-ID')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {stokList.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <div className="text-4xl mb-3">📦</div>
                <p className="text-sm">{search || filterGudang ? 'Produk tidak ditemukan' : 'Belum ada data stok'}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── TAB: TRANSFER ─── */}
      {tab === 'transfer' && (
        <div className="grid grid-cols-2 gap-4">
          {/* Form */}
          <div className="bg-[#1a2032] border border-[#2a3347] rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
              🔄 Transfer Stok Antar Gudang
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Produk *</label>
                <select value={transferForm.produkId} onChange={e => setTransferForm(f => ({ ...f, produkId: e.target.value }))}
                  className="input-base">
                  <option value="">— Pilih Produk —</option>
                  {(produkList ?? []).map(p => (
                    <option key={p.id} value={p.id}>{p.nama} (Stok: {p.stok} {p.satuan})</option>
                  ))}
                </select>
                {selectedProduk && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    SKU: {selectedProduk.sku} · Stok: <span className="text-green-400 font-bold">{selectedProduk.stok} {selectedProduk.satuan}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Dari Gudang *</label>
                  <select value={transferForm.dariGudangId} onChange={e => setTransferForm(f => ({ ...f, dariGudangId: e.target.value }))}
                    className="input-base">
                    <option value="">— Asal —</option>
                    {(gudangList ?? []).map(g => <option key={g.id} value={g.id}>{g.kode} - {g.nama}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Ke Gudang *</label>
                  <select value={transferForm.keGudangId} onChange={e => setTransferForm(f => ({ ...f, keGudangId: e.target.value }))}
                    className="input-base">
                    <option value="">— Tujuan —</option>
                    {(gudangList ?? []).filter(g => g.id !== transferForm.dariGudangId).map(g => (
                      <option key={g.id} value={g.id}>{g.kode} - {g.nama}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Jumlah * {stokDiGudangAsal > 0 && <span className="text-green-400">(maks: {stokDiGudangAsal})</span>}
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setTransferForm(f => ({ ...f, qty: Math.max(1, f.qty - 1) }))}
                    className="w-8 h-8 rounded border border-[#2a3347] bg-[#1e2535] text-slate-400 hover:text-white flex items-center justify-center text-lg font-bold">−</button>
                  <input type="number" value={transferForm.qty} min={1} max={stokDiGudangAsal || 9999}
                    onChange={e => setTransferForm(f => ({ ...f, qty: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="input-base text-center text-lg font-bold flex-1" />
                  <button onClick={() => setTransferForm(f => ({ ...f, qty: Math.min(stokDiGudangAsal || 9999, f.qty + 1) }))}
                    className="w-8 h-8 rounded border border-[#2a3347] bg-[#1e2535] text-slate-400 hover:text-white flex items-center justify-center text-lg font-bold">+</button>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Catatan</label>
                <input value={transferForm.catatan} onChange={e => setTransferForm(f => ({ ...f, catatan: e.target.value }))}
                  placeholder="Alasan transfer..." className="input-base" />
              </div>

              {transferForm.produkId && transferForm.dariGudangId && transferForm.keGudangId && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-xs text-green-400 font-medium">Preview Transfer:</p>
                  <p className="text-sm text-white mt-0.5">
                    <span className="font-bold">{transferForm.qty} {selectedProduk?.satuan}</span>
                    <span className="text-slate-400 mx-2">"{selectedProduk?.nama}"</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {(gudangList ?? []).find(g => g.id === transferForm.dariGudangId)?.nama}
                    <span className="text-green-400 mx-2">→</span>
                    {(gudangList ?? []).find(g => g.id === transferForm.keGudangId)?.nama}
                  </p>
                </div>
              )}

              <button onClick={handleTransfer} disabled={transferring}
                className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all">
                {transferring ? (
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : '🔄'}
                {transferring ? 'Memproses...' : 'Proses Transfer'}
              </button>
            </div>
          </div>

          {/* History */}
          <div className="bg-[#1a2032] border border-[#2a3347] rounded-xl p-4">
            <h3 className="font-semibold text-sm mb-3">Riwayat Transfer</h3>
            {transferHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-600">
                <p className="text-2xl mb-2">📋</p>
                <p className="text-xs">Belum ada transfer</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {transferHistory.map(h => (
                  <div key={h.id} className="p-3 bg-[#1e2535] rounded-lg border border-[#2a3347]">
                    <div className="flex justify-between items-start">
                      <p className="text-xs font-semibold text-white truncate flex-1 mr-2">{h.produkNama}</p>
                      <span className="badge badge-green text-[9px] flex-shrink-0">{h.qty} pcs</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {h.dari} <span className="text-green-400">→</span> {h.ke}
                    </p>
                    {h.catatan && <p className="text-[10px] text-slate-500 italic">"{h.catatan}"</p>}
                    <p className="text-[9px] text-slate-600 mt-1">{new Date(h.waktu).toLocaleString('id-ID')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: OPNAME ─── */}
      {tab === 'opname' && (
        <div className="space-y-4">
          {/* Setup */}
          <div className="bg-[#1a2032] border border-[#2a3347] rounded-xl p-4">
            <h3 className="font-semibold text-sm mb-3">📋 Stok Opname</h3>
            <p className="text-xs text-slate-500 mb-3">Bandingkan stok sistem vs stok fisik di gudang. Perbedaan akan diperbarui otomatis.</p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-400 block mb-1">Pilih Gudang *</label>
                <select value={opnameGudangId} onChange={e => { setOpnameGudangId(e.target.value); setOpnameLoaded(false); setOpnameItems([]); }}
                  className="input-base">
                  <option value="">— Pilih Gudang —</option>
                  {(gudangList ?? []).map(g => {
                    const toko = (tokoList ?? []).find(t => t.id === g.tokoId);
                    return <option key={g.id} value={g.id}>{g.kode} - {g.nama} ({toko?.kode || '?'})</option>;
                  })}
                </select>
              </div>
              <button onClick={loadOpname} disabled={!opnameGudangId}
                className="btn-primary px-5 py-2.5 disabled:opacity-40">Muat Data</button>
              {opnameLoaded && opnameItems.length > 0 && (
                <button onClick={simpanOpname} disabled={savingOpname}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-sm disabled:opacity-40">
                  {savingOpname ? 'Menyimpan...' : 'Simpan Opname'}
                </button>
              )}
            </div>
          </div>

          {/* Opname Table */}
          {opnameLoaded && (
            <div className="bg-[#1a2032] border border-[#2a3347] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2a3347] flex justify-between items-center">
                <h3 className="font-semibold text-sm">
                  {opnameItems.length} Produk · Gudang: {(gudangList ?? []).find(g => g.id === opnameGudangId)?.nama}
                </h3>
                <span className="text-xs text-slate-500">
                  {opnameItems.filter(i => i.stokFisik !== '').length} sudah diisi
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-[#2a3347]">
                    <th className="th">Produk</th>
                    <th className="th text-center">Stok Sistem</th>
                    <th className="th text-center">Stok Fisik *</th>
                    <th className="th text-center">Selisih</th>
                    <th className="th text-center">Status</th>
                  </tr></thead>
                  <tbody>
                    {opnameItems.map(item => {
                      const hasData = item.stokFisik !== '';
                      const selisih = hasData ? (item.stokFisik as number) - item.stokSistem : 0;
                      return (
                        <tr key={item.produkId} className={`tr ${hasData && selisih !== 0 ? 'bg-amber-500/5' : ''}`}>
                          <td className="td">
                            <div className="font-medium text-xs">{item.nama}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{item.sku}</div>
                          </td>
                          <td className="td text-center">
                            <span className={`text-sm font-bold ${item.stokSistem === 0 ? 'text-red-400' : item.stokSistem < 10 ? 'text-amber-400' : 'text-green-400'}`}>
                              {item.stokSistem}
                            </span>
                          </td>
                          <td className="td text-center">
                            <input
                              type="number" min={0}
                              value={item.stokFisik}
                              onChange={e => updateFisik(item.produkId, e.target.value)}
                              placeholder="—"
                              className={`w-20 px-2 py-1 text-center bg-[#1e2535] border rounded text-sm font-bold outline-none focus:border-green-500 ${
                                hasData && selisih !== 0 ? 'border-amber-500/50 text-amber-400' : 'border-[#2a3347] text-white'
                              }`}
                            />
                          </td>
                          <td className="td text-center">
                            {hasData ? (
                              <span className={`text-sm font-bold ${selisih > 0 ? 'text-green-400' : selisih < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                {selisih > 0 ? '+' : ''}{selisih}
                              </span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="td text-center">
                            {!hasData && <span className="text-slate-600 text-[10px]">Belum diisi</span>}
                            {hasData && selisih === 0 && <span className="badge badge-green text-[9px]">✓ Cocok</span>}
                            {hasData && selisih > 0 && <span className="badge badge-blue text-[9px]">↑ Lebih</span>}
                            {hasData && selisih < 0 && <span className="badge badge-red text-[9px]">↓ Kurang</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {opnameItems.some(i => i.stokFisik !== '' && i.stokFisik !== i.stokSistem) && (
                <div className="p-4 border-t border-[#2a3347] bg-amber-500/5">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-slate-400">
                      <span className="text-amber-400 font-bold">{opnameItems.filter(i => i.stokFisik !== '' && i.stokFisik !== i.stokSistem).length}</span> produk berbeda dari sistem
                    </div>
                    <button onClick={simpanOpname} disabled={savingOpname}
                      className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-sm disabled:opacity-40">
                      {savingOpname ? 'Menyimpan...' : '💾 Simpan & Update Stok'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Opname History */}
          {opnameHistory.length > 0 && (
            <div className="bg-[#1a2032] border border-[#2a3347] rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-3">Riwayat Opname</h3>
              <div className="space-y-2">
                {opnameHistory.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-[#1e2535]">
                    <span className="text-lg">📋</span>
                    <div className="flex-1">
                      <p className="text-xs font-medium">{h.gudangNama}</p>
                      <p className="text-[10px] text-slate-500">{h.itemCount} produk diperbarui · Selisih total: {h.selisihTotal}</p>
                    </div>
                    <span className="text-[10px] text-slate-600">{new Date(h.waktu).toLocaleString('id-ID', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
