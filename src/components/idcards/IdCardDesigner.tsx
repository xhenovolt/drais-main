'use client';
/**
 * Two-sided ID card designer. Static artwork (colour / imported PNG-JPEG) is a
 * backdrop; name, photo, QR etc. are separate positioned elements, so importing
 * a designer's artwork never flattens the dynamic fields.
 */
import React, { useRef, useState } from 'react';
import { IdCardFace } from './IdCardFace';
import {
  STANDARD_TOKENS, ID1_HEIGHT_MM, ID1_WIDTH_MM, newElementId, blankSpec,
  type IdCardElement, type IdCardSpec, type IdCardSide, type CardRecord,
} from '@/lib/idcards/spec';

const PX = 5; // editor pixels per mm
const snap = (v: number) => Math.round(v * 2) / 2;

interface Props {
  spec: IdCardSpec;
  onChange: (next: IdCardSpec) => void;
  previewRecord: CardRecord;
  logoUrl?: string;
  extraTokens?: string[];   // e.g. col:<Header> tokens from an Excel job
}

export function IdCardDesigner({ spec, onChange, previewRecord, logoUrl, extraTokens = [] }: Props) {
  const [face, setFace] = useState<'front' | 'back'>('front');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);

  const side: IdCardSide = face === 'back' && spec.back ? spec.back : spec.front;
  const currentFace: 'front' | 'back' = face === 'back' && spec.back ? 'back' : 'front';
  const selected = side.elements.find((e) => e.id === selectedId) ?? null;

  const setSide = (patch: Partial<IdCardSide>) =>
    onChange({ ...spec, [currentFace]: { ...side, ...patch } } as IdCardSpec);
  const setElement = (id: string, patch: Partial<IdCardElement>) =>
    setSide({ elements: side.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as IdCardElement) : e)) });

  const add = (el: IdCardElement) => { setSide({ elements: [...side.elements, el] }); setSelectedId(el.id); };
  const addText = () => add({ id: newElementId('t'), kind: 'text', x: 4, y: 4, w: 40, h: 6, text: '{full_name}', fontSizePt: 9, color: '#111111', align: 'left' });
  const addPhoto = () => add({ id: newElementId('p'), kind: 'image', source: 'photo', x: 4, y: 12, w: 20, h: 24, fit: 'cover', shape: 'rect' });
  const addLogo = () => add({ id: newElementId('l'), kind: 'image', source: 'logo', x: 4, y: 4, w: 10, h: 10, fit: 'contain', shape: 'rect' });
  const addQr = () => add({ id: newElementId('q'), kind: 'qr', x: 4, y: 4, w: 20, h: 20, value: '{admission_no}' });
  const addRect = () => add({ id: newElementId('r'), kind: 'rect', x: 0, y: 0, w: spec.size.widthMm, h: 6, fill: '#1a3a6b' });
  const remove = () => { if (selected) { setSide({ elements: side.elements.filter((e) => e.id !== selected.id) }); setSelectedId(null); } };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.sx) / PX; const dy = (e.clientY - d.sy) / PX;
    if (d.mode === 'move') setElement(d.id, { x: snap(d.ox + dx), y: snap(d.oy + dy) });
    else setElement(d.id, { w: Math.max(1, snap(d.ow + dx)), h: Math.max(1, snap(d.oh + dy)) });
  };
  const endDrag = () => { drag.current = null; };

  const uploadArtwork = async (file: File) => {
    setUploading(true); setUploadMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/id-cards/assets', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) { setUploadMsg({ kind: 'err', text: json.error || 'Upload failed' }); return; }
      setSide({ backgroundImage: { url: json.url, fit: 'stretch' } });
      const dpi = Math.round(json.width / (spec.size.widthMm / 25.4));
      setUploadMsg(dpi < 200
        ? { kind: 'warn', text: `Imported. Effective resolution is about ${dpi} DPI at this card size — it may print soft. Export at 300 DPI (about ${Math.round(spec.size.widthMm / 25.4 * 300)} px wide).` }
        : { kind: 'ok', text: `Imported (${json.width}×${json.height}px, about ${dpi} DPI).` });
      const ratioCard = spec.size.widthMm / spec.size.heightMm; const ratioImg = json.width / json.height;
      if (Math.abs(ratioCard - ratioImg) > 0.03) {
        setUploadMsg({ kind: 'warn', text: `Imported, but the image proportions (${ratioImg.toFixed(2)}) differ from the card (${ratioCard.toFixed(2)}); it will be stretched. Use "Crop to fill" or re-export at the card size.` });
      }
    } catch { setUploadMsg({ kind: 'err', text: 'Upload failed' }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const tokenChoices = [...STANDARD_TOKENS.map((t) => t.token), ...extraTokens];
  const num = (v: number, set: (n: number) => void, step = 0.5) => (
    <input type="number" step={step} value={Number.isFinite(v) ? v : 0} onChange={(e) => set(Number(e.target.value))} style={inputStyle} />
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 16, alignItems: 'start' }}>
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={tab(currentFace === 'front')} onClick={() => setFace('front')}>Front</button>
          {spec.back
            ? <button style={tab(currentFace === 'back')} onClick={() => setFace('back')}>Back</button>
            : <button style={btn} onClick={() => { onChange({ ...spec, back: blankSpec().front }); setFace('back'); }}>+ Add back side</button>}
          {spec.back && (
            <button style={{ ...btn, color: '#b91c1c' }} onClick={() => { if (confirm('Remove the back side of this design?')) { const { back: _b, ...rest } = spec; onChange(rest as IdCardSpec); setFace('front'); setSelectedId(null); } }}>
              Remove back
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button style={btn} onClick={addText}>+ Text</button>
          <button style={btn} onClick={addPhoto}>+ Photo</button>
          <button style={btn} onClick={addLogo}>+ Logo</button>
          <button style={btn} onClick={addQr}>+ QR</button>
          <button style={btn} onClick={addRect}>+ Shape</button>
        </div>

        <div
          style={{ display: 'inline-block', boxShadow: '0 4px 18px rgba(0,0,0,.25)', touchAction: 'none' }}
          onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
        >
          <IdCardFace
            spec={spec} face={currentFace} record={previewRecord} logoUrl={logoUrl} unit={PX}
            renderElementWrapper={(el, node, box) => (
              <div
                style={{ ...box, cursor: 'move', outline: el.id === selectedId ? '2px solid #2563eb' : '1px dashed rgba(37,99,235,.35)' }}
                onPointerDown={(e) => {
                  e.stopPropagation(); setSelectedId(el.id);
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                  drag.current = { id: el.id, mode: 'move', sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
                }}
              >
                <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>{node}</div>
                {el.id === selectedId && (
                  <div
                    style={{ position: 'absolute', right: -5, bottom: -5, width: 10, height: 10, background: '#2563eb', cursor: 'nwse-resize' }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                      drag.current = { id: el.id, mode: 'resize', sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
                    }}
                  />
                )}
              </div>
            )}
          />
        </div>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
          Drag to move, drag the corner to resize. Preview shows sample data; real learners fill the {'{fields}'} at print time.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
        <fieldset style={box}>
          <legend style={legend}>Card size (mm)</legend>
          <div style={row}>
            <label>W {num(spec.size.widthMm, (n) => onChange({ ...spec, size: { ...spec.size, widthMm: Math.min(210, Math.max(30, n)) } }))}</label>
            <label>H {num(spec.size.heightMm, (n) => onChange({ ...spec, size: { ...spec.size, heightMm: Math.min(297, Math.max(30, n)) } }))}</label>
          </div>
          <button style={btn} onClick={() => onChange({ ...spec, size: { widthMm: ID1_WIDTH_MM, heightMm: ID1_HEIGHT_MM } })}>Standard ID-1 (85.6×54)</button>
        </fieldset>

        <fieldset style={box}>
          <legend style={legend}>{currentFace === 'back' ? 'Back' : 'Front'} background</legend>
          <div style={row}>
            <input type="color" value={toHex(side.backgroundColor)} onChange={(e) => setSide({ backgroundColor: e.target.value })} />
            <button style={btn} disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : 'Import artwork'}</button>
            {side.backgroundImage && <button style={btn} onClick={() => setSide({ backgroundImage: undefined })}>Remove</button>}
          </div>
          {side.backgroundImage && (
            <label style={{ display: 'block', marginTop: 6 }}>
              Fit{' '}
              <select value={side.backgroundImage.fit} style={inputStyle}
                onChange={(e) => setSide({ backgroundImage: { url: side.backgroundImage!.url, fit: e.target.value as 'cover' | 'stretch' } })}>
                <option value="stretch">Stretch to card</option>
                <option value="cover">Crop to fill</option>
              </select>
            </label>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadArtwork(f); }} />
          <p style={{ fontSize: 11, color: '#64748b', margin: '6px 0 0' }}>
            PNG, JPEG or WebP. From Photoshop, Publisher, Canva or a PDF, export each side as an image at 300 DPI, then import it here — names and photos are added on top as live fields.
          </p>
          {uploadMsg && <p style={{ fontSize: 12, marginTop: 6, color: uploadMsg.kind === 'err' ? '#b91c1c' : uploadMsg.kind === 'warn' ? '#b45309' : '#15803d' }}>{uploadMsg.text}</p>}
        </fieldset>

        <fieldset style={box}>
          <legend style={legend}>{selected ? `Selected: ${selected.kind}` : 'Selection'}</legend>
          {!selected && <p style={{ color: '#64748b', margin: 0 }}>Click an element on the card to edit it.</p>}
          {selected && (
            <>
              <div style={row}>
                <label>X {num(selected.x, (n) => setElement(selected.id, { x: n }))}</label>
                <label>Y {num(selected.y, (n) => setElement(selected.id, { y: n }))}</label>
              </div>
              <div style={row}>
                <label>W {num(selected.w, (n) => setElement(selected.id, { w: Math.max(1, n) }))}</label>
                <label>H {num(selected.h, (n) => setElement(selected.id, { h: Math.max(1, n) }))}</label>
              </div>
              {selected.kind === 'text' && (
                <>
                  <textarea value={selected.text} rows={2} style={{ ...inputStyle, width: '100%' }} onChange={(e) => setElement(selected.id, { text: e.target.value })} />
                  <select style={inputStyle} value="" onChange={(e) => { if (e.target.value) setElement(selected.id, { text: `${selected.text}{${e.target.value}}` }); }}>
                    <option value="">Insert field…</option>
                    {tokenChoices.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div style={row}>
                    <label>Size pt {num(selected.fontSizePt, (n) => setElement(selected.id, { fontSizePt: n }), 0.5)}</label>
                    <input type="color" value={toHex(selected.color)} onChange={(e) => setElement(selected.id, { color: e.target.value })} />
                  </div>
                  <div style={row}>
                    <label><input type="checkbox" checked={!!selected.bold} onChange={(e) => setElement(selected.id, { bold: e.target.checked })} /> Bold</label>
                    <label><input type="checkbox" checked={!!selected.uppercase} onChange={(e) => setElement(selected.id, { uppercase: e.target.checked })} /> CAPS</label>
                    <select style={inputStyle} value={selected.align ?? 'left'} onChange={(e) => setElement(selected.id, { align: e.target.value as 'left' | 'center' | 'right' })}>
                      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                    </select>
                  </div>
                </>
              )}
              {selected.kind === 'image' && (
                <div style={row}>
                  <select style={inputStyle} value={selected.shape ?? 'rect'} onChange={(e) => setElement(selected.id, { shape: e.target.value as 'rect' | 'circle' })}>
                    <option value="rect">Rectangle</option><option value="circle">Circle</option>
                  </select>
                  <select style={inputStyle} value={selected.fit ?? 'cover'} onChange={(e) => setElement(selected.id, { fit: e.target.value as 'cover' | 'contain' })}>
                    <option value="cover">Fill</option><option value="contain">Fit</option>
                  </select>
                  <span style={{ color: '#64748b' }}>{selected.source === 'photo' ? 'Learner photo' : selected.source === 'logo' ? 'School logo' : 'Fixed image'}</span>
                </div>
              )}
              {selected.kind === 'qr' && (
                <label>Encodes <input style={{ ...inputStyle, width: '100%' }} value={selected.value} onChange={(e) => setElement(selected.id, { value: e.target.value })} /></label>
              )}
              {selected.kind === 'rect' && (
                <div style={row}>
                  <label>Fill <input type="color" value={toHex(selected.fill)} onChange={(e) => setElement(selected.id, { fill: e.target.value })} /></label>
                  <label>Round {num(selected.radiusMm ?? 0, (n) => setElement(selected.id, { radiusMm: Math.max(0, n) }))}</label>
                </div>
              )}
              <button style={{ ...btn, color: '#b91c1c' }} onClick={remove}>Delete element</button>
            </>
          )}
        </fieldset>
      </div>
    </div>
  );
}

const toHex = (c?: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#ffffff');
const inputStyle: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', width: 70, background: '#fff', color: '#111' };
const btn: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 10px', background: '#fff', color: '#0f172a', cursor: 'pointer', fontSize: 12 };
const tab = (on: boolean): React.CSSProperties => ({ ...btn, background: on ? '#1d4ed8' : '#fff', color: on ? '#fff' : '#0f172a', borderColor: on ? '#1d4ed8' : '#cbd5e1' });
const box: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fff', color: '#0f172a' };
const legend: React.CSSProperties = { fontWeight: 600, padding: '0 4px', fontSize: 12 };
const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 };
