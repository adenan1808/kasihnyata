import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { db, getSetting } from '../db/database';
import { generateUUID } from '../utils/helpers';
import type { Produk, Kategori, Supplier, Gudang } from '../types/local';
import { compressToBase64 } from '../utils/imageCompressor';
import { exportProductsCSV } from '../utils/csvExport';
import CSVImportModal from '../components/ui/CSVImportModal';

const EMOJI: Record<string, string> = { Sembako:'🛒',Minuman:'🧃',Makanan:'🍜',Elektronik:'📱',Kebersihan:'🧴',Kesehatan:'💊',Lainnya:'📦' };

// SKU format: XXX-XXXX-123456
function parseSKU(sku: string) {
  const parts = sku.split('-');
  if (parts.length === 3) return { kodeKat: parts[0], kodeNama: parts[1], nomorUrut: parts[2] };
  return { kodeKat: '', kodeNama: '', nomorUrut: '' };
}
function buildSKU(kodeKat: string, kodeNama: string, nomorUrut: string) {
  const kat = kodeKat.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3).padEnd(3,'X');
  const nama = kodeNama.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4).padEnd(4,'X');
  const seq = nomorUrut.replace(/\D/g,'').padStart(6,'0') || '000001';
  return `${kat}-${nama}-${seq}`;
}
function generateLocalBarcode() {
  return 'LOC' + Date.now().toString().slice(-9);
}

interface ProdukForm {
  nama: string; brand: string; kategoriId: string;
  skuKat: string; skuNama: string; skuUrut: string;
  barcode: string; supplierId: string;
  hargaModal: number; markupPersen: number; hargaJual: number;
  stok: number; stokMinimum: number; satuan: string;
}

type SortCol = 'nama'|'kategori'|'hargaJual'|'stok'|'updatedAt';

