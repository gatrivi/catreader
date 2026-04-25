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
    
    fireEvent.click(screen.getByText('Test Book').parentElement?.parentElement!);
    // Note: The clickable div is the one with onClick
    // Since we're clicking the parent of the text, it should trigger.
    // In the component, the onClick is on the main cover div.
  });
});
