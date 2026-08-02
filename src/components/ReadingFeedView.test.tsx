import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingFeedView } from './ReadingFeedView';
import { loadFragmentReports } from '../utils/fragmentReports';

const library = [{
  id: 'book-1',
  filename: 'book.pdf',
  title: 'Libro de prueba',
  author: 'Autor',
  type: 'pdf',
}];

describe('ReadingFeedView', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{
          id: 'feed-1',
          bookId: 'book-1',
          filename: 'book.pdf',
          type: 'pdf',
          title: 'Libro de prueba',
          author: 'Autor',
          text: 'Un fragmento de prueba.',
          locator: { kind: 'pdf', page: 12 },
        }],
      }),
    }));
  });

  it('saves a reproducible report from a feed card', async () => {
    render(
      <ReadingFeedView
        library={library}
        onOpenItem={vi.fn()}
        onWarmBook={vi.fn()}
        onBack={vi.fn()}
        appVersion="v2.10.15"
      />
    );

    await waitFor(() => expect(screen.getByText('Reportar fragmento')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Reportar fragmento'));
    fireEvent.click(screen.getByLabelText('No coincide con el destino'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar reporte' }));

    expect(loadFragmentReports()).toHaveLength(1);
    expect(loadFragmentReports()[0]).toMatchObject({
      reason: 'destination',
      appVersion: 'v2.10.15',
      locator: { kind: 'pdf', page: 12 },
    });
  });
});
