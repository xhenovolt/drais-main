# DRAIS — DRCE Terminology Glossary

DRCE = **D**RAIS **R**eport **C**omposition **E**ngine. This file covers
every translatable phrase that appears inside the canvas designer, the
template kitchen, the new-document gallery, the issuance pipeline, and
the document workflow. Where master [GLOSSARY.md](./GLOSSARY.md) names a
DRCE term once, this file gives the surface contexts in which it appears
and any short / long Arabic variants the UI needs.

DRCE strings split into three buckets and **the third is never translated**:

1. **Core DRCE dictionary** — chrome of the editor + admin pages (Save,
   Theme, Watermark, Add Section…). Translated.
2. **Template dictionary** — the seed copy of starter templates (Report
   Card, Certificate of Completion, ID Card front…). Translated.
3. **Dynamic school content** — what a school types into their own
   template (school name, principal name, motto, custom section copy).
   **Never translated.** Stored as-is; rendered raw.

---

## 1. Editor chrome

The DRCE designer (`src/components/drce/DRCEEditor.tsx`,
`src/components/drce/PropertiesPanel.tsx`) is the single highest-density
file in the audit (~150 hardcoded strings).

### Top toolbar

| English | Arabic |
|---|---|
| Save | حفظ |
| Save as draft | حفظ كمسودّة |
| Save and close | حفظ وإغلاق |
| Discard changes | تجاهل التغييرات |
| Undo | تراجع |
| Redo | إعادة |
| Preview | معاينة |
| Print | طباعة |
| Export PDF | تصدير PDF |
| Publish | نشر |
| Archive | أرشفة |
| Submit for approval | إرسال للموافقة |
| Approve | اعتماد |
| Reject | رفض |
| Versions | الإصدارات |
| Duplicate template | نسخ القالب |
| Rename | إعادة تسمية |
| Move to trash | نقل إلى المهملات |
| Settings | الإعدادات |
| Properties | الخصائص |

### Workflow status labels

| English | Arabic |
|---|---|
| Draft | مسودة |
| Pending approval | بانتظار الاعتماد |
| Approved | معتمد |
| Published | منشور |
| Archived | مؤرشف |
| Rejected | مرفوض |

### Left rail — section / element palette

| English | Arabic |
|---|---|
| Add section | إضافة قسم |
| Add page | إضافة صفحة |
| Sections | الأقسام |
| Pages | الصفحات |
| Layers | الطبقات |
| Header | الترويسة |
| Footer | التذييل |
| Body | المتن |
| Title | العنوان |
| Subtitle | العنوان الفرعي |
| Text | نص |
| Heading | عنوان |
| Paragraph | فقرة |
| Image | صورة |
| Shape | شكل |
| Line | خط |
| Divider | فاصل |
| Spacer | مسافة |
| Table | جدول |
| Marks Table | جدول الدرجات |
| Component Table (Competency Table) | جدول المكوّنات |
| Descriptor Grid | شبكة الأوصاف |
| AoI Breakdown | تفصيل نشاط الدمج |
| Generic Skills Block | كتلة المهارات العامة |
| Project Outcomes Block | كتلة نواتج المشاريع |
| Narrative Block | كتلة سردية |
| Signature line | سطر التوقيع |
| QR code | رمز الاستجابة السريعة |
| Barcode | الرمز الشريطي |
| School logo | شعار المدرسة |
| School name | اسم المدرسة |
| School motto | شعار المدرسة المختصر |
| Watermark | علامة مائية |
| Page break | فاصل صفحة |
| Student photo | صورة الطالب |

### Right rail — properties panel

| English | Arabic |
|---|---|
| Style | النمط |
| Layout | التخطيط |
| Position | الموضع |
| Size | الحجم |
| Width | العرض |
| Height | الارتفاع |
| Padding | الحشو الداخلي |
| Margin | الهامش |
| Spacing | التباعد |
| Border | الحدود |
| Border radius | استدارة الحدود |
| Background | الخلفية |
| Color | اللون |
| Background color | لون الخلفية |
| Text color | لون النص |
| Font | الخط |
| Font family | عائلة الخط |
| Font size | حجم الخط |
| Font weight | سُمك الخط |
| Bold | عريض |
| Italic | مائل |
| Underline | تسطير |
| Strikethrough | يتوسطه خط |
| Align | محاذاة |
| Align left | محاذاة لليسار |
| Align center | محاذاة للوسط |
| Align right | محاذاة لليمين |
| Justify | ضبط |
| Line height | ارتفاع السطر |
| Letter spacing | تباعد الأحرف |
| Opacity | الشفافية |
| Rotation | التدوير |
| Z-index | ترتيب الطبقة |
| Lock | قفل |
| Unlock | فتح القفل |
| Visibility | الظهور |
| Show | إظهار |
| Hide | إخفاء |
| Reset | إعادة تعيين |
| Apply | تطبيق |

