import { describe, it, expect } from 'vitest';
import { scrubJson, scrubHtml } from '../../src/diagnostics/scrub';

describe('scrubJson', () => {
  it('redacts values containing secrets and replaces emails', () => {
    const input = { DisplayName: 'Alex Doe', Email: 'a@purdue.edu', Nested: [{ Name: 'Alex Doe notes' }], Keep: 'CS 18000' };
    expect(scrubJson(input, ['Alex Doe'])).toEqual({
      DisplayName: '[REDACTED]',
      Email: 'user@example.com',
      Nested: [{ Name: '[REDACTED]' }],
      Keep: 'CS 18000',
    });
  });

  it('redacts numbers equal to a secret id', () => {
    expect(scrubJson({ Identifier: 12345, Other: 7 }, ['12345'])).toEqual({ Identifier: '[REDACTED]', Other: 7 });
  });

  it('ignores empty secrets', () => {
    expect(scrubJson({ a: 'hello' }, [''])).toEqual({ a: 'hello' });
  });
});

describe('scrubHtml', () => {
  it('replaces secrets and emails inside html', () => {
    const html = '<span>Alex Doe</span><a href="mailto:a@purdue.edu">a@purdue.edu</a>';
    expect(scrubHtml(html, ['Alex Doe'])).toBe(
      '<span>[REDACTED]</span><a href="mailto:user@example.com">user@example.com</a>',
    );
  });
});
