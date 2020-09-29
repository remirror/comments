import { CommentBlock, CommentLine, File } from '@babel/types';
import { AST, TSESTreeOptions } from '@typescript-eslint/typescript-estree';
import type { Parser, ParserOptions, SupportOption } from 'prettier';
import { format, util } from 'prettier';
import { parsers as babelParsers } from 'prettier/parser-babel';
import { parsers as typescriptParsers } from 'prettier/parser-typescript';

const babelTs = babelParsers['babel-ts'];

/**
 * The default options to set when using this plugin. Here for documentation purposes in case you're
 * looking to learn how to build your own plugin.
 */
export const defaultOptions = {};

/**
 * The options that can be set by this plugin. At the moment there are no options available. This is
 * here for documentation purposes.
 */
export const options: SupportOption[] = [
  {
    type: 'int',
    category: 'comments',
    default: 80,
    description:
      'The column width at which comments should wrap. This defaults to 80 which is the advised value regardless of your line width.',
    name: 'commentWidth',
  },
  {
    type: 'boolean',
    category: 'comments',
    default: false,
    name: 'preferSingleLineComments',
    description:
      'Whether to prefer `/** Comment */` over the multiline variant when short enough. Defaults to false meaning all block comments will be spread over multiple lines.',
  },
];

interface FormatLinesParameter {
  /**
   * The consecutive comments group.
   */
  consecutiveComments: CommentLine[];

  /**
   * The comment line width provided by the user.
   */
  commentWidth: number;

  /**
   * The increments to update
   */
  increment: AccruedIncrement;

  /**
   * The final comments that can be pushed to as data becomes known.
   */
  finalComments: Array<CommentLine | CommentBlock>;

  /**
   * The options which are currently active.
   */
  options: ParserOptions;

  /**
   * Check that that the next line is empty.
   */
  nextLineEmpty: boolean;
}

/**
 * This takes a group of consecutive lines and formats their text value content using the markdown
 * parser. Each line is then recreated by splitting the markdown by line break.
 */
function formatLines(parameter: FormatLinesParameter) {
  const {
    consecutiveComments,
    commentWidth,
    increment,
    finalComments,
    options,
    nextLineEmpty,
  } = parameter;

  // Measures how indented the comment is in characters.
  const column = consecutiveComments[0].loc.start.column;

  // This is the width we should set on the prosewrap property for the markdown
  const printWidth = commentWidth - column - 3;

  // First capture the length of each line and their total length. Second capture the number of
  // lines. These will all be compared at the end of the transformation to calculate the offsets for
  // the increments.
  const originalLineStart = consecutiveComments[0].loc.start.line;
  const originalStart = consecutiveComments[0].start;
  const originalEnd = consecutiveComments[consecutiveComments.length - 1].end;

  // Prepare the string to be formatted with markdown.
  const preparedString = consecutiveComments
    // Delete the first character if it isn't a whitespace character
    .map((comment) => comment.value.replace(/^\S/, '').trim())
    // Join the values into one string separated by the new line character so that it can be
    // formatted with markdown.
    .join('\n');

  // Use markdown to format the string.
  const formattedStrings = format(preparedString, {
    ...options,
    printWidth,
    proseWrap: 'always',
    parser: 'markdown',
  });

  // If no value returned nothing should change. It's not good to delete the users content from
  // underneath them.
  if (!formattedStrings) {
    finalComments.push(...consecutiveComments);
    return;
  }

  // This is where the transformed comments are stored to be returned.
  const transformedComments: CommentLine[] = [];

  // Keep track of the next starting positions
  let line = originalLineStart;
  let start = originalStart;

  // Now we want to generate the new `CommentLine` AST by splitting the formatted value into lines.
  const transformedValues = formattedStrings.split(/\r\n|\n|\r/).map((s) => ` ${s}`);

  for (const [index, value] of transformedValues.entries()) {
    transformedComments.push({
      start,
      end: start + value.length,
      type: 'CommentLine',
      value: index !== transformedValues.length - 1 ? value : nextLineEmpty ? `${value}\n` : value,
      loc: { start: { line, column }, end: { column: column + value.length, line } },
    });

    line += 1;
    start += value.length + 1;
  }

  // Now compare the number of lines with before and the start end end positions.
  increment.lines += transformedComments.length - consecutiveComments.length;
  increment.characters += originalEnd - transformedComments[transformedComments.length - 1].end;
  finalComments.push(...transformedComments);
}

interface FormatBlockParameter {
  /**
   * The comment block which will be formatted.
   */
  comment: CommentBlock;

  /**
   * The comment line width provided by the user.
   */
  commentWidth: number;

  /**
   * The increments to update
   */
  increment: AccruedIncrement;

  /**
   * The final comments that can be pushed to as data becomes known.
   */
  finalComments: Array<CommentLine | CommentBlock>;

  /**
   * The options which are currently active.
   */
  options: ParserOptions;

  /**
   * Check that that the next line is empty.
   */
  nextLineEmpty: boolean;
}

function formatBlock(parameter: FormatBlockParameter) {}

/**
 * Get the next line number for the lines to be consecutive. This whether the current line is part
 * of a consecutive group and should be added to the list.
 */
function getConsecutiveLineNumber(comments: CommentLine[]) {
  return comments[comments.length - 1].loc.end.line + 1;
}

/**
 * As lines are added, or subtracted, each consecutive comment will need to be transformed.
 */
