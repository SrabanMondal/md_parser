'use client';

import { useState, useEffect } from 'react';
import { MarkdownParser } from '../lib/parser';
import { QuestionParser } from '../lib/question-parser';
import { MarkdownGenerator } from '../lib/generator';
import { CourseJSON } from '../types/schema';
import { QuestionJSON } from '../types/question-schema';

type Mode = 'COURSE' | 'QUESTION';

export default function Home() {
  const [mode, setMode] = useState<Mode>('COURSE');
  const [markdown, setMarkdown] = useState('');
  const [jsonOutput, setJsonOutput] = useState<CourseJSON | QuestionJSON | null>(null);
  const [jsonInput, setJsonInput] = useState('');

  // Markdown to JSON conversion
  useEffect(() => {
    const handler = setTimeout(() => {
      if (markdown) {
        try {
          let result;
          if (mode === 'COURSE') {
            const parser = new MarkdownParser(markdown);
            result = parser.parse();
          } else {
            const parser = new QuestionParser(markdown);
            result = parser.parse();
          }
          setJsonOutput(result);
          setJsonInput(JSON.stringify(result, null, 2));
        } catch (error) {
          console.error("Parsing error:", error);
          setJsonOutput(null);
        }
      } else {
        setJsonOutput(null);
      }
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [markdown, mode]);

  const handleMarkdownChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMarkdown(event.target.value);
  };

  const handleJsonInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonInput(event.target.value);
  };

  const convertJsonToMarkdown = () => {
    if (mode === 'QUESTION') {
      alert('JSON to Markdown for Questions is not yet supported.');
      return;
    }
    try {
      const parsedJson = JSON.parse(jsonInput) as CourseJSON;
      const generator = new MarkdownGenerator(parsedJson);
      const result = generator.generate();
      setMarkdown(result);
    } catch (error) {
      console.error("Error generating markdown:", error);
      alert('Invalid JSON format!');
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-12 bg-gray-900 text-white">
      <div className="flex justify-between w-full items-center mb-8">
        <h1 className="text-4xl font-bold">Markdown &lt;-&gt; JSON Converter</h1>
        <div className="flex bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setMode('COURSE')}
            className={`px-4 py-2 rounded-md ${mode === 'COURSE' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
          >
            Course Mode
          </button>
          <button
            onClick={() => setMode('QUESTION')}
            className={`px-4 py-2 rounded-md ${mode === 'QUESTION' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
          >
            Question Mode
          </button>
        </div>
      </div>

      <div className="w-full flex-grow grid grid-cols-2 gap-4">
        {/* Markdown Side */}
        <div>
          <h2 className="text-lg font-semibold mb-2">{mode === 'COURSE' ? 'Course' : 'Question'} Markdown Input</h2>
          <textarea
            className="w-full h-[70vh] p-2 border rounded-md bg-gray-800 text-white font-mono"
            value={markdown}
            onChange={handleMarkdownChange}
            placeholder={`Enter your ${mode.toLowerCase()} markdown here...`}
          />
        </div>

        {/* JSON Side */}
        <div>
          <h2 className="text-lg font-semibold mb-2">JSON Input/Output</h2>
          <textarea
            className="w-full h-[70vh] p-2 border rounded-md bg-gray-800 text-white font-mono"
            value={jsonInput}
            onChange={handleJsonInputChange}
            placeholder="JSON will appear here..."
          />
          {mode === 'COURSE' && (
            <button
              onClick={convertJsonToMarkdown}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold"
            >
              Convert JSON to Markdown
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
