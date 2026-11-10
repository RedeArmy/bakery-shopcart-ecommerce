// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  AUDIT_MODULES,
  auditParams,
  describeChange,
  isAuditModule,
  parseAuditQuery,
} from '../../src/features/audit/model/audit';

describe('the address of the audit log', () => {
  it('reads the module, the identifier, the days and the page', () => {
    expect(
      parseAuditQuery(
        new URLSearchParams('module=Users&key=%20PED-7%20&from=2030-06-01&to=2030-06-30&page=3'),
      ),
    ).toEqual({
      module: 'Users',
      entityKey: 'PED-7',
      from: '2030-06-01',
      to: '2030-06-30',
      page: 3,
    });
  });

  it('falls back to the defaults for what it does not understand', () => {
    expect(
      parseAuditQuery(new URLSearchParams('module=Nothing&from=ayer&to=2030-6-1&page=-2')),
    ).toEqual({ module: null, entityKey: '', from: null, to: null, page: 1 });
  });

  it('cuts the identifier at 40 characters', () => {
    expect(parseAuditQuery(new URLSearchParams({ key: 'a'.repeat(80) })).entityKey).toHaveLength(
      40,
    );
  });

  it('only writes what differs from the defaults', () => {
    const none = { module: null, entityKey: '', from: null, to: null, page: 1 };
    expect(auditParams(none).toString()).toBe('');
    expect(
      auditParams({
        module: 'Orders',
        entityKey: '12',
        from: '2030-06-01',
        to: '2030-06-30',
        page: 2,
      }).toString(),
    ).toBe('module=Orders&key=12&from=2030-06-01&to=2030-06-30&page=2');
  });

  it('knows the modules that the database writes', () => {
    expect(AUDIT_MODULES).toHaveLength(11);
    expect(isAuditModule('Coupons')).toBe(true);
    expect(isAuditModule('coupons')).toBe(false);
    expect(isAuditModule('')).toBe(false);
  });
});

describe('what a record changed', () => {
  it('lists the fields whose value changed, with the value before and after', () => {
    expect(
      describeChange('{"IsActive":true,"Name":"A"}', '{"IsActive":false,"Name":"A"}'),
    ).toMatchObject([
      { field: 'IsActive', before: 'true', after: 'false', rawBefore: true, rawAfter: false },
    ]);
  });

  it('shows every field of a creation, which has no previous value', () => {
    expect(describeChange(null, '{"Name":"Cakes","IsActive":true}')).toMatchObject([
      { field: 'Name', before: null, after: 'Cakes', rawBefore: null },
      { field: 'IsActive', before: null, after: 'true', rawBefore: null },
    ]);
  });

  it('shows a field that disappeared', () => {
    expect(describeChange('{"Code":"X1"}', '{}')).toMatchObject([
      { field: 'Code', before: 'X1', after: null, rawAfter: null },
    ]);
  });

  it('writes nested values as JSON and keeps the texts as they are', () => {
    expect(describeChange('{"Tags":["a"]}', '{"Tags":["a","b"]}')).toMatchObject([
      { field: 'Tags', before: '["a"]', after: '["a","b"]', rawAfter: ['a', 'b'] },
    ]);
  });

  it('carries the other fields of the record, in lower case, for the values that depend on them', () => {
    const [change] = describeChange(null, '{"Type":"Percentage","Value":"10.00"}') ?? [];
    expect(change?.context).toEqual({ type: 'Percentage', value: '10.00' });
  });

  it('shows a loose array, like the lines of a return, as the field lines', () => {
    expect(describeChange(null, '[{"idOrderLine":4,"quantity":2}]')).toMatchObject([
      { field: 'lines', before: null, rawAfter: [{ idOrderLine: 4, quantity: 2 }] },
    ]);
  });

  it('has nothing to list when both sides are empty or equal', () => {
    expect(describeChange(null, null)).toEqual([]);
    expect(describeChange('', undefined)).toEqual([]);
    expect(describeChange('{"A":1}', '{"A":1}')).toEqual([]);
  });

  it('gives up on a text that is not a JSON object, so that the screen shows it as it was saved', () => {
    expect(describeChange('Pending', 'Paid')).toBeNull();
    expect(describeChange('{"A":1}', 'not json')).toBeNull();
    expect(describeChange('42', '43')).toBeNull();
  });
});
