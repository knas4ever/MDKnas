import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Toolbar from '../../src/components/Toolbar';

const props = {
  onAction: () => {},
  theme: 'light',
  themes: ['light', 'dark'],
  onThemeChange: () => {},
  typewriter: false,
  onToggleTypewriter: () => {},
  sourceMode: false,
  onToggleSourceMode: () => {}
};

describe('Toolbar', () => {
  afterEach(cleanup);

  it('emits actions for format buttons', () => {
    const onAction = vi.fn();
    render(<Toolbar {...props} onAction={onAction} />);
    fireEvent.click(screen.getByTitle('Bold (Ctrl+B)'));
    expect(onAction).toHaveBeenCalledWith('bold');
    fireEvent.click(screen.getByTitle('Heading 1 (Ctrl+Shift+1)'));
    expect(onAction).toHaveBeenCalledWith('h1');
    fireEvent.click(screen.getByTitle('Task list (Ctrl+Shift+T)'));
    expect(onAction).toHaveBeenCalledWith('tasklist');
    fireEvent.click(screen.getByTitle('Highlight (Ctrl+Shift+H)'));
    expect(onAction).toHaveBeenCalledWith('highlight');
  });

  it('switches theme via the select', () => {
    const onThemeChange = vi.fn();
    render(<Toolbar {...props} onThemeChange={onThemeChange} />);
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('toggles typewriter mode', () => {
    const onToggleTypewriter = vi.fn();
    render(<Toolbar {...props} onToggleTypewriter={onToggleTypewriter} />);
    fireEvent.click(screen.getByTitle('Toggle typewriter mode'));
    expect(onToggleTypewriter).toHaveBeenCalled();
  });

  it('toggles raw markdown / rich view', () => {
    const onToggleSourceMode = vi.fn();
    const h = render(<Toolbar {...props} onToggleSourceMode={onToggleSourceMode} />);
    fireEvent.click(h.getByTitle('Toggle raw markdown / rich text view'));
    expect(onToggleSourceMode).toHaveBeenCalled();
    expect(h.getByText('Raw MD')).toBeTruthy();
  });

  it('shows Rich label in source mode', () => {
    const h = render(<Toolbar {...props} sourceMode onToggleSourceMode={() => {}} />);
    expect(h.getByText('Rich')).toBeTruthy();
  });

  it('does not contain file buttons (they live in the File menu)', () => {
    render(<Toolbar {...props} />);
    expect(screen.queryByText('New')).toBeNull();
    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.queryByText('Save As')).toBeNull();
  });
});
