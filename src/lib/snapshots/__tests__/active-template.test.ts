import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveActiveTemplateId } from '@/lib/snapshots/active-template';

test('prefers the selected DRCE template in DRCE mode', () => {
  const result = resolveActiveTemplateId({
    mode: 'drce',
    selectedDrceTemplateId: 'custom-drc-template',
    fallbackTemplateId: 'drce-emergency-secular',
    availableTemplateIds: ['drce-emergency-secular', 'custom-drc-template'],
  });

  assert.equal(result, 'custom-drc-template');
});

test('uses the first available DRCE template when nothing is selected', () => {
  const result = resolveActiveTemplateId({
    mode: 'drce',
    selectedDrceTemplateId: '',
    fallbackTemplateId: 'drce-emergency-secular',
    availableTemplateIds: ['custom-drc-template', 'drce-emergency-secular'],
  });

  assert.equal(result, 'custom-drc-template');
});

test('uses the active DRCE template before registry fallbacks', () => {
  const result = resolveActiveTemplateId({
    mode: 'drce',
    selectedDrceTemplateId: '',
    activeDrceTemplateId: '42',
    fallbackTemplateId: 'drce-emergency-secular',
    availableTemplateIds: ['custom-drc-template', 'drce-emergency-secular'],
  });

  assert.equal(result, '42');
});

test('keeps emergency mode on the emergency template', () => {
  const result = resolveActiveTemplateId({
    mode: 'emergency',
    selectedDrceTemplateId: 'custom-drc-template',
    fallbackTemplateId: 'drce-emergency-secular',
    availableTemplateIds: ['custom-drc-template'],
  });

  assert.equal(result, 'drce-emergency-secular');
});
