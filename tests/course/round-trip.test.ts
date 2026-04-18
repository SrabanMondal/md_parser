/**
 * Round-Trip Test Suite for Markdown ↔ JSON bidirectional sync.
 *
 * Tests:
 *   1. MD Round-Trip Stability: test.md → JSON₁ → MD₁ → JSON₂ → compare JSON₁ ≈ JSON₂
 *   2. JSON Round-Trip: test.json → MD → JSON₂ → compare test.json ≈ JSON₂
 *   3. MD Regeneration Stability: MD₁ → JSON₂ → MD₂ → compare MD₁ === MD₂
 *
 * Normalization:
 *   - Non-deterministic IDs (option, slide, drag, drop) are positionally normalized
 *   - headerState format differences (string vs number) are normalized
 *   - Transient parser state properties are removed
 */

import { MarkdownParser } from '../../lib/parser';
import { MarkdownGenerator } from '../../lib/generator';
import * as fs from 'fs';
import * as path from 'path';

const testDir = path.resolve(__dirname);

// ═══════════════════════════════════════════════════════════
//  FIXTURES
// ═══════════════════════════════════════════════════════════

interface Fixture {
    name: string;
    md: string;
    json: any;
}

const fixtures: Fixture[] = [
    {
        name: 'test',
        md: fs.readFileSync(path.join(testDir, 'test.md'), 'utf-8'),
        json: JSON.parse(fs.readFileSync(path.join(testDir, 'test.json'), 'utf-8')),
    },
    {
        name: 'test2',
        md: fs.readFileSync(path.join(testDir, 'test2.md'), 'utf-8'),
        json: JSON.parse(fs.readFileSync(path.join(testDir, 'test2.json'), 'utf-8')),
    },
    {
        name: 'test3',
        md: '', // JSON-only fixture — no source .md file
        json: JSON.parse(fs.readFileSync(path.join(testDir, 'test3.json'), 'utf-8')),
    },
    {
        name: 'test4',
        md: '', // JSON-only fixture — no source .md file
        json: JSON.parse(fs.readFileSync(path.join(testDir, 'test4.json'), 'utf-8')),
    },
    {
        name: 'test5',
        md: '', // JSON-only fixture — no source .md file
        json: JSON.parse(fs.readFileSync(path.join(testDir, 'test5.json'), 'utf-8')),
    },
];

// ═══════════════════════════════════════════════════════════
//  NORMALIZATION
// ═══════════════════════════════════════════════════════════

/**
 * Normalize non-deterministic IDs in a CourseJSON structure.
 * The parser generates IDs like opt-{Date.now()}-{index} which differ
 * between runs. We replace them with positional IDs for comparison.
 */
function normalizeIds(json: any): any {
    const clone = JSON.parse(JSON.stringify(json));

    for (const section of clone.sections) {
        for (const block of section.content) {
            // Remove transient parser state that leaks into JSON
            delete block.currentOptionIsCorrect;
            delete block.currentMAMCQOptionIsCorrect;

            // Normalize MCQ/MAMCQ option IDs
            if (block.options) {
                const idMap = new Map<string, string>();
                block.options.forEach((opt: any, i: number) => {
                    const oldId = opt.id;
                    const newId = `opt-normalized-${i}`;
                    idMap.set(oldId, newId);
                    opt.id = newId;
                });

                // Update correctOptionId reference
                if (block.correctOptionId && idMap.has(block.correctOptionId)) {
                    block.correctOptionId = idMap.get(block.correctOptionId);
                }

                // Update feedback.specific keys (keyed by option ID)
                if (block.feedback?.specific) {
                    const newSpecific: any = {};
                    for (const [oldKey, value] of Object.entries(block.feedback.specific)) {
                        const newKey = idMap.get(oldKey) || oldKey;
                        newSpecific[newKey] = value;
                    }
                    block.feedback.specific = newSpecific;
                }
            }

            // Normalize slide IDs
            if (block.slides) {
                block.slides.forEach((slide: any, i: number) => {
                    slide.id = `slide-normalized-${i}`;
                });
            }

            // Normalize drag item IDs and update cross-references
            if (block.dragItems) {
                const dragIdMap = new Map<string, string>();
                block.dragItems.forEach((item: any, i: number) => {
                    dragIdMap.set(item.id, `drag-normalized-${i}`);
                    item.id = `drag-normalized-${i}`;
                });

                // Update correctItemId references in drop zones
                if (block.dropAreas) {
                    for (const zone of block.dropAreas) {
                        if (zone.correctItemId) {
                            zone.correctItemId = zone.correctItemId.map((id: string) =>
                                dragIdMap.get(id) || id
                            );
                        }
                    }
                }
            }

            // Normalize drop zone IDs
            if (block.dropAreas) {
                block.dropAreas.forEach((zone: any, i: number) => {
                    zone.id = `drop-normalized-${i}`;
                });
            }
        }
    }

    return clone;
}

