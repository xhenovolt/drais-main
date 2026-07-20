// src/components/drce/sections/ResultsTableSection.tsx
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
exports.ResultsTableSection = ResultsTableSection;
var react_1 = require("react");
var styleResolver_1 = require("@/lib/drce/styleResolver");
var theology_subject_classifier_1 = require("@/lib/theology-subject-classifier");
var bindingResolver_1 = require("@/lib/drce/bindingResolver");
var totalsCalculator_1 = require("@/lib/drce/totalsCalculator");
var arabic_1 = require("@/lib/drce/arabic");
function calculateTotals(results, columns, ctx) {
    var totals = {};
    columns.forEach(function (col) {
        var sum = 0;
        var count = 0;
        results.forEach(function (row) {
            var binding = col.binding || '';
            if (!binding)
                return;
            var value = (0, bindingResolver_1.resolveBinding)(binding, ctx, row);
            var numValue = parseFloat(String(value));
            if (!isNaN(numValue)) {
                sum += numValue;
                count++;
            }
        });
        totals[col.id] = count > 0 ? sum : 0;
    });
    return totals;
}
function calculateAverages(results, columns, ctx) {
    var totals = calculateTotals(results, columns, ctx);
    var count = results.length;
    var averages = {};
    columns.forEach(function (col) {
        averages[col.id] = count > 0 ? totals[col.id] / count : 0;
    });
    return averages;
}
function ResultsTableSection(_a) {
    var _this = this;
    var _b, _c, _d, _e;
    var section = _a.section, ctx = _a.ctx, onCellChange = _a.onCellChange, onColumnHide = _a.onColumnHide;
    var _f = (0, react_1.useState)(null), editingCell = _f[0], setEditingCell = _f[1];
    var _g = (0, react_1.useState)(false), isSaving = _g[0], setIsSaving = _g[1];
    if (!section.visible)
        return null;
    var language = (_b = ctx.language) !== null && _b !== void 0 ? _b : 'en';
    var isRTL = language === 'ar';
    var style = section.style;
    var tableStyle = __assign(__assign({}, (0, styleResolver_1.resolveTableStyle)(style)), { direction: isRTL ? 'rtl' : 'ltr' });
    var visibleCols = __spreadArray([], (section.columns || []), true).filter(function (c) { return c.visible; })
        .sort(function (a, b) { return a.order - b.order; });
    // Reverse column order for RTL
    if (isRTL) {
        visibleCols = visibleCols.slice().reverse();
    }
    var allResults = (_c = ctx.results) !== null && _c !== void 0 ? _c : [];
    var subjectFilter = (_d = section.subjectFilter) !== null && _d !== void 0 ? _d : 'all';
    var isFilteredSubject = function (r) {
        var _a;
        var type = ((_a = r.subjectType) !== null && _a !== void 0 ? _a : 'primary').toLowerCase();
        var isIRE = (0, theology_subject_classifier_1.isReligiousEducationSubject)(String(r.subjectName || ''));
        return !isIRE && type !== 'primary' && type !== 'core' && type !== 'theology' && type !== 'islamic' && type !== 'religion';
    };
    var results = subjectFilter === 'all'
        ? allResults
        : allResults.filter(isFilteredSubject);
    // Apply cell content edits from overrides
    var cellContentEdits = section.__cellContentEdits || [];
    if (cellContentEdits.length > 0) {
        results = results.map(function (row, rowIndex) {
            var editedRow = __assign({}, row);
            cellContentEdits.forEach(function (edit) {
                if (edit.rowIndex === rowIndex) {
                    editedRow[edit.columnId] = edit.payload.content;
                }
            });
            return editedRow;
        });
    }
    var totalsConfig = section.totalsConfig;
    var totalsEnabled = (_e = totalsConfig === null || totalsConfig === void 0 ? void 0 : totalsConfig.enabled) !== null && _e !== void 0 ? _e : true; // Default to TRUE - always show totals
    var sumColumnIds = ((totalsConfig === null || totalsConfig === void 0 ? void 0 : totalsConfig.sumColumnIds) && totalsConfig.sumColumnIds.length > 0
        ? totalsConfig.sumColumnIds
        : visibleCols.filter(function (c) { return c.id.toLowerCase().includes('score') || c.id.toLowerCase().includes('total'); }).map(function (c) { return c.id; }));
    var totalColumns = visibleCols.filter(function (col) { return sumColumnIds.includes(col.id); });
    var totals = calculateTotals(results, totalColumns, ctx);
    var averages = (totalsConfig === null || totalsConfig === void 0 ? void 0 : totalsConfig.showAverage) !== false ? calculateAverages(results, totalColumns, ctx) : {};
    // Calculate grand totals for the summary row
    var totalObtained = results.reduce(function (sum, result) { return sum + (parseFloat(String(result.total || 0)) || 0); }, 0);
    var totalPossible = results.reduce(function (sum, result) {
        var _a, _b;
        var subject = (_a = ctx.subjects) === null || _a === void 0 ? void 0 : _a.find(function (s) { return s.name === result.subjectName; });
        return sum + ((_b = subject === null || subject === void 0 ? void 0 : subject.totalMarks) !== null && _b !== void 0 ? _b : 100);
    }, 0);
    var percentage = totalPossible > 0 ? (totalObtained / totalPossible) * 100 : 0;
    var averageScore = results.length > 0 ? totalObtained / results.length : 0;
    // Validate subject totals
    var validationErrors = [];
    results.forEach(function (result, index) {
        var _a, _b;
        var subject = (_a = ctx.subjects) === null || _a === void 0 ? void 0 : _a.find(function (s) { return s.name === result.subjectName; });
        var subjectTotal = (_b = subject === null || subject === void 0 ? void 0 : subject.totalMarks) !== null && _b !== void 0 ? _b : 100;
        var obtained = parseFloat(String(result.total || 0)) || 0;
        if (obtained > subjectTotal) {
            validationErrors.push("Row ".concat(index + 1, " (").concat(result.subjectName, "): ").concat(obtained, " exceeds subject total ").concat(subjectTotal));
        }
    });
    var handleCellBlur = function (e, columnId, rowIndex) { return __awaiter(_this, void 0, void 0, function () {
        var newValue, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    newValue = ((_a = e.currentTarget.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '';
                    if (!onCellChange) return [3 /*break*/, 5];
                    setIsSaving(true);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, 4, 5]);
                    return [4 /*yield*/, onCellChange(columnId, rowIndex, newValue)];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 3:
                    error_1 = _b.sent();
                    console.error('Failed to save cell change:', error_1);
                    return [3 /*break*/, 5];
                case 4:
                    setIsSaving(false);
                    return [7 /*endfinally*/];
                case 5:
                    setEditingCell(null);
                    return [2 /*return*/];
            }
        });
    }); };
    return (<table style={__assign(__assign({}, tableStyle), { pageBreakInside: 'avoid' })}>
      <colgroup>
        {visibleCols.map(function (col) { return (<col key={col.id} style={{ width: col.width }}/>); })}
      </colgroup>
      <thead style={{ pageBreakInside: 'avoid', pageBreakAfter: 'avoid' }}>
        <tr style={{ pageBreakInside: 'avoid' }}>
          {visibleCols.map(function (col) { return (<th key={col.id} style={(0, styleResolver_1.resolveTableHeaderCellStyle)(style, col.align, col.style)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start', gap: '4px' }}>
                <span>{(0, arabic_1.resolveLocalizedLabel)(ctx.language, col.header, col.headerAr)}</span>
                {onColumnHide && (<button onClick={function () { return onColumnHide(col.id); }} style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '2px 4px',
                    borderRadius: '2px',
                    opacity: 0.7,
                }} onMouseOver={function (e) { return e.currentTarget.style.opacity = '1'; }} onMouseOut={function (e) { return e.currentTarget.style.opacity = '0.7'; }} title={"Hide ".concat(col.header, " column")}>
                    ×
                  </button>)}
              </div>
            </th>); })}
        </tr>
      </thead>
      <tbody>
        {results.map(function (row, i) { return (<tr key={i}>
            {visibleCols.map(function (col) {
                var cellValue = (0, bindingResolver_1.resolveBinding)(col.binding, ctx, row);
                // Apply cell content edits from overrides
                var cellContentEdits = section.__cellContentEdits;
                if (cellContentEdits) {
                    var edit = cellContentEdits.find(function (e) {
                        return e.targetId === section.id &&
                            e.columnId === col.id &&
                            e.rowIndex === i;
                    });
                    if (edit) {
                        cellValue = edit.payload.content;
                    }
                }
                // Editable when a column opts in (contentEditable: true) OR when
                // the preview is in edit mode and this is the initials column.
                // This keeps result.initials as the explicit editable fallback.
                var isEditable = col.contentEditable === true || (!!onCellChange && col.binding === 'result.initials');
                return (<td key={col.id} style={__assign(__assign({}, (0, styleResolver_1.resolveTableDataCellStyle)(style, col.align, col.style)), { cursor: isEditable ? 'text' : 'default' })} contentEditable={isEditable} suppressContentEditableWarning={isEditable} onBlur={isEditable ? function (e) { return handleCellBlur(e, col.id, i); } : undefined} onFocus={function () { return isEditable && setEditingCell({ col: col.id, row: i }); }}>
                  {cellValue}
                </td>);
            })}
          </tr>); })}
        
        {/* Grand Total Row */}
        {totalsEnabled && (<tr style={{
                fontWeight: 'bold',
                backgroundColor: 'rgba(0, 0, 0, 0.08)',
                borderTop: '2px solid #000',
                pageBreakInside: 'avoid'
            }}>
            {visibleCols.map(function (col, idx) {
                var isFirstCol = idx === 0;
                var cellContent = (0, totalsCalculator_1.buildTotalsRowCellContent)({
                    column: col,
                    totals: totals,
                    totalsConfig: totalsConfig,
                    totalObtained: totalObtained,
                    totalPossible: totalPossible,
                    percentage: percentage,
                    averageScore: averageScore,
                    language: language,
                    isFirstColumn: isFirstCol,
                });
                return (<td key={col.id} colSpan={isFirstCol && (totalsConfig === null || totalsConfig === void 0 ? void 0 : totalsConfig.showTotalPossible) ? 2 : 1} style={__assign(__assign({}, (0, styleResolver_1.resolveTableDataCellStyle)(style, col.align, totalsConfig === null || totalsConfig === void 0 ? void 0 : totalsConfig.rowStyle)), { fontWeight: 'bold', backgroundColor: 'rgba(0, 0, 0, 0.08)', borderTop: '2px solid #000', padding: '8px' })}>
                  {cellContent}
                </td>);
            })}
          </tr>)}
      </tbody>
    </table>);
}
