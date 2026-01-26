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
} from '../types/schema';

export class MarkdownGenerator {
  private json: CourseJSON;

  constructor(json: CourseJSON) {
    this.json = json;
  }

  public generate(): string {
    return this.json.sections.map(section => this.generateSection(section)).join('\n\n');
  }

  private generateSection(section: Section): string {
    const title = this.generateTitle(section.title.root);
    const metadata = { id: section.id };
    const content = section.content
        .map(block => this.generateBlock(block))
        .filter(block => block.trim() !== '')
        .join('\n\n');
    return `### ${title}\n{{ ${JSON.stringify(metadata)} }}\n\n${content}`;
  }

  private generateTitle(root: LexicalRoot): string {
    const heading = root.children[0] as LexicalHeading;
    const textNode = heading.children[0] as LexicalText;
    return textNode.text;
  }

  private generateBlock(block: ContentBlock): string {
    const { type, title, content: blockContent, ...rest } = block;

    const metadata: { [key: string]: any } = { ...rest };
    delete metadata.title;
    delete metadata.content;

    const cleanMetadata: { [key: string]: any } = {};
    for (const key in metadata) {
        if (Object.prototype.hasOwnProperty.call(metadata, key) && metadata[key] !== undefined) {
            cleanMetadata[key] = metadata[key];
        }
    }

    const metadataString = JSON.stringify({ type, ...cleanMetadata });

    let generatedContent = '';
    if (blockContent && blockContent.root) {
        generatedContent = this.generateRichTextContent(blockContent.root);
    }

    const finalTitle = (typeof title === 'string' && title.trim() !== '' && !title.startsWith('{{') && title !== 'undefined') ? title : 'Untitled Block';

    const cleanContent = generatedContent.replace(/{\"type\":\".*?,\"id\":\".*?\"}/g, '').trim();

    if (cleanContent === '' && finalTitle === 'Untitled Block' && Object.keys(cleanMetadata).length === 0) {
        return '';
    }

    return `#### ${finalTitle}\n${metadataString}\n\n${cleanContent}`;
  }

  private generateRichTextContent(root: LexicalRoot): string {
      return root.children.map(node => this.generateNode(node)).join('\n\n');
  }

  private generateNode(node: LexicalNode, listType?: 'bullet' | 'number'): string {
      switch(node.type) {
          case 'paragraph':
              return (node as LexicalParagraph).children.map((child: LexicalNode) => this.generateNode(child)).join('');
          case 'heading':
              const heading = node as LexicalHeading;
              const headingText = heading.children.map((child: LexicalNode) => this.generateNode(child)).join('');
              const level = parseInt(heading.tag.replace('h', ''));
              return `${'#'.repeat(level)} ${headingText}`;
          case 'text':
              const textNode = node as LexicalText;
              let text = textNode.text;
              if (textNode.format === 1) text = `**${text}**`;
              if (textNode.format === 2) text = `*${text}*`;
              return text;
          case 'image':
              const imgNode = node as LexicalImage;
              return `![${imgNode.altText}](${imgNode.src})`;
          case 'equation':
              return `$${(node as LexicalEquation).equation}$`;
          case 'latex':
              const latexNode = node as LexicalLatex;
              return '```latex\n' + latexNode.code + '\n```';
          case 'column-container':
              const container = node as LexicalColumnContainer;
              const cols = container.columns.map(col => col.children.map((child: LexicalNode) => this.generateNode(child)).join('\n\n')).join('\n=== COL\n');
              return `::: columns [${container.template}]\n${cols}\n:::`;
          case 'columns':
              return this.generateColumnsBlock(node as LexicalColumns);
          case 'list':
              const listNode = node as LexicalList;
              return listNode.children.map((child: LexicalListItem) => this.generateNode(child, listNode.listType)).join('\n');
          case 'listitem':
              const itemNode = node as LexicalListItem;
              const itemText = itemNode.children.map((child: LexicalNode) => this.generateNode(child)).join('');
              if (listType === 'number') {
                  return `${itemNode.value}. ${itemText}`;
              }
              return `* ${itemText}`;
          case 'table':
              const table = node as LexicalTable;
              const rows = table.children.map((child: LexicalTableRow) => this.generateNode(child));
              const header = rows[0];
              const body = rows.slice(1);
              const alignment = `| ${header.split('|').slice(1,-1).map(() => '---').join(' | ')} |`;
              return `${header}\n${alignment}\n${body.join('\n')}`;
          case 'tablerow':
              const row = node as LexicalTableRow;
              const cells = row.children.map((child: LexicalTableCell) => this.generateNode(child)).join(' | ');
              return `| ${cells} |`;
          case 'tablecell':
              const cell = node as LexicalTableCell;
              return cell.children.map((child: LexicalNode) => this.generateNode(child)).join('');
          default:
              return '';
      }
  }

  private generateMcqBlock(block: ContentBlock): string {
    const question = this.generateRichTextContent(block.question.root);
    const options = block.options.map((opt: any) => {
        const marker = opt.isCorrect ? '[x]' : '[ ]';
        const value = this.generateRichTextContent(opt.value.root);
        const feedback = this.generateRichTextContent(opt.feedback.root);
        let optionStr = `* ${marker} ${value}`;
        if (feedback) {
            optionStr += `\n  > ${feedback}`;
        }
        return optionStr;
    }).join('\n');
    return `? ${question}\n\n${options}`;
  }

  private generateSlideShowBlock(block: ContentBlock): string {
    return block.slides.map((slide: any) => {
        const metadata = { id: slide.id };
        const content = this.generateRichTextContent(slide.content.root);
        return `=== SLIDE {{ ${JSON.stringify(metadata)} }}\n${content}`;
    }).join('\n\n');
  }

  private generateDragDropBlock(block: ContentBlock): string {
    const instructions = `**Instructions:** ${this.generateRichTextContent(block.instructions.root)}`;
    const items = `**Items:**\n` + block.items.map((item: any) => `- [${item.id}] ${this.generateRichTextContent(item.value.root)}`).join('\n');
    const zones = `**Zones:**\n` + block.zones.map((zone: any) => `- [${zone.id}] (Correct: ${zone.correctItemId}) -> "${zone.description}"`).join('\n');
    const feedback = `**Feedback:**\n+ Correct: ${this.generateRichTextContent(block.feedback.correct.root)}\n- Incorrect: ${this.generateRichTextContent(block.feedback.incorrect.root)}`;
    return `${instructions}\n\n${items}\n\n${zones}\n\n${feedback}`;
  }

  private generateColumnsBlock(node: LexicalColumns): string {
    const template = node.columnWidths.map(w => w.replace('%', '')).join(', ');
    const cols = node.children.map(col => 
        col.children.map((child: LexicalNode) => this.generateNode(child)).join('\n\n')
    ).join('\n=== COL\n');
    return `::: columns [${template}]\n${cols}\n:::`;
  }
}
