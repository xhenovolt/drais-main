"use client";
import React, { Fragment, useEffect, useState, useRef, useCallback } from 'react';
import { Dialog, Transition, Listbox } from '@headlessui/react';
import { X, ChevronsUpDown, Check, Loader2, Upload, Camera, User, AlertCircle, Image as ImageIcon, Download, BookOpen, ChevronDown } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import Swal from 'sweetalert2';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';

const API_BASE = '/api';

interface ClassRec { id:number; name:string; curriculum_id?:number|null; }
interface Curriculum { id:number; code:string; name:string; }
interface AcademicYear { id:number; name:string; status:string; }
interface TermRec { id:number; name:string; academic_year_id:number; status:string; }

const Field:React.FC<{label:string; className?:string; children:React.ReactNode}> = ({label,className='',children}) => (
  <div className={className}>
    <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">{label}</label>
    {children}
  </div>
);

const fieldCls = "w-full px-3 py-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 backdrop-blur text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-400 transition";
const nameFieldCls = fieldCls + " uppercase";

const ClassSelect:React.FC<{label:string; options:ClassRec[]; value?:ClassRec; onChange:(c:ClassRec)=>void; loading:boolean; accent:'secular'|'theology'}> = ({label,options,value,onChange,loading,accent}) => {
  const accentCls = accent==='theology' ? 'from-emerald-500/20 to-teal-500/10 ring-emerald-500/40' : 'from-indigo-500/20 to-fuchsia-500/10 ring-fuchsia-500/40';
  return (
    <Listbox value={value || null} onChange={onChange}>
      <div className="space-y-1">
        <Listbox.Label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">{label}</Listbox.Label>
        <div className={`relative rounded-xl border border-white/40 dark:border-white/10 bg-gradient-to-br ${accentCls} backdrop-blur px-3 py-2`}>
          <Listbox.Button className="flex w-full items-center justify-between text-left text-sm font-medium">
            <span className="truncate">{value? value.name : (loading? 'Loading...' : 'Select class')}</span>
            <ChevronsUpDown className="w-4 h-4 opacity-60"/>
          </Listbox.Button>
          <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <Listbox.Options className="absolute z-50 mt-2 left-0 right-0 max-h-72 overflow-auto rounded-xl border border-white/30 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl p-1 text-sm">
              {options.map(o => (
                <Listbox.Option key={o.id} value={o} className={({active,selected})=>`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ${active? 'bg-black/5 dark:bg-white/10':''} ${selected? 'text-fuchsia-600 dark:text-fuchsia-400 font-semibold':''}`}>
                  {({selected}) => (<><span className="flex-1 truncate">{o.name}</span>{selected && <Check className="w-4 h-4"/>}</>)}
                </Listbox.Option>
              ))}
              {!loading && options.length===0 && <div className="px-3 py-4 text-center text-xs text-slate-500">No classes</div>}
            </Listbox.Options>
          </Transition>
        </div>
      </div>
    </Listbox>
  );
};

const FutSelect:React.FC<{label:string; items:any; value?:{id:number; name:string}; onChange:(v:any)=>void; placeholder?:string; accent?:'year'|'term'; disabled?:boolean}> = ({label,items,value,onChange,placeholder='Select',accent='year',disabled}) => {
  const list = Array.isArray(items)? items : (Array.isArray(items?.data)? items.data : []); // guard
  const accentCls = accent==='term' ? 'from-pink-500/20 to-rose-500/10 ring-pink-500/40' : 'from-cyan-500/20 to-sky-500/10 ring-cyan-500/40';
  return (
    <Listbox value={value || null} onChange={onChange} disabled={disabled}>
      <div className="space-y-1">
        <Listbox.Label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">{label}</Listbox.Label>
        <div className={`relative rounded-xl border border-white/40 dark:border-white/10 bg-gradient-to-br ${accentCls} backdrop-blur px-3 py-2 ${disabled?'opacity-50 cursor-not-allowed':'cursor-pointer'}`}>          
          <Listbox.Button className="flex w-full items-center justify-between text-left text-sm font-medium">
            <span className="truncate">{value? value.name : placeholder}</span>
            <ChevronsUpDown className="w-4 h-4 opacity-60"/>
          </Listbox.Button>
          {!disabled && (
            <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
              <Listbox.Options className="absolute z-50 mt-2 left-0 right-0 max-h-72 overflow-auto rounded-xl border border-white/30 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl p-1 text-sm">
                {list.map((o:any) => (
                  <Listbox.Option key={o.id} value={o} className={({active,selected})=>`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ${active? 'bg-black/5 dark:bg-white/10':''} ${selected? 'text-fuchsia-600 dark:text-fuchsia-400 font-semibold':''}`}>
                    {({selected}) => (<><span className="flex-1 truncate">{o.name}</span>{selected && <Check className="w-4 h-4"/>}</>)}
                  </Listbox.Option>
                ))}
                {list.length===0 && <div className="px-3 py-4 text-center text-xs text-slate-500">No options</div>}
              </Listbox.Options>
            </Transition>)}
        </div>
      </div>
    </Listbox>
  );
};

