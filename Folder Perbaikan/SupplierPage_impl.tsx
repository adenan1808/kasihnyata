import { useState, useRef, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { db, getSetting, setSetting } from '../db/database';
import { generateUUID } from '../utils/helpers';
import type { Supplier, Produk, SupplierProduk, PurchaseTransaction } from '../types/local';
import { printPurchaseInvoice } from '../utils/thermalPrint';

interface SupplierForm { nama:string; noWA:string; alamat:string; hutang:number; jatuhTempo:string; }
const EMPTY:SupplierForm = { nama:'',noWA:'',alamat:'',hutang:0,jatuhTempo:'' };

function InlineCell({ value,onSave,type='text',placeholder='' }:{ value:string;onSave:(v:string)=>void;type?:string;placeholder?:string }) {
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(value);
  const ref=useRef<HTMLInputElement>(null);
  const start=()=>{ setVal(value); setEditing(true); setTimeout(()=>ref.current?.focus(),30); };
  const commit=()=>{ setEditing(false); if(val.trim()!==value) onSave(val.trim()); };
  if(editing) return (
    <input ref={ref} value={val} type={type} onChange={e=>setVal(e.target.value)}
      onBlur={commit} onKeyDown={e=>{ if(e.key==='Enter') commit(); if(e.key==='Escape'){setEditing(false);setVal(value);} }}
      className="w-full px-1.5 py-0.5 bg-[#1e2535] border border-green-500 rounded text-xs outline-none min-w-0"/>
  );
  return (
    <span onDoubleClick={start} className="cursor-text hover:text-white group flex items-center gap-1" title="Klik 2x untuk edit">
      <span className="truncate">{value||<span className="text-slate-600 italic">{placeholder||'-'}</span>}</span>
      <svg className="w-2.5 h-2.5 text-slate-700 opacity-0 group-hover:opacity-100 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    </span>
  );
}

export default function SupplierPage() {
  const [showModal,setShowModal]=useState(false);
  const [editItem,setEditItem]=useState<Supplier|null>(null);
  const [form,setForm]=useState<SupplierForm>(EMPTY);
  const [saving,setSaving]=useState(false);
  const [deleteConfirm,setDeleteConfirm]=useState<Supplier|null>(null);
  const [search,setSearch]=useState('');
  const [selectedSupplier,setSelectedSupplier]=useState<Supplier|null>(null);
  const [showProdukModal,setShowProdukModal]=useState(false);
  const [peringatanHari,setPeringatanHari]=useState(7);
  const [showSettingModal,setShowSettingModal]=useState(false);
  const [tempPeringatan,setTempPeringatan]=useState(7);
  // Edit harga beli
  const [editingSP,setEditingSP]=useState<SupplierProduk|null>(null);
  const [editHargaBeli,setEditHargaBeli]=useState(0);
  // Search / link existing product
  const [quickAdd,setQuickAdd]=useState('');
  const quickRef=useRef<HTMLInputElement>(null);
  const scanBuf=useRef('');
  const scanTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  // Create new product inline
  const [showNewForm,setShowNewForm]=useState(false);
  const [newPF,setNewPF]=useState({ nama:'',brand:'',kategori:'Lainnya',hargaModal:0,markup:20,stok:0,satuan:'pcs' });
  const [savingNew,setSavingNew]=useState(false);
  // Detail modal tab
  const [detailTab,setDetailTab]=useState<'produk'|'faktur'>('faktur');
  const [modalSearch,setModalSearch]=useState('');

  useLiveQuery(async()=>{
    const val=await getSetting('peringatanJatuhTempoHari');
    if(val) setPeringatanHari(parseInt(val));
  },[]);

  const rawList=useLiveQuery<Supplier[]>(()=>db.supplier.filter(s=>s.isActive===true).toArray(),[]);
  const list=(rawList??[]).filter(s=>!search||s.nama.toLowerCase().includes(search.toLowerCase())||(s.noWA||'').includes(search));
  const allProduk=useLiveQuery<Produk[]>(()=>db.produk.filter(p=>p.isActive).toArray(),[]);
  const supplierProdukList=useLiveQuery<SupplierProduk[]>(
    ()=>selectedSupplier?db.supplierProduk.where('supplierId').equals(selectedSupplier.id).toArray():Promise.resolve([]),
    [selectedSupplier]
  );
  const supplierInvoices=useLiveQuery<PurchaseTransaction[]>(
    ()=>selectedSupplier
      ?db.purchaseTransactions.where('supplierId').equals(selectedSupplier.id).reverse().sortBy('createdAt')
      :Promise.resolve([]),
    [selectedSupplier]
  );
  const invoiceStats=useMemo(()=>{
    const inv=supplierInvoices??[];
    const totalDebt=inv.filter(t=>t.status!=='PAID').reduce((s,t)=>s+t.remainingDebt,0);
    const nearest=inv.filter(t=>t.status!=='PAID'&&t.dueDate).sort((a,b)=>(a.dueDate??0)-(b.dueDate??0))[0];
    return{totalDebt,nearest,count:inv.length,unpaid:inv.filter(t=>t.status!=='PAID').length};
  },[supplierInvoices]);
  const supplierInvoiceProductRows=useMemo(()=>{
    const rows:Array<{
      key:string;
      invoiceId:string;
      invoiceNumber:string;
      paymentType:'cash'|'tempo';
      supplierNama:string;
      productName:string;
      productSku:string;
      qty:number;
      hargaBeli:number;
      subtotal:number;
      invoiceTotal:number;
      remainingDebt:number;
      dueDate?:number;
      status:'UNPAID'|'PARTIAL'|'PAID';
      createdAt:number;
      catatan?:string;
    }>=[];
    for(const inv of supplierInvoices??[]){
      const items=inv.items??[];
      if(items.length===0){
        rows.push({
          key:`${inv.id}-no-item`,
          invoiceId:inv.id,
          invoiceNumber:inv.invoiceNumber,
          paymentType:inv.paymentType,
          supplierNama:inv.supplierNama??selectedSupplier?.nama??'',
          productName:'-',
          productSku:'-',
          qty:0,
          hargaBeli:0,
          subtotal:0,
          invoiceTotal:inv.total,
          remainingDebt:inv.remainingDebt,
          dueDate:inv.dueDate,
          status:inv.status,
          createdAt:inv.createdAt,
          catatan:inv.catatan,
        });
        continue;
      }
      for(const item of items){
        rows.push({
          key:`${inv.id}-${item.produkId}-${item.skuProduk}-${item.namaProduk}`,
          invoiceId:inv.id,
          invoiceNumber:inv.invoiceNumber,
          paymentType:inv.paymentType,
          supplierNama:inv.supplierNama??selectedSupplier?.nama??'',
          productName:item.namaProduk,
          productSku:item.skuProduk,
          qty:item.qty,
          hargaBeli:item.hargaBeli,
          subtotal:item.subtotal,
          invoiceTotal:inv.total,
          remainingDebt:inv.remainingDebt,
          dueDate:inv.dueDate,
          status:inv.status,
          createdAt:inv.createdAt,
          catatan:inv.catatan,
        });
      }
    }
    return rows.sort((a,b)=>b.createdAt-a.createdAt);
  },[supplierInvoices,selectedSupplier]);
  const supplierInvoiceRows=useMemo(()=>{
    const rows:(Pick<PurchaseTransaction,'invoiceNumber'|'dueDate'|'createdAt'|'status'> & { barangDikirim:string })[]=[];
    for(const inv of supplierInvoices??[]){
      const barangDikirim=(inv.items??[]).length>0
        ?(inv.items??[]).map(i=>`${i.namaProduk} (${i.qty})`).join(', ')
        :'-';
      rows.push({
        invoiceNumber:inv.invoiceNumber,
        barangDikirim,
        dueDate:inv.dueDate,
        createdAt:inv.createdAt,
        status:inv.status,
      });
    }
    return rows.sort((a,b)=>b.createdAt-a.createdAt);
  },[supplierInvoices]);
  const filteredSupplierInvoiceRows=useMemo(()=>{
    if(!modalSearch.trim()) return supplierInvoiceRows;
    const q=modalSearch.toLowerCase();
    return supplierInvoiceRows.filter(r=>
      r.invoiceNumber.toLowerCase().includes(q) ||
      r.barangDikirim.toLowerCase().includes(q)
    );
  },[supplierInvoiceRows,modalSearch]);

  // Quick search results
  const quickResults=(allProduk??[]).filter(p=>{
    if(!quickAdd.trim()) return false;
    if((supplierProdukList??[]).some(sp=>sp.produkId===p.id)) return false;
    const q=quickAdd.toLowerCase();
    return p.nama.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q)||(p.barcode||'').includes(q);
  }).slice(0,6);

  // Barcode scanner handler for quick-add field
  const handleScannerKey=useCallback((e:KeyboardEvent)=>{
    if(!showProdukModal) return;
    // Only intercept fast scanner input (not normal typing in other inputs)
    const target=e.target as HTMLElement;
    if(target.tagName==='INPUT'&&target!==quickRef.current) return;
    if(e.key==='Enter'&&scanBuf.current.length>3){
      const buf=scanBuf.current; scanBuf.current='';
      // Try find by barcode or SKU
      db.produk.filter(p=>p.barcode===buf||p.sku===buf).first().then(produk=>{
        if(produk) addProdukToSupplier(produk);
        else toast.error('Produk tidak ditemukan: '+buf);
      });
      setQuickAdd(''); return;
    }
    if(e.key.length===1){
      if(scanTimer.current) clearTimeout(scanTimer.current);
      scanBuf.current+=e.key;
      scanTimer.current=setTimeout(()=>{ scanBuf.current=''; },200);
    }
  },[showProdukModal]);

  // Attach scanner listener when modal opens
  useLiveQuery(()=>{
    window.addEventListener('keydown',handleScannerKey);
    return ()=>window.removeEventListener('keydown',handleScannerKey);
    // eslint-disable-next-line
  },[]);

  const getHutangStatus=(s:Supplier):'lunas'|'hutang'|'warning'|'overdue'=>{
    if(!s.hutang||s.hutang<=0) return 'lunas';
    if(!s.jatuhTempo) return 'hutang';
    const sisa=s.jatuhTempo-Date.now();
    if(sisa<0) return 'overdue';
    if(sisa<peringatanHari*86400000) return 'warning';
    return 'hutang';
  };

  const openAdd=()=>{ setEditItem(null); setForm(EMPTY); setShowModal(true); };
  const openEdit=(s:Supplier)=>{
    setEditItem(s);
    setForm({nama:s.nama,noWA:s.noWA||'',alamat:s.alamat||'',hutang:s.hutang||0,
      jatuhTempo:s.jatuhTempo?new Date(s.jatuhTempo).toISOString().slice(0,10):''});
    setShowModal(true);
  };

  const handleSave=async()=>{
    if(!form.nama.trim()){ toast.error('Nama wajib'); return; }
    setSaving(true);
    try {
      const now=Date.now();
      const data={nama:form.nama.trim(),noWA:form.noWA.trim(),alamat:form.alamat.trim(),
        hutang:Number(form.hutang)||0,jatuhTempo:form.jatuhTempo?new Date(form.jatuhTempo).getTime():undefined,updatedAt:now};
      if(editItem){ await db.supplier.where('id').equals(editItem.id).modify(data); toast.success('Supplier diperbarui!'); }
      else{ await db.supplier.add({id:generateUUID(),...data,isActive:true,syncStatus:'PENDING',createdAt:now}); toast.success('Supplier ditambahkan!'); }
      setShowModal(false); setEditItem(null);
    } finally{ setSaving(false); }
  };

  const saveField=async(id:string,field:Partial<Supplier>)=>{
    await db.supplier.where('id').equals(id).modify({...field,updatedAt:Date.now()});
    toast.success('Tersimpan',{duration:800});
  };

  const handleDelete=async(s:Supplier)=>{
    await db.supplier.where('id').equals(s.id).modify({isActive:false});
    toast.success('Supplier dinonaktifkan'); setDeleteConfirm(null);
  };

  const openProdukModal=(s:Supplier)=>{
    setSelectedSupplier(s); setQuickAdd(''); setEditingSP(null); setShowProdukModal(true);
    setDetailTab('faktur'); setShowNewForm(false); setModalSearch('');
    setTimeout(()=>quickRef.current?.focus(),200);
  };

  const addProdukToSupplier=async(produk:Produk)=>{
    if(!selectedSupplier) return;
    const ex=await db.supplierProduk.where('supplierId').equals(selectedSupplier.id).and(sp=>sp.produkId===produk.id).first();
    if(ex){ toast.error('Produk sudah terdaftar'); return; }
    await db.supplierProduk.add({
      id:generateUUID(), supplierId:selectedSupplier.id, produkId:produk.id,
      namaProduk:produk.nama, skuProduk:produk.sku, hargaBeli:produk.hargaModal, createdAt:Date.now(),
    });
    await db.produk.where('id').equals(produk.id).modify({supplierId:selectedSupplier.id});
    toast.success(`OK ${produk.nama} ditambahkan`);
    setQuickAdd('');
  };

  const addFromQuick=async()=>{
    if(!quickAdd.trim()) return;
    const found=(allProduk??[]).find(p=>{
      const q=quickAdd.toLowerCase();
      return p.nama.toLowerCase()===q||p.sku.toLowerCase()===q||p.barcode===quickAdd;
    });
    if(found){ await addProdukToSupplier(found); }
    else if(quickResults.length===1){ await addProdukToSupplier(quickResults[0]); }
    else{ toast.error('Ketik lebih spesifik atau pilih dari daftar'); }
  };

  const removeProdukFromSupplier=async(sp:SupplierProduk)=>{
    if(!confirm(`Hapus "${sp.namaProduk}" dari supplier ini?`)) return;
    await db.supplierProduk.where('id').equals(sp.id).delete();
    await db.produk.where('id').equals(sp.produkId).modify({supplierId:''});
    toast.success('Produk dihapus dari supplier');
  };

  const startEditHarga=(sp:SupplierProduk)=>{ setEditingSP(sp); setEditHargaBeli(sp.hargaBeli); };
  const saveEditHarga=async()=>{
    if(!editingSP||editHargaBeli<=0){ toast.error('Harga harus > 0'); return; }
    await db.supplierProduk.where('id').equals(editingSP.id).modify({hargaBeli:editHargaBeli});
    await db.produk.where('id').equals(editingSP.produkId).modify({hargaModal:editHargaBeli});
    toast.success('Harga beli diperbarui!'); setEditingSP(null);
  };

  const hargaJualNew=()=>Math.round(newPF.hargaModal*(1+newPF.markup/100));

  const createAndLinkProduk=async()=>{
    if(!selectedSupplier) return;
    if(!newPF.nama.trim()){ toast.error('Nama produk wajib'); return; }
    if(newPF.hargaModal<=0){ toast.error('Harga modal harus > 0'); return; }
    setSavingNew(true);
    try {
      const now=Date.now();
      const tokoId=(await getSetting('tokoId'))||'';
      const gudangId=(await getSetting('gudangId'))||'';
      const count=await db.produk.count();
      const seq=String(count+1).padStart(6,'0');
      const katKode=newPF.kategori.slice(0,3).toUpperCase();
      const namaKode=newPF.nama.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4).padEnd(4,'X');
      const sku=`${katKode}-${namaKode}-${seq}`;
      const barcode='LOC'+Date.now().toString().slice(-9);
      const hargaJual=hargaJualNew();
      const produkId=generateUUID();
      await db.produk.add({
        id:produkId, sku, barcode, nama:newPF.nama.trim(), brand:newPF.brand.trim(),
        kategori:newPF.kategori, hargaModal:newPF.hargaModal, markupPersen:newPF.markup,
        hargaJual, stok:newPF.stok, stokMinimum:10, satuan:newPF.satuan||'pcs',
        supplierId:selectedSupplier.id, tokoId, gudangId,
        isActive:true, syncStatus:'PENDING', createdAt:now, updatedAt:now,
      });
      await db.supplierProduk.add({
        id:generateUUID(), supplierId:selectedSupplier.id, produkId,
        namaProduk:newPF.nama.trim(), skuProduk:sku, hargaBeli:newPF.hargaModal, createdAt:now,
      });
      toast.success(`OK "${newPF.nama}" ditambahkan ke master & supplier!`);
      setNewPF({ nama:'',brand:'',kategori:'Lainnya',hargaModal:0,markup:20,stok:0,satuan:'pcs' });
      setShowNewForm(false); setQuickAdd('');
    } finally { setSavingNew(false); }
  };

  const savePeringatan=async()=>{
    await setSetting('peringatanJatuhTempoHari',String(tempPeringatan));
    setPeringatanHari(tempPeringatan); toast.success(`Peringatan: ${tempPeringatan} hari`);
    setShowSettingModal(false);
  };

  const hutangStyle:{[k:string]:string}={
    lunas:'text-green-400',hutang:'text-amber-400 font-semibold',
    warning:'text-orange-400 font-bold',overdue:'text-red-500 font-bold',
  };

  const jatuhTempoBadge=(s:Supplier)=>{
    if(!s.jatuhTempo) return null;
    const status=getHutangStatus(s);
    const tgl=new Date(s.jatuhTempo).toLocaleDateString('id-ID');
    const sisa=Math.ceil((s.jatuhTempo-Date.now())/86400000);
    if(status==='overdue') return <span className="text-[10px] text-red-500 font-bold">Lewat! {tgl}</span>;
    if(status==='warning') return <span className="text-[10px] text-orange-400 font-bold">{tgl} ({sisa}hr)</span>;
    return <span className="text-[10px] text-slate-400">{tgl}</span>;
  };

  const produkTerdaftar=supplierProdukList??[];
  const allProdukList=allProduk??[];

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-[#0f1117]">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h1 className="text-lg font-bold flex-1">Manajemen Supplier</h1>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama / no WA..." className="input-base w-44"/>
        <button onClick={()=>{setTempPeringatan(peringatanHari);setShowSettingModal(true);}}
          className="flex items-center gap-1 px-3 py-1.5 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 rounded-lg text-xs">
          Peringatan: {peringatanHari} hari
        </button>
        <button onClick={openAdd} className="btn-primary">+ Tambah Supplier</button>
      </div>

      <div className="mb-3 px-3 py-2 bg-[#1a2032] border border-[#2a3347] rounded-lg text-[10px] text-slate-500 flex gap-4 flex-wrap">
        <span>Ada hutang</span><span>Jatuh tempo &lt;{peringatanHari}hr</span><span>Lewat jatuh tempo</span>
        <span className="ml-auto">Klik 2x sel untuk edit langsung di tabel</span>
      </div>

      <div className="table-container overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead><tr className="border-b border-[#2a3347]">
            {['Nama Supplier','No. WhatsApp','Alamat','Hutang (Rp)','Jatuh Tempo','Produk','Status','Aksi'].map(h=>(
              <th key={h} className="th">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {list.map(s=>{
              const status=getHutangStatus(s);
              const rowCls=status==='overdue'?'bg-red-500/5':status==='warning'?'bg-orange-500/5':'';
              const produkCount=allProdukList.filter(p=>p.supplierId===s.id).length;
              return (
                <tr key={s.id} className={`tr ${rowCls}`}>
                  <td className="td font-medium max-w-[150px]"><InlineCell value={s.nama} onSave={v=>saveField(s.id,{nama:v})}/></td>
                  <td className="td max-w-[120px]">
                    <InlineCell value={s.noWA||''} placeholder="08xxx" type="tel" onSave={v=>saveField(s.id,{noWA:v})}/>
                    {s.noWA&&<a href={`https://wa.me/62${s.noWA.replace(/\D/g,'').replace(/^0/,'')}`} target="_blank" rel="noopener" className="ml-1 text-green-400 text-[10px]">↗</a>}
                  </td>
                  <td className="td max-w-[130px]"><InlineCell value={s.alamat||''} placeholder="Alamat..." onSave={v=>saveField(s.id,{alamat:v})}/></td>
                  <td className="td"><span className={hutangStyle[status]}>{s.hutang>0?`Rp ${s.hutang.toLocaleString('id-ID')}`:''}{(!s.hutang||s.hutang===0)?<span className="text-green-400">Lunas</span>:''}</span></td>
                  <td className="td">{jatuhTempoBadge(s)||<span className="text-slate-600 text-[10px]">-</span>}</td>
                  <td className="td">
                    <button onClick={()=>openProdukModal(s)}
                      className="flex items-center gap-1 px-2 py-1 rounded border border-blue-500/20 bg-blue-500/5 text-blue-400 hover:bg-blue-500/15 text-[10px] whitespace-nowrap">
                       {produkCount} produk
                    </button>
                  </td>
                  <td className="td"><span className="badge badge-green">Aktif</span></td>
                  <td className="td"><div className="flex gap-1">
                    <button onClick={()=>openEdit(s)} className="w-6 h-6 border border-[#2a3347] rounded bg-[#1e2535] text-slate-400 hover:text-white flex items-center justify-center" title="Edit">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    {s.noWA&&(
                      <a href={`https://wa.me/62${s.noWA.replace(/\D/g,'').replace(/^0/,'')}`} target="_blank" rel="noopener"
                        className="w-6 h-6 border border-green-500/20 rounded bg-green-500/5 text-green-400 hover:bg-green-500/15 flex items-center justify-center">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM11.999 2C6.477 2 2 6.484 2 12.017c0 1.99.518 3.848 1.426 5.449L2 22l4.686-1.395A9.94 9.94 0 0012 22c5.522 0 10-4.477 10-10.001C22 6.484 17.523 2 12 2z"/></svg>
                      </a>
                    )}
                    <button onClick={()=>setDeleteConfirm(s)} className="w-6 h-6 border border-red-500/20 rounded bg-red-500/5 text-red-400 hover:bg-red-500/15 flex items-center justify-center">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
                    </button>
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length===0&&<div className="text-center py-12 text-slate-500"><div className="text-4xl mb-3"></div><p className="text-sm">{search?'Tidak ditemukan':'Belum ada supplier'}</p></div>}
      </div>

      {/* â”€â”€â”€ Modal Produk Supplier (redesigned) â”€â”€â”€ */}
      <AnimatePresence>
        {showProdukModal&&selectedSupplier&&(
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
              className="bg-[#161b27] border border-[#2a3347] rounded-2xl w-[92vw] max-w-[1080px] max-h-[88vh] flex flex-col">
              {/* Header */}
              <div className="px-5 py-4 border-b border-[#2a3347] flex justify-between items-center flex-shrink-0">
                <div>
                  <h2 className="font-bold"> {selectedSupplier.nama}</h2>
                  <p className="text-[10px] text-slate-500 mt-0.5">{produkTerdaftar.length} produk · {invoiceStats.unpaid} faktur belum lunas</p>
                </div>
                <button onClick={()=>{setShowProdukModal(false);setEditingSP(null);setQuickAdd('');setShowNewForm(false);}} className="text-slate-400 hover:text-white text-xl leading-none">x</button>
              </div>

              <div className="px-5 py-2.5 border-b border-[#2a3347] text-xs text-slate-400">
                No. Invoice | Barang dikirim | Jatuh tempo
              </div>
              <div className="px-5 py-3 border-b border-[#2a3347]">
                <input
                  value={modalSearch}
                  onChange={e=>setModalSearch(e.target.value)}
                  placeholder="Cari nomor invoice atau nama barang..."
                  className="input-base w-full"
                />
              </div>

              {/* Tab 2 - Faktur & Jatuh Tempo */}
              {detailTab==='faktur'&&(
                <div className="flex flex-col overflow-hidden flex-1">
                  {/* Summary bar */}
                  <div className="px-5 py-3 border-b border-[#2a3347] flex-shrink-0 flex gap-4">
                    <div>
                      <p className="text-[10px] text-slate-500">Total Hutang Aktif</p>
                      <p className="text-lg font-bold text-red-400">Rp {invoiceStats.totalDebt.toLocaleString('id-ID')}</p>
                    </div>
                    {invoiceStats.nearest&&(
                      <div className="border-l border-[#2a3347] pl-4">
                        <p className="text-[10px] text-slate-500">Jatuh Tempo Terdekat</p>
                        <p className="text-sm font-bold text-amber-400">
                          {new Date(invoiceStats.nearest.dueDate!).toLocaleDateString('id-ID')}
                          <span className="text-[10px] text-slate-400 ml-2">
                            ({Math.ceil(((invoiceStats.nearest.dueDate??0)-Date.now())/86400000)} hari lagi)
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                  {/* Invoice list */}
                  <div className="overflow-y-auto flex-1">
                    {(supplierInvoices??[]).length===0&&(
                      <div className="text-center py-14 text-slate-600">
                        <div className="text-4xl mb-3"></div>
                        <p className="text-sm text-slate-400">Belum ada faktur pembelian</p>
                        <p className="text-xs mt-1">Tambah di halaman Pembelian & Hutang</p>
                      </div>
                    )}
                    {(supplierInvoices??[]).length>0&&(
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px] text-left">
                          <thead className="bg-[#131827] text-[11px] text-slate-400 uppercase tracking-wide">
                            <tr>
                              <th className="px-4 py-3">No. Invoice</th>
                              <th className="px-4 py-3">Barang dikirim</th>
                              <th className="px-4 py-3">Jatuh tempo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {supplierInvoiceRows.map((row)=>{
                              const isOverdue=!!(row.dueDate&&row.status!=='PAID'&&row.dueDate<Date.now());
                              return(
                                <tr key={`${row.invoiceNumber}-${row.createdAt}`} className="border-t border-[#20283a] hover:bg-white/[0.02]">
                                  <td className="px-4 py-3">
                                    <div className="text-sm font-semibold text-white">{row.invoiceNumber}</div>
                                    <div className="text-[11px] text-slate-500">{new Date(row.createdAt).toLocaleDateString('id-ID')}</div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-200">{row.barangDikirim}</td>
                                  <td className="px-4 py-3 text-sm">
                                    {row.dueDate?(
                                      <span className={isOverdue?'text-red-500 font-semibold':'text-slate-300'}>
                                        {new Date(row.dueDate).toLocaleDateString('id-ID')}
                                      </span>
                                    ):<span className="text-slate-600">-</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Setting peringatan */}
      <AnimatePresence>
        {showSettingModal&&(
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
              className="bg-[#161b27] border border-amber-500/30 rounded-2xl w-[360px] p-5">
              <h2 className="font-bold mb-1"> Peringatan Jatuh Tempo</h2>
              <p className="text-xs text-slate-500 mb-4">Tampilkan warning berapa hari sebelum jatuh tempo?</p>
              <div>
                <label className="text-xs text-slate-400 block mb-2">Hari: <strong className="text-amber-400">{tempPeringatan} hari</strong></label>
                <input type="range" min={1} max={30} value={tempPeringatan} onChange={e=>setTempPeringatan(Number(e.target.value))}
                  className="w-full h-2 bg-[#2a3347] rounded-full appearance-none cursor-pointer accent-amber-400"/>
                <div className="flex justify-between text-[10px] text-slate-600 mt-1"><span>1 hari</span><span>30 hari</span></div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={()=>setShowSettingModal(false)} className="flex-1 py-2.5 border border-[#2a3347] rounded-lg text-sm hover:bg-[#1e2535]">Batal</button>
                <button onClick={savePeringatan} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-sm">Simpan</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit/Add Supplier Modal */}
      <AnimatePresence>
        {showModal&&(
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
              className="bg-[#161b27] border border-[#2a3347] rounded-2xl w-[440px]">
              <div className="px-5 py-4 border-b border-[#2a3347] flex justify-between items-center">
                <h2 className="font-bold">{editItem?'Edit Supplier':'Tambah Supplier'}</h2>
                <button onClick={()=>setShowModal(false)} className="text-slate-400 hover:text-white text-xl leading-none">x</button>
              </div>
              <div className="p-5 space-y-3">
                <div><label className="text-xs text-slate-400 block mb-1">Nama Supplier *</label>
                  <input value={form.nama} onChange={e=>setForm(f=>({...f,nama:e.target.value}))} className="input-base" autoFocus/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 block mb-1">No. WhatsApp</label>
                    <input value={form.noWA} onChange={e=>setForm(f=>({...f,noWA:e.target.value}))} type="tel" placeholder="08123..." className="input-base"/></div>
                  <div><label className="text-xs text-slate-400 block mb-1">Jatuh Tempo</label>
                    <input value={form.jatuhTempo} onChange={e=>setForm(f=>({...f,jatuhTempo:e.target.value}))} type="date" className="input-base"/></div>
                </div>
                <div><label className="text-xs text-slate-400 block mb-1">Alamat</label>
                  <input value={form.alamat} onChange={e=>setForm(f=>({...f,alamat:e.target.value}))} className="input-base"/></div>
                <div><label className="text-xs text-slate-400 block mb-1">Nominal Hutang (Rp)</label>
                  <input value={form.hutang||''} onChange={e=>setForm(f=>({...f,hutang:Number(e.target.value)||0}))} type="number" className="input-base"/></div>
                <div className="flex gap-3 pt-2">
                  <button onClick={()=>setShowModal(false)} className="flex-1 py-2.5 border border-[#2a3347] rounded-lg text-sm hover:bg-[#1e2535]">Batal</button>
                  <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary py-2.5">{saving?'Menyimpan...':editItem?'Perbarui':'Tambah'}</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteConfirm&&(
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
              className="bg-[#161b27] border border-red-500/30 rounded-2xl w-[300px] p-6 text-center">
              <div className="text-3xl mb-3">!</div>
              <h3 className="font-bold mb-1">Nonaktifkan Supplier?</h3>
              <p className="text-slate-400 text-sm mb-4"><strong className="text-white">{deleteConfirm.nama}</strong></p>
              <div className="flex gap-3">
                <button onClick={()=>setDeleteConfirm(null)} className="flex-1 py-2 border border-[#2a3347] rounded-lg text-sm hover:bg-[#1e2535]">Batal</button>
                <button onClick={()=>handleDelete(deleteConfirm)} className="flex-1 py-2 bg-red-500 hover:bg-red-400 text-white rounded-lg text-sm font-bold">Nonaktifkan</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
