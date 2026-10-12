/** JEWL's work screen shell (2026-10-12): the idle view with no session; the status line badge. */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JewlWorkScreenBody } from './JewlWorkScreen';
import { JewlStatusLine, idleScreenModel } from './JewlWorkPopup';
import { jewlStateLine, needsYouCount, type JewlWorkPayload } from '@/lib/jewl-work';

describe('idle view', () => {
  it('renders with no session at all: state line, no tubes, no ladder, a way out', () => {
    const html = renderToStaticMarkup(createElement(JewlWorkScreenBody, {
      model: idleScreenModel(null, null), log: [], onClose: () => {},
    }));
    expect(html).toContain('// JEWL');
    expect(html).toContain('idle — watching');
    expect(html).toContain('IDLE');
    expect(html).not.toContain('class="gn-pillars"');
    expect(html).not.toContain('class="gn-ladder"');
    expect(html).toContain('CLOSE');
  });

  it('shows the recent log lines and the Needs-you count', () => {
    const payload: JewlWorkPayload = {
      sessions: [], recentLog: ['Tidy the tavern · placed two tables', 'Tidy the tavern · session closed'], cycling: false,
      needsYou: [{ id: 'r1', kind: 'reconciliation', sessionId: null, title: 'Mistake, or somewhere new?' }],
    };
    const html = renderToStaticMarkup(createElement(JewlWorkScreenBody, {
      model: idleScreenModel(payload, null),
      log: payload.recentLog.map((text, i) => ({ id: i, text })), onClose: () => {},
    }));
    expect(html).toContain('placed two tables');
    expect(html).toContain('1 thing needs you');
    expect(html).toContain('1 needs you');
  });
});

describe('status line', () => {
  it('the badge shows the Needs-you count, and is absent at zero', () => {
    const payload: JewlWorkPayload = {
      sessions: [], recentLog: [], cycling: false,
      needsYou: [
        { id: 'a', kind: 'draft', sessionId: 's1', title: 'Submit thorn' },
        { id: 'b', kind: 'prod', sessionId: 's1', title: 'JEWL asks' },
        { id: 'c', kind: 'reconciliation', sessionId: null, title: 'Mistake?' },
      ],
    };
    const n = needsYouCount(payload);
    const html = renderToStaticMarkup(createElement(JewlStatusLine, {
      line: jewlStateLine(payload, null), count: n, cycling: false, waiting: false, onOpen: () => {},
    }));
    expect(html).toContain('data-jewl-needs="3"');
    expect(html).toContain('3 things need you');
    const none = renderToStaticMarkup(createElement(JewlStatusLine, { line: 'idle — watching', count: 0, cycling: true, waiting: false, onOpen: () => {} }));
    expect(none).not.toContain('data-jewl-needs');
    expect(none).toContain('jw-status-on');
  });
});