export default function ProdukPage() {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('nama');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');
  const [showModal, setShowModal] = useState(false);
  const [editProduk, setEditProduk] = useState<Produk|null>(null);
  const [saving, setSaving] = useState(false);
  const [imageB64, setImageB64] = useState('');
  const [showImport, setShowImport] = useState(false);
  // Kategori manager
  const [showKatModal, setShowKatModal] = useState(false);
  const [editKat, setEditKat] = useState<Kategori|null>(null);
  const [katForm, setKatForm] = useState({ nama:'', kode:'', warna:'#22c55e' });
  const [savingKat, setSavingKat] = useState(false);
  // Scanner mode for form fields
  const [scanField, setScanField] = useState<'barcode'|'sku'|null>(null);
  const scanBuf = useRef('');
  const scanTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const { register, handleSubmit, watch, setValue, reset, formState:{ errors } } = useForm<ProdukForm>({
    defaultValues:{ stok:0, stokMinimum:10, satuan:'pcs', markupPersen:20, skuKat:'', skuNama:'', skuUrut:'' }
  });
  const modal = watch('hargaModal');
  const markup = watch('markupPersen');
  const skuKat = watch('skuKat');
  const skuNama = watch('skuNama');
  const skuUrut = watch('skuUrut');

  // Auto harga jual
  useEffect(() => {
    if (modal > 0 && markup >= 0) setValue('hargaJual', Math.round(modal*(1+markup/100)));
  }, [modal, markup, setValue]);

  // SKU preview
  const skuPreview = skuKat || skuNama || skuUrut ? buildSKU(skuKat, skuNama, skuUrut) : '';

  const kategoriList = useLiveQuery<Kategori[]>(()=>db.kategori.orderBy('nama').toArray(),[]);
  const supplierList = useLiveQuery<Supplier[]>(()=>db.supplier.filter(s=>s.isActive===true).toArray(),[]);

  const gudangList = useLiveQuery<Gudang[]>(()=>db.gudang.orderBy('kode').toArray(),[]);

  const rawList = useLiveQuery<Produk[]>(()=>db.produk.filter(p=>p.isActive===true).toArray(),[]);

  const produkList: Produk[] = useMemo(()=>{
    let items = rawList??[];
    if (catFilter) items=items.filter(p=>p.kategori===catFilter);
    if (search) { const q=search.toLowerCase(); items=items.filter(p=>p.nama.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q)||(p.barcode||'').includes(q)); }
    return [...items].sort((a,b)=>{
      const va=a[sortCol]??0, vb=b[sortCol]??0;
      const res=typeof va==='string'?va.localeCompare(String(vb)):(va as number)-(vb as number);
      return sortDir==='asc'?res:-res;
    });
  },[rawList,catFilter,search,sortCol,sortDir]);

  const toggleSort=(col:SortCol)=>{ if(sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc'); else{ setSortCol(col); setSortDir('asc'); } };
  const SI=({col}:{col:SortCol})=><span className="ml-0.5 text-slate-600">{sortCol===col?(sortDir==='asc'?'↑':'↓'):'↕'}</span>;

  // Global barcode scanner for form fields
  const handleScannerInput = useCallback((e: KeyboardEvent)=>{
    if (!scanField) return;
    if (e.key==='Enter' && scanBuf.current.length>2) {
      const val = scanBuf.current;
      if (scanField==='barcode') { setValue('barcode', val); toast.success('Barcode di-scan: '+val); }
      else if (scanField==='sku') {
        const p = parseSKU(val);
        setValue('skuKat', p.kodeKat); setValue('skuNama', p.kodeNama); setValue('skuUrut', p.nomorUrut);
        toast.success('SKU di-scan: '+val);
      }
      scanBuf.current=''; setScanField(null); return;
    }
    if (e.key.length===1) {
      if (scanTimer.current) clearTimeout(scanTimer.current);
      scanBuf.current += e.key;
      scanTimer.current = setTimeout(()=>{ scanBuf.current=''; }, 200);
    }
  },[scanField, setValue]);

  useEffect(()=>{ window.addEventListener('keydown', handleScannerInput); return ()=>window.removeEventListener('keydown', handleScannerInput); },[handleScannerInput]);

  const handleImage=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const tid=toast.loading('Mengkompresi gambar...');
    const b64=await compressToBase64(file,{maxWidth:720,quality:0.6,format:'webp'});
    toast.dismiss(tid); setImageB64(b64); toast.success('Gambar dikompresi!');
  };

  const getNextUrut = async()=>{
    const count = await db.produk.count();
    return String(count+1).padStart(6,'0');
  };

  const openAdd=async()=>{
    setEditProduk(null);
    const urut = await getNextUrut();
    const kat = kategoriList?.[0];
    reset({ stok:0,stokMinimum:10,satuan:'pcs',markupPersen:20,
      kategoriId:kat?.id||'', skuKat:kat?.kode||'', skuNama:'', skuUrut:urut,
      hargaModal:0, hargaJual:0, barcode:'', supplierId:'' });
    setImageB64(''); setShowModal(true);
  };

  const openEdit=(p:Produk)=>{
    setEditProduk(p);
    const parsed = parseSKU(p.sku);
    const kat = (kategoriList??[]).find(k=>k.nama===p.kategori);
    reset({ nama:p.nama, brand:p.brand, kategoriId:kat?.id||'',
      skuKat:parsed.kodeKat, skuNama:parsed.kodeNama, skuUrut:parsed.nomorUrut,
      barcode:p.barcode, supplierId:p.supplierId||'',
      hargaModal:p.hargaModal, markupPersen:p.markupPersen, hargaJual:p.hargaJual,
      stok:p.stok, stokMinimum:p.stokMinimum, satuan:p.satuan });
    setImageB64(p.gambarUrl||''); setShowModal(true);
  };

  const onSubmit=async(data:ProdukForm)=>{
    setSaving(true);
    try {
      const kat=(kategoriList??[]).find(k=>k.id===data.kategoriId);
      const sku = buildSKU(data.skuKat||kat?.kode||'LNY', data.skuNama||data.nama.slice(0,4), data.skuUrut||await getNextUrut());
      const barcode = data.barcode.trim() || generateLocalBarcode();
      if (!editProduk) {
        const ex=await db.produk.where('sku').equals(sku).first();
        if(ex){ toast.error('SKU sudah digunakan: '+sku); return; }
      }
      const tokoId=(await getSetting('tokoId'))||'';
      const gudangId=(await getSetting('gudangId'))||'';
      const now=Date.now();
      const produkData={
        ...data, kategori:kat?.nama||'Lainnya', sku, barcode,
        gambarUrl:imageB64||undefined,
        isActive:true, syncStatus:'PENDING' as const,
        tokoId, gudangId2: gudangId, updatedAt:now,
      };
      if(editProduk){
        await db.produk.where('id').equals(editProduk.id).modify({...produkData});
        // Update supplierProduk nama jika ada
        if(data.supplierId) {
          await db.produk.where('id').equals(editProduk.id).modify({ supplierId: data.supplierId });
        }
        toast.success('Produk diperbarui!');
      } else {
        await db.produk.add({ id:generateUUID(), createdAt:now, ...produkData });
        // Auto-link to supplier
        if(data.supplierId) {
          await db.supplierProduk.add({ id:generateUUID(), supplierId:data.supplierId, produkId:generateUUID(),
            namaProduk:data.nama, skuProduk:sku, hargaBeli:data.hargaModal, createdAt:now });
        }
        toast.success('Produk ditambahkan!');
      }
      setShowModal(false); reset(); setImageB64(''); setEditProduk(null);
    } finally { setSaving(false); }
  };

  const handleDelete=async(p:Produk)=>{
    if(!confirm(`Nonaktifkan "${p.nama}"?`)) return;
    await db.produk.where('id').equals(p.id).modify({isActive:false});
    toast.success('Produk dinonaktifkan');
  };

  // Kategori CRUD
  const openAddKat=()=>{ setEditKat(null); setKatForm({nama:'',kode:'',warna:'#22c55e'}); setShowKatModal(true); };
  const openEditKat=(k:Kategori)=>{ setEditKat(k); setKatForm({nama:k.nama,kode:k.kode,warna:k.warna||'#22c55e'}); setShowKatModal(true); };
  const saveKategori=async()=>{
    if(!katForm.nama.trim()){ toast.error('Nama wajib'); return; }
    setSavingKat(true);
    try {
      const now=Date.now();
      const kode=katForm.kode.trim().toUpperCase().slice(0,3)||katForm.nama.slice(0,3).toUpperCase();
      if(editKat){ await db.kategori.where('id').equals(editKat.id).modify({nama:katForm.nama.trim(),kode,warna:katForm.warna,updatedAt:now}); toast.success('Diperbarui!'); }
      else {
        const ex=await db.kategori.where('nama').equals(katForm.nama.trim()).first();
        if(ex){ toast.error('Sudah ada!'); return; }
        await db.kategori.add({id:generateUUID(),nama:katForm.nama.trim(),kode,warna:katForm.warna,createdAt:now,updatedAt:now});
        toast.success('Kategori ditambahkan!');
      }
      setShowKatModal(false); setEditKat(null);
    } finally { setSavingKat(false); }
  };
  const deleteKategori=async(k:Kategori)=>{
    const c=await db.produk.filter(p=>p.kategori===k.nama&&p.isActive).count();
    if(c>0){ toast.error(`Ada ${c} produk di kategori ini!`); return; }
    if(!confirm(`Hapus kategori "${k.nama}"?`)) return;
    await db.kategori.where('id').equals(k.id).delete(); toast.success('Dihapus');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-[#0f1117]">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h1 className="text-lg font-bold flex-1">Manajemen Produk</h1>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari produk, SKU, barcode..." className="input-base w-44"/>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} className="input-base w-36">
          <option value="">Semua Kategori</option>
          {(kategoriList??[]).map(c=><option key={c.id} value={c.nama}>{c.nama}</option>)}
        </select>
        <button onClick={openAddKat} className="flex items-center gap-1 px-3 py-1.5 border border-[#2a3347] text-slate-400 hover:text-white hover:border-slate-500 rounded-lg text-xs">
          🏷️ Kategori ({kategoriList?.length??0})
        </button>
        <span className="text-xs text-slate-500">{produkList.length} produk</span>
        <button onClick={() => exportProductsCSV(produkList)}
          className="flex items-center gap-1 px-3 py-1.5 border border-[#2a3347] text-slate-400 hover:text-white hover:border-slate-500 rounded-lg text-xs">
          ↓ Export CSV
        </button>
        <button onClick={() => setShowImport(true)}
          className="flex items-center gap-1 px-3 py-1.5 border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 rounded-lg text-xs">
          ↑ Import CSV
        </button>
        <button onClick={openAdd} className="btn-primary">+ Tambah Produk</button>
      </div>

      <div className="table-container overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead><tr className="border-b border-[#2a3347]">
            <th className="th w-10">Img</th>
            <th className="th">SKU</th>
            <th className="th cursor-pointer" onClick={()=>toggleSort('nama')}>Nama <SI col="nama"/></th>
            <th className="th cursor-pointer" onClick={()=>toggleSort('kategori')}>Kategori <SI col="kategori"/></th>
            <th className="th">Supplier</th>
            <th className="th">Gudang Utama</th>
            <th className="th">Gudang Kedua</th>
            <th className="th">H. Modal</th>
            <th className="th cursor-pointer" onClick={()=>toggleSort('hargaJual')}>H. Jual <SI col="hargaJual"/></th>
            <th className="th cursor-pointer" onClick={()=>toggleSort('stok')}>Stok <SI col="stok"/></th>
            <th className="th">Aksi</th>
          </tr></thead>
          <tbody>
            {produkList.map(p=>{
              const stCls=p.stok===0?'badge-red':p.stok<5?'badge-red':p.stok<p.stokMinimum?'badge-amber':'badge-green';
              const stLabel=p.stok===0?'Habis':p.stok<p.stokMinimum?`${p.stok}⚠`:`${p.stok}`;
              const katColor=(kategoriList??[]).find(k=>k.nama===p.kategori)?.warna;
              const sup=(supplierList??[]).find(s=>s.id===p.supplierId);
              // Gudang: primary is p.gudangId, secondary is p.gudangId2 (if exists)
              const gudangUtama=(gudangList??[]).find(g=>g.id===(p as any).gudangId2);
              const gudangKedua=(gudangList??[]).find(g=>g.id===p.gudangId);
              return (
                <tr key={p.id} className="tr">
                  <td className="td">{p.gambarUrl?<img src={p.gambarUrl} className="w-8 h-8 rounded object-cover"/>:<span className="text-xl">{EMOJI[p.kategori]||'📦'}</span>}</td>
                  <td className="td font-mono text-blue-400 text-[10px] whitespace-nowrap">{p.sku}</td>
                  <td className="td"><div className="font-medium text-xs">{p.nama}</div><div className="text-[10px] text-slate-500">{p.brand}</div></td>
                  <td className="td"><span className="badge text-[9px] border" style={{color:katColor||'#94a3b8',background:(katColor||'#94a3b8')+'20',borderColor:(katColor||'#94a3b8')+'40'}}>{p.kategori}</span></td>
                  <td className="td text-[10px] text-slate-400">{sup?sup.nama:<span className="text-slate-600">—</span>}</td>
                  {/* Gudang Utama */}
                  <td className="td">
                    {gudangUtama ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-indigo-500/25 bg-indigo-500/10 text-indigo-300 text-[10px] font-medium">
                        🏪 {gudangUtama.nama || gudangUtama.kode}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-[10px]">—</span>
                    )}
                  </td>
                  {/* Gudang Kedua */}
                  <td className="td">
                    {gudangKedua ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-purple-500/25 bg-purple-500/10 text-purple-300 text-[10px] font-medium">
                        🏪 {gudangKedua.nama || gudangKedua.kode}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-[10px]">—</span>
                    )}
                  </td>
                  <td className="td text-xs text-slate-300">Rp {p.hargaModal.toLocaleString('id-ID')}</td>
                  <td className="td text-xs text-green-400 font-semibold">Rp {p.hargaJual.toLocaleString('id-ID')}</td>
                  <td className="td"><span className={`badge ${stCls}`}>{stLabel}</span></td>
                  <td className="td"><div className="flex gap-1">
                    <button onClick={()=>openEdit(p)} className="w-6 h-6 border border-[#2a3347] rounded bg-[#1e2535] text-slate-400 hover:text-white flex items-center justify-center" title="Edit">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={()=>handleDelete(p)} className="w-6 h-6 border border-red-500/20 rounded bg-red-500/5 text-red-400 hover:bg-red-500/15 flex items-center justify-center">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
                    </button>
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {produkList.length===0&&<div className="text-center py-12 text-slate-500"><div className="text-4xl mb-3">📦</div><p className="text-sm">Belum ada produk</p></div>}
      </div>

      {/* Kategori Manager */}
      <AnimatePresence>
        {showKatModal&&(
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
              className="bg-[#161b27] border border-[#2a3347] rounded-2xl w-[480px] max-h-[80vh] flex flex-col">
              <div className="px-5 py-4 border-b border-[#2a3347] flex justify-between items-center">
                <h2 className="font-bold">{editKat?'Edit Kategori':'Manajemen Kategori'}</h2>
                <button onClick={()=>{setShowKatModal(false);setEditKat(null);}} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
              </div>
              <div className="p-4 border-b border-[#2a3347]">
                <div className="flex gap-2">
                  <input value={katForm.nama} onChange={e=>setKatForm(f=>({...f,nama:e.target.value}))} placeholder="Nama kategori" className="input-base flex-1"/>
                  <input value={katForm.kode} onChange={e=>setKatForm(f=>({...f,kode:e.target.value.toUpperCase().slice(0,3)}))} placeholder="KOD" maxLength={3} className="input-base w-16 text-center font-mono uppercase" title="Kode 3 huruf"/>
                  <input type="color" value={katForm.warna} onChange={e=>setKatForm(f=>({...f,warna:e.target.value}))} className="w-10 h-9 rounded border border-[#2a3347] bg-[#1e2535] cursor-pointer p-0.5"/>
                  <button onClick={saveKategori} disabled={savingKat} className="btn-primary px-3 text-sm">{editKat?'Update':'+'}</button>
                  {editKat&&<button onClick={()=>setEditKat(null)} className="px-3 py-1.5 border border-[#2a3347] rounded-lg text-xs text-slate-400 hover:bg-[#1e2535]">Batal</button>}
                </div>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-1.5">
                {(kategoriList??[]).map(k=>(
                  <div key={k.id} className="flex items-center gap-3 px-3 py-2.5 bg-[#1e2535] rounded-lg border border-[#2a3347] group">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{background:k.warna||'#64748b'}}/>
                    <span className="font-mono text-[10px] text-slate-500 w-8">{k.kode}</span>
                    <span className="text-sm flex-1">{k.nama}</span>
                    <span className="text-[10px] text-slate-600">{(rawList??[]).filter(p=>p.kategori===k.nama&&p.isActive).length} produk</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={()=>openEditKat(k)} className="w-6 h-6 border border-[#334155] rounded bg-[#1a2032] text-slate-400 hover:text-white flex items-center justify-center">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={()=>deleteKategori(k)} className="w-6 h-6 border border-red-500/20 rounded bg-red-500/5 text-red-400 hover:bg-red-500/15 flex items-center justify-center">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Produk Modal */}
      <AnimatePresence>
        {showModal&&(
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
              className="bg-[#161b27] border border-[#2a3347] rounded-2xl w-[580px] max-h-[92vh] overflow-y-auto">
              <div className="px-5 py-4 border-b border-[#2a3347] flex justify-between items-center sticky top-0 bg-[#161b27] z-10">
                <h2 className="font-bold">{editProduk?'Edit Produk':'Tambah Produk Baru'}</h2>
                <button onClick={()=>setShowModal(false)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
              </div>
              <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">

                {/* Nama & Brand */}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 block mb-1">Nama Produk *</label>
                    <input {...register('nama',{required:'Wajib'})} className="input-base" placeholder="Nama produk"/>
                    {errors.nama&&<p className="text-red-400 text-[10px] mt-0.5">{errors.nama.message}</p>}
                  </div>
                  <div><label className="text-xs text-slate-400 block mb-1">Brand / Merek</label>
                    <input {...register('brand')} className="input-base" placeholder="Indomie, Aqua..."/>
                  </div>
                </div>

                {/* Kategori & Supplier */}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 block mb-1">Kategori *</label>
                    <select {...register('kategoriId',{required:true})} className="input-base"
                      onChange={e=>{
                        const kat=(kategoriList??[]).find(k=>k.id===e.target.value);
                        if(kat) setValue('skuKat', kat.kode);
                        setValue('kategoriId', e.target.value);
                      }}>
                      {(kategoriList??[]).map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs text-slate-400 block mb-1">Supplier</label>
                    <select {...register('supplierId')} className="input-base">
                      <option value="">— Pilih Supplier —</option>
                      {(supplierList??[]).map(s=><option key={s.id} value={s.id}>{s.nama}</option>)}
                    </select>
                  </div>
                </div>

                {/* SKU 3 kolom */}
                <div className="bg-[#1e2535] rounded-xl p-3 border border-[#2a3347]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-400 font-medium">🏷️ SKU Format: <span className="font-mono text-green-400">{skuPreview||'XXX-XXXX-000001'}</span></p>
                    <button type="button" onClick={()=>setScanField('sku')}
                      className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${scanField==='sku'?'border-green-500 text-green-400 bg-green-500/10 animate-pulse':'border-[#334155] text-slate-500 hover:border-slate-500'}`}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 5v2M3 19v-2M3 12h1M21 5v2M21 19v-2M21 12h-1M7 5h1v14H7zM12 5h1v14h-1zM16 5h2v14h-2z"/></svg>
                      {scanField==='sku'?'Scan SKU...':'Scan SKU'}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Kode Kategori (3 huruf)</label>
                      <input {...register('skuKat')} maxLength={3} placeholder="SMB" className="input-base font-mono uppercase text-center text-sm" onChange={e=>setValue('skuKat',e.target.value.toUpperCase().slice(0,3))}/>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Kode Nama (4 huruf)</label>
                      <input {...register('skuNama')} maxLength={4} placeholder="BRAS" className="input-base font-mono uppercase text-center text-sm" onChange={e=>setValue('skuNama',e.target.value.toUpperCase().slice(0,4))}/>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Nomor Urut (6 digit)</label>
                      <input {...register('skuUrut')} maxLength={6} placeholder="000001" className="input-base font-mono text-center text-sm" onChange={e=>setValue('skuUrut',e.target.value.replace(/\D/g,'').slice(0,6))}/>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-600 mt-1.5">Contoh: SMB-BRAS-000001 = Sembako · Beras · Urutan ke-1</p>
                </div>

                {/* Barcode */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">Barcode <span className="text-slate-600">(kosong = otomatis lokal)</span></label>
                    <button type="button" onClick={()=>setScanField('barcode')}
                      className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${scanField==='barcode'?'border-green-500 text-green-400 bg-green-500/10 animate-pulse':'border-[#334155] text-slate-500 hover:border-slate-500'}`}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 5v2M3 19v-2M3 12h1M21 5v2M21 19v-2M21 12h-1M7 5h1v14H7zM12 5h1v14h-1zM16 5h2v14h-2z"/></svg>
                      {scanField==='barcode'?'Scan barcode...':'Scan Barcode'}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input {...register('barcode')} className="input-base flex-1 font-mono" placeholder="Scan atau ketik manual — kosong = auto LOCxxxxxxxxx"/>
                    <button type="button" onClick={()=>setValue('barcode', generateLocalBarcode())}
                      className="px-3 py-1.5 border border-[#2a3347] rounded-lg text-[10px] text-slate-400 hover:text-white hover:border-slate-500 whitespace-nowrap">
                      Auto Lokal
                    </button>
                  </div>
                </div>

                {/* Harga */}
                <div className="bg-[#1e2535] rounded-xl p-3 border border-[#2a3347]">
                  <p className="text-xs text-slate-400 font-medium mb-2">💰 Kalkulasi Harga <span className="text-slate-600">(harga jual otomatis dari modal + markup)</span></p>
                  <div className="grid grid-cols-3 gap-2">
                    <div><label className="text-[10px] text-slate-500 block mb-1">Harga Modal (Rp) *</label>
                      <input type="number" {...register('hargaModal',{required:true,min:1,valueAsNumber:true})} className="input-base text-sm"/>
                    </div>
                    <div><label className="text-[10px] text-slate-500 block mb-1">Markup (%)</label>
                      <input type="number" {...register('markupPersen',{valueAsNumber:true})} className="input-base text-sm"/>
                    </div>
                    <div><label className="text-[10px] text-green-400 block mb-1">= Harga Jual (Rp)</label>
                      <input type="number" {...register('hargaJual',{required:true,min:1,valueAsNumber:true})} className="input-base text-sm text-green-400 font-bold border-green-500/40"/>
                    </div>
                  </div>
                  {modal>0&&markup>=0&&(
                    <p className="text-[10px] text-slate-500 mt-1.5">
                      Rp {modal.toLocaleString('id-ID')} + {markup}% = <span className="text-green-400 font-semibold">Rp {Math.round(modal*(1+markup/100)).toLocaleString('id-ID')}</span>
                    </p>
                  )}
                </div>

                {/* Stok */}
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="text-xs text-slate-400 block mb-1">Stok Awal</label>
                    <input type="number" {...register('stok',{valueAsNumber:true})} className="input-base"/>
                  </div>
                  <div><label className="text-xs text-slate-400 block mb-1">Stok Minimum</label>
                    <input type="number" {...register('stokMinimum',{valueAsNumber:true})} className="input-base"/>
                  </div>
                  <div><label className="text-xs text-slate-400 block mb-1">Satuan</label>
                    <input {...register('satuan')} className="input-base" placeholder="pcs/kg/liter"/>
                  </div>
                </div>

                {/* Gambar */}
                <div><label className="text-xs text-slate-400 block mb-1">Gambar (auto WebP 720px)</label>
                  <input type="file" accept="image/*" onChange={handleImage} className="input-base text-[11px]"/>
                  {imageB64&&<img src={imageB64} alt="preview" className="mt-2 w-14 h-14 object-cover rounded-lg border border-[#2a3347]"/>}
                </div>

                {scanField&&(
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 animate-pulse">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-xs text-green-400 font-medium">Scanner aktif untuk field <strong>{scanField}</strong> — arahkan scanner sekarang</span>
                    <button type="button" onClick={()=>setScanField(null)} className="ml-auto text-green-400/60 hover:text-green-400 text-xs">Batal ×</button>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={()=>setShowModal(false)} className="flex-1 py-2.5 border border-[#2a3347] rounded-lg text-sm hover:bg-[#1e2535]">Batal</button>
                  <button type="submit" disabled={saving} className="flex-1 btn-primary py-2.5">
                    {saving?'Menyimpan...':editProduk?'Perbarui Produk':'Simpan Produk'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {showImport && <CSVImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
