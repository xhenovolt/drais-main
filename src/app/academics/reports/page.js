'use client';
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("react");
var react_hot_toast_1 = require("react-hot-toast");
var html2canvas_1 = require("html2canvas");
var jspdf_1 = require("jspdf");
var XLSX = require("xlsx");
var PromotionSummaryNotification_1 = require("@/components/academics/PromotionSummaryNotification");
var swr_1 = require("swr");
var fetcher_1 = require("@/utils/fetcher");
var reportTemplates_1 = require("@/lib/reportTemplates");
var theology_subject_classifier_1 = require("@/lib/theology-subject-classifier");
var I18nProvider_1 = require("@/components/i18n/I18nProvider");
// Context for syncing teacher initials
var TeacherInitialsContext = (0, react_1.createContext)(null);
// Add a PHP API base like in ResultTypesManager to avoid hitting a non-existent Next.js API route
var API_BASE = process.env.NEXT_PUBLIC_PHP_API_BASE || 'http://localhost/drais/api';
var ReportsPage = function () {
    var _a;
    var _b = (0, I18nProvider_1.useI18n)(), t = _b.t, appLang = _b.lang;
    var _c = (0, react_1.useState)({ term: '', resultType: '', classId: '', student: '', academicYearId: '' }), filters = _c[0], setFilters = _c[1];
    var _d = (0, react_1.useState)([]), academicYears = _d[0], setAcademicYears = _d[1];
    var _e = (0, react_1.useState)([]), termsData = _e[0], setTermsData = _e[1];
    var _f = (0, react_1.useState)([]), allResults = _f[0], setAllResults = _f[1];
    var _g = (0, react_1.useState)([]), allStudents = _g[0], setAllStudents = _g[1];
    var _h = (0, react_1.useState)(false), showCustomization = _h[0], setShowCustomization = _h[1];
    var _j = (0, react_1.useState)('school'), customTab = _j[0], setCustomTab = _j[1];
    var _k = (0, react_1.useState)(false), loading = _k[0], setLoading = _k[1];
    var _l = (0, react_1.useState)(''), editableTermValue = _l[0], setEditableTermValue = _l[1];
    var _m = (0, react_1.useState)(false), isEditingTerm = _m[0], setIsEditingTerm = _m[1];
    var _o = (0, react_1.useState)({}), teacherInitials = _o[0], setTeacherInitials = _o[1];
    var _p = (0, react_1.useState)(false), saving = _p[0], setSaving = _p[1];
    var _q = (0, react_1.useState)(''), nextTermBegins = _q[0], setNextTermBegins = _q[1];
    var TEACHER_INITIALS_STORAGE_KEY = 'drais_teacher_initials';
    var _r = (0, react_1.useState)(false), enableMarkConversion = _r[0], setEnableMarkConversion = _r[1];
    var defaultLogoInputRef = (0, react_1.useRef)(null);
    var reportExportRef = (0, react_1.useRef)(null);
    var _s = (0, react_1.useState)(false), defaultLogoUploading = _s[0], setDefaultLogoUploading = _s[1];
    var _t = (0, react_1.useState)({
        name: '',
        address: '',
        po_box: '',
        logo_url: '/uploads/logo.png',
        contact: '',
        email: '',
        website: '',
        motto: '',
        center_no: '',
        registration_no: '',
        arabic_name: '', arabic_address: '', arabic_po_box: '',
        arabic_contact: '', arabic_center_no: '', arabic_registration_no: '',
        arabic_motto: '',
    }), schoolInfo = _t[0], setSchoolInfo = _t[1];
    var customizationRef = (0, react_1.useRef)({ current: {} });
    // ── Logo upload handler: uploads to Cloudinary, saves to DB, updates local state
    var handleLogoUpload = function (file) { return __awaiter(void 0, void 0, void 0, function () {
        var form, uploadRes, uploadData_1, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    form = new FormData();
                    form.append('file', file);
                    form.append('folder', 'drais/logos');
                    return [4 /*yield*/, fetch('/api/upload', { method: 'POST', body: form })];
                case 1:
                    uploadRes = _a.sent();
                    return [4 /*yield*/, uploadRes.json()];
                case 2:
                    uploadData_1 = _a.sent();
                    if (!uploadData_1.success || !uploadData_1.url)
                        return [2 /*return*/, null];
                    // Persist to DB via school-config
                    return [4 /*yield*/, fetch('/api/school-config', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ logo: uploadData_1.url }),
                        })];
                case 3:
                    // Persist to DB via school-config
                    _a.sent();
                    // Update local state so all reports on the page reflect the new logo
                    setSchoolInfo(function (prev) { return (__assign(__assign({}, prev), { logo_url: uploadData_1.url })); });
                    return [2 /*return*/, uploadData_1.url];
                case 4:
                    err_1 = _a.sent();
                    console.error('Logo upload failed:', err_1);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    // ── Template engine: active layout JSON loaded from /api/report-templates/active
    var _u = (0, react_1.useState)(reportTemplates_1.DEFAULT_TEMPLATE_JSON), activeLayout = _u[0], setActiveLayout = _u[1];
    // ── Dynamic template system (Phase 9: DRCE Migration)
    // All templates are now loaded from DRCE database
    var _v = (0, react_1.useState)([]), availableDrceTemplates = _v[0], setAvailableDrceTemplates = _v[1];
    var _w = (0, react_1.useState)(null), selectedTemplateId = _w[0], setSelectedTemplateId = _w[1];
    var _x = (0, react_1.useState)(null), activeDrceDoc = _x[0], setActiveDrceDoc = _x[1];
    var _y = (0, react_1.useState)('all'), curriculum = _y[0], setCurriculum = _y[1];
    // Default the rendered-document language to whatever the user has currently
    // selected app-wide. Schools that print exclusively in Arabic don't have to
    // re-toggle this dropdown on every page load; they can still override it
    // per render via the dropdown below if they want a one-off English copy.
    var _z = (0, react_1.useState)(appLang === 'ar' ? 'ar' : 'en'), selectedLanguage = _z[0], setSelectedLanguage = _z[1];
    // Fetch all available DRCE templates
    (0, react_1.useEffect)(function () {
        fetch('/api/dvcf/documents')
            .then(function (r) { return r.json(); })
            .then(function (data) {
            if ((data === null || data === void 0 ? void 0 : data.documents) && Array.isArray(data.documents)) {
                setAvailableDrceTemplates(data.documents);
                // Auto-select the first default template
                var defaultTemplate = data.documents.find(function (t) { return t.meta.is_default; });
                if (defaultTemplate) {
                    setSelectedTemplateId(defaultTemplate.meta.template_key || defaultTemplate.meta.id);
                    setActiveDrceDoc(defaultTemplate);
                }
            }
        })
            .catch(function (err) {
            console.warn('Failed to load DRCE templates:', err);
        });
    }, []);
    // When selected template changes, update active DRCE document
    (0, react_1.useEffect)(function () {
        if (!selectedTemplateId)
            return;
        var selected = availableDrceTemplates.find(function (t) { return t.meta.template_key === selectedTemplateId || t.meta.id === selectedTemplateId; });
        if (selected) {
            setActiveDrceDoc(selected);
            console.log('Rendering template:', selected.meta.name, '| curriculum:', curriculum);
        }
    }, [selectedTemplateId, availableDrceTemplates, curriculum]);
    // Resolve term id from loaded tenant-scoped term rows.
    var getTermId = function (termName) {
        var normalized = String(termName || '').toLowerCase().trim();
        var term = termsData.find(function (t) { return String(t.name || '').toLowerCase().trim() === normalized; });
        return term ? String(term.id) : '';
    };
    // Fetch promotion data if it's 3rd term
    var promotionData = (0, swr_1.default)(filters.term === 'Term 3' && filters.classId
        ? "/api/academics/promotions?term_id=".concat(getTermId(filters.term), "&class_id=").concat(filters.classId)
        : null, fetcher_1.fetcher, { revalidateOnFocus: false }).data;
    var handlePromoteStudents = function (studentIds, newClassId) { return __awaiter(void 0, void 0, void 0, function () {
        var response, result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch('/api/academics/promotions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ studentIds: studentIds, newClassId: newClassId, remarks: 'Promoted from 3rd term reports' }),
                        })];
                case 1:
                    response = _a.sent();
                    return [4 /*yield*/, response.json()];
                case 2:
                    result = _a.sent();
                    if (result.success) {
                        alert("Successfully promoted ".concat(studentIds.length, " student(s)!"));
                    }
                    else {
                        alert('Failed to promote students: ' + result.message);
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    console.error('Error promoting students:', error_1);
                    alert('Error promoting students');
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    // School info default — generic placeholders that get overridden by DB-driven API
    var schoolInfoDefault = {
        name: '', address: '', po_box: '',
        logo_url: '/uploads/logo.png',
        contact: '', email: '', website: '', motto: '',
        center_no: '', registration_no: '',
        arabic_name: '', arabic_address: '', arabic_po_box: '',
        arabic_contact: '', arabic_center_no: '', arabic_registration_no: '',
        arabic_motto: '',
    };
    // Add Arabic-Indic digits converter (strip dash characters before mapping)
    var toArabicDigits = function (input) {
        if (input === null || input === undefined)
            return '';
        var s = String(input);
        // Remove common dash-like characters before converting digits
        var cleaned = s.replace(/[-–—‑]/g, '');
        var map = {
            '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
            '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩'
        };
        return cleaned.replace(/[0-9]/g, function (d) { return map[d]; });
    };
    // Fetch academic years, terms, current term/year, persisted initials and next-term date on mount
    (0, react_1.useEffect)(function () {
        Promise.all([
            fetch('/api/academic_years').then(function (r) { return r.json(); }).catch(function () { return ({}); }),
            fetch('/api/terms').then(function (r) { return r.json(); }).catch(function () { return ({}); }),
            fetch('/api/academic/current-term').then(function (r) { return r.json(); }).catch(function () { return ({}); }),
        ])
            .then(function (_a) {
            var yearsRes = _a[0], termsRes = _a[1], currentTermRes = _a[2];
            var years = Array.isArray(yearsRes === null || yearsRes === void 0 ? void 0 : yearsRes.data) ? yearsRes.data : [];
            var terms = Array.isArray(termsRes === null || termsRes === void 0 ? void 0 : termsRes.data) ? termsRes.data : [];
            setAcademicYears(years);
            setTermsData(terms);
            // Year-first discovery: always select a year by default.
            var currentYearId = (currentTermRes === null || currentTermRes === void 0 ? void 0 : currentTermRes.academic_year_id) ? String(currentTermRes.academic_year_id) : '';
            var fallbackYearId = years.length > 0 ? String(years[0].id) : '';
            var nextAcademicYearId = currentYearId || fallbackYearId;
            setFilters(function (prev) { return (__assign(__assign({}, prev), { academicYearId: prev.academicYearId || nextAcademicYearId })); });
        })
            .catch(function () { });
        var localInitials = localStorage.getItem(TEACHER_INITIALS_STORAGE_KEY);
        if (localInitials) {
            try {
                setTeacherInitials(JSON.parse(localInitials));
            }
            catch (_) {
                localStorage.removeItem(TEACHER_INITIALS_STORAGE_KEY);
            }
        }
        fetch('/api/teacher-initials')
            .then(function (r) { return r.json(); })
            .then(function (data) {
            if ((data === null || data === void 0 ? void 0 : data.success) && data.data && typeof data.data === 'object') {
                setTeacherInitials(function (prev) { return (__assign(__assign({}, prev), data.data)); });
            }
        })
            .catch(function () { });
        fetch('/api/next-term')
            .then(function (r) { return r.json(); })
            .then(function (data) {
            var _a;
            if ((_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.nextTermBegins) {
                setNextTermBegins(data.data.nextTermBegins);
            }
        })
            .catch(function () { });
    }, []);
    // Filtered terms based on selected academic year
    var filteredTerms = (Array.isArray(termsData) && termsData.length > 0)
        ? (filters.academicYearId
            ? termsData.filter(function (t) { return t && String(t.academic_year_id) === filters.academicYearId; })
            : termsData)
        : [];
    // Fetch all data once on component mount — NO FILTERING, get everything
    (0, react_1.useEffect)(function () {
        setLoading(true);
        // Fetch ALL results without server-side filtering — client-side filtering via useMemo
        Promise.all([
            fetch('/api/reports/list')
                .then(function (r) { return __awaiter(void 0, void 0, void 0, function () {
                var data;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, r.json().catch(function () { return ({}); })];
                        case 1:
                            data = _a.sent();
                            return [2 /*return*/, data];
                    }
                });
            }); }),
            fetch("/api/school-config")
                .then(function (r) { return __awaiter(void 0, void 0, void 0, function () {
                var data;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, r.json().catch(function () { return ({}); })];
                        case 1:
                            data = _a.sent();
                            return [2 /*return*/, data];
                    }
                });
            }); })
        ])
            .then(function (_a) {
            var _b, _c, _d, _e, _f;
            var reportsData = _a[0], schoolConfigData = _a[1];
            var students = (reportsData === null || reportsData === void 0 ? void 0 : reportsData.students) || [];
            var results = (reportsData === null || reportsData === void 0 ? void 0 : reportsData.results) || (reportsData === null || reportsData === void 0 ? void 0 : reportsData.data) || (Array.isArray(reportsData) ? reportsData : []);
            setAllStudents(students);
            setAllResults(results);
            // Update school info from centralized DB-driven config
            if (schoolConfigData === null || schoolConfigData === void 0 ? void 0 : schoolConfigData.school) {
                var s = schoolConfigData.school;
                setSchoolInfo({
                    name: s.name || schoolInfoDefault.name,
                    address: s.address || schoolInfoDefault.address,
                    po_box: s.po_box || schoolInfoDefault.po_box,
                    logo_url: ((_b = s.branding) === null || _b === void 0 ? void 0 : _b.logo) || s.logo_url || schoolInfoDefault.logo_url,
                    contact: ((_c = s.contact) === null || _c === void 0 ? void 0 : _c.phone) || schoolInfoDefault.contact,
                    email: ((_d = s.contact) === null || _d === void 0 ? void 0 : _d.email) || schoolInfoDefault.email,
                    website: s.website || schoolInfoDefault.website,
                    motto: ((_e = s.branding) === null || _e === void 0 ? void 0 : _e.motto) || schoolInfoDefault.motto,
                    center_no: s.center_no || schoolInfoDefault.center_no,
                    registration_no: s.registration_no || schoolInfoDefault.registration_no,
                    arabic_name: s.arabic_name || schoolInfoDefault.arabic_name,
                    arabic_address: s.arabic_address || schoolInfoDefault.arabic_address,
                    arabic_po_box: s.arabic_po_box || schoolInfoDefault.arabic_po_box,
                    arabic_contact: s.arabic_phone || ((_f = s.contact) === null || _f === void 0 ? void 0 : _f.phone) || schoolInfoDefault.arabic_contact,
                    arabic_center_no: s.arabic_center_no || s.center_no || schoolInfoDefault.arabic_center_no,
                    arabic_registration_no: s.arabic_registration_no || s.registration_no || schoolInfoDefault.arabic_registration_no,
                    arabic_motto: s.arabic_motto || schoolInfoDefault.arabic_motto,
                });
            }
        })
            .catch(function () {
            setAllStudents([]);
            setAllResults([]);
        })
            .finally(function () { return setLoading(false); });
    }, []);
    // Load editable term value from localStorage on mount
    (0, react_1.useEffect)(function () {
        var savedTermValue = localStorage.getItem('editable_term_value');
        if (savedTermValue) {
            setEditableTermValue(savedTermValue);
        }
    }, []);
    // Save editable term value to localStorage when it changes
    (0, react_1.useEffect)(function () {
        if (editableTermValue) {
            localStorage.setItem('editable_term_value', editableTermValue);
        }
    }, [editableTermValue]);
    // Enhanced class groups with data validation and error checking
    var classGroups = (0, react_1.useMemo)(function () {
        var groups = {};
        // Filter out invalid results and remove duplicates
        var validResults = allResults.filter(function (r, index, arr) {
            // Basic validation
            if (!r.student_id || !r.class_name || r.score === null || r.score === undefined) {
                return false;
            }
            // Ensure score is a valid number
            var score = parseFloat(String(r.score));
            if (isNaN(score))
                return false;
            // Remove duplicates based on unique combination
            var key = "".concat(r.student_id, "_").concat(r.subject_id, "_").concat(r.result_type_name || r.results_type, "_").concat(r.term || r.term_name || 'no_term');
            var firstIndex = arr.findIndex(function (item) {
                var itemKey = "".concat(item.student_id, "_").concat(item.subject_id, "_").concat(item.result_type_name || item.results_type, "_").concat(item.term || item.term_name || 'no_term');
                return itemKey === key;
            });
            return firstIndex === index;
        });
        validResults.forEach(function (r) {
            var className = r.class_name || 'Unknown Class';
            // Additional validation: ensure class name is reasonable and not from old corrupted data
            if (className === 'Unknown Class' || className.length > 20 || !/^[A-Za-z0-9\s\-\.]+$/.test(className)) {
                return; // Skip invalid class names
            }
            // Find the student record to validate class consistency
            var studentRecord = allStudents.find(function (s) { return s.student_id === r.student_id; });
            var studentClassName = studentRecord === null || studentRecord === void 0 ? void 0 : studentRecord.class_name;
            // Strict validation: only include results where the result's class_name matches the student's actual class
            if (studentClassName && String(studentClassName).toLowerCase().trim() !== String(className).toLowerCase().trim()) {
                // Log for debugging - this will help identify contaminated data
                console.warn("Class mismatch for student ".concat(r.student_id, " (").concat(r.first_name, " ").concat(r.last_name, "): result shows \"").concat(className, "\" but student record shows \"").concat(studentClassName, "\". Skipping this result."));
                return; // Skip results with class mismatch
            }
            // Additional validation: ensure result has valid academic year and term data
            if (!r.academic_year_id || (!r.term && !r.term_name)) {
                console.warn("Missing academic context for student ".concat(r.student_id, " (").concat(r.first_name, " ").concat(r.last_name, ") in ").concat(className, ". Skipping this result."));
                return; // Skip results without proper academic context
            }
            if (!groups[className]) {
                groups[className] = { className: className, students: [] };
            }
            var student = groups[className].students.find(function (s) { return s.student_id === r.student_id; });
            if (!student) {
                // Improved photo URL handling for Next.js Image component
                var photoUrl = r.photo_url;
                student = {
                    student_id: r.student_id,
                    photo: photoUrl,
                    admission_no: r.admission_no,
                    first_name: r.first_name,
                    last_name: r.last_name,
                    class_name: r.class_name,
                    gender: r.gender,
                    stream_name: r.stream_name,
                    results: [],
                };
                groups[className].students.push(student);
            }
            student.results.push(r);
        });
        // Sort students within each class by name
        Object.values(groups).forEach(function (g) {
            g.students.sort(function (a, b) { return (a.last_name || '').localeCompare(b.last_name || ''); });
        });
        return groups;
    }, [allResults]);
    // Enhanced filtering logic with better validation
    var filteredClassGroups = (0, react_1.useMemo)(function () {
        var groups = JSON.parse(JSON.stringify(classGroups)); // Deep clone to avoid mutations
        // Ensure groups is a valid object
        if (!groups || typeof groups !== 'object') {
            return {};
        }
        if (filters.classId) {
            var targetClass_1 = String(filters.classId).toLowerCase().trim();
            groups = Object.fromEntries(Object.entries(groups).filter(function (_a) {
                var className = _a[0], v = _a[1];
                if (!v || !Array.isArray(v.students))
                    return false;
                // Strict class matching: only include groups where the class name exactly matches
                var groupClass = String(className || '').toLowerCase().trim();
                var matches = groupClass === targetClass_1;
                // Log for Northgate debugging
                if (targetClass_1.includes('top') && groupClass !== targetClass_1) {
                    console.log("Filtering out class \"".concat(groupClass, "\" for top class filter - only \"").concat(targetClass_1, "\" allowed"));
                }
                return matches;
            }));
        }
        Object.values(groups).forEach(function (g) {
            if (!g || !Array.isArray(g.students))
                return;
            // First, filter students to only include those whose class_name matches the group class
            var initialCount = g.students.length;
            g.students = g.students.filter(function (s) {
                if (!s)
                    return false;
                var studentClass = String(s.class_name || '').toLowerCase().trim();
                var groupClass = String(g.className).toLowerCase().trim();
                var matches = studentClass === groupClass;
                // Log mismatches for debugging (especially for top class)
                if (!matches && groupClass.includes('top')) {
                    console.warn("Removing student ".concat(s.student_id, " (").concat(s.first_name, " ").concat(s.last_name, ") from top class: student class \"").concat(studentClass, "\" doesn't match group class \"").concat(groupClass, "\""));
                }
                return matches;
            });
            // Log student count changes for top class debugging
            if (String(g.className).toLowerCase().includes('top') && initialCount !== g.students.length) {
                console.log("Top class \"".concat(g.className, "\": filtered from ").concat(initialCount, " to ").concat(g.students.length, " students"));
            }
            g.students = g.students.filter(function (s) {
                if (!s || !Array.isArray(s.results))
                    return false;
                // Ensure student has valid results
                if (s.results.length === 0)
                    return false;
                // Academic year filter — CLIENT-SIDE filtering (was previously server-side)
                if (filters.academicYearId) {
                    var hasAYData = s.results.some(function (r) { return r && r.academic_year_id; });
                    if (hasAYData) {
                        var matchesAY = s.results.some(function (r) {
                            return r && String(r.academic_year_id || '') === filters.academicYearId;
                        });
                        if (!matchesAY) {
                            console.log("Student ".concat(s.student_id, " (").concat(s.first_name, " ").concat(s.last_name, ") filtered out: no results for academic year ").concat(filters.academicYearId));
                            return false;
                        }
                    }
                }
                // Term filter - only apply if term data exists
                if (filters.term) {
                    var hasTermData = s.results.some(function (r) { return r && (r.term || r.term_name); });
                    if (hasTermData) {
                        var matchesTerm = s.results.some(function (r) {
                            return r && String(r.term || r.term_name || '').toLowerCase() === filters.term.toLowerCase();
                        });
                        if (!matchesTerm)
                            return false;
                    }
                }
                // Result type filter - IMPROVED LOGIC
                if (filters.resultType) {
                    var resultTypeFilter_1 = filters.resultType.toLowerCase();
                    if (resultTypeFilter_1.includes('end')) {
                        // For "End of Term" filter, include students who have:
                        // 1. Any result with "end" in the result type, OR
                        // 2. Both mid-term and end-term results (for complete End of Term reports)
                        var hasEndTermResult = s.results.some(function (r) {
                            return r && String(r.result_type_name || r.results_type || '').toLowerCase().includes('end');
                        });
                        var hasMidTermResult = s.results.some(function (r) {
                            return r && String(r.result_type_name || r.results_type || '').toLowerCase().includes('mid');
                        });
                        // Include if has end-term results OR has both mid and end components
                        if (!hasEndTermResult && !hasMidTermResult)
                            return false;
                    }
                    else {
                        // For other result types, exact match
                        var matchesResultType = s.results.some(function (r) {
                            return r && String(r.result_type_name || r.results_type || '').toLowerCase() === resultTypeFilter_1;
                        });
                        if (!matchesResultType)
                            return false;
                    }
                }
                // Student name/ID filter
                if (filters.student) {
                    var name_1 = "".concat(s.first_name || '', " ").concat(s.last_name || '').toLowerCase();
                    if (!name_1.includes(filters.student.toLowerCase()) && String(s.student_id || '') !== filters.student) {
                        return false;
                    }
                }
                return true;
            });
        });
        // Remove empty classes
        groups = Object.fromEntries(Object.entries(groups).filter(function (_a) {
            var _ = _a[0], v = _a[1];
            return v && Array.isArray(v.students) && v.students.length > 0;
        }));
        // Final logging for top class debugging
        Object.entries(groups).forEach(function (_a) {
            var className = _a[0], group = _a[1];
            if (String(className).toLowerCase().includes('top')) {
                console.log("Northgate top class \"".concat(className, "\" final count: ").concat(group.students.length, " students"));
                // Log student details for verification
                group.students.forEach(function (student, index) {
                    console.log("  ".concat(index + 1, ". ").concat(student.first_name, " ").concat(student.last_name, " (ID: ").concat(student.student_id, ", Class: ").concat(student.class_name, ")"));
                });
            }
        });
        return groups;
    }, [classGroups, filters]);
    // Helper: check if a single result row matches current filters - IMPROVED
    var matchesFilters = function (r) {
        // Academic year filter
        if (filters.academicYearId && r.academic_year_id) {
            if (String(r.academic_year_id) !== filters.academicYearId)
                return false;
        }
        if (filters.resultType) {
            var rt = String(r.result_type_name || r.results_type || '').toLowerCase();
            var filterType = filters.resultType.toLowerCase();
            if (filterType.includes('end')) {
                // For End of Term filter, include both mid and end results
                return rt.includes('mid') || rt.includes('end');
            }
            else {
                // For other filters, exact match
                return rt === filterType;
            }
        }
        if (filters.term) {
            var term = String(r.term || r.term_name || '').toLowerCase();
            if (term !== filters.term.toLowerCase())
                return false;
        }
        return true;
    };
    // Enhanced class-based positioning with proper per-class ranking
    var classGroupsWithPositions = (0, react_1.useMemo)(function () {
        var groups = JSON.parse(JSON.stringify(filteredClassGroups));
        // Ensure groups is a valid object
        if (!groups || typeof groups !== 'object') {
            return {};
        }
        // Process each class independently for proper class-based positioning
        Object.values(groups).forEach(function (classGroup) {
            // Ensure classGroup and its students are valid arrays
            if (!classGroup || !Array.isArray(classGroup.students)) {
                return;
            }
            // Filter results per student based on current filters
            classGroup.students.forEach(function (student) {
                if (!student)
                    return;
                student.results = (Array.isArray(student.results) ? student.results : []).filter(function (r) {
                    // Validate result data
                    if (!r || r.score === null || r.score === undefined || isNaN(parseFloat(String(r.score))))
                        return false;
                    return matchesFilters(r);
                });
            });
            // Remove students with no valid results after filtering
            classGroup.students = (Array.isArray(classGroup.students) ? classGroup.students : []).filter(function (s) { return s && s.results && Array.isArray(s.results) && s.results.length > 0; });
            // Calculate total marks for each student in this class
            classGroup.students.forEach(function (student) {
                if (!student)
                    return;
                var validScores = (Array.isArray(student.results) ? student.results : [])
                    .map(function (r) { return parseFloat(String(r.score || 0)); })
                    .filter(function (score) { return !isNaN(score) && score >= 0; });
                student.totalMarks = validScores.reduce(function (sum, score) { return sum + score; }, 0);
                student.averageMarks = validScores.length > 0 ? Math.round(student.totalMarks / validScores.length) : 0;
                student.subjectCount = validScores.length;
            });
            // Sort students by total marks within this class (highest first)
            classGroup.students.sort(function (a, b) {
                var totalA = a && a.totalMarks ? a.totalMarks : 0;
                var totalB = b && b.totalMarks ? b.totalMarks : 0;
                if (totalB !== totalA)
                    return totalB - totalA;
                // If total marks are equal, sort by average
                var avgA = a && a.averageMarks ? a.averageMarks : 0;
                var avgB = b && b.averageMarks ? b.averageMarks : 0;
                if (avgB !== avgA)
                    return avgB - avgA;
                // If still equal, sort by name
                return (a && a.last_name ? a.last_name : '').localeCompare(b && b.last_name ? b.last_name : '');
            });
            // Assign positions within this class only
            classGroup.students.forEach(function (student, index) {
                if (student) {
                    student.position = index + 1;
                    student.totalInClass = classGroup.students.length; // Class-specific total
                }
            });
        });
        // Remove classes that have no students after processing
        Object.keys(groups).forEach(function (className) {
            if (!groups[className] || !Array.isArray(groups[className].students) || !groups[className].students.length) {
                delete groups[className];
            }
        });
        return groups;
    }, [filteredClassGroups, filters.term, filters.resultType]);
    // Helper to split results into principal and other subjects
    function splitSubjects(results) {
        var principal = [];
        var others = [];
        if (!Array.isArray(results)) {
            return { principal: principal, others: others };
        }
        results.forEach(function (r) {
            var _a;
            if (!r)
                return; // Skip null/undefined items
            var st = ((_a = r.subject_type) !== null && _a !== void 0 ? _a : 'core').toLowerCase();
            var isIRE = (0, theology_subject_classifier_1.isReligiousEducationSubject)(r.subject_name);
            if (st === 'core' || isIRE)
                principal.push(r);
            else
                others.push(r);
        });
        return { principal: principal, others: others };
    }
    // Enhanced helper to group results by subject with better error handling
    function groupResultsBySubject(results) {
        if (!Array.isArray(results) || results.length === 0) {
            return [];
        }
        var grouped = {};
        results.forEach(function (result) {
            if (!result)
                return; // Skip null/undefined results
            var subjectKey = String(result.subject_id || result.subject_name);
            if (!subjectKey)
                return; // Skip invalid results
            if (!grouped[subjectKey]) {
                grouped[subjectKey] = {
                    subject_id: result.subject_id,
                    subject_name: result.subject_name || "Subject ".concat(subjectKey),
                    name_ar: result.name_ar,
                    teacher_name: result.teacher_name,
                    teacher_initials: result.teacher_initials,
                    midTermScore: null,
                    endTermScore: null,
                    regularScore: null,
                    subject_type: result.subject_type || 'core', // Add subject type
                };
            }
            var resultType = (result.result_type_name || result.results_type || '').toLowerCase();
            var score = parseFloat(String(result.score || 0));
            // Handle different result types
            if (resultType.includes('mid')) {
                grouped[subjectKey].midTermScore = score;
            }
            else if (resultType.includes('end')) {
                grouped[subjectKey].endTermScore = score;
                if (result.mid_term_score !== undefined && result.mid_term_score !== null) {
                    grouped[subjectKey].midTermScore = parseFloat(String(result.mid_term_score || 0));
                }
                if (result.end_term_score !== undefined && result.end_term_score !== null) {
                    grouped[subjectKey].endTermScore = parseFloat(String(result.end_term_score || 0));
                }
            }
            else {
                grouped[subjectKey].regularScore = score;
                if (result.mid_term_score !== undefined && result.mid_term_score !== null) {
                    grouped[subjectKey].midTermScore = parseFloat(String(result.mid_term_score || 0));
                }
                if (result.end_term_score !== undefined && result.end_term_score !== null) {
                    grouped[subjectKey].endTermScore = parseFloat(String(result.end_term_score || 0));
                }
            }
        });
        // Cross-reference logic for missing scores
        var allSubjects = new Set(results.map(function (r) { return r ? String(r.subject_id || r.subject_name) : null; }).filter(Boolean));
        allSubjects.forEach(function (subjectKey) {
            if (!subjectKey || !grouped[subjectKey])
                return;
            var subjectResults = results.filter(function (r) { return r && String(r.subject_id || r.subject_name) === subjectKey; });
            if (grouped[subjectKey].midTermScore === null) {
                var midTermResult = subjectResults.find(function (r) {
                    return r && (r.result_type_name || r.results_type || '').toLowerCase().includes('mid');
                });
                if (midTermResult) {
                    grouped[subjectKey].midTermScore = parseFloat(String(midTermResult.score || 0));
                }
            }
            if (grouped[subjectKey].endTermScore === null) {
                var endTermResult = subjectResults.find(function (r) {
                    return r && (r.result_type_name || r.results_type || '').toLowerCase().includes('end');
                });
                if (endTermResult) {
                    grouped[subjectKey].endTermScore = parseFloat(String(endTermResult.score || 0));
                }
            }
        });
        return Object.values(grouped).filter(function (item) { return item && item.subject_name; });
    }
    // Helper function to check if student is in Nursery section
    function isNurseryStudent(className) {
        var nurseryKeywords = ['nursery', 'baby', 'kindergarten', 'middle', 'top', 'pre', 'reception'];
        return nurseryKeywords.some(function (keyword) {
            return className.toLowerCase().includes(keyword);
        });
    }
    // Updated grading function with new scale
    function getGrade(score, isNursery) {
        if (isNursery === void 0) { isNursery = false; }
        var standardGrade = (function () {
            if (score >= 90)
                return 'D1';
            if (score >= 80)
                return 'D2';
            if (score >= 70)
                return 'C3';
            if (score >= 60)
                return 'C4';
            if (score >= 50)
                return 'C5';
            if (score >= 44)
                return 'C6';
            if (score >= 40)
                return 'P7';
            if (score >= 34)
                return 'P8';
            return 'F9';
        })();
        if (!isNursery)
            return standardGrade;
        // Nursery grade mapping
        switch (standardGrade) {
            case 'D1':
            case 'D2':
                return 'A';
            case 'C3':
            case 'C4':
                return 'B';
            case 'C5':
            case 'C6':
                return 'C';
            case 'P7':
            case 'P8':
                return 'D';
            case 'F9':
                return 'E';
            default:
                return 'E';
        }
    }
    // Helper function to get overall grade for Nursery (mode of grades)
    function getNurseryOverallGrade(grades) {
        if (grades.length === 0)
            return 'C';
        // Count frequency of each grade
        var gradeCount = {};
        grades.forEach(function (grade) {
            gradeCount[grade] = (gradeCount[grade] || 0) + 1;
        });
        // Find the most frequent grade(s)
        var maxCount = Math.max.apply(Math, Object.values(gradeCount));
        var mostFrequentGrades = Object.keys(gradeCount).filter(function (grade) { return gradeCount[grade] === maxCount; });
        // If there's a clear majority, return it
        if (mostFrequentGrades.length === 1) {
            return mostFrequentGrades[0];
        }
        // If grades are balanced, return 'C'
        return 'C';
    }
    function getGradePoint(grade) {
        switch (grade) {
            case 'D1': return 1;
            case 'D2': return 2;
            case 'C3': return 3;
            case 'C4': return 4;
            case 'C5': return 5;
            case 'C6': return 6;
            case 'P7': return 7;
            case 'P8': return 8;
            case 'F9': return 9;
            default: return 9;
        }
    }
    function getDivision(aggregates) {
        if (aggregates <= 12)
            return 'Division 1';
        if (aggregates <= 24)
            return 'Division 2';
        if (aggregates <= 28)
            return 'Division 3';
        if (aggregates <= 32)
            return 'Division 4';
        return 'Division U';
    }
    function isMathSubject(subjectName) {
        var normalized = (subjectName || '').toLowerCase();
        return normalized.includes('math') || normalized.includes('mathematics');
    }
    function commentsForGrade(grade) {
        // Nursery grades (A-D)
        if (grade === 'A')
            return 'Outstanding performance! Excellent work.';
        if (grade === 'B')
            return 'Very good work! Keep up the great effort.';
        if (grade === 'C')
            return 'Good progress! Continue working hard.';
        if (grade === 'D')
            return 'Needs more effort. Please work harder.';
        if (grade === 'E')
            return 'Requires significant improvement. Seek extra help.';
        // Standard grades (D1, D2, C3, etc.)
        if (grade === 'D1')
            return 'Excellent results, keep it up.';
        if (grade === 'D2')
            return 'Very good score, but aim at excellency.';
        if (grade === 'C3')
            return 'Satisfactory performance, please work harder.';
        if (grade === 'C4')
            return 'Needs improvement, consider seeking help.';
        if (grade === 'C5')
            return 'Unsatisfactory, please see your teacher.';
        if (grade === 'C6')
            return 'Needs improvement, consider seeking help.';
        if (grade === 'P8')
            return 'Passed, but you can do better.';
        if (grade === 'F9')
            return 'Failed, please see your teacher for guidance.';
        return 'Continue working hard.';
    }
    // Save initials to backend
    var persistTeacherInitials = function (values) {
        try {
            localStorage.setItem(TEACHER_INITIALS_STORAGE_KEY, JSON.stringify(values));
        }
        catch (error) {
            console.warn('Unable to persist initials in localStorage', error);
        }
    };
    var saveInitialsToBackend = function (classId, subjectId, newInitials) { return __awaiter(void 0, void 0, void 0, function () {
        var response, result, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setSaving(true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, 5, 6]);
                    return [4 /*yield*/, fetch('/api/teacher-initials', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ classId: classId, subjectId: subjectId, initials: newInitials }),
                        })];
                case 2:
                    response = _a.sent();
                    return [4 /*yield*/, response.json()];
                case 3:
                    result = _a.sent();
                    if (!response.ok || !(result === null || result === void 0 ? void 0 : result.success)) {
                        throw new Error((result === null || result === void 0 ? void 0 : result.message) || 'Failed to save initials');
                    }
                    react_hot_toast_1.toast.success('Initials saved successfully');
                    setTeacherInitials(function (prev) {
                        var _a;
                        var next = __assign(__assign({}, prev), (_a = {}, _a["".concat(classId, "-").concat(subjectId)] = newInitials, _a));
                        persistTeacherInitials(next);
                        return next;
                    });
                    return [3 /*break*/, 6];
                case 4:
                    error_2 = _a.sent();
                    console.error('Failed to save initials:', error_2);
                    react_hot_toast_1.toast.error((error_2 === null || error_2 === void 0 ? void 0 : error_2.message) || 'Failed to save initials');
                    return [3 /*break*/, 6];
                case 5:
                    setSaving(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); };
    // Ensure any inline edits are flushed before printing/exporting
    var flushInitialsBeforePrint = function () { return __awaiter(void 0, void 0, void 0, function () {
        var entries, payload, bulkResp, e_1, err_2;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 7, , 8]);
                    try {
                        (_b = (_a = document.activeElement) === null || _a === void 0 ? void 0 : _a.blur) === null || _b === void 0 ? void 0 : _b.call(_a);
                    }
                    catch (e) { /* ignore */ }
                    return [4 /*yield*/, new Promise(function (res) { return setTimeout(res, 150); })];
                case 1:
                    _c.sent();
                    entries = Object.entries(teacherInitials).filter(function (_a) {
                        var k = _a[0];
                        return /^\d+-\d+$/.test(k);
                    });
                    if (!entries.length)
                        return [2 /*return*/];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    payload = entries.map(function (_a) {
                        var k = _a[0], v = _a[1];
                        var _b = k.split('-'), classId = _b[0], subjectId = _b[1];
                        return { classId: classId, subjectId: subjectId, initials: v };
                    });
                    return [4 /*yield*/, fetch('/api/teacher-initials/bulk', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ items: payload }),
                        })];
                case 3:
                    bulkResp = _c.sent();
                    if (bulkResp.ok)
                        return [2 /*return*/];
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _c.sent();
                    return [3 /*break*/, 5];
                case 5: return [4 /*yield*/, Promise.all(entries.map(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
                        var _c, classId, subjectId, err_3;
                        var k = _b[0], v = _b[1];
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    _c = k.split('-'), classId = _c[0], subjectId = _c[1];
                                    _d.label = 1;
                                case 1:
                                    _d.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, fetch('/api/teacher-initials', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ classId: classId, subjectId: subjectId, initials: v }),
                                        })];
                                case 2:
                                    _d.sent();
                                    return [3 /*break*/, 4];
                                case 3:
                                    err_3 = _d.sent();
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); }))];
                case 6:
                    _c.sent();
                    return [3 /*break*/, 8];
                case 7:
                    err_2 = _c.sent();
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    }); };
    var handlePrint = function () { return __awaiter(void 0, void 0, void 0, function () {
        var reportArea, hasRenderedReports, printRootId, existingStyle, styleEl;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, flushInitialsBeforePrint()];
                case 1:
                    _a.sent();
                    reportArea = reportExportRef.current;
                    if (!reportArea) {
                        react_hot_toast_1.toast.error('Report area not found.');
                        return [2 /*return*/];
                    }
                    hasRenderedReports = reportArea.querySelector('.reportPage, .dual-report-page, [data-report-page="true"]');
                    if (!hasRenderedReports) {
                        react_hot_toast_1.toast.error('No reports are currently available to print.');
                        return [2 /*return*/];
                    }
                    printRootId = 'drce-report-print-root';
                    existingStyle = document.getElementById(printRootId);
                    if (existingStyle)
                        existingStyle.remove();
                    styleEl = document.createElement('style');
                    styleEl.id = printRootId;
                    styleEl.textContent = "\n      @media print {\n        body > *:not([data-print-root]) {\n          display: none !important;\n        }\n        body {\n          background: #fff !important;\n          margin: 0;\n          padding: 0;\n        }\n        [data-print-root] {\n          display: block !important;\n          width: 100% !important;\n          max-width: none !important;\n        }\n        .no-print {\n          display: none !important;\n        }\n      }\n    ";
                    document.head.appendChild(styleEl);
                    reportArea.setAttribute('data-print-root', 'true');
                    window.print();
                    window.setTimeout(function () {
                        reportArea.removeAttribute('data-print-root');
                        styleEl.remove();
                    }, 1500);
                    return [2 /*return*/];
            }
        });
    }); };
    // Export reports to PDF
    var exportToPDF = function () { return __awaiter(void 0, void 0, void 0, function () {
        var reportArea, hasRenderedReports, canvas, imgData, pdf, pdfWidth, pdfHeight, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, flushInitialsBeforePrint()];
                case 1:
                    _a.sent();
                    reportArea = reportExportRef.current;
                    if (!reportArea) {
                        window.alert('Report area not found!');
                        return [2 /*return*/];
                    }
                    hasRenderedReports = reportArea.querySelector('.reportPage, .dual-report-page, [data-report-page="true"]');
                    if (!hasRenderedReports) {
                        window.alert('No reports are currently available to export.');
                        return [2 /*return*/];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, (0, html2canvas_1.default)(reportArea, {
                            scale: 3, // Increase scale for high-resolution rendering
                            useCORS: true, // Enable cross-origin for images
                            allowTaint: false, // Prevent tainted canvas errors
                            logging: false, // Disable logging for production
                            backgroundColor: '#ffffff', // Ensure white background for the PDF
                        })];
                case 3:
                    canvas = _a.sent();
                    imgData = canvas.toDataURL('image/png');
                    pdf = new jspdf_1.jsPDF('p', 'mm', 'a4');
                    pdfWidth = pdf.internal.pageSize.getWidth();
                    pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                    // Add the captured image to the PDF
                    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                    // Save the PDF
                    pdf.save('Reports.pdf');
                    return [3 /*break*/, 5];
                case 4:
                    error_3 = _a.sent();
                    console.error('Error exporting to PDF:', error_3);
                    window.alert('Failed to export PDF. Please try again.');
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    // Export reports to Excel
    var exportToExcel = function () { return __awaiter(void 0, void 0, void 0, function () {
        var workbook;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, flushInitialsBeforePrint()];
                case 1:
                    _a.sent();
                    workbook = XLSX.utils.book_new();
                    Object.values(classGroupsWithPositions).forEach(function (classGroup) {
                        var worksheetData = __spreadArray([
                            ['Student Name', 'Subject', 'Teacher Initials', 'Score']
                        ], classGroup.students.flatMap(function (student) {
                            return student.results.map(function (result) { return [
                                "".concat(student.first_name, " ").concat(student.last_name),
                                result.subject_name,
                                teacherInitials["".concat(result.class_id, "-").concat(result.subject_id)] || result.teacher_initials || 'N/A',
                                result.score,
                            ]; });
                        }), true);
                        var worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
                        XLSX.utils.book_append_sheet(workbook, worksheet, classGroup.className);
                    });
                    XLSX.writeFile(workbook, 'Reports.xlsx');
                    return [2 /*return*/];
            }
        });
    }); };
    // Handle inline editing of teacher initials
    var handleInitialsChange = function (initialsKey, classId, subjectId, newInitials) {
        setTeacherInitials(function (prev) {
            var _a;
            var next = __assign(__assign({}, prev), (_a = {}, _a[initialsKey] = newInitials || '', _a));
            persistTeacherInitials(next);
            return next;
        });
    };
    // Sync "Next Term Begins" field across all reports
    var handleNextTermChange = function (newDate) {
        setNextTermBegins(newDate);
        // Optionally save to backend
        fetch('/api/next-term', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nextTermBegins: newDate }),
        }).catch(console.error);
    };
    // Inject/remove the @page landscape rule dynamically — cannot be done in
    // static styled-jsx because @page is not scopeable to a CSS class.
    (0, react_1.useEffect)(function () {
        var _a;
        var STYLE_ID = 'drais-print-page-size';
        var el = document.getElementById(STYLE_ID);
        // Check if active template uses landscape orientation
        var isLandscape = ((_a = activeDrceDoc === null || activeDrceDoc === void 0 ? void 0 : activeDrceDoc.theme) === null || _a === void 0 ? void 0 : _a.orientation) === 'landscape';
        if (isLandscape) {
            if (!el) {
                el = document.createElement('style');
                el.id = STYLE_ID;
                document.head.appendChild(el);
            }
            el.textContent = '@media print { @page { size: A4 landscape; margin: 10mm; } }';
        }
        else {
            el === null || el === void 0 ? void 0 : el.remove();
        }
        return function () { var _a; (_a = document.getElementById(STYLE_ID)) === null || _a === void 0 ? void 0 : _a.remove(); };
    }, [(_a = activeDrceDoc === null || activeDrceDoc === void 0 ? void 0 : activeDrceDoc.theme) === null || _a === void 0 ? void 0 : _a.orientation]);
    return (<TeacherInitialsContext.Provider value={{ teacherInitials: teacherInitials, handleInitialsChange: handleInitialsChange }}>
      <div className="px-4 mt-0">
        {/* Promotion Summary Notification - Only for 3rd Term */}
        {filters.term === 'Term 3' && promotionData && (promotionData === null || promotionData === void 0 ? void 0 : promotionData.success) && (<div className="mb-6 no-print">
            <PromotionSummaryNotification_1.default data={promotionData.data} onPromoteStudents={handlePromoteStudents}/>
          </div>)}

        {/* Filter Section at the top - Hidden when printing */}
        <div className="no-print mb-4 space-y-3">
          {/* Row 1: Filter dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={filters.academicYearId} onChange={function (e) { return setFilters(function (f) { return (__assign(__assign({}, f), { academicYearId: e.target.value, term: '' })); }); }} className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" title={"".concat(t('actions.filter'), " \u2014 ").concat(t('academicTime.academicYear'))}>
              <option value="">{"".concat(t('common.all'), " \u2014 ").concat(t('academicTime.academicYears'))}</option>
              {academicYears.map(function (ay) { return (<option key={ay.id} value={ay.id}>
                  {ay.name} {ay.status === 'active' ? '(Current)' : ''}
                </option>); })}
            </select>

            <select value={filters.term} onChange={function (e) { return setFilters(function (f) { return (__assign(__assign({}, f), { term: e.target.value })); }); }} className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
              <option value="">{"".concat(t('common.all'), " \u2014 ").concat(t('academicTime.terms'))}</option>
            {filteredTerms.length > 0
            ? filteredTerms.map(function (t) { return (<option key={t.id} value={t.name}>
                    {t.name}
                  </option>); })
            : <>
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </>}
          </select>

          <select value={filters.resultType} onChange={function (e) { return setFilters(function (f) { return (__assign(__assign({}, f), { resultType: e.target.value })); }); }} className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
            <option value="">{"".concat(t('common.all'), " \u2014 ").concat(t('academic.resultTypes'))}</option>
            {__spreadArray([], new Set(allResults.map(function (r) { return r.result_type_name || r.results_type; })), true).filter(Boolean)
            .map(function (rt) { return (<option key={rt} value={rt}>
                  {rt}
                </option>); })}
          </select>

          <select value={filters.classId} onChange={function (e) { return setFilters(function (f) { return (__assign(__assign({}, f), { classId: e.target.value })); }); }} className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
            <option value="">{"".concat(t('common.all'), " \u2014 ").concat(t('orgUnits.classes'))}</option>
            {__spreadArray([], new Set(allStudents.length
            ? allStudents.map(function (s) { return s.class_name || s.class_id; })
            : allResults.map(function (r) { return r.class_name; })), true).filter(Boolean)
            .map(function (cid) {
            var _a;
            var label = allStudents.length
                ? ((_a = allStudents.find(function (s) { return (s.class_name || s.class_id) === cid; })) === null || _a === void 0 ? void 0 : _a.class_name) || cid
                : cid;
            return (<option key={cid} value={cid}>
                    {label}
                  </option>);
        })}
          </select>

          <input value={filters.student} onChange={function (e) { return setFilters(function (f) { return (__assign(__assign({}, f), { student: e.target.value })); }); }} placeholder={t('people.student')} className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors min-w-[160px]"/>

          {/* Template selector — Phase 9: Dynamic DRCE templates */}
          <select value={selectedTemplateId || ''} onChange={function (e) {
            var key = e.target.value;
            setSelectedTemplateId(key);
        }} className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors" title={t('drce.template')}>
            {availableDrceTemplates.length === 0 ? (<option value="">{t('common.loading')}</option>) : (availableDrceTemplates.map(function (template) { return (<option key={template.meta.id} value={template.meta.template_key || template.meta.id}>
                  {template.meta.name}
                </option>); }))}
          </select>

          {/* Curriculum filter — Phase 2 */}
          <select value={curriculum} onChange={function (e) { return setCurriculum(e.target.value); }} className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors" title={"".concat(t('actions.filter'), " \u2014 ").concat(t('academic.curriculum'))}>
            <option value="all">All Subjects</option>
            <option value="secular">Secular Only</option>
            <option value="theology">Theology Only</option>
          </select>

          {/* Language selector — Phase 5, wired to state */}
          <select value={selectedLanguage === 'ar' ? 'Arabic' : 'English'} onChange={function (e) { return setSelectedLanguage(e.target.value === 'Arabic' ? 'ar' : 'en'); }} className="h-9 border border-gray-300 rounded-lg px-3 text-sm bg-white shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" title={t('settings.language')}>
            <option value="English">English</option>
            <option value="Arabic">العربية</option>
          </select>
          </div>

          {/* Row 2: Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
          <button onClick={handlePrint} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 shadow-sm hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Print
          </button>

          <button onClick={exportToPDF} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-white bg-emerald-600 shadow-sm hover:bg-emerald-700 active:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Export PDF
          </button>

          <button onClick={exportToExcel} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-white bg-teal-600 shadow-sm hover:bg-teal-700 active:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            Export Excel
          </button>

          <button onClick={function () { return setShowCustomization(true); }} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-white bg-gray-600 shadow-sm hover:bg-gray-700 active:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Customize
          </button>

          <a href="/reports/kitchen" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-white bg-amber-600 shadow-sm hover:bg-amber-700 active:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 transition-colors no-underline">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
            Template Kitchen
          </a>

          <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
            {loading && <span className="inline-flex items-center gap-1"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Loading...</span>}
            {!loading && classGroupsWithPositions && Object.keys(classGroupsWithPositions).length > 0 && (<span>{Object.values(classGroupsWithPositions).reduce(function (sum, g) { return sum + (g && Array.isArray(g.students) ? g.students.length : 0); }, 0)} students in {Object.keys(classGroupsWithPositions).length} class(es)</span>)}
          </div>
          </div>
        </div>
        <div ref={reportExportRef} id="academic-reports-export-area" data-report-export-root="true">
          {/* Reports rendering temporarily disabled for syntax isolation. */}
          <div className="no-print text-center py-12">Reports rendering disabled (temp)</div>
        </div>

        <style jsx global>{"\n          .no-print,\n          button,\n          select,\n          input,\n          label {\n            display: none !important;\n          }\n            .px-4, .mt-0, .p-4 {\n              padding: 0 !important;\n              margin: 0 !important;\n            }\n\n            div[class*=\"px-4\"], div[class*=\"mt-0\"] {\n              padding: 0 !important;\n              margin: 0 !important;\n            }\n\n            .reportPage {\n              page-break-inside: avoid;\n              page-break-after: always;\n              width: 100% !important;\n              max-width: 100% !important;\n              box-shadow: none !important;\n              border: none !important;\n              margin: 0 !important;\n              padding: 16px 18px !important;\n              border-radius: 0 !important;\n            }\n\n            .reportPage:first-of-type {\n              margin-top: 0 !important;\n              padding-top: 0 !important;\n            }\n\n            .classHeading {\n              display: none !important;\n            }\n\n            .reportPage,\n            .reportPage * {\n              font-size: 12px !important;\n            }\n\n            .fixed {\n              display: none !important;\n            }\n\n            body > div {\n              margin-top: 0 !important;\n              padding-top: 0 !important;\n            }\n          }\n        "}</style>
      </div>
    </TeacherInitialsContext.Provider>);
};
exports.default = ReportsPage;
// Inline style objects (mimic old CSS)
// NOTE: All layout now comes from the active ReportLayoutJSON template.
// These legacy style references remain only for the tahfiz/reports page.
// This file uses activeLayout from /api/report-templates/active instead.
// Adjust division based on the presence of F9 grades
function downgradeDivision(division) {
    switch (division) {
        case 'Division 1': return 'Division 2';
        case 'Division 2': return 'Division 3';
        case 'Division 3': return 'Division 4';
        case 'Division 4': return 'Division U';
        default: return division;
    }
}
function adjustDivisionForF9(division, grades, mathFail) {
    if (mathFail === void 0) { mathFail = false; }
    var failCount = grades.filter(function (g) { return g === 'F9'; }).length;
    if (failCount === 0)
        return division;
    var downgradeSteps = 1;
    if (mathFail)
        downgradeSteps += 1;
    var adjusted = division;
    for (var i = 0; i < downgradeSteps; i += 1) {
        var nextDivision = downgradeDivision(adjusted);
        if (nextDivision === adjusted)
            break;
        adjusted = nextDivision;
    }
    return adjusted;
}
// Enhanced calculation function for marks with conditional conversion
function calculateMarks(groupedResult, isEndOfTerm, enableConversion) {
    if (enableConversion === void 0) { enableConversion = false; }
    var midTermMarks = 0;
    var endTermMarks = 0;
    var m = groupedResult.midTermScore;
    var e = groupedResult.endTermScore;
    var r = groupedResult.regularScore;
    if (enableConversion) {
        // Apply conversion ONLY when button is clicked: MT (40→100), EOT (60→100)
        if (m !== null) {
            midTermMarks = Math.round((m / 100) * 40);
        }
        if (e !== null) {
            endTermMarks = Math.round((e / 100) * 60);
        }
    }
    else {
        if (m !== null) {
            midTermMarks = Math.round(m);
        }
        if (e !== null) {
            endTermMarks = Math.round(e);
        }
    }
    // Total calculation: Only use end-term marks for EOT reports
    var totalMarks = isEndOfTerm ? endTermMarks : midTermMarks;
    return { midTermMarks: midTermMarks, endTermMarks: endTermMarks, totalMarks: totalMarks };
}
// Helper function to get comments based on division
function getCommentsByDivision(division) {
    var comments = {
        'Division 1': {
            classTeacher: 'Brilliant!! all my hopes are in you.',
            dos: 'Outstanding Results, keep focused.',
            headteacher: 'Great work done, keep it up.'
        },
        'Division 2': {
            classTeacher: 'Promising results, keep more focused.',
            dos: 'Very good performance, keep it up.',
            headteacher: 'You are a first grade material, keep more focused.'
        },
        'Division 3': {
            classTeacher: 'Improve and make it to the next grade.',
            dos: 'Good effort, but more work needed.',
            headteacher: 'You need to be active in discussions.'
        },
        'Division 4': {
            classTeacher: 'You have to be very active in the discussion groups.',
            dos: 'More effort is needed from you.',
            headteacher: 'You are capable of improving, just keep focused.'
        },
        'Division U': {
            classTeacher: 'More concentration is needed from you in order to perform better.',
            dos: 'Work very hard to improve your performance.',
            headteacher: 'Concentrate more on academics for a better performance.'
        },
        // Nursery grade comments
        'A': {
            classTeacher: 'Excellent performance! Keep up the great work.',
            dos: 'Outstanding achievement in all areas.',
            headteacher: 'Exceptional learner, continue to excel.'
        },
        'B': {
            classTeacher: 'Very good work, aim for excellence.',
            dos: 'Good progress, keep working hard.',
            headteacher: 'Well done, you can achieve even more.'
        },
        'C': {
            classTeacher: 'Satisfactory progress, more effort needed.',
            dos: 'Average performance, room for improvement.',
            headteacher: 'Work harder to improve your performance.'
        },
        'D': {
            classTeacher: 'Needs more attention and practice.',
            dos: 'Below average, requires extra support.',
            headteacher: 'More focus and effort is needed.'
        },
        'E': {
            classTeacher: 'Requires immediate intervention and support.',
            dos: 'Needs significant improvement.',
            headteacher: 'Extra help and attention required.'
        }
    };
    return comments[division] || comments['Division U'];
}
// Comments section as a component
function CommentsSection(_a) {
    var student = _a.student, division = _a.division, nextTermBegins = _a.nextTermBegins, handleNextTermChange = _a.handleNextTermChange, layout = _a.layout;
    var divisionComments = getCommentsByDivision(division);
    var ribbonStyle = {
        display: 'inline-block',
        position: 'relative',
        background: layout.comments.ribbon.background,
        color: layout.comments.ribbon.color,
        fontWeight: 'bold',
        padding: layout.comments.ribbon.padding,
        borderRadius: layout.comments.ribbon.borderRadius,
        marginRight: 18,
        marginBottom: 8,
        fontSize: 14,
    };
    var textStyle = {
        color: layout.comments.text.color,
        fontStyle: layout.comments.text.fontStyle,
        borderBottom: layout.comments.text.borderBottom,
    };
    return (<div style={{ marginTop: '1%' }}>
      Comments/Remarks
      <div style={{ marginTop: 2 }}>
        <div style={{ marginBottom: 10, width: '100%' }}>
          <span style={ribbonStyle}>Class Teacher&apos;s Comment:</span>
          <span style={textStyle}>{student.class_teacher_comment || divisionComments.classTeacher}</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={ribbonStyle}>DOS Comment:</span>
          <span style={textStyle}>{student.dos_comment || divisionComments.dos}</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={ribbonStyle}>Headteacher&apos;s Comment:</span>
          <span style={textStyle}>{student.headteacher_comment || divisionComments.headteacher}</span>
        </div>
        <div contentEditable suppressContentEditableWarning style={{ textDecoration: 'underline dashed', marginTop: 12, cursor: 'text' }} onBlur={function (e) { var _a; return handleNextTermChange(((_a = e.currentTarget.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || nextTermBegins); }}>
          {nextTermBegins}
        </div>
        <div style={{ textDecoration: 'underline dashed', marginTop: 5 }}>Next Term Begins</div>
      </div>
    </div>);
}
// Grade table as a component
function GradeTable(_a) {
    var layout = _a.layout;
    var thStyle = {
        background: layout.gradeTable.th.background,
        border: layout.gradeTable.th.border,
        textAlign: layout.gradeTable.th.textAlign,
        padding: layout.gradeTable.th.padding,
    };
    var tdStyle = {
        border: layout.gradeTable.td.border,
        textAlign: layout.gradeTable.td.textAlign,
        padding: layout.gradeTable.td.padding,
    };
    return (<div style={{ marginTop: 20, width: '100%', fontSize: 13 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <th style={thStyle}>GRADE</th>
            <th style={thStyle}>D1</th>
            <th style={thStyle}>D2</th>
            <th style={thStyle}>C3</th>
            <th style={thStyle}>C4</th>
            <th style={thStyle}>C5</th>
            <th style={thStyle}>C6</th>
            <th style={thStyle}>P7</th>
            <th style={thStyle}>P8</th>
            <th style={thStyle}>F9</th>
          </tr>
          <tr>
            <td style={tdStyle}>SCORE RANGE</td>
            <td style={tdStyle}>90–100</td>
            <td style={tdStyle}>80–89</td>
            <td style={tdStyle}>70–79</td>
            <td style={tdStyle}>60–69</td>
            <td style={tdStyle}>50–59</td>
            <td style={tdStyle}>44–49</td>
            <td style={tdStyle}>40–43</td>
            <td style={tdStyle}>34–39</td>
            <td style={tdStyle}>0–33</td>
          </tr>
        </tbody>
      </table>
    </div>);
}
