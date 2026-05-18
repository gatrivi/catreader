/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface TextItem {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: number[]; // [scaleX, skewY, skewX, scaleY, x, y]
  fontName: string;
}

/**
 * Parses a single PDF page's text content semantically into premium, responsive HTML.
 * Addresses spaghetti layout ordering (columns), performance, and visual loss.
 */
export async function parsePdfPageSemantically(page: any, tc: any): Promise<string> {
  const viewport = page.getViewport({ scale: 1 });
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;

  const items: TextItem[] = tc.items.map((item: any) => ({
    str: item.str,
    dir: item.dir,
    width: item.width,
    height: item.height,
    transform: item.transform,
    fontName: item.fontName
  }));

  if (items.length === 0) return '';

  // 1. Filter out headers and footers (top 8% and bottom 8% of page height)
  // Note: Y = 0 is at the bottom, Y = pageHeight is at the top in PDF coordinate space
  const footerThreshold = viewportHeight * 0.08;
  const headerThreshold = viewportHeight * 0.92;

  const filteredItems = items.filter(item => {
    const y = item.transform[5];
    const str = item.str.trim();
    if (!str) return false;

    // Check if in header/footer zone
    if (y < footerThreshold || y > headerThreshold) {
      // Exclude simple page numbers, short repetitive strings, or brief metadata headers
      const isNumeric = /^\d+$/.test(str) || /^[ivxldcm]+$/i.test(str);
      const isShort = str.length < 6 && /\d/.test(str);
      const isCommonBookHeader = str.length < 50 && (
        str.toLowerCase() === str || 
        str.toUpperCase() === str || 
        str.includes('Page') || 
        str.includes('Pág')
      );
      
      if (isNumeric || isShort || isCommonBookHeader) {
        return false; // Skip headers/footers
      }
    }
    return true;
  });

  if (filteredItems.length === 0) return '';

  // Calculate page median font size for relative heading detection
  // Font height is scaleY (item.transform[3])
  const fontSizes = filteredItems.map(item => Math.abs(item.transform[3]));
  fontSizes.sort((a, b) => a - b);
  const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 10;

  // 2. Multi-column Layout Detection
  // Check if text is distributed in columns.
  // We divide the width into three zones: Left Column, Center Zone (gutter), and Right Column.
  const midX = viewportWidth / 2;
  const centerZoneStart = viewportWidth * 0.44;
  const centerZoneEnd = viewportWidth * 0.56;

  let leftColCount = 0;
  let rightColCount = 0;
  let centerCrossCount = 0;

  filteredItems.forEach(item => {
    const x = item.transform[4];
    const itemWidth = item.width;
    const itemEnd = x + itemWidth;

    if (itemEnd < centerZoneStart) {
      leftColCount++;
    } else if (x > centerZoneEnd) {
      rightColCount++;
    } else {
      centerCrossCount++;
    }
  });

  const totalFiltered = filteredItems.length;
  // If left/right columns have substantial text, and very few items span the gutter, it's a 2-column layout.
  const isTwoColumn = leftColCount > totalFiltered * 0.25 && 
                      rightColCount > totalFiltered * 0.25 && 
                      centerCrossCount < totalFiltered * 0.12;

  // Sort and process helper
  const processSectionItems = (sectionItems: TextItem[]): string => {
    if (sectionItems.length === 0) return '';

    // Group items into rows by grouping Y coordinates within a small tolerance (4px)
    const rows: { y: number; items: TextItem[] }[] = [];
    sectionItems.forEach(item => {
      const y = item.transform[5];
      let row = rows.find(r => Math.abs(r.y - y) < 4);
      if (row) {
        row.items.push(item);
      } else {
        rows.push({ y, items: [item] });
      }
    });

    // Sort rows top-to-bottom (Y descending)
    rows.sort((a, b) => b.y - a.y);

    // Sort items within rows left-to-right (X ascending)
    rows.forEach(row => {
      row.items.sort((a, b) => a.transform[4] - b.transform[4]);
    });

    // Semantic Blocks Assembly
    interface ExtractedBlock {
      type: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'blockquote' | 'pre';
      lines: string[];
      isMonospace: boolean;
    }

    const blocks: ExtractedBlock[] = [];
    let currentBlock: ExtractedBlock | null = null;
    let lastRowY: number | null = null;

    rows.forEach((row) => {
      // 1. Reconstruct styling & spaces inside this row
      let lineText = '';
      let lastX = -1;
      let lineFontSize = 0;
      let lineIsMonospace = false;

      row.items.forEach(item => {
        const x = item.transform[4];
        const fontHeight = Math.abs(item.transform[3]);
        if (fontHeight > lineFontSize) lineFontSize = fontHeight;

        // Space detection between items
        if (lastX !== -1 && (x - lastX) > (item.height * 0.25)) {
          lineText += ' ';
        }

        const font = item.fontName.toLowerCase();
        const style = tc.styles[item.fontName];
        const fontFamily = style?.fontFamily?.toLowerCase() || '';

        const isBold = font.includes('bold') || font.includes('heavy') || font.includes('black') || fontFamily.includes('bold');
        const isItalic = font.includes('italic') || font.includes('oblique') || fontFamily.includes('italic') || fontFamily.includes('oblique');
        const isMono = font.includes('mono') || font.includes('courier') || font.includes('consolas') || fontFamily.includes('mono') || fontFamily.includes('courier');

        if (isMono) lineIsMonospace = true;

        let str = item.str;
        // Escape HTML tags to prevent broken nodes
        str = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (isBold) str = `<strong>${str}</strong>`;
        if (isItalic) str = `<em>${str}</em>`;
        if (isMono) str = `<code class="font-mono bg-stone-100/50 dark:bg-stone-800/40 px-1 py-0.2 rounded text-[0.9em]">${str}</code>`;

        lineText += str;
        lastX = x + item.width;
      });

      lineText = lineText.trim();
      if (!lineText) return;

      // Clean multiple spaces
      lineText = lineText.replace(/\s+/g, ' ');

      // 2. Identify Block Type
      let blockType: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'blockquote' | 'pre' = 'p';

      // Heading detection
      if (lineFontSize > medianFontSize * 1.45) {
        blockType = 'h1';
      } else if (lineFontSize > medianFontSize * 1.25) {
        blockType = 'h2';
      } else if (lineFontSize > medianFontSize * 1.15) {
        blockType = 'h3';
      }
      // List items detection
      else if (/^(?:[•\-*]|\d+\.)\s+/.test(lineText.replace(/<[^>]*>/g, ''))) {
        blockType = 'li';
      }
      // Preformatted Code
      else if (lineIsMonospace) {
        blockType = 'pre';
      }

      // 3. Spacing analysis for Paragraph Break
      const lineSpacing = lastRowY !== null ? Math.abs(lastRowY - row.y) : 0;
      const isNewParagraph = 
        lastRowY === null || 
        lineSpacing > (lineFontSize * 2.2) || // Double spacing threshold
        blockType !== 'p' || 
        (currentBlock && currentBlock.type !== 'p');

      lastRowY = row.y;

      if (isNewParagraph || !currentBlock) {
        currentBlock = {
          type: blockType,
          lines: [lineText],
          isMonospace: lineIsMonospace
        };
        blocks.push(currentBlock);
      } else {
        // Hyphenation cleanup between wrapped lines
        const lastLineIndex = currentBlock.lines.length - 1;
        let lastLine = currentBlock.lines[lastLineIndex];
        
        if (lastLine.endsWith('-') || lastLine.endsWith('–') || lastLine.endsWith('—')) {
          // Remove trailing hyphen and join seamlessly
          currentBlock.lines[lastLineIndex] = lastLine.slice(0, -1);
          currentBlock.lines.push(lineText);
        } else {
          currentBlock.lines.push(lineText);
        }
      }
    });

    // 4. Render semantic blocks as clean HTML
    return blocks.map(block => {
      const content = block.lines.join(block.type === 'pre' ? '\n' : ' ');
      
      switch (block.type) {
        case 'h1':
          return `<h1 class="text-2xl sm:text-3xl font-bold font-serif text-stone-900 dark:text-stone-100 mt-6 mb-4 tracking-tight border-b border-stone-200/30 dark:border-stone-800/30 pb-2">${content}</h1>`;
        case 'h2':
          return `<h2 class="text-xl sm:text-2xl font-bold font-serif text-stone-800 dark:text-stone-200 mt-5 mb-3 tracking-tight">${content}</h2>`;
        case 'h3':
          return `<h3 class="text-lg sm:text-xl font-semibold font-serif text-stone-850 dark:text-stone-250 mt-4 mb-2">${content}</h3>`;
        case 'li':
          const cleanLi = content.replace(/^(?:[•\-*]|\d+\.)\s+/, '');
          const isDecimal = /^\d+\.\s+/.test(content.replace(/<[^>]*>/g, ''));
          const listClass = isDecimal ? 'list-decimal' : 'list-disc';
          return `<li class="ml-6 py-1 pl-1 text-stone-700 dark:text-stone-300 leading-relaxed ${listClass}">${cleanLi}</li>`;
        case 'pre':
          return `<pre class="bg-stone-100/60 dark:bg-stone-900/60 p-4 rounded-xl font-mono text-[0.88em] leading-normal border border-stone-200/50 dark:border-stone-800/50 overflow-x-auto my-4 max-w-full text-stone-850 dark:text-stone-200 shadow-inner">${content}</pre>`;
        default:
          // Check if it looks like a blockquote (starts and ends with quotation marks or italicized)
          const textOnly = content.replace(/<[^>]*>/g, '').trim();
          if ((textOnly.startsWith('“') && textOnly.endsWith('”')) || (textOnly.startsWith('"') && textOnly.endsWith('"'))) {
            return `<blockquote class="border-l-4 border-amber-500/50 pl-4 py-1 my-4 italic text-stone-600 dark:text-stone-400 bg-stone-50/50 dark:bg-stone-900/30 rounded-r">${content}</blockquote>`;
          }
          return `<p class="mb-4 text-stone-700 dark:text-stone-300 leading-relaxed font-serif text-justify break-words">${content}</p>`;
      }
    }).join('\n');
  };

  if (isTwoColumn) {
    // 3. Handle Two-Column Layout Sorter
    // Group items based on X midpoint
    const leftItems = filteredItems.filter(item => {
      const x = item.transform[4];
      const width = item.width;
      // If a heading or wide element spans across the middle, process it in the left column first to maintain ordering
      return (x + width / 2) < midX;
    });

    const rightItems = filteredItems.filter(item => {
      const x = item.transform[4];
      return (x + Math.min(10, item.width) / 2) >= midX;
    });

    const leftHTML = processSectionItems(leftItems);
    const rightHTML = processSectionItems(rightItems);

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
        <div class="space-y-4">${leftHTML}</div>
        <div class="space-y-4">${rightHTML}</div>
      </div>
    `;
  } else {
    // Single Column Layout Sorter
    return processSectionItems(filteredItems);
  }
}