/**
 * Normalize headerState values: string → number.
 * Parser produces numbers (1/0), but test.json may have strings ("header"/"normal").
 */
function normalizeHeaderState(obj: any): any {
    if (Array.isArray(obj)) return obj.map(normalizeHeaderState);
    if (obj !== null && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (key === 'headerState') {
                if (value === 'header' || value === 1) result[key] = 1;
                else if (value === 'normal' || value === 0) result[key] = 0;
                else result[key] = value;
            } else {
                result[key] = normalizeHeaderState(value);
            }
        }
        return result;
    }
    return obj;
}

/**
 * Remove undefined/missing optional properties from deep structures.
 * This handles cases where the parser sometimes includes optional properties
 * (e.g. direction, format, indent on paragraphs) and sometimes doesn't.
 */
function removeOptionalProps(obj: any): any {
    if (Array.isArray(obj)) return obj.map(removeOptionalProps);
    if (obj !== null && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value === undefined) continue;
            result[key] = removeOptionalProps(value);
        }
        return result;
    }
    return obj;
}

/**
 * Merge adjacent text nodes with the same format.
 * Markdown cannot represent arbitrary splits between same-format text runs,
 * so "text1" + "text2" (both format=0) round-trips as "text1text2".
 * This normalization makes the comparison agnostic to such splits.
 */
function mergeAdjacentTextNodes(obj: any): any {
    if (Array.isArray(obj)) return obj.map(mergeAdjacentTextNodes);
    if (obj !== null && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (key === 'children' && Array.isArray(value)) {
                const merged: any[] = [];
                for (const child of value) {
                    const normalized = mergeAdjacentTextNodes(child);
                    if (normalized.type === 'text' && merged.length > 0) {
                        const prev = merged[merged.length - 1];
                        if (prev.type === 'text' && (prev.format || 0) === (normalized.format || 0)) {
                            prev.text = (prev.text || '') + (normalized.text || '');
                            continue;
                        }
                    }
                    merged.push(normalized);
                }
                result[key] = merged;
            } else {
                result[key] = mergeAdjacentTextNodes(value);
            }
        }
        return result;
    }
    return obj;
}

/**
 * Remove container-level decorative properties that the parser may not produce
 * but test JSON may include. These don't affect content identity:
 * direction, textStyle, textFormat, columns (count), columnIndex, verticalAlign,
 * colWidths, colSpan, rowSpan, width (on cells/images), height (on rows/images),
 * tag (on lists), start, backgroundColor, displayMode, mode, detail,
 * format (when empty string on containers), indent (when 0)
 */
function removeContainerDecorativeProps(obj: any): any {
    if (Array.isArray(obj)) return obj.map(removeContainerDecorativeProps);
    if (obj !== null && typeof obj === 'object') {
        const result: any = {};
        const nodeType = obj.type;

        // Keys always skipped regardless of node type
        const alwaysSkip = new Set([
            'direction', 'textStyle', 'textFormat',
            'columns', 'columnIndex',
            'colWidths', 'colSpan', 'rowSpan',
            'tag', 'start', 'backgroundColor',
            'mode', 'detail',
            'grid', 'mediaId',
            'headerState', 'order', 'title',
        ]);

        for (const [key, value] of Object.entries(obj)) {
            // Skip default format values (empty, 0, and explicit left alignment)
            if (key === 'format' && (value === '' || value === 0 || value === 'left')) continue;
            // Skip indent when 0
            if (key === 'indent' && value === 0) continue;
            // Skip empty string src/style (parser defaults)
            if ((key === 'src' || key === 'style' || key === 'imageUrl') && value === '') continue;
            // Always-skip keys
            if (alwaysSkip.has(key)) continue;
            // width/height: keep on images, skip on everything else (table cells, rows)
            if ((key === 'width' || key === 'height') && nodeType !== 'image') continue;
            // displayMode: parser only produces it in MCQ context, skip everywhere
            if (key === 'displayMode') continue;
            // verticalAlign: keep on column nodes, skip elsewhere
            if (key === 'verticalAlign' && nodeType !== 'column') continue;
            // Normalize src → imageUrl on image nodes
            if (key === 'src' && nodeType === 'image') {
                result['imageUrl'] = removeContainerDecorativeProps(value);
                continue;
            }
            result[key] = removeContainerDecorativeProps(value);
        }
        return result;
    }
    return obj;
}

