# DRAIS Bilingual Report Engine - Deployment Checklist

## Pre-Deployment (DO THIS FIRST)

### 1. Database Fix for Theology Subjects
```bash
# Connect to your database and execute:
mysql -u root -p your_database < database/fix_theology_subject_types.sql

# Verify it worked:
mysql -u root -p your_database -e "
  SELECT subject_type, COUNT(*) as count 
  FROM subjects 
  GROUP BY subject_type 
  ORDER BY subject_type;
"
```

Expected output:
```
subject_type | count
core         | XX
secular      | XX
theology     | XX (should have theology subjects now)
```

### 2. Verify Font Installation
Check that Noto Naskh Arabic font is available:
- [ ] Font file in `public/fonts/NotoNaskhArabic-*.ttf`
- [ ] CSS @font-face defined in global styles or layout

### 3. Build & Test Locally
```bash
npm run build
npm run dev
```

## Manual Testing Checklist

### English Report (Should still work perfectly)
- [ ] Navigate to /academics/reports
- [ ] Select a term with results
- [ ] Leave language as "English"
- [ ] Generate report
- [ ] Verify:
  - All text is English
  - No Arabic text appears
  - Layout is normal LTR
  - All labels are readable
  - Export to PDF works

### Arabic Report (Primary Test)
- [ ] Navigate to /academics/reports
- [ ] Select a term with results
- [ ] Select "Arabic" from language dropdown
- [ ] Generate report
- [ ] Verify:
  - [ ] All text is Arabic (no English remnants)
  - [ ] Layout is right-to-left (RTL)
  - [ ] School Arabic name displays
  - [ ] Subject names in Arabic (القرآن الكريم, الرياضيات, etc.)
  - [ ] Table columns reversed for RTL
  - [ ] Comment ribbons are mirrored
  - [ ] Grade table in Arabic
  - [ ] Can read without errors
  - [ ] Export to PDF looks good

### Theology Subjects (Critical)
- [ ] Filter by "Theology Only"
- [ ] Verify Islamic subjects appear:
  - [ ] Quran (القرآن الكريم)
  - [ ] Fiqh (الفقه)
  - [ ] Tawhid (التوحيد)
  - [ ] Hadith (الحديث الشريف)
  - [ ] Akhlaq (الأخلاق)
  - [ ] Any other theology subjects in your school
- [ ] Generate Arabic report with theology filter
- [ ] All Islamic subjects display with Arabic names

### Secular Subjects (For Mixed Schools)
- [ ] Filter by "Secular Only"
- [ ] Verify secular subjects appear:
  - [ ] Mathematics (الرياضيات)
  - [ ] English (اللغة الإنجليزية)
  - [ ] Science (العلوم)
  - [ ] Any other secular subjects
- [ ] No Islamic subjects appear

### Mixed School Test (if applicable)
- [ ] Don't filter by curriculum
- [ ] Generate report with all subjects
- [ ] Both secular and theology subjects appear
- [ ] Each with correct Arabic/English names

### Export Tests
- [ ] Print to PDF (English) → Works
- [ ] Print to PDF (Arabic) → RTL layout preserved
- [ ] Export to Excel (English) → Works
- [ ] Export to Excel (Arabic) → Arabic columns/headers preserved

### Printing
- [ ] Print English report → Layout correct
- [ ] Print Arabic report → RTL maintained on paper
- [ ] No page break issues
- [ ] Headers/footers display correctly

## Deployment Steps

### 1. Merge Code
```bash
git add src/lib/drce/reportTranslations.ts
git add src/lib/theology-subject-classifier.ts
git add src/components/drce/
git add src/app/academics/reports/page.tsx
git commit -m "feat: bilingual Arabic report engine with RTL support"
git push origin main
```

### 2. Deploy to Production
```bash
# Your deployment process (e.g., Vercel, Docker, etc.)
# Ensure database migrations run FIRST
```

### 3. Run Database Migration
**BEFORE** deploying frontend, run:
```bash
mysql -u root -p production_database < database/fix_theology_subject_types.sql
```

### 4. Monitor & Verify
- [ ] Application starts without errors
- [ ] No console errors in browser DevTools
- [ ] Reports page loads
- [ ] English reports work
- [ ] Arabic reports work
- [ ] No font loading errors
- [ ] Performance acceptable

## Rollback Plan

If issues arise:

### Rollback Code
```bash
git revert <commit-hash>
git push origin main
```

### Rollback Database (if needed)
```bash
# Restore from backup
mysql -u root -p production_database < backup_before_theology_fix.sql
```

## Performance Considerations

- **Font Loading:** Noto Naskh Arabic font (~100KB) loads on first Arabic render
- **Translation Lookup:** O(1) dictionary lookup - negligible performance impact
- **RTL Rendering:** Minimal overhead - just CSS direction changes
- **Database:** Subject classification already indexed on school_id + subject_type

Monitor if report generation becomes slow:
- Check Noto Naskh font file size
- Profile with Chrome DevTools
- Consider font subset if needed

## Documentation

After deployment:
- [ ] Share BILINGUAL_REPORT_ENGINE_COMPLETE.md with team
- [ ] Run `npm run validate:reports` for verification details
- [ ] Brief admin on new Arabic language option
- [ ] Brief teachers on new feature

## Troubleshooting Quick Links

**Issue:** Arabic text not displaying
→ See: BILINGUAL_REPORT_ENGINE_COMPLETE.md → TROUBLESHOOTING

**Issue:** Theology subjects not appearing
→ See: BILINGUAL_REPORT_ENGINE_COMPLETE.md → TROUBLESHOOTING

**Issue:** RTL layout broken
→ See: BILINGUAL_REPORT_ENGINE_COMPLETE.md → TROUBLESHOOTING

## Success Criteria

✅ Deployment successful when:
1. English reports work exactly as before
2. Arabic reports render 100% in Arabic with RTL
3. Theology subjects appear in both filters
4. No console errors or warnings
5. PDF/Excel exports preserve formatting
6. Users can switch languages instantly
7. Performance is acceptable (<2s report load)

---

**Deployment Date:** _______________
**Deployed By:** _______________
**Verification Status:** _______________

✅ = Tested & Working
⚠️ = Needs Investigation
❌ = Not Working

**Notes:**
