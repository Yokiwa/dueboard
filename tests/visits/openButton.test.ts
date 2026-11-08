import { describe, it, expect, beforeEach } from 'vitest';
import { openButton } from '../../src/visits/finders/open';

const page = (html: string) => {
  document.body.innerHTML = html;
  return document;
};

describe('openButton (the one button DueBoard may press: "open the assignment")', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it.each([
    ['<button>Open Assignment</button>', 'Open Assignment'],
    ['<button>Open in new tab</button>', 'Open in new tab'],
    ['<a href="https://education.wiley.com/x" target="_blank">Launch</a>', 'Launch'],
    ['<div role="button" aria-label="View assignment"></div>', 'View assignment'],
    ['<button>Go to assignment</button>', 'Go to assignment'],
  ])('presses %s', (html, label) => {
    expect(openButton(page(html))?.label).toBe(label);
  });

  it.each([
    '<button>Start Assignment</button>',
    '<button>Begin</button>',
    '<button>Submit</button>',
    '<button>Continue</button>',
    '<button>Continue attempt</button>',
    '<button>Resume</button>',
    '<button>Take Quiz</button>',
    '<button>Open attempt 2</button>',
    '<button>Retry</button>',
    '<button hidden>Open Assignment</button>',
    '<button>Open this assignment now and please read all the instructions before you begin</button>',
  ])('never presses %s', (html) => {
    expect(openButton(page(html))).toBeNull();
  });

  it('a link that would open a new tab is made to open here instead', () => {
    const d = page('<a href="https://education.wiley.com/x" target="_blank">Open</a>');
    openButton(d)!.press();
    expect(d.querySelector('a')!.getAttribute('target')).toBe('_self');
  });
});
