"use client";
import React, { useEffect, useState, Fragment } from 'react';
import { Loader2, Plus, Save, X, RefreshCw, Edit3 } from 'lucide-react';
import { Dialog, Transition } from '@headlessui/react';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

const API_BASE = '/api';
interface Stream { id:number; name:string; class_id:number; }
interface ClassOption { id:number; name:string; }

const emptyForm:Partial<Stream> = { name:'', class_id:0 };

const fieldCls = "w-full px-3 py-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 backdrop-blur text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 transition";

export const StreamsManager:React.FC = () => {
  const { t } = useI18n();
  const [items,setItems]=useState<Stream[]>([]);
  const [classes,setClasses]=useState<ClassOption[]>([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState<Partial<Stream>>(emptyForm);
  const [message,setMessage]=useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', class_id: '' });

  const load=()=>{ setLoading(true); fetch(`${API_BASE}/streams`).then(r=>r.json()).then(d=>{ setItems(Array.isArray(d?.data) ? d.data : []);} ).catch(e=>setMessage((typeof e?.message === 'string' && e?.message && !(uiIsArabic() && isEnglishText(e?.message)) ? e?.message : t('academicsPages.streams.failed', "Something went wrong.")))).finally(()=>setLoading(false)); };
  const loadClasses=()=>{ fetch(`${API_BASE}/classes`).then(r=>r.json()).then(d=>{ setClasses(Array.isArray(d?.data) ? d.data : []); }).catch(()=>{}); };
  useEffect(()=>{ load(); loadClasses(); },[]);

  const edit=(stream:Stream)=>{ setForm({...stream}); setShowForm(true); };
  const reset=()=>{ setForm(emptyForm); };
  const save=()=>{
    if(!form.name?.trim() || !form.class_id) { setMessage(t('academicsPages.streams.required', "Name and Class required")); return; }
    setSaving(true); setMessage('');
    const method = form.id ? 'PUT' : 'POST';
    fetch(`${API_BASE}/streams${form.id ? `?id=${form.id}` : ''}`,{
      method,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(form)
    }).then(r=>r.json()).then(d=>{ if(d.error) setMessage((typeof d.error === 'string' && d.error && !(uiIsArabic() && isEnglishText(d.error)) ? d.error : t('academicsPages.streams.failed', "Something went wrong."))); else { setMessage(t('academicsPages.streams.saved', "Saved")); setShowForm(false); reset(); load(); } }).catch(e=>setMessage((typeof e?.message === 'string' && e?.message && !(uiIsArabic() && isEnglishText(e?.message)) ? e?.message : t('academicsPages.streams.failed', "Something went wrong.")))).finally(()=>setSaving(false));
  };

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.class_id) {
      setMessage(t('academicsPages.streams.required', "Name and Class required"));
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/streams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formData.name.trim(), class_id: parseInt(formData.class_id) })
      });
      const result = await res.json();
      if (result.error) {
        setMessage((typeof result.error === 'string' && result.error && !(uiIsArabic() && isEnglishText(result.error)) ? result.error : t('academicsPages.streams.failed', "Something went wrong.")));
      } else {
        setMessage(t('academicsPages.streams.saved', "Saved"));
        setFormData({ name: '', class_id: '' });
        closeModal();
        load();
      }
    } catch (e: any) {
      setMessage((typeof e?.message === 'string' && e?.message && !(uiIsArabic() && isEnglishText(e?.message)) ? e?.message : t('academicsPages.streams.failed', "Something went wrong.")));
    } finally {
      setSaving(false);
    }
  };

  const deleteStream = async (id: number) => {
    const result = await Swal.fire({
      title: t('academicsPages.streams.sure', "Are you sure?"),
      text: t('academicsPages.streams.noRevert', "You won't be able to revert this!"),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: t('academicsPages.streams.yesDelete', "Yes, delete it!"),
      cancelButtonText: t('academicsPages.streams.cancel', "Cancel")
    });
    if (!result.isConfirmed) return;
    try {
      const response = await fetch(`${API_BASE}/streams?id=${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        Swal.fire(t('academicsPages.streams.deletedTitle', "Deleted!"), t('academicsPages.streams.deletedText', "Stream deleted successfully."), 'success');
        load();
      } else {
        Swal.fire(t('academicsPages.streams.errorTitle', "Error!"), (result.error && !(uiIsArabic() && isEnglishText(result.error))) ? result.error : t('academicsPages.streams.deleteFailed', "Failed to delete stream"), 'error');
      }
    } catch (error) {
      Swal.fire(t('academicsPages.streams.errorTitle', "Error!"), t('academicsPages.streams.deleteError', "An error occurred while deleting the stream"), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 bg-clip-text text-transparent">{t('academicsPages.streams.title', "Streams")}</h1>
        <button onClick={load} disabled={loading} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-black/5 dark:bg-white/10 hover:bg-black/10 disabled:opacity-40 flex items-center gap-1"><RefreshCw className="w-3 h-3"/>{loading?t('academicsPages.streams.loading', "Loading"):t('academicsPages.streams.reload', "Reload")}</button>
        <button onClick={openModal} className="ms-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white flex items-center gap-1"><Plus className="w-3 h-3"/>{t('academicsPages.streams.new', "New")}</button>
      </div>
      {message && <div className="text-xs font-medium text-indigo-600 dark:text-fuchsia-400">{message}</div>}
      <div className="overflow-auto rounded-xl border border-white/30 dark:border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-slate-100/60 dark:bg-slate-800/60">
            <tr>
              <th className="text-start px-3 py-2">{t('academicsPages.streams.name', "Name")}</th>
              <th className="text-start px-3 py-2">{t('academicsPages.streams.class', "Class")}</th>
              <th className="px-3 py-2"/>
            </tr>
          </thead>
          <tbody>
            {items.map(r=> (
              <tr key={r.id} className="odd:bg-white/50 dark:odd:bg-slate-800/40">
                <td className="px-3 py-1.5 font-medium">{r.name}</td>
                <td className="px-3 py-1.5">{classes.find(c=>c.id===r.class_id)?.name||'-'}</td>
                <td className="px-3 py-1.5 text-end">
                  <button onClick={()=>edit(r)} className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10" title={t('academicsPages.streams.editStream', "Edit stream")}>
                    <Edit3 className="w-4 h-4"/>
                  </button>
                  <button onClick={() => deleteStream(r.id)} className="ms-2 p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10" title={t('academicsPages.streams.deleteStream', "Delete stream")}>
                    <X className="w-4 h-4 text-red-600"/>
                  </button>
                </td>
              </tr>
            ))}
            {items.length===0 && !loading && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">{t('academicsPages.streams.none', "No streams")}</td></tr>}
          </tbody>
        </table>
        {loading && <div className="flex items-center gap-2 px-4 py-3 text-xs"><Loader2 className="w-4 h-4 animate-spin"/> {t('academicsPages.streams.loadingDots', "Loading...")}</div>}
      </div>
      {showForm && (
        <div className="relative p-6 rounded-2xl border border-white/30 dark:border-white/10 bg-gradient-to-br from-white/90 via-white/70 to-white/50 dark:from-slate-900/80 dark:via-slate-900/60 dark:to-slate-800/50 backdrop-blur-xl shadow-xl space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase">{form.id? t('academicsPages.streams.editTitle', "Edit Stream"):t('academicsPages.streams.newTitle', "New Stream")}</h2>
            <button onClick={()=>setShowForm(false)} aria-label={t('academicsPages.streams.close', "Close")} className="ms-auto p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10"><X className="w-4 h-4"/></button>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">{t('academicsPages.streams.name', "Name")}</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className={fieldCls} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">{t('academicsPages.streams.class', "Class")}</label>
              <select value={form.class_id||0} onChange={e=>setForm(f=>({...f,class_id:parseInt(e.target.value)}))} className={fieldCls}>
                <option value={0}>{t('academicsPages.streams.selectClass', "Select Class")}</option>
                {classes.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={()=>{reset();}} type="button" className="px-4 py-2 rounded-lg text-xs font-medium bg-black/5 dark:bg-white/10">{t('academicsPages.streams.reset', "Reset")}</button>
            <button disabled={saving || !form.name?.trim() || !form.class_id} onClick={save} className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white disabled:opacity-40"><Save className="w-4 h-4"/>{saving? t('academicsPages.streams.saving', "Saving..."):t('academicsPages.streams.save', "Save")}</button>
          </div>
        </div>
      )}

      <Transition appear show={isModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={closeModal}>
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm" />

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex items-center justify-center min-h-full p-4">
              <Dialog.Panel className="w-full max-w-lg p-6 bg-gradient-to-br from-gray-800 via-gray-900 to-black text-white rounded-2xl shadow-2xl">
                <Dialog.Title className="text-xl font-bold text-center mb-4">{t('academicsPages.streams.addStream', "Add Stream")}</Dialog.Title>
                <button onClick={closeModal} aria-label={t('academicsPages.streams.close', "Close")} className="absolute top-4 end-4 p-2 rounded-full bg-gray-700 hover:bg-gray-600">
                  <X className="w-5 h-5 text-white" />
                </button>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium">{t('academicsPages.streams.streamName', "Stream Name")}</label>
                    <input
                      id="name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="class_id" className="block text-sm font-medium">{t('academicsPages.streams.class', "Class")}</label>
                    <select
                      id="class_id"
                      name="class_id"
                      value={formData.class_id || ''}
                      onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">{t('academicsPages.streams.selectAClass', "Select a class")}</option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end">
                    <button type="submit" className="px-6 py-2 bg-gradient-to-r from-green-400 to-blue-500 text-white rounded-lg shadow-md hover:shadow-lg transition-transform transform hover:scale-105">{t('academicsPages.streams.save', "Save")}</button>
                  </div>
                </form>
              </Dialog.Panel>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};
export default StreamsManager;