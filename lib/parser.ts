import { v4 as uuidv4 } from 'uuid';
import {
    CourseJSON,
    Section,
    ContentBlock,
    BlockType,
    LexicalRoot,
    LexicalNode,
    LexicalParagraph,
    LexicalText,
    LexicalHeading,
    LexicalImage,
    LexicalEquation,
    LexicalColumnContainer,
    LexicalColumn,
    LexicalList,
    LexicalListItem,
    LexicalTable,
    LexicalTableRow,
    LexicalTableCell,
    LexicalLatex,
    LexicalFitg,
    LexicalLineBreak,
} from '../types/schema';

type ParserState = 'NORMAL' | 'IN_SECTION' | 'IN_BLOCK' | 'IN_SLIDESHOW' | 'IN_SLIDE' | 'IN_DESCRIPTION' | 'IN_MCQ' | 'IN_QUESTION' | 'IN_OPTIONS' | 'IN_OPTION' | 'IN_FEEDBACK' | 'IN_GENERAL_FEEDBACK' | 'IN_MAMCQ' | 'IN_MAMCQ_QUESTION' | 'IN_MAMCQ_OPTIONS' | 'IN_MAMCQ_OPTION' | 'IN_MAMCQ_FEEDBACK_POSITIVE' | 'IN_MAMCQ_FEEDBACK_NEGATIVE' | 'IN_DRAG_DROP' | 'IN_INSTRUCTIONS' | 'IN_ITEMS' | 'IN_ZONES' | 'IN_ZONE' | 'IN_DRAG_ITEM' | 'IN_DROP_ZONE' | 'IN_CORRECT_ITEMS' | 'IN_FEEDBACK_CORRECT' | 'IN_FEEDBACK_INCORRECT' | 'IN_FIB' | 'IN_FIB_QUESTION' | 'IN_FIB_FEEDBACK_CORRECT' | 'IN_FIB_FEEDBACK_INCORRECT' | 'ROOT' | 'IN_LATEX' | 'IN_COLUMN_CONTAINER';

export class MarkdownParser {
    private markdown: string;

    constructor(markdown: string) {
        this.markdown = markdown;
    }