export const StudentWizard:React.FC<{open:boolean; onClose:()=>void; onCreated?:()=>void; student?:any; onSubmit?:(data:any)=>Promise<void>; autoEnrollTahfiz?:boolean}> = ({open,onClose,onCreated = () => {},student,onSubmit,autoEnrollTahfiz = false}) => {
  const steps=['Bio','Admission','Contacts','Address','Review'];
  const [step,setStep]=useState(0);
  const [first,setFirst]=useState('');
  const [last,setLast]=useState('');
  const [otherName,setOtherName]=useState('');
  const [gender,setGender]=useState(''); // optional now
  const [dob,setDob]=useState('');
  const [nationality,setNationality]=useState('');
  const [placeBirth,setPlaceBirth]=useState('');
  const [placeResidence,setPlaceResidence]=useState('');
  const [yearSel,setYearSel]=useState<AcademicYear|null>(null);
  const [termSel,setTermSel]=useState<TermRec|null>(null);
  const [secularClass,setSecularClass]=useState<ClassRec|null>(null);
  const [theologyClass,setTheologyClass]=useState<ClassRec|null>(null);
  const [motherName,setMotherName]=useState('');
  const [motherContact,setMotherContact]=useState('');
  const [motherOccupation,setMotherOccupation]=useState('');
  const [motherAlive,setMotherAlive]=useState<'alive'|'deceased'|'unknown'>('unknown');
  const [motherDod,setMotherDod]=useState('');
  const [fatherName,setFatherName]=useState('');
  const [fatherContact,setFatherContact]=useState('');
  const [fatherOccupation,setFatherOccupation]=useState('');
  const [fatherAlive,setFatherAlive]=useState<'alive'|'deceased'|'unknown'>('unknown');
  const [fatherDod,setFatherDod]=useState('');
  const [guardianName,setGuardianName]=useState('');
  const [guardianContact,setGuardianContact]=useState('');
  const [guardianOccupation,setGuardianOccupation]=useState('');
  const [guardianAlive,setGuardianAlive]=useState<'alive'|'deceased'|'unknown'>('unknown');
  const [guardianDod,setGuardianDod]=useState('');
  const [nokName,setNokName]=useState('');
  const [nokContact,setNokContact]=useState('');
  const [nokRelationship,setNokRelationship]=useState('');
  const [districtId,setDistrictId]=useState('');
  const [classes,setClasses]=useState<ClassRec[]>([]);
  const [curriculums,setCurriculums]=useState<Curriculum[]>([]);
  const [years,setYears]=useState<AcademicYear[]>([]);
  const [terms,setTerms]=useState<TermRec[]>([]);
  const [loadingData,setLoadingData]=useState(false);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState<{type:'success'|'error'; text:string}|null>(null);
  const [touchedNames,setTouchedNames]=useState(false);
  const [enrollmentData, setEnrollmentData] = useState({
    class_id: '',
    theology_class_id: '',
    stream_id: '',
    academic_year_id: '',
    term_id: '',
  });
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [photoFile, setPhotoFile] = useState<File|null>(null);
  const [villageId, setVillageId] = useState('');
  const [noOfJuzus, setNoOfJuzus] = useState('');
  const [prevSchool, setPrevSchool] = useState('');
  const [prevSchoolYear, setPrevSchoolYear] = useState('');
  const [prevClassTheology, setPrevClassTheology] = useState('');
  const [prevClassSecular, setPrevClassSecular] = useState('');
  const [nationalityId, setNationalityId] = useState('');
  const [orphanStatus, setOrphanStatus] = useState('');
  const [livingStatus, setLivingStatus] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New state for PDF generation
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [admissionData, setAdmissionData] = useState<any>(null);
  const [schoolName, setSchoolName] = useState('School'); // Will be fetched dynamically
  const [tahfizAutoEnroll, setTahfizAutoEnroll] = useState(autoEnrollTahfiz);
  
  // Collapsible sections state
  const [expandBiographic, setExpandBiographic] = useState(false);
  const [expandPhoto, setExpandPhoto] = useState(false);

  const reset = () => { 
    setStep(0); 
    setFirst(''); 
    setLast(''); 
    setGender(''); 
    setDob(''); 
    setNationality(''); 
    setPlaceBirth(''); 
    setPlaceResidence(''); 
    setYearSel(null); 
    setTermSel(null); 
    setSecularClass(null); 
    setTheologyClass(null); 
    setMotherName(''); 
    setMotherContact(''); 
    setMotherOccupation(''); 
    setMotherAlive('unknown'); 
    setMotherDod(''); 
    setFatherName(''); 
    setFatherContact(''); 
    setFatherOccupation(''); 
    setFatherAlive('unknown'); 
    setFatherDod(''); 
    setGuardianName(''); 
    setGuardianContact(''); 
    setGuardianOccupation(''); 
    setGuardianAlive('unknown'); 
    setGuardianDod(''); 
    setNokName(''); 
    setNokContact(''); 
    setNokRelationship(''); 
    setDistrictId(''); 
    setMessage(null); 
    setTouchedNames(false);
    setPhone('');
    setAddress('');
    setPhotoFile(null);
    setPhotoPreview('');
    setVillageId('');
    setNoOfJuzus('');
    setPrevSchool('');
    setPrevSchoolYear('');
    setPrevClassTheology('');
    setPrevClassSecular('');
    setNationalityId('');
    setOrphanStatus('');
    setLivingStatus('');
  };
  const handleClose = () => { if(loading) return; reset(); onClose(); };

  useEffect(()=>{ 
    if(open){ 
      setStep(0); 
      setMessage(null); 
      setLoadingData(true); 
      const toArr=(v:any)=> Array.isArray(v)? v : (Array.isArray(v?.data)? v.data: []); 
      Promise.all([
        fetch(`${API_BASE}/classes`).then(r=>r.json()).catch(()=>({})),
        fetch(`${API_BASE}/curriculums`).then(r=>r.json()).catch(()=>({})),
        fetch(`${API_BASE}/academic_years`).then(r=>r.json()).catch(()=>({})),
        fetch(`${API_BASE}/terms`).then(r=>r.json()).catch(()=>({})),
        fetch(`${API_BASE}/school-config`).then(r=>r.json()).catch(()=>({}))
      ]).then(([cl,cu,ya,te,schoolCfg])=>{ 
        const yrs=toArr(ya); 
        setYears(yrs); 
        setClasses(toArr(cl)); 
        setCurriculums(toArr(cu)); 
        setTerms(toArr(te)); 
        // Fetch school name from centralized config
        if(schoolCfg?.school?.name) {
          setSchoolName(schoolCfg.school.name);
        }
        if(yrs.length){ 
          const yStr=String(new Date().getFullYear()); 
          const match=yrs.find(y=>y.name===yStr || y.name.includes(yStr)); 
          if(match) setYearSel(match);
        } 
      }).finally(()=>setLoadingData(false)); 
    } else { 
      reset(); 
    } 
  },[open]);

  useEffect(()=>{ 
    if(termSel){ 
      const y=years.find(y=>y.id===termSel.academic_year_id); 
      if(y) setYearSel(y);
    } 
  },[termSel,years]);

  const codeById:Record<number,string> = curriculums.reduce((a,c)=>{ a[c.id]=c.code||c.name; return a; },{} as Record<number,string>);
  // Relax filtering: if no curriculum code match, show all classes so list is not empty
  const rawSec = classes.filter(c=>{ const raw=c.curriculum_id? codeById[c.curriculum_id]:''; return raw?.toLowerCase().includes('secular'); });
  const rawTheo = classes.filter(c=>{ const raw=c.curriculum_id? codeById[c.curriculum_id]:''; return raw?.toLowerCase().includes('theolog'); });
  const secularClasses = rawSec.length? rawSec : classes; // fallback to all
  const theologyClasses = rawTheo.length? rawTheo : classes; // fallback to all
  const currentYearStr = String(new Date().getFullYear());
  const autoYear = yearSel || years.find(y=> y.name===currentYearStr || y.name.includes(currentYearStr) || y.status==='active');

  const canNext = () => { if(step===0) return !!first.trim() && !!last.trim(); return true; };
  const next=()=>{ if(step===0) setTouchedNames(true); if(step<steps.length-1 && canNext()) setStep(s=>s+1); };
  const prev=()=>{ if(step>0) setStep(s=>s-1); };

  const handleEnrollmentChange = (e) => {
    const { name, value } = e.target;
    setEnrollmentData((prev) => ({ ...prev, [name]: value }));
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    multiple: false,
    maxSize: 5 * 1024 * 1024, // 5MB limit
  });

  const removePhoto = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoFile(null);
    setPhotoPreview('');
  };

  const handlePhotoUpload = async (file: File) => {
    const uploadData = new FormData();
    uploadData.append('photo', file);

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/students/photo', {
        method: 'POST',
        body: uploadData,
      });
      const result = await response.json();

      if (result.success) {
        setPhotoFile(file); // Store the uploaded file
        setMessage('Photo uploaded successfully.');
      } else {
        setMessage('Failed to upload photo.');
      }
    } catch (error) {
      setMessage('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const generateAdmissionPDF = async (studentData: any) => {
    setGeneratingPDF(true);
    
    try {
      toast.loading('Generating admission form...', {
        duration: 3000,
        position: 'top-right',
        id: 'pdf-toast'
      });

      // Fetch school info from centralized DB-driven configuration
      let schoolInfo = {
        school_name: schoolName || 'School',
        school_address: '',
        school_contact: '',
        school_email: '',
        principal_name: 'Headteacher'
      };

      try {
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/api';
        // Try new unified school-config endpoint first
        const response = await fetch(`${API_BASE_URL}/school-config`);
        if (response.ok) {
          const result = await response.json();
          const school = result.school || result.data;
          if (school) {
            schoolInfo = {
              school_name: school.name || school.school_name || schoolInfo.school_name,
              school_address: school.address || school.school_address || schoolInfo.school_address,
              school_contact: school.contact?.phone || school.school_contact || schoolInfo.school_contact,
              school_email: school.contact?.email || school.school_email || schoolInfo.school_email,
              principal_name: school.principal?.name || school.principal?.title || school.principal_name || schoolInfo.principal_name
            };
          }
        }
      } catch (err) {
        console.warn('Could not fetch school config, using defaults:', err);
      }

      const doc = new jsPDF('portrait', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // School Header - Using dynamic school name
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(schoolInfo.school_name, pageWidth / 2, 25, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(schoolInfo.school_address, pageWidth / 2, 32, { align: 'center' });
      doc.text(schoolInfo.school_contact, pageWidth / 2, 38, { align: 'center' });
      if (schoolInfo.school_email) {
        doc.text(`Email: ${schoolInfo.school_email}`, pageWidth / 2, 44, { align: 'center' });
      }

      // Decorative line
      doc.setLineWidth(0.5);
      doc.line(20, 52, pageWidth - 20, 52);

      // Document Title
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('OFFICIAL ADMISSION LETTER', pageWidth / 2, 65, { align: 'center' });

      // Date and Reference
      const currentDate = new Date().toLocaleDateString('en-GB');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${currentDate}`, 20, 75);
      const admissionNum = studentData.admission_no ? studentData.admission_no.toString().split('/').pop() || '001' : '001';
      doc.text(`Ref: ${admissionNum}/${new Date().getFullYear()}`, 20, 80);

      // Admission Details Section
      let yPosition = 95;
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('STUDENT ADMISSION DETAILS', 20, yPosition);
      yPosition += 10;

      // Student Information Table
      const studentInfo = [
        ['Admission Number:', studentData.admission_no || 'To be assigned'],
        ['Full Name:', `${studentData.first_name} ${studentData.last_name} ${studentData.other_name || ''}`.trim()],
        ['Gender:', studentData.gender || 'Not specified'],
        ['Date of Birth:', studentData.date_of_birth || 'Not provided'],
        ['Phone Number:', studentData.phone || 'Not provided'],
        ['Address:', studentData.address || 'Not provided'],
        ['Nationality:', studentData.nationality_id || 'Not provided'],
        ['Class Assigned (Secular):', secularClass?.name || 'To be determined'],
        ['Class Assigned (Theology):', theologyClass?.name || 'To be determined'],
        ['Academic Year:', yearSel?.name || 'Current Year'],
        ['Term:', termSel?.name || 'Current Term'],
        ['Admission Date:', currentDate]
      ];

      autoTable(doc, {
        body: studentInfo,
        startY: yPosition,
        theme: 'plain',
        styles: {
          fontSize: 10,
          cellPadding: 2
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50 },
          1: { cellWidth: 120 }
        },
        margin: { left: 20, right: 20 }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;

      // Parent/Guardian Information
      if (motherName || fatherName || guardianName) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('PARENT/GUARDIAN INFORMATION', 20, yPosition);
        yPosition += 10;

        const parentInfo = [];
        if (motherName) {
          parentInfo.push(['Mother:', `${motherName} - ${motherContact || 'No contact'} (${motherAlive})`]);
        }
        if (fatherName) {
          parentInfo.push(['Father:', `${fatherName} - ${fatherContact || 'No contact'} (${fatherAlive})`]);
        }
        if (guardianName) {
          parentInfo.push(['Guardian:', `${guardianName} - ${guardianContact || 'No contact'} (${guardianAlive})`]);
        }
        if (nokName) {
          parentInfo.push(['Next of Kin:', `${nokName} - ${nokContact || 'No contact'} (${nokRelationship || 'Relative'})`]);
        }

        autoTable(doc, {
          body: parentInfo,
          startY: yPosition,
          theme: 'plain',
          styles: {
            fontSize: 10,
            cellPadding: 2
          },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 30 },
            1: { cellWidth: 140 }
          },
          margin: { left: 20, right: 20 }
        });

        yPosition = (doc as any).lastAutoTable.finalY + 15;
      }

      // Admission Statement
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const admissionText = `We are pleased to inform you that ${studentData.first_name} ${studentData.last_name} has been officially admitted to ${schoolInfo.school_name} for the academic year ${yearSel?.name || new Date().getFullYear()}. This admission is subject to the terms and conditions outlined in our school handbook.`;
      
      const splitText = doc.splitTextToSize(admissionText, pageWidth - 40);
      doc.text(splitText, 20, yPosition);
      yPosition += splitText.length * 5 + 10;

      // Requirements Section
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('ADMISSION REQUIREMENTS:', 20, yPosition);
      yPosition += 8;

      const requirements = [
        '• Complete and submit all required documentation',
        '• Payment of admission fees as per school fee structure',
        '• Medical examination and vaccination records',
        '• Previous school records and transcripts (if applicable)',
        '• Passport-size photographs (4 copies)',
        '• Copy of birth certificate or identification documents'
      ];

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      requirements.forEach(req => {
        doc.text(req, 25, yPosition);
        yPosition += 6;
      });

      yPosition += 10;

      // COMPREHENSIVE SCHOOL POLICIES SECTION
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SCHOOL POLICIES & EXPECTATIONS', 20, yPosition);
      yPosition += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('1. DRESS CODE & UNIFORM REQUIREMENTS', 20, yPosition);
      yPosition += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const dressCodeText = 'School Uniform (Mandatory): Navy blue skirt (knee-length), white blouse, navy blue jacket, white socks, black shoes. Hair must be neatly groomed; hijab encouraged in line with Islamic teachings. No makeup, nail polish, or visible jewelry except simple earrings. All attire must be clean and well-maintained. Uniform violations result in disciplinary action.';
      const dressCodeLines = doc.splitTextToSize(dressCodeText, pageWidth - 40);
      doc.text(dressCodeLines, 25, yPosition);
      yPosition += dressCodeLines.length * 3.5 + 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('2. ATTENDANCE & PUNCTUALITY', 20, yPosition);
      yPosition += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const attendanceText = 'Reporting Time: 6:45 AM (Assembly at 7:00 AM). Maximum 2 days unexplained absence per term. Minimum 85% attendance required to sit examinations. Medical certificates required for absences exceeding 2 consecutive days. Poor attendance results in academic probation or expulsion.';
      const attendanceLines = doc.splitTextToSize(attendanceText, pageWidth - 40);
      doc.text(attendanceLines, 25, yPosition);
      yPosition += attendanceLines.length * 3.5 + 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('3. BEHAVIOR & DISCIPLINE GUIDELINES', 20, yPosition);
      yPosition += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const behaviorText = 'Prohibited: Bullying, theft, cheating, violence, drugs, alcohol, weapons, disrespect to authority, vandalism, or inappropriate conduct. Disciplinary measures: Verbal warning → Written warning → Detention → Parent meeting → Suspension → Expulsion. Serious violations (violence, theft, weapons) result in immediate suspension and possible expulsion.';
      const behaviorLines = doc.splitTextToSize(behaviorText, pageWidth - 40);
      doc.text(behaviorLines, 25, yPosition);
      yPosition += behaviorLines.length * 3.5 + 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('4. RELIGIOUS & PRAYER OBLIGATIONS', 20, yPosition);
      yPosition += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const religionText = 'Dhuhr Prayer (Midday): Mandatory for all Muslim students. Conducted in designated prayer hall during school hours. Friday Jumu\'ah prayers encouraged. During Ramadan, lighter meals and flexible PE activities provided. Islamic studies are core curriculum. All students, regardless of religion, are taught Islamic values: honesty, community, respect, compassion. Non-Muslim students fully respected and accommodated.';
      const religionLines = doc.splitTextToSize(religionText, pageWidth - 40);
      doc.text(religionLines, 25, yPosition);
      yPosition += religionLines.length * 3.5 + 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('5. ACADEMIC INTEGRITY & HOMEWORK', 20, yPosition);
      yPosition += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const academicText = 'Copying work or submitting work not your own constitutes cheating. First offense: Zero marks + detention. Second offense: Suspension. Third offense: Expulsion. Expected homework: S.1-S.2: 1.5-2 hours/day; S.3-S.4: 2.5-3.5 hours/day. Late homework receives 10% deduction per day. Remedial classes and peer tutoring available for struggling students.';
      const academicLines = doc.splitTextToSize(academicText, pageWidth - 40);
      doc.text(academicLines, 25, yPosition);
      yPosition += academicLines.length * 3.5 + 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('6. HEALTH, SAFETY & EMERGENCY PROCEDURES', 20, yPosition);
      yPosition += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const healthText = 'Medical facilities staffed during school hours. All students must be up-to-date on vaccinations. Fire drills conducted monthly. Emergency exits clearly marked. CCTV security cameras in public areas. Prohibited items: Sharp objects, lighters, matches, flammable materials, unauthorized mobile phones. School not responsible for lost items. Parents contacted immediately for serious medical or safety issues.';
      const healthLines = doc.splitTextToSize(healthText, pageWidth - 40);
      doc.text(healthLines, 25, yPosition);
      yPosition += healthLines.length * 3.5 + 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('7. COMMUNICATION WITH PARENTS/GUARDIANS', 20, yPosition);
      yPosition += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const communicationText = 'Report cards issued end of each term. Parent-teacher meetings held twice per term. School newsletters issued monthly. Online portal provides access to student progress and attendance. Parents expected to attend at least 2 meetings per term and monitor homework completion. Urgent issues trigger immediate parent notification.';
      const communicationLines = doc.splitTextToSize(communicationText, pageWidth - 40);
      doc.text(communicationLines, 25, yPosition);
      yPosition += communicationLines.length * 3.5 + 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('8. FEE PAYMENT & FINANCIAL OBLIGATIONS', 20, yPosition);
      yPosition += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const feeText = 'School fees are due on the first day of each term. Payment can be made via bank transfer, mobile money, or direct deposit at school offices. Failure to pay fees may result in suspension from classes. Fee payment is mandatory for examination eligibility.';
      const feeLines = doc.splitTextToSize(feeText, pageWidth - 40);
      doc.text(feeLines, 25, yPosition);
      yPosition += feeLines.length * 3.5 + 8;

      // IMPORTANT REMINDERS SECTION
      if (yPosition > pageHeight - 150) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('IMPORTANT REMINDERS', 20, yPosition);
      yPosition += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const reminders = [
        '• This admission is CONDITIONAL on submission of all required documents and fee payment',
        '• REPORTING DATE: ' + new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('en-GB'),
        '• Report by 6:45 AM; Assembly & Orientation begins at 7:00 AM',
        '• Late reporting without prior permission may result in forfeiture of admission',
        '• Parent/Guardian agreement to all policies is MANDATORY',
        '• School reserves right to amend policies with 2 weeks\' notice',
        '• Academic streams: Science (Biology, Chemistry, Physics) & Theology (Quranic, Islamic Law)'
      ];
      
      reminders.forEach(reminder => {
        doc.text(reminder, 25, yPosition);
        yPosition += 5;
      });

      yPosition += 8;

      // CONTACT INFORMATION
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('CONTACT INFORMATION FOR INQUIRIES:', 20, yPosition);
      yPosition += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const contactInfo = [
        `School: ${schoolInfo.school_name}`,
        `Location: ${schoolInfo.school_address || ''}`,
        `Telephone: ${schoolInfo.school_contact || ''}`,
        `Email: ${schoolInfo.school_email || ''}`,
        'Office Hours: 8:00 AM - 4:00 PM, Monday to Friday'
      ];
      
      contactInfo.forEach(contact => {
        doc.text(contact, 25, yPosition);
        yPosition += 5;
      });

      yPosition += 10;

      // ACKNOWLEDGMENT STATEMENT
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('ACKNOWLEDGMENT OF RECEIPT & ACCEPTANCE', 20, yPosition);
      yPosition += 7;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const acknowledgmentText = `I/We acknowledge receipt of this Official Admission Letter and confirm that I/we understand and accept all conditions, policies, and expectations outlined herein. I/We commit to supporting ${studentData.first_name} ${studentData.last_name}'s academic and personal development in accordance with the values and standards of ${schoolInfo.school_name}.`;
      
      const ackLines = doc.splitTextToSize(acknowledgmentText, pageWidth - 40);
      doc.text(ackLines, 20, yPosition);
      yPosition += ackLines.length * 3.5 + 12;

      // Signatures Section
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('AUTHORIZED BY:', 20, yPosition);
      doc.text('PARENT/GUARDIAN ACCEPTANCE:', pageWidth / 2 + 10, yPosition);
      yPosition += 20;

      // Signature lines
      doc.line(20, yPosition, 85, yPosition);
      doc.line(pageWidth / 2 + 10, yPosition, pageWidth - 20, yPosition);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Headmistress/Headmaster', 20, yPosition + 2);
      doc.text('Parent/Guardian', pageWidth / 2 + 10, yPosition + 2);
      
      yPosition += 10;
      doc.text('Date: _______________', 20, yPosition);
      doc.text('Date: _______________', pageWidth / 2 + 10, yPosition);

      // Footer
      yPosition = pageHeight - 15;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      const footerText = `This is an OFFICIAL document from ${schoolInfo.school_name}. Please keep this letter for your records. A scanned copy will be sent to your registered email address.`;
      const footerLines = doc.splitTextToSize(footerText, pageWidth - 40);
      doc.text(footerLines, pageWidth / 2, yPosition - footerLines.length * 2.5, { align: 'center' });

      // Generate and download
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const filename = `Admission_Letter_${studentData.first_name}_${studentData.last_name}_${timestamp}.pdf`;

      doc.save(filename);
      
      toast.success('Admission form downloaded successfully!', { id: 'pdf-toast' });
      
    } catch (error: any) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate admission form PDF', { id: 'pdf-toast' });
    } finally {
      setGeneratingPDF(false);
    }
  };

  const submit=async()=>{
    if (!first.trim() || !last.trim()) {
      setMessage({type:'error',text:'First name and last name are required. Please fill them in.'});
      setTouchedNames(true);
      return;
    }
    
    const formData = new FormData();
    formData.append('first_name', first.trim());
    formData.append('last_name', last.trim());
    formData.append('other_name', otherName || '');
    formData.append('gender', gender || '');
    formData.append('date_of_birth', dob || '');
    formData.append('phone', phone || '');
    formData.append('address', address || '');
    formData.append('village_id', villageId || '');
    formData.append('place_of_birth', placeBirth || '');
    formData.append('place_of_residence', placeResidence || '');
    formData.append('district_id', districtId || '');
    formData.append('nationality_id', nationalityId || '');
    formData.append('orphan_status', orphanStatus || '');
    formData.append('living_status', livingStatus || '');
    formData.append('secular_class_id', secularClass?.id ? String(secularClass.id) : '');
    formData.append('theology_class_id', theologyClass?.id ? String(theologyClass.id) : '');
    formData.append('academic_year_id', yearSel?.id ? String(yearSel.id) : '');
    formData.append('term_id', termSel?.id ? String(termSel.id) : '');
    formData.append('no_of_juzus_memorized', noOfJuzus || '');
    formData.append('previous_school', prevSchool || '');
    formData.append('previous_school_year', prevSchoolYear || '');
    formData.append('previous_class_theology', prevClassTheology || '');
    formData.append('previous_class_secular', prevClassSecular || '');
    if(photoFile) formData.append('photo', photoFile);
    
    // Contacts as JSON string
    const contacts:any[]=[];
    const push=(type:string,name:string,contact:string,occupation:string,alive:string,dod:string,extra?:any)=>{ if(!name && !contact && !occupation && alive==='unknown') return; const c:any={contact_type:type}; if(name) c.name=name; if(contact) c.contact=contact; if(occupation) c.occupation=occupation; if(alive!=='unknown') c.alive_status=alive; if(alive==='deceased' && dod) c.date_of_death=dod; Object.assign(c,extra||{}); contacts.push(c); };
    push('mother',motherName,motherContact,motherOccupation,motherAlive,motherDod);
    push('father',fatherName,fatherContact,fatherOccupation,fatherAlive,fatherDod);
    push('guardian',guardianName,guardianContact,guardianOccupation,guardianAlive,guardianDod,{is_primary:1});
    push('next_of_kin',nokName,nokContact,'','unknown','',{relationship:nokRelationship});
    formData.append('contacts', JSON.stringify(contacts));
    
    // Add Tahfiz auto-enrollment flag
    if (tahfizAutoEnroll) {
      formData.append('auto_enroll_tahfiz', 'true');
    }
    
    setLoading(true); 
    setMessage(null);
    
    try {
      const res= await fetch(`${API_BASE}/students/full`,{method:'POST',body:formData});
      let responseData = null;
      
      try {
        responseData = await res.json();
      } catch(jsonErr) {
        setMessage({type:'error',text:'Server error: Invalid JSON response'});
        setLoading(false);
        return;
      }
      
      if(res.ok) { 
        setMessage({type:'success',text:`Admitted ${responseData?.admission_no||'student'}`});
        
        // Store admission data for PDF generation
        const studentData = {
          ...responseData,
          first_name: first,
          last_name: last,
          other_name: otherName,
          gender: gender,
          date_of_birth: dob,
          phone: phone,
          address: address,
          nationality_id: nationalityId
        };
        
        setAdmissionData(studentData);
        
        try {
          // Auto-generate and download PDF first
          await generateAdmissionPDF(studentData);
        } catch (pdfError) {
          console.error('PDF generation failed:', pdfError);
          // Continue with success flow even if PDF fails
        }
        
        // Set step to review
        setStep(4);
        
        // Call onCreated callback safely
        try {
          onCreated();
        } catch (callbackError) {
          console.error('onCreated callback error:', callbackError);
          // Don't let callback errors break the flow
        }
        
        // Show success message with PDF info
        Swal.fire({
          title: 'Student Admitted Successfully!',
          html: `
            <div class="text-center">
              <p><strong>${responseData?.admission_no || 'Student'}</strong> has been admitted to ${schoolName}</p>
              <p class="mt-2 text-sm text-gray-600">The admission form has been automatically downloaded to your device.</p>
              <div class="mt-3 p-3 bg-green-50 rounded-lg">
                <div class="flex items-center justify-center gap-2">
                  <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  <span class="text-sm font-medium text-green-800">PDF Downloaded</span>
                </div>
              </div>
            </div>
          `,
          icon: 'success',
          confirmButtonText: 'Continue',
          customClass: {
            popup: 'rounded-2xl',
            confirmButton: 'bg-green-600 hover:bg-green-700'
          }
        });
        
      } else {
        setMessage({type:'error',text:responseData?.error||'Failed'});
      }
    } catch(e:any){ 
      setMessage({type:'error',text:e.message||'Network error'});
    } finally { 
      setLoading(false);
    } 
  };

  useEffect(() => {
    if (student) {
      setFirst(student.first_name);
      setLast(student.last_name);
      setOtherName(student.other_name);
      setGender(student.gender);
      setDob(student.date_of_birth);
      setPhone(student.phone);
      setAddress(student.address);
      setVillageId(student.village_id);
      setPlaceBirth(student.place_of_birth);
      setPlaceResidence(student.place_of_residence);
      setDistrictId(student.district_id);
      setNationalityId(student.nationality_id);
      setOrphanStatus(student.orphan_status);
      setLivingStatus(student.living_status);
      setNoOfJuzus(student.no_of_juzus_memorized);
      setPrevSchool(student.previous_school);
      setPrevSchoolYear(student.previous_school_year);
      setPrevClassTheology(student.previous_class_theology);
      setPrevClassSecular(student.previous_class_secular);
      setPhotoPreview(student.photo_url);
      // TODO: set classes and year/term based on student data
    } else {
      reset();
    }
  }, [student]);

  const handleSubmit = async (formData: any) => {
    try {
      let photoUrl = formData.photo_url;

      // Upload photo if one was selected
      if (photoFile) {
        setUploadingPhoto(true);
        
        const photoFormData = new FormData();
        photoFormData.append('photo', photoFile);
        photoFormData.append('student_id', formData.id || 'new');

        const photoResponse = await fetch('/api/students/upload-photo', {
          method: 'POST',
          body: photoFormData,
        });

        const photoResult = await photoResponse.json();
        
        if (photoResult.success) {
          photoUrl = photoResult.photo_url;
        } else {
          throw new Error(photoResult.error || 'Failed to upload photo');
        }
        
        setUploadingPhoto(false);
      }

      // Submit form data with photo URL
      const finalData = { ...formData, photo_url: photoUrl };
      
      if (onSubmit) {
        await onSubmit(finalData);
      } else {
        // Default submission logic - use the existing submit function
        await submit();
        return;
      }
      
      // Call onCreated callback safely
      try {
        onCreated();
      } catch (callbackError) {
        console.error('onCreated callback error:', callbackError);
        // Don't let callback errors break the flow
      }
    } catch (error: any) {
      setUploadingPhoto(false);
      Swal.fire({
        title: 'Error',
        text: error.message || 'An unexpected error occurred',
        icon: 'error',
        customClass: { popup: 'rounded-2xl' }
      });
    }
  };

  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-gradient-to-br from-slate-900/80 via-fuchsia-900/60 to-indigo-900/80 backdrop-blur" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-5xl">
            <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="relative rounded-3xl border border-white/15 dark:border-white/10 bg-gradient-to-br from-white/90 via-white/70 to-white/50 dark:from-slate-900/90 dark:via-slate-900/70 dark:to-slate-800/60 backdrop-blur-2xl shadow-2xl overflow-visible flex flex-col h-screen md:h-[85vh] max-h-[85vh]">
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute -top-16 -right-10 w-72 h-72 bg-fuchsia-400/20 blur-3xl rounded-full" />
                  <div className="absolute -bottom-24 -left-20 w-96 h-96 bg-indigo-500/20 blur-3xl rounded-full" />
                </div>
                <div className="relative p-6 border-b border-white/30 dark:border-white/10 flex flex-wrap gap-2 flex-shrink-0 z-40">
                  {steps.map((s,i)=>(<button key={s} type="button" onClick={()=>{ if(i<step && !loading) setStep(i); }} className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition ${i===step?'bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white shadow':'bg-white/40 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300'}`}>{i+1}. {s}</button>))}
                  <div className="ml-auto flex items-center gap-3 text-xs font-medium">
                    {message && <span className={message.type==='error'?'text-red-600':'text-green-600'}>{message.text}</span>}
                    {generatingPDF && (
                      <span className="flex items-center gap-2 text-blue-600">
                        <Download className="w-4 h-4 animate-bounce" />
                        Generating PDF...
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={handleClose} className="ml-2 p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10"><X className="w-5 h-5"/></button>
                </div>
                
                <div className="relative p-8 space-y-4 overflow-visible overflow-y-auto flex-1 h-screen md:h-auto">
                  {step===0 && (
                    <>
                      {/* Required Names Section */}
                      <div className="space-y-4 bg-gradient-to-br from-indigo-50/50 via-transparent to-fuchsia-50/30 dark:from-indigo-950/20 dark:via-transparent dark:to-fuchsia-950/10 px-4 py-5 rounded-2xl border border-indigo-200/50 dark:border-indigo-800/30">
                        <div className="mb-2">
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Student Names *</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Required fields</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Field label="First Name">
                            <input 
                              value={first} 
                              onChange={e=>setFirst(e.target.value.toUpperCase())} 
                              placeholder="e.g., KAGWINYRWOTH"
                              className={`${nameFieldCls} text-base font-semibold ${touchedNames && !first.trim()? 'ring-2 ring-red-500 border-red-500':''}`} 
                            />
                          </Field>
                          <Field label="Last Name">
                            <input 
                              value={last} 
                              onChange={e=>setLast(e.target.value.toUpperCase())} 
                              placeholder="e.g., PRISCILA"
                              className={`${nameFieldCls} text-base font-semibold ${touchedNames && !last.trim()? 'ring-2 ring-red-500 border-red-500':''}`} 
                            />
                          </Field>
                        </div>
                        
                        {/* Quick Submit Button - appears when names are filled */}
                        {first.trim() && last.trim() && (
                          <div className="flex gap-2 pt-3 border-t border-indigo-200/50 dark:border-indigo-800/30 mt-4">
                            <button
                              type="button"
                              onClick={() => {
                                if (canNext()) next();
                              }}
                              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                            >
                              Add Details
                            </button>
                            <button
                              type="button"
                              disabled={loading || generatingPDF}
                              onClick={submit}
                              className="flex-1 relative px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                            >
                              <span className={loading || generatingPDF ? 'opacity-0' : 'opacity-100'}>
                                ✓ Enroll Now
                              </span>
                              {(loading || generatingPDF) && (
                                <span className="absolute inset-0 flex items-center justify-center">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                </span>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Biographical Information - Collapsible */}
                      <div className="border border-gray-200/50 dark:border-gray-700/50 rounded-2xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandBiographic(!expandBiographic)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Biographical Information</h3>
                            <span className="text-xs text-gray-500 dark:text-gray-400">(optional)</span>
                          </div>
                          <ChevronDown className={`w-4 h-4 transition-transform ${expandBiographic ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {expandBiographic && (
                          <div className="px-4 py-4 border-t border-gray-200/50 dark:border-gray-700/50 space-y-4 bg-gradient-to-b from-gray-50/50 dark:from-gray-900/20 to-transparent">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Field label="Other Name"><input value={otherName} onChange={e=>setOtherName(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                              <Field label="Gender">
                                <select value={gender} onChange={e=>setGender(e.target.value)} className={fieldCls}>
                                  <option value="">Select</option>
                                  <option value="M">Male</option>
                                  <option value="F">Female</option>
                                </select>
                              </Field>
                              <Field label="Date of Birth"><input type="date" value={dob} onChange={e=>setDob(e.target.value)} className={fieldCls} /></Field>
                              <Field label="Phone"><input value={phone} onChange={e=>setPhone(e.target.value)} className={fieldCls} /></Field>
                              <Field label="Address" className="md:col-span-2"><input value={address} onChange={e=>setAddress(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                              <Field label="Nationality"><input value={nationalityId} onChange={e=>setNationalityId(e.target.value)} className={fieldCls} /></Field>
                              <Field label="Orphan Status">
                                <select value={orphanStatus} onChange={e=>setOrphanStatus(e.target.value)} className={fieldCls}>
                                  <option value="">--</option>
                                  <option value="orphan">Orphan</option>
                                  <option value="non_orphan">Non-Orphan</option>
                                </select>
                              </Field>
                              <Field label="Living Status">
                                <select value={livingStatus} onChange={e=>setLivingStatus(e.target.value)} className={fieldCls}>
                                  <option value="">--</option>
                                  <option value="alive">Alive</option>
                                  <option value="deceased">Deceased</option>
                                </select>
                              </Field>
                              <Field label="Place of Birth"><input value={placeBirth} onChange={e=>setPlaceBirth(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                              <Field label="Place of Residence"><input value={placeResidence} onChange={e=>setPlaceResidence(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                              <Field label="Juzus Memorized"><input value={noOfJuzus} onChange={e=>setNoOfJuzus(e.target.value)} className={fieldCls} /></Field>
                              <Field label="Previous School"><input value={prevSchool} onChange={e=>setPrevSchool(e.target.value)} className={fieldCls} /></Field>
                              <Field label="Previous School Year"><input value={prevSchoolYear} onChange={e=>setPrevSchoolYear(e.target.value)} className={fieldCls} /></Field>
                              <Field label="Previous Theology Class"><input value={prevClassTheology} onChange={e=>setPrevClassTheology(e.target.value)} className={fieldCls} /></Field>
                              <Field label="Previous Secular Class"><input value={prevClassSecular} onChange={e=>setPrevClassSecular(e.target.value)} className={fieldCls} /></Field>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Photo - Collapsible */}
                      <div className="border border-gray-200/50 dark:border-gray-700/50 rounded-2xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandPhoto(!expandPhoto)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Photo</h3>
                            <span className="text-xs text-gray-500 dark:text-gray-400">(optional)</span>
                          </div>
                          <ChevronDown className={`w-4 h-4 transition-transform ${expandPhoto ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {expandPhoto && (
                          <div className="px-4 py-4 border-t border-gray-200/50 dark:border-gray-700/50 space-y-4 bg-gradient-to-b from-gray-50/50 dark:from-gray-900/20 to-transparent">
                            <div className="flex items-center gap-4">
                              <img
                                src={photoPreview ? photoPreview : '/default-avatar.png'}
                                alt="Preview"
                                className="w-20 h-20 object-cover rounded-full border"
                              />
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  if (e.target.files?.[0]) {
                                    setPhotoFile(e.target.files[0]);
                                    setPhotoPreview(URL.createObjectURL(e.target.files[0]));
                                  }
                                }}
                                className={fieldCls}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Tahfiz Auto-Enrollment Option */}
                      {autoEnrollTahfiz && (
                        <div className="flex items-center space-x-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                          <input
                            type="checkbox"
                            id="tahfiz-enroll"
                            checked={tahfizAutoEnroll}
                            onChange={(e) => setTahfizAutoEnroll(e.target.checked)}
                            className="w-4 h-4 text-emerald-600 bg-white border-emerald-300 rounded focus:ring-emerald-500"
                          />
                          <div className="flex-1">
                            <label htmlFor="tahfiz-enroll" className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                              Automatically enroll in Tahfiz program
                            </label>
                            <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-0.5">
                              Student will be added to the default Tahfiz group and can start memorization tracking immediately.
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {step===1 && (
                    <div className="grid md:grid-cols-4 gap-6">
                      <div className="md:col-span-2"><FutSelect label="Term (Optional)" items={terms} value={termSel} onChange={(t:any)=>setTermSel(t)} placeholder={loadingData?`Loading...`:(terms.length? 'Select Term':'No Terms Found')} accent="term" disabled={loadingData || terms.length===0} /></div>
                      <div className="md:col-span-1"><ClassSelect label="Secular Class (Opt)" loading={loadingData} options={secularClasses} value={secularClass} onChange={setSecularClass} accent="secular" /></div>
                      <div className="md:col-span-1"><ClassSelect label="Theology Class (Opt)" loading={loadingData} options={theologyClasses} value={theologyClass} onChange={setTheologyClass} accent="theology" /></div>
                    </div>
                  )}
                  {step===2 && (
                    <div className="space-y-8">
                      <div className="grid md:grid-cols-4 gap-6">
                        <div className="md:col-span-4 font-semibold text-xs uppercase tracking-wide text-slate-500">Parents</div>
                        <Field label="Mother Name"><input value={motherName} onChange={e=>setMotherName(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                        <Field label="Mother Contact"><input value={motherContact} onChange={e=>setMotherContact(e.target.value)} className={fieldCls} /></Field>
                        <Field label="Mother Occupation"><input value={motherOccupation} onChange={e=>setMotherOccupation(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                        <Field label="Mother Alive?"><select value={motherAlive} onChange={e=>setMotherAlive(e.target.value as any)} className={fieldCls}><option value="unknown">Unknown</option><option value="alive">Alive</option><option value="deceased">Deceased</option></select></Field>
                        {motherAlive==='deceased' && <Field label="Mother Date of Death"><input type="date" value={motherDod} onChange={e=>setMotherDod(e.target.value)} className={fieldCls} /></Field>}
                        <Field label="Father Name"><input value={fatherName} onChange={e=>setFatherName(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                        <Field label="Father Contact"><input value={fatherContact} onChange={e=>setFatherContact(e.target.value)} className={fieldCls} /></Field>
                        <Field label="Father Occupation"><input value={fatherOccupation} onChange={e=>setFatherOccupation(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                        <Field label="Father Alive?"><select value={fatherAlive} onChange={e=>setFatherAlive(e.target.value as any)} className={fieldCls}><option value="unknown">Unknown</option><option value="alive">Alive</option><option value="deceased">Deceased</option></select></Field>
                        {fatherAlive==='deceased' && <Field label="Father Date of Death"><input type="date" value={fatherDod} onChange={e=>setFatherDod(e.target.value)} className={fieldCls} /></Field>}
                      </div>
                      <div className="grid md:grid-cols-4 gap-6">
                        <div className="md:col-span-4 font-semibold text-xs uppercase tracking-wide text-slate-500">Guardian</div>
                        <Field label="Guardian Name"><input value={guardianName} onChange={e=>setGuardianName(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                        <Field label="Guardian Contact"><input value={guardianContact} onChange={e=>setGuardianContact(e.target.value)} className={fieldCls} /></Field>
                        <Field label="Guardian Occupation"><input value={guardianOccupation} onChange={e=>setGuardianOccupation(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                        <Field label="Guardian Alive?"><select value={guardianAlive} onChange={e=>setGuardianAlive(e.target.value as any)} className={fieldCls}><option value="unknown">Unknown</option><option value="alive">Alive</option><option value="deceased">Deceased</option></select></Field>
                        {guardianAlive==='deceased' && <Field label="Guardian Date of Death"><input type="date" value={guardianDod} onChange={e=>setGuardianDod(e.target.value)} className={fieldCls} /></Field>}
                      </div>
                      <div className="grid md:grid-cols-4 gap-6">
                        <div className="md:col-span-4 font-semibold text-xs uppercase tracking-wide text-slate-500">Next of Kin</div>
                        <Field label="Name"><input value={nokName} onChange={e=>setNokName(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                        <Field label="Contact"><input value={nokContact} onChange={e=>setNokContact(e.target.value)} className={fieldCls} /></Field>
                        <Field label="Relationship"><input value={nokRelationship} onChange={e=>setNokRelationship(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                      </div>
                    </div>
                  )}
                  {step===3 && (
                    <div className="grid md:grid-cols-3 gap-6">
                      <Field label="District ID (Optional)"><input value={districtId} onChange={e=>setDistrictId(e.target.value)} className={fieldCls} /></Field>
                      <Field label="Village ID (Optional)"><input value={villageId} onChange={e=>setVillageId(e.target.value)} className={fieldCls} /></Field>
                      <Field label="Residence (Optional)" className="md:col-span-2"><input value={placeResidence} onChange={e=>setPlaceResidence(e.target.value.toUpperCase())} className={nameFieldCls} /></Field>
                    </div>
                  )}
                  {step===4 && (
                    <div className="space-y-4 text-sm">
                      <div className="font-semibold text-slate-700 dark:text-slate-200">Review</div>
                      <ul className="grid md:grid-cols-2 gap-2 text-xs">
                        <li><b>Name:</b> {first} {last} {otherName}</li>
                        {gender && <li><b>Gender:</b> {gender}</li>}
                        {dob && <li><b>DOB:</b> {dob}</li>}
                        {phone && <li><b>Phone:</b> {phone}</li>}
                        {address && <li><b>Address:</b> {address}</li>}
                        {photoFile && <li><b>Photo:</b> {photoFile.name}</li>}
                        {villageId && <li><b>Village ID:</b> {villageId}</li>}
                        {termSel && <li><b>Term:</b> {termSel.name}</li>}
                        {secularClass && <li><b>Secular Class:</b> {secularClass.name}</li>}
                        {theologyClass && <li><b>Theology Class:</b> {theologyClass.name}</li>}
                        {(motherName||motherAlive!=='unknown') && <li><b>Mother:</b> {motherName||'-'} {motherAlive!=='unknown'?`(${motherAlive})`:''}</li>}
                        {(fatherName||fatherAlive!=='unknown') && <li><b>Father:</b> {fatherName||'-'} {fatherAlive!=='unknown'?`(${fatherAlive})`:''}</li>}
                        {guardianName && <li><b>Guardian:</b> {guardianName} {guardianAlive!=='unknown'?`(${guardianAlive})`:''}</li>}
                        {nokName && <li><b>Next of Kin:</b> {nokName}{nokRelationship?` (${nokRelationship})`:''}</li>}
                        {noOfJuzus && <li><b>Juzus Memorized:</b> {noOfJuzus}</li>}
                        {prevSchool && <li><b>Previous School:</b> {prevSchool}</li>}
                        {prevSchoolYear && <li><b>Previous School Year:</b> {prevSchoolYear}</li>}
                        {prevClassTheology && <li><b>Previous Theology Class:</b> {prevClassTheology}</li>}
                        {prevClassSecular && <li><b>Previous Secular Class:</b> {prevClassSecular}</li>}
                        {tahfizAutoEnroll && (
                          <li className="md:col-span-2">
                            <div className="flex items-center space-x-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                              <BookOpen className="w-4 h-4 text-emerald-600" />
                              <span><b>Tahfiz Enrollment:</b> Will be automatically enrolled in Tahfiz program</span>
                            </div>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-6 border-t border-white/20 dark:border-white/10 mt-6 flex-shrink-0">
                    <div className="flex gap-2">
                      <button type="button" disabled={step===0 || loading} onClick={prev} className="px-4 py-2 rounded-lg text-xs font-medium bg-black/5 dark:bg-white/10 disabled:opacity-30">Back</button>
                      {step < steps.length-1 && <button type="button" disabled={!canNext() || loading} onClick={next} className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white disabled:opacity-40">Next</button>}
                    </div>
                    {step===steps.length-1 && (
                      <button 
                        disabled={loading || generatingPDF} 
                        onClick={submit} 
                        className="relative px-6 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 shadow disabled:opacity-40"
                      >
                        <span className={loading || generatingPDF?'opacity-0':'opacity-100'}>
                          Submit & Generate PDF
                        </span>
                        {(loading || generatingPDF) && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 animate-spin"/>
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};