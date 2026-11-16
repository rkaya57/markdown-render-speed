// parse.js: a specialised, single-purpose fork of marked 18.1.3 (https://github.com/markedjs/marked).
// It renders Markdown to exactly the HTML marked.parse() returns with marked's defaults (gfm on,
// breaks off, pedantic off, no extensions, hooks or async). Everything configurable in marked is
// hard-wired here: one lexer, one inline lexer and one renderer as plain functions over module state.
// marked is MIT licensed: Copyright (c) 2018+, MarkedJS; Copyright (c) 2011-2018, Christopher Jeffrey.
// See LICENSE-marked for marked's licence and notice.

// ---------------------------------------------------------------------------------------------
// Regular expressions (built once, the same patterns marked builds for its gfm rule set)
// ---------------------------------------------------------------------------------------------

const CARET = /(^|[^\[])\^/g;
function rx(src, flags) {
  let s = typeof src === 'string' ? src : src.source;
  const b = {
    put(name, val) {
      let v = typeof val === 'string' ? val : val.source;
      v = v.replace(CARET, '$1');
      s = s.replace(name, v);
      return b;
    },
    make() { return new RegExp(s, flags || ''); },
  };
  return b;
}

const TAGS = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';

// block level
const B_NEWLINE = /^(?:[ \t]*(?:\n|$))+/;
const B_CODE = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
const B_FENCES = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}(?:(?=`)\1`*|(?=~)\1~*) *(?=\n|$)|$)/;
const B_HR = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
const B_HEADING = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
const BULL = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
const B_LHEADING = rx(/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+)[ \t]*(?:\n+|$)/)
  .put(/bull/g, BULL).put(/blockCode/g, /(?: {4}| {0,3}\t)/).put(/fences/g, / {0,3}(?:`{3,}|~{3,})/)
  .put(/blockquote/g, / {0,3}>/).put(/heading/g, / {0,3}#{1,6}(?:\s|$)/)
  .put(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/)
  .put(/html/g, / {0,3}<[^\n>]+>\n/).put(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).make();
const PARA_SKELETON = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/;
const LABEL = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\\n]|\n(?![ \t]*\n))+/;
const B_DEF = rx(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/)
  .put('label', LABEL)
  .put('title', /(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\\n]|\n(?!\n))*'|\((?:\\[\s\S]|[^()\\])*\))/).make();
const B_LIST = rx(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).put(/bull/g, BULL).make();
const COMMENT = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
const B_HTML = rx('^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?:[ \\t]+|\\n|/?>|$)[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$)|</[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$))', 'i')
  .put('comment', COMMENT).put('tag', TAGS)
  .put('attribute', / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).make();
const HTML_START = ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)';
const FENCE_START = ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)';
const BQ_PARA = rx(PARA_SKELETON).put('hr', B_HR).put('heading', ' {0,3}#{1,6}(?:\\s|$)').put('|lheading', '')
  .put('|table', '').put('blockquote', ' {0,3}>').put('fences', FENCE_START)
  .put('list', / {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/).put('html', HTML_START).put('tag', TAGS).make();
const B_BLOCKQUOTE = rx(/^( {0,3}> ?(?:(?![ \t]*(?:\n|$))(paragraph)|[^\n]*)(?:\n|$))+/).put('paragraph', BQ_PARA).make();
const B_TABLE = rx('^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)')
  .put('hr', B_HR).put('heading', ' {0,3}#{1,6}(?:\\s|$)').put('blockquote', ' {0,3}>')
  .put('code', '(?: {4}| {0,3}\t)[^\\n]').put('fences', FENCE_START).put('list', ' {0,3}(?:[*+-]|1[.)])[ \\t]')
  .put('html', HTML_START).put('tag', TAGS).make();
const B_PARAGRAPH = rx(PARA_SKELETON).put('hr', B_HR).put('heading', ' {0,3}#{1,6}(?:\\s|$)').put('|lheading', '')
  .put('table', B_TABLE).put('blockquote', ' {0,3}>').put('fences', FENCE_START)
  .put('list', ' {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]').put('html', HTML_START).put('tag', TAGS).make();
const B_TEXT = /^[^\n]+/;

// list helpers, one per indentation 0..3 (marked clamps the indent to that range)
function byIndent(f) { return [f(0), f(1), f(2), f(3)]; }
const NEXT_BULLET = byIndent(n => new RegExp(`^ {0,${n}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`));
const HR_AT = byIndent(n => new RegExp(`^ {0,${n}}((?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\\*[ \t]*){3,})(?:\\n+|$)`));
const FENCE_AT = byIndent(n => new RegExp(`^ {0,${n}}(?:\`\`\`|~~~)`));
const HEADING_AT = byIndent(n => new RegExp(`^ {0,${n}}#{1,6}(?:\\s|$)`));
const HTML_AT = byIndent(n => new RegExp(`^ {0,${n}}(?:</?(?:${TAGS})(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`, 'i'));
const BQ_AT = byIndent(n => new RegExp(`^ {0,${n}}>`));
// list item start for each kind of bullet: * + - and ordered with . or )
const itemRegex = b => new RegExp(`^( {0,3}${b})((?:[\t ][^\\n]*)?(?:\\n|$))`);
const ITEM_RE = { '*': itemRegex('\\*'), '+': itemRegex('\\+'), '-': itemRegex('\\-'), 'n.': itemRegex('\\d{1,9}\\.'), 'n)': itemRegex('\\d{1,9}\\)') };
const clampIndent =n => (n < 1 ? 0 : n > 4 ? 3 : n - 1);

// inline level
const PUNCT = /[\p{P}\p{S}]/u;
const PUNCT_SPACE = /[\s\p{P}\p{S}]/u;
const NOT_PUNCT_SPACE = /[^\s\p{P}\p{S}]/u;
const I_ESCAPE = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
const I_CODE = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
const I_BR = /^( {2,}|\\)\n(?!\s*$)[ \t]*/;
const I_PUNCTUATION = rx(/^((?![*_])punctSpace)/, 'u').put(/punctSpace/g, PUNCT_SPACE).make();
const PUNCT_NO_TILDE = /(?!~)[\p{P}\p{S}]/u;
const PUNCT_SPACE_NO_TILDE = /(?!~)[\s\p{P}\p{S}]/u;
const NOT_PUNCT_SPACE_TILDE = /(?:[^\s\p{P}\p{S}]|~)/u;
const I_BLOCK_SKIP = rx(/link|precode-code|html/, 'g')
  // marked names these backtick groups (a, b); plain numbered groups match the same and keep
  // V8's replace off its slow named-group path
  .put('link', /\[(?:[^\[\]`]|(`+)[^`]+\1(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/)
  .put('precode-', '(?<!`)()').put('code', /(`+)[^`]+\3(?!`)/).put('html', /<(?! )[^<>]*?>/).make();
const I_EM_LDELIM = rx(/^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/, 'u').put(/punct/g, PUNCT_NO_TILDE).make();
const I_EM_RDELIM_AST = rx('^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)', 'gu')
  .put(/notPunctSpace/g, NOT_PUNCT_SPACE_TILDE).put(/punctSpace/g, PUNCT_SPACE_NO_TILDE).put(/punct/g, PUNCT_NO_TILDE).make();
const I_EM_RDELIM_UND = rx('^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)', 'gu')
  .put(/notPunctSpace/g, NOT_PUNCT_SPACE).put(/punctSpace/g, PUNCT_SPACE).put(/punct/g, PUNCT).make();
const I_DEL_LDELIM = rx(/^~~?(?:((?!~)punct)|[^\s~])/, 'u').put(/punct/g, PUNCT).make();
const I_DEL_RDELIM = rx('^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)', 'gu')
  .put(/notPunctSpace/g, NOT_PUNCT_SPACE).put(/punctSpace/g, PUNCT_SPACE).put(/punct/g, PUNCT).make();
const I_ANY_PUNCT = rx(/\\(punct)/, 'gu').put(/punct/g, PUNCT).make();
const I_ANY_PUNCT_OUTSIDE_CODE = rx(/(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\(punct)/, 'gu').put(/punct/g, PUNCT).make();
const I_AUTOLINK = rx(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).put('scheme', /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/)
  .put('email', /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).make();
const I_TAG = rx('^comment|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>')
  .put('comment', rx(COMMENT).put('(?:-->|$)', '-->').make())
  .put('attribute', /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).make();
const BRACKETS = /\[(?:\\[\s\S]|[^\[\]\\])*\]/;
const LINK_LABEL = rx(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/).put('brackets', BRACKETS).make();
const I_LINK = rx(/^!?\[(label)\]\([ \t\n]*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?[ \t\n]*\)/)
  .put('label', LINK_LABEL).put('href', /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/)
  .put('title', /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\)/).make();
const I_REFLINK = rx(/^!?\[(label)\]\[(ref)\]/).put('label', LINK_LABEL).put('ref', LABEL).make();
const I_NOLINK = rx(/^!?\[(ref)\](?:\[\])?/).put('ref', LABEL).make();
const REF_LABEL_SHORT = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/;
const REF_TEXT_SEARCH = rx(/(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/).put('brackets', BRACKETS).make();
const I_REFLINK_SEARCH = rx('reflink|nolink(?!\\()', 'g')
  .put('reflink', rx(/^!?\[(label)\]\[(ref)\]/).put('label', REF_TEXT_SEARCH).put('ref', REF_LABEL_SHORT).make())
  .put('nolink', rx(/^!?\[(ref)\](?:\[\])?/).put('ref', REF_LABEL_SHORT).make()).make();
const PROTOCOL = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
const MAIL_ADDR = /[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/;
const EMAIL_PROTOCOL = rx(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/).put(/email/g, MAIL_ADDR).make();
const I_URL = rx(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/)
  .put('emailProtocol', EMAIL_PROTOCOL).put('protocol', PROTOCOL)
  .put('email', /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/).make();
const I_BACKPEDAL = /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/;
const I_TEXT = rx(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|wwwStart|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/)
  .put('protocol', PROTOCOL).put(/emailProtocol/g, /(?:mailto|xmpp):/).put('wwwStart', '(?<![^\\s*_~(])www\\.').make();

// misc
const UNICODE_ALNUM = /[\p{L}\p{N}]/u;
const LIST_IS_TASK = /^\[[ xX]\][ \t]+\S/;
const LIST_TASK_STRIP = /^\[[ xX]\][ \t]+/;
const BQ_SETEXT = /\n {0,3}((?:=+|-+)[ \t]*)(?=\n|$)/g;
const BQ_PREFIX = /^ {0,3}>[ \t]?/gm;
const BQ_MARKER_WS = /^( {0,3}>)([ \t]+)/gm;
const NUM_REF = /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/;
const NUM_REF_OR_AMP = /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escChar = c => ESC_MAP[c];
const ESC_ALL_TEST = /[&<>"']/;
const ESC_ALL = /[&<>"']/g;
const ESC_SOFT_TEST = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
const ESC_SOFT = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;
function escAll(s) { return ESC_ALL_TEST.test(s) ? escapeScan(s, true) : s; }
function escSoft(s) { return ESC_SOFT_TEST.test(s) ? escapeScan(s, false) : s; }

const isDigit = c => c >= 48 && c <= 57;
const isHex = c => (c >= 48 && c <= 57) || ((c | 32) >= 97 && (c | 32) <= 102);
const isWord = c => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95;

// s.slice(j) starts with (#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);
function entityAt(s, j) {
  const n = s.length;
  let k;
  if (s.charCodeAt(j) === 35) {
    k = j + 1;
    while (k < n && isDigit(s.charCodeAt(k))) k++;
    if (k - j - 1 >= 1 && k - j - 1 <= 7 && s.charCodeAt(k) === 59) return true;
    if ((s.charCodeAt(j + 1) | 32) !== 120) return false;
    k = j + 2;
    while (k < n && isHex(s.charCodeAt(k))) k++;
    return k - j - 2 >= 1 && k - j - 2 <= 6 && s.charCodeAt(k) === 59;
  }
  k = j;
  while (k < n && isWord(s.charCodeAt(k))) k++;
  return k > j && s.charCodeAt(k) === 59;
}

// one pass of the ESC_ALL (all) or ESC_SOFT (& only when it starts no entity) replacement
function escapeScan(s, all) {
  let out = '', from = 0;
  const n = s.length;
  for (let i = 0; i < n; i++) {
    let r;
    switch (s.charCodeAt(i)) {
      case 38: if (!all && entityAt(s, i + 1)) continue; r = '&amp;'; break;
      case 60: r = '&lt;'; break;
      case 62: r = '&gt;'; break;
      case 34: r = '&quot;'; break;
      case 39: r = '&#39;'; break;
      default: continue;
    }
    out += s.slice(from, i) + r;
    from = i + 1;
  }
  return from === 0 ? s : out + s.slice(from);
}

function decodeNumRefs(s) {
  if (s.indexOf('&#') === -1 || !NUM_REF.test(s)) return s;
  return s.replace(NUM_REF_OR_AMP, (m, dec, hex) => {
    if (dec === undefined && hex === undefined) return '&amp;';
    const cp = dec === undefined ? Number.parseInt(hex, 16) : Number.parseInt(dec, 10);
    if (cp === 0 || cp > 1114111 || (cp >= 55296 && cp <= 57343)) return '\uFFFD';
    return cp === 38 ? '&amp;' : String.fromCodePoint(cp);
  });
}

// [...s].length
function cpCount(s) {
  let n = s.length;
  for (let i = 0; i < s.length - 1; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { n--; i++; }
    }
  }
  return n;
}

// [...s][0].length (s non-empty)
function firstCpLen(s) {
  const c = s.charCodeAt(0);
  if (c >= 0xd800 && c <= 0xdbff && s.length > 1) {
    const d = s.charCodeAt(1);
    if (d >= 0xdc00 && d <= 0xdfff) return 2;
  }
  return 1;
}

// [...s].at(-1) ?? '' for a string of at most two code units
function lastCodePoint(s) {
  if (s.length < 2) return s;
  const c = s.charCodeAt(0), d = s.charCodeAt(1);
  if (c >= 0xd800 && c <= 0xdbff && d >= 0xdc00 && d <= 0xdfff) return s;
  return s[1];
}

// characters encodeURI keeps as they are, and %, which cleanUrl's replace restores
function uriSafe(c) {
  if ((c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57)) return true;
  switch (c) {
    case 59: case 44: case 47: case 63: case 58: case 64: case 38: case 61: case 43: case 36: case 45:
    case 95: case 46: case 33: case 126: case 42: case 39: case 40: case 41: case 35: case 37: return true;
  }
  return false;
}

function cleanUrl(href) {
  let i = 0;
  while (i < href.length && uriSafe(href.charCodeAt(i))) i++;
  if (i === href.length) return href;
  try { return encodeURI(href).replace(/%25/g, '%'); } catch { return null; }
}

// strip trailing `ch` characters
function rtrim(s, ch) {
  let n = s.length;
  while (n > 0 && s[n - 1] === ch) n--;
  return s.slice(0, n);
}

function splitCells(row, count) {
  const marked = row.replace(/\|/g, (m, at, str) => {
    let esc = false, i = at;
    while (--i >= 0 && str[i] === '\\') esc = !esc;
    return esc ? '|' : ' |';
  });
  const cells = marked.split(/ \|/);
  if (!cells[0].trim()) cells.shift();
  if (cells.length > 0 && !cells[cells.length - 1]?.trim()) cells.pop();
  if (count) {
    if (cells.length > count) cells.splice(count);
    else while (cells.length < count) cells.push('');
  }
  for (let i = 0; i < cells.length; i++) cells[i] = cells[i].trim().replace(/\\\|/g, '|');
  return cells;
}

// drop trailing blank lines when there are two or more of them
function trimBlankTail(s) {
  const lines = s.split('\n');
  let i = lines.length - 1;
  while (i >= 0 && /^[ \t]*$/.test(lines[i])) i--;
  return lines.length - i <= 2 ? s : lines.slice(0, i + 1).join('\n');
}

function normLabel(s) {
  return s.trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase().toLowerCase();
}

function findClosing(s, open, close) {
  if (s.indexOf(open) === -1 && s.indexOf(close) === -1) return -1;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') i++;
    else if (c === open) depth++;
    else if (c === close) { depth--; if (depth < 0) return i; }
  }
  return depth > 0 ? -2 : -1;
}

// the text before the first line feed (all of s when there is none)
function lineOf(s) {
  const i = s.indexOf('\n');
  return i === -1 ? s : s.slice(0, i);
}

// s with its leading blanks tab-expanded (marked's replace(/^[ \t]+/, expandTabs) idiom)
function expandLead(s, col) {
  let i = 0, tab = false;
  for (; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9) tab = true;
    else if (c !== 32) break;
  }
  return tab ? expandTabs(s.slice(0, i), col) + s.slice(i) : s;
}

// s.search(/[^ ]/)
function firstNonSpace(s) {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) !== 32) return i;
  return -1;
}

// false when no ` {0,3}`-indented fence, heading, html, quote, bullet or rule can start this line
function mayOpenBlock(s) {
  const p = firstNonSpace(s);
  if (p < 0 || p > 3) return false;
  switch (s.charCodeAt(p)) {
    case 96: case 126: case 35: case 60: case 62: case 42: case 43: case 45: case 95: return true;
    default: { const c = s.charCodeAt(p); return c >= 48 && c <= 57; }
  }
}

function expandTabs(s, col = 0) {
  let out = '';
  for (const ch of s) {
    if (ch === '\t') { const r = 4 - (col % 4); out += ' '.repeat(r); col += r; }
    else { out += ch; col++; }
  }
  return out;
}

// last index (per delimiter kind) where a run of * _ ~ follows a non-space char
function closerPositions(s) {
  let star = -1, und = -1, tilde = -1;
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c !== 42 && c !== 95 && c !== 126) continue;
    const prev = i === 0 ? 10 : s.charCodeAt(i - 1);
    let j = i + 1;
    while (j < n && s.charCodeAt(j) === c) j++;
    if (prev !== 32 && prev !== 9 && prev !== 10 && prev !== 13 && prev !== 12) {
      if (c === 126) tilde = i; else if (c === 42) star = i; else und = i;
    }
    i = j - 1;
  }
  return { star, und, tilde };
}

function fenceIndentFix(raw, text) {
  const m = raw.match(/^(\s+)(?:```)/);
  if (m === null) return text;
  const indent = m[1];
  return text.split('\n').map(line => {
    const sp = line.match(/^\s+/);
    if (sp === null) return line;
    return line.slice(Math.min(sp[0].length, indent.length));
  }).join('\n');
}

// ---------------------------------------------------------------------------------------------
// Lexer state (reset on every parse() call: nothing survives from one document to the next)
// ---------------------------------------------------------------------------------------------

let links;        // reference definitions
let queue;        // pending inline work: { src, tokens }
let top;          // marked's state.top
let inLink;
let inRawBlock;
let linkEmitted;
let parenOK;      // marked's state.linkParenPossible
let hasLinks;     // whether any reference definition exists

const last = a => a[a.length - 1];

// Every inline token has this one shape, so the lexer and renderer see a single hidden class.
class Tok {
  constructor(type, raw, text, tokens) {
    this.type = type;
    this.raw = raw;
    this.text = text;
    this.tokens = tokens;
    this.href = null;
    this.title = null;
    this.autolink = false;
    this.escaped = false;
    this.checked = false;
  }
}

function textTok(raw, text, escaped) {
  const t = new Tok('text', raw, text, null);
  t.escaped = escaped;
  return t;
}

function linkTok(type, raw, text, tokens, href, title, autolink) {
  const t = new Tok(type, raw, text, tokens);
  t.href = href;
  t.title = title;
  t.autolink = autolink;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Block lexer
// ---------------------------------------------------------------------------------------------

function inlineLater(src) {
  const tokens = [];
  queue.push({ src, tokens });
  return tokens;
}

const UNDERLINE = /\n {0,3}(?:=+|-+)[ \t]*(?:\n|$)/g;

function blockTokens(src, out, clipped) {
  // A setext heading needs a `\n {0,3}[=-]` line before the next "\n\n": track the next of each
  // in `whole` (src is always a suffix of it) so the setext regex runs only where it can match.
  const whole = src;
  let ulAt = -1, blAt = -1;
  while (src) {
    let t, tok, prev;
    // Every rule up to the table one opens with up to 3 spaces and a fixed character (or with
    // 4 spaces / a tab for indented code): look at that character once and skip rules that cannot match.
    const c0 = src.charCodeAt(0);
    let sp = 0;
    while (sp < 4 && src.charCodeAt(sp) === 32) sp++;
    const ch = sp < 4 ? src.charCodeAt(sp) : -1;

    // blank lines
    if ((c0 === 32 || c0 === 9 || c0 === 10) && (t = B_NEWLINE.exec(src)) && t[0].length > 0) {
      src = src.substring(t[0].length);
      prev = out[out.length - 1];
      if (t[0].length === 1 && prev !== undefined) prev.raw += '\n';
      else out.push({ type: 'space', raw: t[0] });
      continue;
    }

    // indented code
    if ((sp === 4 || ch === 9) && (t = B_CODE.exec(src))) {
      const raw = trimBlankTail(t[0]);
      const text = raw.replace(/^(?: {0,3}\t| {1,4})/gm, '');
      src = src.substring(raw.length);
      prev = out[out.length - 1];
      if (prev !== undefined && (prev.type === 'paragraph' || prev.type === 'text')) {
        prev.raw += (prev.raw.endsWith('\n') ? '' : '\n') + raw;
        prev.text += '\n' + text;
        queue[queue.length - 1].src = prev.text;
      } else {
        out.push({ type: 'code', raw, lang: undefined, text });
      }
      continue;
    }

    if ((ch === 96 || ch === 126) && (t = B_FENCES.exec(src))) {
      const raw = t[0];
      src = src.substring(raw.length);
      out.push({ type: 'code', raw, lang: t[2] ? t[2].trim().replace(I_ANY_PUNCT, '$1') : t[2], text: fenceIndentFix(raw, t[3] || '') });
      continue;
    }

    if (ch === 35 && (tok = heading(src))) { src = src.substring(tok.raw.length); out.push(tok); continue; }

    if ((ch === 45 || ch === 95 || ch === 42) && (t = B_HR.exec(src))) {
      const raw = rtrim(t[0], '\n');
      src = src.substring(raw.length);
      out.push({ type: 'hr', raw });
      continue;
    }

    if (ch === 62 && (tok = blockquote(src))) { src = src.substring(tok.raw.length); out.push(tok); continue; }
    if ((ch === 42 || ch === 43 || ch === 45 || (ch >= 48 && ch <= 57)) && (tok = list(src))) { src = src.substring(tok.raw.length); out.push(tok); continue; }

    if (ch === 60 && (t = B_HTML.exec(src))) {
      const raw = trimBlankTail(t[0]);
      src = src.substring(raw.length);
      out.push({ type: 'html', raw, text: raw });
      continue;
    }

    if (ch === 91 && (tok = def(src))) {
      src = src.substring(tok.raw.length);
      prev = out[out.length - 1];
      if (prev !== undefined && (prev.type === 'paragraph' || prev.type === 'text')) {
        prev.raw += (prev.raw.endsWith('\n') ? '' : '\n') + tok.raw;
        prev.text += '\n' + tok.raw;
        queue[queue.length - 1].src = prev.text;
      } else {
        if (!links[tok.tag]) { links[tok.tag] = { href: tok.href, title: tok.title }; hasLinks = true; }
        out.push(tok);
      }
      continue;
    }

    if ((tok = table(src))) { src = src.substring(tok.raw.length); out.push(tok); continue; }

    const off = whole.length - src.length;
    if (ulAt < off) {
      UNDERLINE.lastIndex = off;
      const u = UNDERLINE.exec(whole);
      ulAt = u === null ? Infinity : u.index;
    }
    if (blAt < off) {
      const b = whole.indexOf('\n\n', off);
      blAt = b === -1 ? Infinity : b;
    }
    if (ulAt < blAt && (t = B_LHEADING.exec(src))) {
      const text = t[1].trim();
      const raw = rtrim(t[0], '\n');
      src = src.substring(raw.length);
      out.push({ type: 'heading', raw, depth: t[2].charAt(0) === '=' ? 1 : 2, text, tokens: inlineLater(text) });
      continue;
    }

    if (top && (t = B_PARAGRAPH.exec(src))) {
      const raw = t[0];
      const text = t[1].charAt(t[1].length - 1) === '\n' ? t[1].slice(0, -1) : t[1];
      const tokens = inlineLater(text);
      prev = out[out.length - 1];
      if (clipped && prev !== undefined && prev.type === 'paragraph') {
        prev.raw += (prev.raw.endsWith('\n') ? '' : '\n') + raw;
        prev.text += '\n' + text;
        queue.pop();
        queue[queue.length - 1].src = prev.text;
      } else {
        out.push({ type: 'paragraph', raw, text, tokens });
      }
      clipped = false;
      src = src.substring(raw.length);
      continue;
    }

    if ((t = B_TEXT.exec(src))) {
      const raw = t[0];
      src = src.substring(raw.length);
      const tokens = inlineLater(raw);
      prev = out[out.length - 1];
      if (prev !== undefined && prev.type === 'text') {
        prev.raw += (prev.raw.endsWith('\n') ? '' : '\n') + raw;
        prev.text += '\n' + raw;
        queue.pop();
        queue[queue.length - 1].src = prev.text;
      } else {
        out.push({ type: 'text', raw, text: raw, tokens });
      }
      continue;
    }

    if (src) throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));
  }
  top = true;
  return out;
}

function heading(src) {
  const t = B_HEADING.exec(src);
  if (!t) return;
  let text = t[2].trim();
  if (text.endsWith('#')) {
    const cut = rtrim(text, '#');
    if (!cut || /[ \t]$/.test(cut)) text = cut.trim();
  }
  return { type: 'heading', raw: rtrim(t[0], '\n'), depth: t[1].length, text, tokens: inlineLater(text) };
}

function def(src) {
  const t = B_DEF.exec(src);
  if (!t) return;
  if (!t[2].startsWith('<') && findClosing(t[2], '(', ')') !== -1) return;
  const tag = normLabel(t[1]);
  const href = t[2] ? t[2].replace(/^<(.*)>$/, '$1').replace(I_ANY_PUNCT, '$1') : '';
  const title = t[3] ? t[3].substring(1, t[3].length - 1).replace(I_ANY_PUNCT, '$1') : t[3];
  return { type: 'def', tag, raw: rtrim(t[0], '\n'), href, title };
}

// B_TABLE needs its second line to open (after up to 3 spaces) with | : or -
function tablePossible(src) {
  let i = src.indexOf('\n');
  if (i === -1) return false;
  i++;
  for (let k = 0; k < 3 && src.charCodeAt(i) === 32; k++) i++;
  const c = src.charCodeAt(i);
  return c === 124 || c === 58 || c === 45;
}

function table(src) {
  if (!tablePossible(src)) return;
  const t = B_TABLE.exec(src);
  if (!t || !/[:|]/.test(t[2])) return;
  const head = splitCells(t[1]);
  const aligns = t[2].replace(/^\||\| *$/g, '').split('|');
  const rows = t[3]?.trim() ? t[3].replace(/\n[ \t]*$/, '').split('\n') : [];
  if (head.length !== aligns.length) return;
  const align = [];
  for (const a of aligns) {
    if (/^ *-+: *$/.test(a)) align.push('right');
    else if (/^ *:-+: *$/.test(a)) align.push('center');
    else if (/^ *:-+ *$/.test(a)) align.push('left');
    else align.push(null);
  }
  const header = [];
  for (let i = 0; i < head.length; i++) header.push({ tokens: inlineLater(head[i]), align: align[i] });
  const body = [];
  for (const r of rows) body.push(splitCells(r, header.length).map((c, i) => ({ tokens: inlineLater(c), align: align[i] })));
  return { type: 'table', raw: rtrim(t[0], '\n'), header, rows: body };
}

function blockquote(src) {
  const t = B_BLOCKQUOTE.exec(src);
  if (!t) return;
  let lines = rtrim(t[0], '\n').split('\n');
  let raw = '', text = '';
  const tokens = [];
  while (lines.length > 0) {
    let inQuote = false;
    const cur = [];
    let p;
    for (p = 0; p < lines.length; p++) {
      if (/^ {0,3}>/.test(lines[p])) { cur.push(lines[p]); inQuote = true; }
      else if (!inQuote) cur.push(lines[p]);
      else break;
    }
    lines = lines.slice(p);
    const chunk = cur.join('\n');
    const inner = chunk.replace(BQ_MARKER_WS, (m, mark, ws) => mark + expandTabs(ws, mark.length))
      .replace(BQ_SETEXT, '\n    $1').replace(BQ_PREFIX, '');
    raw = raw ? `${raw}\n${chunk}` : chunk;
    text = text ? `${text}\n${inner}` : inner;
    const savedTop = top;
    top = true;
    blockTokens(inner, tokens, true);
    top = savedTop;
    if (lines.length === 0) break;
    const k = last(tokens);
    const kt = k?.type;
    if (kt === 'code' || kt === 'heading' || kt === 'hr' || kt === 'html' || kt === 'table') break;
    if (kt === 'blockquote') {
      const rest = lines.join('\n');
      const again = k.raw + '\n' + rest.replace(BQ_PREFIX, '');
      const f = blockquote(again);
      tokens[tokens.length - 1] = f;
      const y = again.substring(f.raw.length).replace(/^\n/, '');
      const leftover = y ? y.split('\n').length : 0;
      const used = leftover ? lines.slice(0, -leftover) : lines;
      if (used.length > 0) raw = `${raw}\n${used.join('\n')}`;
      text = text.substring(0, text.length - k.text.length) + f.text;
      lines = lines.slice(used.length);
      if (lines.length > 0 && /^ {0,3}>/.test(lines[0])) continue;
      break;
    } else if (kt === 'list') {
      const again = k.raw + '\n' + lines.join('\n');
      const m = list(again);
      tokens[tokens.length - 1] = m;
      const f = m.raw.length > k.raw.length ? again.slice(k.raw.length + 1, m.raw.length).split('\n').length : 0;
      if (f > 0) {
        const y = lines.slice(0, f).join('\n');
        raw = `${raw}\n${y}`;
        text = `${text}\n${y}`;
      }
      lines = lines.slice(f);
      continue;
    }
  }
  return { type: 'blockquote', raw, tokens, text };
}

// /\n[ \t]*\n[ \t]*$/.test(s)
function endsWithBlankLine(s) {
  let k = s.length;
  while (k > 0 && (s.charCodeAt(k - 1) === 32 || s.charCodeAt(k - 1) === 9)) k--;
  if (k === 0 || s.charCodeAt(k - 1) !== 10) return false;
  k--;
  while (k > 0 && (s.charCodeAt(k - 1) === 32 || s.charCodeAt(k - 1) === 9)) k--;
  return k > 0 && s.charCodeAt(k - 1) === 10;
}

function list(src) {
  let t = B_LIST.exec(src);
  if (!t) return;
  const whole = src;
  let bull = t[1].trim();
  const ordered = bull.length > 1;
  const lst = { type: 'list', raw: '', ordered, start: ordered ? +bull.slice(0, -1) : '', loose: false, items: [] };
  const itemRe = ITEM_RE[ordered ? 'n' + bull.slice(-1) : bull];
  let blankEnded = false;
  while (src) {
    let endEarly = false;
    let body = '';
    if (!(t = itemRe.exec(src)) || B_HR.test(src)) break;
    const startAt = whole.length - src.length;
    src = src.substring(t[0].length);
    const firstLine = lineOf(t[2]);
    const markerLen = t[1].length;
    let line = expandLead(firstLine, markerLen);
    let next = lineOf(src);
    let blank = !line.trim();
    let indent = 0;
    if (blank) indent = markerLen + 1;
    else {
      indent = line.search(/[^ ]/);
      indent = indent > 4 ? 1 : indent;
      body = line.slice(indent);
      indent += markerLen;
    }
    if (blank && /^[ \t]*$/.test(next)) {
      src = src.substring(next.length + 1);
      endEarly = true;
    }
    if (!endEarly) {
      const ci = clampIndent(indent);
      const reBullet = NEXT_BULLET[ci], reHr = HR_AT[ci], reFence = FENCE_AT[ci];
      const reHeading = HEADING_AT[ci], reHtml = HTML_AT[ci], reQuote = BQ_AT[ci];
      while (src) {
        const rawLine = lineOf(src);
        next = rawLine;
        const expanded = expandLead(next, 0);
        if (mayOpenBlock(next) && (reFence.test(next) || reHeading.test(next) || reHtml.test(next) || reQuote.test(next) || reBullet.test(next) || reHr.test(next))) break;
        if (firstNonSpace(expanded) >= indent || !next.trim()) {
          body += '\n' + expanded.slice(indent);
        } else {
          if (blank || line.replace(/\t/g, '    ').search(/[^ ]/) >= 4 || reFence.test(line) || reHeading.test(line) || reHtml.test(line) || reHr.test(line)) break;
          const piece = /^ {0,3}(?:=+|-+) *$/.test(next) && B_LHEADING.test(`${line}\n${next}`) ? `    ${expanded.replace(/^ {0,3}/, '')}` : next;
          body += '\n' + piece;
        }
        blank = !next.trim();
        src = src.substring(rawLine.length + 1);
        line = expanded.slice(indent);
      }
    }
    const itemRaw = whole.slice(startAt, whole.length - src.length);
    if (!lst.loose) {
      if (blankEnded) lst.loose = true;
      else if (endsWithBlankLine(itemRaw)) blankEnded = true;
    }
    lst.items.push({ raw: itemRaw, task: LIST_IS_TASK.test(body), loose: false, text: body, tokens: [], checked: undefined });
  }
  const h = last(lst.items);
  if (!h) return;
  h.raw = h.raw.trimEnd();
  h.text = h.text.trimEnd();
  lst.raw = whole.slice(0, whole.length - src.length).trimEnd();
  for (const it of lst.items) {
    top = false;
    it.tokens = blockTokens(it.text, [], false);
    if (!lst.loose) {
      const spaces = it.tokens.filter(x => x.type === 'space');
      lst.loose = spaces.length > 0 && spaces.some(x => /\n.*\n/.test(x.raw));
    }
  }
  for (const it of lst.items) {
    const d = it.tokens[0];
    if (it.task && (d?.type === 'text' || d?.type === 'paragraph')) {
      it.text = it.text.replace(LIST_TASK_STRIP, '');
      d.raw = d.raw.replace(LIST_TASK_STRIP, '');
      d.text = d.text.replace(LIST_TASK_STRIP, '');
      for (let g = queue.length - 1; g >= 0; g--) {
        if (LIST_IS_TASK.test(queue[g].src)) { queue[g].src = queue[g].src.replace(LIST_TASK_STRIP, ''); break; }
      }
      const k = /\[[ xX]\]/.exec(it.raw);
      if (k) {
        const box = new Tok('checkbox', k[0] + ' ', '', null);
        box.checked = k[0] !== '[ ]';
        it.checked = box.checked;
        if (lst.loose) {
          const f = it.tokens[0];
          if (f && (f.type === 'paragraph' || f.type === 'text') && f.tokens) {
            f.raw = box.raw + f.raw;
            f.text = box.raw + f.text;
            f.tokens.unshift(box);
          } else {
            it.tokens.unshift({ type: 'paragraph', raw: box.raw, text: box.raw, tokens: [box] });
          }
        } else {
          it.tokens.unshift(box);
        }
      }
    } else if (it.task) it.task = false;
  }
  if (lst.loose) {
    for (const it of lst.items) {
      it.loose = true;
      for (const d of it.tokens) if (d.type === 'text') d.type = 'paragraph';
    }
  }
  return lst;
}

// ---------------------------------------------------------------------------------------------
// Inline lexer
// ---------------------------------------------------------------------------------------------

function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

function linkInText(s) {
  if (!s.includes('[')) return false;
  for (const m of s.matchAll(I_BLOCK_SKIP)) {
    if (I_LINK.test(m[0]) && s.charAt(m.index - 1) !== '!') return true;
  }
  for (const m of s.matchAll(I_REFLINK_SEARCH)) {
    const r = m[0];
    const o = r.lastIndexOf('[');
    if (!(r.charAt(0) === '!' || !hasOwn(links, normLabel(r.slice(o + 1, -1)))) && !(o > 1 && linkInText(r.slice(1, o - 1)))) return true;
  }
  return false;
}

function maskReflink(r) {
  const o = r.lastIndexOf('[');
  if (!hasOwn(links, normLabel(r.slice(o + 1, -1)))) return r;
  if (o > 1 && r.charAt(0) !== '!') {
    const inner = r.slice(1, o - 1);
    if (linkInText(inner)) return '[' + inner.replace(I_REFLINK_SEARCH, maskReflink) + '][' + 'a'.repeat(r.length - o - 2) + ']';
  }
  return '[' + 'a'.repeat(r.length - 2) + ']';
}

function maskSrc(src) {
  // each pass is skipped when the characters its pattern needs are absent (it could not match)
  let t = src;
  const bracket = src.includes('[');
  if (bracket && hasLinks) t = t.replace(I_REFLINK_SEARCH, maskReflink);
  const tick = src.includes('`');
  if (tick || src.includes('\\')) {
    t = t.replace(I_ANY_PUNCT_OUTSIDE_CODE, (m, ticks, esc) =>
      esc ? '+'.repeat(m.length) : ticks ? ticks + m.slice(ticks.length, -ticks.length).replace(/`/g, '+') + ticks : m);
  }
  if (bracket || tick || t.includes('<')) {
    t = t.replace(I_BLOCK_SKIP, (m, a, pre) => {
      const o = pre ? pre.length : 0;
      return m.slice(0, o) + '[' + 'a'.repeat(m.length - o - 2) + ']';
    });
  }
  return t;
}

// True when no inline rule but text can match anywhere in s: none of \ < [ ! * _ ~ ` & @ :, no
// "www." and no hard break ("  \n"). The inline lexer then yields one text token holding s.
function isPlainInline(s) {
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c > 126) continue;
    switch (c) {
      case 92: case 60: case 91: case 33: case 42: case 95: case 126: case 96: case 38: case 64: case 58:
        return false;
      case 32:
        if (s.charCodeAt(i + 1) === 32) {
          let j = i + 2;
          while (s.charCodeAt(j) === 32) j++;
          if (s.charCodeAt(j) === 10) return false;
        }
        break;
      case 119:
        if (s.startsWith('www.', i)) return false;
        break;
    }
  }
  return true;
}

function inlineTokens(src, out) {
  if (isPlainInline(src)) {
    if (src) out.push(textTok(src, src, inRawBlock));
    return out;
  }
  const savedParen = parenOK;
  parenOK = savedParen && src.includes(')');
  lexInline(src, out);
  parenOK = savedParen;
  return out;
}

function labelHasTag(src, label, start) {
  if (!label.includes('<')) return false;
  for (let s = 0; s < label.length; s++) {
    if (label[s] === '\\') { s++; continue; }
    if (label[s] === '`') {
      const c = I_CODE.exec(label.slice(s));
      if (c) { s += c[0].length - 1; continue; }
    }
    if (label[s] !== '<') continue;
    const rest = src.slice(start + s);
    const o = I_TAG.exec(rest) || I_AUTOLINK.exec(rest);
    if (o) {
      if (o[0].length > label.length - s) return true;
      s += o[0].length - 1;
    }
  }
  return false;
}

function outputLink(cap, href, title, raw) {
  title = title || null;
  const text = cap[1].replace(/\\([\[\]])/g, '$1');
  const isImage = cap[0].charAt(0) === '!';
  const savedInLink = inLink, savedEmitted = linkEmitted, savedRaw = inRawBlock;
  inLink = true;
  linkEmitted = false;
  const tokens = inlineTokens(text, []);
  const emitted = linkEmitted;
  linkEmitted = savedEmitted;
  inLink = savedInLink;
  if (!isImage) {
    if (emitted) { inRawBlock = savedRaw; return; }
    linkEmitted = true;
  }
  return linkTok(isImage ? 'image' : 'link', raw, text, tokens, href, title, false);
}

function lexLink(src) {
  if (parenOK === false) return;
  const t = I_LINK.exec(src);
  if (!t) return;
  const off = t[0].charAt(0) === '!' ? 2 : 1;
  if (labelHasTag(src, t[1], off)) return;
  const s = t[2].trim();
  if (s.startsWith('<')) {
    if (!s.endsWith('>')) return;
    const l = rtrim(s.slice(0, -1), '\\');
    if ((s.length - l.length) % 2 === 0) return;
  } else {
    const l = findClosing(t[2], '(', ')');
    if (l === -2) return;
    if (l > -1) {
      const h = (t[0].indexOf('!') === 0 ? 5 : 4) + t[1].length + l;
      t[2] = t[2].substring(0, l);
      t[0] = t[0].substring(0, h).trim();
      t[3] = '';
    }
  }
  const r = rtrim(t[0].slice(0, -1), '\\');
  if ((t[0].length - r.length) % 2 === 0) return;
  let href = t[2].trim();
  const title = t[3] ? t[3].slice(1, -1) : '';
  if (href.startsWith('<')) href = href.slice(1, -1);
  return outputLink(t, href && href.replace(I_ANY_PUNCT, '$1'), title && title.replace(I_ANY_PUNCT, '$1'), t[0]);
}

function lexReflink(src) {
  let n = I_REFLINK.exec(src);
  if (!n) n = I_NOLINK.exec(src);
  if (!n) return;
  const off = n[0].charAt(0) === '!' ? 2 : 1;
  if (labelHasTag(src, n[1], off)) return;
  const ref = links[normLabel(n[2] || n[1])];
  if (!ref) {
    const c = n[0].charAt(0);
    return textTok(c, c, false);
  }
  return outputLink(n, ref.href, ref.title, n[0]);
}

function lexEmStrong(src, masked, prevChar, closers) {
  let m = I_EM_LDELIM.exec(src);
  if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) return;
  const ch = m[0][0];
  const prevSame = prevChar === ch;
  const pos = masked.length - src.length;
  let l = pos;
  while (l > 0 && masked[l - 1] === ch) l--;
  const before = lastCodePoint(masked.slice(Math.max(0, l - 2), l));
  const beforePunct = before === '*' || before === '_' || !!I_PUNCTUATION.exec(before);
  if (l < pos) prevChar = before;
  const prevPunct = l < pos ? beforePunct : !!I_PUNCTUATION.exec(prevChar);
  if (m[4] && UNICODE_ALNUM.test(prevChar)) return;
  const d = m[1] || m[3] || '';
  if (d && prevChar && !prevPunct) return;
  const k = cpCount(m[0]) - 1;
  let g, b, need = k, carried = 0;
  const runLen = pos - l + k;
  const strict = !!before.trim() && (!!d || (ch === '*' && !beforePunct));
  if (ch !== '*' && ch !== '_') return;
  const re = ch === '*' ? I_EM_RDELIM_AST : I_EM_RDELIM_UND;
  const lastCloser = ch === '*' ? closers.star : closers.und;
  const from = masked.length - src.length + k;
  if (lastCloser < from) return;
  const hay = masked.slice(-1 * src.length + k);
  const limit = lastCloser - from;
  re.lastIndex = 0;
  while ((m = re.exec(hay)) !== null && !(m.index > limit)) {
    g = m[1] || m[2] || m[3] || m[4] || m[5] || m[6];
    if (!g) continue;
    b = cpCount(g);
    if (m[3] || m[4]) { need += b; continue; }
    else if (m[5] || m[6] || strict) {
      if (prevSame && (m[5] || m[6])) break;
      if (runLen % 3 && !((runLen + b) % 3)) { carried += b; continue; }
    }
    need -= b;
    if (need > 0) continue;
    b = Math.min(b, b + need + carried);
    const lead = firstCpLen(m[0]);
    const raw = src.slice(0, k + m.index + lead + b);
    if (Math.min(k, b) % 2) {
      const text = raw.slice(1, -1);
      return new Tok('em', raw, text, inlineTokens(text, []));
    }
    const text = raw.slice(2, -2);
    return new Tok('strong', raw, text, inlineTokens(text, []));
  }
}

function lexDel(src, masked, prevChar, closers) {
  let m = I_DEL_LDELIM.exec(src);
  if (!m) return;
  if ((m[1] || '') && prevChar && !I_PUNCTUATION.exec(prevChar)) return;
  const k = cpCount(m[0]) - 1;
  let need = k;
  const lastCloser = closers.tilde;
  const from = masked.length - src.length + k;
  if (lastCloser < from) return;
  const hay = masked.slice(-1 * src.length + k);
  const limit = lastCloser - from;
  I_DEL_RDELIM.lastIndex = 0;
  while ((m = I_DEL_RDELIM.exec(hay)) !== null && !(m.index > limit)) {
    const g = m[1] || m[2] || m[3] || m[4] || m[5] || m[6];
    if (!g) continue;
    let b = cpCount(g);
    if (b !== k) continue;
    if (m[3] || m[4]) { need += b; continue; }
    need -= b;
    if (need > 0) continue;
    b = Math.min(b, b + need);
    const lead = firstCpLen(m[0]);
    const raw = src.slice(0, k + m.index + lead + b);
    const text = raw.slice(k, -k);
    return new Tok('del', raw, text, inlineTokens(text, []));
  }
}

function lexUrl(src) {
  const t = I_URL.exec(src);
  if (!t) return;
  let text, href;
  if (t[2] === '@') {
    text = t[0];
    href = 'mailto:' + text;
  } else {
    let prev;
    do {
      prev = t[0];
      t[0] = I_BACKPEDAL.exec(t[0])?.[0] ?? '';
    } while (prev !== t[0]);
    text = t[0];
    href = t[1] === 'www.' ? 'http://' + t[0] : t[0];
  }
  return linkTok('link', t[0], text, null, href, null, true);
}

function lexInline(src, out) {
  // the emphasis mask and closer positions are only needed once a * _ or ~ is reached
  const full = src;
  let masked = null, closers = null;
  let keepPrev = false;
  let prevChar = '';
  while (src) {
    if (!keepPrev) prevChar = '';
    keepPrev = false;
    let t, tok;
    const c = src.charCodeAt(0);

    if (c === 92 && (t = I_ESCAPE.exec(src))) {
      src = src.substring(t[0].length);
      out.push(new Tok('escape', t[0], t[1], null));
      continue;
    }
    if (c === 60 && (t = I_TAG.exec(src))) {
      const raw = t[0];
      if (!inLink && /^<a /i.test(raw)) inLink = true;
      else if (inLink && /^<\/a>/i.test(raw)) inLink = false;
      if (!inRawBlock && /^<(pre|code|kbd|script)(\s|>)/i.test(raw)) inRawBlock = true;
      else if (inRawBlock && /^<\/(pre|code|kbd|script)(\s|>)/i.test(raw)) inRawBlock = false;
      src = src.substring(raw.length);
      out.push(new Tok('html', raw, raw, null));
      continue;
    }
    if (c === 91 || c === 33) {
      if ((tok = lexLink(src))) { src = src.substring(tok.raw.length); out.push(tok); continue; }
      if ((tok = lexReflink(src))) {
        src = src.substring(tok.raw.length);
        const p = out[out.length - 1];
        if (tok.type === 'text' && p !== undefined && p.type === 'text') { p.raw += tok.raw; p.text += tok.text; }
        else out.push(tok);
        continue;
      }
    }
    if ((c === 42 || c === 95 || c === 126) && masked === null) { masked = maskSrc(full); closers = closerPositions(masked); }
    if ((c === 42 || c === 95) && (tok = lexEmStrong(src, masked, prevChar, closers))) {
      src = src.substring(tok.raw.length); out.push(tok); continue;
    }
    if (c === 96 && (t = I_CODE.exec(src))) {
      let text = t[2].replace(/\n/g, ' ');
      if (/[^ ]/.test(text) && text.startsWith(' ') && text.endsWith(' ')) text = text.substring(1, text.length - 1);
      src = src.substring(t[0].length);
      out.push(new Tok('codespan', t[0], text, null));
      continue;
    }
    if ((c === 32 || c === 92) && (t = I_BR.exec(src))) {
      src = src.substring(t[0].length);
      out.push(new Tok('br', t[0], '', null));
      continue;
    }
    if (c === 126 && (tok = lexDel(src, masked, prevChar, closers))) {
      src = src.substring(tok.raw.length); out.push(tok); continue;
    }
    if (c === 60 && (t = I_AUTOLINK.exec(src))) {
      const text = t[1];
      const href = t[2] === '@' ? 'mailto:' + text : text;
      src = src.substring(t[0].length);
      out.push(linkTok('link', t[0], text, null, href, null, true));
      continue;
    }
    if (!inLink && isUrlStart(c) && (tok = lexUrl(src))) {
      src = src.substring(tok.raw.length); out.push(tok); continue;
    }
    if ((t = I_TEXT.exec(src))) {
      const raw = t[0];
      src = src.substring(raw.length);
      if (raw.charCodeAt(raw.length - 1) !== 95) prevChar = raw.slice(-1);
      keepPrev = true;
      const p = out[out.length - 1];
      if (p !== undefined && p.type === 'text') {
        p.raw += raw;
        p.text += inRawBlock ? raw : decodeNumRefs(raw);
      } else {
        out.push(textTok(raw, inRawBlock ? raw : decodeNumRefs(raw), inRawBlock));
      }
      continue;
    }
    if (src) throw new Error('Infinite loop on byte: ' + src.charCodeAt(0));
  }
  return out;
}

// [A-Za-z0-9._+-]
function isUrlStart(c) {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 46 || c === 95 || c === 43 || c === 45;
}

// ---------------------------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------------------------

function renderBlocks(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'space': case 'def': break;
      case 'hr': out += '<hr>\n'; break;
      case 'heading': out += `<h${t.depth}>${renderInline(t.tokens)}</h${t.depth}>\n`; break;
      case 'code': {
        const lang = (t.lang || '').match(/^\S*/)?.[0];
        const body = t.text ? t.text.replace(/\n$/, '') + '\n' : '';
        out += lang
          ? '<pre><code class="language-' + escSoft(lang) + '">' + escAll(body) + '</code></pre>\n'
          : '<pre><code>' + escAll(body) + '</code></pre>\n';
        break;
      }
      case 'table': out += renderTable(t); break;
      case 'blockquote': out += '<blockquote>\n' + renderBlocks(t.tokens) + '</blockquote>\n'; break;
      case 'list': {
        const tag = t.ordered ? 'ol' : 'ul';
        out += '<' + tag + (t.ordered && t.start !== 1 ? ' start="' + t.start + '"' : '') + '>\n';
        for (const it of t.items) out += '<li>' + renderBlocks(it.tokens) + '</li>\n';
        out += '</' + tag + '>\n';
        break;
      }
      case 'checkbox': out += checkbox(t); break;
      case 'html': out += t.text; break;
      case 'paragraph': out += '<p>' + renderInline(t.tokens) + '</p>\n'; break;
      case 'text': out += t.tokens ? renderInline(t.tokens) : escSoft(t.text); break;
      default: throw new Error('Token with "' + t.type + '" type was not found.');
    }
  }
  return out;
}

function checkbox(t) {
  return '<input ' + (t.checked ? 'checked="" ' : '') + 'disabled="" type="checkbox"> ';
}

function renderTable(t) {
  let head = '';
  for (const c of t.header) head += cell(c, 'th');
  let body = '';
  for (const row of t.rows) {
    let r = '';
    for (const c of row) r += cell(c, 'td');
    body += '<tr>\n' + r + '</tr>\n';
  }
  if (body) body = '<tbody>' + body + '</tbody>';
  return '<table>\n<thead>\n<tr>\n' + head + '</tr>\n</thead>\n' + body + '</table>\n';
}

function cell(c, tag) {
  return (c.align ? `<${tag} align="${c.align}">` : `<${tag}>`) + renderInline(c.tokens) + `</${tag}>\n`;
}

function renderInline(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'text': out += t.escaped ? t.text : escSoft(t.text); break;
      case 'escape': out += escSoft(t.text); break;
      case 'html': out += t.text; break;
      case 'link': {
        const inner = t.autolink ? escAll(t.text) : renderInline(t.tokens);
        const href = cleanUrl(t.href);
        if (href === null) { out += inner; break; }
        out += '<a href="' + (t.autolink ? escAll(href) : escSoft(href)) + '"' + (t.title ? ' title="' + escSoft(t.title) + '"' : '') + '>' + inner + '</a>';
        break;
      }
      case 'image': {
        const alt = t.tokens ? renderPlain(t.tokens) : t.text;
        const src = cleanUrl(t.href);
        if (src === null) { out += escSoft(alt); break; }
        out += '<img src="' + escSoft(src) + '" alt="' + escSoft(alt) + '"' + (t.title ? ' title="' + escSoft(t.title) + '"' : '') + '>';
        break;
      }
      case 'checkbox': out += checkbox(t); break;
      case 'strong': out += '<strong>' + renderInline(t.tokens) + '</strong>'; break;
      case 'em': out += '<em>' + renderInline(t.tokens) + '</em>'; break;
      case 'codespan': out += '<code>' + escAll(t.text) + '</code>'; break;
      case 'br': out += '<br>'; break;
      case 'del': out += '<del>' + renderInline(t.tokens) + '</del>'; break;
      default: throw new Error('Token with "' + t.type + '" type was not found.');
    }
  }
  return out;
}

// marked's TextRenderer: the plain text of inline tokens (image alt text)
function renderPlain(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'strong': case 'em': case 'del': case 'link': case 'image':
        out += t.tokens ? renderPlain(t.tokens) : t.text; break;
      case 'br': break;
      case 'checkbox': out += t.raw; break;
      default: out += t.text;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

/** The HTML marked 18.1.3 renders for `markdown` with its default options. */
export function parse(markdown) {
  links = Object.create(null);
  queue = [];
  top = true;
  inLink = false;
  inRawBlock = false;
  linkEmitted = false;
  parenOK = true;
  hasLinks = false;
  const src = markdown.indexOf('\r') === -1 ? markdown : markdown.replace(/\r\n|\r/g, '\n');
  const tokens = blockTokens(src, [], false);
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    inRawBlock = false;
    inlineTokens(q.src, q.tokens);
  }
  queue = null;
  links = null;
  return renderBlocks(tokens);
}
