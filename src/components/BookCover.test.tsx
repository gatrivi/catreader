import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BookCover } from './BookCover';
import React from 'react';
import '@testing-library/jest-dom';

describe('BookCover', () => {
  const mockBook = {
    id: '1',
    title: 'Test Book',
    author: 'Test Author',
    filename: 'test.pdf',
    type: 'pdf'
  };

  it('renders book title and author when no cover is provided', () => {
    render(<BookCover book={mockBook} onClick={() => {}} onEdit={() => {}} />);
    
    expect(screen.getByText('Test Book')).toBeInTheDocument();
    expect(screen.getByText('Test Author')).toBeInTheDocument();
  });

  it('renders cover image when provided', () => {
    render(<BookCover book={mockBook} cover="test-cover.jpg" onClick={() => {}} onEdit={() => {}} />);
    
    const img = screen.getByAltText('Test Book');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'test-cover.jpg');
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<BookCover book={mockBook} onClick={handleClick} onEdit={() => {}} />);
    
    fireEvent.click(screen.getByTitle('Abrir libro'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('still calls onClick when file type is unsupported', () => {
    const handleClick = vi.fn();
    const unsupportedBook = { ...mockBook, type: 'docx' };
    render(<BookCover book={unsupportedBook} onClick={handleClick} onEdit={() => {}} />);

    fireEvent.click(screen.getByTitle('Abrir libro'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
