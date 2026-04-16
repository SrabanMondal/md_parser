// Core Lexical Types
export type LexicalRoot = {
    type: "root";
    version: 1;
    children: LexicalNode[];
    direction?: "ltr" | "rtl" | null;
    format?: string;
    indent?: number;
};

export type LexicalNode =
    | LexicalParagraph
    | LexicalText
    | LexicalHighlight
    | LexicalHeading
    | LexicalImage
    | LexicalEquation
    | LexicalColumnContainer
    | LexicalColumns // New type for alternative column structure
    | LexicalList
    | LexicalListItem
    | LexicalTable
    | LexicalTableRow
    | LexicalTableCell
    | LexicalLatex // Custom node for raw latex
    | LexicalFitg
    | LexicalLineBreak;


export interface LexicalParagraph {
    type: 'paragraph';
    version: 1;
    children: LexicalNode[];
    direction?: 'ltr' | 'rtl' | null;
    format?: string;
    indent?: number;
    textFormat?: number;
    textStyle?: string;
}

interface LexicalTextBase {
  version: 1;
  text: string;
  detail?: number;
  format?: number;
  mode?: 'normal' | 'token' | 'segmented';
  style?: string;
}

export interface LexicalText extends LexicalTextBase {
  type: 'text';
}

export interface LexicalHighlight extends LexicalTextBase {
  type: 'highlight';
  className: string;
}

export interface LexicalHeading {
    type: 'heading';
    version: 1;
    tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    children: LexicalNode[];
    direction?: 'ltr' | 'rtl' | null;
    format?: string;
    indent?: number;
}

export interface LexicalImage {
    type: 'image';
    version: 1;
    src: string;
    altText: string;
    width?: number;
    height?: number;
    maxWidth?: number;
    mediaId?: string;
    showCaption?: boolean;
    caption?: LexicalRoot;
}

export interface LexicalEquation {
    type: 'equation';
    version: 1;
    equation: string;
    inline?: boolean;
}

export interface LexicalColumnContainer {
    type: 'column-container';
    version: 1;
    columns: LexicalColumn[];
    template: string;
}

export interface LexicalColumn {
    type: 'column';
    version: 1;
    children: LexicalNode[];
    width?: number;
    columnIndex?: number;
    verticalAlign?: 'top' | 'center' | 'bottom';
}

export interface LexicalColumns {
    type: 'columns';
    version: 1;
    children: LexicalColumn[];
    columns: number;
    columnWidths: string[];
    direction?: 'ltr' | 'rtl' | null;
    format?: string;
    indent?: number;
}

export interface LexicalLatex {
    type: 'latex';
    version: 1;
    code: string;
}

export interface LexicalList {
    type: 'list';
    version: 1;
    listType: 'bullet' | 'number';
    children: LexicalListItem[];
    start?: number;
    tag: 'ul' | 'ol';
}

export interface LexicalListItem {
    type: 'listitem';
    version: 1;
    children: LexicalNode[];
    value: number;
    direction?: 'ltr' | 'rtl' | null;
    format?: string;
    indent?: number;
}

export interface LexicalTable {
    type: 'table';
    version: 1;
    children: LexicalTableRow[];
    grid: {
        rows: number;
        columns: number;
    };
}

export interface LexicalTableRow {
    type: 'tablerow';
    version: 1;
    children: LexicalTableCell[];
}

export interface LexicalTableCell {
    type: 'tablecell';
    version: 1;
    children: LexicalNode[];
    headerState?: number; // Changed to number to match user request (0, 1, 2, 3)
    width?: number;
    colSpan?: number;
    rowSpan?: number;
    backgroundColor?: string | null;
}

export interface LexicalFitg {
    type: 'fitg';
    version: 1;
    answer: string;
    width: number;
}

export interface LexicalLineBreak {
    type: 'linebreak';
    version: 1;
}

// Block Types
export type BlockType =
    | "lexicalRichTextBlock"
    | "slideShowBlock"
    | "mcqBlock"
    | "mamcqBlock"
    | "dragDropBlock"
    | "fillInBlankBlock"; // Fill in the blanks

export interface Section {
    id: string; // UUID
    title: { root: LexicalRoot }; // Title is strictly a lexical root containing one heading
    content: ContentBlock[];
}

export interface ContentBlock {
    id: string; // UUID
    type: BlockType;
    // Dynamic props based on type (see specific mappings below)
    [key: string]: any;
}

export interface CourseJSON {
    sections: Section[];
}
