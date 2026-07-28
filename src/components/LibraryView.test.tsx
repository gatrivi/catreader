import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibraryView } from './LibraryView';
import React from 'react';
import '@testing-library/jest-dom';

vi.mock('../services/authService', () => ({
  authService: {
    getPFP: () => null,
    onAuthChange: () => () => {},
  },
}));

import { toSparseSlots } from '../utils/shelves';

const books = [
  { id: 'a.pdf', title: 'Alpha Book', author: 'Author A', filename: 'a.pdf', type: 'pdf' },
  { id: 'b.pdf', title: 'Beta Book', author: 'Author B', filename: 'b.pdf', type: 'pdf' },
];

const shelves = [
  { id: 'shelf-0', title: 'Church', bookIds: toSparseSlots(['a.pdf', 'b.pdf']) },
];

const baseProps = {
  library: books,
  covers: {},
  isLoading: false,
  onOpenBook: vi.fn(),
  onEditBook: vi.fn(),
  onGoogleDrive: vi.fn(),
  onFileUpload: vi.fn(),
  isSimplified: true,
  wallpaper: 'dim',
  customWallpaper: null,
  onToggleSimplified: vi.fn(),
  onSetWallpaper: vi.fn(),
  onSetCustomWallpaper: vi.fn(),
  shelves,
  onUpdateShelfTitle: vi.fn(),
  onMoveBook: vi.fn(),
  onReorderBook: vi.fn(),
};

describe('LibraryView', () => {
  it('renders books on shelf', () => {
    render(<LibraryView {...baseProps} />);
    expect(screen.getByText('Alpha Book')).toBeInTheDocument();
    expect(screen.getByText('Beta Book')).toBeInTheDocument();
  });

  it('opens book on cover click', () => {
    const onOpenBook = vi.fn();
    render(<LibraryView {...baseProps} onOpenBook={onOpenBook} />);
    fireEvent.click(screen.getAllByTitle('Abrir libro')[0]);
    expect(onOpenBook).toHaveBeenCalledWith(books[0]);
  });

  it('toggles saints trail mode', () => {
    render(<LibraryView {...baseProps} />);
    fireEvent.click(screen.getByLabelText('Settings'));
    fireEvent.click(screen.getByText('Sendero de Santos'));
    expect(screen.getByText('Sendero de los Santos')).toBeInTheDocument();
  });
});
