import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PageInput } from './PageInput';
import '@testing-library/jest-dom';

describe('PageInput', () => {
  it('shows current page / total', () => {
    render(<PageInput pageNumber={12} numPages={100} onGoToPage={() => {}} />);
    expect(screen.getByText('12 / 100')).toBeInTheDocument();
  });

  it('goes to typed page on Enter', () => {
    const onGoToPage = vi.fn();
    render(<PageInput pageNumber={1} numPages={50} onGoToPage={onGoToPage} />);
    fireEvent.click(screen.getByText('1 / 50'));
    const input = screen.getByLabelText('Go to page');
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onGoToPage).toHaveBeenCalledWith(20);
  });

  it('ignores out-of-range page', () => {
    const onGoToPage = vi.fn();
    render(<PageInput pageNumber={1} numPages={50} onGoToPage={onGoToPage} />);
    fireEvent.click(screen.getByText('1 / 50'));
    const input = screen.getByLabelText('Go to page');
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onGoToPage).not.toHaveBeenCalled();
  });
});
