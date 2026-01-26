import { LexicalRoot } from './schema';

export type QuestionType = 'mcq' | 'mamcq' | 'fitg' | 'dnd' | 'classification' | 'token_highlight' | 'MCQ' | 'MAMCQ' | 'FITG' | 'DND' | 'CLASSIFICATION' | 'TOKEN_HIGHLIGHT';

export interface QuestionJSON {
    id: string;
    questionId: string;
    selectedQuestionType: QuestionType;
    questionStem: string; // JSON string of LexicalRoot
    mcqQuestion?: McqQuestion;
    fitgQuestion?: FitgQuestion;
    dndQuestion?: DndQuestion;
    classificationQuestion?: ClassificationQuestion;
    tokenHighlight?: TokenHighlight;
    hasStepByStepSolution?: boolean;
    solution?: any;
    hasHint?: boolean;
    hint?: any;
    tags?: { id: string; tag: string }[];
    difficultyLevelMetric?: number;
    discriminationLevel?: number;
    _status: 'draft' | 'published';
    createdAt: string;
    updatedAt: string;
}

export interface McqQuestion {
    optionOrientation: 'vertical' | 'horizontal';
    selectedMcqType: 'default' | 'matrix';
    questionImage?: string | null;
    passage?: string | null;
    options: McqOption[];
    matrix?: McqMatrix;
}

export interface McqOption {
    id: string;
    option: string | { root: LexicalRoot }; // Serialized JSON or Object
    isCorrectAnswer: boolean;
    _id?: string;
}

export interface McqMatrix {
    secondaryOptions: { _id: string; option: string }[];
    isMultipleResponse: boolean;
    optionMapping: { [key: string]: string[] }[];
}

export interface FitgQuestion {
    selectFitgqType: string;
    selectDnDPosition: string;
    dropableTexts: any[];
}

export interface DndQuestion {
    questionImage?: string | null;
    dropableZones: any[];
    selObjType: string;
    dropObjects: any[];
    assignDropableZones: any[];
    positionDropableObjects: any[];
}

export interface ClassificationQuestion {
    selectedClassificationType: string;
    columnCount: number;
    rowCount: number;
    columnNames: { id: string, name: string }[] | string[];
    rowNames: { id: string, name: string }[] | string[];
    matrixCells: any[];
    possibleResponses: any[];
    correctAnswers: any[];
    duplicateResponses: boolean;
    matchDS?: {
        stimulusList: any[];
        possibleResponses: any[];
        optionMapping: any;
        duplicateResponses: boolean;
    };
}

export interface TokenHighlight {
    templateText: {
        value: string;
        json: string;
    };
    tokenType: string;
    answers: any[];
}