### Document settings (Theme)

| English | Arabic |
|---|---|
| Document theme | مظهر الوثيقة |
| Page size | حجم الصفحة |
| Orientation | الاتجاه |
| Portrait | عمودي |
| Landscape | أفقي |
| Margins | الهوامش |
| Primary color | اللون الأساسي |
| Accent color | اللون الثانوي |
| Header style | نمط الترويسة |
| Footer style | نمط التذييل |
| Page numbers | أرقام الصفحات |
| Show page numbers | إظهار أرقام الصفحات |

### Conditional Visibility (P2)

| English | Arabic |
|---|---|
| Visibility rule | قاعدة العرض الشرطي |
| Condition | الشرط |
| When … is … | عندما يكون … |
| Equals | يساوي |
| Not equals | لا يساوي |
| Greater than | أكبر من |
| Less than | أصغر من |
| Contains | يحتوي على |
| And | و |
| Or | أو |
| Always show | إظهار دائمًا |
| Always hide | إخفاء دائمًا |
| Show when … | إظهار عندما … |
| Hide when … | إخفاء عندما … |

---

## 2. Template Kitchen

`src/app/reports/kitchen/page.tsx` (the master list of all templates for
the school).

| English | Arabic |
|---|---|
| Template Kitchen | مطبخ القوالب |
| New document | وثيقة جديدة |
| New template | قالب جديد |
| All templates | كل القوالب |
| My templates | قوالبي |
| Shared with me | مُشاركة معي |
| Recent | الأخيرة |
| Favourites | المفضّلة |
| Starred | المميّزة بنجمة |
| Star | إضافة نجمة |
| Unstar | إزالة النجمة |
| Open | فتح |
| Open in editor | فتح في المحرر |
| Last edited | آخر تعديل |
| Last edited by | آخر تعديل بواسطة |
| Created | تاريخ الإنشاء |
| Owner | المالك |
| Status | الحالة |
| Type | النوع |
| Category | الفئة |
| Search templates | البحث في القوالب |
| Filter by status | تصفية حسب الحالة |
| Filter by category | تصفية حسب الفئة |
| No templates yet | لا توجد قوالب بعد |
| Create your first template | أنشئ أول قالب |

---

## 3. New Document gallery (Starters)

`src/app/drce/new/page.tsx` — the Canva-style picker.

| English | Arabic |
|---|---|
| Choose a starter | اختر نموذج بداية |
| Start from blank | البدء من فارغ |
| Browse all starters | استعراض جميع النماذج |
| Report Card | بطاقة التقرير |
| Certificate | الشهادة |
| Certificate of Completion | شهادة إتمام |
| Certificate of Achievement | شهادة تقدير |
| Certificate of Merit | شهادة استحقاق |
| Certificate of Attendance | شهادة حضور |
| Leaver's Certificate | شهادة مغادرة |
| Transcript | السجل الأكاديمي |
| Academic Transcript | السجل الأكاديمي الرسمي |
| ID Card | بطاقة الهوية |
| Student ID Card | بطاقة هوية الطالب |
| Staff ID Card | بطاقة هوية الموظف |
| Library Card | بطاقة المكتبة |
| Bus Pass | تصريح الحافلة |
| Permission Slip | إذن خروج |
| Letter | رسالة |
| Welcome Letter | رسالة ترحيب |
| Admission Letter | رسالة قبول |
| Invoice | فاتورة |
| Receipt | إيصال |
| Newsletter | النشرة الدورية |

### Document Kind labels (Phase 1 of universal-document audit)

| English | Arabic |
|---|---|
| Report Card | بطاقة التقرير |
| Certificate | الشهادة |
| Transcript | السجل الأكاديمي |
| ID Card | بطاقة الهوية |
| Letter | رسالة |
| Invoice | فاتورة |
| Other | أخرى |

---

## 4. Block Library

`src/app/admin/drce/blocks/page.tsx`.

| English | Arabic |
|---|---|
| Block Library | مكتبة الكتل |
| All blocks | كل الكتل |
| New block | كتلة جديدة |
| Insert block | إدراج كتلة |
| Save as block | حفظ ككتلة |
| Block name | اسم الكتلة |
| Block description | وصف الكتلة |
| Used in | مُستخدمة في |
| Detach block | فصل الكتلة |
| Update block | تحديث الكتلة |
| Block updated | تم تحديث الكتلة |
| Reusable section | قسم قابل لإعادة الاستخدام |

---

## 5. Issuance (Round 3)

