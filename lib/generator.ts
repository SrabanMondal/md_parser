import {
    CourseJSON,
    Section,
    ContentBlock,
    LexicalRoot,
    LexicalNode,
    LexicalParagraph,
    LexicalText,
    LexicalHeading,
    LexicalImage,
    LexicalEquation,
    LexicalColumnContainer,
    LexicalColumn,
    LexicalColumns,
    LexicalList,
    LexicalListItem,
    LexicalTable,
    LexicalTableRow,
    LexicalTableCell,
    LexicalLatex,
    LexicalFitg,
    LexicalLineBreak,
} from '../types/schema';

/**
 * MarkdownGenerator — converts CourseJSON → Markdown
 *
 * This generator is designed to produce Markdown that is **exactly parseable**
 * by MarkdownParser (lib/parser.ts), achieving lossless bidirectional sync.
 *
 * Parser.ts is the source of truth. Every syntax emitted here must match
 * what the parser expects to consume.
 */
export class MarkdownGenerator {
    private json: CourseJSON;

    constructor(json: CourseJSON) {
        this.json = json;
    }

    public generate(): string {
        return this.json.sections
            .map(section => this.generateSection(section))
            .join('\n\n');
    }

    // ═══════════════════════════════════════════════════════════
    //  SECTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Parser expects:
     *   ### Section Title
     *   {"id":"section-uuid"}
     *
     * The metadata must be plain JSON (NOT wrapped in {{ }}).
     * Parser checks: nextLine.startsWith('{') && nextLine.includes('"id"')
     * Then does JSON.parse(nextLine).
     */
    private generateSection(section: Section): string {
        const title = this.extractTitleText(section.title.root);
        const metadata = JSON.stringify({ id: section.id });
        const blocks = section.content
            .map(block => this.generateBlock(block))
            .filter(b => b.trim() !== '')
            .join('\n\n');
        return `### ${title}\n${metadata}\n\n${blocks}`;
    }

    private extractTitleText(root: LexicalRoot): string {
        if (!root.children || root.children.length === 0) return '';
        const heading = root.children[0] as LexicalHeading;
        if (!heading.children) return '';
        return heading.children.map(c => this.generateInlineNode(c)).join('');
    }

    // ═══════════════════════════════════════════════════════════
    //  BLOCK DISPATCH
    // ═══════════════════════════════════════════════════════════

    /**
     * Parser expects:
     *   #### Block Title
     *   {"type":"blockType","id":"block-uuid"}
     *
     * The metadata line is JSON.parse'd and Object.assign'd to the block.
     * We emit only {type, id} since all other properties are reconstructed
     * from the content-level parsing.
     */
    private generateBlock(block: ContentBlock): string {
        switch (block.type) {
            case 'lexicalRichTextBlock':
                return this.generateRichTextBlock(block);
            case 'mcqBlock':
                // MAMCQ blocks have type='mcqBlock' + isMAMCQ=true in JSON,
                // but need type='mamcqBlock' in metadata for parser routing.
                if ((block as any).isMAMCQ) {
                    return this.generateMAMCQBlock(block);
                }
                return this.generateMCQBlock(block);
            case 'mamcqBlock':
                return this.generateMAMCQBlock(block);
            case 'slideShowBlock':
                return this.generateSlideShowBlock(block);
            case 'dragDropBlock':
                return this.generateDragDropBlock(block);
            case 'fillInBlankBlock':
                return this.generateFIBBlock(block);
            default:
                return this.generateGenericBlock(block);
        }
    }

    /**
     * Emit #### Title\n{metadata} header for any block.
     * overrideType allows MAMCQ to emit 'mamcqBlock' instead of 'mcqBlock'.
     */
    private generateBlockHeader(block: ContentBlock, overrideType?: string): string {
        const title = block.title || 'Untitled Block';
        const meta: any = { type: overrideType || block.type, id: block.id };
        return `#### ${title}\n${JSON.stringify(meta)}`;
    }