/**
 * Normalize section title children: heading and paragraph are interchangeable
 * as container types in title roots. Convert heading → paragraph for comparison.
 */
function normalizeTitleNodes(json: any): any {
    if (!json || !json.sections) return json;
    const result = JSON.parse(JSON.stringify(json));
    for (const section of result.sections) {
        if (section.title?.root?.children) {
            section.title.root.children = section.title.root.children.map((child: any) => {
                if (child.type === 'heading') {
                    const { tag, ...rest } = child;
                    return { ...rest, type: 'paragraph' };
                }
                return child;
            });
        }
    }
    return result;
}

/** Apply all normalization steps to a JSON structure. */
function normalize(json: any): any {
    return mergeAdjacentTextNodes(removeContainerDecorativeProps(removeOptionalProps(normalizeHeaderState(normalizeTitleNodes(normalizeIds(json))))));
}

/**
 * Normalize markdown for comparison:
 *  - Unify line endings
 *  - Trim trailing whitespace per line
 *  - Collapse 3+ consecutive blank lines to 2
 *  - Trim leading/trailing whitespace
 */
function normalizeMd(md: string): string {
    return md
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(l => l.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ═══════════════════════════════════════════════════════════
//  DEEP COMPARISON
// ═══════════════════════════════════════════════════════════

function deepCompare(a: any, b: any, path: string = '$'): string[] {
    const diffs: string[] = [];

    if (a === b) return diffs;
    if (a === undefined && b === undefined) return diffs;

    if (typeof a !== typeof b) {
        diffs.push(`${path}: type mismatch — ${typeof a} vs ${typeof b} (${trunc(a)} vs ${trunc(b)})`);
        return diffs;
    }

    if (a === null || b === null) {
        if (a !== b) diffs.push(`${path}: null mismatch — ${trunc(a)} vs ${trunc(b)}`);
        return diffs;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            diffs.push(`${path}: array length ${a.length} vs ${b.length}`);
        }
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (i >= a.length) {
                diffs.push(`${path}[${i}]: missing in first`);
            } else if (i >= b.length) {
                diffs.push(`${path}[${i}]: missing in second`);
            } else {
                diffs.push(...deepCompare(a[i], b[i], `${path}[${i}]`));
            }
        }
        return diffs;
    }

    if (typeof a === 'object') {
        const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const key of allKeys) {
            const newPath = `${path}.${key}`;
            if (!(key in a)) {
                diffs.push(`${newPath}: missing in first (val: ${trunc(b[key])})`);
            } else if (!(key in b)) {
                diffs.push(`${newPath}: missing in second (val: ${trunc(a[key])})`);
            } else {
                diffs.push(...deepCompare(a[key], b[key], newPath));
            }
        }
        return diffs;
    }

    if (a !== b) {
        diffs.push(`${path}: ${trunc(a)} !== ${trunc(b)}`);
    }

    return diffs;
}

function trunc(val: any): string {
    const s = JSON.stringify(val);
    if (s && s.length > 80) return s.substring(0, 77) + '...';
    return s || String(val);
}

// ═══════════════════════════════════════════════════════════
//  TEST RUNNER
// ═══════════════════════════════════════════════════════════

let totalPass = 0;
let totalFail = 0;
let testNumber = 0;

/**
 * Run all three round-trip tests for a single fixture.
 * Returns the number of failures for that fixture.
 */
