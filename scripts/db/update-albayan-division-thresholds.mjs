import 'dotenv/config';
import { query } from '../../src/lib/db.js';

(async () => {
  try {
    console.log('Connecting using TIDB host:', process.env.TIDB_HOST || 'default');
    const schoolId = 8002;
    const rows = await query('SELECT id, schema_json FROM dvcf_documents WHERE school_id = ?', [schoolId]);
    console.log(`Found ${rows.length} document(s) for school_id=${schoolId}`);
    const thresholds = [
      { maxValue: 12, label: 'Division I' },
      { maxValue: 24, label: 'Division II' },
      { maxValue: 28, label: 'Division III' },
      { maxValue: 32, label: 'Division IV' },
    ];

    for (const r of rows) {
      let doc;
      try {
        doc = JSON.parse(r.schema_json);
      } catch (e) {
        console.error('Skipping id', r.id, '— invalid JSON');
        continue;
      }
      let changed = false;
      if (Array.isArray(doc.sections)) {
        doc.sections = doc.sections.map(s => {
          if (s && typeof s === 'object' && s.aggregateConfig) {
            s.aggregateConfig = { ...(s.aggregateConfig || {}), divisionThresholds: thresholds };
            changed = true;
            return s;
          }
          return s;
        });
      }
      if (changed) {
        const updated = JSON.stringify(doc);
        await query('UPDATE dvcf_documents SET schema_json = ? WHERE id = ?', [updated, r.id]);
        console.log('Updated document id', r.id);
      } else {
        console.log('No aggregateConfig in document id', r.id, '- skipping');
      }
    }
    console.log('Done.');
  } catch (err) {
    console.error('Migration failed:', err);
  }
})();

// ---------------------------------------------------------------------------
// Ensure a school-scoped emergency template exists with the Albayan thresholds
// ---------------------------------------------------------------------------
(async () => {
  try {
    const schoolId = 8002;
    const templateKey = 'emergency-secular';
    const built = await import('../../src/lib/drce/defaults.js');
    const base = built.DRAIS_DEFAULT_DOCUMENT;
    if (!base) {
      console.warn('Could not load DRAIS_DEFAULT_DOCUMENT from defaults.js — skipping upsert');
      return;
    }
    const doc = { ...base, meta: { ...base.meta, template_key: templateKey, school_id: schoolId, updated_at: new Date().toISOString() } };
    // ensure division thresholds are present on assessment sections
    const thresholds = [
      { maxValue: 12, label: 'Division I' },
      { maxValue: 24, label: 'Division II' },
      { maxValue: 28, label: 'Division III' },
      { maxValue: 32, label: 'Division IV' },
    ];
    if (Array.isArray(doc.sections)) {
      doc.sections = doc.sections.map(s => {
        if (s && typeof s === 'object' && (s.type === 'assessment' || s.aggregateConfig)) {
          const sec = { ...(s) };
          sec.aggregateConfig = { ...(sec.aggregateConfig ?? {}), divisionThresholds: thresholds, gradePointMap: sec.aggregateConfig?.gradePointMap ?? { D1:1,D2:2,C3:3,C4:4,C5:5,C6:6,P7:7,P8:8,F9:9 }, divisionFallback: sec.aggregateConfig?.divisionFallback ?? 'Division U' };
          return sec;
        }
        return s;
      });
    }

    const existing = await query('SELECT id FROM dvcf_documents WHERE template_key = ? AND school_id = ?', [templateKey, schoolId]);
    const schemaJson = JSON.stringify(doc);
    if (existing.length > 0) {
      await query('UPDATE dvcf_documents SET schema_json = ?, name = ? , description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [schemaJson, doc.meta.name || 'Albayan Emergency', doc.meta.name || '', existing[0].id]);
      console.log('Updated existing school-scoped template for', templateKey, 'school', schoolId);
    } else {
      await query('INSERT INTO dvcf_documents (school_id, document_type, name, description, schema_json, schema_version, is_default, template_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [schoolId, 'report_card', doc.meta.name || 'Albayan Emergency', '', schemaJson, 1, 0, templateKey]);
      console.log('Inserted new school-scoped template for', templateKey, 'school', schoolId);
    }
  } catch (err) {
    console.error('Upsert failed:', err);
  }
})();
