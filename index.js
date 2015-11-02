(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var lexerHelper = require('../lib/helpers/lexer.js');
var syntaxerHelper = require('../lib/helpers/syntaxer.js');
var postHelper = require('../lib/helpers/post.js');

var andLexeme = {
  regexp: 'and(\\s|\\(|\\)|"|$)',
  escaped: true,
  modifiers: 'i',
  lexer: lexerHelper.generateCutLexer('and', 3),
  syntaxer: syntaxerHelper.andSyntaxer,
  priority: 4,
  checker: ['endBlock', null]
};

var orLexeme = {
  regexp: 'or(\\s|\\(|\\)|"|$)',
  escaped: true,
  modifiers: 'i',
  lexer: lexerHelper.generateCutLexer('or', 2),
  syntaxer: syntaxerHelper.orSyntaxer,
  priority: 5,
  checker: ['endBlock', null]
};

var startBlockLexeme = {
  regexp: '\\(',
  escaped: true,
  lexer: lexerHelper.generateCutLexer('startBlock', 1),
  syntaxer: syntaxerHelper.blockSyntaxer,
  priority: 0,
  postFunction: postHelper.blockPostTreatment,
  checker: ['endBlock', null]
};

var endBlockLexeme = {
  regexp: '\\)',
  escaped: true,
  lexer: lexerHelper.generateCutLexer('endBlock', 1),
};

var stringLexeme = {
  regexp: '"?.*',
  lexer: lexerHelper.stringLexer([startBlockLexeme, endBlockLexeme]),
  syntaxer: syntaxerHelper.stringSyntaxer,
  priority: 0
};

module.exports = {
  and: andLexeme,
  or: orLexeme,
  startBlock: startBlockLexeme,
  endBlock: endBlockLexeme,
  string: stringLexeme
};

},{"../lib/helpers/lexer.js":3,"../lib/helpers/post.js":4,"../lib/helpers/syntaxer.js":5}],2:[function(require,module,exports){
'use strict';

var lexemes = require('../config/lexemes.js');

function check(current, next, config) {
  for(var i = 0, c = config.length; i < c; i += 1) {
    if(next === config[i]) {
      if(next === 'endBlock' && current === 'startBlock') {
        throw new Error("Empty block");
      }
      throw new Error((next ? next : 'end of string') + " just after " + current);
    }
  }
}

module.exports.check = function doCheck(lexemesArray) {
  var i = 0;
  var next = null;

  while(lexemesArray[i]) {
    next = lexemesArray[i + 1];

    if(lexemes[lexemesArray[i].type].checker) {
      check(lexemesArray[i].type, (next) ? next.type : null, lexemes[lexemesArray[i].type].checker);
    }

    i += 1;
  }
};

},{"../config/lexemes.js":1}],3:[function(require,module,exports){
'use strict';

module.exports.generateRegexp = function generateRegexp(lexeme) {
  return new RegExp('^(' + lexeme.regexp + ')', lexeme.modifiers);
};

module.exports.generateCutLexer = function generateCutLexer(type, length) {
  return function(str, lexemesArray) {
    lexemesArray.push({
      type: type,
      value: str.slice(0, length)
    });

    return str.slice(length);
  };
};

function endOfString(str, quoted, spaces, first, endLexemes) {
  if(str.length === 0) {
    return true;
  }
  else if(quoted) {
    return str.charAt(0) === '"';
  }
  else if(spaces.indexOf(str.charAt(0)) !== -1 ||
    str.charAt(0) === '"') {
    return true;
  }

  if(first) {
    return false;
  }

  return endLexemes.some(function(lexeme) {
    return module.exports.generateRegexp(lexeme).test(str);
  });
}

module.exports.stringLexer = function stringLexer(endLexemes) {
  return function(str, lexemesArray, spaces) {
    var i = 0;
    var first = true;
    var quoted = false;
    var value = "";

    if(str.charAt(0) === '"') {
      quoted = true;
      i = 1;
      str = str.slice(1);
    }

    while(!endOfString(str, quoted, spaces, first, endLexemes)) {
      if(str.charAt(0) === '\\') {
        value += str.charAt(1);
        str = str.slice(2);
        continue;
      }

      value += str.charAt(0);
      str = str.slice(1);
      first = false;
    }

    if(quoted && str.charAt(0) !== '"') {
      throw new Error("Can't reach end of quoted string");
    } 
    else if(quoted) {
      str = str.slice(1);
    }

    lexemesArray.push({
      type: "string",
      value: value
    });

    return str;
  };
};

module.exports.clearSpaces = function clearSpaces(str, spaces) {
  var i = 0;

  while(i < str.length && spaces.indexOf(str.charAt(i)) !== -1) {
    i += 1;
  }

  return str.slice(i);
};
},{}],4:[function(require,module,exports){
'use strict';

module.exports.blockPostTreatment = function blockPostTreatment(tree) {
  if(!tree || !tree.lexeme) {
    return tree;
  }

  if(tree.lexeme.type === 'startBlock') {
    tree.lexeme = {
      type: tree.left.lexeme.type,
      value: tree.left.lexeme.value
    };

    if(!tree.lexeme.value) {
      delete tree.lexeme.value;
    }

    tree.right = tree.left.right;
    tree.left = tree.left.left;
  }

  blockPostTreatment(tree.right);
  blockPostTreatment(tree.left);

  return tree;
};

},{}],5:[function(require,module,exports){
'use strict';

function getLowPriorityBlock(tree, priority) {
  var lexemes = require('../../config/lexemes.js');

  if(priority === undefined) {
    priority = -1;
  }

  if(!tree.lexeme || lexemes[tree.lexeme.type].priority < priority || tree.right === null) {
    return tree;
  }

  return getLowPriorityBlock(tree.right, priority);
}

function defaultOperator(options, currentBlock, newBlock) {
  var tempLexeme = {
    type: currentBlock.lexeme.type,
    value: currentBlock.lexeme.value
  };

  currentBlock.lexeme = {
    type: options.defaultOperator || 'and'
  };

  currentBlock.left = {
    lexeme: tempLexeme,
    left: currentBlock.left,
    right: currentBlock.right
  };

  currentBlock.right = newBlock;

  if(!currentBlock.lexeme.value) {
    delete currentBlock.lexeme.value;
  }
}

module.exports.stringSyntaxer = function stringSyntaxer(options, lexemesArray, i, tree) {
  var lexemes = require('../../config/lexemes.js');
  var block = getLowPriorityBlock(tree, lexemes.string.priority);

  var tempLexeme = {
    type: 'string',
    value: lexemesArray[i].value,
  };

  if(block.lexeme) {
    defaultOperator(options, block, {
      lexeme: tempLexeme,
      left: null,
      right: null
    });
    return i + 1;
  }

  block.lexeme = tempLexeme;

  block.left = null;
  block.right = null;

  return i + 1;
};

function generateBasicSyntaxer(type) {
  return function basicSyntaxer(options, lexemesArray, i, tree) {
    var lexemes = require('../../config/lexemes.js');
    var block = getLowPriorityBlock(tree, lexemes[type].priority);

    if(!block.lexeme) {
      throw new Error("Nothing before " + type + " block");
    }

    var tempLexeme = {
      type: block.lexeme.type,
      value: block.lexeme.value
    };

    block.lexeme = {
      type: type
    };

    block.left = {
      lexeme: tempLexeme,
      left: block.left,
      right: block.right
    };

    block.right = {};

    if(!block.left.lexeme.value) {
      delete block.left.lexeme.value;
    }

    return i + 1;
  };
}

module.exports.andSyntaxer = generateBasicSyntaxer('and');
module.exports.orSyntaxer = generateBasicSyntaxer('or');

module.exports.blockSyntaxer = function blockSyntaxer(options, lexemesArray, i, tree, createTree) {
  var lexemes = require('../../config/lexemes.js');
  var block = getLowPriorityBlock(tree, lexemes.startBlock.priority);

  var tempLexeme = {
    type: 'startBlock'
  };

  var newBlock = createTree('endBlock', i + 1);

  if(block.lexeme) {
    defaultOperator(options, block, {
      lexeme: tempLexeme,
      left: newBlock,
      right: null
    });
    return;
  }

  block.lexeme = tempLexeme;
  block.left = newBlock;
  block.right = null;
};

},{"../../config/lexemes.js":1}],6:[function(require,module,exports){
'use strict';

var lexemes = require('../config/lexemes.js');

var lexer = require('./lexer.js');
var checker = require('./checker.js');
var syntaxer = require('./syntaxer.js');

module.exports.parse = function parse(options, query) {
  if(!query) {
    query = options;
    options = {};
  }

  var lexemesArray = lexer.strToLexemes(query, options.spaces ? options.spaces : " \t\n");
  checker.check(lexemesArray);

  var tree = syntaxer.lexemesArrayToBinaryTree(options, lexemesArray);

  Object.keys(lexemes).forEach(function(name) {
    if(lexemes[name].postFunction) {
      tree = lexemes[name].postFunction(tree);
    }
  });

  return tree;
};

module.exports.utils = require('./utils.js');

},{"../config/lexemes.js":1,"./checker.js":2,"./lexer.js":7,"./syntaxer.js":8,"./utils.js":9}],7:[function(require,module,exports){
'use strict';

var lexemes = require('../config/lexemes.js');
var helpers = require('./helpers/lexer.js');

module.exports.strToLexemes = function strToLexemes(str, spaces) {
  var lexemesArray = [];

  str = helpers.clearSpaces(str, spaces);
  while(str.length > 0) {
    var escaped = false;

    if(str.charAt(0) === '\\') {
      escaped = true;
      str = str.slice(1);

      if(str.length === 0) {
        throw new Error("Backslash at end of string");
      }
    }

    var ret = Object.keys(lexemes).some(function(name) {
      if(escaped && lexemes[name].escaped) {
        return false;
      }

      var regexp = helpers.generateRegexp(lexemes[name]);

      if(regexp.test(str)) {
        str = lexemes[name].lexer(str, lexemesArray, spaces);
        return true;
      }

      return false;
    });

    if(!ret) {
      throw new Error("Unknow character : " + str.charAt(0));
    }

    str = helpers.clearSpaces(str, spaces);
  }

  return lexemesArray;
};
},{"../config/lexemes.js":1,"./helpers/lexer.js":3}],8:[function(require,module,exports){
'use strict';

var lexemes = require('../config/lexemes.js');

module.exports.lexemesArrayToBinaryTree = function lexemesArrayToBinaryTree(options, lexemesArray) {
  var i = 0;

  function createTree(end, newI) {
    var tree = {};

    if(newI) {
      i = newI;
    }

    while (lexemesArray[i] && lexemesArray[i].type !== end) {
      if(!lexemes[lexemesArray[i].type].syntaxer) {
        throw new Error("Unexpected token " + lexemesArray[i].type);
      }

      var temp = lexemes[lexemesArray[i].type].syntaxer(options, lexemesArray, i, tree, createTree);

      if(temp) {
        i = temp;
      }
    }

    if(end && !lexemesArray[i]) {
      throw new Error('Bad end of block');
    }
    else if(end) {
      i += 1;
    }

    return tree;
  }

  return createTree(null);
};
},{"../config/lexemes.js":1}],9:[function(require,module,exports){
'use strict';

module.exports.binaryTreeToQueryJson = function binaryTreeToQueryJson(tree) {
  var query = {};

  if(!tree || !tree.lexeme) {
    return query;
  }

  var cursor = tree;
  var currentType = tree.lexeme.type;

  query.type = currentType;

  if(currentType === 'string') {
    query.value = tree.lexeme.value;
    return query;
  }

  query.values = [];

  while(cursor && cursor.lexeme.type === currentType) {

    if(cursor.left) {
      query.values.push(binaryTreeToQueryJson(cursor.left));
    }

    cursor = cursor.right;
  }

  if(cursor) {
    query.values.push(binaryTreeToQueryJson(cursor));
  }

  return query;
};

},{}]},{},[6]);
