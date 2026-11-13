import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PomodoroTimer } from '../../src/ui/components/PomodoroTimer';

const start = new Date('2026-11-12T20:00:00Z');
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);
const clock = () => screen.getByRole('timer').textContent;
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('Pomodoro timer', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.setSystemTime(start);
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('pauses, resumes and resets a focus session', () => {
    const { rerender } = render(<PomodoroTimer now={start} />);
    expect(clock()).toBe('25:00');
    click('Start');

    vi.setSystemTime(at(60));
    rerender(<PomodoroTimer now={at(60)} />);
    expect(clock()).toBe('24:00');
    click('Pause');

    vi.setSystemTime(at(120));
    rerender(<PomodoroTimer now={at(120)} />);
    expect(clock()).toBe('24:00');
    click('Resume');
    rerender(<PomodoroTimer now={at(121)} />);
    expect(clock()).toBe('23:59');

    click('Reset');
    expect(clock()).toBe('25:00');
  });

  it('restores a running session and lets the user start a break after it ends', () => {
    const first = render(<PomodoroTimer now={start} />);
    click('Start');
    first.unmount();

    vi.setSystemTime(at(90));
    const second = render(<PomodoroTimer now={at(90)} />);
    expect(clock()).toBe('23:30');
    second.unmount();

    vi.setSystemTime(at(1500));
    render(<PomodoroTimer now={at(1500)} />);
    expect(clock()).toBe('00:00');
    expect(screen.getByRole('status').textContent).toBe('Focus session complete.');
    click('Start break');
    expect(clock()).toBe('05:00');
    expect(screen.getByRole('button', { name: 'Break' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('lets the user customize and persist focus and break lengths', () => {
    const first = render(<PomodoroTimer now={start} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Focus minutes' }), { target: { value: '40' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Break minutes' }), { target: { value: '10' } });
    expect(clock()).toBe('40:00');
    first.unmount();

    render(<PomodoroTimer now={start} compact />);
    expect(clock()).toBe('40:00');
    expect((screen.getByRole('spinbutton', { name: 'Break minutes' }) as HTMLInputElement).value).toBe('10');
  });
});