    // ═══════════════════════════════════════════════════════════
    //  LEXICAL RICH TEXT BLOCK
    // ═══════════════════════════════════════════════════════════

    private generateRichTextBlock(block: ContentBlock): string {
        const header = this.generateBlockHeader(block);
        const content = this.generateContentFromRoot(block.content?.root);
        if (content.trim()) {
            return `${header}\n\n${content}`;
        }
        return header;
    }

    // ═══════════════════════════════════════════════════════════
    //  MCQ BLOCK
    // ═══════════════════════════════════════════════════════════

    /**
     * Parser expects:
     *   ::: mcq-question
     *   <rich content>
     *   :::
     *
     *   ::: mcq-options horizontal|vertical
     *   ::: mcq-option [correct]
     *   <rich content>
     *   :::
     *   ::: mcq-feedback
     *   <rich content>
     *   :::
     *   :::
     *
     *   ::: mcq-feedback-general
     *   <rich content>
     *   :::
     */
    private generateMCQBlock(block: ContentBlock): string {
        const header = this.generateBlockHeader(block);
        const parts: string[] = [header, ''];

        // Question stem
        if (block.questionStem?.root?.children?.length > 0) {
            parts.push('::: mcq-question');
            parts.push(this.generateContentFromRoot(block.questionStem.root));
            parts.push(':::');
            parts.push('');
        }

        // Options
        const alignment = block.alignment || 'horizontal';
        parts.push(`::: mcq-options ${alignment}`);

        for (const option of (block.options || [])) {
            const correctMarker = option.isCorrect ? ' correct' : '';
            parts.push(`::: mcq-option${correctMarker}`);
            parts.push(this.generateContentFromRoot(option.text.root));
            parts.push(':::');

            // Per-option specific feedback
            if (block.feedback?.specific?.[option.id]) {
                const fb = block.feedback.specific[option.id];
                if (fb?.root?.children?.length > 0) {
                    parts.push('::: mcq-feedback');
                    parts.push(this.generateContentFromRoot(fb.root));
                    parts.push(':::');
                }
            }
            parts.push('');
        }

        parts.push(':::'); // Close options container

        // General feedback
        if (block.feedback?.general?.root?.children?.length > 0) {
            parts.push('');
            parts.push('::: mcq-feedback-general');
            parts.push(this.generateContentFromRoot(block.feedback.general.root));
            parts.push(':::');
        }

        return parts.join('\n');
    }

    // ═══════════════════════════════════════════════════════════
    //  MAMCQ BLOCK (Multiple-Answer MCQ)
    // ═══════════════════════════════════════════════════════════

    /**
     * Parser expects type='mamcqBlock' in metadata, then converts to
     * type='mcqBlock' + isMAMCQ=true internally.
     *
     * Sub-blocks use mamcq-* prefixes:
     *   ::: mamcq-question / :::
     *   ::: mamcq-options [alignment] / ::: mamcq-option [correct] / :::
     *   ::: mamcq-feedback-positive / :::
     *   ::: mamcq-feedback-negative / :::
     */
    private generateMAMCQBlock(block: ContentBlock): string {
        const header = this.generateBlockHeader(block, 'mamcqBlock');
        const parts: string[] = [header, ''];

        // Question stem
        if (block.questionStem?.root?.children?.length > 0) {
            parts.push('::: mamcq-question');
            parts.push(this.generateContentFromRoot(block.questionStem.root));
            parts.push(':::');
            parts.push('');
        }

        // Options
        const alignment = block.alignment || 'horizontal';
        parts.push(`::: mamcq-options ${alignment}`);

        for (const option of (block.options || [])) {
            const correctMarker = option.isCorrect ? ' correct' : '';
            parts.push(`::: mamcq-option${correctMarker}`);
            parts.push(this.generateContentFromRoot(option.text.root));
            parts.push(':::');
            parts.push('');
        }

        parts.push(':::'); // Close options container

        // Positive feedback
        if (block.feedback?.general_positive?.root?.children?.length > 0) {
            parts.push('');
            parts.push('::: mamcq-feedback-positive');
            parts.push(this.generateContentFromRoot(block.feedback.general_positive.root));
            parts.push(':::');
        }

        // Negative feedback
        if (block.feedback?.general_negative?.root?.children?.length > 0) {
            parts.push('');
            parts.push('::: mamcq-feedback-negative');
            parts.push(this.generateContentFromRoot(block.feedback.general_negative.root));
            parts.push(':::');
        }

        return parts.join('\n');
    }

