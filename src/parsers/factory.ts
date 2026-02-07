/**
 * Factory for creating language-specific parsers.
 */

import { Language } from "../models/types.js";
import { Parser } from "./base.js";
import { TypeScriptParser } from "./typescript.parser.js";
import { JavaScriptParser } from "./javascript.parser.js";
import { RubyParser } from "./ruby.parser.js";
import { UnsupportedLanguageError } from "../utils/errors.js";

/**
 * Parser registry.
 */
const PARSERS = new Map<Language, () => Parser>([
  [Language.TYPESCRIPT, () => new TypeScriptParser() as Parser],
  [Language.JAVASCRIPT, () => new JavaScriptParser() as Parser],
  [Language.RUBY, () => new RubyParser() as Parser],
  // Phase 3: Add more languages
  // [Language.PYTHON, () => new PythonParser()],
  // [Language.GO, () => new GoParser()],
]);

/**
 * Create parser for a specific language.
 */
export function createParser(language: Language): Parser {
  const parserFactory = PARSERS.get(language);

  if (!parserFactory) {
    throw new UnsupportedLanguageError(language);
  }

  return parserFactory();
}

/**
 * Create parser from file extension.
 */
export function createParserFromExtension(extension: string): Parser {
  // Try each parser to see if it can handle the extension
  for (const [, parserFactory] of PARSERS) {
    const parser = parserFactory();
    if (parser.canParse(extension)) {
      return parser;
    }
  }

  throw new UnsupportedLanguageError(`Unknown extension: ${extension}`);
}

/**
 * Get all supported languages.
 */
export function getSupportedLanguages(): Language[] {
  return Array.from(PARSERS.keys());
}

/**
 * Check if language is supported.
 */
export function isLanguageSupported(language: Language): boolean {
  return PARSERS.has(language);
}

/**
 * Check if extension is supported.
 */
export function isExtensionSupported(extension: string): boolean {
  try {
    createParserFromExtension(extension);
    return true;
  } catch (error) {
    return false;
  }
}
