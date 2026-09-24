// Private workbook storage: tenant-scoped ids, authenticated (non-public) assets,
// direct-upload tickets. No network: signing is local; the asset itself is never fetched here.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.CLOUDINARY_CLOUD_NAME = 'testcloud';
process.env.CLOUDINARY_API_KEY = '123456789012345';
process.env.CLOUDINARY_API_SECRET = 'test-secret-not-real';

let S;
before(async () => { S = await import('@/lib/idcards/storage.ts'); });

describe('workbook storage', () => {
  it('mints a ticket namespaced to the school and user, authenticated type, signed', () => {
    const t = S.signWorkbookUpload(12020, 7, 'xlsx');
    assert.match(t.publicId, /^drais\/idcards-jobs\/12020\/7\/[0-9a-f-]{36}\.xlsx$/);
    assert.equal(t.type, 'authenticated');
    assert.equal(t.uploadUrl, 'https://api.cloudinary.com/v1_1/testcloud/raw/upload');
    assert.match(t.signature, /^[0-9a-f]{40,64}$/);
    assert.notEqual(S.signWorkbookUpload(12020, 7, 'xlsx').publicId, t.publicId, 'each ticket is unique');
  });

  it('the API secret is never part of the ticket', () => {
    assert.doesNotMatch(JSON.stringify(S.signWorkbookUpload(1, 1, 'xls')), /test-secret-not-real/);
  });

  it('ownsPublicId accepts only this school+user, and only exact uuid.ext names', () => {
    const id = S.signWorkbookUpload(12020, 7, 'xlsx').publicId;
    assert.equal(S.ownsPublicId(id, 12020, 7), true);
    assert.equal(S.ownsPublicId(id, 12021, 7), false, 'other school');
    assert.equal(S.ownsPublicId(id, 12020, 8), false, 'other user');
    assert.equal(S.ownsPublicId('drais/idcards-jobs/12020/7/../../1/1/x.xlsx', 12020, 7), false);
    assert.equal(S.ownsPublicId('drais/idcards-jobs/12020/7/anything.xlsx', 12020, 7), false);
    assert.equal(S.ownsPublicId('drais/students/12020/7/' + id.split('/').pop(), 12020, 7), false);
    assert.equal(S.ownsPublicId('drais/idcards-jobs/12020/70/' + id.split('/').pop(), 12020, 7), false, 'prefix collision (7 vs 70)');
  });

  it('only accepts excel extensions', () => {
    assert.equal(S.extensionOf('list.XLSX'), 'xlsx');
    assert.equal(S.extensionOf('old.xls'), 'xls');
    assert.equal(S.extensionOf('macro.xlsm'), null);
    assert.equal(S.extensionOf('a.pdf'), null);
    assert.equal(S.extensionOf('noext'), null);
  });

  it('assets are private: authenticated type + signed delivery, never a public upload/URL', () => {
    const src = readFileSync(new URL('../storage.ts', import.meta.url), 'utf8');
    assert.match(src, /type: 'authenticated', sign_url: true/);
    assert.match(src, /resource_type: 'raw', type: 'authenticated', invalidate: true/);
    assert.doesNotMatch(src, /type: 'upload'/);
    const gen = readFileSync(new URL('../../../components/idcards/IdCardGenerate.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(gen, /api_secret|API_SECRET/);
  });

  it('supports workbooks far larger than a database row or serverless body', () => {
    assert.ok(S.MAX_WORKBOOK_BYTES >= 50 * 1024 * 1024);
  });
});
