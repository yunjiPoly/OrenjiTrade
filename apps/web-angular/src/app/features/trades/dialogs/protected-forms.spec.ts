import {
  createDisputeForm,
  createShipForm,
  descriptionError,
  toDisputeRequest,
  toShipRequest,
} from './protected-forms';

describe('protected trade forms', () => {
  it('sends only the shipping details that were given, trimmed', () => {
    const form = createShipForm();
    expect(form.valid).toBe(true);
    expect(toShipRequest(form.getRawValue())).toEqual({});
    form.setValue({ carrier: ' Canada Post ', trackingNumber: ' E2E123 ', notes: '' });
    expect(toShipRequest(form.getRawValue())).toEqual({
      carrier: 'Canada Post',
      trackingNumber: 'E2E123',
    });
    form.controls.carrier.setValue('x'.repeat(81));
    expect(form.controls.carrier.hasError('maxlength')).toBe(true);
  });

  it('needs a reason and a real description to open a dispute', () => {
    const form = createDisputeForm();
    expect(form.controls.reason.hasError('required')).toBe(true);
    expect(descriptionError(form.controls.description.errors)).toBe(
      'Describe what is wrong so an admin can review it.',
    );
    form.controls.description.setValue('  bent  ');
    expect(descriptionError(form.controls.description.errors)).toBe(
      'Add a few more details (at least 10 characters).',
    );
    form.controls.description.setValue('x'.repeat(2001));
    expect(descriptionError(form.controls.description.errors)).toBe(
      'Keep it under 2000 characters.',
    );
    form.setValue({ reason: 'DAMAGED', description: '  The corner is bent and creased.  ' });
    expect(form.valid).toBe(true);
    expect(toDisputeRequest(form.getRawValue())).toEqual({
      reason: 'DAMAGED',
      description: 'The corner is bent and creased.',
    });
  });
});
