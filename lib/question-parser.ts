import { v4 as uuidv4 } from 'uuid';
import {
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
import {
    QuestionJSON,
    QuestionType,
    McqQuestion,
    McqOption,
    McqMatrix,
    FitgQuestion,
    DndQuestion,
    ClassificationQuestion,
    TokenHighlight
} from '../types/question-schema';

type ParserState = 'ROOT' | 'IN_QUESTION' | 'IN_STEM' | 'IN_SOLUTION' | 'IN_HINT' | 'IN_MCQ_CONFIG' | 'IN_OPTIONS' | 'IN_OPTION' | 'IN_MATRIX_CONFIG' | 'IN_SECONDARY_OPTIONS' | 'IN_SECONDARY_OPTION' | 'IN_MATRIX_MAPPING' | 'IN_LATEX' | 'IN_COLUMN_CONTAINER' | 'IN_FITG_CONFIG' | 'IN_FITG_TEXTS' | 'IN_CLASSIFICATION_CONFIG' | 'IN_CLASSIFICATION_COLUMNS' | 'IN_CLASSIFICATION_ROWS' | 'IN_CLASSIFICATION_COLUMN_NAMES' | 'IN_CLASSIFICATION_ROW_NAMES' | 'IN_CLASSIFICATION_MATRIX_CELLS' | 'IN_CLASSIFICATION_MAPPING' | 'IN_CLASSIFICATION_POSSIBLE_RESPONSES' | 'IN_CLASSIFICATION_POSSIBLE_RESPONSE_IDS' | 'IN_CLASSIFICATION_CORRECT_ANSWERS' | 'IN_MATCHDS_STIMULUSLIST' | 'IN_MATCHDS_POSSIBLERESPONSES' | 'IN_TOKEN_CONFIG' | 'IN_TOKEN_TEXT' | 'IN_TOKEN_ANSWERS' | 'IN_DND_CONFIG' | 'IN_DND_DROP_OBJECTS' | 'IN_DND_ZONES' | 'IN_DND_MAPPING' | 'IN_PASSAGE';

export class QuestionParser {
    private markdown: string;

    constructor(markdown: string) {
        this.markdown = markdown;
    }

    public parse(): QuestionJSON {
        const lines = this.markdown.split(/\r?\n/);

        const question: QuestionJSON = {
            id: 'new',
            questionId: '',
            selectedQuestionType: 'mcq',
            questionStem: JSON.stringify({ root: { type: 'root', version: 1, children: [] } }),
            _status: 'draft',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Initialize all question types with defaults to match expected JSON structure
        question.mcqQuestion = {
            optionOrientation: 'vertical',
            selectedMcqType: 'default',
            options: []
        };
        question.fitgQuestion = {
            selectFitgqType: 'default',
            selectDnDPosition: 'vertical',
            dropableTexts: []
        };
        question.dndQuestion = {
            questionImage: null,
            dropableZones: [],
            selObjType: 'text',
            dropObjects: [],
            assignDropableZones: [],
            positionDropableObjects: []
        };
        question.classificationQuestion = {
            selectedClassificationType: 'default',
            columnCount: 1,
            rowCount: 1,
            columnNames: [],
            rowNames: [],
            matrixCells: [], // Added missing property
            possibleResponses: [],
            correctAnswers: [],
            duplicateResponses: false,
            matchDS: {
                stimulusList: [],
                possibleResponses: [],
                optionMapping: {},
                duplicateResponses: false
            }
        };
        question.tokenHighlight = {
            templateText: { value: "", json: "" },
            tokenType: "word",
            answers: []
        };
        question.hasStepByStepSolution = false;
        question.solution = null;
        question.hasHint = false;
        question.hint = null;
        question.tags = [];
        question.difficultyLevelMetric = undefined;
        question.discriminationLevel = undefined;

        let state: ParserState = 'ROOT';
        let currentStemContent: string[] = [];
        let currentOptionContent: string[] = [];
        let currentOptionId: string | null = null;
        let currentOptionInternalId: string | null = null;
        let currentOptionIsCorrect: boolean = false;
        let currentSubContent: string[] = [];
        let nestedBlockDepth = 0; // Track nested ::: blocks inside stem/solution/hint
        let currentPossibleResponseContent: string[] = [];
        let currentPossibleResponseId: string = '';

        // matchDS accumulator variables
        let currentMatchDSStimulusContent: string[] = [];
        let currentMatchDSStimulusId: string | null = null;
        let currentMatchDSStimulusInternalId: string | null = null;
        let currentMatchDSResponseContent: string[] = [];
        let currentMatchDSResponseId: string | null = null;
        let currentMatchDSResponseInternalId: string | null = null;
        let currentPassageContent: string[] = [];

        // Helper to finalize stem
        const finalizeStem = () => {
            if (currentStemContent.length > 0) {
                const root: LexicalRoot = { type: 'root', version: 1, children: [] };
                this.parseSlideContent(currentStemContent.join('\n'), root.children, true);
                question.questionStem = JSON.stringify({ root });
                currentStemContent = [];
            }
        };

        // Helper to finalize option
        const finalizeOption = () => {
            if (currentOptionContent.length > 0) {
                const root: LexicalRoot = { type: 'root', version: 1, children: [] };
                this.parseSlideContent(currentOptionContent.join('\n'), root.children, true);

                if (state === 'IN_SECONDARY_OPTION') {
                    if (!question.mcqQuestion) question.mcqQuestion = { options: [], selectedMcqType: 'default', optionOrientation: 'vertical' };
                    if (!question.mcqQuestion.matrix) {
                        question.mcqQuestion.matrix = {
                            secondaryOptions: [],
                            isMultipleResponse: false,
                            optionMapping: []
                        };
                    }
                    // Parse secondary option content as Lexical JSON
                    const secondaryRoot: LexicalRoot = { type: 'root', version: 1, children: [] };
                    this.parseSlideContent(currentOptionContent.join('\n'), secondaryRoot.children, true);
                    question.mcqQuestion.matrix.secondaryOptions.push({
                        _id: currentOptionInternalId || currentOptionId || uuidv4(),
                        option: JSON.stringify({ root: secondaryRoot })
                    });
                } else if (state === 'IN_OPTION') {
                    if (!question.mcqQuestion) question.mcqQuestion = { options: [], selectedMcqType: 'default', optionOrientation: 'vertical' };
                    // Normal options
                    question.mcqQuestion.options.push({
                        id: currentOptionId || uuidv4(),
                        option: { root },
                        isCorrectAnswer: currentOptionIsCorrect,
                        _id: currentOptionInternalId || (question.mcqQuestion.options.length + 1).toString()
                    });
                }
                currentOptionContent = [];
                currentOptionId = null;
                currentOptionInternalId = null;
                currentOptionIsCorrect = false;
            }
        };

        const finalizePossibleResponse = () => {
            if (currentPossibleResponseContent.length > 0) {
                const root: LexicalRoot = { type: 'root', version: 1, children: [] };
                this.parseSlideContent(currentPossibleResponseContent.join('\n'), root.children, true);

                if (question.classificationQuestion) {
                    question.classificationQuestion.possibleResponses.push({
                        responseId: currentPossibleResponseId || `response-default-${question.classificationQuestion.possibleResponses.length + 1}`,
                        content: JSON.stringify({ root })
                    });
                }
                currentPossibleResponseContent = [];
                currentPossibleResponseId = '';
            }
        };

        const finalizeTokenText = () => {
            if (currentSubContent.length > 0) {
                if (!question.tokenHighlight) question.tokenHighlight = { templateText: { value: "", json: "" }, tokenType: "word", answers: [] };
                const root: LexicalRoot = { type: 'root', version: 1, children: [] };
                this.parseSlideContent(currentSubContent.join('\n'), root.children, true);
                question.tokenHighlight.templateText.value = currentSubContent.join('\n');
                question.tokenHighlight.templateText.json = JSON.stringify({ root });
                currentSubContent = [];
            }
        }

        let currentSolutionContent: string[] = [];
        let currentHintContent: string[] = [];

        // Helper to finalize solution
        const finalizeSolution = () => {
            if (currentSolutionContent.length > 0) {
                const root: LexicalRoot = { type: 'root', version: 1, children: [] };
                this.parseSlideContent(currentSolutionContent.join('\n'), root.children, true);
                // Output as Lexical object, not stringified JSON
                question.solution = { root } as any;
                question.hasStepByStepSolution = true;
                currentSolutionContent = [];
            }
        };

        // Helper to finalize hint
        const finalizeHint = () => {
            if (currentHintContent.length > 0 && currentHintContent.some(l => l.trim().length > 0)) {
                const root: LexicalRoot = { type: 'root', version: 1, children: [] };
                this.parseSlideContent(currentHintContent.join('\n'), root.children, true);
                // Output as Lexical object, not stringified JSON
                question.hint = { root } as any;
                question.hasHint = true;
                currentHintContent = [];
            } else {
                // Empty hint block - set hint to empty string
                question.hint = '' as any;
                question.hasHint = false;
            }
        };

        // Helper to finalize matchDS stimulus item
        const finalizeMatchDSStimulus = () => {
            if (currentMatchDSStimulusContent.length > 0 && question.classificationQuestion?.matchDS) {
                const root: LexicalRoot = { type: 'root', version: 1, children: [] };
                this.parseSlideContent(currentMatchDSStimulusContent.join('\n'), root.children, true);
                question.classificationQuestion.matchDS.stimulusList.push({
                    id: currentMatchDSStimulusId,
                    _id: currentMatchDSStimulusInternalId || (question.classificationQuestion.matchDS.stimulusList.length + 1).toString(),
                    option: JSON.stringify({ root })
                });
                currentMatchDSStimulusContent = [];
                currentMatchDSStimulusId = null;
                currentMatchDSStimulusInternalId = null;
            }
        };

        // Helper to finalize matchDS response item
        const finalizeMatchDSResponse = () => {
            if (currentMatchDSResponseContent.length > 0 && question.classificationQuestion?.matchDS) {
                const root: LexicalRoot = { type: 'root', version: 1, children: [] };
                this.parseSlideContent(currentMatchDSResponseContent.join('\n'), root.children, true);
                question.classificationQuestion.matchDS.possibleResponses.push({
                    id: currentMatchDSResponseId,
                    _id: currentMatchDSResponseInternalId || (question.classificationQuestion.matchDS.possibleResponses.length + 1).toString(),
                    option: JSON.stringify({ root })
                });
                currentMatchDSResponseContent = [];
                currentMatchDSResponseId = null;
                currentMatchDSResponseInternalId = null;
            }
        };

        // Helper to finalize passage
        const finalizePassage = () => {
            if (currentPassageContent.length > 0) {
                const root: LexicalRoot = { type: 'root', version: 1, children: [] };
                this.parseSlideContent(currentPassageContent.join('\n'), root.children, true);
                if (!question.mcqQuestion) question.mcqQuestion = { options: [], selectedMcqType: 'default', optionOrientation: 'vertical' };
                question.mcqQuestion.passage = { root } as any;
                currentPassageContent = [];
            }
        };

        const finalizeCurrentBlock = () => {
            if (state === 'IN_STEM') finalizeStem();
            else if (state === 'IN_SOLUTION') finalizeSolution();
            else if (state === 'IN_HINT') finalizeHint();
            else if (state === 'IN_OPTION') finalizeOption();
            else if (state === 'IN_SECONDARY_OPTION') finalizeOption();
            else if (state === 'IN_TOKEN_TEXT') finalizeTokenText();
            else if (state === 'IN_CLASSIFICATION_POSSIBLE_RESPONSES') finalizePossibleResponse();
            else if (state === 'IN_MATCHDS_STIMULUSLIST') finalizeMatchDSStimulus();
            else if (state === 'IN_MATCHDS_POSSIBLERESPONSES') finalizeMatchDSResponse();
            else if (state === 'IN_PASSAGE') finalizePassage();
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Handle States
            if (trimmedLine.startsWith(':::')) {
                // Track nested blocks inside content (stem, solution, hint, option)
                const isContentState = ['IN_STEM', 'IN_SOLUTION', 'IN_HINT', 'IN_OPTION', 'IN_SECONDARY_OPTION', 'IN_PASSAGE'].includes(state);
                const isNestedBlockStart = trimmedLine.startsWith('::: columns');
                const isNestedBlockEnd = trimmedLine === ':::' && nestedBlockDepth > 0;

                if (isContentState && isNestedBlockStart) {
                    // Starting a nested block inside content - don't finalize, just track depth
                    nestedBlockDepth++;
                    // Add this line to content as it will be parsed by parseSlideContent
                } else if (isNestedBlockEnd) {
                    // Ending a nested block - decrement depth and add to content
                    nestedBlockDepth--;
                } else if (trimmedLine !== '::: option' && trimmedLine !== ':::') {
                    finalizeCurrentBlock();
                    nestedBlockDepth = 0; // Reset on major block change
                }

                if (trimmedLine === '::: question') { state = 'IN_QUESTION'; continue; }
                if (trimmedLine === '::: stem') { state = 'IN_STEM'; nestedBlockDepth = 0; continue; }
                if (trimmedLine === '::: passage') { state = 'IN_PASSAGE'; nestedBlockDepth = 0; continue; }
                if (trimmedLine === '::: solution') { state = 'IN_SOLUTION'; nestedBlockDepth = 0; continue; }
                if (trimmedLine === '::: hint') { state = 'IN_HINT'; nestedBlockDepth = 0; continue; }
                if (trimmedLine === '::: mcq-config') { state = 'IN_MCQ_CONFIG'; continue; }
                if (trimmedLine === '::: options') { state = 'IN_OPTIONS'; continue; }
                if (trimmedLine === '::: matrix-config') { state = 'IN_MATRIX_CONFIG'; continue; }
                if (trimmedLine === '::: secondary-options') { state = 'IN_SECONDARY_OPTIONS'; continue; }
                if (trimmedLine === '::: matrix-mapping') { state = 'IN_MATRIX_MAPPING'; continue; }

                // New Types
                if (trimmedLine === '::: fitg-config') { state = 'IN_FITG_CONFIG'; continue; }
                if (trimmedLine === '::: fitg-texts') { state = 'IN_FITG_TEXTS'; continue; }
                if (trimmedLine === '::: classification-config') { state = 'IN_CLASSIFICATION_CONFIG'; continue; }
                if (trimmedLine === '::: classification-columns') { state = 'IN_CLASSIFICATION_COLUMNS'; continue; }
                if (trimmedLine === '::: classification-rows') { state = 'IN_CLASSIFICATION_ROWS'; continue; }
                if (trimmedLine === '::: classification-column-names') { state = 'IN_CLASSIFICATION_COLUMN_NAMES'; continue; }
                if (trimmedLine === '::: classification-row-names') { state = 'IN_CLASSIFICATION_ROW_NAMES'; continue; }
                if (trimmedLine === '::: classification-matrix-cells') { state = 'IN_CLASSIFICATION_MATRIX_CELLS'; continue; }
                if (trimmedLine === '::: classification-mapping') { state = 'IN_CLASSIFICATION_MAPPING'; continue; }
                if (trimmedLine === '::: classification-possible-responses') { state = 'IN_CLASSIFICATION_POSSIBLE_RESPONSES'; continue; }
                if (trimmedLine === '::: classification-possible-response-ids') { state = 'IN_CLASSIFICATION_POSSIBLE_RESPONSE_IDS'; continue; }
                if (trimmedLine === '::: classification-correct-answers') { state = 'IN_CLASSIFICATION_CORRECT_ANSWERS'; continue; }
                if (trimmedLine === '::: matchds-stimuluslist') { state = 'IN_MATCHDS_STIMULUSLIST'; continue; }
                if (trimmedLine === '::: matchds-possibleresponses') { state = 'IN_MATCHDS_POSSIBLERESPONSES'; continue; }
                if (trimmedLine === '::: token-config') { state = 'IN_TOKEN_CONFIG'; continue; }
                if (trimmedLine === '::: token-text') { state = 'IN_TOKEN_TEXT'; continue; }
                if (trimmedLine === '::: token-answers') { state = 'IN_TOKEN_ANSWERS'; continue; }

                // DND
                if (trimmedLine === '::: dnd-config') { state = 'IN_DND_CONFIG'; continue; }
                if (trimmedLine === '::: dnd-objects') { state = 'IN_DND_DROP_OBJECTS'; continue; }
                if (trimmedLine === '::: dnd-zones') { state = 'IN_DND_ZONES'; continue; }
                if (trimmedLine === '::: dnd-mapping') { state = 'IN_DND_MAPPING'; continue; }

                if (trimmedLine === ':::' && nestedBlockDepth === 0) {
                    finalizeCurrentBlock();
                    if (state === 'IN_OPTION') state = 'IN_OPTIONS'; // Go back to options list
                    else if (state === 'IN_SECONDARY_OPTION') state = 'IN_SECONDARY_OPTIONS';
                    else state = 'ROOT';
                    continue;
                }

                // If we're in a content state and this is part of nested content, continue to add it
                if (isContentState && (isNestedBlockStart || isNestedBlockEnd)) {
                    // Don't continue - let it fall through to content handling
                } else if (trimmedLine === ':::') {
                    // This is a bare ::: inside nested content, just add to content
                } else if (trimmedLine.startsWith('::: option')) {
                    // Let ::: option fall through to the sub-state handling below
                } else {
                    continue;
                }
            }

            // Sub-states
            if (trimmedLine.startsWith('::: option')) {
                if (state === 'IN_OPTION' || state === 'IN_SECONDARY_OPTION') finalizeOption();
                if (state === 'IN_SECONDARY_OPTIONS' || state === 'IN_SECONDARY_OPTION') {
                    state = 'IN_SECONDARY_OPTION';
                } else {
                    state = 'IN_OPTION';
                }
                if (trimmedLine.includes('[correct]')) currentOptionIsCorrect = true;
                const idMatch = trimmedLine.match(/id=([\w-]+)/);
                if (idMatch) currentOptionId = idMatch[1];
                const internalIdMatch = trimmedLine.match(/\[_id=([\w-]+)\]/);
                if (internalIdMatch) currentOptionInternalId = internalIdMatch[1];
                continue;
            }

            // Content Handling
            if (state === 'IN_QUESTION') {
                const parts = line.split(':');
                const key = parts[0]?.trim();
                const value = parts.slice(1).join(':').trim();

                if (key && value) {
                    if (key === 'ID') {
                        // Support numeric or string IDs
                        question.id = isNaN(Number(value)) ? value : Number(value) as any;
                        question.questionId = "";
                    }
                    if (key === 'QuestionID') question.questionId = value;
                    if (key === 'Type') {
                        // Preserve case for MCQ, normalize others
                        const normalized = value.toUpperCase() === 'MCQ' ? 'MCQ' : value.toLowerCase().replace(/\s+/g, '_');
                        question.selectedQuestionType = normalized as QuestionType;
                    }
                    if (key === 'MCQ Type' && question.mcqQuestion) question.mcqQuestion.selectedMcqType = value.toLowerCase() as any;

                    // New Metadata
                    if (key === 'Tags') {
                        question.tags = value.split(',').map((t, idx) => {
                            let tagText = t.trim();
                            let tagId = `tag_${idx + 1}`;
                            const idMatch = tagText.match(/^\[id=([^\]]+)\]\s*(.*)/);
                            if (idMatch) {
                                tagId = idMatch[1];
                                tagText = idMatch[2];
                            }
                            return { id: tagId, tag: tagText };
                        });
                    }
                    if (key === 'Difficulty Level') question.difficultyLevelMetric = parseFloat(value);
                    if (key === 'Discrimination Level') question.discriminationLevel = parseFloat(value);
                }
            } else if (state === 'IN_STEM') {
                currentStemContent.push(line);
            } else if (state === 'IN_SOLUTION') {
                currentSolutionContent.push(line);
            } else if (state === 'IN_HINT') {
                currentHintContent.push(line);
            } else if (state === 'IN_PASSAGE') {
                currentPassageContent.push(line);
            } else if (state === 'IN_MCQ_CONFIG') {
                const [key, value] = line.split(':').map(s => s.trim());
                if (key === 'Orientation' && question.mcqQuestion) question.mcqQuestion.optionOrientation = value.toLowerCase() as any;
                if (key === 'Type' && question.mcqQuestion) question.mcqQuestion.selectedMcqType = value.toLowerCase() as any;
            } else if (state === 'IN_OPTION' || state === 'IN_SECONDARY_OPTION') {
                currentOptionContent.push(line);
            } else if (state === 'IN_MATRIX_CONFIG') {
                const [key, value] = line.split(':').map(s => s.trim());
                if (key === 'Multiple Response' && question.mcqQuestion) {
                    if (!question.mcqQuestion.matrix) {
                        question.mcqQuestion.matrix = {
                            secondaryOptions: [],
                            isMultipleResponse: false,
                            optionMapping: []
                        };
                    }
                    question.mcqQuestion.matrix.isMultipleResponse = value.toLowerCase() === 'true';
                }
            } else if (state === 'IN_MATRIX_MAPPING') {
                if (question.mcqQuestion && !question.mcqQuestion.matrix) {
                    question.mcqQuestion.matrix = {
                        secondaryOptions: [],
                        isMultipleResponse: false,
                        optionMapping: []
                    };
                }
                if (question.mcqQuestion?.matrix) {
                    const [key, valStr] = line.split(':').map(s => s.trim());
                    if (key && valStr) {
                        const values = valStr.split(',').map(s => s.trim());
                        question.mcqQuestion.matrix.optionMapping.push({ [key]: values });
                    }
                }
            }

            // FITG
            else if (state === 'IN_FITG_CONFIG') {
                if (!question.fitgQuestion) question.fitgQuestion = { selectFitgqType: 'default', selectDnDPosition: 'vertical', dropableTexts: [] };
                const [key, value] = line.split(':').map(s => s.trim());
                if (key === 'Type') question.fitgQuestion.selectFitgqType = value;
                if (key === 'Position') question.fitgQuestion.selectDnDPosition = value;
            }
            else if (state === 'IN_FITG_TEXTS') {
                if (!question.fitgQuestion) question.fitgQuestion = { selectFitgqType: 'default', selectDnDPosition: 'vertical', dropableTexts: [] };
                if (trimmedLine.startsWith('- ')) {
                    question.fitgQuestion.dropableTexts.push({ text: trimmedLine.substring(2).trim() });
                }
            }

            // Classification
            else if (state === 'IN_CLASSIFICATION_CONFIG') {
                if (!question.classificationQuestion) question.classificationQuestion = { columnCount: 0, rowCount: 0, columnNames: [], rowNames: [], matrixCells: [], possibleResponses: [], correctAnswers: [], duplicateResponses: false, selectedClassificationType: 'default', matchDS: { stimulusList: [], possibleResponses: [], optionMapping: {}, duplicateResponses: false } };
                const [key, value] = line.split(':').map(s => s.trim());
                if (key === 'Type') question.classificationQuestion.selectedClassificationType = value;
                if (key === 'Duplicate Responses') question.classificationQuestion.duplicateResponses = value.toLowerCase() === 'true';
            }
            else if (state === 'IN_CLASSIFICATION_COLUMNS') {
                // This block populates matchDS.possibleResponses
                if (!question.classificationQuestion) continue;
                if (trimmedLine.startsWith('- ')) {
                    const val = trimmedLine.substring(2).trim();
                    if (question.classificationQuestion.matchDS) {
                        const root: LexicalRoot = { type: 'root', version: 1, children: [] };
                        this.parseSlideContent(val, root.children, true);
                        question.classificationQuestion.matchDS.possibleResponses.push({
                            _id: (question.classificationQuestion.matchDS.possibleResponses.length + 1).toString(),
                            option: JSON.stringify({ root })
                        });
                    }
                    if (question.classificationQuestion.matchDS) {
                        question.classificationQuestion.columnCount = question.classificationQuestion.matchDS.possibleResponses.length;
                    }
                }
            }
            else if (state === 'IN_CLASSIFICATION_COLUMN_NAMES') {
                if (!question.classificationQuestion) continue;
                if (trimmedLine.startsWith('- ')) {
                    let val = trimmedLine.substring(2).trim();
                    // Extract custom ID from [id=xxx] prefix
                    let customId: string | null = null;
                    const idMatch = val.match(/^\[id=([^\]]+)\]\s*(.*)/);
                    if (idMatch) {
                        customId = idMatch[1];
                        val = idMatch[2];
                    }
                    question.classificationQuestion.columnNames.push({
                        id: customId || `col-${question.classificationQuestion.columnNames.length}`,
                        name: val
                    } as any);
                    question.classificationQuestion.columnCount = question.classificationQuestion.columnNames.length;
                }
            }
            else if (state === 'IN_CLASSIFICATION_ROW_NAMES') {
                if (!question.classificationQuestion) continue;
                if (trimmedLine.startsWith('- ')) {
                    let val = trimmedLine.substring(2).trim();
                    // Extract custom ID from [id=xxx] prefix
                    let customId: string | null = null;
                    const idMatch = val.match(/^\[id=([^\]]+)\]\s*(.*)/);
                    if (idMatch) {
                        customId = idMatch[1];
                        val = idMatch[2];
                    }
                    question.classificationQuestion.rowNames.push({
                        id: customId || `row-${question.classificationQuestion.rowNames.length}`,
                        name: val
                    } as any);
                    question.classificationQuestion.rowCount = question.classificationQuestion.rowNames.length;
                }
            }
            else if (state === 'IN_CLASSIFICATION_ROWS') {
                // This block populates matchDS.stimulusList
                if (!question.classificationQuestion) continue;
                if (trimmedLine.startsWith('- ')) {
                    const val = trimmedLine.substring(2).trim();
                    if (question.classificationQuestion.matchDS) {
                        const root: LexicalRoot = { type: 'root', version: 1, children: [] };
                        this.parseSlideContent(val, root.children, true);
                        question.classificationQuestion.matchDS.stimulusList.push({
                            _id: (question.classificationQuestion.matchDS.stimulusList.length + 1).toString(),
                            option: JSON.stringify({ root })
                        });
                    }
                }
            }
            else if (state === 'IN_CLASSIFICATION_MATRIX_CELLS') {
                if (!question.classificationQuestion) continue;
                // Syntax: rowIndex, colIndex, content
                const [r, c, ...contentParts] = line.split(',').map(s => s.trim());
                if (r && c) {
                    const rowIndex = parseInt(r);
                    const colIndex = parseInt(c);
                    const content = contentParts.join(',').trim(); // Join back in case content had commas
                    question.classificationQuestion.matrixCells.push({
                        id: `cell-${rowIndex}-${colIndex}`,
                        rowIndex,
                        columnIndex: colIndex,
                        content
                    });
                }
            }
            else if (state === 'IN_CLASSIFICATION_MAPPING') {
                if (!question.classificationQuestion) continue;
                const [key, valStr] = line.split(':').map(s => s.trim());
                if (key && valStr && question.classificationQuestion.matchDS) {
                    const rowId = question.classificationQuestion.matchDS.stimulusList[parseInt(key) - 1]?._id;
                    const colIndices = valStr.split(',').map(s => s.trim()).map(i => parseInt(i) - 1);
                    const colIds = colIndices.map(i => question.classificationQuestion?.matchDS?.possibleResponses[i]?._id).filter(Boolean);

                    if (rowId && colIds.length) {
                        // For single mapping, just take the first one as a string per user JSON example
                        question.classificationQuestion.matchDS.optionMapping[rowId] = colIds[0];
                    }
                }
            }

            // Token Highlight
            else if (state === 'IN_TOKEN_CONFIG') {
                if (!question.tokenHighlight) question.tokenHighlight = { templateText: { value: "", json: "" }, tokenType: "word", answers: [] };
                const [key, value] = line.split(':').map(s => s.trim());
                if (key === 'Token Type') question.tokenHighlight.tokenType = value;
            }
            else if (state === 'IN_CLASSIFICATION_POSSIBLE_RESPONSES') {
                if (!question.classificationQuestion) continue;
                if (trimmedLine.startsWith('- ')) {
                    // Finalize previous response if exists
                    finalizePossibleResponse();

                    let text = trimmedLine.substring(2).trim();
                    // Check for inline ID specification: [id=xxx]
                    currentPossibleResponseId = '';
                    const idMatch = text.match(/^\[id=([^\]]+)\]\s*/);
                    if (idMatch) {
                        currentPossibleResponseId = idMatch[1];
                        text = text.substring(idMatch[0].length).trim();
                    }
                    if (text) {
                        currentPossibleResponseContent.push(text);
                    }
                } else if (trimmedLine !== '') {
                    // Continuation of previous response
                    if (currentPossibleResponseContent) {
                        currentPossibleResponseContent.push(line); // Use raw line to preserve indentation/latex
                    }
                }
            }
            else if (state === 'IN_CLASSIFICATION_POSSIBLE_RESPONSE_IDS') {
                if (!question.classificationQuestion) continue;
                if (trimmedLine.startsWith('- ')) {
                    const responseId = trimmedLine.substring(2).trim();
                    const index = question.classificationQuestion.possibleResponses.length; // Will apply to next response
                    // Store IDs to apply to existing responses
                    const idx = question.classificationQuestion.possibleResponses.findIndex(
                        (_, i) => i === question.classificationQuestion!.possibleResponses.filter((_, j) => j < i).length
                    );
                    // Apply to corresponding response if exists
                    const targetIdx = (question.classificationQuestion as any)._responseIdQueue?.length || 0;
                    if (!((question.classificationQuestion as any)._responseIdQueue)) {
                        (question.classificationQuestion as any)._responseIdQueue = [];
                    }
                    (question.classificationQuestion as any)._responseIdQueue.push(responseId);
                }
            }
            else if (state === 'IN_CLASSIFICATION_CORRECT_ANSWERS') {
                if (!question.classificationQuestion) continue;
                // Syntax: rowIndex, columnIndex, responseId
                const [r, c, ...respParts] = line.split(',').map(s => s.trim());
                const responseId = respParts.join(',').trim();
                if (r && c && responseId) {
                    const rowIndex = parseInt(r);
                    const colIndex = parseInt(c);
                    question.classificationQuestion.correctAnswers.push({
                        id: `placement-${Date.now()}-${Math.random()}`,
                        rowIndex,
                        columnIndex: colIndex,
                        responseId
                    });
                }
            }
            else if (state === 'IN_MATCHDS_STIMULUSLIST') {
                if (!question.classificationQuestion?.matchDS) continue;
                if (trimmedLine.startsWith('-')) {
                    // Finalize previous item before starting new one
                    finalizeMatchDSStimulus();

                    let text = trimmedLine.substring(1).trim();

                    // Extract [id=...]
                    const idMatch = text.match(/\[id=([^\]]+)\]/);
                    if (idMatch) {
                        currentMatchDSStimulusId = idMatch[1];
                        text = text.replace(idMatch[0], '').trim();
                    }

                    // Extract [_id=...]
                    const internalIdMatch = text.match(/\[_id=([^\]]+)\]/);
                    if (internalIdMatch) {
                        currentMatchDSStimulusInternalId = internalIdMatch[1];
                        text = text.replace(internalIdMatch[0], '').trim();
                    }

                    // Start accumulating content for this item
                    currentMatchDSStimulusContent = [text];
                } else if (trimmedLine.startsWith('|') || trimmedLine.startsWith(':::latex')) {
                    // Table row or latex block - append to current item
                    currentMatchDSStimulusContent.push(line);
                } else if (trimmedLine !== '') {
                    // Other non-empty content - append to current item
                    currentMatchDSStimulusContent.push(line);
                }
            }
            else if (state === 'IN_MATCHDS_POSSIBLERESPONSES') {
                if (!question.classificationQuestion?.matchDS) continue;
                if (trimmedLine.startsWith('-')) {
                    // Finalize previous item before starting new one
                    finalizeMatchDSResponse();

                    let text = trimmedLine.substring(1).trim();

                    // Extract [id=...]
                    const idMatch = text.match(/\[id=([^\]]+)\]/);
                    if (idMatch) {
                        currentMatchDSResponseId = idMatch[1];
                        text = text.replace(idMatch[0], '').trim();
                    }

                    // Extract [_id=...]
                    const internalIdMatch = text.match(/\[_id=([^\]]+)\]/);
                    if (internalIdMatch) {
                        currentMatchDSResponseInternalId = internalIdMatch[1];
                        text = text.replace(internalIdMatch[0], '').trim();
                    }

                    // Start accumulating content for this item
                    currentMatchDSResponseContent = [text];
                } else if (trimmedLine.startsWith('|') || trimmedLine.startsWith(':::latex')) {
                    // Table row or latex block - append to current item
                    currentMatchDSResponseContent.push(line);
                } else if (trimmedLine !== '') {
                    // Other non-empty content - append to current item
                    currentMatchDSResponseContent.push(line);
                }
            }
            else if (state === 'IN_TOKEN_TEXT') {
                currentSubContent.push(line);
            }
            else if (state === 'IN_TOKEN_ANSWERS') {
                if (!question.tokenHighlight) question.tokenHighlight = { templateText: { value: "", json: "" }, tokenType: "word", answers: [] };
                // Expect 0, 2, 5, 8 or similar comma separated
                const parts = line.split(',').map(s => s.trim()).filter(Boolean);
                parts.forEach(p => {
                    const val = parseInt(p);
                    if (!isNaN(val)) question.tokenHighlight?.answers.push(val);
                });
            }

            // DND
            else if (state === 'IN_DND_CONFIG') {
                if (!question.dndQuestion) question.dndQuestion = { questionImage: null, dropableZones: [], selObjType: 'text', dropObjects: [], assignDropableZones: [], positionDropableObjects: [] };
                const [key, value] = line.split(':').map(s => s.trim());
                if (key === 'Object Type') question.dndQuestion.selObjType = value;
            }
            else if (state === 'IN_DND_DROP_OBJECTS') {
                if (!question.dndQuestion) question.dndQuestion = { questionImage: null, dropableZones: [], selObjType: 'text', dropObjects: [], assignDropableZones: [], positionDropableObjects: [] };
                if (trimmedLine.startsWith('- ')) {
                    const text = trimmedLine.substring(2).trim();
                    question.dndQuestion.dropObjects.push({ id: uuidv4(), option: text, _id: (question.dndQuestion.dropObjects.length + 1).toString() });
                }
            }
            else if (state === 'IN_DND_ZONES') {
                if (!question.dndQuestion) question.dndQuestion = { questionImage: null, dropableZones: [], selObjType: 'text', dropObjects: [], assignDropableZones: [], positionDropableObjects: [] };
                if (trimmedLine.startsWith('- ')) {
                    const text = trimmedLine.substring(2).trim();
                    question.dndQuestion.dropableZones.push({ id: uuidv4(), option: text, _id: (question.dndQuestion.dropableZones.length + 1).toString() });
                }
            }
            else if (state === 'IN_DND_MAPPING') {
                if (!question.dndQuestion) continue;
                const [key, valStr] = line.split(':').map(s => s.trim());
                if (key && valStr && question.dndQuestion) {
                    const zoneId = question.dndQuestion.dropableZones[parseInt(key) - 1]?._id;
                    const objIndices = valStr.split(',').map(s => s.trim()).map(i => parseInt(i) - 1);
                    const objIds = objIndices.map(i => question.dndQuestion?.dropObjects[i]?._id).filter(Boolean);

                    if (zoneId && objIds.length) {
                        question.dndQuestion.assignDropableZones.push({ dropZoneId: zoneId, dropObjects: objIds });
                    }
                }
            }
        }

        const applyAutomaticMAMCQDetection = () => {
            if (!question.mcqQuestion || !Array.isArray(question.mcqQuestion.options)) return;

            const currentType = (question.mcqQuestion.selectedMcqType || '').toLowerCase();
            if (currentType !== 'default') return;

            // Explicit rule: only options marked [correct] become isCorrectAnswer=true.
            const explicitCorrectCount = question.mcqQuestion.options.reduce(
                (count, option) => count + (option?.isCorrectAnswer === true ? 1 : 0),
                0
            );

            if (explicitCorrectCount > 1) {
                question.mcqQuestion.selectedMcqType = 'mamcq' as any;
            }
        };

        applyAutomaticMAMCQDetection();

        return question;
    }

    // --- Rich Text Parsing Methods (Copied & Adapted) ---

    private parseSlideContent(content: string, children: LexicalNode[], isMCQBlock: boolean = false) {
        const lines = content.split('\n');
        let currentColumnContainer: any = null;
        let currentColumnIndex = -1;
        let state: 'NORMAL' | 'IN_COLUMN_CONTAINER' | 'IN_LATEX' = 'NORMAL';
        let multiLineContent: string[] = [];
        let latexMetadata: { image?: string; width?: number; height?: number } = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            if (state === 'IN_LATEX') {
                if (trimmedLine === '```') {
                    // Create latex node with stored metadata
                    const targetChildren = currentColumnContainer && currentColumnIndex > -1 && currentColumnContainer.children[currentColumnIndex]
                        ? currentColumnContainer.children[currentColumnIndex].children
                        : children;

                    const latexNode: any = {
                        type: 'latex',
                        version: 1,
                        code: multiLineContent.join('\n'),
                        image: latexMetadata.image || null,
                        width: latexMetadata.width || 100,
                        height: latexMetadata.height || 50
                    };

                    targetChildren.push({
                        type: 'paragraph',
                        version: 1,
                        children: [
                            latexNode,
                            { type: 'text', version: 1, text: ' ', detail: 0, format: 0, mode: 'normal', style: '' }
                        ],
                        format: '',
                        indent: 0,
                        direction: null,
                        textFormat: 0,
                        textStyle: ''
                    } as any);

                    multiLineContent = [];
                    latexMetadata = {};
                    state = currentColumnContainer ? 'IN_COLUMN_CONTAINER' : 'NORMAL';
                } else {
                    multiLineContent.push(line);
                }
                continue;
            }

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
                const match = trimmedLine.match(/::: columns \[(.*?)\](?: \((.*?)\))?/);
                const widths: string[] = match ? match[1].split(',').map(s => s.trim()) : [];
                const alignments: string[] = match && match[2] ? match[2].split(',').map(s => s.trim()) : [];

                const columnsNode = {
                    type: 'columns' as const,
                    version: 1 as const,
                    columns: widths.length || 2,
                    columnWidths: widths.length > 0 ? widths.map(w => w.includes('%') || w.endsWith('fr') ? w : `${w}%`) : ['50%', '50%'],
                    children: widths.map((_, index) => ({
                        type: 'column' as const,
                        version: 1 as const,
                        children: [],
                        columnIndex: index,
                        verticalAlign: (alignments[index] as any) || 'top'
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
                // Parse metadata from fence: ```latex[image="url",width=X,height=Y]
                const metaMatch = trimmedLine.match(/```latex\[image="([^"]*)",\s*width=(\d+),\s*height=(\d+)\]/);
                if (metaMatch) {
                    latexMetadata = {
                        image: metaMatch[1],
                        width: parseInt(metaMatch[2]),
                        height: parseInt(metaMatch[3])
                    };
                } else {
                    latexMetadata = {};
                }
                continue;
            }

            if (trimmedLine === '') continue;

            const targetChildren = currentColumnContainer && currentColumnIndex > -1 && currentColumnContainer.children[currentColumnIndex]
                ? currentColumnContainer.children[currentColumnIndex].children
                : children;

            if (trimmedLine.startsWith('|')) {
                const tableLines = [line];
                let j = i + 1;
                while (j < lines.length && lines[j].trim().startsWith('|')) {
                    tableLines.push(lines[j]);
                    j++;
                }
                i = j - 1;
                targetChildren.push(this.parseTable(tableLines));
            } else if (trimmedLine.match(/^(\*|-|\d+\.)(\s|$)/)) {
                this.parseListItem(trimmedLine, targetChildren);
            } else if (trimmedLine.startsWith('#')) {
                const [level, ...textParts] = trimmedLine.split(' ');
                const text = textParts.join(' ');
                const tag = `h${level.length}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
                targetChildren.push(this.createHeading(text, tag));
            } else if (trimmedLine === '::latex::') {
                // Create a paragraph with a latex node and trailing space
                targetChildren.push({
                    type: 'paragraph',
                    version: 1,
                    children: [
                        { type: 'latex', version: 1, code: '', image: null, width: 100, height: 50 },
                        { type: 'text', version: 1, text: ' ', detail: 0, format: 0, mode: 'normal', style: '' }
                    ],
                    format: '',
                    indent: 0,
                    direction: null,
                    textFormat: 0,
                    textStyle: ''
                } as any);
            } else {
                // Calculate textFormat based on content
                const inlineNodes = this.parseInlineText(trimmedLine, isMCQBlock);
                let textFormat = 0;
                if (inlineNodes.length > 0 && inlineNodes[0].type === 'text' && (inlineNodes[0] as any).format === 1) {
                    textFormat = 1; // Bold
                }
                targetChildren.push({
                    type: 'paragraph',
                    version: 1,
                    children: inlineNodes,
                    format: '',
                    indent: 0,
                    direction: null,
                    textFormat,
                    textStyle: ''
                } as any);
            }
        }
    }

    private createHeading(text: string, tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'): LexicalHeading {
        return {
            type: 'heading',
            tag: tag,
            version: 1,
            children: [{ type: 'text', version: 1, text: text, detail: 0, format: 0, mode: 'normal', style: '' }],
            direction: 'ltr',
            format: '',
            indent: 0
        };
    }

    private parseInlineText(text: string, isMCQBlock: boolean = false): LexicalNode[] {
        const nodes: LexicalNode[] = [];
        // Extended regex: linebreaks, fitg blocks, bold+italic, bold, italic, images with optional attributes, block equations, inline equations, latex blocks
        const regex = /(<br>)|(::fitg\[answer="([^"]*)",\s*width=(\d+)\]::)|(::latex\[code="([^"]*)",\s*image="([^"]*)",\s*width=(\d+),\s*height=(\d+)\]::|::latex\[code="(.+?(?<!\\))",image="([^"]*)",width=(\d+),height=(\d+)\]::)|(\*\*\*.*?\*\*\*)|(\*\*.*?\*\*)|(\*.*?\*)|(\!\[([^\]]*)\]\(([^)]*)\)(\{[^}]*\})?)|(\$\$[\s\S]*?\$\$)|(\$[^$]*?\$)/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const [fullMatch, linebreak, fitgBlock, fitgAnswer, fitgWidth, latexBlock1, latexCode1, latexImage1, latexWidth1, latexHeight1, latexCode2, latexImage2, latexWidth2, latexHeight2, boldItalic, bold, italic, image, alt, src, imageAttrs, blockEq, inlineEq] = match;
            const leadText = text.substring(lastIndex, match.index);
            if (leadText) {
                nodes.push({ type: 'text', version: 1, text: leadText, detail: 0, format: 0, mode: 'normal', style: '' });
            }

            if (linebreak) {
                nodes.push({ type: 'linebreak', version: 1 });
            } else if (fitgBlock) {
                // FITG inline block
                nodes.push({
                    type: 'fitg',
                    version: 1,
                    answer: fitgAnswer || '',
                    width: parseInt(fitgWidth) || 100
                } as any);
                nodes.push({ type: 'text', version: 1, text: ' ', detail: 0, format: 0, mode: 'normal', style: '' });
            } else if (latexBlock1 || latexCode2) {
                // Latex block with code and rendered image - handle both pattern variants
                const latexCode = latexCode1 || latexCode2;
                const latexImage = latexImage1 || latexImage2;
                const latexWidth = latexWidth1 || latexWidth2;
                const latexHeight = latexHeight1 || latexHeight2;
                nodes.push({
                    type: 'latex',
                    version: 1,
                    code: latexCode?.replace(/\\n/g, '\n') || '',
                    image: latexImage || null,
                    width: parseInt(latexWidth) || 100,
                    height: parseInt(latexHeight) || 50
                } as any);
                nodes.push({ type: 'text', version: 1, text: ' ', detail: 0, format: 0, mode: 'normal', style: '' });
            } else if (boldItalic) {
                nodes.push({ type: 'text', version: 1, text: boldItalic.slice(3, -3), format: 3, detail: 0, mode: 'normal', style: '' });
            } else if (bold) {
                nodes.push({ type: 'text', version: 1, text: bold.slice(2, -2), format: 1, detail: 0, mode: 'normal', style: '' });
            } else if (italic) {
                nodes.push({ type: 'text', version: 1, text: italic.slice(1, -1), format: 2, detail: 0, mode: 'normal', style: '' });
            } else if (image) {
                // Parse imageAttrs if present: {width=X,height=Y,mediaId=Z}
                let imgWidth = 400;
                let imgHeight = 175;
                let mediaId = '';
                if (imageAttrs) {
                    const widthMatch = imageAttrs.match(/width=(\d+)/);
                    const heightMatch = imageAttrs.match(/height=(\d+)/);
                    const mediaIdMatch = imageAttrs.match(/mediaId=([^,}]+)/);
                    if (widthMatch) imgWidth = parseInt(widthMatch[1]);
                    if (heightMatch) imgHeight = parseInt(heightMatch[1]);
                    if (mediaIdMatch) mediaId = mediaIdMatch[1];
                }
                if (isMCQBlock) {
                    nodes.push({
                        type: 'image',
                        version: 1,
                        imageUrl: src || '',
                        altText: alt || '',
                        mediaId: mediaId,
                        width: imgWidth,
                        height: imgHeight,
                        displayMode: 'inline'
                    } as any);
                } else {
                    nodes.push({
                        type: 'image',
                        version: 1,
                        src: src || '',
                        altText: alt || '',
                        mediaId: mediaId,
                        width: imgWidth,
                        height: imgHeight
                    });
                }
            } else if (blockEq) {
                const content = blockEq.slice(2, -2).trim();
                nodes.push({ type: 'equation', version: 1, equation: content, inline: false });
            } else if (inlineEq) {
                nodes.push({ type: 'equation', version: 1, equation: inlineEq.slice(1, -1), inline: true });
            }
            lastIndex = match.index + fullMatch.length;
        }

        const tailText = text.substring(lastIndex);
        if (tailText) {
            nodes.push({ type: 'text', version: 1, text: tailText, detail: 0, format: 0, mode: 'normal', style: '' });
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

        // Helper to determine header state
        // 0 = Normal, 1 = Row Header, 2 = Col Header, 3 = Both
        // We assume First Row is Row Header (1)
        // We assume First Col is Col Header (2) - Logic inferred from user requirement
        // Actually user JSON:
        // (0,0) "this is a table" -> 3 (Row(1) | Col(2)) -> So Row 0 is Header, Col 0 is Header
        // (0,1) "this is row 1 col 2" -> 1 (Row Header) -> So Row 0 is Header
        // (1,0) "row 2 col 1" -> 2 (Col Header) -> So Col 0 is Header
        // (1,1) -> 0 -> Neither

        const getHeaderState = (rowIndex: number, colIndex: number): number => {
            let state = 0;
            if (rowIndex === 0) state |= 1; // Row Header
            if (colIndex === 0) state |= 2; // Col Header (inferred from user JSON)
            return state;
        };

        const createCell = (text: string, rowIndex: number, colIndex: number): LexicalTableCell => {
            const parts = text.split('<br>');
            const children: LexicalNode[] = [];
            let currentList: LexicalList | null = null;

            parts.forEach(part => {
                const trimmed = part.trim();
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                    if (!currentList) {
                        currentList = {
                            type: 'list',
                            version: 1,
                            listType: 'bullet',
                            tag: 'ul',
                            children: [],
                            start: 1
                        };
                        children.push(currentList);
                    }
                    const listItem: LexicalListItem = {
                        type: 'listitem',
                        version: 1,
                        format: "",
                        indent: 0,
                        value: currentList!.children.length + 1,
                        children: this.parseInlineText(trimmed.substring(2).trim()).map(node => {
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
                            return node;
                        }),
                        direction: 'ltr'
                    };
                    currentList!.children.push(listItem);
                } else {
                    currentList = null;
                    if (trimmed) {
                        children.push({
                            type: 'paragraph',
                            version: 1,
                            children: this.parseInlineText(trimmed)
                        });
                    }
                }
            });

            // If empty children, add empty paragraph
            if (children.length === 0) {
                children.push({ type: 'paragraph', version: 1, children: [] });
            }

            return {
                type: 'tablecell',
                version: 1,
                headerState: getHeaderState(rowIndex, colIndex), // Calc state
                width: 188, // Keep default
                colSpan: 1,
                rowSpan: 1,
                backgroundColor: null,
                children: children
            };
        };

        const headerCells = headerRow.split('|').slice(1, -1).map((cell, colIndex) => createCell(cell.trim(), 0, colIndex));
        const tableRows: LexicalTableRow[] = [
            { type: 'tablerow', version: 1, children: headerCells }
        ];

        for (let r = 0; r < bodyRows.length; r++) {
            const row = bodyRows[r];
            const cells = row.split('|').slice(1, -1).map((cell, colIndex) => createCell(cell.trim(), r + 1, colIndex));
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
        const itemMatch = line.match(/^(\d+\.|\*|-)(\s(.*))?$/);
        if (itemMatch) {
            const text = itemMatch[3] || '';
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
                    return node;
                }),
                direction: 'ltr'
            };
            list.children.push(listItem);
        }
    }
}