    // ═══════════════════════════════════════════════════════════
    //  SLIDESHOW BLOCK
    // ═══════════════════════════════════════════════════════════

    /**
     * Parser expects:
     *   ::: description
     *   <inline text — collapsed to single paragraph>
     *   :::
     *
     *   ::: slide
     *   <rich content via parseSlideContent>
     *   :::
     */
    private generateSlideShowBlock(block: ContentBlock): string {
        const header = this.generateBlockHeader(block);
        const parts: string[] = [header, ''];

        // Description
        if (block.description?.root?.children?.length > 0) {
            parts.push('::: description');
            parts.push(this.generateContentFromRoot(block.description.root));
            parts.push(':::');
            parts.push('');
        }

        // Slides
        for (const slide of (block.slides || [])) {
            parts.push('::: slide');
            if (slide.content?.root?.children?.length > 0) {
                parts.push(this.generateContentFromRoot(slide.content.root));
            }
            parts.push(':::');
            parts.push('');
        }

        return parts.join('\n');
    }

    // ═══════════════════════════════════════════════════════════
    //  DRAG-DROP BLOCK
    // ═══════════════════════════════════════════════════════════

    /**
     * Parser expects:
     *   ::: drag-drop-description / :::
     *   ::: drag-items
     *     ::: drag-item / :::   (each item)
     *   :::
     *   ::: drop-zones
     *     ::: drop-zone
     *       <zone text>
     *       ::: correct-items
     *       drag-item-index (canonical)
     *       :::
     *       (no extra ::: for drop-zone after correct-items)
     *     ::: drop-zone / :::    (only if zone has no correct-items)
     *   :::
     *   ::: drag-drop-feedback-correct / :::
     *   ::: drag-drop-feedback-incorrect / :::
     */
    private generateDragDropBlock(block: ContentBlock): string {
        const header = this.generateBlockHeader(block);
        const parts: string[] = [header, ''];
        const dragItems = Array.isArray(block.dragItems) ? block.dragItems : [];
        const dragItemIndexById = new Map<string, number>();

        dragItems.forEach((item: any, index: number) => {
            if (typeof item?.id === 'string' && item.id.trim() !== '') {
                dragItemIndexById.set(item.id, index);
            }
        });

        // Description
        if (block.description?.root?.children?.length > 0) {
            parts.push('::: drag-drop-description');
            parts.push(this.generateContentFromRoot(block.description.root));
            parts.push(':::');
            parts.push('');
        }

        // Drag items
        if (dragItems.length > 0) {
            parts.push('::: drag-items');
            for (const item of dragItems) {
                parts.push('::: drag-item');
                if (item.text?.root?.children?.length > 0) {
                    parts.push(this.generateContentFromRoot(item.text.root));
                }
                parts.push(':::');
            }
            parts.push(':::');
            parts.push('');
        }

        // Drop zones
        if (block.dropAreas?.length > 0) {
            parts.push('::: drop-zones');
            for (const zone of block.dropAreas) {
                parts.push('::: drop-zone');
                if (zone.text?.root?.children?.length > 0) {
                    parts.push(this.generateContentFromRoot(zone.text.root));
                }

                const rawCorrectItems = Array.isArray(zone.correctItemId)
                    ? zone.correctItemId
                    : (zone.correctItemId !== undefined && zone.correctItemId !== null && zone.correctItemId !== '')
                        ? [zone.correctItemId]
                        : [];

                const emittedCorrectItems: string[] = [];

                for (const rawItem of rawCorrectItems) {
                    let index: number | null = null;

                    if (typeof rawItem === 'number' && Number.isInteger(rawItem)) {
                        index = rawItem;
                    } else if (typeof rawItem === 'string') {
                        const trimmed = rawItem.trim();

                        if (/^\d+$/.test(trimmed)) {
                            index = Number.parseInt(trimmed, 10);
                        } else if (dragItemIndexById.has(trimmed)) {
                            index = dragItemIndexById.get(trimmed)!;
                        } else if (trimmed !== '') {
                            // Preserve unknown IDs verbatim as a best-effort fallback.
                            emittedCorrectItems.push(trimmed);
                        }
                    }

                    if (index !== null && index >= 0 && index < dragItems.length) {
                        emittedCorrectItems.push(String(index));
                    }
                }

                // Correct items
                if (emittedCorrectItems.length > 0) {
                    parts.push('::: correct-items');
                    for (const itemRef of emittedCorrectItems) {
                        parts.push(itemRef);
                    }
                    // Parser treats this close marker as end of both correct-items and drop-zone.
                    parts.push(':::');
                } else {
                    // If no correct-items block exists, drop-zone needs an explicit close.
                    parts.push(':::');
                }
            }
            parts.push(':::');
            parts.push('');
        }

        // Feedback correct
        if (block.feedback?.correct?.root?.children?.length > 0) {
            parts.push('::: drag-drop-feedback-correct');
            parts.push(this.generateContentFromRoot(block.feedback.correct.root));
            parts.push(':::');
            parts.push('');
        }

        // Feedback incorrect
        if (block.feedback?.incorrect?.root?.children?.length > 0) {
            parts.push('::: drag-drop-feedback-incorrect');
            parts.push(this.generateContentFromRoot(block.feedback.incorrect.root));
            parts.push(':::');
        }

        return parts.join('\n');
    }

