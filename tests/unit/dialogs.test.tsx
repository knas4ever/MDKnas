import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PromptDialog from '../../src/components/PromptDialog';
import TableDialog from '../../src/components/TableDialog';

describe('PromptDialog', () => {
  afterEach(cleanup);

  it('submits the entered value on Enter', () => {
    const onSubmit = vi.fn();
    render(
      <PromptDialog message="Link URL" defaultValue="https://" onSubmit={onSubmit} onCancel={() => {}} />
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('https://example.com');
  });

  it('cancels on Escape', () => {
    const onCancel = vi.fn();
    render(
      <PromptDialog message="Link URL" defaultValue="" onSubmit={() => {}} onCancel={onCancel} />
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('submits via the OK button and cancels via Cancel', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <PromptDialog message="New name" defaultValue="a.md" onSubmit={onSubmit} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByText('OK'));
    expect(onSubmit).toHaveBeenCalledWith('a.md');
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('TableDialog', () => {
  afterEach(cleanup);

  it('inserts the requested size', () => {
    const onSubmit = vi.fn();
    render(<TableDialog onSubmit={onSubmit} onCancel={() => {}} />);
    const rows = screen.getByLabelText('Rows') as HTMLInputElement;
    fireEvent.change(rows, { target: { value: '5' } });
    fireEvent.keyDown(rows, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith({ rows: 5, cols: 3 });
  });

  it('clamps out-of-range values', () => {
    const onSubmit = vi.fn();
    render(<TableDialog onSubmit={onSubmit} onCancel={() => {}} />);
    const rows = screen.getByLabelText('Rows') as HTMLInputElement;
    fireEvent.change(rows, { target: { value: '99' } });
    fireEvent.click(screen.getByText('Insert'));
    expect(onSubmit).toHaveBeenCalledWith({ rows: 20, cols: 3 });
  });

  it('cancels on Escape', () => {
    const onCancel = vi.fn();
    render(<TableDialog onSubmit={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByLabelText('Rows'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
