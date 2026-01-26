import fs from 'fs';
import path from 'path';
import { QuestionParser } from '../lib/question-parser';

const samplesDir = path.join(__dirname, '../tests/samples');
const outputDir = path.join(__dirname, '../tests/output');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const files = fs.readdirSync(samplesDir).filter(file => file.endsWith('.md'));

console.log(`Found ${files.length} sample files.`);

files.forEach(file => {
    const filePath = path.join(samplesDir, file);
    const markdown = fs.readFileSync(filePath, 'utf-8');
    const parser = new QuestionParser(markdown);

    try {
        console.log(`Parsing ${file}...`);
        const json = parser.parse();
        const outputPath = path.join(outputDir, file.replace('.md', '.json'));
        fs.writeFileSync(outputPath, JSON.stringify(json, null, 2));
        console.log(`  -> Saved to ${outputPath}`);
    } catch (error) {
        console.error(`  -> Error parsing ${file}:`, error);
    }
});

console.log('Done.');