    // ═══════════════════════════════════════════════════════════
    //  FILL-IN-BLANK BLOCK
    // ═══════════════════════════════════════════════════════════

    /**
     * Parser expects:
     *   ::: fib-question
     *   <text with {{answer}} patterns for fitg nodes>
     *   :::
     *
     *   ::: fib-feedback-correct
     *   <rich content>
     *   :::
     *
     *   ::: fib-feedback-incorrect
     *   <rich content>
     *   :::
     *
     * FIB question content goes to block.content.root (not block.questionStem).
     * Images in FIB use parseInlineText with isMCQBlock=true → imageUrl format.
     */
    private generateFIBBlock(block: ContentBlock): string {
        const header = this.generateBlockHeader(block);
        const parts: string[] = [header, ''];

        // Question content (includes {{answer}} for fitg nodes)
        if (block.content?.root?.children?.length > 0) {
            parts.push('::: fib-question');
            parts.push(this.generateContentFromRoot(block.content.root));
            parts.push(':::');
            parts.push('');
        }

        // Correct feedback
        if (block.feedback?.correct?.root?.children?.length > 0) {
            parts.push('::: fib-feedback-correct');
            parts.push(this.generateContentFromRoot(block.feedback.correct.root));
            parts.push(':::');
            parts.push('');
        }

        // Incorrect feedback
        if (block.feedback?.incorrect?.root?.children?.length > 0) {
            parts.push('::: fib-feedback-incorrect');
            parts.push(this.generateContentFromRoot(block.feedback.incorrect.root));
            parts.push(':::');
        }

        return parts.join('\n');
    }

    // ═══════════════════════════════════════════════════════════
    //  GENERIC / UNKNOWN BLOCK
    // ═══════════════════════════════════════════════════════════