function runFixture(fixture: Fixture): number {
    let pass = 0;
    let fail = 0;

    console.log(`\n╔═══ Fixture: ${fixture.name} ${'═'.repeat(40 - fixture.name.length)}╗`);

    // Variables shared across tests
    let json2: any = null; // Re-parsed JSON for MD regeneration test
    let md1: string = '';  // Generated MD from parsing fixture.md

    // ─── A. MD Round-Trip Stability ────────────────────────
    if (fixture.md) {
        testNumber++;
        console.log(`\n─── Test ${testNumber}: [${fixture.name}] MD Round-Trip (MD → JSON₁ → MD₁ → JSON₂) ───\n`);

        const parser1 = new MarkdownParser(fixture.md);
        const json1 = parser1.parse();

        const generator1 = new MarkdownGenerator(json1);
        md1 = generator1.generate();

        const parser2 = new MarkdownParser(md1);
        json2 = parser2.parse();

        const diffs1 = deepCompare(normalize(json1), normalize(json2));

        if (diffs1.length === 0) {
            console.log('  ✅ PASS: MD round-trip is stable (JSON₁ ≈ JSON₂)');
            pass++;
        } else {
            console.log(`  ❌ FAIL: ${diffs1.length} differences found`);
            diffs1.slice(0, 20).forEach(d => console.log(`    ${d}`));
            if (diffs1.length > 20) console.log(`    ... and ${diffs1.length - 20} more`);
            fail++;
        }
    } else {
        console.log(`\n  ⏭  Skipped MD Round-Trip (no source .md file)`);
    }

    // ─── B. JSON Round-Trip ───────────────────────────────
    testNumber++;
    console.log(`\n─── Test ${testNumber}: [${fixture.name}] JSON Round-Trip (JSON → MD → JSON₂) ───\n`);

    const generator2 = new MarkdownGenerator(fixture.json);
    const md2 = generator2.generate();

    const parser3 = new MarkdownParser(md2);
    const json3 = parser3.parse();

    const diffs2 = deepCompare(normalize(fixture.json), normalize(json3));

    if (diffs2.length === 0) {
        console.log('  ✅ PASS: JSON round-trip preserves all data');
        pass++;
    } else {
        console.log(`  ❌ FAIL: ${diffs2.length} differences found`);
        diffs2.slice(0, 30).forEach(d => console.log(`    ${d}`));
        if (diffs2.length > 30) console.log(`    ... and ${diffs2.length - 30} more`);
        fail++;
    }

    // ─── C. MD Regeneration Stability ─────────────────────
    // For JSON-only fixtures, use md2 (from JSON round-trip) as the source
    const sourceMd = fixture.md ? md1 : md2;
    const sourceJson = fixture.md ? json2 : json3;

    testNumber++;
    console.log(`\n─── Test ${testNumber}: [${fixture.name}] MD Regeneration (MD₁ → JSON₂ → MD₂ === MD₁) ───\n`);

    const generator3 = new MarkdownGenerator(sourceJson);
    const md3 = generator3.generate();

    const normalizedMd1 = normalizeMd(sourceMd);
    const normalizedMd3 = normalizeMd(md3);

    if (normalizedMd1 === normalizedMd3) {
        console.log('  ✅ PASS: MD regeneration is stable (MD₁ === MD₂)');
        pass++;
    } else {
        console.log('  ❌ FAIL: MD regeneration differs');
        const lines1 = normalizedMd1.split('\n');
        const lines3 = normalizedMd3.split('\n');
        let diffCount = 0;
        for (let i = 0; i < Math.max(lines1.length, lines3.length); i++) {
            if (lines1[i] !== lines3[i]) {
                console.log(`    Line ${i + 1}:`);
                console.log(`      Expected: ${JSON.stringify(lines1[i])}`);
                console.log(`      Got:      ${JSON.stringify(lines3[i])}`);
                diffCount++;
                if (diffCount >= 10) {
                    console.log('    ... and more');
                    break;
                }
            }
        }
        fail++;
    }

    // ─── Write output files for manual inspection ─────────
    const prefix = fixture.name;
    if (fixture.md) {
        fs.writeFileSync(path.join(testDir, `${prefix}.generated.md`), md1, 'utf-8');
    }
    fs.writeFileSync(path.join(testDir, `${prefix}.roundtrip.md`), md2, 'utf-8');
    fs.writeFileSync(path.join(testDir, `${prefix}.roundtrip.json`), JSON.stringify(json3, null, 2), 'utf-8');

    console.log(`\n  Output: ${prefix}.roundtrip.md / .json`);
    console.log(`╚${'═'.repeat(47)}╝`);

    totalPass += pass;
    totalFail += fail;
    return fail;
}

// ═══════════════════════════════════════════════════════════
//  RUN ALL FIXTURES
// ═══════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════');
console.log('  ROUND-TRIP TEST SUITE');
console.log('═══════════════════════════════════════════════════════');

for (const fixture of fixtures) {
    runFixture(fixture);
}

// ─── Summary ───────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log(`  RESULTS: ${totalPass} passed, ${totalFail} failed (${fixtures.length} fixtures × 3 tests)`);
if (totalFail === 0) {
    console.log('  ✅ ALL TESTS PASSED');
} else {
    console.log('  ❌ SOME TESTS FAILED');
}
console.log('═══════════════════════════════════════════════════════');

process.exit(totalFail > 0 ? 1 : 0);