    public parse(): CourseJSON {
        const lines = this.markdown.split('\n');
        const sections: Section[] = [];
        let currentSection: Section | null = null;
        let currentBlock: ContentBlock | null = null;
        let currentColumnContainer: LexicalColumnContainer | null = null;
        let currentColumnIndex = -1;
        let state: ParserState = 'ROOT';
        let multiLineContent: string[] = [];
        let currentSlideContent: string[] = [];
        let currentDescriptionContent: string[] = [];
        let slideIndex = 0;
        let currentQuestionContent: string[] = [];
        let currentOptionsContent: string[] = [];
        let currentOptionContent: string[] = [];
        let currentFeedbackContent: string[] = [];
        let currentGeneralFeedbackContent: string[] = [];
        let currentPositiveFeedbackContent: string[] = [];
        let currentNegativeFeedbackContent: string[] = [];
        let optionIndex = 0;
        let currentOptionId: string | null = null;
        let mcqAlignment: 'horizontal' | 'vertical' = 'horizontal';

        let currentMAMCQQuestionContent: string[] = [];
        let currentMAMCQOptionsContent: string[] = [];
        let currentMAMCQOptionContent: string[] = [];
        let currentMAMCQFeedbackPositiveContent: string[] = [];
        let currentMAMCQFeedbackNegativeContent: string[] = [];
        let currentMAMCQOptionId: string | null = null;
        let mamcqOptionIndex = 0;
        let mamcqAlignment: 'horizontal' | 'vertical' = 'horizontal';
    
    // Drag and Drop parsing state
    let currentDragDropDescriptionContent: string[] = [];
    let currentDragItemsContent: string[] = [];
    let currentDragItemContent: string[] = [];
    let currentDropZonesContent: string[] = [];
    let currentDropZoneContent: string[] = [];
    let currentCorrectItemsContent: string[] = [];
    let currentDragDropFeedbackCorrectContent: string[] = [];
    let currentDragDropFeedbackIncorrectContent: string[] = [];
    let dragItemIndex = 0;
    let dropZoneIndex = 0;
    let currentDragItemId: string | null = null;
    let currentDropZoneId: string | null = null;
    
    // FIB parsing state
    let currentFIBQuestionContent: string[] = [];
    let currentFIBFeedbackCorrectContent: string[] = [];
    let currentFIBFeedbackIncorrectContent: string[] = [];

        const closeBlock = () => {
            if (currentBlock && currentBlock.type === 'slideShowBlock') {
                // Finalize any remaining slide content
                if (currentSlideContent.length > 0 && (state === 'IN_SLIDESHOW' || state === 'IN_SLIDE')) {
                    const slideText = currentSlideContent.join('\n');
                    if (slideText.trim()) {
                        const slide = {
                            id: `slide-${Date.now()}-${slideIndex}`,
                            content: {
                                root: {
                                    type: 'root',
                                    version: 1,
                                    children: []
                                }
                            }
                        };
                        this.parseSlideContent(slideText, slide.content.root.children);
                        currentBlock.slides.push(slide);
                    }
                }
            } else if (currentBlock && currentBlock.type === 'mcqBlock') {
                // Finalize any remaining MCQ content
                if (currentOptionContent.length > 0 && state === 'IN_OPTION') {
                    const optionText = currentOptionContent.join('\n');
                    if (optionText.trim()) {
                        const optionId = `opt-${Date.now()}-${optionIndex}`;
                        currentBlock.options.push({
                            id: optionId,
                            text: { root: { type: 'root', version: 1, children: [{ type: 'paragraph', version: 1, children: this.parseInlineText(optionText, true) }] } },
                            isCorrect: false
                        });
                        optionIndex++;
                    }
                }
            }
            currentBlock = null;
            currentColumnContainer = null;
            currentColumnIndex = -1;
            currentSlideContent = [];
            currentDescriptionContent = [];
            currentQuestionContent = [];
            currentOptionsContent = [];
            currentOptionContent = [];
            currentFeedbackContent = [];
            currentGeneralFeedbackContent = [];
            currentPositiveFeedbackContent = [];
            currentNegativeFeedbackContent = [];
            slideIndex = 0;
            optionIndex = 0;
            currentOptionId = null;
            state = 'ROOT';
        };

        const closeSection = () => {
            if (currentSection) {
                closeBlock();
                sections.push(currentSection);
            }
            currentSection = null;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            if (state === 'IN_LATEX') {
                if (trimmedLine === '```') {
                    const latexNode: LexicalLatex = { type: 'latex', version: 1, code: multiLineContent.join('\n') };
                    this.addNodeToContent(latexNode, currentBlock, currentColumnContainer, currentColumnIndex);
                    multiLineContent = [];
                    state = 'IN_BLOCK';
                } else {
                    multiLineContent.push(line);
                }
                continue;
            }

            if (trimmedLine.startsWith('### ') && state !== 'IN_COLUMN_CONTAINER') {
                const nextLine = lines[i + 1]?.trim();
                
                // Only treat as a new section if it has section metadata after it
                if (nextLine && nextLine.startsWith('{') && nextLine.includes('"id"')) {
                    closeSection();
                    state = 'IN_SECTION';
                    const title = trimmedLine.substring(4).trim();
                    currentSection = {
                        id: uuidv4(),
                        title: { root: this.createHeadingRoot(title, 'h3') },
                        content: [],
                    };
                    
                    try {
                        const metadata = JSON.parse(nextLine);
                        if (metadata.id) {
                            currentSection.id = metadata.id;
                        }
                        i++; // Skip the metadata line
                    } catch (e) {
                        // Invalid JSON, continue with generated ID
                    }
                    continue;
                } else {
                    // This ### without metadata is just content, treat it as a heading within the current section
                    if (currentSection && state === 'IN_SECTION') {
                        const headingText = trimmedLine.substring(4).trim();
                        const headingNode = this.createHeadingRoot(headingText, 'h3');
                        
                        // Add as a paragraph with heading content to the current block or create a new block
                        if (!currentBlock) {
                            // Create a new lexical block for this heading
                            currentBlock = {
                                id: `block-${Date.now()}`,
                                type: 'lexicalRichTextBlock',
                                title: 'Untitled Block',
                                content: { root: { type: 'root', version: 1, children: [] } }
                            };
                            currentSection.content.push(currentBlock);
                        }
                        
                        // Add the heading to the current block's content
                        currentBlock.content.root.children.push(...headingNode.children);
                        continue;
                    }
                }
            }

            if (trimmedLine.startsWith('#### ')) {
                if (!currentSection) continue;
                closeBlock();
                state = 'IN_BLOCK';
                const title = trimmedLine.substring(5).trim();
                currentBlock = {
                    id: uuidv4(),
                    type: 'lexicalRichTextBlock',
                    title: title,
                    content: { root: { type: 'root', version: 1, children: [] } },
                };
                if (currentSection) currentSection.content.push(currentBlock);

                const nextLine = lines[i + 1]?.trim();
                if (nextLine && nextLine.startsWith('{')) {
                    try {
                        const meta = JSON.parse(nextLine);
                        currentBlock.id = meta.id || currentBlock.id;
                        currentBlock.type = meta.type || currentBlock.type;
                        Object.assign(currentBlock, meta);
                        i++;
                    } catch (e) { console.error("Failed to parse block metadata", e); }
                }
                if (currentBlock.type !== 'lexicalRichTextBlock') {
                    if (currentBlock.type === 'slideShowBlock') {
                        // Initialize slideshow block
                        currentBlock.slides = [];
                        currentBlock.description = { root: { type: 'root', version: 1, children: [] } };
                        slideIndex = 0;
                        state = 'IN_SLIDESHOW';
                    } else if (currentBlock.type === 'mcqBlock') {
                        // Initialize MCQ block
                        currentBlock.questionStem = { root: { type: 'root', version: 1, children: [] } };
                        currentBlock.options = [];
                        currentBlock.correctOptionId = '';
                        currentBlock.feedback = {
                            general: { root: { type: 'root', version: 1, children: [] } },
                            general_positive: { root: { type: 'root', version: 1, children: [] } },
                            general_negative: { root: { type: 'root', version: 1, children: [] } },
                            specific: {}
                        };
                        currentBlock.alignment = 'horizontal';
                        optionIndex = 0;
                        state = 'IN_MCQ';
                    } else if (currentBlock.type === 'mamcqBlock') {
                        // Initialize MAMCQ block (use same structure as MCQ but for multiple answers)
                        currentBlock.type = 'mcqBlock'; // Use mcqBlock type for compatibility
                        (currentBlock as any).isMAMCQ = true; // Flag to track MAMCQ blocks
                        currentBlock.questionStem = { root: { type: 'root', version: 1, children: [] } };
                        currentBlock.options = [];
                        currentBlock.correctOptionId = ''; // Empty for MAMCQ since multiple can be correct
                        currentBlock.feedback = {
                            general: { root: { type: 'root', version: 1, children: [] } },
                            general_positive: { root: { type: 'root', version: 1, children: [] } },
                            general_negative: { root: { type: 'root', version: 1, children: [] } },
                            specific: {} // No specific feedback for MAMCQ
                        };
                        currentBlock.alignment = 'horizontal';
                        mamcqOptionIndex = 0;
                        state = 'IN_MAMCQ';
                    } else if (currentBlock.type === 'dragDropBlock') {
                        // Initialize drag-drop block
                        currentBlock.description = { root: { type: 'root', version: 1, children: [] } };
                        currentBlock.dragItems = [];
                        currentBlock.dropAreas = [];
                        currentBlock.feedback = {
                            correct: { root: { type: 'root', version: 1, children: [] } },
                            incorrect: { root: { type: 'root', version: 1, children: [] } }
                        };
                        state = 'IN_DRAG_DROP';
                    } else if (currentBlock.type === 'fillInBlankBlock') {
                        // Initialize FIB block
                        currentBlock.feedback = {
                            correct: { root: { type: 'root', version: 1, children: [] } },
                            incorrect: { root: { type: 'root', version: 1, children: [] } }
                        };
                        state = 'IN_FIB';
                    } else {
                        const blockContentLines: string[] = [];
                        let j = i + 1;
                        while (j < lines.length && !lines[j].startsWith('### ') && !lines[j].startsWith('#### ')) {
                            blockContentLines.push(lines[j]);
                            j++;
                        }
                        this.parseSpecialBlock(currentBlock, blockContentLines.join('\n'));
                        i = j - 1;
                        closeBlock();
                    }
                }
                continue;
            }

            if (currentBlock && currentBlock.type === 'lexicalRichTextBlock') {
                // Skip ::: lines altogether - they're just delimiters
                if (trimmedLine === ':::') {
                    if (state === 'IN_COLUMN_CONTAINER') {
                        currentColumnContainer = null;
                        currentColumnIndex = -1;
                        state = 'IN_BLOCK';
                    }
                    continue;
                }
                if (trimmedLine === '=== COL' && state === 'IN_COLUMN_CONTAINER') {
                    if (currentColumnContainer) currentColumnIndex++;
                    continue;
                }
                if (trimmedLine.startsWith('::: columns')) {
                    state = 'IN_COLUMN_CONTAINER';
                    const match = trimmedLine.match(/::: columns \[(.*?)\]/);
                    const widths: string[] = match ? match[1].split(',').map(s => s.trim()) : [];
                    
                    // Create the main columns node based on the new schema
                    const columnsNode = {
                        type: 'columns',
                        version: 1,
                        columns: widths.length,
                        columnWidths: widths.map(w => w.endsWith('fr') ? w : `${w}%`),
                        children: widths.map((_, index) => ({
                            type: 'column',
                            version: 1,
                            children: [],
                            columnIndex: index,
                            verticalAlign: 'top'
                        }))
                    };

                    // The `currentColumnContainer` will now be the `columnsNode` itself.
                    // The children of this node are the actual column blocks.
                    currentColumnContainer = columnsNode as any; // Cast to fit, since schema is different

                    this.addNodeToContent(columnsNode as any, currentBlock, null, -1);
                    currentColumnIndex = 0;
                    continue;
                }
                if (trimmedLine.startsWith('```latex')) {
                    state = 'IN_LATEX';
                    multiLineContent = [];
                    continue;
                }
                if (trimmedLine === '') continue;

                const targetChildren = this.getTargetChildren(currentBlock, currentColumnContainer, currentColumnIndex);
                if (trimmedLine.startsWith('|')) {
                    const tableLines = [line];
                    let j = i + 1;
                    while (j < lines.length && lines[j].trim().startsWith('|')) {
                        tableLines.push(lines[j]);
                        j++;
                    }
                    i = j - 1;
                    targetChildren.push(this.parseTable(tableLines));
                } else if (trimmedLine.match(/^(\*|-|\d+\.)\s/)) {
                    this.parseListItem(trimmedLine, targetChildren);
                } else if (trimmedLine.startsWith('#')) {
                    const [level, ...textParts] = trimmedLine.split(' ');
                    const text = textParts.join(' ');
                    const tag = `h${level.length}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
                    targetChildren.push(this.createHeading(text, tag));
                } else {
                    targetChildren.push({ type: 'paragraph', version: 1, children: this.parseInlineText(trimmedLine) });
                }
            }

            if (currentBlock && currentBlock.type === 'slideShowBlock') {
                if (trimmedLine === ':::') {
                    if (state === 'IN_DESCRIPTION') {
                        // Parse description content
                        const descriptionText = currentDescriptionContent.join('\n');
                        if (descriptionText.trim()) {
                            currentBlock.description.root.children = [{ 
                                type: 'paragraph', 
                                version: 1, 
                                children: this.parseInlineText(descriptionText) 
                            }];
                        }
                        currentDescriptionContent = [];
                        state = 'IN_SLIDESHOW';
                    } else if (state === 'IN_SLIDE') {
                        // Parse slide content
                        const slideText = currentSlideContent.join('\n');
                        if (slideText.trim()) {
                            const slide = {
                                id: `slide-${Date.now()}-${slideIndex}`,
                                content: {
                                    root: {
                                        type: 'root',
                                        version: 1,
                                        children: []
                                    }
                                }
                            };
                            
                            // Parse slide content with full lexical support
                            this.parseSlideContent(slideText, slide.content.root.children);
                            currentBlock.slides.push(slide);
                            slideIndex++;
                        }
                        currentSlideContent = [];
                        state = 'IN_SLIDESHOW';
                    }
                    continue;
                }
                
                if (trimmedLine === '::: description' && state === 'IN_SLIDESHOW') {
                    state = 'IN_DESCRIPTION';
                    continue;
                }
                
                if (trimmedLine.startsWith('::: slide') && state === 'IN_SLIDESHOW') {
                    state = 'IN_SLIDE';
                    continue;
                }
                
                // Collect content for description or slide
                if (state === 'IN_DESCRIPTION') {
                    currentDescriptionContent.push(line);
                } else if (state === 'IN_SLIDE') {
                    currentSlideContent.push(line);
                }
                continue;
            }

            // Check MAMCQ first since it uses the same type as MCQ
        if (
                currentBlock &&
                currentBlock.type === 'mcqBlock' &&
                (currentBlock as any).isMAMCQ &&
                state.startsWith('IN_MAMCQ')
            ) {
                // ---- OPEN SECTIONS ----
                if (trimmedLine === '::: mamcq-question' && state === 'IN_MAMCQ') {
                    state = 'IN_MAMCQ_QUESTION';
                    continue;
                }

                if (trimmedLine.startsWith('::: mamcq-options') && state === 'IN_MAMCQ') {
                    state = 'IN_MAMCQ_OPTIONS';
                    const match = trimmedLine.match(/::: mamcq-options\s*(\w+)?/);
                    mamcqAlignment = (match && match[1])
                        ? (match[1] as 'horizontal' | 'vertical')
                        : 'horizontal';
                    currentBlock.alignment = mamcqAlignment;
                    continue;
                }

                if (trimmedLine.startsWith('::: mamcq-option') && state === 'IN_MAMCQ_OPTIONS') {
                    (currentBlock as any).currentMAMCQOptionIsCorrect =
                        trimmedLine.includes(' correct');
                    state = 'IN_MAMCQ_OPTION';
                    continue;
                }

                if (trimmedLine === '::: mamcq-feedback-positive' && state === 'IN_MAMCQ') {
                    state = 'IN_MAMCQ_FEEDBACK_POSITIVE';
                    continue;
                }

                if (trimmedLine === '::: mamcq-feedback-negative' && state === 'IN_MAMCQ') {
                    state = 'IN_MAMCQ_FEEDBACK_NEGATIVE';
                    continue;
                }

                // ---- CLOSE SECTIONS ----
                if (trimmedLine === ':::') {
                    if (state === 'IN_MAMCQ_QUESTION') {
                        const questionText = currentMAMCQQuestionContent.join('\n');
                        if (questionText.trim()) {
                            this.parseSlideContent(
                                questionText,
                                currentBlock.questionStem.root.children,
                                true
                            );
                        }
                        currentMAMCQQuestionContent = [];
                        state = 'IN_MAMCQ';
                    }

                    else if (state === 'IN_MAMCQ_OPTIONS') {
                        currentMAMCQOptionsContent = [];
                        state = 'IN_MAMCQ';
                    }

                    else if (state === 'IN_MAMCQ_OPTION') {
                        const optionText = currentMAMCQOptionContent.join('\n');
                        if (optionText.trim()) {
                            const optionId = `opt-${Date.now()}-${mamcqOptionIndex}`;
                            const isCorrect =
                                (currentBlock as any).currentMAMCQOptionIsCorrect || false;

                            currentBlock.options.push({
                                id: optionId,
                                text: { root: { type: 'root', version: 1, children: [] } },
                                isCorrect
                            });

                            this.parseSlideContent(
                                optionText,
                                currentBlock.options[currentBlock.options.length - 1].text
                                    .root.children,
                                true
                            );

                            mamcqOptionIndex++;
                        }

                        currentMAMCQOptionContent = [];
                        state = 'IN_MAMCQ_OPTIONS';
                    }

                    else if (state === 'IN_MAMCQ_FEEDBACK_POSITIVE') {
                        const feedbackText =
                            currentMAMCQFeedbackPositiveContent.join('\n');
                        if (feedbackText.trim()) {
                            this.parseSlideContent(
                                feedbackText,
                                currentBlock.feedback.general_positive.root.children,
                                true
                            );
                        }
                        currentMAMCQFeedbackPositiveContent = [];
                        state = 'IN_MAMCQ';
                    }

                    else if (state === 'IN_MAMCQ_FEEDBACK_NEGATIVE') {
                        const feedbackText =
                            currentMAMCQFeedbackNegativeContent.join('\n');
                        if (feedbackText.trim()) {
                            this.parseSlideContent(
                                feedbackText,
                                currentBlock.feedback.general_negative.root.children,
                                true
                            );
                        }
                        currentMAMCQFeedbackNegativeContent = [];
                        state = 'IN_MAMCQ';
                    }

                    continue;
                }

                // ---- COLLECT CONTENT ----
                if (state === 'IN_MAMCQ_QUESTION') {
                    currentMAMCQQuestionContent.push(line);
                }
                else if (state === 'IN_MAMCQ_OPTIONS') {
                    currentMAMCQOptionsContent.push(line);
                }
                else if (state === 'IN_MAMCQ_OPTION') {
                    currentMAMCQOptionContent.push(line);
                }
                else if (state === 'IN_MAMCQ_FEEDBACK_POSITIVE') {
                    currentMAMCQFeedbackPositiveContent.push(line);
                }
                else if (state === 'IN_MAMCQ_FEEDBACK_NEGATIVE') {
                    currentMAMCQFeedbackNegativeContent.push(line);
                }

                continue;
            }


          if (currentBlock && currentBlock.type === 'mcqBlock' && !(currentBlock as any).isMAMCQ) {
            // ---- OPEN SUB-SECTIONS ----
            if (trimmedLine === '::: mcq-question' && state === 'IN_MCQ') {
                state = 'IN_QUESTION';
                continue;
            }

            if (trimmedLine.startsWith('::: mcq-options') && state === 'IN_MCQ') {
                state = 'IN_OPTIONS';
                const match = trimmedLine.match(/::: mcq-options\s*(\w+)?/);
                mcqAlignment = (match && match[1]) ? match[1] as 'horizontal' | 'vertical' : 'horizontal';
                currentBlock.alignment = mcqAlignment;
                continue;
            }

            if (trimmedLine.startsWith('::: mcq-option') && (state === 'IN_OPTIONS' || state === 'IN_FEEDBACK')) {
                if (state === 'IN_FEEDBACK') {
                    currentFeedbackContent = [];
                    currentOptionId = null;
                }

                (currentBlock as any).currentOptionIsCorrect = trimmedLine.includes(' correct');
                state = 'IN_OPTION';
                continue;
            }

            if (trimmedLine === '::: mcq-feedback' && (state === 'IN_OPTIONS' || state === 'IN_OPTION')) {
                if (state === 'IN_OPTION') {
                    const optionText = currentOptionContent.join('\n');
                    if (optionText.trim()) {
                        const optionId = `opt-${Date.now()}-${optionIndex}`;
                        const isCorrect = (currentBlock as any).currentOptionIsCorrect || false;

                        currentBlock.options.push({
                            id: optionId,
                            text: { root: { type: 'root', version: 1, children: [] } },
                            isCorrect
                        });

                        if (isCorrect) currentBlock.correctOptionId = optionId;

                        // ✅ FULL rich parsing (tables, columns, lists, etc.)
                        this.parseSlideContent(
                            optionText,
                            currentBlock.options[currentBlock.options.length - 1].text.root.children,
                            true
                        );

                        currentOptionId = optionId;
                        optionIndex++;
                    }
                    currentOptionContent = [];
                }

                state = 'IN_FEEDBACK';
                continue;
            }

            if (trimmedLine === '::: mcq-feedback-general' && state === 'IN_MCQ') {
                state = 'IN_GENERAL_FEEDBACK';
                continue;
            }

            // ---- CLOSE SUB-SECTIONS ----
            if (trimmedLine === ':::') {
                if (state === 'IN_QUESTION') {
                    const questionText = currentQuestionContent.join('\n');

                    if (questionText.trim()) {
                        // ✅ SINGLE CALL — full rich parsing
                        this.parseSlideContent(
                            questionText,
                            currentBlock.questionStem.root.children,
                            true
                        );
                    }

                    currentQuestionContent = [];
                    state = 'IN_MCQ';
                }

                else if (state === 'IN_OPTIONS') {
                    currentOptionsContent = [];
                    state = 'IN_MCQ';
                }

                else if (state === 'IN_OPTION') {
                    const optionText = currentOptionContent.join('\n');

                    if (optionText.trim()) {
                        const optionId = `opt-${Date.now()}-${optionIndex}`;
                        const isCorrect = (currentBlock as any).currentOptionIsCorrect || false;

                        currentBlock.options.push({
                            id: optionId,
                            text: { root: { type: 'root', version: 1, children: [] } },
                            isCorrect
                        });

                        if (isCorrect) currentBlock.correctOptionId = optionId;

                        this.parseSlideContent(
                            optionText,
                            currentBlock.options[currentBlock.options.length - 1].text.root.children,
                            true
                        );

                        currentOptionId = optionId;
                        optionIndex++;
                    }

                    currentOptionContent = [];
                    state = 'IN_OPTIONS';
                }

                else if (state === 'IN_FEEDBACK') {
                    const feedbackText = currentFeedbackContent.join('\n');

                    if (feedbackText.trim() && currentOptionId) {
                        currentBlock.feedback.specific[currentOptionId] = {
                            root: { type: 'root', version: 1, children: [] }
                        };

                        this.parseSlideContent(
                            feedbackText,
                            currentBlock.feedback.specific[currentOptionId].root.children,
                            true
                        );
                    }

                    currentFeedbackContent = [];
                    state = 'IN_OPTIONS';
                }

                else if (state === 'IN_GENERAL_FEEDBACK') {
                    const feedbackText = currentGeneralFeedbackContent.join('\n');

                    if (feedbackText.trim()) {
                        this.parseSlideContent(
                            feedbackText,
                            currentBlock.feedback.general.root.children,
                            true
                        );
                    }

                    currentGeneralFeedbackContent = [];
                    state = 'IN_MCQ';
                }

                continue;
            }

            // ---- COLLECT CONTENT ----
            if (state === 'IN_QUESTION') {
                currentQuestionContent.push(line);
            } else if (state === 'IN_OPTIONS') {
                currentOptionsContent.push(line);
            } else if (state === 'IN_OPTION') {
                currentOptionContent.push(line);
            } else if (state === 'IN_FEEDBACK') {
                currentFeedbackContent.push(line);
            } else if (state === 'IN_GENERAL_FEEDBACK') {
                currentGeneralFeedbackContent.push(line);
            }

            continue;
        }


            if (
                currentBlock &&
                currentBlock.type === 'dragDropBlock' &&
                [
                    'IN_DRAG_DROP',
                    'IN_INSTRUCTIONS',
                    'IN_ITEMS',
                    'IN_ZONES',
                    'IN_DRAG_ITEM',
                    'IN_DROP_ZONE',
                    'IN_CORRECT_ITEMS',
                    'IN_FEEDBACK_CORRECT',
                    'IN_FEEDBACK_INCORRECT'
                ].includes(state)
            ) {
                // ---- OPEN SECTIONS ----
                if (trimmedLine === '::: drag-drop-description' && state === 'IN_DRAG_DROP') {
                    state = 'IN_INSTRUCTIONS';
                    continue;
                }

                if (trimmedLine.startsWith('::: drag-items') && state === 'IN_DRAG_DROP') {
                    state = 'IN_ITEMS';
                    continue;
                }

                if (trimmedLine === '::: drag-item' && state === 'IN_ITEMS') {
                    state = 'IN_DRAG_ITEM';
                    currentDragItemId = `drag-${Date.now()}-${dragItemIndex}`;
                    currentBlock.dragItems.push({
                        id: currentDragItemId,
                        text: { root: { type: 'root', version: 1, children: [] } }
                    });
                    dragItemIndex++;
                    continue;
                }

                if (trimmedLine.startsWith('::: drop-zones') && state === 'IN_DRAG_DROP') {
                    state = 'IN_ZONES';
                    continue;
                }

                if (trimmedLine === '::: drop-zone' && state === 'IN_ZONES') {
                    state = 'IN_DROP_ZONE';
                    currentDropZoneId = `drop-${Date.now()}-${dropZoneIndex}`;
                    currentBlock.dropAreas.push({
                        id: currentDropZoneId,
                        text: { root: { type: 'root', version: 1, children: [] } },
                        correctItemId: []
                    });
                    dropZoneIndex++;
                    continue;
                }

                if (trimmedLine === '::: correct-items' && state === 'IN_DROP_ZONE') {
                    // finalize drop-zone text BEFORE correct-items
                    const zoneText = currentDropZoneContent.join('\n');
                    if (zoneText.trim() && currentDropZoneId) {
                        const zone = currentBlock.dropAreas.find((z: any) => z.id === currentDropZoneId);
                        if (zone) {
                            this.parseSlideContent(
                                zoneText,
                                zone.text.root.children,
                                true
                            );
                        }
                    }

                    currentDropZoneContent = [];
                    state = 'IN_CORRECT_ITEMS';
                    continue;
                }

                if (trimmedLine === '::: drag-drop-feedback-correct' && state === 'IN_DRAG_DROP') {
                    state = 'IN_FEEDBACK_CORRECT';
                    continue;
                }

                if (trimmedLine === '::: drag-drop-feedback-incorrect' && state === 'IN_DRAG_DROP') {
                    state = 'IN_FEEDBACK_INCORRECT';
                    continue;
                }

                // ---- CLOSE SECTIONS ----
                if (trimmedLine === ':::') {
                    if (state === 'IN_INSTRUCTIONS') {
                        const descriptionText = currentDragDropDescriptionContent.join('\n');
                        if (descriptionText.trim()) {
                            this.parseSlideContent(
                                descriptionText,
                                currentBlock.description.root.children,
                                true
                            );
                        }
                        currentDragDropDescriptionContent = [];
                        state = 'IN_DRAG_DROP';
                    }

                    else if (state === 'IN_ITEMS') {
                        currentDragItemsContent = [];
                        state = 'IN_DRAG_DROP';
                    }

                    else if (state === 'IN_DRAG_ITEM') {
                        const itemText = currentDragItemContent.join('\n');
                        if (itemText.trim() && currentDragItemId) {
                            const item = currentBlock.dragItems.find((i: any) => i.id === currentDragItemId);
                            if (item) {
                                this.parseSlideContent(
                                    itemText,
                                    item.text.root.children,
                                    true
                                );
                            }
                        }
                        currentDragItemContent = [];
                        currentDragItemId = null;
                        state = 'IN_ITEMS';
                    }

                    else if (state === 'IN_ZONES') {
                        currentDropZonesContent = [];
                        state = 'IN_DRAG_DROP';
                    }

                    else if (state === 'IN_DROP_ZONE') {
                        const zoneText = currentDropZoneContent.join('\n');
                        if (zoneText.trim() && currentDropZoneId) {
                            const zone = currentBlock.dropAreas.find((z: any) => z.id === currentDropZoneId);
                            if (zone) {
                                this.parseSlideContent(
                                    zoneText,
                                    zone.text.root.children,
                                    true
                                );
                            }
                        }
                        currentDropZoneContent = [];
                        currentDropZoneId = null;
                        state = 'IN_ZONES';
                    }

                    else if (state === 'IN_CORRECT_ITEMS') {
                        currentCorrectItemsContent = [];
                        state = 'IN_ZONES';
                    }

                    else if (state === 'IN_FEEDBACK_CORRECT') {
                        const feedbackText = currentDragDropFeedbackCorrectContent.join('\n');
                        if (feedbackText.trim()) {
                            this.parseSlideContent(
                                feedbackText,
                                currentBlock.feedback.correct.root.children,
                                true
                            );
                        }
                        currentDragDropFeedbackCorrectContent = [];
                        state = 'IN_DRAG_DROP';
                    }

                    else if (state === 'IN_FEEDBACK_INCORRECT') {
                        const feedbackText = currentDragDropFeedbackIncorrectContent.join('\n');
                        if (feedbackText.trim()) {
                            this.parseSlideContent(
                                feedbackText,
                                currentBlock.feedback.incorrect.root.children,
                                true
                            );
                        }
                        currentDragDropFeedbackIncorrectContent = [];
                        state = 'IN_DRAG_DROP';
                    }

                    continue;
                }

                // ---- COLLECT CONTENT ----
                if (state === 'IN_INSTRUCTIONS') {
                    currentDragDropDescriptionContent.push(line);
                }
                else if (state === 'IN_ITEMS') {
                    currentDragItemsContent.push(line);
                }
                else if (state === 'IN_DRAG_ITEM') {
                    currentDragItemContent.push(line);
                }
                else if (state === 'IN_ZONES') {
                    currentDropZonesContent.push(line);
                }
                else if (state === 'IN_DROP_ZONE') {
                    currentDropZoneContent.push(line);
                }
                else if (state === 'IN_CORRECT_ITEMS') {
                    if (line.trim().startsWith('drag-')) {
                        const zone = currentBlock.dropAreas.find((z: any) => z.id === currentDropZoneId);
                        if (zone) zone.correctItemId.push(line.trim());
                    }
                    else if (/^\d+$/.test(line.trim())) {
                        const index = parseInt(line.trim(), 10);
                        if (index >= 0 && index < currentBlock.dragItems.length) {
                            const zone = currentBlock.dropAreas.find((z: any) => z.id === currentDropZoneId);
                            if (zone) zone.correctItemId.push(currentBlock.dragItems[index].id);
                        }
                    }
                }
                else if (state === 'IN_FEEDBACK_CORRECT') {
                    currentDragDropFeedbackCorrectContent.push(line);
                }
                else if (state === 'IN_FEEDBACK_INCORRECT') {
                    currentDragDropFeedbackIncorrectContent.push(line);
                }

                continue;
            }


            if (currentBlock && currentBlock.type === 'fillInBlankBlock' && ['IN_FIB', 'IN_FIB_QUESTION', 'IN_FIB_FEEDBACK_CORRECT', 'IN_FIB_FEEDBACK_INCORRECT'].includes(state)) {
                // Check for specific FIB block types first
                if (trimmedLine === '::: fib-question' && state === 'IN_FIB') {
                    state = 'IN_FIB_QUESTION';
                    continue;
                }
                
                if (trimmedLine === '::: fib-feedback-correct' && state === 'IN_FIB') {
                    state = 'IN_FIB_FEEDBACK_CORRECT';
                    continue;
                }
                
                if (trimmedLine === '::: fib-feedback-incorrect' && state === 'IN_FIB') {
                    state = 'IN_FIB_FEEDBACK_INCORRECT';
                    continue;
                }
                
                // Now handle generic ::: closing
                if (trimmedLine === ':::') {
                    if (state === 'IN_FIB_QUESTION') {
                        // Parse question content and convert {{answer}} to fitg nodes
                        const questionText = currentFIBQuestionContent.join('\n');
                        if (questionText.trim()) {
                            this.parseFIBContent(questionText, currentBlock.content.root.children);
                        }
                        currentFIBQuestionContent = [];
                        state = 'IN_FIB';
                    } else if (state === 'IN_FIB_FEEDBACK_CORRECT') {
                        // Parse correct feedback content
                        const feedbackText = currentFIBFeedbackCorrectContent.join('\n');
                        if (feedbackText.trim()) {
                            this.parseSlideContent(feedbackText, currentBlock.feedback.correct.root.children, true);
                        }
                        currentFIBFeedbackCorrectContent = [];
                        state = 'IN_FIB';
                    } else if (state === 'IN_FIB_FEEDBACK_INCORRECT') {
                        // Parse incorrect feedback content
                        const feedbackText = currentFIBFeedbackIncorrectContent.join('\n');
                        if (feedbackText.trim()) {
                            this.parseSlideContent(feedbackText, currentBlock.feedback.incorrect.root.children, true);
                        }
                        currentFIBFeedbackIncorrectContent = [];
                        state = 'IN_FIB';
                    }
                    continue;
                }
                
                // Collect content for different parts
                if (state === 'IN_FIB_QUESTION') {
                    currentFIBQuestionContent.push(line);
                } else if (state === 'IN_FIB_FEEDBACK_CORRECT') {
                    currentFIBFeedbackCorrectContent.push(line);
                } else if (state === 'IN_FIB_FEEDBACK_INCORRECT') {
                    currentFIBFeedbackIncorrectContent.push(line);
                }
                continue;
            }
        }

        closeSection();

        return { sections };
    }


    private parseFIBContent(text: string, children: LexicalNode[]) {
    const lines = text.split('\n');

    for (const line of lines) {
        const parts = line.split(/(\{\{[^}]+\}\})/);

        const paragraph: LexicalParagraph = {
            type: 'paragraph',
            version: 1,
            children: [],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: ''
        };

        for (const part of parts) {
            if (part.startsWith('{{') && part.endsWith('}}')) {
                const answer = part.slice(2, -2).trim();

                const fitgNode: LexicalFitg = {
                    type: 'fitg',
                    version: 1,
                    answer,
                    width: 100
                };

                paragraph.children.push(fitgNode);
            } else if (part) {
                // parse inline text normally and append INLINE
                const inlineNodes = this.parseInlineText(part, true);
                paragraph.children.push(...inlineNodes);
            }
        }

        // only push paragraph if it has content
        if (paragraph.children.length > 0) {
            children.push(paragraph);
        }
    }
}


    private parseSpecialBlock(block: ContentBlock, content: string) {
        switch (block.type) {
            // MCQ blocks are now handled in the main parser
            case 'slideShowBlock':
                Object.assign(block, this.parseSlideShowBlock(block.title, content, block));
                break;
            case 'dragDropBlock':
                Object.assign(block, this.parseDragDropBlock(block.title, content, block));
                break;
        }
    }

    private addNodeToContent(node: LexicalNode, block: ContentBlock | null, colContainer: LexicalColumnContainer | null, colIndex: number) {
        if (!block) return;
        const target = this.getTargetChildren(block, colContainer, colIndex);
        target.push(node);
    }

    private getTargetChildren(block: ContentBlock, colContainer: any | null, colIndex: number): LexicalNode[] {
        if (colContainer && colIndex > -1) {
            // For the new 'columns' type, children are the columns.
            if (colContainer.type === 'columns') {
                if (colContainer.children.length > colIndex) {
                    return colContainer.children[colIndex].children;
                }
            } 
            // Legacy support for 'column-container'
            else if (colContainer.columns) {
                if (colContainer.columns.length > colIndex) {
                    return colContainer.columns[colIndex].children;
                }
            }
        }
        return block.content.root.children;
    }

    private createHeadingRoot(text: string, tag: 'h3'): LexicalRoot {
        return {
            type: 'root',
            version: 1,
            children: [this.createHeading(text, tag)],
        };
    }

    private createHeading(text: string, tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'): LexicalHeading {
        return {
            type: 'heading',
            tag: tag,
            version: 1,
            children: [{ type: 'text', version: 1, text: text }],
        };
    }

    private parseInlineText(text: string, isMCQBlock: boolean = false): LexicalNode[] {
        const nodes: LexicalNode[] = [];
        const regex = /(\*\*.*?\*\*)|(\*.*?\*)|(!\[(.*?)\]\((.*?)\))|(\$[^$]*?\$)/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const [fullMatch, bold, italic, image, alt, src, equation] = match;
            const leadText = text.substring(lastIndex, match.index);
            if (leadText) {
                nodes.push({ type: 'text', version: 1, text: leadText });
            }

            if (bold) {
                nodes.push({ type: 'text', version: 1, text: bold.slice(2, -2), format: 1 });
            } else if (italic) {
                nodes.push({ type: 'text', version: 1, text: italic.slice(1, -1), format: 2 });
            } else if (image) {
                // Use extended image format for MCQ blocks
                if (isMCQBlock) {
                    nodes.push({ 
                        type: 'image', 
                        version: 1, 
                        imageUrl: src || '', 
                        altText: alt || '',
                        mediaId: '',
                        width: 400,
                        height: 175,
                        displayMode: 'inline'
                    } as any);
                } else {
                    nodes.push({ 
                        type: 'image', 
                        version: 1, 
                        src: src || '', 
                        altText: alt || '',
                        width: 400,
                        height: 175
                    });
                }
            } else if (equation) {
                nodes.push({ type: 'equation', version: 1, equation: equation.slice(1, -1), inline: true });
            }
            lastIndex = match.index + fullMatch.length;
        }

        const tailText = text.substring(lastIndex);
        if (tailText) {
            nodes.push({ type: 'text', version: 1, text: tailText });
        }

        return nodes;
    }

    private parseTable(tableLines: string[]): LexicalTable {
        const rows = tableLines.map(l => l.trim()).filter(Boolean);
        if (rows.length < 2) {
            return { type: 'table', version: 1, children: [], grid: { rows: 0, columns: 0 } };
        }
        const headerRow = rows[0];
        const bodyRows = rows.slice(2);
        const numColumns = headerRow.split('|').slice(1, -1).length;

        const createCell = (text: string, isHeader: boolean): LexicalTableCell => ({
            type: 'tablecell',
            version: 1,
            headerState: isHeader ? 'header' : 'normal',
            width: 188, // Default width
            children: [
                {
                    type: 'paragraph',
                    version: 1,
                    children: this.parseInlineText(text)
                }
            ]
        });

        const headerCells = headerRow.split('|').slice(1, -1).map(cell => createCell(cell.trim(), true));
        const tableRows: LexicalTableRow[] = [
            { type: 'tablerow', version: 1, children: headerCells }
        ];

        for (const row of bodyRows) {
            const cells = row.split('|').slice(1, -1).map(cell => createCell(cell.trim(), false));
            tableRows.push({ type: 'tablerow', version: 1, children: cells });
        }

        return {
            type: 'table',
            version: 1,
            children: tableRows,
            grid: {
                rows: bodyRows.length + 1,
                columns: numColumns
            }
        };
    }

    private parseListItem(line: string, targetChildren: LexicalNode[]) {
        const listType = line.startsWith('*') || line.startsWith('-') ? 'bullet' : 'number';
        const tag = listType === 'bullet' ? 'ul' : 'ol';
        let lastNode = targetChildren[targetChildren.length - 1];

        if (lastNode?.type !== 'list' || (lastNode as LexicalList).listType !== listType) {
            const newList: any = { 
                type: 'list', 
                version: 1, 
                listType, 
                tag, 
                children: [], 
                start: 1,
                direction: 'ltr',
                format: '',
                indent: 0
            };
            targetChildren.push(newList);
            lastNode = newList;
        }
        
        const list = lastNode as LexicalList;
        const itemMatch = line.match(/^(\d+\.|\*|-)\s(.*)/);
        if (itemMatch) {
            const text = itemMatch[2];
            // The value should be the current length of the list + 1 for all types, as per the desired JSON.
            const value = list.children.length + 1;
            const listItem: LexicalListItem = {
                type: 'listitem',
                version: 1,
                format: "",
                indent: 0,
                value: value,
                children: this.parseInlineText(text).map(node => {
                            if (node.type === 'text') {
                                const textNode = node as LexicalText;
                                return {
                                    type: 'text' as const,
                                    version: 1,
                                    text: textNode.text,
                                    detail: 0,
                                    format: 0,
                                    mode: 'normal' as const,
                                    style: ''
                                };
                            }
                            // For other node types, we need to handle them differently
                            // but for now, let's focus on text nodes which are the most common
                            return node;
                        }),
                direction: 'ltr'
            };
            list.children.push(listItem);
        }
    }

    private parseMcqBlock(title: string, content: string, metadata: any): ContentBlock {
        const lines = content.split('\n').filter(Boolean);
        let question = '';
        const options: any[] = [];
        let currentOption: any = null;

        for (const line of lines) {
            if (line.startsWith('? ')) {
                question = line.substring(2).trim();
            } else if (line.startsWith('* [x] ')) {
                if (currentOption) options.push(currentOption);
                currentOption = { id: uuidv4(), isCorrect: true, value: line.substring(6).trim(), feedback: '' };
            } else if (line.startsWith('* [ ] ')) {
                if (currentOption) options.push(currentOption);
                currentOption = { id: uuidv4(), isCorrect: false, value: line.substring(6).trim(), feedback: '' };
            } else if (line.startsWith('> ')) {
                if (currentOption) {
                    currentOption.feedback = line.substring(2).trim();
                }
            }
        }
        if (currentOption) options.push(currentOption);

        const createParagraphs = (text: string): LexicalParagraph[] => {
            return text.split('\n\n').filter(Boolean).map(p => ({
                type: 'paragraph',
                version: 1,
                children: this.parseInlineText(p)
            }));
        };

        return {
            id: metadata.id || uuidv4(),
            type: 'mcqBlock',
            title: title,
            alignment: metadata.alignment || 'vertical',
            question: { root: { type: 'root', version: 1, children: createParagraphs(question) } },
            options: options.map(opt => ({
                ...opt,
                value: { root: { type: 'root', version: 1, children: createParagraphs(opt.value) } },
                feedback: { root: { type: 'root', version: 1, children: createParagraphs(opt.feedback) } },
            })),
        };
    }

    private parseSlideShowBlock(title: string, content: string, metadata: any): ContentBlock {
        const slideContent = content.split('=== SLIDE').filter(s => s.trim() !== '');
        const slides = slideContent.map(slide => {
            const metadataMatch = slide.match(/^{{([\s\S]*?)}}\n/);
            let slideMetadata = {};
            let slideContentWithoutMetadata = slide;

            if (metadataMatch) {
                try {
                    slideMetadata = JSON.parse(`{${metadataMatch[1]}}`);
                    slideContentWithoutMetadata = slide.replace(metadataMatch[0], '');
                } catch (error) {
                    console.error('Error parsing slide metadata:', error);
                }
            }

            return {
                id: (slideMetadata as any).id || uuidv4(),
                content: {
                    root: {
                        type: 'root',
                        version: 1,
                        children: [{ type: 'paragraph', version: 1, children: this.parseInlineText(slideContentWithoutMetadata.trim()) }],
                    },
                },
            };
        });

        return {
            id: metadata.id || uuidv4(),
            type: 'slideShowBlock',
            title: title,
            slides: slides,
        };
    }

    private parseDragDropBlock(title: string, content: string, metadata: any): ContentBlock {
        const lines = content.split('\n').filter(Boolean);
        let instructions = '';
        const items: any[] = [];
        const zones: any[] = [];
        let correctFeedback = '';
        let incorrectFeedback = '';

        let currentSection = '';

        for (const line of lines) {
            if (line.startsWith('**Instructions:**')) {
                currentSection = 'instructions';
                instructions = line.substring(17).trim();
                continue;
            } else if (line.startsWith('**Items:**')) {
                currentSection = 'items';
                continue;
            } else if (line.startsWith('**Zones:**')) {
                currentSection = 'zones';
                continue;
            } else if (line.startsWith('**Feedback:**')) {
                currentSection = 'feedback';
                continue;
            }

            switch (currentSection) {
                case 'items':
                    const itemMatch = line.match(/- \[(.*?)\] (.*)/);
                    if (itemMatch) {
                        items.push({ id: itemMatch[1], value: itemMatch[2] });
                    }
                    break;
                case 'zones':
                    const zoneMatch = line.match(/- \[(.*?)\] \(Correct: (.*?)\) -> "(.*?)"/);
                    if (zoneMatch) {
                        zones.push({ id: zoneMatch[1], correctItemId: zoneMatch[2], description: zoneMatch[3] });
                    }
                    break;
                case 'feedback':
                    if (line.startsWith('+ Correct: ')) {
                        correctFeedback = line.substring(11);
                    } else if (line.startsWith('- Incorrect: ')) {
                        incorrectFeedback = line.substring(13);
                    }
                    break;
            }
        }

        const createParagraphs = (text: string): LexicalParagraph[] => {
            return text.split('\n\n').filter(Boolean).map(p => ({
                type: 'paragraph',
                version: 1,
                children: this.parseInlineText(p)
            }));
        };

        return {
            id: metadata.id || uuidv4(),
            type: 'dragDropBlock',
            title: title,
            instructions: { root: { type: 'root', version: 1, children: createParagraphs(instructions) } },
            items: items.map(item => ({ ...item, value: { root: { type: 'root', version: 1, children: createParagraphs(item.value) } } })),
            zones: zones,
            feedback: {
                correct: { root: { type: 'root', version: 1, children: createParagraphs(correctFeedback) } },
                incorrect: { root: { type: 'root', version: 1, children: createParagraphs(incorrectFeedback) } },
            },
        };
    }

    private parseSlideContent(content: string, children: LexicalNode[], isMCQBlock: boolean = false) {
        const lines = content.split('\n');
        let currentColumnContainer: any = null;
        let currentColumnIndex = -1;
        let state: 'NORMAL' | 'IN_COLUMN_CONTAINER' | 'IN_LATEX' = 'NORMAL';
        let multiLineContent: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            if (state === 'IN_LATEX') {
                if (trimmedLine === '```') {
                    const latexNode: LexicalLatex = { type: 'latex', version: 1, code: multiLineContent.join('\n') };
                    children.push({ type: 'paragraph', version: 1, children: [latexNode] });
                    multiLineContent = [];
                    state = 'NORMAL';
                } else {
                    multiLineContent.push(line);
                }
                continue;
            }

            // Handle column containers in slides
            if (trimmedLine === ':::' && state === 'IN_COLUMN_CONTAINER') {
                currentColumnContainer = null;
                currentColumnIndex = -1;
                state = 'NORMAL';
                continue;
            }

            if (trimmedLine === '=== COL' && state === 'IN_COLUMN_CONTAINER') {
                if (currentColumnContainer) currentColumnIndex++;
                continue;
            }

            if (trimmedLine.startsWith('::: columns')) {
                state = 'IN_COLUMN_CONTAINER';
                const match = trimmedLine.match(/::: columns \[(.*?)\]/);
                const widths: string[] = match ? match[1].split(',').map(s => s.trim()) : [];
                
                const columnsNode = {
                    type: 'columns' as const,
                    version: 1 as const,
                    columns: widths.length,
                    columnWidths: widths.map(w => w.endsWith('fr') ? w : `${w}%`),
                    children: widths.map((_, index) => ({
                        type: 'column' as const,
                        version: 1 as const,
                        children: [],
                        columnIndex: index,
                        verticalAlign: 'top' as const
                    }))
                };

                children.push(columnsNode);
                currentColumnContainer = columnsNode;
                currentColumnIndex = 0;
                continue;
            }

            if (trimmedLine.startsWith('```latex')) {
                state = 'IN_LATEX';
                multiLineContent = [];
                continue;
            }

            if (trimmedLine === '') continue;

            // Get target children (either slide root or column)
            const targetChildren = currentColumnContainer && currentColumnIndex > -1 
                ? currentColumnContainer.children[currentColumnIndex].children 
                : children;

            // Parse content within slide
            if (trimmedLine.startsWith('|')) {
                const tableLines = [line];
                let j = i + 1;
                while (j < lines.length && lines[j].trim().startsWith('|')) {
                    tableLines.push(lines[j]);
                    j++;
                }
                i = j - 1;
                targetChildren.push(this.parseTable(tableLines));
            } else if (trimmedLine.match(/^(\*|-|\d+\.)\s/)) {
                this.parseListItem(trimmedLine, targetChildren);
            } else if (trimmedLine.startsWith('#')) {
                const [level, ...textParts] = trimmedLine.split(' ');
                const text = textParts.join(' ');
                const tag = `h${level.length}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
                targetChildren.push(this.createHeading(text, tag));
            } else {
                targetChildren.push({ type: 'paragraph', version: 1, children: this.parseInlineText(trimmedLine, isMCQBlock) });
            }
        }
    }
}
