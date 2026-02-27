"use client";
import React, { useState, useEffect, Fragment } from 'react';
import useSWR from 'swr';
import { Dialog, Transition, Listbox } from '@headlessui/react';
import { Plus, Check, ChevronsUpDown, X } from 'lucide-react';

const API_BASE=process.env.NEXT_PUBLIC_API_URL || '';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());

interface ClassRec { id:number; name:string; }
interface YearRec { id:number; name:string; }

const fieldBase="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-white/40 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-400 text-sm placeholder-gray-400 dark:placeholder-gray-500 backdrop-blur";

export default function AdmitStudentPage(){
  const classesSWR=useSWR(`${API_BASE}/api/classes`,fetcher);
  const yearsSWR=useSWR(`${API_BASE}/api/academic_years`,fetcher);
  const classes:ClassRec[]=classesSWR.data?.data||[];
  const years:YearRec[]=yearsSWR.data?.data||[];
  const [open,setOpen]=useState(true);
  const [first,setFirst]=useState('');
  const [last,setLast]=useState('');
  const [gender,setGender]=useState('M');
  const [dob,setDob]=useState('');
  const [acyear,setAcyear]=useState<number|undefined>();
  const [secularClass,setSecularClass]=useState<ClassRec|undefined>();
  const [theologyClass,setTheologyClass]=useState<ClassRec|undefined>();
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const submit=async(e:React.FormEvent)=>{ 
    e.preventDefault(); 
    if(!secularClass||!theologyClass||!acyear) return; 
    setLoading(true); 
    setResult(null);
    setError(null);
    
    try { 
      // Use Next.js API endpoint
      const formData = new FormData();
      formData.append('first_name', first);
      formData.append('last_name', last);
      formData.append('gender', gender);
      formData.append('date_of_birth', dob);
      formData.append('secular_class_id', secularClass.id.toString());
      formData.append('theology_class_id', theologyClass.id.toString());
      formData.append('academic_year_id', acyear.toString());
      
      const r = await fetch(`${API_BASE}/api/students/full`, {
        method: 'POST',
        body: formData
      });
      
      const j = await r.json();
      
      if (r.ok) {
        setResult(j);
        if (j.success) {
          setFirst('');
          setLast('');
          setDob('');
        }
      } else {
        setError(j.error || 'Failed to admit student');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <button onClick={()=>setOpen(true)} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white shadow-lg hover:brightness-110"><Plus className="w-4 h-4"/>Admit Student</button>
      <AdmissionModal open={open} onClose={()=>setOpen(false)} {...{first,last,gender,dob,classes,years,acyear,setAcyear,secularClass,setSecularClass,theologyClass,setTheologyClass,setFirst,setLast,setGender,setDob,submit,loading,result,error}} />
    </div>
  );
}

const AdmissionModal:React.FC<any> = ({open,onClose,first,last,gender,dob,setFirst,setLast,setGender,setDob,classes,years,acyear,setAcyear,secularClass,setSecularClass,theologyClass,setTheologyClass,submit,loading,result,error})=>{
  return <Transition appear show={open} as={Fragment}>
    <Dialog as="div" className="relative z-50" onClose={onClose}>
      <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
        <div className="fixed inset-0 bg-gradient-to-br from-slate-900/80 via-fuchsia-900/60 to-indigo-900/80 backdrop-blur" />
      </Transition.Child>
      <div className="fixed inset-0 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-3xl">
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
            <Dialog.Panel className="relative rounded-3xl border border-white/20 dark:border-white/10 bg-gradient-to-br from-white/90 via-white/70 to-white/50 dark:from-slate-900/90 dark:via-slate-900/70 dark:to-slate-800/60 backdrop-blur-2xl shadow-2xl overflow-hidden">
              <div className="absolute inset-0 pointer-events-none [mask-image:radial-gradient(circle_at_30%_20%,black,transparent)]">
                <div className="absolute -top-10 -right-10 w-72 h-72 bg-pink-500/30 blur-3xl rounded-full" />
                <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-indigo-500/30 blur-3xl rounded-full" />
              </div>
              <form onSubmit={submit} className="relative p-8 space-y-8">
                <div className="flex items-start justify-between">
                  <Dialog.Title className="text-2xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 bg-clip-text text-transparent">Admit New Student</Dialog.Title>
                  <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 backdrop-blur"><X className="w-6 h-6"/></button>
                </div>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="space-y-3 md:col-span-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">First Name</label>
                        <input required value={first} onChange={e=>setFirst(e.target.value)} className={fieldBase} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">Last Name</label>
                        <input required value={last} onChange={e=>setLast(e.target.value)} className={fieldBase} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">Gender</label>
                        <select value={gender} onChange={e=>setGender(e.target.value)} className={fieldBase}>
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">Date of Birth</label>
                        <input type="date" value={dob} onChange={e=>setDob(e.target.value)} className={fieldBase} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">Academic Year</label>
                      <select value={acyear||''} onChange={e=>setAcyear(e.target.value?parseInt(e.target.value):undefined)} className={fieldBase}>
                        <option value="">Select Academic Year</option>
                        {years.map(y=> <option key={y.id} value={y.id}>{y.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <DualSelect label="Secular Class" value={secularClass} onChange={setSecularClass} options={classes} />
                    <DualSelect label="Theology Class" value={theologyClass} onChange={setTheologyClass} options={classes} accent="theology" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 pt-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400 min-h-[1.25rem]">
                    {error && <span className="text-red-600">{error}</span>}
                    {result && !error && (result.error ? 
                      <span className="text-red-600">{result.error}</span>: 
                      <span className="text-green-600">Admitted #{result.admission_no || result.student_id}</span>)}
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20">Cancel</button>
                    <button disabled={loading||!secularClass||!theologyClass||!acyear} type="submit" className="relative px-6 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 shadow disabled:opacity-40 disabled:cursor-not-allowed">
                      <span className={loading? 'opacity-0':'opacity-100 transition'}>Admit Student</span>
                      {loading && <span className="absolute inset-0 flex items-center justify-center"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/></span>}
                    </button>
                  </div>
                </div>
              </form>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </div>
    </Dialog>
  </Transition>;
};

const DualSelect:React.FC<{label:string; value?:ClassRec; onChange:(v:ClassRec)=>void; options:ClassRec[]; accent?:string}> = ({label,value,onChange,options,accent}) => {
  const accentCls = accent==='theology' ? 'from-emerald-500/20 to-teal-500/10 ring-emerald-500/40' : 'from-indigo-500/20 to-fuchsia-500/10 ring-fuchsia-500/40';
  return (
    <Listbox value={value} onChange={onChange}>
      <div className="space-y-1">
        <Listbox.Label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">{label}</Listbox.Label>
        <div className={`relative rounded-xl border border-white/40 dark:border-white/10 bg-gradient-to-br ${accentCls} backdrop-blur px-3 py-2 cursor-pointer`}>
          <Listbox.Button className="flex w-full items-center justify-between text-left text-sm font-medium">
            <span className="truncate">{value? value.name : 'Select class'}</span>
            <ChevronsUpDown className="w-4 h-4 opacity-60"/>
          </Listbox.Button>
          <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <Listbox.Options className="absolute z-10 mt-2 left-0 right-0 max-h-60 overflow-auto rounded-xl border border-white/30 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-xl p-1 text-sm">
              {options.map(o => (
                <Listbox.Option key={o.id} value={o} className={({active,selected})=>`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ${active? 'bg-black/5 dark:bg-white/10':''} ${selected? 'text-fuchsia-600 dark:text-fuchsia-400 font-semibold':''}`}>
                  {({selected}) => (<>
                    <span className="flex-1 truncate">{o.name}</span>
                    {selected && <Check className="w-4 h-4"/>}
                  </>)}
                </Listbox.Option>
              ))}
              {options.length===0 && <div className="px-3 py-4 text-center text-xs text-slate-500">No classes</div>}
            </Listbox.Options>
          </Transition>
        </div>
      </div>
    </Listbox>
  );
};