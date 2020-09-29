import {} from '@babel/types';
import parseComment from 'comment-parser';
import { format } from 'prettier';

import * as prettierPluginComments from '..';

test('play', () => {
  const comment = `/**
asdf
      asdf
  */`;

  const parsed = parseComment(comment);
  console.log(JSON.stringify(parsed, null, 2));

  const description = parsed[0].source;
  console.log(description);
  console.log(format(description, { parser: 'markdown' }));
});

const value = `
// The start of an era.
// The end of an era.

// This is the best way to get things done.

/**
*
* Function example description that was wrapped by hand so it have more then
* one line and don't end with a dot REPEATED TWO TIMES BECAUSE IT WAS EASIER
* to copy function example description that was wrapped by hand so it have
* more then one line.
*
* @async
* @private
* @memberof test
*
* @param {String | Number} text Some text description that is very long and
*     needs to be wrapped
* @param {String} [defaultValue] TODO Default is \`\\"defaultTest\\"\`
* @param {Number | Null} [optionalNumber]
* @undefiendtag
* @undefiendtag {number} name des
* @returns {Boolean} Description for with s
*
* @code
* \`\`\`ts
* const a = '';
* \`\`\`
*/
function awesome() {
  return '';
}

/// This is a normal comment.
/// This is a second normal comment.
const a = '';
`;

test.only('babel parser', () => {
  expect(
    format(value, {
      plugins: [prettierPluginComments],
      parser: 'babel',
    }),
  ).toMatchInlineSnapshot(`
    "// The start of an era. The end of an era.
    // This is the best way to get things done.
    /**
     *
     * Function example description that was wrapped by hand so it have more then
     * one line and don't end with a dot REPEATED TWO TIMES BECAUSE IT WAS EASIER
     * to copy function example description that was wrapped by hand so it have
     * more then one line.
     *
     * @async
     * @private
     * @memberof test
     *
     * @param {String | Number} text Some text description that is very long and
     *     needs to be wrapped
     * @param {String} [defaultValue] TODO Default is \`\\\\\\"defaultTest\\\\\\"\`
     * @param {Number | Null} [optionalNumber]
     * @undefiendtag
     * @undefiendtag {number} name des
     * @returns {Boolean} Description for with s
     *
     * @code
     * \`\`\`ts
     * const a = '';
     * \`\`\`
     */
    function awesome() {
      return \\"\\";
    }

    // This is a normal comment. This is a second normal comment.
    const a = \\"\\";
    "
  `);
});

test('typescript parser', () => {
  expect(
    format(value, {
      plugins: [prettierPluginComments],
      parser: 'typescript',
    }),
  ).toMatchInlineSnapshot(`
    "import first from \\"@first\\";
    import a from \\"abc\\";
    import { b } from \\"@alias\\";
    import { Splat } from \\"@splat/anything\\";
    import { B, C, b, c } from \\"@z\\";
    import Runner from \\"run\\";
    import { a } from \\"./foo\\";
    "
  `);
});