    private generateGenericBlock(block: ContentBlock): string {
        const header = this.generateBlockHeader(block);
        if (block.content?.root?.children?.length > 0) {
            const content = this.generateContentFromRoot(block.content.root);
            return `${header}\n\n${content}`;
        }
        return header;
    }

    // ═══════════════════════════════════════════════════════════
    //  RICH TEXT CONTENT GENERATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Generate markdown from a LexicalRoot. Returns block-level markdown
     * with paragraphs separated by blank lines.
     */
    private generateContentFromRoot(root: LexicalRoot): string {
        if (!root || !root.children || root.children.length === 0) return '';
        return this.generateBlockNodes(root.children);
    }

    /**
     * Generate block-level markdown from an array of LexicalNodes.
     * Each block node is separated by a blank line.
     */
    private generateBlockNodes(nodes: LexicalNode[]): string {
        const blocks: string[] = [];
        for (const node of nodes) {
            const block = this.generateBlockNode(node);
            if (block !== '') {
                blocks.push(block);
            }
        }
        return blocks.join('\n\n');
    }

    /**
     * Generate markdown for a single block-level node.
     */
    private generateBlockNode(node: LexicalNode): string {
        switch (node.type) {
            case 'paragraph':
                return this.generateParagraph(node as LexicalParagraph);
            case 'heading':
                return this.generateHeading(node as LexicalHeading);
            case 'list':
                return this.generateList(node as LexicalList);
            case 'table':
                return this.generateTable(node as LexicalTable);
            case 'columns':
                return this.generateColumns(node as LexicalColumns);
            case 'column-container':
                return this.generateColumnContainer(node as LexicalColumnContainer);
            case 'latex':
                return this.generateLatexBlock(node as LexicalLatex);
            default:
                // Some inline nodes may appear at block level
                const inline = this.generateInlineNode(node);
                return inline || '';
        }
    }

    // ─── Inline nodes ──────────────────────────────────────────

    /**
     * Paragraph: concatenate all children as inline content.
     */
    private generateParagraph(node: LexicalParagraph): string {
        if (!node.children || node.children.length === 0) return '';
        return node.children.map(c => this.generateInlineNode(c)).join('');
    }

    /**
     * Dispatch an inline node to the appropriate generator.
     */
    private generateInlineNode(node: LexicalNode): string {
        switch (node.type) {
            case 'text':
                return this.generateText(node as LexicalText);
            case 'image':
                return this.generateImage(node as any);
            case 'equation':
                return this.generateEquation(node as LexicalEquation);
            case 'fitg':
                return this.generateFitg(node as LexicalFitg);
            case 'linebreak':
                return '\n';
            case 'latex':
                return this.generateLatexBlock(node as LexicalLatex);
            default:
                return '';
        }
    }

    /**
     * Text node: apply bold/italic formatting.
     * Parser: format=1 → **bold**, format=2 → *italic*
     */
    private generateText(node: LexicalText): string {
        let text = node.text;
        if (node.format === 1) text = `**${text}**`;
        else if (node.format === 2) text = `*${text}*`;
        return text;
    }

    /**
     * Image node: handle both standard (src) and MCQ/FIB (imageUrl) formats.
     * Parser creates {src} for standard context, {imageUrl} for MCQ/FIB context.
     * Both produce the same markdown: ![altText](url)
     */
    private generateImage(node: any): string {
        const alt = node.altText || '';
        const src = node.imageUrl || node.src || '';
        return `![${alt}](${src})`;
    }

    /**
     * Equation: $equation$
     * Parser: $eq$ → {type:'equation', equation:'eq', inline:true}
     */
    private generateEquation(node: LexicalEquation): string {
        return `$${node.equation}$`;
    }

    /**
     * FITG node: {{answer}}
     * Parser (parseFIBContent): {{answer}} → {type:'fitg', answer, width}
     */
    private generateFitg(node: LexicalFitg): string {
        return `{{${node.answer}}}`;
    }

