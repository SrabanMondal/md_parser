export interface LexicalBaseNode {
type: string;
version: number;
}
export interface TextNode extends LexicalBaseNode {
type: "text"|"highlight";
text: string;
format?: number;
detail?: number;
mode?: "normal" | "token" | "segmented";
style?: string;
}
export interface LineBreakNode extends LexicalBaseNode {
type: "linebreak";
}
export interface TabNode extends LexicalBaseNode {
type: "tab";
}
export interface LatexNode extends LexicalBaseNode {
type: "latex";
code: string;
image: string | null;
width: number;
height: number;
}
export interface ImageNode extends LexicalBaseNode  {
type: 'image',
imageUrl: string;
altText: string;
mediaId: string;
width: number;
height: number;
displayMode: "inline" | "block";
}
export interface HighlightNode extends TextNode {
type: "highlight";
className: string | null;
}
export interface FitgNode extends LexicalBaseNode {
type: 'fitg',
answer: string,
width: number,
}
export interface EquationNode extends LexicalBaseNode {
type: 'equation',
equation: string,
inline: boolean,
}

export interface ElementNodeBase extends LexicalBaseNode {
children: LexicalNode[];
direction: "ltr" | "rtl" | null;
format: number|string;
indent: number;
textStyle?:string;
textFormat?: number;
}
export interface RootNode extends ElementNodeBase {
type: "root";
}
export interface ParagraphNode extends ElementNodeBase {
type: "paragraph";
}
export interface HeadingNode extends ElementNodeBase {
type: "heading";
tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}
export interface QuoteNode extends ElementNodeBase {
type: "quote";
}
export interface ListNode extends ElementNodeBase {
type: "list";
listType: "bullet" | "number" | "check";
start: number;
}
export interface ListItemNode extends ElementNodeBase {
type: "listitem";
checked?: boolean;
}
export interface CodeNode extends ElementNodeBase {
type: "code";
language?: string;
theme?: string;
}
export interface CodeHighlightNode extends LexicalBaseNode {
type: "codehighlight";
}
export interface LinkNode extends ElementNodeBase {
type: "link";
url: string;
rel?: string;
target?: string;
}
export interface TableNode extends ElementNodeBase {
type: "table";
colWidths: Array<number>;
}
export interface TableRowNode extends ElementNodeBase {
type: "tablerow";
height?: number;
}
export interface TableCellNode extends ElementNodeBase {
type: "tablecell";
headerState: number;
colSpan: number;
rowSpan: number;
backgroundColor?: string;
}
export interface ColumnsNode extends ElementNodeBase {
type: "columns";
columns: number;
columnWidths: Array<string>;
}
export interface ColumnNode extends ElementNodeBase {
type: "column";
columnIndex: number;
verticalAlign: "top" | "center" | "bottom";
}
export type ElementNode =
| RootNode
| ParagraphNode
| HeadingNode
| QuoteNode
| ListNode
| ListItemNode
| TableNode
| TableRowNode
| TableCellNode
| CodeNode
| LinkNode
| ColumnsNode
| ColumnNode

export type LeafNode =
| TextNode
| LineBreakNode
| TabNode
| ImageNode
| LatexNode
| FitgNode
| EquationNode

export type LexicalNode =
| ElementNode
| LeafNode;

//export type LexicalJSON = LexicalJson;
export type LexicalJSON = {
root: RootNode;
}
export interface MCQOption {
id: string;
text: LexicalJSON;
isCorrect: boolean;
}
export interface MCQBlock {
id: string;
type: "mcqBlock";
questionStem: LexicalJSON;
options: MCQOption[];
correctOptionId: string;
alignment?: "vertical"|"horizontal";
feedback: {
general: LexicalJSON;
general_positive?:LexicalJSON
general_negative?:LexicalJSON
specific: Record<string, LexicalJSON>; // {"option-id":LexicalJson (positive feedback)} here, option Id is id of MCQOption type
};
}
export interface RichTextBlock {
id: string;
type: "lexicalRichTextBlock";
content: LexicalJSON;
}
export interface DragDropBlock {
id: string;
type: "dragDropBlock";
description: LexicalJSON;
dragItems: { id: string; text: LexicalJSON }[];
dropAreas: { id: string; text: LexicalJSON; correctItemId: string | string[] }[];
feedback: { correct: LexicalJSON; incorrect: LexicalJSON };
}
export interface SlideshowBlock {
id: string;
type: "slideShowBlock";
description: LexicalJSON;
slides: { id: string; content: LexicalJSON }[];
}
export interface EmbedBlock {
id: string;
embedCode: string;
title:LexicalJSON;
type: "embedBlock";
}
export interface FillInBlankBlock {
id: string;
type: "fillInBlankBlock";
content: LexicalJSON; // lexical json already has fitg node
feedback: {
correct: LexicalJSON;
incorrect: LexicalJSON;
};
}
export type ContentBlock =
| RichTextBlock
| MCQBlock
| DragDropBlock
| EmbedBlock
| SlideshowBlock
| FillInBlankBlock;
export interface Section {
id: string;
order: number;
title: LexicalJSON;
content: ContentBlock[];
}

export type Data = {
sections: Section[]
}