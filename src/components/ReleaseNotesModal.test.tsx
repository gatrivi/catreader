import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReleaseNotesModal } from './ReleaseNotesModal';

describe('ReleaseNotesModal', () => {
  it('closes when clicking outside the dialog', () => {
    const onClose = vi.fn();
    render(<ReleaseNotesModal isOpen onClose={onClose} />);

    fireEvent.mouseDown(screen.getByTestId('release-notes-backdrop'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the dialog open when clicking its content', () => {
    const onClose = vi.fn();
    render(<ReleaseNotesModal isOpen onClose={onClose} />);

    fireEvent.mouseDown(screen.getByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