`src/app/issuance/**`.

| English | Arabic |
|---|---|
| Issuance | الإصدار |
| Issuance batch | دفعة الإصدار |
| New batch | دفعة جديدة |
| Run issuance | تشغيل الإصدار |
| Generate documents | إنشاء الوثائق |
| Generating | جارٍ الإنشاء |
| Generated | تم الإنشاء |
| Failed | فشل |
| Recipients | المستلمون |
| Eligible learners | الطلاب المؤهلون |
| Eligibility rule | قاعدة الأهلية |
| Preview eligibility | معاينة الأهلية |
| Batch name | اسم الدفعة |
| Template | القالب |
| Selected template | القالب المحدد |
| Term / academic year | الفصل / السنة الدراسية |
| Output format | صيغة الإخراج |
| PDF per learner | PDF لكل طالب |
| Combined PDF | PDF موحّد |
| Print-ready | جاهز للطباعة |
| Download all | تنزيل الكل |
| Audit trail | سجل التدقيق |
| Triggered by | بدأها |
| Triggered at | بدأ في |
| Completed at | انتهى في |
| Reissue | إعادة الإصدار |
| Cancel batch | إلغاء الدفعة |

---

## 6. Custom Fields (P1)

`src/app/admin/custom-fields/page.tsx`.

| English | Arabic |
|---|---|
| Custom fields | الحقول المخصصة |
| Add field | إضافة حقل |
| Field name | اسم الحقل |
| Field code | رمز الحقل |
| Field type | نوع الحقل |
| Text | نص |
| Number | رقم |
| Date | تاريخ |
| Yes / No | نعم / لا |
| Dropdown | قائمة منسدلة |
| Options | الخيارات |
| Required | مطلوب |
| Default value | القيمة الافتراضية |
| Help text | نص المساعدة |
| Active | مفعّل |
| Inactive | معطّل |
| Order | الترتيب |
| Applies to | يُطبَّق على |
| Learner | الطالب |
| Staff | الموظف |
| Class | الصف |

---

## 7. Render-layer phrases (RENDER_LAYERS.md surface)

DRCE has a documented render-layer hierarchy. These admin labels appear
in the template-properties drawer.

| English | Arabic |
|---|---|
| Base layer | الطبقة الأساسية |
| Override layer | طبقة التجاوز |
| School override | تجاوز المدرسة |
| Class override | تجاوز الصف |
| Snapshot frozen | لقطة مجمّدة |
| Frozen at | جُمِّدت في |
| Frozen by | جمّدها |
| Active layer | الطبقة النشطة |
| Effective layer | الطبقة الفعّالة |

---

## 8. Versioning + revisions

| English | Arabic |
|---|---|
| Version | الإصدار |
| Versions | الإصدارات |
| Revision | المراجعة |
| Latest version | أحدث إصدار |
| Previous version | الإصدار السابق |
| Restore this version | استعادة هذا الإصدار |
| Compare versions | مقارنة الإصدارات |
| Saved | تم الحفظ |
| Saving… | جارٍ الحفظ… |
| Unsaved changes | تغييرات غير محفوظة |
| Auto-saved | تم الحفظ تلقائيًا |
| Last saved | آخر حفظ |

---

## 9. Error + empty states inside DRCE

| English | Arabic |
|---|---|
| Template not found | القالب غير موجود |
| Failed to save | فشل الحفظ |
| Failed to load | فشل التحميل |
| Network error | خطأ في الشبكة |
| Please try again | يُرجى المحاولة مرة أخرى |
| You don't have permission | ليس لديك صلاحية |
| Nothing here yet | لا يوجد شيء هنا بعد |
| Add a section to begin | أضف قسمًا للبدء |
| Drag a section here | اسحب قسمًا إلى هنا |
| Empty page | صفحة فارغة |
| No preview available | لا توجد معاينة متاحة |

---

## 10. Strings explicitly **not** translated in DRCE

| Kind | Example | Reason |
|---|---|---|
| Section-type codes | `marks_table`, `signature_line`, `competency_table` | Schema identifier |
| Plugin keys | `image_shape`, `qr_code` | Registry identifier |
| Theme JSON keys | `primaryColor`, `pageSize` | Storage shape |
| User-typed template content | "Welcome to Bright Future Academy" | Dynamic school content |
| Variable placeholders | `{{learnerName}}`, `{{snapshot.term}}` | Render tokens |
| CSS values | `12px`, `#FF0000`, `rgba(0,0,0,0.5)` | Style values |
| File names of uploaded images | `school_logo.png` | User upload |
| Permission codes | `drce.edit`, `drce.publish` | Identifier |
| URL paths | `/reports/kitchen` | Route |
