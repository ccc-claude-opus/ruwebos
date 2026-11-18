// 計算機核心：以遞迴下降解析器計算，不使用 eval 或 Function。
(function (root) {
  'use strict';

  var FUNCTIONS = {
    sin: true,
    cos: true,
    tan: true,
    asin: true,
    acos: true,
    atan: true,
    sqrt: true,
    '√': true,
    ln: true,
    log: true,
    abs: true,
    exp: true
  };

  function fail(message) {
    throw new Error(message);
  }

  function tokenize(source) {
    if (typeof source !== 'string') fail('計算式必須是文字。');
    if (source.length > 10000) fail('計算式太長。');

    var tokens = [];
    var i = 0;
    while (i < source.length) {
      var ch = source.charAt(i);
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source.charAt(i + 1)))) {
        var start = i;
        while (i < source.length && /[0-9]/.test(source.charAt(i))) i++;
        if (source.charAt(i) === '.') {
          i++;
          while (i < source.length && /[0-9]/.test(source.charAt(i))) i++;
        }
        if (source.charAt(i) === 'e' || source.charAt(i) === 'E') {
          i++;
          if (source.charAt(i) === '+' || source.charAt(i) === '-') i++;
          var exponentStart = i;
          while (i < source.length && /[0-9]/.test(source.charAt(i))) i++;
          if (i === exponentStart) fail('指數格式不正確。');
        }
        var text = source.slice(start, i);
        var value = Number(text);
        if (!Number.isFinite(value)) fail('數字過大。');
        tokens.push({ type: 'number', value: value });
        continue;
      }

      if (/[A-Za-z]/.test(ch) || ch === 'π' || ch === '√') {
        var nameStart = i;
        if (ch === 'π' || ch === '√') {
          i++;
        } else {
          while (i < source.length && /[A-Za-z]/.test(source.charAt(i))) i++;
        }
        tokens.push({ type: 'name', value: source.slice(nameStart, i).toLowerCase() });
        continue;
      }

      var symbols = {
        '+': 'plus',
        '-': 'minus',
        '−': 'minus',
        '*': 'times',
        '×': 'times',
        '/': 'divide',
        '÷': 'divide',
        '^': 'power',
        '%': 'percent',
        '!': 'factorial',
        '(': 'left',
        ')': 'right'
      };
      var type = symbols[ch];
      if (!type) fail('計算式含有無法辨識的符號「' + ch + '」。');
      tokens.push({ type: type });
      i++;
    }
    return tokens;
  }

  function factorial(value) {
    if (!Number.isInteger(value) || value < 0 || value > 170) {
      fail('階乘只能使用 0 到 170 的整數。');
    }
    var result = 1;
    for (var i = 2; i <= value; i++) result *= i;
    return result;
  }

  function toRadians(value, angle) {
    return angle === 'deg' ? value * Math.PI / 180 : value;
  }

  function toDegrees(value, angle) {
    return angle === 'deg' ? value * 180 / Math.PI : value;
  }

  function applyFunction(name, value, angle) {
    var result;
    switch (name) {
      case 'sin':
        result = Math.sin(toRadians(value, angle));
        break;
      case 'cos':
        result = Math.cos(toRadians(value, angle));
        break;
      case 'tan':
        result = Math.tan(toRadians(value, angle));
        break;
      case 'asin':
        if (value < -1 || value > 1) fail('反正弦的值必須介於 -1 與 1 之間。');
        result = toDegrees(Math.asin(value), angle);
        break;
      case 'acos':
        if (value < -1 || value > 1) fail('反餘弦的值必須介於 -1 與 1 之間。');
        result = toDegrees(Math.acos(value), angle);
        break;
      case 'atan':
        result = toDegrees(Math.atan(value), angle);
        break;
      case 'sqrt':
      case '√':
        if (value < 0) fail('平方根不能使用負數。');
        result = Math.sqrt(value);
        break;
      case 'ln':
        if (value <= 0) fail('自然對數的數字必須大於 0。');
        result = Math.log(value);
        break;
      case 'log':
        if (value <= 0) fail('常用對數的數字必須大於 0。');
        result = Math.log10(value);
        break;
      case 'abs':
        result = Math.abs(value);
        break;
      case 'exp':
        result = Math.exp(value);
        break;
      default:
        fail('不支援的函數「' + name + '」。');
    }
    if (Number.isNaN(result)) fail('計算結果無效。');
    return result;
  }

  function Parser(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.angle = 'deg';
  }

  Parser.prototype.peek = function () {
    return this.tokens[this.pos] || null;
  };

  Parser.prototype.take = function () {
    var token = this.peek();
    if (!token) fail('缺少運算元。');
    this.pos++;
    return token;
  };

  Parser.prototype.parse = function () {
    if (!this.tokens.length) fail('計算式不能是空的。');
    var value = this.parseAdditive();
    if (this.pos !== this.tokens.length) fail('計算式格式不正確。');
    return value;
  };

  Parser.prototype.parseAdditive = function () {
    var left = this.parseMultiplicative();
    while (this.peek() && (this.peek().type === 'plus' || this.peek().type === 'minus')) {
      var operator = this.take().type;
      var right = this.parseMultiplicative();
      left = operator === 'plus' ? left + right : left - right;
    }
    return left;
  };

  Parser.prototype.parseMultiplicative = function () {
    var left = this.parseUnary();
    while (this.peek() && (this.peek().type === 'times' || this.peek().type === 'divide')) {
      var operator = this.take().type;
      var right = this.parseUnary();
      left = operator === 'times' ? left * right : left / right;
    }
    return left;
  };

  Parser.prototype.parseUnary = function () {
    var token = this.peek();
    if (token && (token.type === 'plus' || token.type === 'minus')) {
      this.take();
      var value = this.parseUnary();
      return token.type === 'minus' ? -value : value;
    }
    return this.parsePower();
  };

  Parser.prototype.parsePower = function () {
    var left = this.parsePostfix();
    if (this.peek() && this.peek().type === 'power') {
      this.take();
      var right = this.parseUnary();
      return Math.pow(left, right);
    }
    return left;
  };

  Parser.prototype.parsePostfix = function () {
    var value = this.parsePrimary();
    while (this.peek() && (this.peek().type === 'factorial' || this.peek().type === 'percent')) {
      var operator = this.take().type;
      value = operator === 'factorial' ? factorial(value) : value / 100;
    }
    return value;
  };

  Parser.prototype.parsePrimary = function () {
    var token = this.take();
    if (token.type === 'number') return token.value;

    if (token.type === 'left') {
      var value = this.parseAdditive();
      if (!this.peek() || this.peek().type !== 'right') fail('括號沒有關閉。');
      this.take();
      return value;
    }

    if (token.type === 'name') {
      var name = token.value;
      if (name === 'pi' || name === 'π') return Math.PI;
      if (name === 'e') return Math.E;
      if (!FUNCTIONS[name]) fail('不支援的常數或函數「' + name + '」。');
      if (!this.peek() || this.peek().type !== 'left') fail('函數「' + name + '」需要使用括號。');
      this.take();
      if (this.peek() && this.peek().type === 'right') fail('函數「' + name + '」缺少引數。');
      var argument = this.parseAdditive();
      if (!this.peek() || this.peek().type !== 'right') fail('括號沒有關閉。');
      this.take();
      return applyFunction(name, argument, this.angle);
    }

    fail('計算式格式不正確。');
  };

  function evaluate(expression, options) {
    var opts = options || {};
    var angle = opts.angle || 'deg';
    if (angle !== 'deg' && angle !== 'rad') fail('角度模式必須是 deg 或 rad。');
    var parser = new Parser(tokenize(expression));
    parser.angle = angle;
    return parser.parse();
  }

  function format(value) {
    var number = Number(value);
    if (Number.isNaN(number)) return 'NaN';
    if (number === Infinity) return '∞';
    if (number === -Infinity) return '-∞';
    if (Object.is(number, -0)) return '0';
    var formatted = number.toPrecision(12);
    if (formatted.indexOf('e') < 0) formatted = formatted.replace(/\.?0+$/, '');
    else {
      var parts = formatted.split('e');
      parts[0] = parts[0].replace(/\.?0+$/, '');
      formatted = parts.join('e');
    }
    return formatted;
  }

  root.CalcCore = {
    evaluate: evaluate,
    format: format
  };
})(globalThis);