    /**
     * Latex block:
     *   ```latex
     *   code
     *   ```
     */
    private generateLatexBlock(node: LexicalLatex): string {
        return '```latex\n' + node.code + '\n```';
    }

    // ─── Heading ───────────────────────────────────────────────

    /**
     * Heading: # text, ## text, ### text, etc.
     * Parser: #{n} text → {type:'heading', tag:'h{n}'}
     */
    private generateHeading(node: LexicalHeading): string {
        const level = parseInt(node.tag.replace('h', ''));
        const text = node.children.map(c => this.generateInlineNode(c)).join('');
        return `${'#'.repeat(level)} ${text}`;
    }

    // ─── List ──────────────────────────────────────────────────

    /**
     * List: bullet (* item) or numbered (N. item)
     * Parser accepts *, -, or N. prefixes.
     * Generator uses * for bullets (matching test.md convention).
     */
    private generateList(node: LexicalList): string {
        return node.children.map((item, index) => {
            const content = item.children
                .map(c => this.generateInlineNode(c))
                .join('');
            if (node.listType === 'number') {
                return `${item.value || index + 1}. ${content}`;
            }
            return `* ${content}`;
        }).join('\n');
    }

    // ─── Table ─────────────────────────────────────────────────

    /**
     * Table:
     *   | header1 | header2 |
     *   | --- | --- |
     *   | cell1 | cell2 |
     *
     * Parser: first row = headers (headerState 1 or "header"),
     *         separator row = skipped,
     *         remaining rows = body (headerState 0 or "normal")
     */
    private generateTable(node: LexicalTable): string {
        if (!node.children || node.children.length === 0) return '';

        const rows = node.children.map(row => {
            const cells = row.children.map(cell => this.generateCellContent(cell));
            return `| ${cells.join(' | ')} |`;
        });

        if (rows.length >= 1) {
            const colCount = node.children[0].children.length;
            const separator = `| ${Array(colCount).fill('---').join(' | ')} |`;
            return [rows[0], separator, ...rows.slice(1)].join('\n');
        }

        return rows.join('\n');
    }

    /**
     * Table cell content: cells contain paragraph children.
     * Extract inline content from paragraph(s).
     */
    private generateCellContent(cell: LexicalTableCell): string {
        if (!cell.children || cell.children.length === 0) return '';
        return cell.children.map(child => {
            if (child.type === 'paragraph') {
                return (child as LexicalParagraph).children
                    .map(c => this.generateInlineNode(c))
                    .join('');
            }
            return this.generateBlockNode(child);
        }).join('');
    }

    // ─── Columns ───────────────────────────────────────────────

    /**
     * Columns (new schema):
     *   ::: columns [width1, width2]
     *   col1 content
     *   === COL
     *   col2 content
     *   :::
     *
     * Parser: widths → append '%' if not 'fr', keep 'fr' as-is.
     * Generator: strip '%' from percentage widths, keep 'fr' as-is.
     */
    private generateColumns(node: LexicalColumns): string {
        const widths = node.columnWidths.map(w => {
            if (w.endsWith('fr')) return w;
            if (w.endsWith('%')) return w.slice(0, -1);
            return w;
        });
        const template = widths.join(', ');

        const columnContents = node.children.map(col =>
            this.generateBlockNodes(col.children).trim()
        );

        return `::: columns [${template}]\n${columnContents.join('\n=== COL\n')}\n:::`;
    }

    /**
     * Column container (legacy schema):
     *   ::: columns [template]
     *   col1 content
     *   === COL
     *   col2 content
     *   :::
     */
    private generateColumnContainer(node: LexicalColumnContainer): string {
        const columnContents = node.columns.map(col =>
            this.generateBlockNodes(col.children).trim()
        );
        return `::: columns [${node.template}]\n${columnContents.join('\n=== COL\n')}\n:::`;
    }
}