function updateCommentWithIncrement(
  comment: CommentBlock | CommentLine,
  increment: AccruedIncrement,
) {
  comment.start += increment.characters;
  comment.end += increment.characters;
  comment.loc.start.line += increment.lines;
  comment.loc.end.line += increment.lines;
}

interface AccruedIncrement {
  /**
   * The lines that have been accrued so far. It measures the total lines of comments before minus
   * the total lines of comment ofter prettifying.
   */
  lines: number;

  /**
   * The characters that have been accrued so far.
   */
  characters: number;

  /**
   * This tracks the difference in the number of comments. [CommentLine]'s can be merged together,
   * leading to a negative increment (<0). They can also be split into separate parts line leading
   * to a positive increment (>0).
   */
  indexes: number;
}

/**
 * Returns true if consecutive lines were found and adds to the consecutive comments block.
 *
 * @param comment - the comment being tested.
 * @param consecutiveComments - the mutable comment block.
 * @returns true when the comment was on the proceeding line false when it's a new block.
 */
function checkForConsecutiveLines(comment: CommentLine, consecutiveComments: CommentLine[]) {
  // Test whether this is a consecutive line number.
  const isConsecutive = comment.loc.start.line === getConsecutiveLineNumber(consecutiveComments);

  if (!isConsecutive) {
    return false;
  }

  // Add to the consecutive lines and return true.
  consecutiveComments.push(comment);
  return true;
}

/**
 * Parse the matched babel file.
 */
function commentParserBabel(
  text: string,
  parsers: {
    [parserName: string]: Parser;
  },
  options: ParserOptions,
): File {
  const ast: File = babelTs.parse(text, parsers, options);
  const { commentWidth } = options as ParserOptions & { commentWidth: number };

  // The array which will be returned in the AST. It is passed around and mutated with the `.push`
  // method.
  const finalComments: Array<CommentLine | CommentBlock> = [];

  // Here we need to gather the consecutive lines so that lines are able to be formatted as in one
  // sweep. When this is not empty we know that we are in consecutive checking mode. Make sure to
  // set to empty when the consecutive lines stop.
  let consecutiveComments: CommentLine[] = [];

  // Keep track of whether the next line is empty.
  let nextLineEmpty = false;

  // Keep track of the current line and positional increments as comment lines get added or
  // subtracted. This can also be hold negative values.
  const increment: AccruedIncrement = {
    lines: 0,
    characters: 0,
    indexes: 0,
  };

  for (const [index, comment] of ast.comments?.entries() ?? []) {
    // Are we currently checking for consecutive line comments? When this is true we know we are.
    const shouldCheckConsecutive = consecutiveComments.length > 0;

    // Update the comment to make sure `line` count, and `start` / `end` positions are up to date.
    // updateCommentWithIncrement(comment, increment);

    nextLineEmpty = util.isNextLineEmpty(text, comment, (comment) => comment.end);

    // There are two types of comment. Comment blocks `/*` and comment lines. Blocks are parsed in a
    // different way. Lines are parsed as markdown directly. There is a catch though. Lines are
    // shown one at a time. For line grouping it's up to this checking code to keep track of whether
    // we are currently in a consecutive block.
    if (comment.type === 'CommentLine') {
      if (shouldCheckConsecutive) {
        if (checkForConsecutiveLines(comment, consecutiveComments)) {
          // We can continue to the next comment since this is a consecutive line. Lines only get
          // checked when their full block is ready.
          continue;
        }

        // This formats the lines and updates the increment values based on the calculate change in
        // the format.
        formatLines({
          nextLineEmpty,
          consecutiveComments,
          commentWidth,
          increment,
          finalComments,
          options,
        });

        // Since the group ended reset the consecutive commits so that the next time a comment line
        // is reached it will be treated as the start of a new group.
        consecutiveComments = [];
      }

      // Add the comment to the consecutive comments since it's the start of a new group.
      consecutiveComments.push(comment);

      // Move onto checking the next comment.
      continue;
    }

    if (shouldCheckConsecutive) {
      formatLines({
        nextLineEmpty,
        consecutiveComments,
        commentWidth,
        increment,
        finalComments,
        options,
      });
      consecutiveComments = [];
    }

    // We know we are in a block so format it.
    // formatBlock({ comment, commentWidth, finalComments, increment, options });
    finalComments.push(comment);
  }

  // Check for any unclosed consecutive comments since the loop has now been exited.
  if (consecutiveComments.length > 0) {
    formatLines({
      nextLineEmpty,
      consecutiveComments,
      commentWidth,
      increment,
      finalComments,
      options,
    });
    consecutiveComments = [];
  }

  ast.comments = finalComments.filter((comment) => comment.value.trim().length > 0);

  return ast;
}

/**
asdf asdf
  */
function commentParserTypescript(
  text: string,
  parsers: {
    [parserName: string]: Parser;
  },
  options: ParserOptions,
): AST<TSESTreeOptions> {
  const ast: AST<TSESTreeOptions> = typescriptParsers.typescript.parse(text, parsers, options);
  console.log('commentParserTypeScript->ast', ast);

  return ast;
}

export const parsers: Record<string, Parser> = {
  babel: {
    ...babelTs,
    parse: commentParserBabel,
  },
  typescript: {
    ...typescriptParsers.typescript,
    parse: commentParserTypescript,
  },
};
